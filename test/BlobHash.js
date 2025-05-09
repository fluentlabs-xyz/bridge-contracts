const { expect } = require("chai");
const { ethers } = require("hardhat");
const {sleep} = require("@nomicfoundation/hardhat-verify/internal/utilities");


if (network.name !== "holesky") {
    console.log("Skipping test: Not running on myNetwork");
    return;
}

describe("BlobHash", function () {
    let blobHash;

    before(async function () {
        const accounts = await hre.ethers.getSigners();

        const BlobHash= await ethers.getContractFactory("BlobHashMock");
        blobHash = await BlobHash.deploy();

        console.log("BlobHash: ", blobHash.target);
    });

    it("Blob hash test", async function () {
        await blobHash.CheckBlobHash("0xaabd0e6b0c50a1c1c2c03bb979254284b049492e923d028a4f3f9bde9c2dd0ad6aa738e24a97d0bcac9aa6d28be26059");
    });
});
