const { ethers } = require("hardhat");
const {BigNumber} = require("ethers");

const RESTAKER_PROVIDER = "RESTAKER_PROVIDER"

async function main() {
  let provider_url =
    "https://eth-sepolia.g.alchemy.com/v2/DBpiq0grreNG4r0wdvAUCfdGJswhIPhk";
  // let provider_url = "http://127.0.0.1:8545/";

  const privateKey = process.env.PRIVATE_KEY;
  let provider = new ethers.providers.JsonRpcProvider(provider_url);

  let signer = new ethers.Wallet(privateKey, provider);
  // signer = provider.getSigner()

  await deployRestakerL1(provider, signer, "0x5D53ec5B0eB1dCBaAe425A0c5ae79354467cd6fA");
}

async function deployRestakerL1(provider, l1Signer, bridgeAddress) {

  let awaiting = []
  
  const ProtocolConfig = await ethers.getContractFactory("ProtocolConfig");
  // let protocolConfig = await ProtocolConfig.connect(l1Signer).attach("0xd3f649a83c4d078c533a06188f6f17661b7639d9");
  let protocolConfig = await ProtocolConfig.connect(l1Signer).deploy(
      l1Signer.getAddress(),
      l1Signer.getAddress(),
      l1Signer.getAddress(),
  );
  await protocolConfig.deployed();

  console.log("Protocol config: ", protocolConfig.address);

  const RatioFeed = await ethers.getContractFactory("RatioFeed");
  // let ratioFeed = await RatioFeed.connect(l1Signer).attach("0xd15ba44ce9e19509073bd35476a11f8902ae1f8b")
  let ratioFeed = await RatioFeed.connect(l1Signer)
      .deploy(
      protocolConfig.address,
      "40000"
  );
  await ratioFeed.deployed();
  console.log("Ratio feed: ", ratioFeed.address);

  let setRatioFeed = await protocolConfig.setRatioFeed(ratioFeed.address);
  console.log("Set ratio feet: ", setRatioFeed);
  await setRatioFeed.wait()

  const LiquidityToken = await ethers.getContractFactory("LiquidityToken");
  // let liquidityToken = await LiquidityToken.connect(l1Signer).attach("0x8817e50f7af3415cf1402cbc6bf46206dd80b52d");
  let liquidityToken = await LiquidityToken.connect(l1Signer).deploy(
      protocolConfig.address,
      'Liquidity Token',
      'lETH'
  );
  await liquidityToken.deployed();

  console.log("LiquidutyToken: ", liquidityToken.address)


  let updateRatio = await ratioFeed.updateRatio(liquidityToken.address, 1000);
  await updateRatio.wait();

  console.log("Liquidity Token: ", liquidityToken.address)
  let setToken = await protocolConfig.setLiquidityToken(liquidityToken.address)
  await setToken.wait()

  const RestakingPool = await ethers.getContractFactory("RestakingPool");
  // let restakingPool = await RestakingPool.connect(l1Signer).attach("0xfae844C4deb40A72015e7A198C7B87C8B3d06b2A");
  let restakingPool = await RestakingPool.connect(l1Signer).deploy(
      protocolConfig.address,
      '200000',
      '200000000000000000000',
  );
  await restakingPool.deployed();
  console.log("Restaking pool: ", restakingPool.address)

  let setPool= await protocolConfig.setRestakingPool(restakingPool.address)
  await setPool.wait()
  console.log("settedPool");

  const FeeCollector = await ethers.getContractFactory("FeeCollector");
  let feeCollector = await FeeCollector.connect(l1Signer).deploy(
      protocolConfig.address,
      '1500',
  );
  await feeCollector.deployed();
  console.log("FeeCollector: ", feeCollector.address);

  const PeggedToken = await ethers.getContractFactory("ERC20PeggedToken");
  let peggedToken = await PeggedToken.connect(l1Signer).deploy();
  await peggedToken.deployed();
  console.log("ERC20PeggedToken: ", peggedToken.address);

  const TokenFactoryContract =
      await ethers.getContractFactory("ERC20TokenFactory");
  let tokenFactory = await TokenFactoryContract.connect(l1Signer).deploy(
      peggedToken.address,
  );
  await tokenFactory.deployed();
  console.log("ERC20TokenFactory: ", tokenFactory.address);

  const RestakerGateway = await ethers.getContractFactory("RestakerGateway");
  let restakerGateway = await RestakerGateway.connect(l1Signer).deploy(
      bridgeAddress,
      restakingPool.address,
      tokenFactory.address,
  );
  await restakerGateway.deployed();
  console.log("REstaking gateway, ", restakerGateway.address)

  const EigenPodMock    = await ethers.getContractFactory("EigenPodMock");
  let eigenPodMock = await EigenPodMock.connect(l1Signer).deploy(
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      0
  )
  await eigenPodMock.deployed();
  console.log("EigenPodMock: ", eigenPodMock.address);

  const UpgradeableBeacon = await ethers.getContractFactory('UpgradeableBeacon');
  let upgradeableBeacon = await UpgradeableBeacon.connect(l1Signer).deploy(
      eigenPodMock.address,
      await l1Signer.getAddress(), {
        gasLimit: 300000,
      }
  );
  await upgradeableBeacon.deployed();
  console.log("UpgradeableBeacon: ", upgradeableBeacon.address);

  const EigenPodManagerMock    = await ethers.getContractFactory("EigenPodManagerMock");
  let eigenPodManagerMock = await EigenPodManagerMock.connect(l1Signer).deploy(
      "0x0000000000000000000000000000000000000000",
      upgradeableBeacon.address,
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
  )
  await eigenPodManagerMock.deployed();
  console.log("EigenPodManagerMock: ", eigenPodManagerMock.address);

  const DelegationManagerMock    = await ethers.getContractFactory("DelegationManagerMock");
  let delegationManagerMock = await DelegationManagerMock.connect(l1Signer).deploy()
  await delegationManagerMock.deployed();
  console.log("DelegationManagerMock: ", delegationManagerMock.address);

  const RestakerFacets    = await ethers.getContractFactory("RestakerFacets");
  let restakerFacets = await RestakerFacets.connect(l1Signer).deploy(
      l1Signer.getAddress(),
      eigenPodManagerMock.address,
      delegationManagerMock.address,
  );
  await restakerFacets.deployed();
  console.log("RestakerFacets: ", restakerFacets.address);

  const Restaker = await ethers.getContractFactory('Restaker');
  let restaker = await Restaker.connect(l1Signer).deploy();
  await restaker.deployed();

  console.log("Restaker: ", restaker.address);


  upgradeableBeacon = await UpgradeableBeacon.connect(l1Signer).deploy(
      restaker.address,
      await l1Signer.getAddress(), {
        gasLimit: 300000,
      }
  );
  await upgradeableBeacon.deployed();

  console.log("UpgradeableBeacon: ", upgradeableBeacon.address);

  const RestakerDeployer = await ethers.getContractFactory("RestakerDeployer");
  let restakerDeployer = await RestakerDeployer.connect(l1Signer).deploy(
      upgradeableBeacon.address,
      restakerFacets.address,
  );
  await restakerDeployer.deployed();

  console.log("RestakerDeployer: ", restakerDeployer.address);

  let setDeployer = await protocolConfig.setRestakerDeployer(restakerDeployer.address, {
  })
  await setDeployer.wait()
  console.log("setDeployer")

  const authTx = await tokenFactory.transferOwnership(restakerGateway.address, {
  });
  await authTx.wait();

  console.log("authTx")

  let addRestaker = await restakingPool.addRestaker(RESTAKER_PROVIDER, {
    gasLimit: 600000,
  });
  await addRestaker.wait()
  console.log("addRestaker")

  await Promise.all(awaiting)

  console.log("Restaking Gateway contracts deployed")
  return {
    restakerGateway: restakerGateway.address,
    restakingPool: restakingPool.address,
    liquidityToken: liquidityToken.address,
    tokenFactory: tokenFactory.address,
    peggedToken: peggedToken.address
  }
}

module.exports = deployRestakerL1;

if (require.main === module) {
  main()
      .then(() => process.exit(0))
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
}
