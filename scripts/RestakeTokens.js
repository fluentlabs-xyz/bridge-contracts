const { ethers } = require("hardhat");
const { expect } = require("chai");

async function main() {
  // let l1Url = "https://eth-sepolia.g.alchemy.com/v2/DBpiq0grreNG4r0wdvAUCfdGJswhIPhk"
  const l1Url = "http://127.0.0.1:8545/";
  let provider = new ethers.providers.JsonRpcProvider(l1Url);
  const privateKey = process.env.PRIVATE_KEY;

  const l1Signer = new ethers.Wallet(privateKey, provider);

  const mockTokenAddress = "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853";
  const l1GatewayAddress = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";

  const Token = await ethers.getContractFactory("MockERC20Token");
  const l1Token = Token.connect(l1Signer).attach(mockTokenAddress);

  const approve_tx = await l1Token.approve(l1GatewayAddress, 100);
  await approve_tx.wait();

  const RestakerGateway = await ethers.getContractFactory("RestakerGateway");
  const l1RestakerGateway =
      RestakerGateway.connect(l1Signer).attach(l1GatewayAddress);

  const send_tx = await l1RestakerGateway.sendRestakedTokens(
      l2Gateway.signer.getAddress(),
      {
        value: "10000"
      },
  );
  console.log("Token sent", liquidityToken.address);
  let receipt = await send_tx.wait();

  const events = await l1Bridge.queryFilter(
      "SentMessage",
      receipt.blockNumber,
  );

  expect(events.length).to.equal(1);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
