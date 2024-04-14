const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

async function main() {
  let provider_url =
      "https://ethereum-holesky-rpc.publicnode.com";
      // "https://rpc2.sepolia.org";
    // "https://eth-sepolia.g.alchemy.com/v2/DBpiq0grreNG4r0wdvAUCfdGJswhIPhk";

  const privateKey = process.env.PRIVATE_KEY;
  let provider = new ethers.providers.JsonRpcProvider(provider_url);

  console.log(provider_url)
  const signer = new ethers.Wallet(privateKey, provider);

  const Token = await ethers.getContractFactory("MockERC20Token");
  let l1Token = await Token.connect(signer).attach(
    "0x341dCc885de61Ea0E75aa5FEB048D5a7a451620c",
  );
  console.log(
      "Token: ",
      l1Token.address,
      await l1Token.name(),
      await l1Token.balanceOf(await signer.getAddress()),
  );
  let l1GatewayAddress = "0xd14CF47e188f7042456CD1a0513bc4EBeB6235b2";
  // l1GatewayAddress = "0x43E9dbA5b512774D6Baf41a2c64DD8e4dcff0970";

  let nonce = await signer.getTransactionCount();
  console.log("Next transaction: ", nonce);
  let pendingNonce = await signer.getTransactionCount("pending");
  console.log("Next pending transaction: ", pendingNonce);
  const approve_tx = await l1Token.approve(l1GatewayAddress, 10000, {
    nonce,
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
