// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {IBridge} from "./IBridge.sol";

import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

interface IERC20Gateway {
    event ReceivedTokens(address target, uint256 amount);

    function sendTokens(
        address _token,
        address _to,
        uint256 _amount
    ) external payable;

    function receiveNativeTokens(
        address _nativeToken,
        address _from,
        address _to,
        uint256 _amount
    ) external payable;

    function receivePeggedTokens(
        address _originToken,
        address _peggedToken,
        address _from,
        address _to,
        uint256 _amount,
        bytes calldata _tokenMetadata
    ) external payable;
}
