const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

async function main() {
  let provider_url = "https://ethereum-holesky-rpc.publicnode.com";
  // "https://rpc2.sepolia.org";
  // "https://eth-sepolia.g.alchemy.com/v2/DBpiq0grreNG4r0wdvAUCfdGJswhIPhk";

  const privateKey = process.env.PRIVATE_KEY;
  let provider = new ethers.JsonRpcProvider(provider_url);

  console.log(provider_url);
  const signer = new ethers.Wallet(privateKey, provider);

  const Token = await ethers.getContractFactory("MockERC20Token");
  let l1Token = await Token.connect(signer).attach(
    "0x67819bCe329D960c3aC619c134249E6805a3695C",
  );
  console.log(
    "Token: ",
    l1Token.target,
    await l1Token.name(),
    await l1Token.balanceOf(await signer.getAddress()),
  );
  let l1GatewayAddress = "0x44ff07abac78f647FB5f3F3D7EBaCE9A7ff0c69B";
  // l1GatewayAddress = "0x43E9dbA5b512774D6Baf41a2c64DD8e4dcff0970";

  let nonce = await provider.getTransactionCount(signer.address);
  console.log("Next transaction: ", nonce);
  let pendingNonce = await provider.getTransactionCount(signer.address, "pending");
  console.log("Next pending transaction: ", pendingNonce);
  const approve_tx = await l1Token.approve(l1GatewayAddress, 10000, {
    nonce,
  });
  console.log("Approve: ", approve_tx);
  await approve_tx.wait();

  console.log("Token send");
  const ERC20GatewayContract = await ethers.getContractFactory("ERC20Gateway");

  nonce = await provider.getTransactionCount(signer.address);
  let l1Gateway =
    await ERC20GatewayContract.connect(signer).attach(l1GatewayAddress);
  const send_tx = await l1Gateway.sendTokens(
    l1Token.target,
    await signer.getAddress(),
    10000,
    {
      nonce,
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
