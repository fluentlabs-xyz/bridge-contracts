const { expect } = require("chai");
const { BigNumber } = require("ethers");
const {ethers} = require("hardhat");

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
        )
        await eigenPodMockContract.deployed();

        console.log(`restakerGatewayContract started`);
        const UpgradeableBeaconFactory = await ethers.getContractFactory('UpgradeableBeacon');
        let upgradeableBeaconContract = await UpgradeableBeaconFactory.deploy(
            eigenPodMockContract.address,
            await accounts[0].getAddress(),
        );
        await upgradeableBeaconContract.deployed();

        console.log(`eigenPodManagerMockContract started`);
        const eigenPodManagerMockFactory = await ethers.getContractFactory("EigenPodManagerMock");
        eigenPodManagerMockContract = await eigenPodManagerMockFactory.deploy(
            "0x0000000000000000000000000000000000000000",
            upgradeableBeaconContract.address,
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
        )
        await eigenPodManagerMockContract.deployed();

        console.log(`delegationManagerMockContract started`);
        const delegationManagerMockFactory = await ethers.getContractFactory("DelegationManagerMock");
        let delegationManagerMockContract = await delegationManagerMockFactory.deploy()
        await delegationManagerMockContract.deployed();

        console.log(`restakerFacetsFactory started`);
        const RestakerFacetsFactory = await ethers.getContractFactory("RestakerFacets");
        restakerFacetsContract = await RestakerFacetsFactory.deploy(
            accounts[0].getAddress(),
            eigenPodManagerMockContract.address,
            delegationManagerMockContract.address,
        );
        await restakerFacetsContract.deployed();


        const Restaker = await ethers.getContractFactory("Restaker");
        restaker = await Restaker.deploy();
        console.log("Restaker: ", restaker.address)
    });

    it("Init restaker test", async function () {
        const accounts = await hre.ethers.getSigners();
        console.log(`restaker initialize started`);

        expect(!await eigenPodManagerMockContract.hasPod(restaker.address));

        let init = await restaker.initialize(
            accounts[0].address,
            restakerFacetsContract.address
        );

        await init.wait()

        let owner = await restaker.owner()

        expect(owner).to.eq(accounts[0].address)

        expect(await eigenPodManagerMockContract.hasPod(restaker.address));
        let eigenPod = await eigenPodManagerMockContract.getPod(restaker.address);

        console.log("EigenPod: ", eigenPod);

        let claim = await restaker.__claim()
        console.log(claim)

    });
});
