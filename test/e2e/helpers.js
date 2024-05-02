const {ethers} = require("hardhat");
const hre = require("hardhat");

class TestingCtx {
    constructor(network = "L1") {
        this.networkConfig = hre.config.networks[network];
        this.provider = new ethers.providers.JsonRpcProvider(this.networkConfig.url);
        this.wallet = new ethers.Wallet.fromMnemonic(this.networkConfig.accounts.mnemonic).connect(this.provider);
        console.log(`${network}: wallet.address: ${this.wallet.address}`);
    }

    async listAddresses() {
        return this.provider.listAccounts()
    }
}

module.exports = {
    TestingCtx
}

