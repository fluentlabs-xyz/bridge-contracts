// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

interface IRestakerProvider {
    event Staked(address indexed staker, uint256 amount, uint256 shares);
    event Unstaked(
        address indexed staker,
        address beneficiary,
        uint256 amount,
        uint256 shares
    );

    function getMinStake() external view returns (uint256);

    function getMinUnstake() external view returns (uint256);

    function stake() external payable;

    function getLiquidityToken() external view returns (address);

    function unstake(address to, uint256 shares) external;

    function unstakeFrom(address from, address to, uint256 shares) external;
}
