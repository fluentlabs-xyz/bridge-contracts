const { ethers } = require("hardhat");
const {BigNumber} = require("ethers");

const deployL2 = require("./DeployL2");
const deployRestakerL2 = require("./DeployRestakerL2");

async function main() {
    const provider_url = "https://rpc.dev1.fluentlabs.xyz/";

    const privateKey = process.env.PRIVATE_KEY;
    let provider = new ethers.providers.JsonRpcProvider(provider_url);

    let signer = new ethers.Wallet(privateKey, provider);

    await deployL2WithRestaker(provider, signer)
}

async function deployL2WithRestaker(provider, signer) {
    let addresses = await deployL2(provider, signer);

    let restakerAddresses = await deployRestakerL2(provider, signer, addresses.bridge)

    return [addresses, restakerAddresses]
}


module.exports = deployL2WithRestaker;

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}
