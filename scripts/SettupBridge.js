const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const {vars} = require("hardhat/config");

async function main() {
  let providerUrlL1 =
    // "https://rpc.sepolia.org/"
    "https://eth-sepolia.g.alchemy.com/v2/DBpiq0grreNG4r0wdvAUCfdGJswhIPhk";

  let providerUrlL2 = "https://rpc.dev1.fluentlabs.xyz/";
  const privateKey = vars.get("HOLESKY_PRIVATE_KEY");

  let providerL1 = new ethers.JsonRpcProvider(providerUrlL1);

  const signerL1 = new ethers.Wallet(privateKey, providerL1);

  let providerL2 = new ethers.JsonRpcProvider(providerUrlL2);
  const signerL2 = new ethers.Wallet(privateKey, providerL2);
  console.log("signer: ", await signerL1.getAddress());

  console.log(
    "Balance:",
    await providerL1.getBalance(await signerL1.getAddress()),
  );

  const RollupContract = await ethers.getContractFactory("Rollup");
  let rollup = await RollupContract.connect(signerL1).attach(
    "0xb592Ed460f5Ab1b2eF874bE5e3d0FbE6950127Da",
  );

  const BridgeContract = await ethers.getContractFactory("Bridge");
  let bridge = await BridgeContract.connect(signerL1).attach(
    "0xf70f7cADD71591e96BD696716A4A2bA6286c82e8",
  );

  console.log("Set bridge: ", bridge.target);
  let nonce = await providerL1.getTransactionCount(signerL1);

  console.log("Next transaction: ", nonce);
  let gasPrice = await providerL1.getGasPrice();
  console.log("Gas price: ", gasPrice);
  console.log("Gas price: ", gasPrice * 2);
  gasPrice = gasPrice.add(gasPrice.div(10));

  let noncePending = await providerL1.getTransactionCount(signerL1.address, "pending");
  console.log("Pending: ", noncePending);

  let setBridge = await rollup.setBridge(bridge.target, {
    nonce,
    gasLimit: 100000,
    maxPriorityFeePerGas: 6142504941n.mul(10).div(9),
  });
  console.log("Set bridge: ", setBridge);
  await setBridge.wait();

  const TokenFactoryContract =
    await ethers.getContractFactory("ERC20TokenFactory");
  let tokenFactory = await TokenFactoryContract.connect(signerL1).attach(
    "0x43E9dbA5b512774D6Baf41a2c64DD8e4dcff0970",
  );

  console.log("token factory owner: ", await tokenFactory.owner());

  nonce = await providerL1.getTransactionCount(signerL1);

  const authTx = await tokenFactory.transferOwnership(
    "0x43E9dbA5b512774D6Baf41a2c64DD8e4dcff0970",
    {
      nonce,
      // gasLimit: 100000,
      maxPriorityFeePerGas: 7142504941n.mul(3),
      maxFeePerGas: 12267313598n.mul(3),
    },
  );
  console.log("Auth tx: ", authTx);
  await authTx.wait();

  // const ERC20GatewayContract = await ethers.getContractFactory("ERC20Gateway");
  // let l1Gateway = "0x742318E6A71b400c335593cC65099aEc30EB6503"
  // let l2Gateway = "0x59Ce0cAe2987C0229D5237cEB89dD30422E9a67c"
  // let l2Implementation = "0xFE9bB7e3eb3eDBA275aF3770C0aE079cF461efd5"
  // let l2Factory = "0x639Cc9aD6917764b74A65751C1498D0B1e4CA9F3"
  // let l1Implementation = "0x6Ff08946Cef705D7bBC5deef4E56004e2365979f"
  // let l1Factory = "0x43E9dbA5b512774D6Baf41a2c64DD8e4dcff0970"

  // let tx = await ERC20GatewayContract.connect(signer).attach(l1Gateway).setOtherSide(
  //     l2Gateway,
  //     l2Implementation,
  //     l2Factory,
  //     {
  //         nonce: 28,
  //         maxPriorityFeePerGas: 7142504941n.mul(3),
  //         maxFeePerGas: 12267313598n.mul(3),
  //     }
  // );
  // console.log("TX: ", tx)
  // await tx.wait();
  let tx = await ERC20GatewayContract.connect(signerL2)
    .attach(l2Gateway)
    .setOtherSide(l1Gateway, l1Implementation, l1Factory);
  await tx.wait();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
