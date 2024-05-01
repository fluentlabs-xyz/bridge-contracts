const {expect} = require("chai");
const {ethers} = require("hardhat");

describe("Token approval test", () => {

    let mockERC20Token;
    let owner, addr1;

    before(async () => {
        [owner, addr1] = await ethers.getSigners();
        console.log(`Owner: ${owner.address}`);
        console.log(`Recipient: ${addr1.address}`);
        mockERC20Token = await ethers.deployContract("MockERC20Token", [
            "Mock Token",
            "TKN",
            ethers.utils.parseEther("1000000"),
            owner.address,
        ]);
        await mockERC20Token.deployed();
        console.log(`MockERC20Token: ${mockERC20Token.address}`);
    })

    it("Approve function should work", async () => {
        let allowance = await mockERC20Token.allowance(owner.address, addr1.address);
        expect(allowance.toString()).to.equal("0");

        const approveTx = await mockERC20Token.approve(addr1.address, 100);
        console.log(await approveTx.wait());

        allowance = await mockERC20Token.allowance(owner.address, addr1.address);
        expect(allowance.toString()).to.equal("100");
    });
});
