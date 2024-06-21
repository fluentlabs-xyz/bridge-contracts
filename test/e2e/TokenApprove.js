const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = require("hardhat");

const helpers = require(`../../helpers`);

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
      ethers.parseEther("1000000"),
      owner.address,
    ]);
    mockERC20Token = await mockERC20Token.waitForDeployment();
    console.log(`MockERC20Token: ${mockERC20Token.address}`);
  });

  it("Approve function should work", async () => {
    let allowance = await mockERC20Token.allowance(
      owner.address,
      addr1.address,
    );
    expect(allowance.toString()).to.equal("0");

    const approveTx = await mockERC20Token.approve(addr1.address, 100);
    console.log(await approveTx.wait());

    allowance = await mockERC20Token.allowance(owner.address, addr1.address);
    expect(allowance.toString()).to.equal("100");
  });
});
