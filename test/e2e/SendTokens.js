const {expect} = require("chai");
const {ethers} = require("hardhat");
const {TestingCtx} = require("./helpers");

const TX_RECEIPT_STATUS_SUCCESS = 1;
const TX_RECEIPT_STATUS_REVERT = 0;

describe("Send tokens test", () => {
    let ctxL2;
    let ctxL1;

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

        console.log("Link bridges")
        const mockErc20TokenFactory = await ethers.getContractFactory("MockERC20Token");
        l2TokenContract = await mockErc20TokenFactory.connect(ownerL2).deploy(
            "Mock Token",
            "TKN",
            ethers.utils.parseEther("10"),
            ownerL2.address, {
                gasLimit: 5000000,
            }
        );
        await l2TokenContract.deployed();
        console.log(`l1TokenContract.address: ${l2TokenContract.address}`);

        console.log(`l1GatewayContract.address: ${l2GatewayContract.address} L2 gw address: ${l1GatewayContract.address}`);

        let setOtherSideTx = await l2GatewayContract.setOtherSide(
            l1GatewayContract.address,
            l1ImplementationAddress,
            l1FactoryAddress,
        );
        await setOtherSideTx.wait();
        setOtherSideTx = await l1GatewayContract.setOtherSide(
            l2GatewayContract.address,
            l2ImplementationAddress,
            l2FactoryAddress,
        );
        await setOtherSideTx.wait();
    });

    async function SetUpChain(ctx, withRollup = false) {
        console.log(`SetUp chain for ${ctx.networkName} (withRollup=${withRollup})`);

        const owner = ctx.owner();

        const erc20PeggedTokenFactory = await ethers.getContractFactory("ERC20PeggedToken");
        let peggedTokenContract = await erc20PeggedTokenFactory.connect(owner).deploy(
            {
                gasLimit: 5000000,
            }
        );
        await peggedTokenContract.deployed();
        console.log("Pegged token address:", peggedTokenContract.address);
        let peggedTokenContractTxReceipt = await peggedTokenContract.deployTransaction.wait();
        expect(peggedTokenContractTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

        let rollupContractAddress = "0x0000000000000000000000000000000000000000";
        if (withRollup) {
            console.log(`bridgeContract started`)
            const rollupFactory = await ethers.getContractFactory("Rollup");
            rollupContract = await rollupFactory.connect(owner).deploy();
            rollupContractAddress = rollupContract.address;
            console.log("Rollup address:", rollupContractAddress);
            let rollupContractTxReceipt = await rollupContract.deployTransaction.wait();
            expect(rollupContractTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);
        }

        console.log(`bridgeContract started`)
        const bridgeFactory = await ethers.getContractFactory("Bridge");
        let bridgeContract = await bridgeFactory.connect(owner).deploy(
            owner.address,
            rollupContractAddress,
        );
        await bridgeContract.deployed();
        console.log("Bridge address:", bridgeContract.address);
        let bridgeContractTxReceipt = await bridgeContract.deployTransaction.wait();
        expect(bridgeContractTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

        if (withRollup) {
            console.log(`setBridgeTx started`)
            let setBridgeTx = await rollupContract.setBridge(bridgeContract.address);
            let setBridgeTxReceipt = await setBridgeTx.wait();
            expect(setBridgeTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);
        }

        console.log(`erc20TokenContract started`)
        const erc20TokenFactory = await ethers.getContractFactory("ERC20TokenFactory");
        let erc20TokenContract = await erc20TokenFactory.connect(owner).deploy(
            peggedTokenContract.address,
        );
        await erc20TokenContract.deployed();
        console.log(`erc20tokenContract.address: ${erc20TokenContract.address}`);
        let erc20tokenContractTxReceipt = await erc20TokenContract.deployTransaction.wait();
        expect(erc20tokenContractTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

        console.log(`erc20GatewayContract started`)
        const erc20GatewayFactory = await ethers.getContractFactory("ERC20Gateway");
        let erc20GatewayContract = await erc20GatewayFactory.connect(owner).deploy(
            bridgeContract.address,
            erc20TokenContract.address,
            {
                value: ethers.utils.parseEther("1000"),
            },
        );
        await erc20GatewayContract.deployed();
        console.log(`erc20GatewayContract.address: ${erc20GatewayContract.address}`);
        let erc20GatewayContractTxReceipt = await erc20GatewayContract.deployTransaction.wait();
        expect(erc20GatewayContractTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

        console.log(`erc20TokenContract.owner: ${await erc20TokenContract.owner()}`);
        const transferOwnershipTx = await erc20TokenContract.transferOwnership(erc20GatewayContract.address, {
            gasLimit: 5000000,
        });
        let transferOwnershipTxReceipt = await transferOwnershipTx.wait();
        console.log("erc20TokenContract.owner:", await erc20TokenContract.owner());
        expect(transferOwnershipTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

        return [erc20GatewayContract, bridgeContract, peggedTokenContract.address, erc20TokenContract.address];
    }

    it("Compare pegged token addresses", async function () {
        let peggedTokenAddress = await l2GatewayContract.computePeggedTokenAddress(l2TokenContract.address);
        let otherSidePeggedTokenAddress = await l1GatewayContract.computeOtherSidePeggedTokenAddress(l2TokenContract.address);
        expect(peggedTokenAddress).to.equal(otherSidePeggedTokenAddress);
    });

    it("Bridging tokens between to contracts", async () => {
        const approveTx = await l2TokenContract.approve(l2GatewayContract.address, 10, {
            gasLimit: 5000000,
        });
        let approveTxReceipt = await approveTx.wait();
        expect(approveTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

        console.log("l1GatewayContract.sendTokens");
        const sendTokensTx = await l2GatewayContract.sendTokens(
            l2TokenContract.address,
            l1GatewayContract.signer.getAddress(),
            10,
            {
                gasLimit: 5000000,
            }
        );
        console.log("l1Token address", l2TokenContract.address);
        let sendTokensReceipt = await sendTokensTx.wait();
        expect(sendTokensReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

        let l1BridgeEvents = await l2BridgeContract.queryFilter(
            "SentMessage",
            sendTokensReceipt.blockNumber,
        );
        console.log("Check events")
        console.log("Events:", l1BridgeEvents)
        expect(l1BridgeEvents.length).to.equal(1);

        const sentEvent = l1BridgeEvents[0];

        let sendMessageHash = sentEvent.args["messageHash"];

        console.log("Message hash", sendMessageHash);
        console.log("Event", sentEvent);

        const receiveMessageTx = await l1BridgeContract.receiveMessage(
            sentEvent.args["sender"],
            sentEvent.args["to"],
            sentEvent.args["value"],
            sentEvent.args["nonce"],
            sentEvent.args["data"],
        );
        let receiveMessageReceipt = await receiveMessageTx.wait();
        expect(receiveMessageReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

        const bridgeEvents = await l1BridgeContract.queryFilter(
            "ReceivedMessage",
            receiveMessageReceipt.blockNumber,
        );

        console.log(`bridgeEvents:ReceivedMessage: ${bridgeEvents}`)
        const errorEvents = await l1BridgeContract.queryFilter(
            "Error",
            receiveMessageReceipt.blockNumber,
        );
        console.log(`errorEvents: ${errorEvents}. l2GatewayContract.address: ${l1GatewayContract.address}`)
        const gatewayEvents = await l1GatewayContract.queryFilter(
            {
                address: l1GatewayContract.address,
                topics: [
                    ethers.utils.id("ReceivedTokens(address,address,uint256)")
                ]
            },
            receiveMessageReceipt.blockNumber,
        );

        console.log(`bridgeEvents: ${bridgeEvents}`);
        console.log(`errorEvents: ${errorEvents}`);
        expect(errorEvents.length).to.equal(0);
        expect(bridgeEvents.length).to.equal(1);
        console.log(`gatewayEvents: ${gatewayEvents}`);
        expect(gatewayEvents.length).to.equal(1);

        let peggedTokenView = await l1GatewayContract.computePeggedTokenAddress(
            l2TokenContract.address,
        );
        console.log(`peggedTokenView: ${peggedTokenView}`);
        let l1Addresses = await ctxL2.listAddresses();
        const sendTokensBackTx = await l1GatewayContract.sendTokens(
            peggedTokenView,
            l1Addresses[3],
            10,
        );
        console.log(`l1TokenContract.address ${l2TokenContract.address}`);
        let sendTokensBackTxReceipt = await sendTokensBackTx.wait();
        expect(sendTokensBackTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

        const sendTokensBackEvents = await l1BridgeContract.queryFilter(
            "SentMessage",
            sendTokensReceipt.blockNumber,
        );

        expect(sendTokensBackEvents.length).to.equal(1);
        let messageHash = sendTokensBackEvents[0].args.messageHash;

        console.log(sendTokensBackEvents);
        const sentBackEvent = sendTokensBackEvents[0];

        let sendMessageHashBuffer = Buffer.from(sendMessageHash.substring(2), "hex");
        console.log(`sendMessageHashBuffer: ${sendMessageHashBuffer}`);
        const acceptNextTx = await rollupContract.acceptNextProof(1, messageHash, sendMessageHashBuffer);
        let acceptNextTxReceipt = await acceptNextTx.wait();
        expect(acceptNextTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

        const receiveMessageWithProofTx = await l2BridgeContract.receiveMessageWithProof(
            sentBackEvent.args["sender"],
            sentBackEvent.args["to"],
            sentBackEvent.args["value"],
            sentBackEvent.args["nonce"],
            sentBackEvent.args["data"],
            [],
            1,
        );
        let receiveMessageWithProofTxReceipt = await receiveMessageWithProofTx.wait();
        expect(receiveMessageWithProofTxReceipt.status).to.eq(TX_RECEIPT_STATUS_SUCCESS);

        const bridgeBackEvents = await l2BridgeContract.queryFilter(
            "ReceivedMessage",
            receiveMessageReceipt.blockNumber,
        );
        const errorBackEvents = await l2BridgeContract.queryFilter(
            "Error",
            receiveMessageReceipt.blockNumber,
        );
        const gatewayBackEvents = await l2GatewayContract.queryFilter(
            {
                address: l1GatewayContract.address,
                topics: [
                    ethers.utils.id("ReceivedTokens(address,address,uint256)")
                ]
            },
            receiveMessageReceipt.blockNumber,
        );

        console.log(`bridgeBackEvents: ${bridgeBackEvents}`);
        console.log(`errorBackEvents: ${errorBackEvents}`);
        expect(errorBackEvents.length).to.equal(0);
        expect(bridgeBackEvents.length).to.equal(1);
        console.log(`gatewayBackEvents: ${gatewayBackEvents}`);
        expect(gatewayBackEvents.length).to.equal(1);
    });
});
