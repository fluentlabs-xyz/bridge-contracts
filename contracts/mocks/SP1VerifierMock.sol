// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../interfaces/ISP1Verifier.sol";

contract SP1VerifierMock is ISP1Verifier {
    constructor() {}

    function verifyProof(
        bytes32 programVKey,
        bytes calldata publicValues,
        bytes calldata proofBytes
    ) external view {

    }
}
