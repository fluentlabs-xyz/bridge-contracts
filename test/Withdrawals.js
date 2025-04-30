const { expect } = require("chai");
const { sleep } = require("@nomicfoundation/hardhat-verify/internal/utilities");


describe("Withdrawals", function () {
  let rollup;

  before(async function () {
    const Verifier = await ethers.getContractFactory("SP1Verifier");
    let verifier = await Verifier.deploy();

    console.log("Verifier: ", verifier.target)

    const RollupContract = await ethers.getContractFactory("Rollup.sol");
    const vkKey = "0x00612f9d5a388df116872ff70e36bcb86c7e73b1089f32f68fc8e0d0ba7861b7"
    const genesisHash = "0xd860e48c1f1644c9e6ca9869006c2e272e04dc3cb05a577342dce721287fc869";
    rollup = await RollupContract.deploy(10000,0,1, verifier.target, vkKey, genesisHash, "0x0000000000000000000000000000000000000000");

    await rollup.setDaCheck(false)
  });

});
