// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {IBridge} from "./interfaces/IBridge.sol";
import {IERC20Gateway} from "./interfaces/IERC20Gateway.sol";
import {ERC20PeggedToken} from "./ERC20PeggedToken.sol";
import {ERC20TokenFactory} from "./ERC20TokenFactory.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IRestaker} from "./interfaces/IRestaker.sol";
import {ILiquidityToken} from "./interfaces/ILiquidityToken.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "hardhat/console.sol";

contract RestakerGateway is Ownable {
    modifier onlyBridgeSender() {
        require(msg.sender == bridgeContract, "call only from bridge");
        _;
    }

    address public erc20GatewayContract;
    address public restakerContract;
    address public bridgeContract;

    event TokensRestaked(
        address _staker,
        uint256 _stakedAmount,
        uint256 _mintedLiqudityToken
    );

    event TokensUnstaked(
        address _staker,
        uint256 _stakedAmount,
        uint256 _mintedLiqudityToken
    );

    constructor(
        address _erc20GatewayContract,
        address _restakerPoolContract,
        address _bridgeContract
    ) payable Ownable(msg.sender) {
        erc20GatewayContract = _erc20GatewayContract;
        restakerContract = _restakerPoolContract;
        bridgeContract = _bridgeContract;
    }

    function sendRestakedTokens(address to) external payable {
        address tokenContract = IRestaker(restakerContract)
            .getLiquidityToken();

        IERC20 token = IERC20(tokenContract);

        uint256 stakedAmount = msg.value;


        console.log(tokenContract);
        console.log(restakerContract);
        uint256 balanceBefore = token.balanceOf(address(this));
        IRestaker(restakerContract).stake{value: stakedAmount}();
        uint256 mintedTokens = token.balanceOf(address(this)) - balanceBefore;

        token.approve(erc20GatewayContract, mintedTokens);

        IERC20Gateway(erc20GatewayContract).sendTokens(
            IRestaker(restakerContract).getLiquidityToken(),
            to,
            mintedTokens
        );

        emit TokensRestaked(msg.sender, stakedAmount, mintedTokens);
    }

    function receiveRestakedTokens(
        address _from,
        address _to,
        uint256 _amount
    ) external payable onlyBridgeSender {
        address tokenContract = IRestaker(restakerContract)
            .getLiquidityToken();
        ILiquidityToken token = ILiquidityToken(tokenContract);

        uint256 balanceBefore = token.balanceOf(address(this));
        IERC20Gateway(erc20GatewayContract).receiveNativeTokens(
            tokenContract,
            _from,
            address(this),
            _amount
        );
        uint256 unstakedTokens = token.balanceOf(address(this)) - balanceBefore;
        uint256 shares = token.convertToShares(_amount);
        IRestaker(restakerContract).unstake(_to, shares);

        emit TokensUnstaked(_to, _amount, shares);
    }
}
