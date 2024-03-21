// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../restaker/interfaces/IDelegationManager.sol";
import "hardhat/console.sol";

contract DelegationManagerMock is IDelegationManager {
    function delegateTo(
        address operator,
        SignatureWithExpiry memory approverSignatureAndExpiry,
        bytes32 approverSalt
    ) external override {}

    function delegateToBySignature(
        address staker,
        address operator,
        SignatureWithExpiry memory stakerSignatureAndExpiry,
        SignatureWithExpiry memory approverSignatureAndExpiry,
        bytes32 approverSalt
    ) external override {}

    function undelegate(
        address staker
    ) external override returns (bytes32 withdrawalRoot) {}

    function queueWithdrawals(
        QueuedWithdrawalParams[] calldata queuedWithdrawalParams
    ) external override returns (bytes32[] memory) {}

    function completeQueuedWithdrawal(
        Withdrawal calldata withdrawal,
        IERC20[] calldata tokens,
        uint256 middlewareTimesIndex,
        bool receiveAsTokens
    ) external override {}

    function completeQueuedWithdrawals(
        Withdrawal[] calldata withdrawals,
        IERC20[][] calldata tokens,
        uint256[] calldata middlewareTimesIndexes,
        bool[] calldata receiveAsTokens
    ) external override {}

    function stakeRegistry()
        external
        view
        override
        returns (IStakeRegistryStub)
    {}

    function delegatedTo(
        address staker
    ) external view override returns (address) {}

    function operatorDetails(
        address operator
    ) external view override returns (OperatorDetails memory) {}

    function earningsReceiver(
        address operator
    ) external view override returns (address) {}

    function delegationApprover(
        address operator
    ) external view override returns (address) {}

    function stakerOptOutWindowBlocks(
        address operator
    ) external view override returns (uint256) {}

    function operatorShares(
        address operator,
        IStrategy strategy
    ) external view override returns (uint256) {}

    function isDelegated(
        address staker
    ) external view override returns (bool) {}

    function isOperator(
        address operator
    ) external view override returns (bool) {}

    function stakerNonce(
        address staker
    ) external view override returns (uint256) {}

    function delegationApproverSaltIsSpent(
        address _delegationApprover,
        bytes32 salt
    ) external view override returns (bool) {}

    function calculateCurrentStakerDelegationDigestHash(
        address staker,
        address operator,
        uint256 expiry
    ) external view override returns (bytes32) {}

    function calculateStakerDelegationDigestHash(
        address staker,
        uint256 _stakerNonce,
        address operator,
        uint256 expiry
    ) external view override returns (bytes32) {}

    function calculateDelegationApprovalDigestHash(
        address staker,
        address operator,
        address _delegationApprover,
        bytes32 approverSalt,
        uint256 expiry
    ) external view override returns (bytes32) {}

    function DOMAIN_TYPEHASH() external view override returns (bytes32) {}

    function STAKER_DELEGATION_TYPEHASH()
        external
        view
        override
        returns (bytes32)
    {}

    function DELEGATION_APPROVAL_TYPEHASH()
        external
        view
        override
        returns (bytes32)
    {}

    function domainSeparator() external view override returns (bytes32) {}

    function cumulativeWithdrawalsQueued(
        address staker
    ) external view override returns (uint256) {}

    function calculateWithdrawalRoot(
        Withdrawal memory withdrawal
    ) external pure override returns (bytes32) {}

    function migrateQueuedWithdrawals(
        IStrategyManager.DeprecatedStruct_QueuedWithdrawal[]
            memory withdrawalsToQueue
    ) external override {}
}
