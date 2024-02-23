const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

async function main() {
  const provider_url = "https://rpc.dev1.fluentlabs.xyz/";
  // const provider_url = "http://127.0.0.1:8545/"

  let provider = new ethers.providers.JsonRpcProvider(provider_url);

  const privateKey = process.env.PRIVATE_KEY;
  const signer = new ethers.Wallet(privateKey, provider);
  const address = await signer.getAddress();
  console.log("Signer: ", address);

  const balanceWei = await provider.getBalance(address);

  console.log("Balance: ", balanceWei);

  const bridgeAddress = "0x93d0Efe8d5199E87d8545710abC22d29594bBfEd";
  // const bridgeAddress = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

  const BridgeContract = await ethers.getContractFactory("Bridge");

  const l2Bridge = await BridgeContract.connect(signer).attach(bridgeAddress);

  console.log("Bridge auth: ", await l2Bridge.bridgeAuthority());

  // let t = await l2Bridge.receivedMessage("0x93d0Efe8d5199E87d8545710abC22d29594bBfEd111111111111111111111111")
  // console.log(t)
  let nonce = await signer.getTransactionCount();
  console.log("Next transaction: ", nonce);
  let pendingNonce = await signer.getTransactionCount("pending");
  console.log("Next pending transaction: ", pendingNonce);

  const receive_tx = await l2Bridge.receiveMessage(
    "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
    "0x59Ce0cAe2987C0229D5237cEB89dD30422E9a67c",
    BigNumber.from(0),
    BigNumber.from(0),
    "0x2ec00a1a000000000000000000000000a513e6e4b8f2a923d98304ec87f64353c4d5c8530000000000000000000000005845fdb84280b65d2e80518815d132bb51026338000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266000000000000000000000000f39fd6e51aad88f6f4ce6ab8827279cfffb92266000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000000003544b4e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a4d6f636b20546f6b656e00000000000000000000000000000000000000000000",
    {
      nonce,
    },
  );

  console.log(receive_tx);
  await receive_tx.wait();

  console.log(receive_tx);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
