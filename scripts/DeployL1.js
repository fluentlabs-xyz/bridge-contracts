const { ethers } = require("hardhat");

async function main() {
  // let provider_url =
  //   "https://eth-sepolia.g.alchemy.com/v2/DBpiq0grreNG4r0wdvAUCfdGJswhIPhk";
  const provider_url = "http://127.0.0.1:8545/";

  const privateKey = process.env.PRIVATE_KEY;
  let provider = new ethers.providers.JsonRpcProvider(provider_url);

  const signer = new ethers.Wallet(privateKey, provider);

  await deployL1(provider, signer);
}

async function estimate_gas(provider, contract) {
  const gasPrice = await provider.getGasPrice();

  // Estimate gas limit
  const gasLimit = await contract.deployTransaction.gasLimit;

  // Calculate deployment cost
  return ethers.utils.formatEther(gasLimit.mul(gasPrice));
}

async function deployL1(provider, signer) {
  const address = await signer.getAddress();
  console.log("Signer: ", address);

  const balanceWei = await provider.getBalance(address);

  console.log("Balance: ", balanceWei);

  const Token = await ethers.getContractFactory("MockERC20Token");
  let l1Token = await Token.connect(signer).deploy(
    "Mock Token",
    "TKN",
    ethers.utils.parseEther("1000000"),
    await signer.getAddress(),
  );
  await l1Token.deployed();

  const gasPrice = await ethers.provider.getGasPrice();

  const PeggedToken = await ethers.getContractFactory("ERC20PeggedToken");
  let peggedToken = await PeggedToken.connect(signer).deploy();
  let tx = await peggedToken.deployed();

  // console.log("Contract: ", tx);

  console.log(await estimate_gas(provider, peggedToken));

  // let peggedToken = await PeggedToken.connect(signer).attach("0x6Ff08946Cef705D7bBC5deef4E56004e2365979f");
  console.log("Pegged token: ", peggedToken.address);
  const BridgeContract = await ethers.getContractFactory("Bridge");

  const RollupContract = await ethers.getContractFactory("Rollup");
  let rollup = await RollupContract.connect(signer).deploy();
  await rollup.deployed();

  console.log(await estimate_gas(provider, rollup));
  // let rollup = await RollupContract.connect(signer).attach("0xb592Ed460f5Ab1b2eF874bE5e3d0FbE6950127Da");

  let rollupAddress = rollup.address;
  console.log("Rollup address: ", rollupAddress);

  let bridge = await BridgeContract.connect(signer).deploy(
    signer.getAddress(),
    rollupAddress,
  );
  await bridge.deployed();

  console.log(await estimate_gas(provider, bridge));
  // let bridge = await BridgeContract.connect(signer).attach("0xf70f7cADD71591e96BD696716A4A2bA6286c82e8");
  console.log("Bridge: ", bridge.address);

  let setBridge = await rollup.setBridge(bridge.address);
  await setBridge.wait();

  const TokenFactoryContract =
    await ethers.getContractFactory("ERC20TokenFactory");

  let tokenFactory = await TokenFactoryContract.connect(signer).deploy(
    peggedToken.address,
  );
  await tokenFactory.deployed();
  console.log("TokenFactory: ", tokenFactory.address);

  console.log(await estimate_gas(provider, tokenFactory));
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

  console.log(await estimate_gas(provider, erc20Gateway));
  return {
    bridge: bridge.address,
    erc20Gateway: erc20Gateway.address,
    rollup: rollup.address,
    peggedToken: peggedToken.address,
    tokenFactory: tokenFactory.address,
  };
}

module.exports = deployL1;

// main()
//   .then(() => process.exit(0))
//   .catch((error) => {
//     console.error(error);
//     process.exit(1);
//   });
