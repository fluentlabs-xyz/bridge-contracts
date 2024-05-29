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
        this.accounts = [];
        const {mnemonic, path, initialIndex, count} = this.networkConfig.accounts;
        for (let i = initialIndex; i < initialIndex + count; i++) {
            let wallet = new ethers.Wallet.fromMnemonic(mnemonic, `${path}/${i}`).connect(this.provider);
            this.accounts.push(wallet);
        }
    }

    static new_L1() {
        return new TestingCtx("L1");
    }

    static new_L2() {
        return new TestingCtx("L2");
    }

    owner() {
        const [owner] = this.accounts;
        return owner
    }

    async printDebugInfoAsync() {
        console.log(`${this.networkName}: async debug info:`)
        let addresses = this.accounts;
        for (let i in addresses) {
            let address = addresses[i].address;
            let b = await this.provider.getBalance(address);
            console.log(`address[${i}][${address}].balance=${b.toString()}`)
        }
    }

    async listAddresses() {
        return this.accounts.map(function (v) {
            return v.address;
        });
    }
}

function log(...args) {
    let datetime_str = new Date().toISOString();
    console.log(`${datetime_str}`, ...args)
}

module.exports = {
    TestingCtx,
    log
}
