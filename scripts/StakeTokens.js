const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const {expect} = require("chai");

async function main() {
    let provider_url =
        // "https://rpc2.sepolia.org";
        "https://ethereum-holesky-rpc.publicnode.com";
    // "https://eth-sepolia.g.alchemy.com/v2/DBpiq0grreNG4r0wdvAUCfdGJswhIPhk";
    // provider_url = "http://127.0.0.1:8545/"

    const privateKey = process.env.PRIVATE_KEY;
    let provider = new ethers.providers.JsonRpcProvider(provider_url);

    console.log(provider_url)
    let signer = new ethers.Wallet(privateKey, provider);
    // signer = provider.getSigner()


    const BridgeContract = await ethers.getContractFactory("Bridge");

    // let l1Bridge = await BridgeContract.connect(signer).attach("0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9");
    let l1Bridge = await BridgeContract.connect(signer).attach("0x9a7D9579f16A9808016981bd92F8e8e3E933a842");

    const RestakingPoolContract = await ethers.getContractFactory("RestakingPool");

    // let restakingPool = await RestakingPoolContract.connect(signer).attach("0x9A676e781A523b5d0C0e43731313A708CB607508");
    let restakingPool = await RestakingPoolContract.connect(signer).attach("0x7B578632aB547B773A23421b3bBeF391967063aB");


    // const RestakerGatewayAddress = "0x3Aa5ebB10DC797CAC828524e59A333d0A371443c";
    const RestakerGatewayAddress = "0xfc5EC4f0D51B106332c1E0Ab06927708Ef6b84AB";

    let nonce = await signer.getTransactionCount();
    console.log("Next transaction: ", nonce);
    let pendingNonce = await signer.getTransactionCount("pending");
    console.log("Next pending transaction: ", pendingNonce);


    console.log("Token send");
    const RestakerGateway = await ethers.getContractFactory("RestakerGateway");

    nonce = await signer.getTransactionCount();
    let restakerGateway =
        await RestakerGateway.connect(signer).attach(RestakerGatewayAddress);

    let minStake = await restakingPool.getMinStake()
    console.log("Min stake: ", minStake)

    const send_tx = await restakerGateway.sendRestakedTokens(
        await signer.getAddress(),
        {
            value: minStake,
            gasLimit: 300000,
            nonce,
            maxPriorityFeePerGas: BigNumber.from(21427514823).mul(3),
            maxFeePerGas: BigNumber.from(36801940794).mul(3),
        },
    );

    console.log(send_tx);

    let receipt = await send_tx.wait();


    const events = await l1Bridge.queryFilter(
        "SentMessage",
        receipt.blockNumber,
    );

    expect(events.length).to.equal(1);

    const sentEvent = events[0];

    let sendMessageHash = sentEvent.args["messageHash"];

    console.log("Message hash", sendMessageHash);
    console.log("Event", sentEvent);

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
