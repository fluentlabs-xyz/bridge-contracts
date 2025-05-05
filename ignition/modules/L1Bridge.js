const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");
const {ethers} = require("ethers");

const mockTokenModule = buildModule("mockToken", (m) => {
    let owner = m.getAccount(0)
    
    const mockToken = m.contract("MockERC20Token",  [
        "Mock Token", "TKN", ethers.parseEther("1000000"), owner
    ]);

    return {mockToken}
});

const peggedTokenModule = buildModule("peggedToken", (m) => {
    const peggedToken = m.contract("ERC20PeggedToken", []);

    return {peggedToken}
});

const rollupModule = buildModule("BatchRollup", (m) => {
	const rollup = m.contract("BatchRollup", [0,0,0,"0x0000000000000000000000000000000000000000"])

	return {rollup};
});

const bridgeModule = buildModule("Bridge", (m) => {
    let owner = m.getAccount(0)

    const {rollup} = m.useModule(rollupModule);
	const bridge = m.contract("Bridge", [owner, rollup])

    m.call(rollup, "setBridge", [bridge])

	return {bridge}
});
const tokenFactoryModule = buildModule("ERC20TokenFactory", (m) => {

    const {peggedToken} = m.useModule(peggedTokenModule)

	const tokenFactory = m.contract("ERC20TokenFactory", [peggedToken])

	return {tokenFactory}
});
const erc20GatewayModule = buildModule("ERC20Gateway", (m) => {
    const {bridge} = m.useModule(bridgeModule)

    const {tokenFactory} = m.useModule(tokenFactoryModule)

	const erc20Gateway = m.contract("ERC20Gateway", [bridge, tokenFactory])

    m.call(tokenFactory, "transferOwnership", [erc20Gateway])

	return {erc20Gateway}
});


module.exports = buildModule("L1Bridge", (m) => {

    const {mockToken} = m.useModule(mockTokenModule)

    const {peggedToken} = m.useModule(peggedTokenModule)

    const {rollup} = m.useModule(rollupModule);

    const {bridge} = m.useModule(bridgeModule)

    const {tokenFactory} = m.useModule(tokenFactoryModule)

    const {erc20Gateway} = m.useModule(erc20GatewayModule)

    return { bridge, erc20Gateway, mockToken, rollup, peggedToken, tokenFactory };

});
