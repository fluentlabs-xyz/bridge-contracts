/** @type import('hardhat/config').HardhatUserConfig */
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-solhint");
require('hardhat-abi-exporter');
helpers = require('./helpers')

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
        hardhat: {
            blockGasLimit: 300_000_000,
        },
        L1: {
            url: `${helpers.evm_provider_url()}`,
            accounts: {
                mnemonic: "test test test test test test test test test test test junk",
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
                passphrase: "",
            },
        },
        L2: {
            url: `${helpers.fluent_provider_url()}`,
            accounts: {
                mnemonic: "test test test test test test test test test test test junk",
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
                passphrase: "",
            },
            chainId: 1337,
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
