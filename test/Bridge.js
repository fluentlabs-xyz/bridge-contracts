const { expect } = require("chai");
const { BigNumber } = require("ethers");

describe("Bridge", function () {
  let bridge;
  let rollup;

  before(async function () {
    const RollupContract = await ethers.getContractFactory("BatchRollup");
    rollup = await RollupContract.deploy(0,0,0,"0x0000000000000000000000000000000000000000");

    const BridgeContract = await ethers.getContractFactory("Bridge");
    const accounts = await hre.ethers.getSigners();

    bridge = await BridgeContract.deploy(accounts[0].address, rollup.target);
    bridge = await bridge.waitForDeployment();

    let setBridge = await rollup.setBridge(bridge.target);
    await setBridge.wait();
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
          "reverted with reason string 'Message already received'",
      );
    }
  });

  it("Receive message with proof test", async function () {
    const accounts = await hre.ethers.getSigners();
    const rollupContractWithSigner = rollup.connect(accounts[0]);

    await rollupContractWithSigner.acceptNextProof(
      1,
      "0x1fbe8b16b467b65c93cc416c9f6a43585820a41b90f14f6b74abe46e017fac75",
      "0x",
    );

    const contractWithSigner = bridge.connect(accounts[0]);

    const receiverAddress = await accounts[1].getAddress();

    const origin_balance =
      await hre.ethers.provider.getBalance(receiverAddress);

    let receive_tx = await contractWithSigner.receiveMessageWithProof(
      "0x1111111111111111111111111111111111111111",
      receiverAddress,
      100,
      0,
      "0x",
      "0x",
      1,
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

    await rollupContractWithSigner.acceptNextProof(
      2,
      "0x3e13975f9e4165cf4119f2f82528f20d0ba7d1ab18cf62b0e07a625fdcb600ba",
      "0x",
    );

    receive_tx = await contractWithSigner.receiveMessageWithProof(
      "0x1111111111111111111111111111111111111111",
      receiverAddress,
      100,
      1,
      "0x",
      Buffer.from(
        "1fbe8b16b467b65c93cc416c9f6a43585820a41b90f14f6b74abe46e017fac75",
        "hex",
      ),
      2,
    );

    events = await bridge.queryFilter(
      "ReceivedMessage",
      receive_tx.blockNumber,
    );

    expect(events.length).to.equal(1);
    expect(events[0].args.messageHash).to.equal(
      "0x835612469dd5d58ef5be0da80c826de8354bbdd63eec7aea2dcca10ab8c0ff73",
    );
    expect(events[0].args.successfulCall).to.equal(true);

    new_balance = await hre.ethers.provider.getBalance(receiverAddress);
    expect(new_balance - origin_balance).to.be.eql(200n);

    await rollupContractWithSigner.acceptNextProof(
      3,
      "0xf205d0a2ae61551dafb4c8b459883c5ad295948069f23d97d9e2e5a21f02ab7b",
      "0x",
    );

    receive_tx = await contractWithSigner.receiveMessageWithProof(
      "0x1111111111111111111111111111111111111111",
      receiverAddress,
      100,
      2,
      "0x",
      Buffer.from(
        "00000000000000000000000000000000000000000000000000000000000000003e13975f9e4165cf4119f2f82528f20d0ba7d1ab18cf62b0e07a625fdcb600ba",
        "hex",
      ),
      3,
    );

    events = await bridge.queryFilter(
      "ReceivedMessage",
      receive_tx.blockNumber,
    );

    expect(events.length).to.equal(1);
    expect(events[0].args.messageHash).to.equal(
      "0x6bb3a22ed7bf22ee8607e5c6afad2b02dde06fe81be5723452da97b74b162c87",
    );
    expect(events[0].args.successfulCall).to.equal(true);

    new_balance = await hre.ethers.provider.getBalance(receiverAddress);
    expect(new_balance - origin_balance).to.be.eql(300n);
  });
});
