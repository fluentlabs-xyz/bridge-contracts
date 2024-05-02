const {expect} = require("chai");
const {ethers} = require("hardhat");
const hre = require("hardhat");
const {TestingCtx} = require("./helpers");

describe("Contract deployment and interaction", function () {
    let ctxL1;
    let ctxL2;

    let l1Token;
    let l1Gateway, l2Gateway;
    let l1Bridge, l2Bridge;
    let l1Implementation, l2Implementation;
    let rollup;
    let l1RestakerGateway, l2RestakerGateway;
    let restakerPool;
    let liquidityToken;
    const RESTAKER_PROVIDER = "RESTAKER_PROVIDER"

    before(async () => {
        ctxL1 = new TestingCtx("L1");
        ctxL2 = new TestingCtx("L2");

        [l1Gateway, l1Bridge, l1Implementation, l1Factory] = await SetUpChain(ctxL1, true);

        [l2Gateway, l2Bridge, l2Implementation, l2Factory] = await SetUpChain(ctxL2);

        const Token = await ethers.getContractFactory("MockERC20Token");
        l1Token = await Token.connect(ctxL1.wallet).deploy(
            "Mock Token",
            "TKN",
            ethers.utils.parseEther("1000000"),
            ctxL1.wallet.address,
        ); // Adjust initial supply as needed
        await l1Token.deployed();
        console.log("l1token: ", l1Token.address);

        console.log("L1 gw: ", l1Gateway.address, "L2 gw: ", l2Gateway.address);

        [l1RestakerGateway, restakerPool, liquidityToken, l1RestakerFactory, l1RestakerImplementation] = await SetUpL1Restaker(ctxL1.wallet, l1Bridge.address);

        console.log("L1 Restaker gateway: ", l1RestakerGateway.address);

        [l2RestakerGateway, l2RestakerFactory, l2RestakerImplementation] = await SetUpL2Restaker(ctxL2.wallet, l2Bridge.address)

        l2RestakerGateway.setLiquidityToken(liquidityToken.address);
        console.log("L2 Restaker gateway: ", l2RestakerGateway.address)
        let tx = await l1RestakerGateway.setOtherSide(
            l2RestakerGateway.address,
            l2RestakerImplementation.address,
            l2RestakerFactory.address,
        );
        await tx.wait();
        tx = await l2RestakerGateway.setOtherSide(
            l1RestakerGateway.address,
            l1RestakerImplementation.address,
            l1RestakerFactory.address,
        );
        await tx.wait();

        tx = await l1Gateway.setOtherSide(
            l2Gateway.address,
            l2Implementation,
            l2Factory,
        );
        await tx.wait();
        tx = await l2Gateway.setOtherSide(
            l1Gateway.address,
            l1Implementation,
            l1Factory,
        );
        await tx.wait();
    });

    async function SetUpL1Restaker(bridgeAddress) {

        const ProtocolConfig = await ethers.getContractFactory("ProtocolConfig");
        let protocolConfig = await ProtocolConfig.connect(ctxL1.wallet).deploy(
            await ctxL1.wallet.getAddress(),
            await ctxL1.wallet.getAddress(),
            await ctxL1.wallet.getAddress(),
        );
        await protocolConfig.deployed();

        const RatioFeed = await ethers.getContractFactory("RatioFeed");
        let ratioFeed = await RatioFeed.connect(ctxL1.wallet).deploy(
            protocolConfig.address,
            "40000"
        );
        await ratioFeed.deployed();

        let setRatioFeed = await protocolConfig.setRatioFeed(ratioFeed.address)
        await setRatioFeed.wait()

        const LiquidityToken = await ethers.getContractFactory("LiquidityToken");
        let liquidityToken = await LiquidityToken.connect(ctxL1.wallet).deploy(
            protocolConfig.address,
            'Liquidity Token',
            'lETH'
        );
        await liquidityToken.deployed();

        let updateRatio = await ratioFeed.updateRatio(liquidityToken.address, 1000);
        await updateRatio.wait();

        console.log("Liquidity Token: ", liquidityToken.address)
        let setToken = await protocolConfig.setLiquidityToken(liquidityToken.address)
        await setToken.wait()

        const RestakingPool = await ethers.getContractFactory("RestakingPool");
        let restakingPool = await RestakingPool.connect(ctxL1.wallet).deploy(
            protocolConfig.address,
            '200000',
            '200000000000000000000',
        );
        await restakingPool.deployed();

        let setPool = await protocolConfig.setRestakingPool(restakingPool.address)
        await setPool.wait()

        const FeeCollector = await ethers.getContractFactory("FeeCollector");
        let feeCollector = await FeeCollector.connect(ctxL1.wallet).deploy(
            protocolConfig.address,
            '1500',
        );
        await feeCollector.deployed();

        const PeggedToken = await ethers.getContractFactory("ERC20PeggedToken");
        let peggedToken = await PeggedToken.connect(ctxL1.wallet).deploy();
        await peggedToken.deployed();

        const TokenFactoryContract =
            await ethers.getContractFactory("ERC20TokenFactory");
        let tokenFactory = await TokenFactoryContract.connect(ctxL1.wallet).deploy(
            peggedToken.address,
        );
        await tokenFactory.deployed();

        const RestakerGateway = await ethers.getContractFactory("RestakerGateway");
        let restakerGateway = await RestakerGateway.connect(ctxL1.wallet).deploy(
            bridgeAddress,
            restakingPool.address,
            tokenFactory.address,
        );
        await restakerGateway.deployed();
        console.log("REstaking Pool, ", restakingPool.address)

        const EigenPodMock = await ethers.getContractFactory("EigenPodMock");
        let eigenPodMock = await EigenPodMock.connect(ctxL1.wallet).deploy(
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            0
        )
        await eigenPodMock.deployed();

        const UpgradeableBeacon = await ethers.getContractFactory('UpgradeableBeacon');
        let upgradeableBeacon = await UpgradeableBeacon.connect(ctxL1.wallet).deploy(
            eigenPodMock.address,
            await ctxL1.wallet.getAddress()
        );
        await upgradeableBeacon.deployed();

        const EigenPodManagerMock = await ethers.getContractFactory("EigenPodManagerMock");
        let eigenPodManagerMock = await EigenPodManagerMock.connect(ctxL1.wallet).deploy(
            "0x0000000000000000000000000000000000000000",
            upgradeableBeacon.address,
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
        )
        await eigenPodManagerMock.deployed();

        const DelegationManagerMock = await ethers.getContractFactory("DelegationManagerMock");
        let delegationManagerMock = await DelegationManagerMock.connect(ctxL1.wallet).deploy()
        await delegationManagerMock.deployed();

        const RestakerFacets = await ethers.getContractFactory("RestakerFacets");
        let restakerFacets = await RestakerFacets.connect(ctxL1.wallet).deploy(
            await ctxL1.wallet.getAddress(),
            eigenPodManagerMock.address,
            delegationManagerMock.address,
        );
        await restakerFacets.deployed();
        console.log("RestakerFacets: ", restakerFacets.address);

        const Restaker = await ethers.getContractFactory('Restaker');
        let restaker = await Restaker.connect(ctxL1.wallet).deploy();
        await restaker.deployed();

        console.log("Restaker: ", restaker.address);


        upgradeableBeacon = await UpgradeableBeacon.connect(ctxL1.wallet).deploy(
            restaker.address,
            await ctxL1.wallet.getAddress()
        );
        await upgradeableBeacon.deployed();

        console.log("UpgradeableBeacon: ", upgradeableBeacon.address);

        const RestakerDeployer = await ethers.getContractFactory("RestakerDeployer");
        let restakerDeployer = await RestakerDeployer.connect(ctxL1.wallet).deploy(
            upgradeableBeacon.address,
            restakerFacets.address,
        );
        await restakerDeployer.deployed();

        console.log("RestakerDeployer: ", restakerDeployer.address);

        let setDeployer = await protocolConfig.setRestakerDeployer(restakerDeployer.address)
        await setDeployer.wait()

        const authTx = await tokenFactory.transferOwnership(restakerGateway.address);
        await authTx.wait();


        let addRestaker = await restakingPool.addRestaker(RESTAKER_PROVIDER);
        await addRestaker.wait()

        return [restakerGateway, restakingPool, liquidityToken, tokenFactory, peggedToken];
    }

    async function SetUpL2Restaker(l2Signer, bridgeAddress) {

        const PeggedToken = await ethers.getContractFactory("ERC20PeggedToken");
        let peggedToken = await PeggedToken.connect(l2Signer).deploy();
        await peggedToken.deployed();

        const TokenFactoryContract =
            await ethers.getContractFactory("ERC20TokenFactory");
        let tokenFactory = await TokenFactoryContract.connect(l2Signer).deploy(
            peggedToken.address,
        );
        await tokenFactory.deployed();

        const RestakerGateway = await ethers.getContractFactory("RestakerGateway");
        let restakerGateway = await RestakerGateway.connect(l2Signer).deploy(
            bridgeAddress,
            "0x0000000000000000000000000000000000000000",
            tokenFactory.address,
        );
        await restakerGateway.deployed();

        const authTx = await tokenFactory.transferOwnership(restakerGateway.address);
        await authTx.wait();

        return [restakerGateway, tokenFactory, peggedToken];
    }

    async function SetUpChain(ctx, withRollup) {
        const PeggedToken = await ethers.getContractFactory("ERC20PeggedToken");
        let peggedToken = await PeggedToken.connect(ctx.wallet).deploy();
        await peggedToken.deployed();
        console.log("Pegged token: ", peggedToken.address);

        const BridgeContract = await ethers.getContractFactory("Bridge");
        const accounts = await hre.ethers.getSigners();

        let rollupAddress = "0x0000000000000000000000000000000000000000";
        if (withRollup) {
            const RollupContract = await ethers.getContractFactory("Rollup");
            rollup = await RollupContract.connect(ctx.wallet).deploy();
            rollupAddress = rollup.address;
            console.log("Rollup address: ", rollupAddress);
        }

        let bridge = await BridgeContract.connect(ctx.wallet).deploy(
            accounts[0].address,
            rollupAddress,
        );
        await bridge.deployed();
        console.log("Bridge: ", bridge.address);

        if (withRollup) {
            let setBridge = await rollup.setBridge(bridge.address);
            await setBridge.wait();
        }

        const TokenFactoryContract =
            await ethers.getContractFactory("ERC20TokenFactory");
        let tokenFactory = await TokenFactoryContract.connect(ctx.wallet).deploy(
            peggedToken.address,
        );
        await tokenFactory.deployed();
        console.log("TokenFactory: ", tokenFactory.address);

        const ERC20GatewayContract =
            await ethers.getContractFactory("ERC20Gateway");
        let erc20Gateway = await ERC20GatewayContract.connect(ctx.wallet).deploy(
            bridge.address,
            tokenFactory.address,
            {
                value: ethers.utils.parseEther("1000"),
            },
        );

        console.log("token factory owner: ", await tokenFactory.owner());
        const authTx = await tokenFactory.transferOwnership(erc20Gateway.address);
        await authTx.wait();
        console.log("token factory owner: ", await tokenFactory.owner());

        await erc20Gateway.deployed();
        console.log("Gateway: ", erc20Gateway.address);

        return [erc20Gateway, bridge, peggedToken.address, tokenFactory.address];
    }

    it("Compare pegged token addresses", async function () {
        let t1 = await l1Gateway.computePeggedTokenAddress(l1Token.address);
        let t2 = await l2Gateway.computeOtherSidePeggedTokenAddress(
            l1Token.address,
        );
        expect(t1).to.equal(t2);
    });

    it("Bridging tokens between to contracts", async function () {
        const approve_tx = await l1Token.approve(l1Gateway.address, 100);
        await approve_tx.wait();

        console.log("Token send");

        let amount = await liquidityToken.convertToAmount(1);
        console.log("Token: ", liquidityToken.address, "Amount: ", amount)

        const send_tx = await l1RestakerGateway.sendRestakedTokens(
            l2Gateway.signer.getAddress(),
            {
                value: "32000000000000000000"
            },
        );
        console.log("Token sent", liquidityToken.address);
        let receipt = await send_tx.wait();

        const events = await l1Bridge.queryFilter(
            "SentMessage",
            receipt.blockNumber,
        );

        expect(events.length).to.equal(1);

        const sentEvent = events[0];

        let sendMessageHash = sentEvent.args["messageHash"];

        console.log("Message hash", sendMessageHash);
        console.log("Event", sentEvent);

        const receive_tx = await l2Bridge.receiveMessage(
            sentEvent.args["sender"],
            sentEvent.args["to"],
            sentEvent.args["value"],
            sentEvent.args["nonce"],
            sentEvent.args["data"],
        );

        await receive_tx.wait();

        const bridge_events = await l2Bridge.queryFilter(
            "ReceivedMessage",
            receive_tx.blockNumber,
        );
        const error_events = await l2Bridge.queryFilter(
            "Error",
            receive_tx.blockNumber,
        );
        const gateway_events = await l2RestakerGateway.queryFilter(
            {
                address: l2Gateway.address,
                topics: [
                    ethers.utils.id("ReceivedTokens(address,address,uint256)")
                ]
            },
            receive_tx.blockNumber,
        );

        console.log("Bridge events: ", bridge_events);
        console.log("Error events: ", error_events);
        expect(error_events.length).to.equal(0);
        expect(bridge_events.length).to.equal(1);
        console.log("Gateway events: ", gateway_events);
        expect(gateway_events.length).to.equal(1);

        let bd = await restakerPool
            .batchDeposit(
                RESTAKER_PROVIDER,
                [
                    '0xb8ed0276c4c631f3901bafa668916720f2606f58e0befab541f0cf9e0ec67a8066577e9a01ce58d4e47fba56c516f25b',
                ],
                [
                    '0x927b16171b51ca4ccab59de07ea20dacc33baa0f89f06b6a762051cac07233eb613a6c272b724a46b8145850b8851e4a12eb470bfb140e028ae0ac794f3a890ec4fac33910d338343f059d93a6d688238510c147f155d984de7c01daa0d3241b',
                ],
                [
                    '0x50021ea68edb12aaa54fc8a2706b2f4b1d35d1406512fc6de230e0ea0391cf97',
                ]
            );

        await bd.wait();


        let claim = await restakerPool
            .claimRestaker(
                RESTAKER_PROVIDER,
                0
            );
        await claim.wait()

        const tokenArtifact = await artifacts.readArtifact("ERC20PeggedToken");
        const tokenAbi = tokenArtifact.abi;

        let peggedTokenAddress = await l2RestakerGateway.computePeggedTokenAddress(
            liquidityToken.address,
        );
        let peggedTokenContract = new ethers.Contract(
            peggedTokenAddress,
            tokenAbi,
            l2Gateway.signer,
        );
        console.log("Pegged tokens: ", peggedTokenAddress);
        console.log("Signer: ", await l2Gateway.signer.getAddress())
        let tokenAmount = await peggedTokenContract.balanceOf(l2Gateway.signer.getAddress());
        console.log("Token amount: ", tokenAmount);
        let l1Addresses = await ctxL1.listAddresses();
        const sendBackTx = await l2RestakerGateway.sendUnstakingTokens(
            l1Addresses[3],
            10,
        );
        console.log("Token sent", liquidityToken.address);


        await sendBackTx.wait();

        const backEvents = await l2Bridge.queryFilter(
            "SentMessage",
            send_tx.blockNumber,
        );

        expect(backEvents.length).to.equal(1);
        let messageHash = backEvents[0].args.messageHash;

        console.log(backEvents);
        const sentBackEvent = backEvents[0];

        let deposits = Buffer.from(sendMessageHash.substring(2), "hex");
        console.log(deposits);
        const accept = await rollup.acceptNextProof(1, messageHash, deposits);

        await accept.wait();

        const receiveBackTx = await l1Bridge.receiveMessageWithProof(
            sentBackEvent.args["sender"],
            sentBackEvent.args["to"],
            sentBackEvent.args["value"],
            sentBackEvent.args["nonce"],
            sentBackEvent.args["data"],
            [],
            1,
        );

        await receiveBackTx.wait();

        const bridgeBackEvents = await l1Bridge.queryFilter(
            "ReceivedMessage",
            receive_tx.blockNumber,
        );
        const errorBackEvents = await l1Bridge.queryFilter(
            "Error",
            receive_tx.blockNumber,
        );
        const gatewayBackEvents = await l1RestakerGateway.queryFilter(
            {
                address: l2Gateway.address,
                topics: [
                    ethers.utils.id("TokensUnstaked(address,uint256)")
                ]
            },
            receive_tx.blockNumber,
        );

        console.log("Bridge back events: ", bridgeBackEvents);
        console.log("Error back events: ", errorBackEvents);
        expect(errorBackEvents.length).to.equal(0);
        expect(bridgeBackEvents.length).to.equal(1);
        console.log("Gateway back events: ", gatewayBackEvents);
        expect(gatewayBackEvents.length).to.equal(1);


        let unstake = await restakerPool.distributeUnstakes();
        await unstake.wait()
    });
});
