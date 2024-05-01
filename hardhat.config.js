/** @type import('hardhat/config').HardhatUserConfig */
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-solhint");
require('hardhat-abi-exporter');
consts = require('./consts')

module.exports = {
    solidity: {
        version: '0.8.20',
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    networks: {
        L1: {
            url: `http://localhost:${consts.FLUENT_NODE_PORT}`,
            accounts: {
                mnemonic: "test test test test test test test test test test test junk",
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
                passphrase: "",
            },
        },
        L2: {
            url: `http://localhost:${consts.EVM_NODE_PORT}`,
            accounts: {
                mnemonic: "test test test test test test test test test test test junk",
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
                passphrase: "",
            },
        },
    },
    mocha: {
        timeout: 1000000,  // Set the timeout to 60 seconds
    },
    abiExporter: {
        path: './abi',
        clear: true,
        flat: true,
        spacing: 2
    }
};
