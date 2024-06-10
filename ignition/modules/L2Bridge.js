const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");
const {ethers} = require("ethers");

const peggedTokenModule = buildModule("peggedToken", (m) => {
    const peggedToken = m.contract("ERC20PeggedToken", []);

    return {peggedToken}
});


const bridgeModule = buildModule("Bridge", (m) => {
    let owner = m.getAccount(0)

    const bridge = m.contract("Bridge", [owner, "0x0000000000000000000000000000000000000000"])

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


module.exports = buildModule("L2Bridge", (m) => {
    const {peggedToken} = m.useModule(peggedTokenModule)

    const {rollup} = m.useModule(rollupModule);

    const {bridge} = m.useModule(bridgeModule)

    const {tokenFactory} = m.useModule(tokenFactoryModule)

    const {erc20Gateway} = m.useModule(erc20GatewayModule)

    return { bridge, erc20Gateway, mockToken, rollup, peggedToken, tokenFactory };
});
