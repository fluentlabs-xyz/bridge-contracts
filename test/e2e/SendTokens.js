const {expect} = require("chai");
const {ethers} = require("hardhat");
const {TestingCtx, log} = require("./helpers");

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

        await ctxL1.printDebugInfoAsync();
        await ctxL2.printDebugInfoAsync();

        const [ownerL2] = ctxL2.accounts;

        // erc20GatewayContract, bridgeContract, peggedTokenContract.address, erc20TokenContract.address
        [l2GatewayContract, l2BridgeContract, l2ImplementationAddress, l2FactoryAddress] = await SetUpChain(ctxL2, true);
        [l1GatewayContract, l1BridgeContract, l1ImplementationAddress, l1FactoryAddress] = await SetUpChain(ctxL1);

        log("Linking bridges")
        const mockErc20TokenFactory = await ethers.getContractFactory("MockERC20Token");
        l2TokenContract = await mockErc20TokenFactory.connect(ownerL2).deploy(
            "Mock Token",
            "TKN",
            ethers.utils.parseEther("10"),
            ownerL2.address, {
                gasLimit: 300_000_000,
            }
        );
        await l2TokenContract.deployed();
        log(`l2TokenContract.address: ${l2TokenContract.address}`);

        log(`l1GatewayContract.address: ${l1GatewayContract.address} l2GatewayContract.address: ${l2GatewayContract.address}`);

        let setOtherSideTx = await l2GatewayContract.setOtherSide(
            l1GatewayContract.address,
            l1ImplementationAddress,
            l1FactoryAddress,
        );
        let setOtherSideReceipt = await setOtherSideTx.wait();
        log(`setOtherSideReceipt:`, setOtherSideReceipt)
        expect(setOtherSideReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);
        setOtherSideTx = await l1GatewayContract.setOtherSide(
            l2GatewayContract.address,
            l2ImplementationAddress,
            l2FactoryAddress,
        );
        setOtherSideReceipt = await setOtherSideTx.wait();
        log(`setOtherSideReceipt:`, setOtherSideReceipt)
        expect(setOtherSideReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);
    });

    async function SetUpChain(ctx, withRollup = false) {
        log(`SetUp chain for ${ctx.networkName} (withRollup=${withRollup})`);

        const owner = ctx.owner();

        const erc20PeggedTokenFactory = await ethers.getContractFactory("ERC20PeggedToken");
        let peggedTokenContract = await erc20PeggedTokenFactory.connect(owner).deploy(
            {
                gasLimit: 300_000_000,
            }
        );
        await peggedTokenContract.deployed();
        log("Pegged token address:", peggedTokenContract.address);
        let peggedTokenContractTxReceipt = await peggedTokenContract.deployTransaction.wait();
        expect(peggedTokenContractTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

        let rollupContractAddress = "0x0000000000000000000000000000000000000000";
        if (withRollup) {
            const rollupFactory = await ethers.getContractFactory("Rollup");
            log(`rollupContract started`)
            rollupContract = await rollupFactory.connect(owner).deploy();
            rollupContractAddress = rollupContract.address;
            log("rollupContractAddress:", rollupContractAddress);
            let rollupContractTxReceipt = await rollupContract.deployTransaction.wait();
            expect(rollupContractTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);
        }

        log(`bridgeContract started`)
        const bridgeFactory = await ethers.getContractFactory("Bridge");
        let bridgeContract = await bridgeFactory.connect(owner).deploy(
            owner.address,
            rollupContractAddress,
        );
        await bridgeContract.deployed();
        log(`bridgeContract.address: ${bridgeContract.address}`);
        let bridgeContractTxReceipt = await bridgeContract.deployTransaction.wait();
        log(`bridgeContractTxReceipt:`, bridgeContractTxReceipt)
        expect(bridgeContractTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

        if (withRollup) {
            log(`setBridgeTx started`)
            let setBridgeTx = await rollupContract.setBridge(bridgeContract.address);
            let setBridgeTxReceipt = await setBridgeTx.wait();
            log(`setBridgeTxReceipt:`, setBridgeTxReceipt)
            expect(setBridgeTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);
        }

        log(`erc20TokenContract started`)
        const erc20TokenFactory = await ethers.getContractFactory("ERC20TokenFactory");
        let erc20TokenContract = await erc20TokenFactory.connect(owner).deploy(
            peggedTokenContract.address,
        );
        await erc20TokenContract.deployed();
        log(`erc20tokenContract.address: ${erc20TokenContract.address}`);
        let erc20tokenContractTxReceipt = await erc20TokenContract.deployTransaction.wait();
        log(`erc20tokenContractTxReceipt:`, erc20tokenContractTxReceipt)
        expect(erc20tokenContractTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

        log(`erc20GatewayContract started`)
        const erc20GatewayFactory = await ethers.getContractFactory("ERC20Gateway");
        let erc20GatewayContract = await erc20GatewayFactory.connect(owner).deploy(
            bridgeContract.address,
            erc20TokenContract.address,
            {
                value: ethers.utils.parseEther("1000"),
                gasLimit: 300_000_000,
            },
        );
        await erc20GatewayContract.deployed();
        log(`erc20GatewayContract.address: ${erc20GatewayContract.address}`);
        let erc20GatewayContractTxReceipt = await erc20GatewayContract.deployTransaction.wait();
        expect(erc20GatewayContractTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

        log(`erc20TokenContract.owner: ${await erc20TokenContract.owner()}`);
        const transferOwnershipTx = await erc20TokenContract.transferOwnership(erc20GatewayContract.address, {
            gasLimit: 300_000_000,
        });
        let transferOwnershipTxReceipt = await transferOwnershipTx.wait();
        log("erc20TokenContract.owner:", await erc20TokenContract.owner());
        log(`transferOwnershipTxReceipt:`, transferOwnershipTxReceipt)
        expect(transferOwnershipTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

        return [erc20GatewayContract, bridgeContract, peggedTokenContract.address, erc20TokenContract.address];
    }

    it("Compare pegged token addresses", async function () {
        let peggedTokenAddress = await l2GatewayContract.computePeggedTokenAddress(l2TokenContract.address);
        let otherSidePeggedTokenAddress = await l1GatewayContract.computeOtherSidePeggedTokenAddress(l2TokenContract.address);
        expect(peggedTokenAddress).to.equal(otherSidePeggedTokenAddress);
    });

    it("Bridging tokens between contracts", async () => {
        const approveTx = await l2TokenContract.approve(l2GatewayContract.address, 10, {
            gasLimit: 300_000_000,
        });
        let approveTxReceipt = await approveTx.wait();
        log(`approveTxReceipt:`, approveTxReceipt)
        expect(approveTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

        log("l2GatewayContract.sendTokens");
        const sendTokensTx = await l2GatewayContract.sendTokens(
            l2TokenContract.address,
            l1GatewayContract.signer.getAddress(),
            10,
            {
                gasLimit: 300_000_000,
            }
        );
        log("l2TokenContract.address", l2TokenContract.address);
        let sendTokensReceipt = await sendTokensTx.wait();
        log(`sendTokensReceipt:`, sendTokensReceipt)
        expect(sendTokensReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

        // if (true) {
        //     log("l2GatewayContract.sendTokens (2nd)");
        //     const sendTokensTx = await l2GatewayContract.sendTokens(
        //         l2TokenContract.address,
        //         l1GatewayContract.signer.getAddress(),
        //         1,
        //         {
        //             gasLimit: 300_000_000,
        //         }
        //     );
        //     log("l2TokenContract.address", l2TokenContract.address);
        //     let sendTokensReceipt = await sendTokensTx.wait();
        //     log(`sendTokensReceipt:`, sendTokensReceipt)
        //     expect(sendTokensReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);
        // }

        log(`getting l2BridgeContractSentMessageEvents (address ${l2BridgeContract.address})`)
        let l2BridgeContractSentMessageEvents = await l2BridgeContract.queryFilter(
            "SentMessage",
            sendTokensReceipt.blockNumber,
        );
        log("l2BridgeContractSentMessageEvents:", l2BridgeContractSentMessageEvents)
        expect(l2BridgeContractSentMessageEvents.length).to.equal(1);

        const l2BridgeContractSentMessageEvent0 = l2BridgeContractSentMessageEvents[0];

        let sendMessageHash = l2BridgeContractSentMessageEvent0.args["messageHash"];

        log("sendMessageHash:", sendMessageHash);
        log("l2BridgeContractSentMessageEvent0:", l2BridgeContractSentMessageEvent0);

        const l1BridgeContractReceiveMessageTx = await l1BridgeContract.receiveMessage(
            l2BridgeContractSentMessageEvent0.args["sender"],
            l2BridgeContractSentMessageEvent0.args["to"],
            l2BridgeContractSentMessageEvent0.args["value"],
            l2BridgeContractSentMessageEvent0.args["nonce"],
            l2BridgeContractSentMessageEvent0.args["data"],
        );
        let l1BridgeContractReceiveMessageReceipt = await l1BridgeContractReceiveMessageTx.wait();
        log(`l1BridgeContractReceiveMessageReceipt:`, l1BridgeContractReceiveMessageReceipt)
        expect(l1BridgeContractReceiveMessageReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

        log(`getting l1BridgeContractReceivedMessageEvents (address ${l1BridgeContract.address})`)
        const l1BridgeContractReceivedMessageEvents = await l1BridgeContract.queryFilter(
            "ReceivedMessage",
            l1BridgeContractReceiveMessageReceipt.blockNumber,
        );
        log(`l1BridgeContractReceivedMessageEvents:`, l1BridgeContractReceivedMessageEvents)
        log(`getting l1BridgeContractErrorEvents`)
        const l1BridgeContractErrorEvents = await l1BridgeContract.queryFilter(
            "Error",
            l1BridgeContractReceiveMessageReceipt.blockNumber,
        );
        log(`l1BridgeContractErrorEvents: ${l1BridgeContractErrorEvents} (address ${l1BridgeContract.address})`)
        const l1GatewayContractReceivedTokensEvents = await l1GatewayContract.queryFilter(
            {
                address: l1GatewayContract.address,
                topics: [
                    ethers.utils.id("ReceivedTokens(address,address,uint256)")
                ]
            },
            l1BridgeContractReceiveMessageReceipt.blockNumber,
        );

        log(`l1BridgeContractErrorEvents:`, l1BridgeContractErrorEvents);
        log(`l1BridgeContractReceivedMessageEvents:`, l1BridgeContractReceivedMessageEvents);
        expect(l1BridgeContractErrorEvents.length).to.equal(0);
        expect(l1BridgeContractReceivedMessageEvents.length).to.equal(1);
        log(`l1GatewayContractReceivedTokensEvents:`, l1GatewayContractReceivedTokensEvents);
        expect(l1GatewayContractReceivedTokensEvents.length).to.equal(1);

        let peggedTokenView = await l1GatewayContract.computePeggedTokenAddress(
            l2TokenContract.address,
        );
        log(`peggedTokenView: ${peggedTokenView}`);
        let l1Addresses = await ctxL2.listAddresses();
        const sendTokensBackTx = await l1GatewayContract.sendTokens(
            peggedTokenView,
            l1Addresses[3],
            10,
        );
        log(`l2TokenContract.address ${l2TokenContract.address}`);
        let sendTokensBackTxReceipt = await sendTokensBackTx.wait();
        log(`sendTokensBackTxReceipt:`, sendTokensBackTxReceipt)
        expect(sendTokensBackTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

        log(`getting l1BridgeContractSentMessageEvents (address: ${l1BridgeContract.address})`)
        const l1BridgeContractSentMessageEvents = await l1BridgeContract.queryFilter(
            "SentMessage",
            sendTokensReceipt.blockNumber,
        );
        log(`l1BridgeContractSentMessageEvents:`, l1BridgeContractSentMessageEvents);
        expect(l1BridgeContractSentMessageEvents.length).to.equal(1);

        let messageHash = l1BridgeContractSentMessageEvents[0].args.messageHash;
        const sentBackEvent = l1BridgeContractSentMessageEvents[0];

        let sendMessageHashBuffer = Buffer.from(sendMessageHash.substring(2), "hex");
        const acceptNextTx = await rollupContract.acceptNextProof(
            1,
            messageHash,
            sendMessageHashBuffer,
            {
                gasLimit: 300_000_000,
            }
        );
        let acceptNextTxReceipt = await acceptNextTx.wait();
        log(`acceptNextTxReceipt:`, acceptNextTxReceipt)
        expect(acceptNextTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

        const l2BridgeContractReceiveMessageWithProofTx = await l2BridgeContract.receiveMessageWithProof(
            sentBackEvent.args["sender"],
            sentBackEvent.args["to"],
            sentBackEvent.args["value"],
            sentBackEvent.args["nonce"],
            sentBackEvent.args["data"],
            [],
            1,
            {
                gasLimit: 300_000_000,
            }
        );
        let l2BridgeContractReceiveMessageWithProofReceipt = await l2BridgeContractReceiveMessageWithProofTx.wait();
        log(`l2BridgeContractReceiveMessageWithProofReceipt:`, l2BridgeContractReceiveMessageWithProofReceipt)
        expect(l2BridgeContractReceiveMessageWithProofReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

        log(`getting l2BridgeContractReceivedMessageEvents (contract address: ${l2BridgeContract.address})`)
        const l2BridgeContractReceivedMessageEvents = await l2BridgeContract.queryFilter(
            "ReceivedMessage",
            l1BridgeContractReceiveMessageReceipt.blockNumber,
        );
        log(`getting l2BridgeContractErrorEvents (contract address: ${l2BridgeContract.address})`)
        const l2BridgeContractErrorEvents = await l2BridgeContract.queryFilter(
            "Error",
            l1BridgeContractReceiveMessageReceipt.blockNumber,
        );
        log(`getting l2GatewayContractGatewayBackEvents`)
        const l2GatewayContractGatewayBackEvents = await l2GatewayContract.queryFilter(
            {
                address: l1GatewayContract.address,
                topics: [
                    ethers.utils.id("ReceivedTokens(address,address,uint256)")
                ]
            },
            l1BridgeContractReceiveMessageReceipt.blockNumber,
        );

        log(`l2BridgeContractErrorEvents:`, l2BridgeContractErrorEvents);
        log(`l2BridgeContractReceivedMessageEvents:`, l2BridgeContractReceivedMessageEvents);
        log(`l2GatewayContractGatewayBackEvents:`, l2GatewayContractGatewayBackEvents);
        expect(l2BridgeContractErrorEvents.length).to.equal(0);
        expect(l2BridgeContractReceivedMessageEvents.length).to.equal(1);
        expect(l2GatewayContractGatewayBackEvents.length).to.equal(1);
    });
});
