import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Bridge} from "./Bridge.sol";
import "./interfaces/IRollupVerifier.sol";
import "hardhat/console.sol";

pragma solidity ^0.8.0;

contract Rollup is Ownable {
    address public bridge;

    uint256 public lastBatchedIndex;
    uint256 public approveTimeout;
    uint256 public challengeDepositAmount;
    uint256 public challengeTime;

    uint[] private challengeQueue;
    uint private challengeQueueStart;

    mapping(uint256 => bytes32) public withdrawRoots;
    mapping(uint256 => bytes32) public depositsRoots;
    mapping(uint256 => uint256) public acceptedTime;

    mapping(address => uint256) public challengerDeposit;
    mapping(uint256 => address) public batchChallenger;
    mapping(uint256 => uint256) public challengeDeadline;

    IRollupVerifier private verifier;

    event UpdateVerifier(address oldVerifier, address newVerifier);

    constructor(
        uint256 _challengeDepositAmount,
        uint256 _challengeTime,
        uint256 _approveTimeout,
        address _verifier
    ) Ownable(msg.sender) {
        challengeDepositAmount = _challengeDepositAmount;
        challengeTime = _challengeTime;
        approveTimeout = _approveTimeout;
        verifier = IRollupVerifier(_verifier);
    }

    function setBridge(address _bridge) external payable onlyOwner {
        bridge = _bridge;
    }

    function acceptNextBatch(
        uint256 _batchIndex,
        bytes32 _withdrawRoot,
        bytes memory _depositHashes
    ) external payable {
        blobhash(1);
        require(!_rollupCorrupted(), "can't accept while rollup corrupted");
        require(lastBatchedIndex + 1 == _batchIndex, "incorrect batch index");

        if (_depositHashes.length != 0) {
            require(
                validateDepositsHashes(_depositHashes),
                "incorrect deposit hash"
            );
            bytes32 _depositRoot = _calculateMerkleRoot(_depositHashes);
            depositsRoots[_batchIndex] = _depositRoot;
        }

        withdrawRoots[_batchIndex] = _withdrawRoot;
        lastBatchedIndex = _batchIndex;
        console.log(block.timestamp);
        acceptedTime[_batchIndex] = block.timestamp;
    }

    function calculateBatchHash(
        uint256 _batchIndex
    ) internal returns (bytes32) {

    }

    function getChallengeQueue() public view returns (uint[] memory) {
        return challengeQueue;
    }

    function rollupCorrupted() external view returns (bool) {
        return _rollupCorrupted();
    }

    function _rollupCorrupted() internal view returns (bool) {
        return challengeQueue.length != 0 && challengeDeadline[challengeQueue[0]] < block.timestamp;
    }

    function acceptedBatch(
        uint256 _batchIndex
    ) external view returns (bool) {
        return _acceptedBatch(_batchIndex);
    }

    function _acceptedBatch(
        uint256 _batchIndex
    ) internal view returns (bool) {
        return _batchIndex <= lastBatchedIndex;
    }

    function approvedBatch(
        uint256 _batchIndex
    ) external view returns (bool) {
        return _approvedBatch(_batchIndex);
    }

    function _approvedBatch(
        uint256 _batchIndex
    ) internal view returns (bool) {
        uint256 batchTime = acceptedTime[_batchIndex];

        console.log(block.timestamp);
        return _acceptedBatch(_batchIndex) && block.timestamp - batchTime > approveTimeout;
    }

    function validateDepositsHashes(
        bytes memory _leafs
    ) internal returns (bool) {
        uint256 count = _leafs.length / 32;

        for (uint256 i = 0; i < count; i++) {
            bytes32 messageHash;
            assembly {
                messageHash := mload(add(add(_leafs, 32), mul(i, 32)))
            }
            if (!Bridge(bridge).sentMessage(messageHash)) {
                return false;
            }
        }

        return true;
    }
    
    function challengeBatch(
        uint256 _batchIndex
    ) external payable {
        require(!_approvedBatch(_batchIndex), "batch already approved");
        require(batchChallenger[_batchIndex] == address(0), "batch already challenged");

        require(msg.value >= challengeDepositAmount, "need to send challenge deposit in value");

        challengerDeposit[msg.sender] += msg.value;
        batchChallenger[_batchIndex] = msg.sender;
        challengeDeadline[_batchIndex] = block.timestamp + challengeTime;
        challengeQueue.push(_batchIndex);
    }

    function proofBatch(
        uint256 _batchIndex,
        bytes calldata _aggregationProof
    ) external {
        bytes32 _publicInputHash = keccak256(
            ""
        );
        console.log(address(verifier));
        verifier.verifyAggregateProof(_batchIndex, _aggregationProof, _publicInputHash);

        address challenger = batchChallenger[_batchIndex];
        batchChallenger[_batchIndex] = address(0);
        challengerDeposit[challenger] -= challengeDepositAmount;

        for (uint256 i = 0; i < challengeQueue.length; i++) {
            if (challengeQueue[i] == _batchIndex){
                delete challengeQueue[i];
            }
        }
        _cleanQueue();
    }

    function _cleanQueue() internal {
        while (challengeQueue.length != 0 && challengeQueue[challengeQueueStart] == 0) {
            ++challengeQueueStart;
            if (challengeQueueStart >= challengeQueue.length) {
                challengeQueueStart = 0;
                while (challengeQueue.length != 0) {
                    challengeQueue.pop();
                }
                return;
            }
        }
    }

    function forceRevertBatch(uint256 _revertedBatchIndex) external onlyOwner {
        require(_acceptedBatch(_revertedBatchIndex), "batch not accepted yet");
        require(_revertedBatchIndex != 0, "batch index can't be zero");
        for (uint256 i = _revertedBatchIndex; i <= lastBatchedIndex; i++) {
            for (uint256 j = challengeQueueStart; j < challengeQueue.length; j++) {
                if (i == challengeQueue[j]) {
                    delete challengeQueue[j];
                }
            }
        }
        _cleanQueue();

        lastBatchedIndex = _revertedBatchIndex - 1;
    }

    function calculateMerkleRoot(
        bytes memory _leafs
    ) external pure returns (bytes32) {
        return _calculateMerkleRoot(_leafs);
    }

    function updateVerifier(address _newVerifier) external onlyOwner {
        address _oldVerifier = address(verifier);
        verifier = IRollupVerifier(_newVerifier);

        emit UpdateVerifier(_oldVerifier, _newVerifier);
    }

    function _calculateMerkleRoot(
        bytes memory _leafs
    ) internal pure returns (bytes32) {
        uint256 count = _leafs.length / 32;

        require(count > 0, "empty leafs");

        while (count > 0) {
            bytes32 hash;
            bytes32 left;
            bytes32 right;
            for (uint256 i = 0; i < count / 2; i++) {
                assembly {
                    left := mload(add(add(_leafs, 32), mul(mul(i, 2), 32)))
                    right := mload(
                        add(add(_leafs, 32), mul(add(mul(i, 2), 1), 32))
                    )
                }
                hash = _efficientHash(left, right);
                assembly {
                    mstore(add(add(_leafs, 32), mul(i, 32)), hash)
                }
            }

            if (count % 2 == 1 && count > 1) {
                assembly {
                    left := mload(add(add(_leafs, 32), mul(sub(count, 1), 32)))
                }
                hash = _efficientHash(left, bytes32(0));

                assembly {
                    mstore(
                        add(add(_leafs, 32), mul(div(sub(count, 1), 2), 32)),
                        hash
                    )
                }
                count += 1;
            }

            count = count / 2;
        }
        bytes32 root;
        assembly {
            root := mload(add(_leafs, 32))
        }

        return root;
    }

    function verifyMerkleProof(
        bytes32 _root,
        bytes32 _hash,
        uint256 _nonce,
        bytes memory _proof
    ) external pure returns (bool) {
        require(_proof.length % 32 == 0, "Invalid proof");
        uint256 _length = _proof.length / 32;

        for (uint256 i = 0; i < _length; i++) {
            bytes32 item;
            assembly {
                item := mload(add(add(_proof, 32), mul(i, 32)))
            }
            if (_nonce % 2 == 0) {
                _hash = _efficientHash(_hash, item);
            } else {
                _hash = _efficientHash(item, _hash);
            }
            _nonce /= 2;
        }
        return _hash == _root;
    }

    function _efficientHash(
        bytes32 a,
        bytes32 b
    ) private pure returns (bytes32 value) {
        assembly {
            mstore(0x00, a)
            mstore(0x20, b)
            value := keccak256(0x00, 0x40)
        }
    }
}
