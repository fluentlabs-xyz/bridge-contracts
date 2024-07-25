const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const {vars} = require("hardhat/config");

async function main() {
    let provider_url = "https://ethereum-holesky-rpc.publicnode.com";
    // let provider_url = "http://127.0.0.1:8545/";

    const privateKey = vars.get("HOLESKY_PRIVATE_KEY");
    let provider = new ethers.JsonRpcProvider(provider_url);

    let signer = new ethers.Wallet(privateKey, provider);

    await updateFacet(
        provider,
        signer,
    );
}

async function updateFacet(provider, signer) {
    const UpgradeableBeacon =
        await ethers.getContractFactory("UpgradeableBeacon");

    const RestakerFacets = await ethers.getContractFactory("RestakerFacets");
    let restakerFacets = await RestakerFacets.connect(signer).deploy(
        signer.getAddress(),
        // eigenPodManagerMock.target,
        "0x30770d7E3e71112d7A6b7259542D1f680a70e315",
        // delegationManagerMock.target,
        "0xA44151489861Fe9e3055d95adC98FbD462B948e7",
    );
    await restakerFacets.waitForDeployment();
    console.log("RestakerFacets: ", restakerFacets.target);

    const Restaker = await ethers.getContractFactory("Restaker");
    let restaker = await Restaker.connect(signer).deploy();
    await restaker.waitForDeployment();

    console.log("Restaker: ", restaker.target);

    let upgradeableBeacon = await UpgradeableBeacon.connect(signer).deploy(
        restaker.target,
        await signer.getAddress(),
        {
            gasLimit: 300000,
        },
    );
    await upgradeableBeacon.waitForDeployment();

    console.log("UpgradeableBeacon: ", upgradeableBeacon.target);

    const RestakerDeployer = await ethers.getContractFactory("RestakerDeployer");
    let restakerDeployer = await RestakerDeployer.connect(signer).deploy(
        upgradeableBeacon.target,
        restakerFacets.target,

    );
    await restakerDeployer.waitForDeployment();

    console.log("RestakerDeployer: ", restakerDeployer.target);

    const ProtocolConfig = await ethers.getContractFactory("ProtocolConfig");
    let protocolConfig = await ProtocolConfig.connect(signer).attach("0x22F4cbdee12ADEB2A9a09Bd75CfE87A1E0550982");

    let setDeployer = await protocolConfig.setRestakerDeployer(
        restakerDeployer.target,
    );
    await setDeployer.wait();
    console.log("setDeployer");
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
