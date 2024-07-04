const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { expect } = require("chai");
const {vars} = require("hardhat/config");

async function main() {
  let provider_url =
    // "https://rpc2.sepolia.org";
    "https://ethereum-holesky-rpc.publicnode.com";
  // "https://eth-sepolia.g.alchemy.com/v2/DBpiq0grreNG4r0wdvAUCfdGJswhIPhk";
  // provider_url = "http://127.0.0.1:8545/"

  const privateKey = vars.get("HOLESKY_PRIVATE_KEY");
  let provider = new ethers.JsonRpcProvider(provider_url);
  const signer = new ethers.Wallet(privateKey, provider);
  const RatioFeed = await ethers.getContractFactory("RatioFeed");
  let ratioFeed = await RatioFeed.connect(signer).attach(
    "0x113Ce25DA58ba766B86648454f0Eb1799ceb667C",
  );

  let ratio = await ratioFeed.getRatio(
    "0x482C209B99f2d98e788914429EFa44d45f9849E4",
  );

  console.log("Ratio: ", ratio);

  let ratio_tx = await ratioFeed.repairRatio(
    "0x482C209B99f2d98e788914429EFa44d45f9849E4",
    "1000000000000000000",
  );

  await ratio_tx.wait();

  ratio = await ratioFeed.getRatio(
    "0x482C209B99f2d98e788914429EFa44d45f9849E4",
  );

  console.log("Ratio: ", ratio);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
