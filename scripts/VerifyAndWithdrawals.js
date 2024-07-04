const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { expect } = require("chai");
const fs = require("fs");
const {vars} = require("hardhat/config");

async function main() {

  let sig = await ethers.getSigners()

  console.log("Signer", sig[0].address, sig)

  let balance = await ethers.provider.getBalance(sig[0].address)

  console.log("Balance:", balance)
  return


  let provider_url =
    // "https://rpc2.sepolia.org";
    // "https://eth-mainnet.g.alchemy.com/v2/demo"
    "https://ethereum-holesky-rpc.publicnode.com";
  // "https://eth-sepolia.g.alchemy.com/v2/DBpiq0grreNG4r0wdvAUCfdGJswhIPhk";
  // provider_url = "http://127.0.0.1:8545/"

  const privateKey = vars.get("HOLESKY_PRIVATE_KEY");
  let provider = new ethers.JsonRpcProvider(provider_url);

  console.log(provider_url);
  let signer = new ethers.Wallet(privateKey, provider);
  // signer = provider.getSigner()

  // const contractAddress = "0x91E677b07F7AF907ec9a428aafA9fc14a0d3A338";
  const contractAddress = "0xe548a25B140eeaeaa1131c3c3540dE9413575F88";
  let abiPath =
    "./artifacts/contracts/restaker/interfaces/IEigenPod.sol/IEigenPod.json";
  let abi = JSON.parse(fs.readFileSync(abiPath)).abi;

  // Create a contract instance
  const eigenPod = new ethers.Contract(contractAddress, abi, signer);

  // let pubkeyHash = await eigenPod.validatorPubkeyHashToInfo("0x99d3e32bc20da28a06258164022305e401aa40ca6cc594ddf102330731ac97c32a106ea43908f7b259bcc71c348056b9")
  //
  // console.log("Pubkey hash: ", pubkeyHash)

  let owner = await eigenPod.podOwner();

  console.log("Pod owner: ", owner);

  let manager = await eigenPod.eigenPodManager();
  // let manager = "0x91E677b07F7AF907ec9a428aafA9fc14a0d3A338"

  console.log("Manager: ", manager);

  const restakerAddress = "0x7f013977819733eD51a10772fA62CdA357715174";
  abiPath =
    "./artifacts/contracts/restaker/restaker/Restaker.sol/Restaker.json";
  abi = JSON.parse(fs.readFileSync(abiPath)).abi;

  // Create a contract instance
  const restaker = new ethers.Contract(restakerAddress, abi, signer);

  abiPath =
    "./artifacts/contracts/restaker/interfaces/IEigenPodManager.sol/IEigenPodManager.json";
  abi = JSON.parse(fs.readFileSync(abiPath)).abi;

  let restakerOwner = await restaker.owner();
  console.log("RestakerOwner: ", restakerOwner);

  // Create a contract instance
  const eigenPodManager = new ethers.Contract(manager, abi, signer);

  console.log("This");
  let beaconOracle = await eigenPodManager.beaconChainOracle();
  console.log("Beacon Oracle: ", beaconOracle);

  // let blockRoot = await eigenPodManager.getBlockRootAtTimestamp(1715448152)
  // https://holesky.etherscan.io/tx/0xa75c3b68a54555016089e9f1d383034cb6dad4e46493cb595e6cfef43b3a0204#eventlog
  let blockRoot = await eigenPodManager.getBlockRootAtTimestamp(1716522156);

  console.log("Block root: ", blockRoot);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
