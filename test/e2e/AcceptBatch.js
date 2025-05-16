const { expect } = require("chai");
const { ethers } = require("hardhat");
const { TestingCtx, log } = require("./helpers");
const { sleep } = require("@nomicfoundation/hardhat-verify/internal/utilities");
const { AbiCoder } = require("ethers");
const { MerkleTree } = require("merkletreejs");

const TX_RECEIPT_STATUS_SUCCESS = 1;
const TX_RECEIPT_STATUS_REVERT = 0;

describe("Send tokens test", () => {
  let ctxL1;
  let ctxL2;

  let l2TokenContract, l1TokenContract;
  let l2GatewayContract, l1GatewayContract;
  let l2BridgeContract, l1BridgeContract;
  let l2ImplementationAddress, l1ImplementationAddress;
  let l2FactoryAddress, l1FactoryAddress;
  let rollupContract;
  let batchSize = 100;

  before(async () => {
    ctxL1 = TestingCtx.new_L1();
    ctxL2 = TestingCtx.new_L2();

    await ctxL1.printDebugInfoAsync();
    await ctxL2.printDebugInfoAsync();

    const [ownerL1] = ctxL1.accounts;
    const [ownerL2] = ctxL2.accounts;

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
    log(`started l1TokenContract deploy`);
    l1TokenContract = await mockErc20TokenFactory
      .connect(ownerL1)
      .deploy("Mock Token", "TKN", ethers.parseEther("10"), ownerL1.address, {
        gasLimit: 30_000_000,
      });
    l1TokenContract = await l1TokenContract.waitForDeployment();
    log(`l1TokenContract.address: ${l1TokenContract.target}`);

    log(
      `l1GatewayContract.address: ${l1GatewayContract.target} l2GatewayContract.address: ${l2GatewayContract.target}`,
    );

    log(`started l2TokenContract deploy`);
    l2TokenContract = await mockErc20TokenFactory
      .connect(ownerL2)
      .deploy("Mock Token", "TKN", ethers.parseEther("10"), ownerL2.address, {
        gasLimit: 30_000_000,
      });
    l2TokenContract = await l2TokenContract.waitForDeployment();
    log(`l1TokenContract.address: ${l2TokenContract.target}`);

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
      const vkKey =
        "0x00612f9d5a388df116872ff70e36bcb86c7e73b1089f32f68fc8e0d0ba7861b7";
      const genesisHash =
        "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470";

      log(`rollupContract started deploy`);
      rollupContract = await rollupFactory
        .connect(owner)
        .deploy(
          0,
          0,
          0,
          verifier.target,
          vkKey,
          genesisHash,
          "0x0000000000000000000000000000000000000000",
          batchSize,
          1000,
        );
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
    await sleep(1000);
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
    const approveDepositTx = await l2TokenContract.approve(
        l2GatewayContract.target,
        10 * batchSize,
        {
          gasLimit: 30_000_000,
        },
    );
    let approveDepositTxReceipt = await approveDepositTx.wait();
    log(`approveTxReceipt:`, approveDepositTxReceipt);
    expect(approveDepositTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

    log(`sendTokensTx started`);
    const [ownerL1] = ctxL1.accounts;
    log("signer: ", ownerL1);

    let nonce = await ctxL2.provider.getTransactionCount(ctxL2.owner(), "pending");
    let sendDepositTxs = [];
    for (let i = 0; i < batchSize; ++i) {
      log("Index: ", i, nonce);
      const sendTokensTx = await l2GatewayContract.sendTokens(
          l2TokenContract.target,
          ownerL1.address,
          10,
          {
            gasLimit: 30_000_000,
            nonce: nonce + i,
          },
      );
      sendDepositTxs.push(sendTokensTx.wait());
      // let sendTokensReceipt = await sendTokensTx.wait();
    }
    const sendDepositReceipts = await Promise.all(sendDepositTxs);

    log(`QUEUE:`, await l2BridgeContract.getQueueSize());
    log("l2TokenContract.address", l1TokenContract.target);
    let depositBlocks = [...new Set(sendDepositReceipts.map((r) => r.blockNumber))];
    console.log("Blocks: ", depositBlocks);
    let batchSendDepositEvents = await l2BridgeContract.queryFilter(
        "SentMessage",
        sendDepositReceipts[0].blockNumber,
    );

    let messagesDepositHashes = batchSendDepositEvents.map(
        (events) => events.args["messageHash"],
    );

    log("message hashes: ", messagesDepositHashes);

    expect(batchSendDepositEvents.length).to.eq(batchSize);

    let receiveDepositTxs = [];
    let i = 0;
    nonce = await ctxL1.provider.getTransactionCount(ctxL1.owner(), "pending");
    for (let depositEvent of batchSendDepositEvents) {
      const l1BridgeContractReceiveMessageTx =
          await l1BridgeContract.receiveMessage(
              depositEvent.args["sender"],
              depositEvent.args["to"],
              depositEvent.args["value"],
              depositEvent.args["chainId"].toString(),
              depositEvent.args["blockNumber"],
              depositEvent.args["nonce"],
              depositEvent.args["data"],
              {
                gasLimit: 30_000_000,
                nonce: nonce + i++,
              },
          );
      receiveDepositTxs.push(l1BridgeContractReceiveMessageTx.wait())
    }
    const receiveDepositReceipts = await Promise.all(receiveDepositTxs);


    nonce = await ctxL1.provider.getTransactionCount(
      ctxL1.owner(),
      "pending",
    );
    log(`approveTx started`);
    log(`approveTx started`, nonce);
    const approveTx = await l1TokenContract.approve(
      l1GatewayContract.target,
      10 * batchSize,
      {
        gasLimit: 30_000_000,
      },
    );
    let approveTxReceipt = await approveTx.wait();
    log(`approveTxReceipt:`, approveTxReceipt);
    expect(approveTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);
    await sleep(1000);
    log(`sendTokensTx started`);
    const [ownerL2] = ctxL2.accounts;
    log("signer: ", ownerL2);
    nonce = await ctxL1.provider.getTransactionCount(ctxL1.owner(), "pending");
    let sendTxs = [];
    for (let i = 0; i < batchSize; ++i) {
      log("Index: ", i, nonce);
      const sendTokensTx = await l1GatewayContract.sendTokens(
        l1TokenContract.target,
        ownerL2.address,
        10,
        {
          gasLimit: 30_000_000,
          nonce: nonce + i,
        },
      );
      sendTxs.push(sendTokensTx.wait());
      // let sendTokensReceipt = await sendTokensTx.wait();
    }

    const sendReceipts = await Promise.all(sendTxs);

    log(`QUEUE:`, await l1BridgeContract.getQueueSize());

    log(`Receipts:`, sendReceipts[0], sendReceipts.length);
    let blocks = [...new Set(sendReceipts.map((r) => r.blockNumber))];
    console.log("Blocks: ", blocks);
    let batchSendEvents = await l1BridgeContract.queryFilter(
      "SentMessage",
      sendReceipts[0].blockNumber,
    );

    let messagesHashes = batchSendEvents.map(
      (events) => events.args["messageHash"],
    );

    log("message hashes: ", messagesHashes);

    expect(batchSendEvents.length).to.eq(batchSize);

    const latestBlockNumber = await ctxL1.provider.getBlockNumber();
    let previousBlockHash =
      "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470";
    const allBatches = [];
    let currentBatch = [];

    for (let blockNumber = 0; blockNumber <= latestBlockNumber; blockNumber++) {
      const block = await ctxL1.provider.getBlock(blockNumber);
      const events = await l1BridgeContract.queryFilter(
        "SentMessage",
        blockNumber,
        blockNumber,
      );

      let withdrawal_root =
        "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470";
      if (events.length > 0) {
        withdrawal_root = events[0].args["messageHash"];
      }
      const blockHash = block.hash;

      const block_commitment = {
        previousBlockHash: previousBlockHash,
        blockHash: blockHash,
        withdrawalHash: withdrawal_root,
        depositHash:
          "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
      };

      currentBatch.push(block_commitment);

      previousBlockHash = blockHash;

      if (currentBatch.length === batchSize) {
        allBatches.push(currentBatch);
        currentBatch = [];
      }
    }
    for (const commitmentBatch of allBatches) {
      console.log("Batch: ", commitmentBatch.length);
      let nextBatchIndex = await rollupContract.nextBatchIndex();

      log(`acceptNextTx started`, nextBatchIndex, commitmentBatch[0], commitmentBatch[commitmentBatch.length - 1]);
      const acceptNextTx = await rollupContract.acceptNextBatch(
        nextBatchIndex,
        commitmentBatch,
        [],
        {
          gasLimit: 30_000_000,
        },
      );
      let acceptNextTxReceipt = await acceptNextTx.wait();
      await sleep(1000)
      log(`acceptNextTxReceipt:`, acceptNextTxReceipt);
      expect(acceptNextTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);
    }

    let nextBatchIndex = await rollupContract.nextBatchIndex();
    nonce = await ctxL2.provider.getTransactionCount(ctxL2.owner(), "pending");
    i = 0;
    let withdrawalWithProofTxs = [];
    for (let sendEvent of batchSendEvents) {
      log(
        `receive message with proof. Message hash: `,
        sendEvent.args["messageHash"],
      );
      log("Args: ", sendEvent);
      let batchIndex = sendEvent.args["blockNumber"] / 100n;

      if (batchIndex >= nextBatchIndex) {
        continue;
      }

      let commitmentBatch = allBatches[sendEvent.args["blockNumber"] / 100n];

      let indexInBatch = sendEvent.args["blockNumber"] % 100n;

      console.log("Batch index: ", batchIndex, commitmentBatch[0], commitmentBatch[commitmentBatch.length - 1]);

      const hashes = commitmentBatch.map((item) => {
        return hre.ethers.keccak256(
          AbiCoder.defaultAbiCoder().encode(
            ["bytes32", "bytes32", "bytes32", "bytes32"],
            [
              item.previousBlockHash,
              item.blockHash,
              item.withdrawalHash,
              item.depositHash,
            ],
          ),
        );
      });

      const tree = new MerkleTree(hashes, hre.ethers.keccak256, {
        sortPairs: false,
        duplicateOdd: true,
      });


      function getFullProofWithDuplicatesHex(tree, leafIndex) {
        const layers = tree.getLayers(); // All levels of the tree
        let index = leafIndex;
        let proof = [];

        for (let i = 0; i < layers.length - 1; i++) {
          const layer = layers[i];

          let pairIndex = index ^ 1; // sibling index
          if (pairIndex >= layer.length) {
            // Odd node duplicated — push itself
            proof.push('0x' + layer[index].toString('hex'));
          } else {
            proof.push('0x' + layer[pairIndex].toString('hex'));
          }

          index = Math.floor(index / 2);
        }

        return proof;
      }

      let merkleProofs = getFullProofWithDuplicatesHex(tree, Number(indexInBatch));
      merkleProofs = "0x" + merkleProofs.map(x => x.slice(2)).join("");

      const l2BridgeContractReceiveMessageWithProofTx =
        await l2BridgeContract.receiveMessageWithProof(
          batchIndex,
          commitmentBatch[indexInBatch],
          sendEvent.args["sender"],
          sendEvent.args["to"],
          sendEvent.args["value"].toString(),
          sendEvent.args["chainId"].toString(),
          sendEvent.args["blockNumber"].toString(),
          sendEvent.args["nonce"].toString(),
          sendEvent.args["data"],
          {
            nonce: 0,
            proof: "0x",
          },
          {
            nonce: indexInBatch,
            proof: merkleProofs,
          },
          {
            gasLimit: 30_000_000,
            nonce: nonce + i++
          },
        );
      withdrawalWithProofTxs.push(l2BridgeContractReceiveMessageWithProofTx.wait());

    }
    const withdrawalWithProofReceipts = await Promise.all(withdrawalWithProofTxs);

    // log(
    //   `l2BridgeContractReceiveMessageWithProofReceipt:`,
    //   l2BridgeContractReceiveMessageWithProofReceipt,
    // );
    // expect(l2BridgeContractReceiveMessageWithProofReceipt.status).to.eq(
    //   TX_RECEIPT_STATUS_SUCCESS,
    // );
    //
    // log(
    //   `getting l2BridgeContractReceivedMessageEvents (contract address: ${l2BridgeContract.target})`,
    // );
    // const l2BridgeContractReceivedMessageEvents =
    //   await l2BridgeContract.queryFilter(
    //     "ReceivedMessage",
    //     l1BridgeContractReceiveMessageReceipt.blockNumber,
    //   );
    // log(`getting l2GatewayContractGatewayBackEvents`);
    // const l2GatewayContractGatewayBackEvents =
    //   await l2GatewayContract.queryFilter(
    //     "ReceivedTokens",
    //     l1BridgeContractReceiveMessageReceipt.blockNumber,
    //   );
    // log(
    //   `l2BridgeContractReceivedMessageEvents:`,
    //   l2BridgeContractReceivedMessageEvents,
    // );
    // log(
    //   `l2GatewayContractGatewayBackEvents:`,
    //   l2GatewayContractGatewayBackEvents,
    // );
    // expect(l2BridgeContractReceivedMessageEvents.length).to.equal(1);
    // expect(l2GatewayContractGatewayBackEvents.length).to.equal(1);
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
