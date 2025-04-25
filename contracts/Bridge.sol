// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./libraries/Queue.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "hardhat/console.sol";
import {IERC20Gateway} from "./interfaces/IERC20Gateway.sol";
import {Sp1Rollup} from "./rollup/Sp1Rollup.sol";

contract Bridge {
    uint256 public nonce;
    uint256 public receivedNonce;

    enum MessageStatus {
        None,
        Failed,
        Success
    }

    mapping(bytes32 => MessageStatus) public receivedMessage;
//    mapping(bytes32 => bool) public sentMessage;

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
        address _from,
        address payable _to,
        uint256 _value,
        uint256 _nonce,
        bytes calldata _message
    ) external payable {
        bytes memory encodedMessage = _encodeMessage(
            _from,
            _to,
            _value,
            _nonce,
            _message
        );

        bytes32 messageHash = keccak256(encodedMessage);
        require(
            receivedMessage[messageHash] != MessageStatus.Success,
            "Message already received"
        );
        uint256 withdrawalBlockNumber = Sp1Rollup(rollup).withdrawalsAcceptedBlock(messageHash);
        require(withdrawalBlockNumber != 0);
        require(Sp1Rollup(rollup).approvedBlock(withdrawalBlockNumber));

        _receiveMessage(_from, _to, _value, _nonce, _message, messageHash);
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
            receivedMessage[messageHash] != MessageStatus.Success,
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
