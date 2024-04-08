const { ethers } = require("hardhat");

async function main() {
  const provider_url = "https://rpc.dev1.fluentlabs.xyz/";
  // const provider_url = "http://127.0.0.1:8546/"

  let provider = new ethers.providers.JsonRpcProvider(provider_url);

  const privateKey = process.env.PRIVATE_KEY;
  const signer = new ethers.Wallet(privateKey, provider);

  await deployL2(provider, signer);
}

async function deployL2(provider, signer) {
  const address = await signer.getAddress();
  console.log("Signer: ", address);

  const balanceWei = await provider.getBalance(address);

  console.log("Balance: ", balanceWei);

  const PeggedToken = await ethers.getContractFactory("ERC20PeggedToken");
  let peggedToken = await PeggedToken.connect(signer).deploy();
  await peggedToken.deployed();
  console.log("Pegged token: ", peggedToken.address);

  const BridgeContract = await ethers.getContractFactory("Bridge");

  let rollupAddress = "0x0000000000000000000000000000000000000000";
  let bridge = await BridgeContract.connect(signer).deploy(
    signer.getAddress(),
    rollupAddress,
  );
  await bridge.deployed();
  console.log("Bridge: ", bridge.address);

  const TokenFactoryContract =
    await ethers.getContractFactory("ERC20TokenFactory");
  let tokenFactory = await TokenFactoryContract.connect(signer).deploy(
    peggedToken.address,
  );
  await tokenFactory.deployed();
  console.log("TokenFactory: ", tokenFactory.address);

  const ERC20GatewayContract = await ethers.getContractFactory("ERC20Gateway");
  let erc20Gateway = await ERC20GatewayContract.connect(signer).deploy(
    bridge.address,
    tokenFactory.address,
  );

  console.log("token factory owner: ", await tokenFactory.owner());
  const authTx = await tokenFactory.transferOwnership(erc20Gateway.address);
  await authTx.wait();
  console.log("token factory owner: ", await tokenFactory.owner());

  await erc20Gateway.deployed();
  console.log("Gateway: ", erc20Gateway.address);

  return {
    bridge: bridge.address,
    erc20Gateway: erc20Gateway.address,
    peggedToken: peggedToken.address,
    tokenFactory: tokenFactory.address,
  };
}

module.exports = deployL2;
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
