const { ethers } = require("hardhat");
const {BigNumber} = require("ethers");

const deployL1 = require("./DeployL1");
const deployRestakerL1 = require("./DeployRestakerL1");

async function main() {
  let provider_url =
      "https://rpc.sepolia.org/"
    // "https://eth-sepolia.g.alchemy.com/v2/DBpiq0grreNG4r0wdvAUCfdGJswhIPhk";
  // const provider_url = "http://127.0.0.1:8545/";

  const privateKey = process.env.PRIVATE_KEY;
  let provider = new ethers.providers.JsonRpcProvider(provider_url);

  let signer = new ethers.Wallet(privateKey, provider);
  // signer = provider.getSigner()

  let addresses = await deployL1(provider, signer);

  await deployRestakerL1(provider, signer, addresses.bridge)
}


main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
