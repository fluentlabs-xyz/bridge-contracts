const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");
const {ethers} = require("ethers");
const L1Bridge = require("./L1Bridge")


module.exports = buildModule("L1Restaker", (m) => {

    const module = m.useModule(L1Bridge)

    let bridge = module.bridge

    let owner = m.getAccount(0)

    const protocolConfig = m.contract("ProtocolConfig", [owner, owner, owner]);
    const ratioFeed = m.contract("RatioFeed", [protocolConfig, "40000"]);

    m.call(protocolConfig, "setRatioFeed", [ratioFeed]);

    const liquidityToken= m.contract("LiquidityToken", [protocolConfig, 'Liquidity Token', 'lETH',]);

    m.call(ratioFeed, "updateRatio", [liquidityToken, "1000000000000000000"])

    m.call(protocolConfig, "setLiquidityToken", [liquidityToken]);

    const restakingPool= m.contract("RestakingPool", [protocolConfig, '200000', '200000000000000000000']);

    m.call(protocolConfig, "setRestakingPool", [restakingPool]);

    const feeCollector= m.contract("FeeCollector", [protocolConfig, '1500']);

    const peggedToken= m.contract("ERC20PeggedToken", []);

    const tokenFactory= m.contract("ERC20TokenFactory", [peggedToken]);

    const restakerGateway= m.contract("RestakerGateway", [bridge, restakingPool, tokenFactory]);

    const restakerFacets= m.contract("RestakerFacets", [owner, "0x30770d7E3e71112d7A6b7259542D1f680a70e315", "0xdfB5f6CE42aAA7830E94ECFCcAd411beF4d4D5b6"]);

    const restaker= m.contract("Restaker", []);

    const upgradeableBeacon= m.contract("UpgradeableBeacon", [restaker, owner]);

    const restakerDeployer= m.contract("RestakerDeployer", [upgradeableBeacon, restakerFacets]);

    m.call(protocolConfig, "setRestakerDeployer", [restakerDeployer])

    m.call(tokenFactory, "transferOwnership", [restakerGateway])

    m.call(restakingPool, "addRestaker", ["RESTAKER_PROVIDER"])

    return { restakingPool, restakerGateway };
});
