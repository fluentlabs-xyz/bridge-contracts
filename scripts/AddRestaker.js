const { ethers } = require("hardhat");
const { expect } = require("chai");
const {vars} = require("hardhat/config");

async function main() {
    let l1Url =
        // "https://eth-sepolia.g.alchemy.com/v2/DBpiq0grreNG4r0wdvAUCfdGJswhIPhk"
        "https://ethereum-holesky-rpc.publicnode.com";
    // l1Url = "http://127.0.0.1:8545/";
    let provider = new ethers.JsonRpcProvider(l1Url);
    const privateKey = vars.get("HOLESKY_PRIVATE_KEY");

    const l1Signer = new ethers.Wallet(privateKey, provider);

    const restakingPoolAddress = "0xf9Fe45dfcba217a1E814C6b74139A54588d6A606";

    const RestakingPool = await ethers.getContractFactory("RestakingPool");
    const restakingPool =
        RestakingPool.connect(l1Signer).attach(restakingPoolAddress);


    const addRestakerTx = await restakingPool.addRestaker("FLUENT_RESTAKER", {
    });
    let receipt = await addRestakerTx.wait();

    console.log(receipt);
    const events = await restakingPool.queryFilter(
        "RestakerAdded",
        receipt.blockNumber,
    );

    expect(events.length).to.equal(1);

    console.log(events)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
