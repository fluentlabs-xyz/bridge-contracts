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

    uint256 public lastBlockNumber;
    uint256 public approveTimeout;
    uint256 public challengeDepositAmount;
    uint256 public challengeTime;
    address public blobHashGetter;

    uint[] private challengeQueue;
    uint private challengeQueueStart;

    bool private daCheck;

    mapping(uint256 => bytes32) public acceptedBlockHash;
    mapping(uint256 => uint256) public acceptedTime;
    mapping(uint256 => bool)    public proofedBlock;
    mapping(bytes32 => uint256) public withdrawalsAcceptedBlock;

    mapping(address => uint256) public challengerDeposit;
    mapping(uint256 => address) public blockChallenger;
    mapping(uint256 => uint256) public challengeDeadline;

    ISP1Verifier private verifier;

    enum WithdrawalStatus { None, Pending, Completed, Failed }

    struct WithdrawalEvent {
        address bridge;
        uint256[] topics;
        bytes data;
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

    function acceptNextBlock(
        bytes calldata newBlockRlp,
        bytes calldata withdrawalEvents
    ) external payable {
        RLPReader.RLPItem[] memory headerFields = newBlockRlp.toRlpItem().toList();

        bytes32 parentHash = bytes32(headerFields[0].toBytes());
        uint256 blockNumber = headerFields[8].toUint();
        bytes32 transactionRoot = bytes32(headerFields[4].toBytes());

        require(
            blockNumber == lastBlockNumber + 1,
            "Wrong block number"
        );

        if (blockNumber != 1) {
            require(
                parentHash == acceptedBlockHash[lastBlockNumber],
                "Parent hash mismatch"
            );
        } else {
            require(
                parentHash == genesisHash,
                "Parent hash mismatch with genesis hash"
            );
        }

        require(!_rollupCorrupted(), "can't accept while rollup corrupted");

        bytes32 newBlockHash = keccak256(newBlockRlp);
        bytes32 withdrawalsHash = keccak256(withdrawalEvents);
        if (withdrawalEvents.length != 0) {
            WithdrawalEvent[] memory withdrawalEvent = abi.decode(withdrawalEvents, (WithdrawalEvent[]));

            for (uint256 i = 0; i < withdrawalEvent.length; i++) {
                (address sender, address to, uint256 value, uint256 nonce, bytes32 msgHash, bytes memory innerData) =
                                    abi.decode(withdrawalEvent[i].data, (address, address, uint256, uint256, bytes32, bytes));

                withdrawalsAcceptedBlock[msgHash] = blockNumber;
            }
        }

        bytes32 requiredBlobHash;

        if (daCheck) {
            requiredBlobHash = transactionRoot;
            bytes32 submittedBlobHash = BlobHashGetter.getBlobHash(
                blobHashGetter,
                0
            );
            require(
                submittedBlobHash == requiredBlobHash,
                "submitted wrong blob to da"
            );
        }

        lastBlockNumber = blockNumber;
        acceptedBlockHash[blockNumber] = newBlockHash;
        acceptedTime[blockNumber] = block.timestamp;
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
        return _blockNumber <= lastBlockNumber;
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
        bytes32 blockHash = acceptedBlockHash[_blockNumber];

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

    function forceRevertBlock(uint256 _revertedBlockNumber) external onlyOwner {
        require(_acceptedBlock(_revertedBlockNumber), "batch not accepted yet");
        require(_revertedBlockNumber != 0, "batch index can't be zero");
        for (uint256 i = _revertedBlockNumber; i <= lastBlockNumber; i++) {
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

        lastBlockNumber = _revertedBlockNumber - 1;
    }

    function updateVerifier(address _newVerifier) external onlyOwner {
        address _oldVerifier = address(verifier);
        verifier = ISP1Verifier(_newVerifier);

        emit UpdateVerifier(_oldVerifier, _newVerifier);
    }
}
