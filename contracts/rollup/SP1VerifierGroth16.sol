// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IVerifier, ISP1VerifierWithHash} from "../interfaces/IVerifier.sol";
import {Groth16Verifier} from "./Groth16Verifier.sol";

/// @title SP1 Verifier
/// @author Succinct Labs
/// @notice This contracts implements a solidity rollup for SP1.
contract SP1Verifier is Groth16Verifier, ISP1VerifierWithHash {
    /// @notice Thrown when the rollup selector from this proof does not match the one in this
    /// rollup. This indicates that this proof was sent to the wrong rollup.
    /// @param received The rollup selector from the first 4 bytes of the proof.
    /// @param expected The rollup selector from the first 4 bytes of the VERIFIER_HASH().
    error WrongVerifierSelector(bytes4 received, bytes4 expected);

    /// @notice Thrown when the proof is invalid.
    error InvalidProof();

    function VERSION() external pure returns (string memory) {
        return "v4.0.0-rc.3";
    }

    /// @inheritdoc ISP1VerifierWithHash
    function VERIFIER_HASH() public pure returns (bytes32) {
        return
            0x11b6a09d63d255ad425ee3a7f6211d5ec63fbde9805b40551c3136275b6f4eb4;
    }

    /// @notice Hashes the public values to a field elements inside Bn254.
    /// @param publicValues The public values.
    function hashPublicValues(
        bytes calldata publicValues
    ) public pure returns (bytes32) {
        return sha256(publicValues) & bytes32(uint256((1 << 253) - 1));
    }

    /// @notice Verifies a proof with given public values and vkey.
    /// @param programVKey The verification key for the RISC-V program.
    /// @param publicValues The public values encoded as bytes.
    /// @param proofBytes The proof of the program execution the SP1 zkVM encoded as bytes.
    function verifyProof(
        bytes32 programVKey,
        bytes calldata publicValues,
        bytes calldata proofBytes
    ) external view {
        bytes4 receivedSelector = bytes4(proofBytes[:4]);
        bytes4 expectedSelector = bytes4(VERIFIER_HASH());
        if (receivedSelector != expectedSelector) {
            revert WrongVerifierSelector(receivedSelector, expectedSelector);
        }

        bytes32 publicValuesDigest = hashPublicValues(publicValues);
        uint256[2] memory inputs;
        inputs[0] = uint256(programVKey);
        inputs[1] = uint256(publicValuesDigest);
        uint256[8] memory proof = abi.decode(proofBytes[4:], (uint256[8]));
        this.Verify(proof, inputs);
    }
}
