const { expect } = require("chai");
const { sleep } = require("@nomicfoundation/hardhat-verify/internal/utilities");

describe("BatchRollup.sol", function () {
  let rollup;

  before(async function () {
    const Verifier = await ethers.getContractFactory("BatchVerifierMock");
    let verifier = await Verifier.deploy();

    console.log("Verifier: ", verifier.target)

    const RollupContract = await ethers.getContractFactory("BatchRollup");
    rollup = await RollupContract.deploy(10000,0,1, verifier.target);

    await rollup.setDaCheck(false)
  });

  it("Calculate merkle root", async function () {
    let tx = await rollup.calculateMerkleRoot(
        "0x1fbe8b16b467b65c93cc416c9f6a43585820a41b90f14f6b74abe46e017fac75",
    );

    expect(tx).to.eq(
      "0x1fbe8b16b467b65c93cc416c9f6a43585820a41b90f14f6b74abe46e017fac75",
    );

    tx = await rollup.calculateMerkleRoot(
        "0x1fbe8b16b467b65c93cc416c9f6a43585820a41b90f14f6b74abe46e017fac753e13975f9e4165cf4119f2f82528f20d0ba7d1ab18cf62b0e07a625fdcb600ba",
    );

    expect(tx).to.eq(
      "0xc40056c5e162e060269929562bcfe7c13a1a3f1cea0287e768c5f5099e0f9782",
    );

    tx = await rollup.calculateMerkleRoot(
        "0x1fbe8b16b467b65c93cc416c9f6a43585820a41b90f14f6b74abe46e017fac753e13975f9e4165cf4119f2f82528f20d0ba7d1ab18cf62b0e07a625fdcb600ba6bb3a22ed7bf22ee8607e5c6afad2b02dde06fe81be5723452da97b74b162c87",
    );

    expect(tx).to.eq(
      "0x29c5ae5ebeb9a8bcb439deab2744247a57177e2af1fa22ab0873286b1d7d89d7",
    );
  });

  it("Accept proof", async function () {
    const accounts = await hre.ethers.getSigners();
    const rollupContractWithSigner = rollup.connect(accounts[0]);

    let batchIndex = await rollupContractWithSigner.lastBatchedIndex();

    expect(await rollupContractWithSigner.acceptedBatch(batchIndex + 1n)).to.eq(false);
    expect(await rollupContractWithSigner.approvedBatch(batchIndex + 1n)).to.eq(false);


    let defaultBatchHeader = ethers.solidityPacked(
        ["uint8", "uint64", "uint256", "uint256", "uint256"],
        [
          0,
          0,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        ])


    await rollupContractWithSigner.acceptNextBatch(
        batchIndex + 1n,
        "0x1fbe8b16b467b65c93cc416c9f6a43585820a41b90f14f6b74abe46e017fac75",
        "0x",
        "0x",
        "0x",
        defaultBatchHeader
    );

    let newBatchIndex = await rollupContractWithSigner.lastBatchedIndex();
    expect(newBatchIndex).to.eq(batchIndex + 1n);
    expect(await rollupContractWithSigner.acceptedBatch(newBatchIndex)).to.eq(true);
  });


  it("Proof check", async function () {
    const accounts = await hre.ethers.getSigners();
    const rollupContractWithSigner = rollup.connect(accounts[0]);

    let batchIndex = await rollupContractWithSigner.lastBatchedIndex();

    let parentBatchHash;
    if (batchIndex > 1n) {
      parentBatchHash = await rollupContractWithSigner.acceptedBatchHash(batchIndex - 1n);
    } else {
      parentBatchHash = "0x0000000000000000000000000000000000000000000000000000000000000000"
    }

    let parentBatchHeader = ethers.solidityPacked(
        ["uint8", "uint64", "uint256", "uint256", "uint256"],
        [
          0,
          batchIndex,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          parentBatchHash
        ])

    await rollupContractWithSigner.acceptNextBatch(
        batchIndex + 1n,
        "0x1fbe8b16b467b65c93cc416c9f6a43585820a41b90f14f6b74abe46e017fac75",
        "0x",
        "0x",
        "0x",
        parentBatchHeader
    );

    await sleep(2000)
    let newBatchIndex = await rollupContractWithSigner.lastBatchedIndex();

    if (newBatchIndex > 1n) {
      parentBatchHash = await rollupContractWithSigner.acceptedBatchHash(newBatchIndex - 1n);
    } else {
      parentBatchHash = "0x0000000000000000000000000000000000000000000000000000000000000000"
    }

    parentBatchHeader = ethers.solidityPacked(
        ["uint8", "uint64", "uint256", "uint256", "uint256"],
        [
          0,
          newBatchIndex,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          parentBatchHash
        ])

    await rollupContractWithSigner.acceptNextBatch(
        newBatchIndex + 1n,
        "0x1fbe8b16b467b65c93cc416c9f6a43585820a41b90f14f6b74abe46e017fac75",
        "0x",
        "0x",
        "0x",
        parentBatchHeader
    );

    expect(await rollupContractWithSigner.approvedBatch(1)).to.eq(true);

    let challenge = await rollupContractWithSigner.getChallengeQueue();

    let challengeLen = challenge.length

    await rollupContractWithSigner.challengeBatch(
        newBatchIndex + 1n, {
          value: 10000
        }
    );

    challenge = await rollupContractWithSigner.getChallengeQueue();
    expect(challenge.length).to.eq(1);

    await rollupContractWithSigner.proofBatch(newBatchIndex + 1n, "0x");

    challenge = await rollupContractWithSigner.getChallengeQueue()

    expect(challenge.length).to.eq(challengeLen);
  });

  it("Revert check", async function () {
    const accounts = await hre.ethers.getSigners();
    const rollupContractWithSigner = rollup.connect(accounts[0]);

    let batchIndex = await rollupContractWithSigner.lastBatchedIndex();

      let parentBatchHash;
      if (batchIndex > 1n) {
          parentBatchHash = await rollupContractWithSigner.acceptedBatchHash(batchIndex - 1n);
      } else {
          parentBatchHash = "0x0000000000000000000000000000000000000000000000000000000000000000"
      }

      let parentBatchHeader = ethers.solidityPacked(
          ["uint8", "uint64", "uint256", "uint256", "uint256"],
          [
              0,
              batchIndex,
              "0x0000000000000000000000000000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000000000000000000000000000",
              parentBatchHash
          ])

    await rollupContractWithSigner.acceptNextBatch(
        batchIndex + 1n,
        "0x1fbe8b16b467b65c93cc416c9f6a43585820a41b90f14f6b74abe46e017fac75",
        "0x",
        "0x",
        "0x",
        parentBatchHeader
    );

    await sleep(2000)

    let newBatchIndex = await rollupContractWithSigner.lastBatchedIndex();

      if (newBatchIndex > 1n) {
          parentBatchHash = await rollupContractWithSigner.acceptedBatchHash(newBatchIndex - 1n);
      } else {
          parentBatchHash = "0x0000000000000000000000000000000000000000000000000000000000000000"
      }

      parentBatchHeader = ethers.solidityPacked(
          ["uint8", "uint64", "uint256", "uint256", "uint256"],
          [
              0,
              newBatchIndex,
              "0x0000000000000000000000000000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000000000000000000000000000",
              parentBatchHash
          ])


    await rollupContractWithSigner.acceptNextBatch(
        newBatchIndex + 1n,
        "0x1fbe8b16b467b65c93cc416c9f6a43585820a41b90f14f6b74abe46e017fac75",
        "0x",
        "0x",
        "0x",
        parentBatchHeader
    );

    expect(await rollupContractWithSigner.approvedBatch(1)).to.eq(true);

    await rollupContractWithSigner.challengeBatch(
        newBatchIndex + 1n, {
          value: 10000
        }
    );

    expect(await rollupContractWithSigner.rollupCorrupted()).to.eq(false);

    await sleep(2000)

    await accounts[0].sendTransaction(
        {
          to: accounts[1].address,
          value: 10
        }
    )

    expect(await rollupContractWithSigner.rollupCorrupted()).to.eq(true);

    await rollupContractWithSigner.forceRevertBatch(batchIndex)

    expect(await rollupContractWithSigner.rollupCorrupted()).to.eq(false);
  });

  it("Corrupted check", async function () {
    const accounts = await hre.ethers.getSigners();
    const rollupContractWithSigner = rollup.connect(accounts[0]);

    let batchIndex = await rollupContractWithSigner.lastBatchedIndex();
      let parentBatchHash;
      if (batchIndex > 1n) {
          parentBatchHash = await rollupContractWithSigner.acceptedBatchHash(batchIndex - 1n);
      } else {
          parentBatchHash = "0x0000000000000000000000000000000000000000000000000000000000000000"
      }

      let parentBatchHeader = ethers.solidityPacked(
          ["uint8", "uint64", "uint256", "uint256", "uint256"],
          [
              0,
              batchIndex,
              "0x0000000000000000000000000000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000000000000000000000000000",
              parentBatchHash
          ])

      await rollupContractWithSigner.acceptNextBatch(
          batchIndex + 1n,
          "0x1fbe8b16b467b65c93cc416c9f6a43585820a41b90f14f6b74abe46e017fac75",
          "0x",
          "0x",
          "0x",
          parentBatchHeader
      );
    await sleep(2000)

    let newBatchIndex = await rollupContractWithSigner.lastBatchedIndex();

      if (newBatchIndex > 1n) {
          parentBatchHash = await rollupContractWithSigner.acceptedBatchHash(newBatchIndex - 1n);
      } else {
          parentBatchHash = "0x0000000000000000000000000000000000000000000000000000000000000000"
      }

      parentBatchHeader = ethers.solidityPacked(
          ["uint8", "uint64", "uint256", "uint256", "uint256"],
          [
              0,
              newBatchIndex,
              "0x0000000000000000000000000000000000000000000000000000000000000000",
              "0x0000000000000000000000000000000000000000000000000000000000000000",
              parentBatchHash
          ])


      await rollupContractWithSigner.acceptNextBatch(
          newBatchIndex + 1n,
          "0x1fbe8b16b467b65c93cc416c9f6a43585820a41b90f14f6b74abe46e017fac75",
          "0x",
          "0x",
          "0x",
          parentBatchHeader
      );

    expect(await rollupContractWithSigner.approvedBatch(1)).to.eq(true);

    await rollupContractWithSigner.challengeBatch(
        newBatchIndex + 1n, {
          value: 10000
        }
    );

    expect(await rollupContractWithSigner.rollupCorrupted()).to.eq(false);

    await sleep(2000)

    await accounts[0].sendTransaction(
        {
          to: accounts[1].address,
          value: 10
        }
    )

    expect(await rollupContractWithSigner.rollupCorrupted()).to.eq(true);
  });
});
