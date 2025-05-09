import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IRollupVerifier.sol";
import "../interfaces/IVerifier.sol";
import "../restaker/libraries/BlobHashGetter.sol";
import {Bridge} from "../Bridge.sol";

pragma solidity ^0.8.0;

contract Rollup is Ownable, ReentrancyGuard, BlobHashGetterDeployer {
    error RollupCorrupted();
    error WrongPrevBlockHash(bytes32 expected, bytes32 provided);
    error DepositVerificationFailed(bytes32 blockHash);
    error AcceptDepositDeadlineExceeded(uint256 deadline, uint256 currentBlock);
    error BatchNotAccepted(uint256 batchIndex);
    error BatchAlreadyApproved(uint256 batchIndex);
    error BatchAlreadyProofed(uint256 batchIndex);
    error BatchAlreadyChallenged(uint256 batchIndex);
    error InsufficientChallengeDeposit(uint256 required, uint256 provided);
    error EthTransferFailed(address recipient, uint256 amount);
    error InvalidRevertIndex(uint256 index);
    error BlockHashMismatch(bytes32 expected, bytes32 provided);
    error InvalidBatchIndex(uint256 expected, uint256 provided);
    error InvalidBatchSize(uint256 expected, uint256 provided);
    error InvalidBlockSequence(
        uint256 index,
        bytes32 currentHash,
        bytes32 nextPrevHash
    );
    error NoLeavesProvided();
    error NothingToWithdraw();

    address public bridge;

    bytes32 public programVKey;

    uint256 public nextBatchIndex;
    uint256 public approveBlockCount;
    uint256 public challengeDepositAmount;
    uint256 public challengeBlockCount;
    address public blobHashGetter;

    uint256 public batchSize;
    bytes32 public lastBlockHashAccepted;
    uint256 public lastDepositAcceptedBlockNumber;
    uint256 public acceptDepositDeadline;

    uint[] private challengeQueue;
    uint private challengeQueueStart;

    bool private daCheck;

    mapping(uint256 => bytes32) public acceptedBatchHash;
    mapping(uint256 => uint256) public acceptedBlock;
    mapping(uint256 => bool) public proofedBatch;

    mapping(address => uint256) public challengerDeposit;
    mapping(address => uint256) public challengerReadyForWithdrawal;
    mapping(uint256 => address) public batchChallenger;
    mapping(uint256 => uint256) public challengeDeadline;

    bytes32 public constant ZERO_BYTES_HASH =
        0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470;

    IVerifier private verifier;

    struct BlockCommitment {
        bytes32 previousBlockHash;
        bytes32 blockHash;
        bytes32 withdrawalHash;
        bytes32 depositHash;
    }

    struct DepositsInBlock {
        bytes32 blockHash;
        uint256 depositCount;
    }

    event UpdateVerifier(address oldVerifier, address newVerifier);
    event BatchAccepted(uint256 batchIndex, bytes32 batchRoot);
    event BatchProofed(uint256 batchIndex);

    constructor(
        uint256 _challengeDepositAmount,
        uint256 _challengeBlockCount,
        uint256 _approveBlockCount,
        address _verifier,
        bytes32 _programVKey,
        bytes32 _genesisHash,
        address _bridge,
        uint256 _batchSize,
        uint256 _acceptDepositDeadline
    ) Ownable(msg.sender) {
        challengeDepositAmount = _challengeDepositAmount;
        challengeBlockCount = _challengeBlockCount;
        approveBlockCount = _approveBlockCount;
        verifier = IVerifier(_verifier);
        daCheck = true;
        programVKey = _programVKey;
        lastBlockHashAccepted = _genesisHash;
        bridge = _bridge;
        batchSize = _batchSize;
        acceptDepositDeadline = _acceptDepositDeadline;
    }

    function calculateBlobHash(bytes memory blob) public returns (bytes32) {
        bytes32 hash = sha256(blob);

        hash &= 0x00ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;
        hash |= 0x0100000000000000000000000000000000000000000000000000000000000000;

        return hash;
    }

    function setDaCheck(bool isCheck) external payable onlyOwner {
        daCheck = isCheck;
    }

    function setBridge(address _bridge) external payable onlyOwner {
        bridge = _bridge;
    }

    function calculateBatchRoot(
        BlockCommitment[] calldata commitmentBatch
    ) public view returns (bytes32) {
        bytes memory leafs = new bytes(commitmentBatch.length * 32);

        for (uint256 i = 0; i < commitmentBatch.length; ++i) {
            bytes32 hash = keccak256(
                abi.encodePacked(
                    commitmentBatch[i].previousBlockHash,
                    commitmentBatch[i].blockHash,
                    commitmentBatch[i].withdrawalHash,
                    commitmentBatch[i].depositHash
                )
            );
            assembly {
                mstore(add(add(leafs, 32), mul(i, 32)), hash)
            }
        }

        return _calculateMerkleRoot(leafs);
    }

    function _checkDeposit(
        BlockCommitment calldata _commitmentBatch,
        DepositsInBlock calldata depositInBlock
    ) private returns (bool) {
        if (_commitmentBatch.blockHash != depositInBlock.blockHash) {
            revert BlockHashMismatch(
                _commitmentBatch.blockHash,
                depositInBlock.blockHash
            );
        }

        bytes32[] memory depositIds = new bytes32[](
            depositInBlock.depositCount
        );
        for (uint256 i = 0; i < depositInBlock.depositCount; ++i) {
            bytes32 depositId = Bridge(bridge).popSentMessage();
            depositIds[i] = depositId;
        }

        return
            keccak256(abi.encodePacked(depositIds)) ==
            _commitmentBatch.depositHash;
    }

    function acceptNextBatch(
        uint256 _batchIndex,
        BlockCommitment[] calldata _commitmentBatch,
        DepositsInBlock[] calldata depositsInBlocks
    ) external payable {
        if (_rollupCorrupted()) {
            revert RollupCorrupted();
        }

        if (_batchIndex != nextBatchIndex) {
            revert InvalidBatchIndex(nextBatchIndex, _batchIndex);
        }

        if (_commitmentBatch.length != batchSize) {
            revert InvalidBatchSize(batchSize, _commitmentBatch.length);
        }

        if (_commitmentBatch[0].previousBlockHash != lastBlockHashAccepted) {
            revert WrongPrevBlockHash(
                lastBlockHashAccepted,
                _commitmentBatch[0].previousBlockHash
            );
        }

        uint256 depositIndex = 0;
        uint256 queueSize = Bridge(bridge).getQueueSize();

        for (uint256 i = 0; i < batchSize - 1; ++i) {
            if (
                _commitmentBatch[i].blockHash !=
                _commitmentBatch[i + 1].previousBlockHash
            ) {
                revert InvalidBlockSequence(
                    i,
                    _commitmentBatch[i].blockHash,
                    _commitmentBatch[i + 1].previousBlockHash
                );
            }
            if (_commitmentBatch[i].depositHash != ZERO_BYTES_HASH) {
                if (
                    !_checkDeposit(
                        _commitmentBatch[i],
                        depositsInBlocks[depositIndex]
                    )
                ) {
                    revert DepositVerificationFailed(
                        _commitmentBatch[i].blockHash
                    );
                }
                depositIndex += 1;
            }
        }
        if (_commitmentBatch[batchSize - 1].depositHash != ZERO_BYTES_HASH) {
            if (
                !_checkDeposit(
                    _commitmentBatch[batchSize - 1],
                    depositsInBlocks[depositIndex]
                )
            ) {
                revert DepositVerificationFailed(
                    _commitmentBatch[batchSize - 1].blockHash
                );
            }
        }

        if (Bridge(bridge).getQueueSize() == 0) {
            lastDepositAcceptedBlockNumber = 0;
        } else if (
            queueSize > Bridge(bridge).getQueueSize() ||
            (queueSize != 0 && lastDepositAcceptedBlockNumber == 0)
        ) {
            lastDepositAcceptedBlockNumber = block.number;
        } else if (
            lastDepositAcceptedBlockNumber + acceptDepositDeadline <
            block.number
        ) {
            revert AcceptDepositDeadlineExceeded(
                lastDepositAcceptedBlockNumber + acceptDepositDeadline,
                block.number
            );
        }

        //        TODO: NOT IMPLEMENTED YET
        //        bytes32 requiredBlobHash;
        //        if (daCheck) {
        //            requiredBlobHash = calculateBlobHash();
        //            bytes32 submittedBlobHash = BlobHashGetter.getBlobHash(
        //                blobHashGetter,
        //                0
        //            );
        //            require(
        //                submittedBlobHash == requiredBlobHash,
        //                "submitted wrong blob to da"
        //            );
        //        }

        bytes32 batchRoot = calculateBatchRoot(_commitmentBatch);
        acceptedBatchHash[_batchIndex] = batchRoot;
        nextBatchIndex = _batchIndex + 1;
        lastBlockHashAccepted = _commitmentBatch[batchSize - 1].blockHash;
        acceptedBlock[_batchIndex] = block.number;

        emit BatchAccepted(_batchIndex, batchRoot);
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
            challengeDeadline[challengeQueue[0]] < block.number;
    }

    function acceptedBatch(uint256 _batchIndex) external view returns (bool) {
        return _acceptedBatch(_batchIndex);
    }

    function _acceptedBatch(uint256 _batchIndex) internal view returns (bool) {
        return _batchIndex < nextBatchIndex;
    }

    function approvedBatch(uint256 _batchIndex) external view returns (bool) {
        return _approvedBatch(_batchIndex);
    }

    function _approvedBatch(uint256 _batchIndex) internal view returns (bool) {
        uint256 blockAcceptBlockNumber = acceptedBlock[_batchIndex];

        return
            _acceptedBatch(_batchIndex) &&
            (block.number - blockAcceptBlockNumber > approveBlockCount ||
                proofedBatch[_batchIndex]);
    }

    function challengeBatch(uint256 _batchIndex) external payable nonReentrant {
        if (!_acceptedBatch(_batchIndex)) {
            revert BatchNotAccepted(_batchIndex);
        }
        if (_approvedBatch(_batchIndex)) {
            revert BatchAlreadyApproved(_batchIndex);
        }
        if (proofedBatch[_batchIndex]) {
            revert BatchAlreadyProofed(_batchIndex);
        }
        if (batchChallenger[_batchIndex] != address(0)) {
            revert BatchAlreadyChallenged(_batchIndex);
        }

        if (msg.value < challengeDepositAmount) {
            revert InsufficientChallengeDeposit(
                challengeDepositAmount,
                msg.value
            );
        }

        challengerDeposit[msg.sender] += msg.value;
        batchChallenger[_batchIndex] = msg.sender;
        challengeDeadline[_batchIndex] = block.number + challengeBlockCount;
        challengeQueue.push(_batchIndex);
    }

    function proofBatch(
        uint256 _batchIndex,
        bytes calldata _proof
    ) external nonReentrant {
        bytes32 blockHash = acceptedBatchHash[_batchIndex];

        verifier.verifyProof(programVKey, _getPublicValues(blockHash), _proof);

        proofedBatch[_batchIndex] = true;
        address challenger = batchChallenger[_batchIndex];

        if (challenger != address(0)) {
            batchChallenger[_batchIndex] = address(0);
            if (challengerDeposit[challenger] >= challengeDepositAmount) {
                challengerDeposit[challenger] -= challengeDepositAmount;
                challengerReadyForWithdrawal[
                    challenger
                ] += challengeDepositAmount;
            }

            for (uint256 i = 0; i < challengeQueue.length; i++) {
                if (challengeQueue[i] == _batchIndex) {
                    delete challengeQueue[i];
                }
            }
            _cleanQueue();
        }

        emit BatchProofed(_batchIndex);
    }

    function withdrawChallengeDeposit(
        address payable challenger
    ) external payable nonReentrant {
        uint256 amount = challengerReadyForWithdrawal[challenger];

        if (amount == 0) revert NothingToWithdraw();

        challengerReadyForWithdrawal[challenger] = 0;

        challenger.transfer(amount);
    }

    function _getPublicValues(
        bytes32 _blockHash
    ) internal pure returns (bytes memory) {
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
                delete challengeQueue;
                return;
            }
        }
    }

    function _calculateMerkleRoot(
        bytes memory _leafs
    ) internal pure returns (bytes32) {
        uint256 count = _leafs.length / 32;

        if (count == 0) {
            revert NoLeavesProvided();
        }

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
                hash = _efficientHash(left, left);

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

    function forceRevertBatch(
        uint256 _revertedBatchIndex
    ) external onlyOwner nonReentrant {
        if (!_acceptedBatch(_revertedBatchIndex)) {
            revert BatchNotAccepted(_revertedBatchIndex);
        }
        if (_revertedBatchIndex == 0) {
            revert InvalidRevertIndex(_revertedBatchIndex);
        }
        for (uint256 i = _revertedBatchIndex; i < nextBatchIndex; i++) {
            for (
                uint256 j = challengeQueueStart;
                j < challengeQueue.length;
                j++
            ) {
                if (i == challengeQueue[j]) {
                    delete challengeQueue[j];
                }
            }
            address challenger = batchChallenger[i];
            if (challenger != address(0)) {
                batchChallenger[i] = address(0);
                if (challengerDeposit[challenger] >= challengeDepositAmount) {
                    challengerDeposit[challenger] -= challengeDepositAmount;
                    challengerReadyForWithdrawal[
                        challenger
                    ] += challengeDepositAmount;
                }
            }
        }
        _cleanQueue();

        nextBatchIndex = _revertedBatchIndex;
    }

    function updateVerifier(address _newVerifier) external onlyOwner {
        address _oldVerifier = address(verifier);
        verifier = IVerifier(_newVerifier);

        emit UpdateVerifier(_oldVerifier, _newVerifier);
    }
}
