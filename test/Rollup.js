const { expect } = require("chai");
const { sleep } = require("@nomicfoundation/hardhat-verify/internal/utilities");


describe("Rollup.sol", function () {
  let rollup;

  before(async function () {
    const Verifier = await ethers.getContractFactory("VerifierMock");
    let verifier = await Verifier.deploy();

    console.log("Verifier: ", verifier.target)

    const RollupContract = await ethers.getContractFactory("Rollup");
    const vkKey = "0x00612f9d5a388df116872ff70e36bcb86c7e73b1089f32f68fc8e0d0ba7861b7"
    const genesisHash = "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470";
    const BridgeContract = await ethers.getContractFactory("Bridge");
    let bridge = await BridgeContract.deploy("0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000", 0)

    rollup = await RollupContract.deploy(10000,0,1, verifier.target, vkKey, genesisHash, bridge.target, 2, 10);

    await rollup.setDaCheck(false)
  });

  it("Accept proof", async function () {
    const accounts = await hre.ethers.getSigners();
    const rollupContractWithSigner = rollup.connect(accounts[0]);

    let batchIndex = await rollupContractWithSigner.nextBatchIndex();

    expect(await rollupContractWithSigner.acceptedBatch(batchIndex)).to.eq(false);
    expect(await rollupContractWithSigner.approvedBatch(batchIndex)).to.eq(false);

    const commitmentBatch = [
      {
        previousBlockHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        blockHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        withdrawalHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        depositHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
      },
      {
        previousBlockHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        blockHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        withdrawalHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        depositHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
      }
    ];

    const depositsInBlocks = [];

    await rollupContractWithSigner.acceptNextBatch(
        batchIndex,
        commitmentBatch,
        depositsInBlocks
    );

    let newBatchIndex = await rollupContractWithSigner.nextBatchIndex();

    await network.provider.send("evm_mine");

    expect(newBatchIndex).to.eq(batchIndex + 1n);
    expect(await rollupContractWithSigner.acceptedBatch(batchIndex)).to.eq(true);
  });


  it("Proof check", async function () {
    const accounts = await hre.ethers.getSigners();
    const rollupContractWithSigner = rollup.connect(accounts[0]);

    let batchIndex = await rollupContractWithSigner.nextBatchIndex();

    const commitmentBatch = [
      {
        previousBlockHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        blockHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        withdrawalHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        depositHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
      },
      {
        previousBlockHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        blockHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        withdrawalHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        depositHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
      }
    ];

    await rollupContractWithSigner.acceptNextBatch(
        batchIndex,
        commitmentBatch,
        []
    );

    await network.provider.send("evm_mine");

    let nextBatchIndex = await rollupContractWithSigner.nextBatchIndex();


    await rollupContractWithSigner.acceptNextBatch(
        nextBatchIndex,
        commitmentBatch,
        []
    );


    expect(await rollupContractWithSigner.approvedBatch(batchIndex)).to.eq(true);

    let challenge = await rollupContractWithSigner.getChallengeQueue();

    let challengeLen = challenge.length

    await rollupContractWithSigner.challengeBatch(
        nextBatchIndex, {
          value: 10000
        }
    );

    challenge = await rollupContractWithSigner.getChallengeQueue();
    expect(challenge.length).to.eq(1);

    await rollupContractWithSigner.proofBatch(nextBatchIndex, "0x11b6a09d2c70b2e4fb214226fd0106a590dca00c2a0ec62e34e7ffdd11c788703fc26d61035980a75458baf4393fdf65478f94d960953de6fd03f31fc868c8c93087c8662e985b53c4ac8502c1f917bb20968844d0d55eda08ed5d6144b4e5feaa8e444d103a3f3230489985fa76eb73f89fef51d2f7c5e0c184be7ab74f1c9640e6651618f259ab8d0616b26ff75ccfea92f789502b89892a6fb67ec47932f8f575d2a912ea41c5f75e0440efce92e9dc9cc43647989cd570404e88f757318e2ae5696a24cf008895debedf7735532ecaae629ff1a636493476f0cdf8aa7e05f4b792a7180e9a7f185b545461e083e9997b0a8fe3e1fe85cda87da247a07edc043c4a6e");

    challenge = await rollupContractWithSigner.getChallengeQueue()

    expect(challenge.length).to.eq(challengeLen);
  });

  it("Revert check", async function () {
    const accounts = await hre.ethers.getSigners();
    const rollupContractWithSigner = rollup.connect(accounts[0]);

    const commitmentBatch = [
      {
        previousBlockHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        blockHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        withdrawalHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        depositHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
      },
      {
        previousBlockHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        blockHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        withdrawalHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        depositHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
      }
    ];

    let nextBatchIndex = await rollupContractWithSigner.nextBatchIndex();
    console.log("Revert: ", nextBatchIndex);
    await rollupContractWithSigner.acceptNextBatch(
        nextBatchIndex,
        commitmentBatch,
        []
    );

    expect(await rollupContractWithSigner.approvedBatch(1)).to.eq(true);

    await rollupContractWithSigner.challengeBatch(
        nextBatchIndex, {
          value: 10000
        }
    );

    expect(await rollupContractWithSigner.rollupCorrupted()).to.eq(false);

    await accounts[0].sendTransaction(
        {
          to: accounts[1].address,
          value: 10
        }
    )

    expect(await rollupContractWithSigner.rollupCorrupted()).to.eq(true);

    await rollupContractWithSigner.forceRevertBatch(nextBatchIndex)

    expect(await rollupContractWithSigner.rollupCorrupted()).to.eq(false);
  });

  it("Corrupted check", async function () {
    const accounts = await hre.ethers.getSigners();
    const rollupContractWithSigner = rollup.connect(accounts[0]);

    let nextBatchIndex = await rollupContractWithSigner.nextBatchIndex();
    console.log("corrupt: ", nextBatchIndex);

    const commitmentBatch = [
      {
        previousBlockHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        blockHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        withdrawalHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        depositHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
      },
      {
        previousBlockHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        blockHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        withdrawalHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        depositHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
      }
    ];

    await rollupContractWithSigner.acceptNextBatch(
        nextBatchIndex,
        commitmentBatch,
        []
    );

    expect(await rollupContractWithSigner.approvedBatch(1)).to.eq(true);

    await rollupContractWithSigner.challengeBatch(
        nextBatchIndex, {
          value: 10000
        }
    );

    expect(await rollupContractWithSigner.rollupCorrupted()).to.eq(false);

    await accounts[0].sendTransaction(
        {
          to: accounts[1].address,
          value: 10
        }
    )

    expect(await rollupContractWithSigner.rollupCorrupted()).to.eq(true);
  });
});
