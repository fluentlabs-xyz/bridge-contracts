const {ethers} = require("hardhat");
const hre = require("hardhat");

class TestingCtx {
    constructor(networkName = "L1") {
        if (!["L1", "L2"].includes(networkName)) {
            throw Error(`unsupported network name ${networkName}`)
        }
        this.networkName = networkName
        this.networkConfig = hre.config.networks[networkName];
        this.provider = new ethers.providers.JsonRpcProvider(this.networkConfig.url);
        this.wallet = new ethers.Wallet.fromMnemonic(this.networkConfig.accounts.mnemonic).connect(this.provider);
        this.printDebugInfo()
    }

    static new_L1() {
        return new TestingCtx("L1")
    }

    static new_L2() {
        return new TestingCtx("L2")
    }

    printDebugInfo() {
        console.log(`${this.networkName}: debug info:`)
        console.log(`${this.networkName}: networkConfig.url: ${this.networkConfig.url}`);
        console.log(`${this.networkName}: wallet.address: ${this.wallet.address}`);
    }

    async printDebugInfoAsync() {
        console.log(`${this.networkName}: async debug info:`)
        let addresses = await this.listAddresses();
        for (let i in addresses) {
            let address = addresses[i]
            let b = await this.provider.getBalance(address);
            console.log(`address[${i}][${address}].balance=${b.toString()}`)
        }
    }

    async listAddresses() {
        return this.provider.listAccounts()
    }
}

module.exports = {
    TestingCtx
}

