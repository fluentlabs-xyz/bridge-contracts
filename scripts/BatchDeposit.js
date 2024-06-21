const { ethers } = require("hardhat");

async function main() {
  let provider_url = "https://ethereum-holesky-rpc.publicnode.com";
  // const provider_url = "http://127.0.0.1:8545/";

  const privateKey = process.env.PRIVATE_KEY;
  let provider = new ethers.JsonRpcProvider(provider_url);

  let signer = new ethers.Wallet(privateKey, provider);
  // signer = provider.getSigner()

  let balance = await provider.getBalance(signer.address);
  console.log("Balance: ", balance);

  await batchDeposit(provider, signer);
}

async function batchDeposit(provider, l1Signer) {
  const RESTAKER_PROVIDER = "RESTAKER_PROVIDER";
  const RestakingPool = await ethers.getContractFactory("RestakingPool");

  let restakerPoolAddress = "0x16D824728893A11a2765E7F9a80B86c328C38C38";

  let restakingPool =
    await RestakingPool.connect(l1Signer).attach(restakerPoolAddress);
  let bd = await restakingPool.batchDeposit(
    RESTAKER_PROVIDER,
    [
      "0x99d3e32bc20da28a06258164022305e401aa40ca6cc594ddf102330731ac97c32a106ea43908f7b259bcc71c348056b9",
    ],
    [
      "0xa2418bf367b5dc21601d00e7956179c10d74c9981a1f5ec60909c9f1367e37f6ed46521732ac9613c4ab6ba4fb7f295019925c1f3ea105fc995d11f95fd2da2ebffdef6c8e4acd67c910e3a574f34259e9a5cecbcd663679aeb52a442fba0ff8",
    ],
    ["0xdf4e020f518a883dcc894f6e547678d3c16cad72fa4992e25a8046a7c254256e"],
  );

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
