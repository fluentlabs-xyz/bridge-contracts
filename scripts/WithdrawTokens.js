const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const {vars} = require("hardhat/config");

async function main() {
  const provider_url = "https://rpc.dev1.fluentlabs.xyz/";
  // const provider_url = "http://127.0.0.1:8545/"

  const privateKey = vars.get("HOLESKY_PRIVATE_KEY");
  let provider = new ethers.JsonRpcProvider(provider_url);

  const signer = new ethers.Wallet(privateKey, provider);

  let balance = await signer.getBalance();

  console.log("Account: ", await signer.getAddress(), "balance: ", balance);

  console.log("Balance token: ");

  const Token = await ethers.getContractFactory("MockERC20Token");
  let l2Token = await Token.connect(signer)
    // .deploy(
    //     "Mock Token",
    //     "TKN",
    //     ethers.parseEther("1000000"),
    //     await signer.getAddress(),
    // )
    .attach("0x03F46a07C673d40d2119F7D87582D099EAbCaC91");

  console.log(
    "Token: ",
    l2Token.target,
    await l2Token.name(),
    await l2Token.balanceOf(await signer.getAddress()),
  );

  const l2GatewayAddress = "0xd0D2F3Dc3d4b972467C3472fc31F48823B706dDb";
  const l1GatewayAddress = "0x742318E6A71b400c335593cC65099aEc30EB6503";

  let nonce = await provider.getTransactionCount(signer.address);
  console.log("Next transaction: ", nonce);
  let pendingNonce = await provider.getTransactionCount(signer.address, "pending");
  console.log("Next pending transaction: ", pendingNonce);
  const approve_tx = await l2Token.approve(l2GatewayAddress, 100, {
    // nonce: nonce - 1,
    gasLimit: 100000,
    // maxPriorityFeePerGas: 7142504941n.mul(3),
    // maxFeePerGas: 12267313598n.mul(3),
  });
  console.log("Approve: ", approve_tx);
  await approve_tx.wait();

  console.log("Token send");
  const ERC20GatewayContract = await ethers.getContractFactory("ERC20Gateway");

  nonce = await provider.getTransactionCount(signer.address);
  let l2Gateway =
    await ERC20GatewayContract.connect(signer).attach(l2GatewayAddress);
  const send_tx = await l2Gateway.sendTokens(
    l2Token.target,
    signer.getAddress(),
    100,
    {
      nonce,
      // gasLimit: 100000,
      // maxPriorityFeePerGas: 7142504941n.mul(2),
      // maxFeePerGas: 12267313598n.mul(2),
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
