// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./libraries/Queue.sol";
import {IERC20Gateway} from "./interfaces/IERC20Gateway.sol";
import {MerkleTree} from "./libraries/MerkleTree.sol";
import {Rollup} from "./rollup/Rollup.sol";

contract Bridge is ReentrancyGuard {
    uint256 public nonce;
    uint256 public receivedNonce;
    uint256 public receiveMessageDeadline;

    error OnlyBridgeAuthority();
    error OnlyRollupAuthority();
    error MessageAlreadyReceived();
    error MessageReceivedOutOfOrder();
    error MessageNotFailed();
    error ForbiddenSelfCall();
    error RollbackMessageMismatch();
    error InvalidBlockProof();
    error InvalidWithdrawalProof();

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

    Queue private sentMessageQueue;
    address public bridgeAuthority;
    address public rollup;

    modifier onlyRollup() {
        if (msg.sender != rollup) revert OnlyRollupAuthority();
        _;
    }

    modifier onlyBridgeSender() {
        if (msg.sender != bridgeAuthority) revert OnlyBridgeAuthority();
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

    event ReceivedMessage(bytes32 messageHash, bool successfulCall, bytes returnData);
    event RollbackMessage(bytes32 messageHash, uint256 blockNumber);
    event ReceivedMessageRollback(bytes32 messageHash, bool successfulCall, bytes returnData);

    constructor(address _bridgeAuthority, address _rollup, uint256 _receiveMessageDeadline) {
        bridgeAuthority = _bridgeAuthority;
        rollup = _rollup;
        receiveMessageDeadline = _receiveMessageDeadline;
        if (rollup != address(0)) {
            sentMessageQueue = new Queue();
        }
    }

    function getQueueSize() external view returns (uint256) {
        if (address(sentMessageQueue) != address(0)) {
            return sentMessageQueue.size();
        }
        return 0;
    }

    function popSentMessage() public onlyRollup returns (bytes32) {
        return sentMessageQueue.dequeue();
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

        emit SentMessage(from, _to, value, block.chainid, block.number, messageNonce, messageHash, _message);
    }

    function rollbackMessageWithProof(
        uint256 _batchIndex,
        Rollup.BlockCommitment calldata _commitmentBatch,
        address _from,
        address _to,
        uint256 _value,
        uint256 _chainId,
        uint256 _blockNumber,
        uint256 _nonce,
        bytes calldata _message,
        MerkleProof calldata _rollback_proof,
        MerkleProof calldata _block_proof
    ) external payable nonReentrant {
        if (!Rollup(rollup).approvedBatch(_batchIndex)) revert InvalidBlockProof();

        bytes32 messageHash = keccak256(_encodeMessage(
            _from,
            _to,
            _value,
            _chainId,
            _blockNumber,
            _nonce,
            _message
        ));

        if (receivedMessage[messageHash] != MessageStatus.None) revert MessageAlreadyReceived();

        _verifyWithdrawal(_batchIndex, _commitmentBatch, _rollback_proof, _block_proof, messageHash);
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
    ) external payable nonReentrant {
        if (_nonce != _takeNextReceivedNonce()) revert MessageReceivedOutOfOrder();
        if (!Rollup(rollup).approvedBatch(_batchIndex)) revert InvalidBlockProof();

        bytes32 messageHash = keccak256(_encodeMessage(
            _from,
            _to,
            _value,
            _chainId,
            _blockNumber,
            _nonce,
            _message
        ));

        if (receivedMessage[messageHash] != MessageStatus.None) revert MessageAlreadyReceived();

        _verifyWithdrawal(_batchIndex, _commitmentBatch, _withdrawal_proof, _block_proof, messageHash);
        _receiveMessage(_from, _to, _value, _chainId, _blockNumber, _nonce, _message, messageHash);
    }

    function _verifyWithdrawal(
        uint256 _batchIndex,
        Rollup.BlockCommitment calldata _commitmentBatch,
        MerkleProof calldata _withdrawal_proof,
        MerkleProof calldata _block_proof,
        bytes32 _messageHash
    ) private {
        bool blockValid = MerkleTree.verifyMerkleProof(
            Rollup(rollup).acceptedBatchHash(_batchIndex),
            keccak256(abi.encodePacked(
                _commitmentBatch.previousBlockHash,
                _commitmentBatch.blockHash,
                _commitmentBatch.withdrawalHash,
                _commitmentBatch.depositHash)
            ),
            _block_proof.nonce,
            _block_proof.proof
        );
        if (!blockValid) revert InvalidBlockProof();

        bool withdrawalValid = MerkleTree.verifyMerkleProof(
            _commitmentBatch.withdrawalHash,
            _messageHash,
            _withdrawal_proof.nonce,
            _withdrawal_proof.proof
        );
        if (!withdrawalValid) revert InvalidWithdrawalProof();
    }

    function receiveFailedMessage(
        address _from,
        address _to,
        uint256 _value,
        uint256 _chainId,
        uint256 _blockNumber,
        uint256 _nonce,
        bytes calldata _message
    ) external payable nonReentrant {
        bytes memory encodedMessage = _encodeMessage(_from, _to, _value, _chainId, _blockNumber, _nonce, _message);
        bytes32 messageHash = keccak256(encodedMessage);

        if (receivedMessage[messageHash] != MessageStatus.Failed) revert MessageNotFailed();

        _receiveMessage(_from, _to, _value, _chainId, _blockNumber, _nonce, _message, messageHash);
    }

    function receiveMessage(
        address _from,
        address _to,
        uint256 _value,
        uint256 _chainId,
        uint256 _blockNumber,
        uint256 _nonce,
        bytes calldata _message
    ) external payable onlyBridgeSender nonReentrant {
        if (_nonce != _takeNextReceivedNonce()) revert MessageReceivedOutOfOrder();

        bytes memory encodedMessage = _encodeMessage(_from, _to, _value, _chainId, _blockNumber, _nonce, _message);
        bytes32 messageHash = keccak256(encodedMessage);

        if (receivedMessage[messageHash] != MessageStatus.None) revert MessageAlreadyReceived();

        _receiveMessage(_from, _to, _value, _chainId, _blockNumber, _nonce, _message, messageHash);
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
        if (_to == address(this)) revert ForbiddenSelfCall();

        if (receiveMessageDeadline != 0 && _blockNumber + receiveMessageDeadline < block.number) {
            emit RollbackMessage(_messageHash, block.number);
            return;
        }

        (bool success, bytes memory data) = _to.call{value: _value}(_message);

        receivedMessage[_messageHash] = success ? MessageStatus.Success : MessageStatus.Failed;
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
        if (_to == address(this)) revert ForbiddenSelfCall();
        if (_messageHash != sentMessageQueue.dequeue()) revert RollbackMessageMismatch();

        (bool success, bytes memory data) = _from.call{value: _value}("");
        rollbackMessage[_messageHash] = success ? MessageStatus.Success : MessageStatus.Failed;
        emit ReceivedMessageRollback(_messageHash, success, data);
    }

    function _takeNextNonce() internal returns (uint256) {
        return nonce++;
    }

    function _takeNextReceivedNonce() internal returns (uint256) {
        return receivedNonce++;
    }

    function _encodeMessage(
        address _from,
        address _to,
        uint256 _value,
        uint256 _chainId,
        uint256 _blockNumber,
        uint256 _nonce,
        bytes calldata _message
    ) internal pure returns (bytes memory) {
        return abi.encode(_from, _to, _value, _chainId, _blockNumber, _nonce, _message);
    }
}
