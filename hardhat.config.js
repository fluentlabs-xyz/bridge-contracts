/** @type import('hardhat/config').HardhatUserConfig */
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-solhint");
require('hardhat-abi-exporter');

module.exports = {
  solidity: "0.8.20",
  networks: {
    L1: {
      url: "http://localhost:8545",
    },
    L2: {
      url: "http://localhost:8546",
    },  },
  mocha: {
    timeout: 100000,  // Set the timeout to 60 seconds
  },
};
