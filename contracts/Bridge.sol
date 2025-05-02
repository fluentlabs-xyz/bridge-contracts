// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./libraries/Queue.sol";
import "./rollup/Rollup.sol";

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "hardhat/console.sol";
import {IERC20Gateway} from "./interfaces/IERC20Gateway.sol";
import {MerkleTree} from "./libraries/MerkleTree.sol";
import {Merkle} from "./restaker/libraries/Merkle.sol";
import {Rollup} from "./rollup/Rollup.sol";

contract Bridge {
    uint256 public nonce;
    uint256 public receivedNonce;

    enum MessageStatus {
        None,
        Failed,
        Success
    }

    mapping(bytes32 => MessageStatus) public receivedMessage;

    Queue public sentMessageQueue;
    address public bridgeAuthority;
    address public rollup;

    modifier onlyBridgeSender() {
        require(
            msg.sender == bridgeAuthority,
            "call only from bridge authority"
        );
        _;
    }

    event SentMessage(
        address indexed sender,
        address indexed to,
        uint256 value,
        uint256 nonce,
        bytes32 messageHash,
        bytes data
    );

    event ReceivedMessage(bytes32 messageHash, bool successfulCall);

    event Error(bytes data);

    constructor(address _bridgeAuthority, address _rollup) {
        bridgeAuthority = _bridgeAuthority;
        rollup = _rollup;
        sentMessageQueue = new Queue();
    }

    function getQueueSize() external view returns (uint256) {
        return sentMessageQueue.size();
    }


    function sendMessage(
        address _to,
        bytes calldata _message
    ) external payable {
        address from = msg.sender;
        uint256 value = msg.value;
        uint256 messageNonce = _takeNextNonce();

        bytes memory encodedMessage = _encodeMessage(
            from,
            _to,
            value,
            messageNonce,
            _message
        );

        bytes32 messageHash = keccak256(encodedMessage);

        sentMessageQueue.enqueue(messageHash);
//        sentMessage[messageHash] = true;

        emit SentMessage(from, _to, value, messageNonce, messageHash, _message);
    }

    function receiveMessageWithProof(
        uint256 _batchIndex,
        Rollup.BlockCommitment calldata _commitmentBatch,
        address _from,
        address payable _to,
        uint256 _value,
        uint256 _nonce,
        bytes calldata _message,
        uint256 _withdrawal_proof_nonce,
        bytes memory _withdrawal_proof,
        uint256 _block_proof_nonce,
        bytes memory _block_proof
    ) external payable {
        require(
            _nonce == _takeNextReceivedNonce(),
            "message received out of turn"
        );

        require(Rollup(rollup).approvedBatch(_batchIndex));

        bytes32 messageHash = keccak256(_encodeMessage(
            _from,
            _to,
            _value,
            _nonce,
            _message
        ));
//        bytes32 batchHash = ;
        require(
            receivedMessage[messageHash] == MessageStatus.None,
            "Message already received"
        );

        _verifyWithdrawal(
            _batchIndex,
            _commitmentBatch,
            _withdrawal_proof_nonce,
            _withdrawal_proof,
            _block_proof_nonce,
            _block_proof,
            messageHash
        );

//        uint256 withdrawalBlockNumber = Rollup(rollup).withdrawalsAcceptedBlock(messageHash);
//        require(withdrawalBlockNumber != 0);

        _receiveMessage(_from, _to, _value, _nonce, _message, messageHash);
    }

    function _verifyWithdrawal(
        uint256 _batchIndex,
        Rollup.BlockCommitment calldata _commitmentBatch,
        uint256 _withdrawal_proof_nonce,
        bytes memory _withdrawal_proof,
        uint256 _block_proof_nonce,
        bytes memory _block_proof,
        bytes32 _messageHash
    ) private {
        require(MerkleTree.verifyMerkleProof(
            Rollup(rollup).acceptedBatchHash(_batchIndex),
            keccak256(abi.encodePacked(
                _commitmentBatch.previousBlockHash,
                _commitmentBatch.blockHash,
                _commitmentBatch.withdrawalHash,
                _commitmentBatch.depositHash)
            ),
            _block_proof_nonce,
            _block_proof
        ),
            "Failed to check batch proof"
        );

        require(MerkleTree.verifyMerkleProof(
            _commitmentBatch.withdrawalHash,
            _messageHash,
            _withdrawal_proof_nonce,
            _withdrawal_proof
        ),
            "Failed to check withdrawal proof"
        );


    }

    function receiveFailedMessage(
        address _from,
        address _to,
        uint256 _value,
        uint256 _nonce,
        bytes calldata _message
    ) external payable onlyBridgeSender {
        bytes memory encodedMessage = _encodeMessage(
            _from,
            _to,
            _value,
            _nonce,
            _message
        );

        bytes32 messageHash = keccak256(encodedMessage);

        require(
            receivedMessage[messageHash] == MessageStatus.Failed,
            "Only failed message"
        );

        _receiveMessage(_from, _to, _value, _nonce, _message, messageHash);
    }

    function receiveMessage(
        address _from,
        address _to,
        uint256 _value,
        uint256 _nonce,
        bytes calldata _message
    ) external payable onlyBridgeSender {
        require(
            _nonce == _takeNextReceivedNonce(),
            "message received out of turn"
        );

        bytes memory encodedMessage = _encodeMessage(
            _from,
            _to,
            _value,
            _nonce,
            _message
        );

        bytes32 messageHash = keccak256(encodedMessage);

        require(
            receivedMessage[messageHash] == MessageStatus.None,
            "Message already received"
        );

        _receiveMessage(_from, _to, _value, _nonce, _message, messageHash);
    }

    function _receiveMessage(
        address _from,
        address _to,
        uint256 _value,
        uint256 _nonce,
        bytes calldata _message,
        bytes32 _messageHash
    ) private {
        require(_to != address(this), "Forbid to call self");

        (bool success, bytes memory data) = _to.call{value: _value}(_message);

        if (success) {
            receivedMessage[_messageHash] = MessageStatus.Success;
            emit ReceivedMessage(_messageHash, success);
        } else {
            receivedMessage[_messageHash] = MessageStatus.Failed;
            emit Error(data);
        }
    }

    function _takeNextNonce() internal returns (uint256) {
        uint256 currentNonce = nonce;

        ++nonce;

        return currentNonce;
    }

    function _takeNextReceivedNonce() internal returns (uint256) {
        uint256 currentNonce = receivedNonce;

        ++receivedNonce;

        return currentNonce;
    }

    function _encodeMessage(
        address _from,
        address _to,
        uint256 _value,
        uint256 _nonce,
        bytes calldata _message
    ) internal pure returns (bytes memory) {
        return abi.encode(_from, _to, _value, _nonce, _message);
    }
}
