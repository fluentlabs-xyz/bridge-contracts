const { ethers } = require("hardhat");

async function main() {
  const provider_url = "https://rpc.dev1.fluentlabs.xyz/";
  // const provider_url = "http://127.0.0.1:8545/"

  let provider = new ethers.JsonRpcProvider(provider_url);

  const privateKey = process.env.PRIVATE_KEY;
  const signer = new ethers.Wallet(privateKey, provider);
  const address = await signer.getAddress();
  console.log("Signer: ", address);

  const balanceWei = await provider.getBalance(address);

  console.log("Balance: ", balanceWei);

  const bridge = "0x6Ff08946Cef705D7bBC5deef4E56004e2365979f";
  const tokenFactory = "0xb592Ed460f5Ab1b2eF874bE5e3d0FbE6950127Da";
  const ERC20GatewayContract = await ethers.getContractFactory("ERC20Gateway");
  let erc20Gateway = await ERC20GatewayContract.connect(signer).deploy(
    bridge,
    tokenFactory,
  );

  erc20Gateway = await erc20Gateway.waitForDeployment();
  console.log("Gateway: ", erc20Gateway.target);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
