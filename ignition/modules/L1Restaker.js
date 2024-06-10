const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");
const {ethers} = require("ethers");
const L1Bridge = require("./L1Bridge")

const protocolConfigModule = buildModule("ProtocolConfig", (m) => {
    let owner = m.getAccount(0)
    const protocolConfig = m.contract("ProtocolConfig", [owner, owner, owner]);

    return {protocolConfig}
});

const ratioFeedModule = buildModule("RatioFeed", (m) => {
    const { protocolConfig} = m.useModule(protocolConfigModule);

	const ratioFeed = m.contract("RatioFeed", [protocolConfig, "40000"])

    m.call(protocolConfig, "setRatioFeed", [ratioFeed]);

	return {ratioFeed }
});

const liquidityTokenModule = buildModule("LiquidityToken", (m) => {
    const { protocolConfig} = m.useModule(protocolConfigModule);

	const liquidityToken= m.contract("LiquidityToken", [protocolConfig, 'Liquidity Token', 'lETH',])

    m.call(ratioFeed, "updateRatio", [liquidityToken, "1000000000000000000"])

    m.call(protocolConfig, "setLiquidityToken", [liquidityToken]);

	return {liquidityToken}
});

const restakingPoolModule = buildModule("RestakingPool", (m) => {
    const { protocolConfig} = m.useModule(protocolConfigModule)

	const restakingPool= m.contract("RestakingPool", [protocolConfig, '200000', '200000000000000000000'])

    m.call(protocolConfig, "setRestakingPool", [restakingPool]);

    m.call(restakingPool, "addRestaker", ["RESTAKER_PROVIDER"])

	return {restakingPool}
});

const feeCollectorModule = buildModule("FeeCollector", (m) => {
    const { protocolConfig} = m.useModule(protocolConfigModule);

	const feeCollector= m.contract("FeeCollector", [protocolConfig, '1500'])
	return {feeCollector}
});

const peggedTokenModule = buildModule("ERC20PeggedToken", (m) => {
	const peggedToken= m.contract("ERC20PeggedToken", [])
	return {peggedToken}
});

const tokenFactoryModule = buildModule("ERC20TokenFactory", (m) => {
    const {peggedToken} = m.useModule(peggedTokenModule);

	const tokenFactory= m.contract("ERC20TokenFactory", [peggedToken])
	return {tokenFactory}
});

const restakerGatewayModule = buildModule("RestakerGateway", (m) => {
    const module = m.useModule(L1Bridge)

    let bridge = module.bridge

    const {tokenFactory} = m.useModule(tokenFactoryModule);
    const {restakingPool} = m.useModule(restakingPoolModule);


	const restakerGateway= m.contract("RestakerGateway", [bridge, restakingPool, tokenFactory])

    m.call(tokenFactory, "transferOwnership", [restakerGateway])

	return {restakerGateway}
});

const restakerFacetsModule = buildModule("RestakerFacets", (m) => {
    let owner = m.getAccount(0)

	const restakerFacets= m.contract("RestakerFacets", [owner, "0x30770d7E3e71112d7A6b7259542D1f680a70e315", "0xdfB5f6CE42aAA7830E94ECFCcAd411beF4d4D5b6"])
	return {restakerFacets}
});

const restakerModule = buildModule("Restaker", (m) => {
	const restaker= m.contract("Restaker", [])
	return {restaker}
});

const upgradeableBeaconModule = buildModule("UpgradeableBeacon", (m) => {
    let owner = m.getAccount(0)
    const {restaker} = m.useModule(restakerModule);

	const upgradeableBeacon= m.contract("UpgradeableBeacon", [restaker, owner])
	return {upgradeableBeacon}
});

const restakerDeployerModule = buildModule("RestakerDeployer", (m) => {
    const {upgradeableBeacon} = m.useModule(upgradeableBeaconModule);
    const {restakerFacets} = m.useModule(restakerFacetsModule);
    const { protocolConfig} = m.useModule(protocolConfigModule);

	const restakerDeployer= m.contract("RestakerDeployer", [upgradeableBeacon, restakerFacets])

    m.call(protocolConfig, "setRestakerDeployer", [restakerDeployer])

	return {restakerDeployer}
});


module.exports = buildModule("L1Restaker", (m) => {

    const { protocolConfig} = m.useModule(protocolConfigModule);

    const {ratioFeed } = m.useModule(ratioFeedModule);

    const {liquidityToken} = m.useModule(liquidityTokenModule);

    const {restakingPool} = m.useModule(restakingPoolModule);

    const {feeCollector} = m.useModule(feeCollectorModule);

    const {peggedToken} = m.useModule(peggedTokenModule);

    const {tokenFactory} = m.useModule(tokenFactoryModule);

    const {restakerGateway} = m.useModule(restakerGatewayModule);

    const {restakerFacets} = m.useModule(restakerFacetsModule);

    const {restaker} = m.useModule(restakerModule);

    const {upgradeableBeacon} = m.useModule(upgradeableBeaconModule);

    const {restakerDeployer} = m.useModule(restakerDeployerModule);

    return { restakingPool, restakerGateway, protocolConfig, ratioFeed, liquidityToken, feeCollector, peggedToken, tokenFactory, restakerFacets, restaker, upgradeableBeacon, restakerDeployer };
});
