const { ethers } = require("hardhat");
const { expect } = require("chai");

async function main() {
  let l1Url =
    // "https://eth-sepolia.g.alchemy.com/v2/DBpiq0grreNG4r0wdvAUCfdGJswhIPhk"
    "https://ethereum-holesky-rpc.publicnode.com";
  // l1Url = "http://127.0.0.1:8545/";
  let provider = new ethers.JsonRpcProvider(l1Url);
  const privateKey = process.env.PRIVATE_KEY;

  const l1Signer = new ethers.Wallet(privateKey, provider);

  const l1GatewayAddress = "0xE3d5738aB4efF84eFC0A69cD852b63498159674a";

  const RestakerGateway = await ethers.getContractFactory("RestakerGateway");
  const l1RestakerGateway =
    RestakerGateway.connect(l1Signer).attach(l1GatewayAddress);

  let restakingPool = await l1RestakerGateway.restakerPool();
  console.log("Restaking Pool: ", restakingPool);

  const send_tx = await l1RestakerGateway.sendRestakedTokens(l1Signer.target, {
    value: ethers.parseEther("10"),
  });
  let receipt = await send_tx.wait();

  console.log(receipt);
  // const events = await l1Bridge.queryFilter(
  //     "SentMessage",
  //     receipt.blockNumber,
  // );

  expect(events.length).to.equal(1);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
