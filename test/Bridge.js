const { expect } = require("chai");
const { BigNumber, AbiCoder} = require("ethers");

describe("Bridge", function () {
  let bridge;
  let rollup;

  before(async function () {

    const VerifierContract = await ethers.getContractFactory("VerifierMock");

    let verifier = await VerifierContract.deploy();

    const RollupContract = await ethers.getContractFactory("Rollup");
    const vkKey = "0x00612f9d5a388df116872ff70e36bcb86c7e73b1089f32f68fc8e0d0ba7861b7"
    const genesisHash = "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470";
    rollup = await RollupContract.deploy(0,0,0,verifier.target, vkKey, genesisHash, "0x0000000000000000000000000000000000000000", 2);

    const BridgeContract = await ethers.getContractFactory("Bridge");
    const accounts = await hre.ethers.getSigners();

    bridge = await BridgeContract.deploy(accounts[0].address, rollup.target);
    bridge = await bridge.waitForDeployment();
  });

  it("Send message test", async function () {
    const accounts = await hre.ethers.getSigners();
    const contractWithSigner = bridge.connect(accounts[0]);
    const origin_bridge_balance = await hre.ethers.provider.getBalance(
      bridge.target,
    );

    const send_tx = await contractWithSigner.sendMessage(
      "0x1111111111111111111111111111111111111111",
      "0x0102030405",
      { value: 2000 },
    );

    await send_tx.wait();

    const events = await bridge.queryFilter("SentMessage", send_tx.blockNumber);

    expect(events.length).to.equal(1);

    expect(events[0].args.sender).to.equal(await accounts[0].getAddress());

    const bridge_balance = await hre.ethers.provider.getBalance(bridge.target);

    expect(bridge_balance - origin_bridge_balance).to.be.eql(
      2000n,
    );
  });

  it("Receive message test", async function () {
    const accounts = await hre.ethers.getSigners();
    const contractWithSigner = bridge.connect(accounts[0]);

    const receiverAddress = await accounts[1].getAddress();

    const origin_balance =
      await hre.ethers.provider.getBalance(receiverAddress);

    const receive_tx = await contractWithSigner.receiveMessage(
      "0x1111111111111111111111111111111111111111",
      receiverAddress,
      200,
      0,
      "0x",
    );

    await receive_tx.wait();

    const error_events = await bridge.queryFilter(
      "Error",
      receive_tx.blockNumber,
    );
    console.log("Error: ", error_events);

    const events = await bridge.queryFilter(
      "ReceivedMessage",
      receive_tx.blockNumber,
    );

    expect(events.length).to.equal(1);
    expect(events[0].args.messageHash).to.equal(
      "0x5e6af7e11771fafdbeba41d9781ea9a8fcdac0a801b5df4deebde301997fc061",
    );
    expect(events[0].args.successfulCall).to.equal(true);

    const new_balance = await hre.ethers.provider.getBalance(receiverAddress);
    expect(new_balance - origin_balance).to.be.eql(200n);

    let messageStatus = await bridge.receivedMessage(
      events[0].args.messageHash,
    );
    console.log("Message status: ", messageStatus);

    try {
      const repeat_receive_tx = await contractWithSigner.receiveMessage(
        "0x1111111111111111111111111111111111111111",
        receiverAddress,
        200,
        0,
        "0x",
      );

      await repeat_receive_tx.wait();
    } catch (error) {
      expect(error.toString()).to.equal(
        "Error: VM Exception while processing transaction: " +
          "reverted with reason string 'message received out of turn'",
      );
    }
  });

  it("Receive message with proof test", async function () {
    const accounts = await hre.ethers.getSigners();
    const rollupContractWithSigner = rollup.connect(accounts[0]);
    const receiverAddress = await accounts[1].getAddress();

    let messageHash = hre.ethers.keccak256(
        AbiCoder.defaultAbiCoder().encode(
            ["address", "address", "uint256", "uint256", "bytes"],
            [
              "0x1111111111111111111111111111111111111111",
              receiverAddress,
              100,
              0,
              "0x"
            ]
        )
    );

    const withdrawalRoot = ethers.keccak256(
        AbiCoder.defaultAbiCoder().encode(["bytes32", "bytes32"], [messageHash, messageHash])
    );

    const commitmentBatch = [
      {
        previousBlockHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        blockHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        withdrawalHash: withdrawalRoot,
        depositHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
      },
      {
        previousBlockHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        blockHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        withdrawalHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        depositHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
      }
    ];

    const hashes = commitmentBatch.map((item) => {
      return hre.ethers.keccak256(
          AbiCoder.defaultAbiCoder().encode(
              ["bytes32", "bytes32", "bytes32", "bytes32"],
              [
                item.previousBlockHash,
                item.blockHash,
                item.withdrawalHash,
                item.depositHash,
              ]
          )
      );
    });



    const merkleRoot = ethers.keccak256(
        AbiCoder.defaultAbiCoder().encode(["bytes32", "bytes32"], [hashes[0], hashes[1]])
    );

    await rollupContractWithSigner.acceptNextBatch(
      0,
      commitmentBatch,
      [],
    );

    let batchHash = await rollupContractWithSigner.acceptedBatchHash(0);

    expect(merkleRoot).to.equal(batchHash);

    const contractWithSigner = bridge.connect(accounts[0]);



    const origin_balance =
      await hre.ethers.provider.getBalance(receiverAddress);

    let receive_tx = await contractWithSigner.receiveMessageWithProof(
      0,
      commitmentBatch[0],
      "0x1111111111111111111111111111111111111111",
      receiverAddress,
      100,
      0,
      "0x",
      0,
      messageHash,
      0,
      hashes[1],
    );

    await receive_tx.wait();

    let events = await bridge.queryFilter(
      "ReceivedMessage",
      receive_tx.blockNumber,
    );

    expect(events.length).to.equal(1);
    expect(events[0].args.messageHash).to.equal(
      "0x1fbe8b16b467b65c93cc416c9f6a43585820a41b90f14f6b74abe46e017fac75",
    );
    expect(events[0].args.successfulCall).to.equal(true);

    let new_balance = await hre.ethers.provider.getBalance(receiverAddress);
    expect(new_balance - origin_balance).to.be.eql(100n);

    // await rollupContractWithSigner.acceptNextProof(
    //   2,
    //   "0x3e13975f9e4165cf4119f2f82528f20d0ba7d1ab18cf62b0e07a625fdcb600ba",
    //   "0x",
    // );
    //
    // receive_tx = await contractWithSigner.receiveMessageWithProof(
    //   "0x1111111111111111111111111111111111111111",
    //   receiverAddress,
    //   100,
    //   1,
    //   "0x",
    //   Buffer.from(
    //     "1fbe8b16b467b65c93cc416c9f6a43585820a41b90f14f6b74abe46e017fac75",
    //     "hex",
    //   ),
    //   2,
    // );
    //
    // events = await bridge.queryFilter(
    //   "ReceivedMessage",
    //   receive_tx.blockNumber,
    // );
    //
    // expect(events.length).to.equal(1);
    // expect(events[0].args.messageHash).to.equal(
    //   "0x835612469dd5d58ef5be0da80c826de8354bbdd63eec7aea2dcca10ab8c0ff73",
    // );
    // expect(events[0].args.successfulCall).to.equal(true);
    //
    // new_balance = await hre.ethers.provider.getBalance(receiverAddress);
    // expect(new_balance - origin_balance).to.be.eql(200n);
    //
    // await rollupContractWithSigner.acceptNextProof(
    //   3,
    //   "0xf205d0a2ae61551dafb4c8b459883c5ad295948069f23d97d9e2e5a21f02ab7b",
    //   "0x",
    // );
    //
    // receive_tx = await contractWithSigner.receiveMessageWithProof(
    //   "0x1111111111111111111111111111111111111111",
    //   receiverAddress,
    //   100,
    //   2,
    //   "0x",
    //   Buffer.from(
    //     "00000000000000000000000000000000000000000000000000000000000000003e13975f9e4165cf4119f2f82528f20d0ba7d1ab18cf62b0e07a625fdcb600ba",
    //     "hex",
    //   ),
    //   3,
    // );
    //
    // events = await bridge.queryFilter(
    //   "ReceivedMessage",
    //   receive_tx.blockNumber,
    // );
    //
    // expect(events.length).to.equal(1);
    // expect(events[0].args.messageHash).to.equal(
    //   "0x6bb3a22ed7bf22ee8607e5c6afad2b02dde06fe81be5723452da97b74b162c87",
    // );
    // expect(events[0].args.successfulCall).to.equal(true);
    //
    // new_balance = await hre.ethers.provider.getBalance(receiverAddress);
    // expect(new_balance - origin_balance).to.be.eql(300n);
  });
});
