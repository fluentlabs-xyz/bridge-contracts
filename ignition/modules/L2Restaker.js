const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");
const {ethers} = require("ethers");
const L2Bridge = require("./L2Bridge")


const peggedTokenModule = buildModule("L2RestakingERC20PeggedToken", (m) => {
	const peggedToken= m.contract("ERC20PeggedToken", [])
	return {peggedToken}
});

const tokenFactoryModule = buildModule("L2RestakingERC20TokenFactory", (m) => {
    const {peggedToken} = m.useModule(peggedTokenModule)

	const tokenFactory= m.contract("ERC20TokenFactory", [peggedToken])
	return {tokenFactory}
});

const restakerGatewayModule = buildModule("L2RestakerGateway", (m) => {
    const module = m.useModule(L2Bridge)

    let bridge = module.bridge

    const {tokenFactory} = m.useModule(tokenFactoryModule)

	const restakerGateway= m.contract("RestakerGateway", [bridge, "0x0000000000000000000000000000000000000000", tokenFactory])

    m.call(tokenFactory, "transferOwnership", [restakerGateway])

	return {restakerGateway}
});



module.exports = buildModule("L2Restaker", (m) => {

    const {peggedToken} = m.useModule(peggedTokenModule)
    const {tokenFactory} = m.useModule(tokenFactoryModule)
    const {restakerGateway} = m.useModule(restakerGatewayModule)

    return { peggedToken, tokenFactory, restakerGateway };
});
