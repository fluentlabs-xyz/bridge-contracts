const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { expect } = require("chai");
const {vars} = require("hardhat/config");

async function main() {
  let provider_url =
    // "https://rpc2.sepolia.org";
    // "https://ethereum-holesky-rpc.publicnode.com";
    // "https://eth-sepolia.g.alchemy.com/v2/DBpiq0grreNG4r0wdvAUCfdGJswhIPhk";
    // provider_url = "http://127.0.0.1:8545/"
    "https://rpc.dev.thefluent.xyz/";

  const privateKey = vars.get("HOLESKY_PRIVATE_KEY");
  let provider = new ethers.JsonRpcProvider(provider_url);
  const signer = new ethers.Wallet(privateKey, provider);
  const LiquidityToken = await ethers.getContractFactory("LiquidityToken");
  let liquidityToken = await LiquidityToken.connect(signer).attach(
    "0xe0a490d502e0ae343891fa3dd86e384be4c034a0",
  );
  let balanceLiq = await liquidityToken.balanceOf(signer.target);
  console.log("Balance liq token: ", balanceLiq);

  const RestakerGateway = await ethers.getContractFactory("RestakerGateway");
  let restakerGateway = RestakerGateway.connect(signer).attach(
    "0x742318E6A71b400c335593cC65099aEc30EB6503",
  );

  let tx = await restakerGateway.sendUnstakingTokens(
    signer.target,
    balanceLiq / 10,
  );

  await tx.wait();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
