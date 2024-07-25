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

  const privateKey = vars.get("HOLESKY_PRIVATE_KEY");;
  let provider = new ethers.JsonRpcProvider(provider_url);

  console.log(provider_url);
  let signer = new ethers.Wallet(privateKey, provider);
  // signer = provider.getSigner()

  const BridgeContract = await ethers.getContractFactory("Bridge");

  let l1Bridge = await BridgeContract.connect(signer).attach(
    "0x26bDc9d2aA7BB9beE05ED737E16482D5718B02c3",
  );

  const RestakingPoolContract =
    await ethers.getContractFactory("RestakingPool");

  // let restakingPool = await RestakingPoolContract.connect(signer).attach("0x9A676e781A523b5d0C0e43731313A708CB607508");
  let restakingPool = await RestakingPoolContract.connect(signer).attach(
    "0xf9Fe45dfcba217a1E814C6b74139A54588d6A606",
  );

  // const RestakerGatewayAddress = "0x3Aa5ebB10DC797CAC828524e59A333d0A371443c";
  const RestakerGatewayAddress = "0xE3d5738aB4efF84eFC0A69cD852b63498159674a";

  let nonce = await provider.getTransactionCount(signer.address);
  console.log("Next transaction: ", nonce);
  let pendingNonce = await provider.getTransactionCount(signer.address, "pending");
  console.log("Next pending transaction: ", pendingNonce);

  console.log("Token send");
  const RestakerGateway = await ethers.getContractFactory("RestakerGateway");

  nonce = await provider.getTransactionCount(signer.address);
  let restakerGateway = await RestakerGateway.connect(signer).attach(
    RestakerGatewayAddress,
  );

  let minStake = await restakingPool.getMinStake();
  console.log("Min stake: ", minStake);

  const send_tx = await restakerGateway.sendRestakedTokens(
    await signer.getAddress(),
    {
      value: ethers.parseEther("1"),
      gasLimit: 300000,
      nonce,
    },
  );

  console.log(send_tx);

  let receipt = await send_tx.wait();

  const events = await l1Bridge.queryFilter("SentMessage", receipt.blockNumber);

  expect(events.length).to.equal(1);

  const sentEvent = events[0];

  let sendMessageHash = sentEvent.args["messageHash"];

  console.log("Message hash", sendMessageHash);
  console.log("Event", sentEvent);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
