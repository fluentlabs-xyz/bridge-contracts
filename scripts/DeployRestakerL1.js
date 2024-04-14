const { ethers } = require("hardhat");
const {BigNumber} = require("ethers");

const RESTAKER_PROVIDER = "RESTAKER_PROVIDER"

async function main() {
  let provider_url =
      "https://ethereum-holesky-rpc.publicnode.com";
  // let provider_url = "http://127.0.0.1:8545/";

  const privateKey = process.env.PRIVATE_KEY;
  let provider = new ethers.providers.JsonRpcProvider(provider_url);

  let signer = new ethers.Wallet(privateKey, provider);
  // signer = provider.getSigner()

  await deployRestakerL1(provider, signer, "0x5D53ec5B0eB1dCBaAe425A0c5ae79354467cd6fA");
}

async function deployRestakerL1(provider, signer, bridgeAddress) {

  let awaiting = []

  let nonce = await signer.getTransactionCount("pending")

  console.log("Pending nonce: ", nonce)
  const ProtocolConfig = await ethers.getContractFactory("ProtocolConfig");
  // let protocolConfig = await ProtocolConfig.connect(l1Signer).attach("0xd3f649a83c4d078c533a06188f6f17661b7639d9");
  let protocolConfig = await ProtocolConfig.connect(signer).deploy(
      signer.getAddress(),
      signer.getAddress(),
      signer.getAddress(),
      {
        nonce: nonce++
      }
  );
  awaiting.push(protocolConfig.deployed());

  console.log("Protocol config: ", protocolConfig.address);

  console.log("Pending nonce: ", nonce)
  const RatioFeed = await ethers.getContractFactory("RatioFeed");
  // let ratioFeed = await RatioFeed.connect(l1Signer).attach("0xd15ba44ce9e19509073bd35476a11f8902ae1f8b")
  let ratioFeed = await RatioFeed.connect(signer)
      .deploy(
      protocolConfig.address,
      "40000",
  {
    nonce: nonce++
  }
  );
  console.log("Pending nonce: ", nonce)
  awaiting.push(ratioFeed.deployed());
  console.log("Ratio feed: ", ratioFeed.address);


  let setRatioFeed = await protocolConfig.setRatioFeed(ratioFeed.address,
      {
        nonce: nonce++
      });
  console.log("Set ratio feet");
  awaiting.push(setRatioFeed.wait());

  console.log("Set ratio feet");

  const LiquidityToken = await ethers.getContractFactory("LiquidityToken");
  // let liquidityToken = await LiquidityToken.connect(l1Signer).attach("0x8817e50f7af3415cf1402cbc6bf46206dd80b52d");
  let liquidityToken = await LiquidityToken.connect(signer).deploy(
      protocolConfig.address,
      'Liquidity Token',
      'lETH',
      {
    nonce: nonce++
  }
  );
  awaiting.push(liquidityToken.deployed());

  console.log("LiquidutyToken: ", liquidityToken.address)



  let updateRatio = await ratioFeed.updateRatio(liquidityToken.address, 1000,
      {
        nonce: nonce++
      });
  awaiting.push(updateRatio.wait());

  console.log("updateRation: ", updateRatio.address)

  let setToken = await protocolConfig.setLiquidityToken(liquidityToken.address,
      {
        nonce: nonce++
      })
  awaiting.push(setToken.wait());

  console.log("setToken: ", setToken.address)

  const RestakingPool = await ethers.getContractFactory("RestakingPool");
  // let restakingPool = await RestakingPool.connect(l1Signer).attach("0xfae844C4deb40A72015e7A198C7B87C8B3d06b2A");
  let restakingPool = await RestakingPool.connect(signer).deploy(
      protocolConfig.address,
      '200000',
      '200000000000000000000',
      {
        nonce: nonce++
      },
  );
  awaiting.push(restakingPool.deployed());
  console.log("Restaking pool: ", restakingPool.address)


  let setPool= await protocolConfig.setRestakingPool(restakingPool.address,
      {
        nonce: nonce++
      })
  awaiting.push(setPool.wait());
  console.log("settedPool");


  const FeeCollector = await ethers.getContractFactory("FeeCollector");
  let feeCollector = await FeeCollector.connect(signer).deploy(
      protocolConfig.address,
      '1500',
      {
        nonce: nonce++
      },
  );
  awaiting.push(feeCollector.deployed());
  console.log("FeeCollector: ", feeCollector.address);


  const PeggedToken = await ethers.getContractFactory("ERC20PeggedToken");
  let peggedToken = await PeggedToken.connect(signer).deploy(
      {
        nonce: nonce++
      });
  awaiting.push(peggedToken.deployed());
  console.log("ERC20PeggedToken: ", peggedToken.address);


  const TokenFactoryContract =
      await ethers.getContractFactory("ERC20TokenFactory");
  let tokenFactory = await TokenFactoryContract.connect(signer).deploy(
      peggedToken.address,
      {
        nonce: nonce++
      },
  );
  awaiting.push(tokenFactory.deployed());
  console.log("ERC20TokenFactory: ", tokenFactory.address);


  const RestakerGateway = await ethers.getContractFactory("RestakerGateway");
  let restakerGateway = await RestakerGateway.connect(signer).deploy(
      bridgeAddress,
      restakingPool.address,
      tokenFactory.address,
      {
        nonce: nonce++
      },
  );
  awaiting.push(restakerGateway.deployed());
  console.log("REstaking gateway, ", restakerGateway.address)


  // const EigenPodMock    = await ethers.getContractFactory("EigenPodMock");
  // let eigenPodMock = await EigenPodMock.connect(l1Signer).deploy(
  //     "0x0000000000000000000000000000000000000000",
  //     "0x0000000000000000000000000000000000000000",
  //     "0x0000000000000000000000000000000000000000",
  //     0
  // )
  // awaiting.push(eigenPodMock.deployed());
  // console.log("EigenPodMock: ", eigenPodMock.address);

  const UpgradeableBeacon = await ethers.getContractFactory('UpgradeableBeacon');
  // let upgradeableBeacon = await UpgradeableBeacon.connect(l1Signer).deploy(
  //     eigenPodMock.address,
  //     await l1Signer.getAddress(), {
  //       gasLimit: 300000,
  //     }
  // );
  // awaiting.push(upgradeableBeacon.deployed());
  // console.log("UpgradeableBeacon: ", upgradeableBeacon.address);

  // const EigenPodManagerMock    = await ethers.getContractFactory("EigenPodManagerMock");
  // let eigenPodManagerMock = await EigenPodManagerMock.connect(l1Signer).deploy(
  //     "0x0000000000000000000000000000000000000000",
  //     upgradeableBeacon.address,
  //     "0x0000000000000000000000000000000000000000",
  //     "0x0000000000000000000000000000000000000000",
  // )
  // awaiting.push(eigenPodManagerMock.deployed());
  // console.log("EigenPodManagerMock: ", eigenPodManagerMock.address);

  // const DelegationManagerMock    = await ethers.getContractFactory("DelegationManagerMock");
  // let delegationManagerMock = await DelegationManagerMock.connect(l1Signer).deploy()
  // awaiting.push(delegationManagerMock.deployed());
  // console.log("DelegationManagerMock: ", delegationManagerMock.address);

  const RestakerFacets    = await ethers.getContractFactory("RestakerFacets");
  let restakerFacets = await RestakerFacets.connect(signer).deploy(
      signer.getAddress(),
      // eigenPodManagerMock.address,
      "0x30770d7E3e71112d7A6b7259542D1f680a70e315",
      // delegationManagerMock.address,
    "0xdfB5f6CE42aAA7830E94ECFCcAd411beF4d4D5b6",
      {
        nonce: nonce++
      },
  );
  awaiting.push(restakerFacets.deployed());
  console.log("RestakerFacets: ", restakerFacets.address);


  const Restaker = await ethers.getContractFactory('Restaker');
  let restaker = await Restaker.connect(signer).deploy(
      {
        nonce: nonce++
      });
  awaiting.push(restaker.deployed());

  console.log("Restaker: ", restaker.address);



  let upgradeableBeacon = await UpgradeableBeacon.connect(signer).deploy(
      restaker.address,
      await signer.getAddress(), {
        gasLimit: 300000,
        nonce: nonce++
      }
  );
  awaiting.push(upgradeableBeacon.deployed());

  console.log("UpgradeableBeacon: ", upgradeableBeacon.address);


  const RestakerDeployer = await ethers.getContractFactory("RestakerDeployer");
  let restakerDeployer = await RestakerDeployer.connect(signer).deploy(
      upgradeableBeacon.address,
      restakerFacets.address,
      {
        nonce: nonce++
      },
  );
  awaiting.push(restakerDeployer.deployed());

  console.log("RestakerDeployer: ", restakerDeployer.address);


  let setDeployer = await protocolConfig.setRestakerDeployer(restakerDeployer.address,
      {
        nonce: nonce++
      })
  awaiting.push(setDeployer.wait());
  console.log("setDeployer")


  const authTx = await tokenFactory.transferOwnership(restakerGateway.address, {
    nonce: nonce++
  });
  awaiting.push(authTx.wait());

  console.log("authTx")


  let addRestaker = await restakingPool.addRestaker(RESTAKER_PROVIDER, {
    gasLimit: 1000000,
    nonce: nonce++
  });
  awaiting.push(addRestaker.wait());
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
