// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ILiquidityToken} from "../restaker/interfaces/ILiquidityToken.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockLiquidityToken is ILiquidityToken, ERC20 {
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address supplyTarget
    ) ERC20(name, symbol) {
        _mint(supplyTarget, initialSupply);
    }

    address public restaker;

    modifier onlyRestaker() {
        require(msg.sender == restaker, "call only from restaker");
        _;
    }

    function setRestaker(address _restaker) external {
        restaker = _restaker;
    }

    function convertToShares(
        uint256 amount
    ) external view returns (uint256 shares) {
        return amount;
    }

    function convertToAmount(
        uint256 shares
    ) external view returns (uint256 amount) {
        return shares;
    }

    function mint(
        address account,
        uint256 shares
    ) external override onlyRestaker {
        _mint(account, shares);
    }

    function burn(
        address account,
        uint256 shares
    ) external override onlyRestaker {
        _burn(account, shares);
    }

    function ratio() external view returns (uint256) {
        return 1;
    }

    function totalAssets() external view returns (uint256 totalManagedEth) {
        return 0;
    }
}
