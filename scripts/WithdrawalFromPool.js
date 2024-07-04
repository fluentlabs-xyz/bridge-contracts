const { ethers } = require("hardhat");
const {vars} = require("hardhat/config");

async function main() {
  let provider_url = "https://ethereum-holesky-rpc.publicnode.com";
  // const provider_url = "http://127.0.0.1:8545/";

  const privateKey = vars.get("HOLESKY_PRIVATE_KEY");
  let provider = new ethers.JsonRpcProvider(provider_url);

  let signer = new ethers.Wallet(privateKey, provider);
  // signer = provider.getSigner()

  let balance = await signer.getBalance();
  console.log("Balance: ", balance);

  await withdrawBeforeRestaking(provider, signer);
}

async function withdrawBeforeRestaking(provider, l1Signer) {
  const RESTAKER_PROVIDER = "RESTAKER_PROVIDER";
  const RestakingPool = await ethers.getContractFactory("RestakingPool");

  let restakerPoolAddress = "0x16D824728893A11a2765E7F9a80B86c328C38C38";

  let restakingPool =
    await RestakingPool.connect(l1Signer).attach(restakerPoolAddress);
  let bd = await restakingPool.withdrawBeforeRestaking(RESTAKER_PROVIDER);

  await bd.wait();
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
