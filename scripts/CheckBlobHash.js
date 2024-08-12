const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const {vars} = require("hardhat/config");

async function main() {
  let provider_url = "https://ethereum-holesky-rpc.publicnode.com";

  const privateKey = vars.get("HOLESKY_PRIVATE_KEY");
  let provider = new ethers.JsonRpcProvider(provider_url);

  let signer = new ethers.Wallet(privateKey, provider);

  const BlobHash= await ethers.getContractFactory("BlobHashMock");
  let blobHash = await BlobHash.connect(signer).attach("0xdBF6c09EEbC6b01618850c1d046417E04DA1c899");

  console.log("Blob hash: ", blobHash.target)

  let a = await blobHash.CheckBlobHash("0xaabd0e6b0c50a1c1c2c03bb979254284b049492e923d028a4f3f9bde9c2dd0ad6aa738e24a97d0bcac9aa6d28be26059")

}


if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
