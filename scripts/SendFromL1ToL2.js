const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const {expect} = require("chai");

async function main() {
  // let l1Url = "https://eth-sepolia.g.alchemy.com/v2/DBpiq0grreNG4r0wdvAUCfdGJswhIPhk"
  const l1Url = "http://127.0.0.1:8545/";
  let provider = new ethers.providers.JsonRpcProvider(l1Url);
  const privateKey = process.env.PRIVATE_KEY;

  const l1Signer = new ethers.Wallet(privateKey, provider);

  const mockTokenAddress = "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853";
  const l1GatewayAddress = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707"
  const l2GatewayAddress = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"
  const l1BridgeAddress = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0"

  const Token = await ethers.getContractFactory("MockERC20Token");
  const l1Token = Token.connect(l1Signer).attach(mockTokenAddress)

  const approve_tx = await l1Token.approve(l1GatewayAddress, 100);
  await approve_tx.wait();

  const ERC20GatewayContract = await ethers.getContractFactory("ERC20Gateway");
  const l1Gateway = ERC20GatewayContract.connect(l1Signer).attach(l1GatewayAddress)

  const send_tx = await l1Gateway.sendTokens(
    l1Token.address,
    l1Signer.getAddress(),
    100,
  );
  let receipt = await send_tx.wait();

  const BridgeContract = await ethers.getContractFactory("Bridge");
  const l1Bridge = BridgeContract.connect(l1Signer).attach(l1BridgeAddress)

  const events = await l1Bridge.queryFilter(
      "SentMessage",
      receipt.blockNumber,
  );

  expect(events.length).to.equal(1);

  const sentEvent = events[0];

  console.log("Sent event: ", sentEvent.args["messageHash"]);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
