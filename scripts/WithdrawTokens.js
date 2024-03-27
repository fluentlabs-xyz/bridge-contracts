const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

async function main() {
  const provider_url = "https://rpc.dev1.fluentlabs.xyz/";
  // const provider_url = "http://127.0.0.1:8545/"

  const privateKey = process.env.PRIVATE_KEY;
  let provider = new ethers.providers.JsonRpcProvider(provider_url);



  const signer = new ethers.Wallet(privateKey, provider);

  let balance = await signer.getBalance();

  console.log("Account: ", await signer.getAddress(), "balance: ", balance);

  console.log("Balance token: ");

  const Token = await ethers.getContractFactory("MockERC20Token");
  let l2Token = await Token.connect(signer)
    // .deploy(
    //     "Mock Token",
    //     "TKN",
    //     ethers.utils.parseEther("1000000"),
    //     await signer.getAddress(),
    // )
    .attach("0x3629492b992f876d20C3600bBc15077E9229D9bB");

  console.log(
    "Token: ",
    l2Token.address,
    await l2Token.name(),
    await l2Token.balanceOf(await signer.getAddress()),
  );

  const l2GatewayAddress = "0x59Ce0cAe2987C0229D5237cEB89dD30422E9a67c";
  const l1GatewayAddress = "0x742318E6A71b400c335593cC65099aEc30EB6503";

  let nonce = await signer.getTransactionCount();
  console.log("Next transaction: ", nonce);
  let pendingNonce = await signer.getTransactionCount("pending");
  console.log("Next pending transaction: ", pendingNonce);
  const approve_tx = await l2Token.approve(l2GatewayAddress, 100, {
    // nonce: nonce - 1,
    gasLimit: 100000,
    // maxPriorityFeePerGas: BigNumber.from(7142504941).mul(3),
    // maxFeePerGas: BigNumber.from(12267313598).mul(3),
  });
  console.log("Approve: ", approve_tx);
  await approve_tx.wait();

  console.log("Token send");
  const ERC20GatewayContract = await ethers.getContractFactory("ERC20Gateway");

  nonce = await signer.getTransactionCount();
  let l2Gateway =
    await ERC20GatewayContract.connect(signer).attach(l2GatewayAddress);
  const send_tx = await l2Gateway.sendTokens(
    l2Token.address,
    signer.getAddress(),
    100,
    {
      nonce,
      gasLimit: 100000,
      // maxPriorityFeePerGas: BigNumber.from(7142504941).mul(2),
      // maxFeePerGas: BigNumber.from(12267313598).mul(2),
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
