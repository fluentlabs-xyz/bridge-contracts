const {expect} = require("chai");
const {ethers} = require("hardhat");
const consts = require(`../../consts`);

describe("Contract deployment and interaction", function () {
    let l1Token;
    let l1Url = `http://127.0.0.1:${consts.FLUENT_NODE_PORT}/`;

    before(async () => {
        const accounts = await hre.ethers.getSigners();

        let signerL1 = accounts[0]

        const Token = await ethers.getContractFactory("MockERC20Token");
        l1Token = await Token.connect(signerL1).deploy(
            "Mock Token",
            "TKN",
            ethers.utils.parseEther("1000000"),
            accounts[0].address, {
                gasLimit: 2000000,
            }
        );
        await l1Token.deployed();
        console.log("l1token: ", l1Token.address);
    });

    it("Approve test", async function () {
        let provider = new ethers.providers.JsonRpcProvider(l1Url);
        let accounts = await provider.listAccounts();

        let allowance = await l1Token.allowance(accounts[0], accounts[1]);
        console.log("Allowance: ", allowance)

        expect(allowance.toString()).to.equal("0");

        const approve_tx = await l1Token.approve(accounts[1], 100, {
          gasLimit: 2000000,
        });
        let r = await approve_tx.wait();
        allowance = await l1Token.allowance(accounts[0], accounts[1]);
        console.log("Allowance: ", allowance)

        expect(allowance.toString()).to.equal("100");
    });
});
