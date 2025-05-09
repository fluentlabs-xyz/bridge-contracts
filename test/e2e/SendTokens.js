const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TestingCtx, log } = require("./helpers");
const { sleep } = require("@nomicfoundation/hardhat-verify/internal/utilities");

const TX_RECEIPT_STATUS_SUCCESS = 1;
const TX_RECEIPT_STATUS_REVERT = 0;

describe("Send tokens test", () => {
  let ctxL1;
  let ctxL2;

  let l2TokenContract;
  let l2GatewayContract, l1GatewayContract;
  let l2BridgeContract, l1BridgeContract;
  let l2ImplementationAddress, l1ImplementationAddress;
  let l2FactoryAddress, l1FactoryAddress;
  let rollupContract;

  before(async () => {
    ctxL1 = TestingCtx.new_L1();
    ctxL2 = TestingCtx.new_L2();

    // await CheckLogsOnly(ctxL2);

    await ctxL1.printDebugInfoAsync();
    await ctxL2.printDebugInfoAsync();

    const [ownerL2] = ctxL2.accounts;

    // erc20GatewayContract, bridgeContract, peggedTokenContract.address, erc20TokenContract.address
    [
      l2GatewayContract,
      l2BridgeContract,
      l2ImplementationAddress,
      l2FactoryAddress,
    ] = await SetUpChain(ctxL2, true);
    [
      l1GatewayContract,
      l1BridgeContract,
      l1ImplementationAddress,
      l1FactoryAddress,
    ] = await SetUpChain(ctxL1, false, 10);

    log("Linking bridges");
    const mockErc20TokenFactory =
      await ethers.getContractFactory("MockERC20Token");
    log(`started l2TokenContract deploy`);
    l2TokenContract = await mockErc20TokenFactory
      .connect(ownerL2)
      .deploy("Mock Token", "TKN", ethers.parseEther("10"), ownerL2.address, {
        gasLimit: 30_000_000,
      });
    l2TokenContract = await l2TokenContract.waitForDeployment();
    log(`l2TokenContract.address: ${l2TokenContract.target}`);

    log(
      `l1GatewayContract.address: ${l1GatewayContract.target} l2GatewayContract.address: ${l2GatewayContract.target}`,
    );

    log(`setOtherSideTx started`);
    let setOtherSideTx = await l2GatewayContract.setOtherSide(
      l1GatewayContract.target,
      l1ImplementationAddress,
      l1FactoryAddress,
    );
    let setOtherSideReceipt = await setOtherSideTx.wait();
    log(`setOtherSideReceipt:`, setOtherSideReceipt);
    expect(setOtherSideReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);
    log(`setOtherSideTx started`);
    setOtherSideTx = await l1GatewayContract.setOtherSide(
      l2GatewayContract.target,
      l2ImplementationAddress,
      l2FactoryAddress,
    );
    setOtherSideReceipt = await setOtherSideTx.wait();
    log(`setOtherSideReceipt:`, setOtherSideReceipt);
    expect(setOtherSideReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);
  });

  async function SetUpChain(ctx, withRollup = false, receiveDeadLine = 0) {
    log(`SetUp chain for ${ctx.networkName} (withRollup=${withRollup})`);

    const owner = ctx.owner();

    const erc20PeggedTokenFactory =
      await ethers.getContractFactory("ERC20PeggedToken");
    log(`peggedTokenContract started deploy`);
    let peggedTokenContract = await erc20PeggedTokenFactory
      .connect(owner)
      .deploy({
        gasLimit: 30_000_000,
      });
    peggedTokenContract = await peggedTokenContract.waitForDeployment();
    log("peggedTokenContract.address:", peggedTokenContract.target);
    let peggedTokenContractTxReceipt = await peggedTokenContract
      .deploymentTransaction()
      .wait();
    expect(peggedTokenContractTxReceipt.status).to.eq(
      TX_RECEIPT_STATUS_SUCCESS,
    );

    let rollupContractAddress = "0x0000000000000000000000000000000000000000";
    if (withRollup) {
      const VerifierContract = await ethers.getContractFactory("VerifierMock");

      let verifier = await VerifierContract.deploy();
      const rollupFactory = await ethers.getContractFactory("Rollup");
      const vkKey = "0x00612f9d5a388df116872ff70e36bcb86c7e73b1089f32f68fc8e0d0ba7861b7"
      const genesisHash = "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470";

      log(`rollupContract started deploy`);
      rollupContract = await rollupFactory.connect(owner).deploy(0,0,0,verifier.target, vkKey, genesisHash, "0x0000000000000000000000000000000000000000", 1, 100);
      rollupContractAddress = rollupContract.target;
      log("rollupContractAddress:", rollupContractAddress);
      let rollupContractTxReceipt = await rollupContract
        .deploymentTransaction()
        .wait();
      expect(rollupContractTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);
    }

    const bridgeFactory = await ethers.getContractFactory("Bridge");
    log(`bridgeContract started deploy`);

    await sleep(1000);
    let bridgeContract = await bridgeFactory
      .connect(owner)
      .deploy(owner.address, rollupContractAddress, receiveDeadLine);
    bridgeContract = await bridgeContract.waitForDeployment();
    log(`bridgeContract.address: ${bridgeContract.target}`);
    let bridgeContractTxReceipt = await bridgeContract
      .deploymentTransaction()
      .wait();
    log(`bridgeContractTxReceipt:`, bridgeContractTxReceipt);
    expect(bridgeContractTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

    if (withRollup) {
      log(`setBridgeTx started`);
      let setBridgeTx = await rollupContract.setBridge(bridgeContract.target);
      let setBridgeTxReceipt = await setBridgeTx.wait();
      log(`setBridgeTxReceipt:`, setBridgeTxReceipt);
      expect(setBridgeTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);
    }

    await sleep(1000);

    const erc20TokenFactory =
      await ethers.getContractFactory("ERC20TokenFactory");
    log(`erc20TokenContract started deploy`);
    let erc20TokenContract = await erc20TokenFactory
      .connect(owner)
      .deploy(peggedTokenContract.target);
    erc20TokenContract = await erc20TokenContract.waitForDeployment();
    log(`erc20tokenContract.address: ${erc20TokenContract.target}`);
    let erc20tokenContractTxReceipt = await erc20TokenContract
      .deploymentTransaction()
      .wait();
    log(`erc20tokenContractTxReceipt:`, erc20tokenContractTxReceipt);
    expect(erc20tokenContractTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

    const erc20GatewayFactory = await ethers.getContractFactory("ERC20Gateway");
    log(`erc20GatewayContract started deploy`);
    let erc20GatewayContract = await erc20GatewayFactory
      .connect(owner)
      .deploy(bridgeContract.target, erc20TokenContract.target, {
        value: ethers.parseEther("1000"),
        gasLimit: 30_000_000,
      });
    erc20GatewayContract = await erc20GatewayContract.waitForDeployment();
    log(`erc20GatewayContract.address: ${erc20GatewayContract.target}`);
    let erc20GatewayContractTxReceipt = await erc20GatewayContract
      .deploymentTransaction()
      .wait();
    expect(erc20GatewayContractTxReceipt.status).to.eq(
      TX_RECEIPT_STATUS_SUCCESS,
    );

    log(`erc20TokenContract.owner: ${await erc20TokenContract.owner()}`);
    const transferOwnershipTx = await erc20TokenContract.transferOwnership(
      erc20GatewayContract.target,
      {
        gasLimit: 30_000_000,
      },
    );
    let transferOwnershipTxReceipt = await transferOwnershipTx.wait();
    log("erc20TokenContract.owner:", await erc20TokenContract.owner());
    log(`transferOwnershipTxReceipt:`, transferOwnershipTxReceipt);
    expect(transferOwnershipTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

    return [
      erc20GatewayContract,
      bridgeContract,
      peggedTokenContract.target,
      erc20TokenContract.target,
    ];
  }

  it("Compare pegged token addresses", async function () {
    let peggedTokenAddress = await l2GatewayContract.computePeggedTokenAddress(
      l2TokenContract.target,
    );
    let otherSidePeggedTokenAddress =
      await l1GatewayContract.computeOtherSidePeggedTokenAddress(
        l2TokenContract.target,
      );
    expect(peggedTokenAddress).to.equal(otherSidePeggedTokenAddress);
  });

  it("Bridging tokens between contracts", async () => {
    log(`approveTx started`);
    const approveTx = await l2TokenContract.approve(
      l2GatewayContract.target,
      10,
      {
        gasLimit: 30_000_000,
      },
    );
    let approveTxReceipt = await approveTx.wait();
    log(`approveTxReceipt:`, approveTxReceipt);
    expect(approveTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

    log(`sendTokensTx started`);
    const [ownerL1] = ctxL1.accounts;
    log("signer: ", ownerL1);
    const sendTokensTx = await l2GatewayContract.sendTokens(
      l2TokenContract.target,
      ownerL1.address,
      10,
      {
        gasLimit: 30_000_000,
      },
    );
    log(`QUEUE:`, await l2BridgeContract.getQueueSize());
    log("l2TokenContract.address", l2TokenContract.target);
    let sendTokensReceipt = await sendTokensTx.wait();
    log(`sendTokensReceipt:`, sendTokensReceipt);
    expect(sendTokensReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

    // if (true) {
    //     log("l2GatewayContract.sendTokens (2nd)");
    //     const sendTokensTx = await l2GatewayContract.sendTokens(
    //         l2TokenContract.target,
    //         l1GatewayContract.signer.getAddress(),
    //         1,
    //         {
    //             gasLimit: 30_000_000,
    //         }
    //     );
    //     log("l2TokenContract.address", l2TokenContract.target);
    //     let sendTokensReceipt = await sendTokensTx.wait();
    //     log(`sendTokensReceipt:`, sendTokensReceipt)
    //     expect(sendTokensReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);
    // }

    log(
      `getting l2BridgeContractSentMessageEvents (address ${l2BridgeContract.target})`,
    );
    let l2BridgeContractSentMessageEvents = await l2BridgeContract.queryFilter(
      "SentMessage",
      sendTokensReceipt.blockNumber,
    );
    log(
      "l2BridgeContractSentMessageEvents:",
      l2BridgeContractSentMessageEvents,
    );
    expect(l2BridgeContractSentMessageEvents.length).to.equal(1);

    const l2BridgeContractSentMessageEvent0 =
      l2BridgeContractSentMessageEvents[0];

    let sendMessageHash = l2BridgeContractSentMessageEvent0.args["messageHash"];

    log("sendMessageHash:", sendMessageHash);
    log(
      "l2BridgeContractSentMessageEvent0:",
      l2BridgeContractSentMessageEvent0,
    );

    log(`l1BridgeContractReceiveMessageTx started`);
    const l1BridgeContractReceiveMessageTx =
      await l1BridgeContract.receiveMessage(
        l2BridgeContractSentMessageEvent0.args["sender"],
        l2BridgeContractSentMessageEvent0.args["to"],
        l2BridgeContractSentMessageEvent0.args["value"],
        l2BridgeContractSentMessageEvent0.args["chainId"].toString(),
        l2BridgeContractSentMessageEvent0.args["blockNumber"],
        l2BridgeContractSentMessageEvent0.args["nonce"],
        l2BridgeContractSentMessageEvent0.args["data"],
      );
    let l1BridgeContractReceiveMessageReceipt =
      await l1BridgeContractReceiveMessageTx.wait();
    log(
      `l1BridgeContractReceiveMessageReceipt:`,
      l1BridgeContractReceiveMessageReceipt,
    );
    expect(l1BridgeContractReceiveMessageReceipt.status).to.eq(
      TX_RECEIPT_STATUS_SUCCESS,
    );

    log(
      `getting l1BridgeContractReceivedMessageEvents (address ${l1BridgeContract.target})`,
    );
    const l1BridgeContractReceivedMessageEvents =
      await l1BridgeContract.queryFilter(
        "ReceivedMessage",
        l1BridgeContractReceiveMessageReceipt.blockNumber,
      );
    log(
      `l1BridgeContractReceivedMessageEvents:`,
      l1BridgeContractReceivedMessageEvents,
    );
    log(
      "Event: ",
      l1GatewayContract.target,
      l1BridgeContractReceiveMessageReceipt.blockNumber,
    );
    const l1GatewayContractReceivedTokensEvents =
      await l1GatewayContract.queryFilter(
        "ReceivedTokens",
        l1BridgeContractReceiveMessageReceipt.blockNumber,
      );
    log(
      `l1BridgeContractReceivedMessageEvents:`,
      l1BridgeContractReceivedMessageEvents,
    );

    expect(l1BridgeContractReceivedMessageEvents.length).to.equal(1);
    log(
      `l1GatewayContractReceivedTokensEvents:`,
      l1GatewayContractReceivedTokensEvents,
    );
    expect(l1GatewayContractReceivedTokensEvents.length).to.equal(1);

    log(`peggedTokenView started`);
    let peggedTokenView = await l1GatewayContract.computePeggedTokenAddress(
      l2TokenContract.target,
    );
    log(`peggedTokenView: ${peggedTokenView}`);
    let l1Addresses = await ctxL2.listAddresses();
    log(`sendTokensBackTx started`);
    const sendTokensBackTx = await l1GatewayContract.sendTokens(
      peggedTokenView,
      l1Addresses[3],
      10,
    );
    log(`QUEUE:`, await l1BridgeContract.getQueueSize());
    log(`l2TokenContract.address ${l2TokenContract.target}`);
    let sendTokensBackTxReceipt = await sendTokensBackTx.wait();
    log(`sendTokensBackTxReceipt:`, sendTokensBackTxReceipt);
    expect(sendTokensBackTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

    log(
      `getting l1BridgeContractSentMessageEvents (address: ${l1BridgeContract.target})`,
    );
    const l1BridgeContractSentMessageEvents =
      await l1BridgeContract.queryFilter(
        "SentMessage",
        sendTokensReceipt.blockNumber,
      );
    log(
      `l1BridgeContractSentMessageEvents:`,
      l1BridgeContractSentMessageEvents,
    );
    expect(l1BridgeContractSentMessageEvents.length).to.equal(1);

    const sentBackEvent = l1BridgeContractSentMessageEvents[0];

    let messageHash = l2BridgeContractSentMessageEvents[0].args.messageHash;
    const depositBackEvent = l2BridgeContractSentMessageEvents[0];
    console.log("Event: ", sentBackEvent)

    let depositHash = ethers.keccak256(messageHash);

    const commitmentBatch = [
      {
        previousBlockHash: "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
        blockHash:     sendTokensReceipt.blockHash,
        withdrawalHash: sentBackEvent.args.messageHash,
        depositHash: depositHash,
      }];
    const depositsInBlock =    [{
      blockHash: sendTokensReceipt.blockHash,
      depositCount: 1
    }];

    let queue = await l1BridgeContract.getQueueSize();
    console.log("QUEUE: ", queue, messageHash, depositHash)

    let nextBatchIndex = await rollupContract.nextBatchIndex();

    log(`acceptNextTx started`);
    const acceptNextTx = await rollupContract.acceptNextBatch(
      nextBatchIndex,
      commitmentBatch,
      depositsInBlock,
      {
        gasLimit: 30_000_000,
      },
    );
    let acceptNextTxReceipt = await acceptNextTx.wait();
    log(`acceptNextTxReceipt:`, acceptNextTxReceipt);
    expect(acceptNextTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

    log(`started l2BridgeContractReceiveMessageWithProofTx`);
    log("Args: ", sentBackEvent);
    const l2BridgeContractReceiveMessageWithProofTx =
      await l2BridgeContract.receiveMessageWithProof(
        nextBatchIndex,
        commitmentBatch[0],
        sentBackEvent.args["sender"],
        sentBackEvent.args["to"],
        sentBackEvent.args["value"].toString(),
        sentBackEvent.args["chainId"].toString(),
        sentBackEvent.args["blockNumber"].toString(),
        sentBackEvent.args["nonce"].toString(),
        sentBackEvent.args["data"],
        {
          nonce: 0,
          proof: "0x",
        },
        {
          nonce: 0,
          proof: "0x",
        },
        {
          gasLimit: 30_000_000,
        },
      );
    let l2BridgeContractReceiveMessageWithProofReceipt =
      await l2BridgeContractReceiveMessageWithProofTx.wait();
    log(
      `l2BridgeContractReceiveMessageWithProofReceipt:`,
      l2BridgeContractReceiveMessageWithProofReceipt,
    );
    expect(l2BridgeContractReceiveMessageWithProofReceipt.status).to.eq(
      TX_RECEIPT_STATUS_SUCCESS,
    );

    log(
      `getting l2BridgeContractReceivedMessageEvents (contract address: ${l2BridgeContract.target})`,
    );
    const l2BridgeContractReceivedMessageEvents =
      await l2BridgeContract.queryFilter(
        "ReceivedMessage",
        l1BridgeContractReceiveMessageReceipt.blockNumber,
      );
    log(`getting l2GatewayContractGatewayBackEvents`);
    const l2GatewayContractGatewayBackEvents =
      await l2GatewayContract.queryFilter(
        "ReceivedTokens",
        l1BridgeContractReceiveMessageReceipt.blockNumber,
      );
    log(
      `l2BridgeContractReceivedMessageEvents:`,
      l2BridgeContractReceivedMessageEvents,
    );
    log(
      `l2GatewayContractGatewayBackEvents:`,
      l2GatewayContractGatewayBackEvents,
    );
    expect(l2BridgeContractReceivedMessageEvents.length).to.equal(1);
    expect(l2GatewayContractGatewayBackEvents.length).to.equal(1);
  });

  async function CheckLogsOnly(ctx) {
    let owner = ctx.owner();
    const bridgeFactory = await ethers.getContractFactory("Bridge");
    log(`bridgeContract started deploy`);
    l2BridgeContract = await bridgeFactory
      .connect(owner)
      .attach("0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0");
    log(
      `getting l2BridgeContractReceivedMessageEvents (contract address: ${l2BridgeContract.target})`,
    );
    const l2BridgeContractReceivedMessageEvents =
      await l2BridgeContract.queryFilter(
        "ReceivedMessage",
        7, // l1BridgeContractReceiveMessageReceipt.blockNumber,
      );

    log(
      `l2BridgeContractReceivedMessageEvents:`,
      l2BridgeContractReceivedMessageEvents,
    );
    expect(l2BridgeContractReceivedMessageEvents.length).to.equal(1);

    process.exit(0);
  }
});
