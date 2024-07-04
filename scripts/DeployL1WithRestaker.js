const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

const deployL1 = require("./DeployL1");
const deployRestakerL1 = require("./DeployRestakerL1");
const {vars} = require("hardhat/config");

async function main() {
  let provider_url = "https://ethereum-holesky-rpc.publicnode.com";
  // const provider_url = "http://127.0.0.1:8545/";

  const privateKey = vars.get("HOLESKY_PRIVATE_KEY");
  let provider = new ethers.JsonRpcProvider(provider_url);

  let signer = new ethers.Wallet(privateKey, provider);

  await deployL1WithRestaker(provider, signer);
}

async function deployL1WithRestaker(provider, signer) {
  let addresses = await deployL1(provider, signer);

  let restaker_addresses = await deployRestakerL1(
    provider,
    signer,
    addresses.bridge,
  );

  return [addresses, restaker_addresses];
}

module.exports = deployL1WithRestaker;

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
