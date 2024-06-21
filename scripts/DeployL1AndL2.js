const { ethers } = require("hardhat");

const deployL1 = require("./DeployL1");
const deployL2 = require("./DeployL2");

async function main() {
  // const l1Url= "http://127.0.0.1:8545/nonce"
  let l1Url =
    "https://eth-sepolia.g.alchemy.com/v2/DBpiq0grreNG4r0wdvAUCfdGJswhIPhk";
  let l1Provider = new ethers.JsonRpcProvider(l1Url);
  // const l2Url= "http://127.0.0.1:8545/"
  const l2Url = "https://rpc.dev1.fluentlabs.xyz/";
  let l2Provider = new ethers.JsonRpcProvider(l2Url);

  const privateKey =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

  const l1Signer = new ethers.Wallet(privateKey, l1Provider);
  const l2Signer = new ethers.Wallet(privateKey, l2Provider);

  console.log("Deploy L1 contracts:");
  let {
    bridge: l1Bridge,
    _rollup,
    erc20Gateway: l1Gateway,
    peggedToken: l1Implementation,
    tokenFactory: l1Factory,
  } = await deployL1(l1Provider, l1Signer);
  console.log("Deploy L2 contracts:");
  let {
    bridge: l2Bridge,
    erc20Gateway: l2Gateway,
    peggedToken: l2Implementation,
    tokenFactory: l2Factory,
  } = await deployL2(l2Provider, l2Signer);

  const Token = await ethers.getContractFactory("MockERC20Token");
  let l1Token = await Token.connect(l1Signer).deploy(
    "Mock Token",
    "TKN",
    ethers.parseEther("1000000"),
    await l1Signer.getAddress(),
  );
  l1Token = await l1Token.waitForDeployment();
  console.log("l1token: ", l1Token.target);

  const ERC20GatewayContract = await ethers.getContractFactory("ERC20Gateway");
  let tx = await ERC20GatewayContract.connect(l1Signer)
    .attach(l1Gateway)
    .setOtherSide(l2Gateway, l2Implementation, l2Factory);
  await tx.wait();
  tx = await ERC20GatewayContract.connect(l2Signer)
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
