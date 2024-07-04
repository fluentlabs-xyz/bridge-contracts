const { ethers } = require("hardhat");

const deployL1WithRestaker = require("./DeployL1WithRestaker");
const deployL2WithRestaker = require("./DeployL2WithRestaker");
const {vars} = require("hardhat/config");

async function main() {
  // const l1Url= "http://127.0.0.1:8545"
  let l1Url =
    "https://ethereum-holesky-rpc.publicnode.com";
  let l1Provider = new ethers.JsonRpcProvider(l1Url);
  // const l2Url= "http://127.0.0.1:8546/"
  const l2Url = "https://rpc.dev2.fluentlabs.xyz/";
  let l2Provider = new ethers.JsonRpcProvider(l2Url);

  const privateKey = vars.get("HOLESKY_PRIVATE_KEY");
  const l1Signer = new ethers.Wallet(privateKey, l1Provider);
  const l2Signer = new ethers.Wallet(privateKey, l2Provider);

  // const amountToSend = ethers.parseEther("10000");
  // let s = l1Provider.getSigner()
  // await s.sendTransaction({
  //   to: l1Signer.target,
  //   value: "9000000000000000000000"
  // })
  // s = l2Provider.getSigner()
  // await s.sendTransaction({
  //   to: l2Signer.target,
  //   value: "9000000000000000000000"
  // })


  console.log/home/easy/wasm0/eigenlayer-contracts("Deploy L1 contracts:");
  let [{
    bridge: l1Bridge,
    _rollup,
    erc20Gateway: l1Gateway,
    peggedToken: l1Implementation,
    tokenFactory: l1Factory,
  }, {
    restakerGateway: l1restaker, restakingPool, liquidityToken, tokenFactory: l1RestakerFactory, peggedToken: l1RestakerImpl
  }]= await deployL1WithRestaker(l1Provider, l1Signer);
  console.log("Deploy L2 contracts:");
  let [{
    bridge: l2Bridge,
    erc20Gateway: l2Gateway,
    peggedToken: l2Implementation,
    tokenFactory: l2Factory,
  }, {
    restakerGateway: l2restaker, tokenFactory: l2RestakerFactory, peggedToken: l2RestakerImpl
  }] = await deployL2WithRestaker(l2Provider, l2Signer);

  const ERC20GatewayContract = await ethers.getContractFactory("ERC20Gateway");
  let tx = await ERC20GatewayContract.connect(l1Signer)
    .attach(l1Gateway)
    .setOtherSide(l2Gateway, l2Implementation, l2Factory);
  await tx.wait();
  tx = await ERC20GatewayContract.connect(l2Signer)
    .attach(l2Gateway)
    .setOtherSide(l1Gateway, l1Implementation, l1Factory);
  await tx.wait();
  console.log("Link erc20 gateway")

  const RestakerGateway = await ethers.getContractFactory("RestakerGateway");
  tx = await RestakerGateway.connect(l1Signer)
      .attach(l1restaker)
      .setOtherSide(l2restaker, l2RestakerImpl, l2RestakerFactory);
  await tx.wait();
  tx = await RestakerGateway.connect(l2Signer)
      .attach(l2restaker)
      .setOtherSide(l1restaker, l1RestakerImpl, l1RestakerFactory);
  await tx.wait();
  console.log("Link restaker gateway")
}
if (require.main === module) {
  main()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
}
