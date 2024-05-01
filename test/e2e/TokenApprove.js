const {expect} = require("chai");
const {ethers} = require("hardhat");
const consts = require(`../../consts`);

describe("Contract deployment and interaction 2", () => {
    let l1Token;
    // let l1Url = `http://${consts.EVM_HOST}:${consts.EVM_NODE_PORT}/`;
    let l1Url = `http://${consts.FLUENT_HOST}:${consts.FLUENT_NODE_PORT}/`;

    let providerL1 = new ethers.providers.JsonRpcProvider(l1Url); // Replace with your node's RPC URL
    let wallet = ethers.Wallet.fromMnemonic("test test test test test test test test test test test junk")
    let signerL1 = wallet.connect(providerL1)

    let fromAccount = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
    let toAccount = '0x0000000000000000000000000000000000000000';

    const accounts = [fromAccount, toAccount];

    before(async () => {
        const Token = await ethers.getContractFactory("MockERC20Token");
        l1Token = await Token.connect(signerL1).deploy(
            "Mock Token",
            "TKN",
            ethers.utils.parseEther("1000000"),
            fromAccount,
            {
                gasLimit: 2000000,
            }
        );
        await l1Token.deployed();
        console.log("l1token: ", l1Token.address);
    });

    it("Approve test", async () => {
        let allowance = await l1Token.allowance(accounts[0], accounts[1]);
        console.log(`account0-account1 allowance: ${allowance}`)

        expect(allowance.toString()).to.equal("0");

        const approve_tx = await l1Token.approve(accounts[1], 100, {
            from: accounts[0],
            gasLimit: 2000000,
        });
        let r = await approve_tx.wait();
        console.log(r);
        allowance = await l1Token.allowance(accounts[0], accounts[1]);
        console.log(`account0-account1 allowance: ${allowance}`)

        expect(allowance.toString()).to.equal("100");
    });
});
