const { ethers } = require("hardhat");

async function main() {
    const provider_url = "https://rpc.dev1.fluentlabs.xyz/";
    // const provider_url = "http://127.0.0.1:8546/"

    let provider = new ethers.providers.JsonRpcProvider(provider_url);

    const privateKey = process.env.PRIVATE_KEY;
    const signer = new ethers.Wallet(privateKey, provider);

    const bridgeAddress = "0x93d0Efe8d5199E87d8545710abC22d29594bBfEd"

    await deployGatewayL2(provider, signer, bridgeAddress);
}

async function deployGatewayL2(provider, l2Signer, bridgeAddress) {

    // const PeggedToken = await ethers.getContractFactory("ERC20PeggedToken");
    // let peggedToken = await PeggedToken.connect(l2Signer).deploy();
    // await peggedToken.deployed();
    //
    // const TokenFactoryContract =
    //     await ethers.getContractFactory("ERC20TokenFactory");
    // let tokenFactory = await TokenFactoryContract.connect(l2Signer).deploy(
    //     peggedToken.address,
    // );
    // await tokenFactory.deployed();
    //
    // const RestakerGateway = await ethers.getContractFactory("RestakerGateway");

    let restakerGateway = await RestakerGateway.connect(l2Signer).deploy(
        bridgeAddress,
        "0x0000000000000000000000000000000000000000",
        // tokenFactory.address,
        "0x4Ab4B3553596Ca19E462bc7a36b195625eb5770b"
    );
    await restakerGateway.deployed();

    const authTx = await tokenFactory.transferOwnership(restakerGateway.address);
    await authTx.wait();


}

module.exports = deployGatewayL2;
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
