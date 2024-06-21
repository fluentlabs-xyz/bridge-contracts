const { expect } = require("chai");
const { ethers } = require("hardhat");
const {sleep} = require("@nomicfoundation/hardhat-verify/internal/utilities");

describe("Restaker", function () {
  let restaker, restakerFacetsContract, eigenPodManagerMockContract;

  before(async function () {
    const accounts = await hre.ethers.getSigners();

    const eigenPodMockFactory = await ethers.getContractFactory("EigenPodMock");
    let eigenPodMockContract = await eigenPodMockFactory.deploy(
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      0,
    );
    eigenPodMockContract = await eigenPodMockContract.waitForDeployment();

    console.log(`restakerGatewayContract started`);
    const UpgradeableBeaconFactory =
      await ethers.getContractFactory("UpgradeableBeacon");
    let upgradeableBeaconContract = await UpgradeableBeaconFactory.deploy(
      eigenPodMockContract.target,
      await accounts[0].getAddress(),
    );
    upgradeableBeaconContract =
      await upgradeableBeaconContract.waitForDeployment();

    console.log(`eigenPodManagerMockContract started`);
    const eigenPodManagerMockFactory = await ethers.getContractFactory(
      "EigenPodManagerMock",
    );
    eigenPodManagerMockContract = await eigenPodManagerMockFactory.deploy(
      "0x0000000000000000000000000000000000000000",
      upgradeableBeaconContract.target,
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
    );
    eigenPodManagerMockContract =
      await eigenPodManagerMockContract.waitForDeployment();

    console.log(`delegationManagerMockContract started`);
    const delegationManagerMockFactory = await ethers.getContractFactory(
      "DelegationManagerMock",
    );
    let delegationManagerMockContract =
      await delegationManagerMockFactory.deploy();
    delegationManagerMockContract =
      await delegationManagerMockContract.waitForDeployment();

    console.log(`restakerFacetsFactory started`);
    const RestakerFacetsFactory =
      await ethers.getContractFactory("RestakerFacets");
    restakerFacetsContract = await RestakerFacetsFactory.deploy(
      accounts[0].getAddress(),
      eigenPodManagerMockContract.target,
      delegationManagerMockContract.target,
    );
    restakerFacetsContract = await restakerFacetsContract.waitForDeployment();

    const Restaker = await ethers.getContractFactory("Restaker");
    restaker = await Restaker.deploy();
    console.log("Restaker: ", restaker.target, );
  });

  it("Init restaker test", async function () {
    const accounts = await hre.ethers.getSigners();
    console.log(`restaker initialize started`);

    expect(!(await eigenPodManagerMockContract.hasPod(restaker.target)));

    let init = await restaker.initialize(
      accounts[0].address,
      restakerFacetsContract.target,
    );

    await init.wait();

    let owner = await restaker.owner();

    expect(owner).to.eq(accounts[0].address);

    expect(await eigenPodManagerMockContract.hasPod(restaker.target));
    let eigenPod = await eigenPodManagerMockContract.getPod(restaker.target);

    console.log("EigenPod: ", eigenPod);

    let claim = await restaker.__claim();
    console.log(claim);
  });
});
