const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");
const {ethers} = require("ethers");

module.exports = buildModule("L1Bridge", (m) => {
    let owner = m.getAccount(0)

    const protocolConfig = m.contract("ProtocolConfig", []);
    const ratioFeed = m.contract("RatioFeed", [protocolConfig, "40000"]);

    m.call(protocolConfig, "setRatioFeed", ratioFeed);

    const liquidityToken= m.contract("LiquidityToken", []);

    m.call(ratioFeed, liquidityToken, "1000000000000000000")

    const bridge = m.contract("Bridge", [owner, rollup])
    const tokenFactory = m.contract("ERC20TokenFactory", [peggedToken])
    const erc20Gateway = m.contract("ERC20Gateway", [bridge, tokenFactory])

    m.call(tokenFactory, "transferOwnership", [erc20Gateway])

    m.call(rollup, "setBridge", [bridge])

    return { bridge, erc20Gateway, mockToken };
});
