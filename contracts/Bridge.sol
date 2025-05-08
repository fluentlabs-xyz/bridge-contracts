// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./libraries/Queue.sol";
import "./rollup/Rollup.sol";

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20Gateway} from "./interfaces/IERC20Gateway.sol";
import {MerkleTree} from "./libraries/MerkleTree.sol";
import {Rollup} from "./rollup/Rollup.sol";

contract Bridge {
    uint256 public nonce;
    uint256 public receivedNonce;
    uint256 public receiveMessageDeadline;

    enum MessageStatus {
        None,
        Failed,
        Success
    }

    struct MerkleProof {
        uint256 nonce;
        bytes proof;
    }

    mapping(bytes32 => MessageStatus) public receivedMessage;
    mapping(bytes32 => MessageStatus) public rollbackMessage;

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
        uint256 chainId,
        uint256 blockNumber,
        uint256 nonce,
        bytes32 messageHash,
        bytes data
    );

    event ReceivedMessage(bytes32 messageHash, bool successfulCall, bytes error);
    event RollbackMessage(bytes32 messageHash, uint256 blockNumber);
    event ReceivedMessageRollback(bytes32 messageHash, bool successfulCall, bytes error);

    constructor(address _bridgeAuthority, address _rollup, uint256 _receiveMessageDeadline) {
        bridgeAuthority = _bridgeAuthority;
        rollup = _rollup;
        receiveMessageDeadline = _receiveMessageDeadline;
        if (rollup != address(0))
        {
            sentMessageQueue = new Queue();
        }
    }

    function getQueueSize() external view returns (uint256) {
        if (address(sentMessageQueue) != address(0)) {
            return sentMessageQueue.size();
        }
        return 0;
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
            block.chainid,
            block.number,
            messageNonce,
            _message
        );

        bytes32 messageHash = keccak256(encodedMessage);

        if (address(sentMessageQueue) != address(0)) {
            sentMessageQueue.enqueue(messageHash);
        }

        emit SentMessage(from, _to, value, block.chainid, block.number,messageNonce, messageHash, _message);
    }


    function rollbackMessageWithProof(
        uint256 _batchIndex,
        Rollup.BlockCommitment calldata _commitmentBatch,
        address _from,
        address payable _to,
        uint256 _value,
        uint256 _chainId,
        uint256 _blockNumber,
        uint256 _nonce,
        bytes calldata _message,
        MerkleProof calldata _rollback_proof,
        MerkleProof calldata _block_proof
    ) external payable {
        require(Rollup(rollup).approvedBatch(_batchIndex));

        bytes32 messageHash = keccak256(_encodeMessage(
            _from,
            _to,
            _value,
             _chainId,
            _blockNumber,
            _nonce,
            _message
        ));

        require(
            receivedMessage[messageHash] == MessageStatus.None,
            "Message already received"
        );

        _verifyWithdrawal(
            _batchIndex,
            _commitmentBatch,
            _rollback_proof,
            _block_proof,
            messageHash
        );
        _rollbackMessage(_from, _to, _value, _blockNumber, _nonce, _message, messageHash);
    }

    function receiveMessageWithProof(
        uint256 _batchIndex,
        Rollup.BlockCommitment calldata _commitmentBatch,
        address _from,
        address payable _to,
        uint256 _value,
        uint256 _chainId,
        uint256 _blockNumber,
        uint256 _nonce,
        bytes calldata _message,
        MerkleProof calldata _withdrawal_proof,
        MerkleProof calldata _block_proof
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
            _chainId,
            _blockNumber,
            _nonce,
            _message
        ));

        require(
            receivedMessage[messageHash] == MessageStatus.None,
            "Message already received"
        );

        _verifyWithdrawal(
            _batchIndex,
            _commitmentBatch,
            _withdrawal_proof,
            _block_proof,
            messageHash
        );

        _receiveMessage(_from, _to, _value, _chainId,_blockNumber, _nonce, _message, messageHash);
    }

    function _verifyWithdrawal(
        uint256 _batchIndex,
        Rollup.BlockCommitment calldata _commitmentBatch,
        MerkleProof calldata _withdrawal_proof,
        MerkleProof calldata _block_proof,
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
            _block_proof.nonce,
            _block_proof.proof
        ),
            "Failed to check batch proof"
        );

        require(MerkleTree.verifyMerkleProof(
            _commitmentBatch.withdrawalHash,
            _messageHash,
            _withdrawal_proof.nonce,
            _withdrawal_proof.proof
        ),
            "Failed to check withdrawal proof"
        );


    }

    function receiveFailedMessage(
        address _from,
        address _to,
        uint256 _value,
        uint256 _chainId,
        uint256 _blockNumber,
        uint256 _nonce,
        bytes calldata _message
    ) external payable onlyBridgeSender {
        bytes memory encodedMessage = _encodeMessage(
            _from,
            _to,
            _value,
            _chainId,
            _blockNumber,
            _nonce,
            _message
        );

        bytes32 messageHash = keccak256(encodedMessage);

        require(
            receivedMessage[messageHash] == MessageStatus.Failed,
            "Only failed message"
        );

        _receiveMessage(_from, _to, _value,_chainId,_blockNumber, _nonce, _message, messageHash);
    }

    function receiveMessage(
        address _from,
        address _to,
        uint256 _value,
        uint256 _chainId,
        uint256 _blockNumber,
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
            _chainId,
            _blockNumber,
            _nonce,
            _message
        );

        bytes32 messageHash = keccak256(encodedMessage);

        require(
            receivedMessage[messageHash] == MessageStatus.None,
            "Message already received"
        );

        _receiveMessage(_from, _to, _value, _chainId,_blockNumber, _nonce, _message, messageHash);
    }

    function _receiveMessage(
        address _from,
        address _to,
        uint256 _value,
        uint256 _chainId,
        uint256 _blockNumber,
        uint256 _nonce,
        bytes calldata _message,
        bytes32 _messageHash
    ) private {
        require(_to != address(this), "Forbid to call self");

        if (receiveMessageDeadline != 0 && _blockNumber + receiveMessageDeadline < block.number) {
            emit RollbackMessage(_messageHash, block.number);
            return;
        }

        (bool success, bytes memory data) = _to.call{value: _value}(_message);

        if (success) {
            receivedMessage[_messageHash] = MessageStatus.Success;
        } else {
            receivedMessage[_messageHash] = MessageStatus.Failed;
        }
        emit ReceivedMessage(_messageHash, success, data);
    }

    function _rollbackMessage(
        address _from,
        address _to,
        uint256 _value,
        uint256 _blockNumber,
        uint256 _nonce,
        bytes calldata _message,
        bytes32 _messageHash
    ) private {
        require(_to != address(this), "Forbid to call self");

        require(_messageHash == sentMessageQueue.dequeue(), "Wrong rollback message");

        (bool success, bytes memory data) = _from.call{value: _value}("");

        if (success) {
            rollbackMessage[_messageHash] = MessageStatus.Success;
        } else {
            rollbackMessage[_messageHash] = MessageStatus.Failed;
        }
        emit ReceivedMessageRollback(_messageHash, success, data);
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
        uint256  _chainId,
        uint256 _blockNumber,
        uint256 _nonce,
        bytes calldata _message
    ) internal pure returns (bytes memory) {
        return abi.encode(_from, _to, _value, _chainId, _blockNumber, _nonce, _message);
    }
}
