// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

/// BatchHeader struct
/// Version         -  1 byte, index: 0
/// BatchIndex      -  8 byte, index: 1
/// CommitmentHash  - 32 byte, index: 9
/// TxsHash         - 32 byte, index: 41
/// ParentBatchHash - 32 byte, index: 73

library BatchHeaderCodec {
    error ErrorBatchHeaderLengthTooSmall();

    uint256 internal constant BATCH_HEADER_LENGTH = 1 + 8 + 32 + 32 + 32;

    function getVersion(
        uint256 batchPtr
    ) internal pure returns (uint256 _version) {
        assembly {
            _version := shr(248, mload(batchPtr))
        }
    }

    function storeVersion(uint256 batchPtr, uint256 _version) internal pure {
        assembly {
            mstore8(batchPtr, _version)
        }
    }

    function getBatchIndex(
        uint256 batchPtr
    ) internal pure returns (uint256 _batchIndex) {
        assembly {
            _batchIndex := shr(192, mload(add(batchPtr, 1)))
        }
    }

    function storeBatchIndex(
        uint256 batchPtr,
        uint256 _batchIndex
    ) internal pure {
        assembly {
            mstore(add(batchPtr, 1), shl(192, _batchIndex))
        }
    }

    function getCommitmentHash(
        uint256 batchPtr
    ) internal pure returns (bytes32 _commitmentHash) {
        assembly {
            _commitmentHash := mload(add(batchPtr, 9))
        }
    }

    function storeCommitmentHash(
        uint256 batchPtr,
        bytes32 _commitmentHash
    ) internal pure {
        assembly {
            mstore(add(batchPtr, 9), _commitmentHash)
        }
    }

    function getTxsHash(
        uint256 batchPtr
    ) internal pure returns (bytes32 _txsHash) {
        assembly {
            _txsHash := mload(add(batchPtr, 41))
        }
    }

    function storeTxsHash(uint256 batchPtr, bytes32 _txsHash) internal pure {
        assembly {
            mstore(add(batchPtr, 41), _txsHash)
        }
    }

    function getParentBatchHash(
        uint256 batchPtr
    ) internal pure returns (bytes32 _parentBatchHash) {
        assembly {
            _parentBatchHash := mload(add(batchPtr, 73))
        }
    }

    function storeParentBatchHash(
        uint256 batchPtr,
        bytes32 _parentBatchHash
    ) internal pure {
        assembly {
            mstore(add(batchPtr, 73), _parentBatchHash)
        }
    }

    function calculateBatchHash(
        uint256 batchPtr
    ) internal returns (bytes32 _batchHash) {
        assembly {
            _batchHash := keccak256(batchPtr, BATCH_HEADER_LENGTH)
        }
    }

    function loadBatchHash(
        bytes calldata _batchHeader
    ) internal pure returns (uint256 batchPtr, uint256 length) {
        length = _batchHeader.length;
        if (length < BATCH_HEADER_LENGTH)
            revert ErrorBatchHeaderLengthTooSmall();

        assembly {
            batchPtr := mload(0x40)
            calldatacopy(batchPtr, _batchHeader.offset, length)
            mstore(0x40, add(batchPtr, length))
        }
    }
}
