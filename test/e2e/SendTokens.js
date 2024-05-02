const {expect} = require("chai");
const {ethers} = require("hardhat");
const {TestingCtx} = require("./helpers");

describe("Contract deployment and interaction", () => {
    let ctxL1;
    let ctxL2;

    let l1Token;
    let l1Gateway, l2Gateway;
    let l1Bridge, l2Bridge;
    let l1Implementation, l2Implementation;
    let l1Factory, l2Factory;
    let rollup;

    before(async () => {
        ctxL1 = TestingCtx.new_L1();
        ctxL2 = TestingCtx.new_L2();

        await ctxL1.printDebugInfoAsync();
        await ctxL2.printDebugInfoAsync();

        [l1Gateway, l1Bridge, l1Implementation, l1Factory] = await SetUpChain(ctxL1, true);

        [l2Gateway, l2Bridge, l2Implementation, l2Factory] = await SetUpChain(ctxL2);

        console.log("Link bridges")
        const mockErc20TokenFactory = await ethers.getContractFactory("MockERC20Token");
        l1Token = await mockErc20TokenFactory.connect(ctxL1.wallet).deploy(
            "Mock Token",
            "TKN",
            ethers.utils.parseEther("10"),
            ctxL1.wallet.address, {
                gasLimit: 2000000,
            }
        );
        await l1Token.deployed();
        console.log("l1Token address:", l1Token.address);

        console.log("L1 gw address:", l1Gateway.address, "L2 gw address:", l2Gateway.address);

        let setOtherSideTx = await l1Gateway.setOtherSide(
            l2Gateway.address,
            l2Implementation,
            l2Factory,
        );
        await setOtherSideTx.wait();
        setOtherSideTx = await l2Gateway.setOtherSide(
            l1Gateway.address,
            l1Implementation,
            l1Factory,
        );
        await setOtherSideTx.wait();
    });

    async function SetUpChain(ctx, withRollup = false) {
        console.log(`SetUp chain for ${ctx.networkName} (withRollup=${withRollup})`);

        const PeggedToken = await ethers.getContractFactory("ERC20PeggedToken");
        let peggedToken = await PeggedToken.connect(ctx.wallet).deploy(
            {
                gasLimit: 2000000,
            }
        );
        await peggedToken.deployed();
        console.log("Pegged token address:", peggedToken.address);

        const BridgeContract = await ethers.getContractFactory("Bridge");

        let rollupAddress = "0x0000000000000000000000000000000000000000";
        if (withRollup) {
            const RollupContract = await ethers.getContractFactory("Rollup");
            rollup = await RollupContract.connect(ctx.wallet).deploy();
            rollupAddress = rollup.address;
            console.log("Rollup address:", rollupAddress);
        }

        let bridge = await BridgeContract.connect(ctx.wallet).deploy(
            ctx.wallet.address,
            rollupAddress,
        );
        await bridge.deployed();
        console.log("Bridge address:", bridge.address);

        if (withRollup) {
            let setBridgeTx = await rollup.setBridge(bridge.address);
            await setBridgeTx.wait();
        }

        const TokenFactoryContract = await ethers.getContractFactory("ERC20TokenFactory");
        let tokenFactory = await TokenFactoryContract.connect(ctx.wallet).deploy(
            peggedToken.address,
        );
        await tokenFactory.deployed();
        console.log("TokenFactory address:", tokenFactory.address);

        const ERC20GatewayContract =
            await ethers.getContractFactory("ERC20Gateway");
        let erc20Gateway = await ERC20GatewayContract.connect(ctx.wallet).deploy(
            bridge.address,
            tokenFactory.address,
            {
                value: ethers.utils.parseEther("100"),
            },
        );

        console.log("token factory owner:", await tokenFactory.owner());
        const transferOwnership = await tokenFactory.transferOwnership(erc20Gateway.address, {
            gasLimit: 1000000,
        });
        await transferOwnership.wait();
        console.log("token factory owner:", await tokenFactory.owner());

        await erc20Gateway.deployed();
        console.log("Gateway:", erc20Gateway.address);

        return [erc20Gateway, bridge, peggedToken.address, tokenFactory.address];
    }

    it("Compare pegged token addresses", async function () {
        let peggedTokenAddress = await l1Gateway.computePeggedTokenAddress(l1Token.address);
        let otherSidePeggedTokenAddress = await l2Gateway.computeOtherSidePeggedTokenAddress(l1Token.address);
        expect(peggedTokenAddress).to.equal(otherSidePeggedTokenAddress);
    });

    it("Bridging tokens between to contracts", async function () {
        const approveTx = await l1Token.approve(l1Gateway.address, 10, {
            gasLimit: 2000000,
        });
        await approveTx.wait();

        let l1BridgeEvents = await l1Bridge.queryFilter(
            "SentMessage",
        );

        console.log("Token send");
        const sendTokensTx = await l1Gateway.sendTokens(
            l1Token.address,
            l2Gateway.signer.getAddress(),
            10,
            {
                gasLimit: 2000000,
            }
        );
        console.log("l1Token address", l1Token.address);
        let sendTokensReceipt = await sendTokensTx.wait();

        l1BridgeEvents = await l1Bridge.queryFilter(
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

        const receiveMessageTx = await l2Bridge.receiveMessage(
            sentEvent.args["sender"],
            sentEvent.args["to"],
            sentEvent.args["value"],
            sentEvent.args["nonce"],
            sentEvent.args["data"],
        );
        let receiveMessageReceipt = await receiveMessageTx.wait();

        const bridgeEvents = await l2Bridge.queryFilter(
            "ReceivedMessage",
            receiveMessageReceipt.blockNumber,
        );

        console.log("ReceivedMessage:", bridgeEvents)
        const errorEvents = await l2Bridge.queryFilter(
            "Error",
            receiveMessageReceipt.blockNumber,
        );
        console.log("Error:", errorEvents, l2Gateway.address)
        const gatewayEvents = await l2Gateway.queryFilter(
            {
                address: l2Gateway.address,
                topics: [
                    ethers.utils.id("ReceivedTokens(address,address,uint256)")
                ]
            },
            receiveMessageReceipt.blockNumber,
        );

        console.log("Bridge events:", bridgeEvents);
        console.log("Error events:", errorEvents);
        expect(errorEvents.length).to.equal(0);
        expect(bridgeEvents.length).to.equal(1);
        console.log("Gateway events:", gatewayEvents);
        expect(gatewayEvents.length).to.equal(1);

        let peggedToken = await l2Gateway.computePeggedTokenAddress(
            l1Token.address,
        );
        console.log("Pegged tokens:", peggedToken);
        let l1Addresses = await ctxL1.listAddresses();
        const sendBackTx = await l2Gateway.sendTokens(
            peggedToken,
            l1Addresses[3],
            10,
        );
        console.log("Token sent", l1Token.address);
        await sendBackTx.wait();

        const backEvents = await l2Bridge.queryFilter(
            "SentMessage",
            sendTokensReceipt.blockNumber,
        );

        expect(backEvents.length).to.equal(1);
        let messageHash = backEvents[0].args.messageHash;

        console.log(backEvents);
        const sentBackEvent = backEvents[0];

        let deposits = Buffer.from(sendMessageHash.substring(2), "hex");
        console.log(deposits);
        const acceptTx = await rollup.acceptNextProof(1, messageHash, deposits);
        await acceptTx.wait();

        const receiveMessageWithProofTx = await l1Bridge.receiveMessageWithProof(
            sentBackEvent.args["sender"],
            sentBackEvent.args["to"],
            sentBackEvent.args["value"],
            sentBackEvent.args["nonce"],
            sentBackEvent.args["data"],
            [],
            1,
        );
        await receiveMessageWithProofTx.wait();

        const bridgeBackEvents = await l1Bridge.queryFilter(
            "ReceivedMessage",
            receiveMessageReceipt.blockNumber,
        );
        const errorBackEvents = await l1Bridge.queryFilter(
            "Error",
            receiveMessageReceipt.blockNumber,
        );
        const gatewayBackEvents = await l1Gateway.queryFilter(
            {
                address: l2Gateway.address,
                topics: [
                    ethers.utils.id("ReceivedTokens(address,address,uint256)")
                ]
            },
            receiveMessageReceipt.blockNumber,
        );

        console.log("Bridge back events:", bridgeBackEvents);
        console.log("Error back events:", errorBackEvents);
        expect(errorBackEvents.length).to.equal(0);
        expect(bridgeBackEvents.length).to.equal(1);
        console.log("Gateway back events:", gatewayBackEvents);
        expect(gatewayBackEvents.length).to.equal(1);
    });
});
