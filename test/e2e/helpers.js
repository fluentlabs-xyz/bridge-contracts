const {ethers} = require("hardhat");
const hre = require("hardhat");

class TestingCtx {
    constructor(networkName = "L1") {
        this.networkName = networkName
        this.networkConfig = hre.config.networks[networkName];
        this.provider = new ethers.providers.JsonRpcProvider(this.networkConfig.url);
        this.wallet = new ethers.Wallet.fromMnemonic(this.networkConfig.accounts.mnemonic).connect(this.provider);
        console.log(`${networkName}: wallet.address: ${this.wallet.address}`);
    }

    async listAddresses() {
        return this.provider.listAccounts()
    }
}

module.exports = {
    TestingCtx
}

