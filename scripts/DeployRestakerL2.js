const { ethers } = require("hardhat");

async function main() {
    const provider_url = "https://rpc.dev1.fluentlabs.xyz/";
    // const provider_url = "http://127.0.0.1:8546/"

    let provider = new ethers.providers.JsonRpcProvider(provider_url);

    const privateKey = process.env.PRIVATE_KEY;
    const signer = new ethers.Wallet(privateKey, provider);

    const bridgeAddress = "0x492bF40bbd967fF54af052e8364D83Ae509436b1"

    console.log("Signer: ", signer.address)

    await deployRestakerL2(provider, signer, bridgeAddress);
}

async function deployRestakerL2(provider, l2Signer, bridgeAddress) {

    const PeggedToken = await ethers.getContractFactory("ERC20PeggedToken");
    let peggedToken = await PeggedToken.connect(l2Signer).deploy();
    await peggedToken.deployed();

    console.log("Pegged token: ", peggedToken.address)

    const TokenFactoryContract =
        await ethers.getContractFactory("ERC20TokenFactory");
    let tokenFactory = await TokenFactoryContract.connect(l2Signer).deploy(
        peggedToken.address,
    );
    await tokenFactory.deployed();

    console.log("Token factory: ", tokenFactory.address)
    const RestakerGateway = await ethers.getContractFactory("RestakerGateway");

    let restakerGateway = await RestakerGateway.connect(l2Signer).deploy(
        bridgeAddress,
        "0x0000000000000000000000000000000000000000",
        tokenFactory.address,
    );
    await restakerGateway.deployed();

    console.log("Restaker gateway: ", restakerGateway.address)

    const authTx = await tokenFactory.transferOwnership(restakerGateway.address);
    await authTx.wait();

    return {
        restakerGateway: restakerGateway.address,
        tokenFactory: tokenFactory.address,
        peggedToken: peggedToken.address
    }
}

module.exports = deployRestakerL2;

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
