const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

async function main() {
  let provider_url =
    "https://eth-sepolia.g.alchemy.com/v2/DBpiq0grreNG4r0wdvAUCfdGJswhIPhk";
  // const provider_url = "http://127.0.0.1:8545/"

  const privateKey = process.env.PRIVATE_KEY;
  let provider = new ethers.providers.JsonRpcProvider(provider_url);

  const signer = new ethers.Wallet(privateKey, provider);

  const Token = await ethers.getContractFactory("MockERC20Token");
  let l1Token = await Token.connect(signer).attach(
    "0xD61e2a971EEC09cCdDc0c89217dd6D2e49017685",
  );

  const l1GatewayAddress = "0x742318E6A71b400c335593cC65099aEc30EB6503";
  const l2GatewayAddress = "0x59Ce0cAe2987C0229D5237cEB89dD30422E9a67c";

  let nonce = await signer.getTransactionCount();
  console.log("Next transaction: ", nonce);
  let pendingNonce = await signer.getTransactionCount("pending");
  console.log("Next pending transaction: ", pendingNonce);
  const approve_tx = await l1Token.approve(l1GatewayAddress, 100, {
    nonce,
    gasLimit: 100000,
    // maxPriorityFeePerGas: BigNumber.from(7142504941).mul(3),
    // maxFeePerGas: BigNumber.from(12267313598).mul(3),
  });
  console.log("Approve: ", approve_tx);
  await approve_tx.wait();

  console.log("Token send");
  const ERC20GatewayContract = await ethers.getContractFactory("ERC20Gateway");

  nonce = await signer.getTransactionCount();
  let l1Gateway =
    await ERC20GatewayContract.connect(signer).attach(l1GatewayAddress);
  const send_tx = await l1Gateway.sendTokens(
    l1Token.address,
    await signer.getAddress(),
    100,
    {
      gasLimit: 1000000,
      nonce,
      // maxPriorityFeePerGas: BigNumber.from(21427514823).mul(3),
      // maxFeePerGas: BigNumber.from(36801940794).mul(3),
    },
  );

  console.log(send_tx);

  await send_tx.wait();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
