const {ethers} = require("hardhat");

async function main() {
    let provider_url =
        "https://ethereum-holesky-rpc.publicnode.com";
    // const provider_url = "http://127.0.0.1:8545/";

    const privateKey = process.env.PRIVATE_KEY;
    let provider = new ethers.providers.JsonRpcProvider(provider_url);

    let signer = new ethers.Wallet(privateKey, provider);
    // signer = provider.getSigner()

    await batchDeposit(provider, signer);
}

async function batchDeposit(provider, l1Signer) {

    const RESTAKER_PROVIDER = "RESTAKER_PROVIDER"
    const RestakingPool = await ethers.getContractFactory("RestakingPool");

    let restakerPoolAddress = "0xa868a7DF40D16597BcacbdDE5a671985BBedF40e"

    let restakingPool = await RestakingPool.connect(l1Signer).attach(restakerPoolAddress)
    let bd = await restakingPool
        .batchDeposit(
            RESTAKER_PROVIDER,
            [
                '0xb8ed0276c4c631f3901bafa668916720f2606f58e0befab541f0cf9e0ec67a8066577e9a01ce58d4e47fba56c516f25b',
            ],
            [
                '0x927b16171b51ca4ccab59de07ea20dacc33baa0f89f06b6a762051cac07233eb613a6c272b724a46b8145850b8851e4a12eb470bfb140e028ae0ac794f3a890ec4fac33910d338343f059d93a6d688238510c147f155d984de7c01daa0d3241b',
            ],
            [
                '0x50021ea68edb12aaa54fc8a2706b2f4b1d35d1406512fc6de230e0ea0391cf97',
            ]
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
