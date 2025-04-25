import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Bridge} from "../Bridge.sol";
import {BatchHeaderCodec} from "../restaker/libraries/BatchHeaderCodec.sol";
import "../interfaces/ISP1Verifier.sol";
import "../restaker/libraries/BlobHashGetter.sol";
import "./RLPReader.sol";

pragma solidity ^0.8.0;

contract Sp1Rollup is Ownable, BlobHashGetterDeployer {
    using RLPReader for bytes;
    using RLPReader for RLPReader.RLPItem;

    address public bridge;

    bytes32 public programVKey;
    bytes32 public genesisHash;

    uint256 public lastBatchIndex;
    uint256 public approveTimeout;
    uint256 public challengeDepositAmount;
    uint256 public challengeTime;
    address public blobHashGetter;

    uint256 public batchSize;
    uint256 public blockAccepted;

    uint[] private challengeQueue;
    uint private challengeQueueStart;

    bool private daCheck;

    mapping(uint256 => bytes32) public acceptedBatchHash;
    mapping(uint256 => uint256) public acceptedTime;
    mapping(uint256 => bool)    public proofedBlock;
    mapping(bytes32 => uint256) public withdrawalsAcceptedBlock;

    mapping(address => uint256) public challengerDeposit;
    mapping(uint256 => address) public blockChallenger;
    mapping(uint256 => uint256) public challengeDeadline;

    bytes32 public constant ZERO_BYTES_HASH = 0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470;

    ISP1Verifier private verifier;

    enum WithdrawalStatus { None, Pending, Completed, Failed }

    struct WithdrawalEvent {
        address bridge;
        uint256[] topics;
        bytes data;
    }

    struct BlockCommitment {
        uint256 blockNumber;
        bytes32 blockHash;
        bytes32 withdrawalHash;
        bytes32 depositHash;
    }

    struct DepositsInBlock {
        uint256 blockNumber;
        uint256 countDepositsInBlock;
    }

    event UpdateVerifier(address oldVerifier, address newVerifier);

    constructor(
        uint256 _challengeDepositAmount,
        uint256 _challengeTime,
        uint256 _approveTimeout,
        address _verifier,
        bytes32 _programVKey,
        bytes32 _genesisHash,
        address _bridge
    ) Ownable(msg.sender) {
        challengeDepositAmount = _challengeDepositAmount;
        challengeTime = _challengeTime;
        approveTimeout = _approveTimeout;
        verifier = ISP1Verifier(_verifier);
        daCheck = true;
        programVKey = _programVKey;
        genesisHash = _genesisHash;
        bridge = _bridge;
    }

    function calculateBlobHash(
        bytes memory blob
    ) public returns (bytes32) {
        bytes32 hash = sha256(blob);

        hash &= 0x00ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;
        hash |= 0x0100000000000000000000000000000000000000000000000000000000000000;

        return hash;
    }

    function setDaCheck(bool isCheck) external payable onlyOwner {
        daCheck = isCheck;
    }

    function getBlockNumber(bytes memory _blockHeader) internal returns(uint256) {
        return 0;
    }

    function calculateBatchRoot(
        BlockCommitment[] calldata commitmentBatch
    ) public returns (bytes32) {
        bytes memory leafs = new bytes(commitmentBatch.length * 32);

        for(uint256 i = 0; i < commitmentBatch.length; ++i) {
            bytes32 hash = keccak256(abi.encodePacked(
                commitmentBatch[i].blockNumber,
                commitmentBatch[i].blockHash,
                commitmentBatch[i].withdrawalHash,
                commitmentBatch[i].depositHash)
            );
            assembly {
                mstore(add(add(leafs, 32), mul(i, 32)), hash)
            }
        }

        return _calculateMerkleRoot(leafs);
    }

    function checkDeposit(
        BlockCommitment calldata _commitmentBatch,
        DepositsInBlock calldata depositInBlock
    ) public returns (bool) {
        bytes32[] memory depositIds = new bytes32[](depositInBlock.countDepositsInBlock);
        for(uint256 i = 0; i < depositInBlock.countDepositsInBlock; ++i) {
            bytes32 depositId = Bridge(bridge).sentMessageQueue().dequeue();
            depositIds[i]= depositId;
        }

        return keccak256(abi.encodePacked(depositIds)) == _commitmentBatch.depositHash;
    }

    function calculateBlobHash() public returns (bytes32){
        //TODO:
        return 0;
    }

    function acceptNextBatch(
        uint256 _batchIndex,
        BlockCommitment[] calldata _commitmentBatch,
        DepositsInBlock[] calldata depositsInBlocks
    ) external payable {
        require(!_rollupCorrupted(), "can't accept while rollup corrupted");

        require(
            _batchIndex == lastBatchIndex + 1 || _batchIndex == 0 && lastBatchIndex == 0,
            "Wrong batch index"
        );

        require(
            _batchIndex == lastBatchIndex + 1,
            "Wrong batch index"
        );

        require(
            _commitmentBatch.length == batchSize,
            "Wrong batch size"
        );

        require(
            _commitmentBatch[0].blockNumber == blockAccepted,
            "Wrong block number"
        );

        uint256 depositIndex = 0;
        for(uint256 i = 0; i < batchSize - 1; ++i) {
            require(
                _commitmentBatch[i].blockNumber == _commitmentBatch[i].blockNumber + 1,
                "Wrong block sequence"
            );
            if (_commitmentBatch[i].depositHash != ZERO_BYTES_HASH) {
                require(checkDeposit(_commitmentBatch[i], depositsInBlocks[depositIndex]), "Failed to check deposit");
                depositIndex += 1;
            }
        }
        if (_commitmentBatch[batchSize - 1].depositHash != ZERO_BYTES_HASH) {
            require(checkDeposit(_commitmentBatch[batchSize -1], depositsInBlocks[depositIndex]), "Failed to check deposit");
        }

        bytes32 requiredBlobHash;

        if (daCheck) {
            requiredBlobHash = calculateBlobHash();
            bytes32 submittedBlobHash = BlobHashGetter.getBlobHash(
                blobHashGetter,
                0
            );
            require(
                submittedBlobHash == requiredBlobHash,
                "submitted wrong blob to da"
            );
        }

        bytes32 batchRoot = calculateBatchRoot(_commitmentBatch);
        acceptedBatchHash[_batchIndex] = batchRoot;
        lastBatchIndex = _batchIndex;
        blockAccepted += batchSize;
        acceptedTime[_batchIndex] = block.timestamp;
    }

    function getChallengeQueue() public view returns (uint[] memory) {
        return challengeQueue;
    }

    function rollupCorrupted() external view returns (bool) {
        return _rollupCorrupted();
    }

    function _rollupCorrupted() internal view returns (bool) {
        return
            challengeQueue.length != 0 &&
            challengeDeadline[challengeQueue[0]] < block.timestamp;
    }

    function acceptedBlock(uint256 _blockNumber) external view returns (bool) {
        return _acceptedBlock(_blockNumber);
    }

    function _acceptedBlock(uint256 _blockNumber) internal view returns (bool) {
        return _blockNumber <= lastBatchIndex;
    }

    function approvedBlock(uint256 _blockNumber) external view returns (bool) {
        return _approvedBlock(_blockNumber);
    }

    function _approvedBlock(uint256 _blockNumber) internal view returns (bool) {
        uint256 blockAcceptTime = acceptedTime[_blockNumber];

        return
            _acceptedBlock(_blockNumber) &&
            (
                block.timestamp - blockAcceptTime > approveTimeout ||
                proofedBlock[_blockNumber]
            );
    }

    function challengeBlock(uint256 _blockNumber) external payable {
        require(!_approvedBlock(_blockNumber), "batch already approved");
        require(!proofedBlock[_blockNumber], "batch already proofed");
        require(
            blockChallenger[_blockNumber] == address(0),
            "batch already challenged"
        );

        require(
            msg.value >= challengeDepositAmount,
            "need to send challenge deposit in value"
        );

        challengerDeposit[msg.sender] += msg.value;
        blockChallenger[_blockNumber] = msg.sender;
        challengeDeadline[_blockNumber] = block.timestamp + challengeTime;
        challengeQueue.push(_blockNumber);
    }

    function proofBlock(
        uint256 _blockNumber,
        bytes calldata _proof
    ) external {
        bytes32 blockHash = acceptedBatchHash[_blockNumber];

        verifier.verifyProof(
            programVKey,
            _getPublicValues(blockHash),
            _proof
        );

        proofedBlock[_blockNumber] = true;
        address challenger = blockChallenger[_blockNumber];

        if (challenger != address(0)) {
            blockChallenger[_blockNumber] = address(0);
            challengerDeposit[challenger] -= challengeDepositAmount;

            for (uint256 i = 0; i < challengeQueue.length; i++) {
                if (challengeQueue[i] == _blockNumber) {
                    delete challengeQueue[i];
                    _resolveChallenge(i);
                }
            }
            _cleanQueue();
        }
    }

    function _resolveChallenge(uint256 blockNumber) internal {

    }

    function _getPublicValues(bytes32 _blockHash) internal pure returns (bytes memory) {

        bytes memory publicValues = new bytes(40);

        publicValues[0] = 0x20;

        for (uint256 i = 0; i < 32; i++) {
            publicValues[8 + i] = _blockHash[i];
        }

        return publicValues;
    }

    function _cleanQueue() internal {
        while (
            challengeQueue.length != 0 &&
            challengeQueue[challengeQueueStart] == 0
        ) {
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

    function forceRevertBlock(uint256 _revertedBlockNumber) external onlyOwner {
        require(_acceptedBlock(_revertedBlockNumber), "batch not accepted yet");
        require(_revertedBlockNumber != 0, "batch index can't be zero");
        for (uint256 i = _revertedBlockNumber; i <= lastBatchIndex; i++) {
            for (
                uint256 j = challengeQueueStart;
                j < challengeQueue.length;
                j++
            ) {
                if (i == challengeQueue[j]) {
                    delete challengeQueue[j];
                }
            }
            address challenger = blockChallenger[i];
            if (challenger != address(0)) {
                blockChallenger[i] = address(0);
                challengerDeposit[challenger] -= challengeDepositAmount;
                (bool success, ) = challenger.call{value: challengeDepositAmount}("");
                require(success, "ETH transfer failed");

            }
        }
        _cleanQueue();

        lastBatchIndex = _revertedBlockNumber - 1;
    }

    function updateVerifier(address _newVerifier) external onlyOwner {
        address _oldVerifier = address(verifier);
        verifier = ISP1Verifier(_newVerifier);

        emit UpdateVerifier(_oldVerifier, _newVerifier);
    }
}
