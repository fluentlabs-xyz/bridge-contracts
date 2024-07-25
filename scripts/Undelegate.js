const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { expect } = require("chai");
const {vars} = require("hardhat/config");

async function main() {
    let provider_url =
        "https://ethereum-holesky-rpc.publicnode.com";

    const privateKey = vars.get("HOLESKY_PRIVATE_KEY");
    let provider = new ethers.JsonRpcProvider(provider_url);
    const signer = new ethers.Wallet(privateKey, provider);
    const restakingPoolFactory =
        await ethers.getContractFactory("RestakingPool");
    let restakingPool = await restakingPoolFactory.connect(signer).attach(
        "0x16D824728893A11a2765E7F9a80B86c328C38C38",
    );

    console.log("Liquidity token: ", await restakingPool.getLiquidityToken())

    let undelegate_tx = await restakingPool.undelegate(
        "RESTAKER_PROVIDER", {
            gasPrice: 100000000n,
            // maxFeePerGas: 1000000000n,
            // maxPriorityFeePerGas: 1000000000n
        }
    );

    await undelegate_tx.wait();
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
