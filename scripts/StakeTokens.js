const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

async function main() {
    let provider_url =
        "https://rpc2.sepolia.org";
    // "https://eth-sepolia.g.alchemy.com/v2/DBpiq0grreNG4r0wdvAUCfdGJswhIPhk";
    // const provider_url = "http://127.0.0.1:8545/"

    const privateKey = process.env.PRIVATE_KEY;
    let provider = new ethers.providers.JsonRpcProvider(provider_url);

    console.log(provider_url)
    const signer = new ethers.Wallet(privateKey, provider);

    const RestakerGatewayAddress = "0xedb4710b2cddc434973f45a06f4a5b975937756a";

    let nonce = await signer.getTransactionCount();
    console.log("Next transaction: ", nonce);
    let pendingNonce = await signer.getTransactionCount("pending");
    console.log("Next pending transaction: ", pendingNonce);


    console.log("Token send");
    const RestakerGateway = await ethers.getContractFactory("RestakerGateway");

    nonce = await signer.getTransactionCount();
    let restakerGateway =
        await RestakerGateway.connect(signer).attach(RestakerGatewayAddress);
    const send_tx = await restakerGateway.sendRestakedTokens(
        await signer.getAddress(),
        {
            value: 1000,
            gasLimit: 200000,
            nonce,
            maxPriorityFeePerGas: BigNumber.from(21427514823).mul(3),
            maxFeePerGas: BigNumber.from(36801940794).mul(3),
        },
    );

    console.log(send_tx);

    await send_tx.wait();
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
