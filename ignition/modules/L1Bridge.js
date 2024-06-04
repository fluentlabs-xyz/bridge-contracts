const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");
const {ethers} = require("ethers");

module.exports = buildModule("L1Bridge", (m) => {
    let owner = m.getAccount(0)

    const mockToken = m.contract("MockERC20Token",
    [
            "Mock Token", "TKN", ethers.parseEther("1000000"), owner
        ]);
    const peggedToken = m.contract("ERC20PeggedToken", []);
    const rollup= m.contract("Rollup", []);

    const bridge = m.contract("Bridge", [owner, rollup])
    const tokenFactory = m.contract("ERC20TokenFactory", [peggedToken])
    const erc20Gateway = m.contract("ERC20Gateway", [bridge, tokenFactory])

    m.call(tokenFactory, "transferOwnership", [erc20Gateway])

    m.call(rollup, "setBridge", [bridge])

    return { bridge, erc20Gateway, mockToken };
});
