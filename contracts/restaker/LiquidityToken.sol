// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "./Configurable.sol";
import "./interfaces/ILiquidityToken.sol";
import "hardhat/console.sol";


contract LiquidityToken is Configurable, ERC20, ILiquidityToken {
    using Math for uint256;

    uint256[50] private __gap;

    constructor(
        IProtocolConfig config,
        string memory name,
        string memory symbol
    ) ERC20(name, symbol){
        __Configurable_init(config);
    }


    function mint(
        address account,
        uint256 shares
    ) external override  onlyRestakingPool {
        _mint(account, shares);
    }

    function burn(
        address account,
        uint256 shares
    ) external override  onlyRestakingPool {
        _burn(account, shares);
    }

    function convertToAmount(
        uint256 shares
    ) public view override returns (uint256) {

        return shares.mulDiv(1 ether, ratio(), Math.Rounding.Ceil);
        return 0;
    }

    function convertToShares(
        uint256 amount
    ) public view override returns (uint256) {
        return amount.mulDiv(ratio(), 1 ether, Math.Rounding.Floor);
    }

    function ratio() public view override returns (uint256) {

        return config().getRatioFeed().getRatio(address(this));
    }

    function totalAssets()
        external
        view
        override
        returns (uint256 totalManagedEth)
    {
        return convertToAmount(totalSupply());
    }
}
