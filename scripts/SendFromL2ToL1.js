const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { expect } = require("chai");

async function main() {
  let l2Url = "https://rpc.dev1.fluentlabs.xyz/";
  // const l2Url = "http://127.0.0.1:8546/";
  let provider = new ethers.providers.JsonRpcProvider(l2Url);

  const privateKey = process.env.PRIVATE_KEY;

  const l2Signer = new ethers.Wallet(privateKey, provider);

  const mockTokenAddress = "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853";
  const l1GatewayAddress = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";
  const l2GatewayAddress = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
  const l2BridgeAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

  const ERC20GatewayContract = await ethers.getContractFactory("ERC20Gateway");
  const l2Gateway =
    ERC20GatewayContract.connect(l2Signer).attach(l2GatewayAddress);

  let peggedToken = await l2Gateway.computePeggedTokenAddress(mockTokenAddress);

  const Token = await ethers.getContractFactory("ERC20PeggedToken");
  const l2Token = Token.connect(l2Signer).attach(peggedToken);

  const approve_tx = await l2Token.approve(l2GatewayAddress, 100);
  await approve_tx.wait();

  const send_tx = await l2Gateway.sendTokens(
    l2Token.address,
    l1GatewayAddress,
    100,
  );
  let receipt = await send_tx.wait();

  const BridgeContract = await ethers.getContractFactory("Bridge");
  const l2Bridge = BridgeContract.connect(l2Signer).attach(l2BridgeAddress);

  const events = await l2Bridge.queryFilter("SentMessage", receipt.blockNumber);

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
