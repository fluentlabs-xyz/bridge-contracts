const {expect} = require("chai");
const {ethers, artifacts} = require("hardhat");
const {TestingCtx} = require("./helpers");

describe("Restate tokens test", function () {
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
        ctxL1 = TestingCtx.new_L1();
        ctxL2 = TestingCtx.new_L2();

        [l1Gateway, l1Bridge, l1Implementation, l2Factory] = await SetUpChain(ctxL1);

        [l2Gateway, l2Bridge, l2Implementation, l1Factory] = await SetUpChain(ctxL2, true);

        const Token = await ethers.getContractFactory("MockERC20Token");
        l1Token = await Token.connect(ctxL2.owner()).deploy(
            "Mock Token",
            "TKN",
            ethers.utils.parseEther("1000000"),
            ctxL2.owner(),
        ); // Adjust initial supply as needed
        await l1Token.deployed();
        console.log("l1token address:", l1Token.address);

        console.log("L1 gw address:", l2Gateway.address, "L2 gw address:", l1Gateway.address);

        [l2RestakerGateway, restakerPool, liquidityToken, l1RestakerFactory, l1RestakerImplementation] = await SetUpL2Restaker(ctxL2.owner(), l2Bridge.address);

        console.log("L1 Restaker gateway address:", l2RestakerGateway.address);

        [l1RestakerGateway, l2RestakerFactory, l2RestakerImplementation] = await SetUpL1Restaker(l1Bridge.address)

        l1RestakerGateway.setLiquidityToken(liquidityToken.address);
        console.log("L2 Restaker gateway address:", l1RestakerGateway.address)

        let setOtherSideTx = await l2RestakerGateway.setOtherSide(
            l1RestakerGateway.address,
            l2RestakerImplementation.address,
            l2RestakerFactory.address,
        );
        await setOtherSideTx.wait();
        setOtherSideTx = await l1RestakerGateway.setOtherSide(
            l2RestakerGateway.address,
            l1RestakerImplementation.address,
            l1RestakerFactory.address,
        );
        await setOtherSideTx.wait();
        setOtherSideTx = await l2Gateway.setOtherSide(
            l1Gateway.address,
            l1Implementation,
            l2Factory,
        );
        await setOtherSideTx.wait();
        setOtherSideTx = await l1Gateway.setOtherSide(
            l2Gateway.address,
            l2Implementation,
            l1Factory,
        );
        await setOtherSideTx.wait();
    });

    async function SetUpL2Restaker(bridgeAddress) {
        let owner = ctxL2.owner();

        const protocolConfigFactory = await ethers.getContractFactory("ProtocolConfig");
        let protocolConfigContract = await protocolConfigFactory.connect(owner).deploy(
            await owner.getAddress(),
            await owner.getAddress(),
            await owner.getAddress(),
        );
        await protocolConfigContract.deployed();

        const ratioFeedFactory = await ethers.getContractFactory("RatioFeed");
        let ratioFeedContract = await ratioFeedFactory.connect(owner).deploy(
            protocolConfigContract.address,
            "40000"
        );
        await ratioFeedContract.deployed();

        let setRatioFeedTx = await protocolConfigContract.setRatioFeed(ratioFeedContract.address)
        await setRatioFeedTx.wait()

        const liquidityTokenFactory = await ethers.getContractFactory("LiquidityToken");
        let liquidityTokenContract = await liquidityTokenFactory.connect(owner).deploy(
            protocolConfigContract.address,
            'Liquidity Token',
            'lETH'
        );
        await liquidityTokenContract.deployed();

        let updateRatioTx = await ratioFeedContract.updateRatio(liquidityTokenContract.address, 1000);
        await updateRatioTx.wait();

        console.log("Liquidity Token address:", liquidityTokenContract.address)
        let setLiquidityTokenTx = await protocolConfigContract.setLiquidityToken(liquidityTokenContract.address)
        await setLiquidityTokenTx.wait()

        const restakingPoolFactory = await ethers.getContractFactory("RestakingPool");
        let restakingPoolContract = await restakingPoolFactory.connect(owner).deploy(
            protocolConfigContract.address,
            '200000',
            '200000000000000000000',
        );
        await restakingPoolContract.deployed();

        let setRestakingPoolTx = await protocolConfigContract.setRestakingPool(restakingPoolContract.address)
        await setRestakingPoolTx.wait()

        const feeCollectorFactory = await ethers.getContractFactory("FeeCollector");
        let feeCollectorContract = await feeCollectorFactory.connect(owner).deploy(
            protocolConfigContract.address,
            '1500',
        );
        await feeCollectorContract.deployed();

        const erc20peggedTokenFactory = await ethers.getContractFactory("ERC20PeggedToken");
        let erc20peggedTokenContract = await erc20peggedTokenFactory.connect(owner).deploy();
        await erc20peggedTokenContract.deployed();

        const erc20tokenFactoryContract =
            await ethers.getContractFactory("ERC20TokenFactory");
        let tokenFactoryContract = await erc20tokenFactoryContract.connect(owner).deploy(
            erc20peggedTokenContract.address,
        );
        await tokenFactoryContract.deployed();

        const restakerGatewayFactory = await ethers.getContractFactory("RestakerGateway");
        let restakerGatewayContract = await restakerGatewayFactory.connect(owner).deploy(
            bridgeAddress,
            restakingPoolContract.address,
            tokenFactoryContract.address,
        );
        await restakerGatewayContract.deployed();
        console.log("Restaking Pool address:", restakingPoolContract.address)

        const eigenPodMockFactory = await ethers.getContractFactory("EigenPodMock");
        let eigenPodMockContract = await eigenPodMockFactory.connect(owner).deploy(
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            0
        )
        await eigenPodMockContract.deployed();

        const upgradeableBeaconFactory = await ethers.getContractFactory('UpgradeableBeacon');
        let upgradeableBeaconContract = await upgradeableBeaconFactory.connect(owner).deploy(
            eigenPodMockContract.address,
            await owner.getAddress()
        );
        await upgradeableBeaconContract.deployed();

        const eigenPodManagerMockFactory = await ethers.getContractFactory("EigenPodManagerMock");
        let eigenPodManagerMockContract = await eigenPodManagerMockFactory.connect(owner).deploy(
            "0x0000000000000000000000000000000000000000",
            upgradeableBeaconContract.address,
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
        )
        await eigenPodManagerMockContract.deployed();

        const delegationManagerMockFactory = await ethers.getContractFactory("DelegationManagerMock");
        let delegationManagerMockContract = await delegationManagerMockFactory.connect(owner).deploy()
        await delegationManagerMockContract.deployed();

        const restakerFacetsFactory = await ethers.getContractFactory("RestakerFacets");
        let restakerFacetsContract = await restakerFacetsFactory.connect(owner).deploy(
            await owner.getAddress(),
            eigenPodManagerMockContract.address,
            delegationManagerMockContract.address,
        );
        await restakerFacetsContract.deployed();
        console.log("RestakerFacets address:", restakerFacetsContract.address);

        const restakerFactory = await ethers.getContractFactory('Restaker');
        let restakerContract = await restakerFactory.connect(owner).deploy();
        await restakerContract.deployed();

        console.log("Restaker address:", restakerContract.address);


        upgradeableBeaconContract = await upgradeableBeaconFactory.connect(owner).deploy(
            restakerContract.address,
            owner.address
        );
        await upgradeableBeaconContract.deployed();

        console.log("UpgradeableBeacon address:", upgradeableBeaconContract.address);

        const RestakerDeployer = await ethers.getContractFactory("RestakerDeployer");
        let restakerDeployer = await RestakerDeployer.connect(owner).deploy(
            upgradeableBeaconContract.address,
            restakerFacetsContract.address,
        );
        await restakerDeployer.deployed();

        console.log("RestakerDeployer address:", restakerDeployer.address);

        let setRestakerDeployerTx = await protocolConfigContract.setRestakerDeployer(restakerDeployer.address)
        await setRestakerDeployerTx.wait()

        const transferOwnershipTx = await tokenFactoryContract.transferOwnership(restakerGatewayContract.address);
        await transferOwnershipTx.wait();


        let addRestakerTx = await restakingPoolContract.addRestaker(RESTAKER_PROVIDER);
        await addRestakerTx.wait()

        return [restakerGatewayContract, restakingPoolContract, liquidityTokenContract, tokenFactoryContract, erc20peggedTokenContract];
    }

    async function SetUpL1Restaker(bridgeAddress) {
        let owner = ctxL1.owner();

        const erc20peggedTokenFactory = await ethers.getContractFactory("ERC20PeggedToken");
        let erc20peggedTokenContract = await erc20peggedTokenFactory.connect(owner).deploy();
        await erc20peggedTokenContract.deployed();

        const erc20tokenFactory = await ethers.getContractFactory("ERC20TokenFactory");
        let erc20tokenContract = await erc20tokenFactory.connect(owner).deploy(
            erc20peggedTokenContract.address,
        );
        await erc20tokenContract.deployed();

        const restakerGatewayFactory = await ethers.getContractFactory("RestakerGateway");
        let restakerGatewayContract = await restakerGatewayFactory.connect(owner).deploy(
            bridgeAddress,
            "0x0000000000000000000000000000000000000000",
            erc20tokenContract.address,
        );
        await restakerGatewayContract.deployed();

        const transferOwnershipTx = await erc20tokenContract.transferOwnership(restakerGatewayContract.address);
        await transferOwnershipTx.wait();

        return [restakerGatewayContract, erc20tokenContract, erc20peggedTokenContract];
    }

    async function SetUpChain(ctx, withRollup) {
        let owner = ctx.owner();
        console.log(`SetUp chain for ${ctx.networkName}`)

        const erc20peggedTokenFactory = await ethers.getContractFactory("ERC20PeggedToken");
        let erc20peggedToken = await erc20peggedTokenFactory.connect(owner).deploy();
        await erc20peggedToken.deployed();
        console.log("Pegged token address:", erc20peggedToken.address);

        const bridgeFactory = await ethers.getContractFactory("Bridge");

        let rollupAddress = "0x0000000000000000000000000000000000000000";
        if (withRollup) {
            const RollupContract = await ethers.getContractFactory("Rollup");
            rollup = await RollupContract.connect(owner).deploy();
            rollupAddress = rollup.address;
            console.log("Rollup address:", rollupAddress);
        }

        let bridgeContract = await bridgeFactory.connect(owner).deploy(
            owner.address,
            rollupAddress,
        );
        await bridgeContract.deployed();
        console.log("Bridge address:", bridgeContract.address);

        if (withRollup) {
            let setBridgeTx = await rollup.setBridge(bridgeContract.address);
            await setBridgeTx.wait();
        }

        const erc20tokenFactory = await ethers.getContractFactory("ERC20TokenFactory");
        let erc20tokenContract = await erc20tokenFactory.connect(owner).deploy(
            erc20peggedToken.address,
        );
        await erc20tokenContract.deployed();
        console.log("TokenFactory address:", erc20tokenContract.address);

        const ERC20GatewayContract = await ethers.getContractFactory("ERC20Gateway");
        let erc20GatewayContract = await ERC20GatewayContract.connect(owner).deploy(
            bridgeContract.address,
            erc20tokenContract.address,
            {
                value: ethers.utils.parseEther("1000"),
            },
        );

        console.log("erc20 token factory owner:", await erc20tokenContract.owner());
        const transferOwnershipTx = await erc20tokenContract.transferOwnership(erc20GatewayContract.address);
        await transferOwnershipTx.wait();
        console.log("erc20 token factory owner:", await erc20tokenContract.owner());

        await erc20GatewayContract.deployed();
        console.log("Gateway address:", erc20GatewayContract.address);

        return [erc20GatewayContract, bridgeContract, erc20peggedToken.address, erc20tokenContract.address];
    }

    it("Compare pegged token addresses", async function () {
        let peggedToken1address = await l2Gateway.computePeggedTokenAddress(l1Token.address);
        console.log(`peggedToken1address: ${peggedToken1address}`)
        let peggedToken2address = await l1Gateway.computeOtherSidePeggedTokenAddress(l1Token.address);
        console.log(`peggedToken2address: ${peggedToken2address}`)
        expect(peggedToken1address).to.equal(peggedToken2address);
    });

    it("Bridging tokens between to contracts", async function () {
        const approveTx = await l1Token.approve(l2Gateway.address, 100);
        await approveTx.wait();

        console.log("Token send");

        let amount = await liquidityToken.convertToAmount(1);
        console.log("Liquidity Token address:", liquidityToken.address, "Amount:", amount)

        const sendRestakedTokensTx = await l2RestakerGateway.sendRestakedTokens(
            l1Gateway.signer.getAddress(),
            {
                value: "32000000000000000000"
            },
        );
        console.log("Liquidity Token sent address", liquidityToken.address);
        let sendRestakedTokensReceipt = await sendRestakedTokensTx.wait();

        const events = await l2Bridge.queryFilter(
            "SentMessage",
            sendRestakedTokensReceipt.blockNumber,
        );
        expect(events.length).to.equal(1);

        const sentEvent = events[0];

        let sendMessageHash = sentEvent.args["messageHash"];

        console.log("Message hash:", sendMessageHash);
        console.log("Event sent:", sentEvent);

        const receiveMessageTx = await l1Bridge.receiveMessage(
            sentEvent.args["sender"],
            sentEvent.args["to"],
            sentEvent.args["value"],
            sentEvent.args["nonce"],
            sentEvent.args["data"],
        );
        let receiveMessageReceipt = await receiveMessageTx.wait();

        const bridgeEvents = await l1Bridge.queryFilter(
            "ReceivedMessage",
            receiveMessageReceipt.blockNumber,
        );
        const errorEvents = await l1Bridge.queryFilter(
            "Error",
            receiveMessageReceipt.blockNumber,
        );
        const gatewayEvents = await l1RestakerGateway.queryFilter({
                address: l1Gateway.address,
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

        let batchDepositTx = await restakerPool.batchDeposit(
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
        await batchDepositTx.wait();


        let claimRestakerTx = await restakerPool.claimRestaker(RESTAKER_PROVIDER, 0);
        await claimRestakerTx.wait()

        const tokenArtifact = await artifacts.readArtifact("ERC20PeggedToken");
        const tokenAbi = tokenArtifact.abi;

        let peggedTokenAddress = await l1RestakerGateway.computePeggedTokenAddress(liquidityToken.address);
        let peggedTokenContract = new ethers.Contract(
            peggedTokenAddress,
            tokenAbi,
            l1Gateway.signer,
        );
        console.log("Pegged tokens:", peggedTokenAddress);
        console.log("Signer:", await l1Gateway.signer.getAddress())
        let tokenAmount = await peggedTokenContract.balanceOf(l1Gateway.signer.getAddress());
        console.log("Token amount:", tokenAmount);
        let l1Addresses = await ctxL2.listAddresses();
        const sendUnstakingTokensTx = await l1RestakerGateway.sendUnstakingTokens(
            l1Addresses[3],
            10,
        );
        console.log("Token sent address", liquidityToken.address);
        await sendUnstakingTokensTx.wait();

        const backEvents = await l1Bridge.queryFilter(
            "SentMessage",
            sendRestakedTokensReceipt.blockNumber,
        );
        expect(backEvents.length).to.equal(1);
        let messageHash = backEvents[0].args.messageHash;

        console.log(backEvents);
        const sentBackEvent = backEvents[0];

        let deposits = Buffer.from(sendMessageHash.substring(2), "hex");
        console.log(deposits);
        const acceptNextProofTx = await rollup.acceptNextProof(1, messageHash, deposits);
        await acceptNextProofTx.wait();

        const receiveMessageWithProofTx = await l2Bridge.receiveMessageWithProof(
            sentBackEvent.args["sender"],
            sentBackEvent.args["to"],
            sentBackEvent.args["value"],
            sentBackEvent.args["nonce"],
            sentBackEvent.args["data"],
            [],
            1,
        );
        await receiveMessageWithProofTx.wait();

        const bridgeBackEvents = await l2Bridge.queryFilter(
            "ReceivedMessage",
            receiveMessageReceipt.blockNumber,
        );
        const errorBackEvents = await l2Bridge.queryFilter(
            "Error",
            receiveMessageReceipt.blockNumber,
        );
        const gatewayBackEvents = await l2RestakerGateway.queryFilter(
            {
                address: l1Gateway.address,
                topics: [
                    ethers.utils.id("TokensUnstaked(address,uint256)")
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


        let unstake = await restakerPool.distributeUnstakes();
        await unstake.wait()
    });
});
