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

import {ERC20Gateway} from "./ERC20Gateway.sol";

contract RestakerGateway is Ownable, ERC20Gateway {
    address public restakerContract;
    address public liquidityToken;

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
        address _bridgeContract,
        address _restakerPoolContract,
        address _tokenFactory
    ) payable ERC20Gateway(_bridgeContract, _tokenFactory) {
        restakerContract = _restakerPoolContract;
    }

    function setLiquidityToken(
        address _liquidityToken
    ) external payable onlyOwner {
        liquidityToken = _liquidityToken;
    }

    function sendRestakedTokens(address to) external payable {
        address tokenContract = IRestaker(restakerContract).getLiquidityToken();

        IERC20 token = IERC20(tokenContract);

        uint256 stakedAmount = msg.value;

        uint256 balanceBefore = token.balanceOf(address(this));
        IRestaker(restakerContract).stake{value: stakedAmount}();
        uint256 mintedTokens = token.balanceOf(address(this)) - balanceBefore;

        sendTokensFrom(
            IRestaker(restakerContract).getLiquidityToken(),
            msg.sender,
            address(this),
            to,
            mintedTokens,
            0
        );

        emit TokensRestaked(msg.sender, stakedAmount, mintedTokens);
    }

    function sendUnstakingTokens(address to, uint256 _amount) external payable {
        address pegged_token = ERC20TokenFactory(tokenFactory)
            .computePeggedTokenAddress(address(this), liquidityToken);

        (address originGateway, address originAddress) = ERC20PeggedToken(
            pegged_token
        ).getOrigin();
        require(
            originAddress == liquidityToken,
            "wrong pegged token calculation"
        );

        ERC20PeggedToken(pegged_token).burn(msg.sender, _amount);

        bytes memory _message = abi.encodeCall(
            RestakerGateway.receiveUnstakingTokens,
            (msg.sender, to, _amount)
        );

        IBridge(bridgeContract).sendMessage{value: msg.value}(
            otherSide,
            _message
        );
    }

    function receiveUnstakingTokens(
        address _from,
        address _to,
        uint256 _amount
    ) external payable onlyBridgeSender {
        address tokenContract = IRestaker(restakerContract).getLiquidityToken();
        ILiquidityToken token = ILiquidityToken(tokenContract);

        uint256 shares = token.convertToShares(_amount);
        IRestaker(restakerContract).unstakeFrom(address(this), _to, shares);

        emit TokensUnstaked(_to, _amount, shares);
    }
}
