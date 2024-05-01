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
            url: `http://${consts.FLUENT_HOST}:${consts.FLUENT_NODE_PORT}`,
        },
        L2: {
            url: `http://${consts.EVM_HOST}:${consts.EVM_NODE_PORT}`,
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
