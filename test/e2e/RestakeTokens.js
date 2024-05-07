const {expect} = require("chai");
const {ethers, artifacts} = require("hardhat");
const {TestingCtx} = require("./helpers");

describe("Restate tokens test", function () {
    let ctxL1;
    let ctxL2;

    let l2TokenContract;
    let l1GatewayContract, l2GatewayContract;
    let l1BridgeContract, l2BridgeContract;
    let l1ImplementationAddress, l2ImplementationAddress;
    let l1FactoryAddress, l2FactoryAddress;
    let rollupContract;
    let l1RestakerGatewayContract, l2RestakerGatewayContract;
    let l1RestakerImplementationContract, l2RestakerImplementationContract;
    let l1RestakerContract, l2RestakerFactoryContract;
    let restakingPoolContract;
    let liquidityTokenContract;
    const RESTAKER_PROVIDER = "RESTAKER_PROVIDER"

    before(async () => {
        ctxL1 = TestingCtx.new_L1();
        ctxL2 = TestingCtx.new_L2();

        await ctxL1.printDebugInfoAsync();
        await ctxL2.printDebugInfoAsync();

        [l2GatewayContract, l2BridgeContract, l2ImplementationAddress, l2FactoryAddress] = await SetUpChain(ctxL2, true);

        [l1GatewayContract, l1BridgeContract, l1ImplementationAddress, l1FactoryAddress] = await SetUpChain(ctxL1);

        const mockERC20TokenFactory = await ethers.getContractFactory("MockERC20Token");
        l2TokenContract = await mockERC20TokenFactory.connect(ctxL2.owner()).deploy(
            "Mock Token",
            "TKN",
            ethers.utils.parseEther("1000000"),
            ctxL2.owner().address,
        ); // Adjust initial supply as needed
        await l2TokenContract.deployed();
        console.log(`l2TokenContract.address: ${l2TokenContract.address}`);

        console.log(`l1GatewayContract.address ${l1GatewayContract.address} l2GatewayContract.address ${l2GatewayContract.address}`);

        // restakerGatewayContract, restakingPoolContract, liquidityTokenContract, erc20tokenFactoryContract, erc20peggedTokenContract
        [
            l2RestakerGatewayContract,
            restakingPoolContract,
            liquidityTokenContract,
            l2RestakerFactoryContract,
            l2RestakerImplementationContract,
        ] = await SetUpL2Restaker(l2BridgeContract.address);
        console.log(`l2RestakerGatewayContract.address: ${l2RestakerGatewayContract.address}`);

        // restakerGatewayContract, erc20tokenContract, erc20peggedTokenContract
        [l1RestakerGatewayContract, l1RestakerContract, l1RestakerImplementationContract] = await SetUpL1Restaker(l1BridgeContract.address)

        l1RestakerGatewayContract.setLiquidityToken(liquidityTokenContract.address);
        console.log(`l1RestakerGatewayContract.address ${l1RestakerGatewayContract.address}`)

        let setOtherSideTx = await l2RestakerGatewayContract.setOtherSide(
            l2RestakerGatewayContract.address,
            l2RestakerImplementationContract.address,
            l2RestakerFactoryContract.address,
        );
        await setOtherSideTx.wait();
        setOtherSideTx = await l1RestakerGatewayContract.setOtherSide(
            l2RestakerGatewayContract.address,
            l2RestakerImplementationContract.address,
            l2RestakerFactoryContract.address,
        );
        await setOtherSideTx.wait();
        setOtherSideTx = await l2GatewayContract.setOtherSide(
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

    async function SetUpL2Restaker(bridgeAddress) {
        let ownerL2 = ctxL2.owner();

        const protocolConfigFactory = await ethers.getContractFactory("ProtocolConfig");
        let protocolConfigContract = await protocolConfigFactory.connect(ownerL2).deploy(
            await ownerL2.getAddress(),
            await ownerL2.getAddress(),
            await ownerL2.getAddress(),
        );
        await protocolConfigContract.deployed();

        const ratioFeedFactory = await ethers.getContractFactory("RatioFeed");
        let ratioFeedContract = await ratioFeedFactory.connect(ownerL2).deploy(
            protocolConfigContract.address,
            "40000"
        );
        await ratioFeedContract.deployed();

        let setRatioFeedTx = await protocolConfigContract.setRatioFeed(ratioFeedContract.address)
        await setRatioFeedTx.wait()

        const liquidityTokenFactory = await ethers.getContractFactory("LiquidityToken");
        let liquidityTokenContract = await liquidityTokenFactory.connect(ownerL2).deploy(
            protocolConfigContract.address,
            'Liquidity Token',
            'lETH'
        );
        await liquidityTokenContract.deployed();

        let updateRatioTx = await ratioFeedContract.updateRatio(liquidityTokenContract.address, 1000);
        await updateRatioTx.wait();

        console.log(`liquidityTokenContract.address: ${liquidityTokenContract.address}`)
        let setLiquidityTokenTx = await protocolConfigContract.setLiquidityToken(liquidityTokenContract.address)
        await setLiquidityTokenTx.wait()

        const restakingPoolFactory = await ethers.getContractFactory("RestakingPool");
        let restakingPoolContract = await restakingPoolFactory.connect(ownerL2).deploy(
            protocolConfigContract.address,
            '200000',
            '200000000000000000000',
        );
        await restakingPoolContract.deployed();
        console.log(`restakingPoolContract.address: ${restakingPoolContract.address}`)

        let setRestakingPoolTx = await protocolConfigContract.setRestakingPool(restakingPoolContract.address)
        await setRestakingPoolTx.wait()

        const feeCollectorFactory = await ethers.getContractFactory("FeeCollector");
        let feeCollectorContract = await feeCollectorFactory.connect(ownerL2).deploy(
            protocolConfigContract.address,
            '1500',
        );
        await feeCollectorContract.deployed();

        const erc20peggedTokenFactory = await ethers.getContractFactory("ERC20PeggedToken");
        let erc20peggedTokenContract = await erc20peggedTokenFactory.connect(ownerL2).deploy();
        await erc20peggedTokenContract.deployed();

        const erc20tokenFactoryFactory = await ethers.getContractFactory("ERC20TokenFactory");
        let erc20tokenFactoryContract = await erc20tokenFactoryFactory.connect(ownerL2).deploy(
            erc20peggedTokenContract.address,
        );
        await erc20tokenFactoryContract.deployed();

        const restakerGatewayFactory = await ethers.getContractFactory("RestakerGateway");
        console.log(
            `!!! ownerL2.address ${ownerL2.address} bridgeAddress ${bridgeAddress} restakingPoolContract.address ${restakingPoolContract.address} erc20tokenFactoryContract.address ${erc20tokenFactoryContract.address}`
        )
        let restakerGatewayContract = await restakerGatewayFactory.connect(ownerL2).deploy(
            bridgeAddress,
            restakingPoolContract.address,
            erc20tokenFactoryContract.address,
        );
        await restakerGatewayContract.deployed();
        console.log(`restakerGatewayContract.address: ${restakerGatewayContract.address}`)

        const eigenPodMockFactory = await ethers.getContractFactory("EigenPodMock");
        let eigenPodMockContract = await eigenPodMockFactory.connect(ownerL2).deploy(
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            0
        )
        await eigenPodMockContract.deployed();

        const upgradeableBeaconFactory = await ethers.getContractFactory('UpgradeableBeacon');
        let upgradeableBeaconContract = await upgradeableBeaconFactory.connect(ownerL2).deploy(
            eigenPodMockContract.address,
            await ownerL2.getAddress()
        );
        await upgradeableBeaconContract.deployed();

        const eigenPodManagerMockFactory = await ethers.getContractFactory("EigenPodManagerMock");
        let eigenPodManagerMockContract = await eigenPodManagerMockFactory.connect(ownerL2).deploy(
            "0x0000000000000000000000000000000000000000",
            upgradeableBeaconContract.address,
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
        )
        await eigenPodManagerMockContract.deployed();

        const delegationManagerMockFactory = await ethers.getContractFactory("DelegationManagerMock");
        let delegationManagerMockContract = await delegationManagerMockFactory.connect(ownerL2).deploy()
        await delegationManagerMockContract.deployed();

        const restakerFacetsFactory = await ethers.getContractFactory("RestakerFacets");
        let restakerFacetsContract = await restakerFacetsFactory.connect(ownerL2).deploy(
            await ownerL2.getAddress(),
            eigenPodManagerMockContract.address,
            delegationManagerMockContract.address,
        );
        await restakerFacetsContract.deployed();
        console.log(`restakerFacetsContract.address: ${restakerFacetsContract.address}`);

        const restakerFactory = await ethers.getContractFactory('Restaker');
        let restakerContract = await restakerFactory.connect(ownerL2).deploy();
        await restakerContract.deployed();
        console.log(`restakerContract.address: ${restakerContract.address}`);

        upgradeableBeaconContract = await upgradeableBeaconFactory.connect(ownerL2).deploy(
            restakerContract.address,
            ownerL2.address
        );
        await upgradeableBeaconContract.deployed();
        console.log(`upgradeableBeaconContract.address: ${upgradeableBeaconContract.address}`);

        const restakerDeployerFactory = await ethers.getContractFactory("RestakerDeployer");
        let restakerDeployerContract = await restakerDeployerFactory.connect(ownerL2).deploy(
            upgradeableBeaconContract.address,
            restakerFacetsContract.address,
        );
        await restakerDeployerContract.deployed();
        console.log(`restakerDeployerContract.address: ${restakerDeployerContract.address}`);

        let setRestakerDeployerTx = await protocolConfigContract.setRestakerDeployer(restakerDeployerContract.address)
        await setRestakerDeployerTx.wait()

        const transferOwnershipTx = await erc20tokenFactoryContract.transferOwnership(restakerGatewayContract.address);
        await transferOwnershipTx.wait();

        let addRestakerTx = await restakingPoolContract.addRestaker(RESTAKER_PROVIDER);
        await addRestakerTx.wait()

        return [restakerGatewayContract, restakingPoolContract, liquidityTokenContract, erc20tokenFactoryContract, erc20peggedTokenContract];
    }

    async function SetUpL1Restaker(bridgeAddress) {
        let ownerL1 = ctxL1.owner();

        const erc20peggedTokenFactory = await ethers.getContractFactory("ERC20PeggedToken");
        let erc20peggedTokenContract = await erc20peggedTokenFactory.connect(ownerL1).deploy();
        await erc20peggedTokenContract.deployed();

        const erc20tokenFactory = await ethers.getContractFactory("ERC20TokenFactory");
        let erc20tokenContract = await erc20tokenFactory.connect(ownerL1).deploy(
            erc20peggedTokenContract.address,
        );
        await erc20tokenContract.deployed();

        const restakerGatewayFactory = await ethers.getContractFactory("RestakerGateway");
        let restakerGatewayContract = await restakerGatewayFactory.connect(ownerL1).deploy(
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
        console.log(`${ctx.networkName}: SetUp chain (withRollup=${withRollup})`)

        const erc20peggedTokenFactory = await ethers.getContractFactory("ERC20PeggedToken");
        let erc20peggedTokenContract = await erc20peggedTokenFactory.connect(owner).deploy();
        await erc20peggedTokenContract.deployed();
        console.log(`erc20peggedTokenContract.address: ${erc20peggedTokenContract.address}`);

        const bridgeFactory = await ethers.getContractFactory("Bridge");

        let rollupContractAddress = "0x0000000000000000000000000000000000000000";
        if (withRollup) {
            const rollupFactory = await ethers.getContractFactory("Rollup");
            rollupContract = await rollupFactory.connect(owner).deploy();
            rollupContractAddress = rollupContract.address;
            console.log(`rollupContractAddress: ${rollupContractAddress}`);
        }

        let bridgeContract = await bridgeFactory.connect(owner).deploy(
            owner.address,
            rollupContractAddress,
        );
        await bridgeContract.deployed();
        console.log(`bridgeContract.address: ${bridgeContract.address}`);

        if (withRollup) {
            let setBridgeTx = await rollupContract.setBridge(bridgeContract.address);
            await setBridgeTx.wait();
        }

        const erc20tokenFactory = await ethers.getContractFactory("ERC20TokenFactory");
        let erc20tokenContract = await erc20tokenFactory.connect(owner).deploy(
            erc20peggedTokenContract.address,
        );
        await erc20tokenContract.deployed();
        console.log(`erc20tokenContract.address: ${erc20tokenContract.address}`);

        const erc20GatewayFactory = await ethers.getContractFactory("ERC20Gateway");
        let erc20GatewayContract = await erc20GatewayFactory.connect(owner).deploy(
            bridgeContract.address,
            erc20tokenContract.address,
            {
                value: ethers.utils.parseEther("1000"),
            },
        );

        console.log(`erc20tokenContract.owner: ${await erc20tokenContract.owner()}`);
        const transferOwnershipTx = await erc20tokenContract.transferOwnership(erc20GatewayContract.address);
        await transferOwnershipTx.wait();
        console.log(`erc20tokenContract.owner: ${await erc20tokenContract.owner()}`);

        await erc20GatewayContract.deployed();
        console.log(`erc20GatewayContract.address: ${erc20GatewayContract.address}`);

        return [erc20GatewayContract, bridgeContract, erc20peggedTokenContract.address, erc20tokenContract.address];
    }

    it("Compare pegged token addresses", async function () {
        let peggedTokenAddress = await l2GatewayContract.computePeggedTokenAddress(l2TokenContract.address);
        console.log(`peggedTokenAddress: ${peggedTokenAddress}`)
        let otherSidePeggedTokenAddress = await l1GatewayContract.computeOtherSidePeggedTokenAddress(l2TokenContract.address);
        console.log(`otherSidePeggedTokenAddress: ${otherSidePeggedTokenAddress}`)
        expect(peggedTokenAddress).to.equal(otherSidePeggedTokenAddress);
    });

    it("Bridging tokens between to contracts", async function () {
        const approveTx = await l2TokenContract.approve(l2GatewayContract.address, 100);
        await approveTx.wait();

        console.log("Token send");

        let amount = await liquidityTokenContract.convertToAmount(1);
        console.log(`liquidityToken.address: ${liquidityTokenContract.address} amount: ${amount}`)

        const sendRestakedTokensTx = await l2RestakerGatewayContract.sendRestakedTokens(
            l1GatewayContract.signer.getAddress(),
            {
                value: "32000000000000000000"
            },
        );
        console.log(`liquidityToken.address: ${liquidityTokenContract.address}`);
        let sendRestakedTokensReceipt = await sendRestakedTokensTx.wait();

        const l2BridgeContractSentMessageEvents = await l2BridgeContract.queryFilter(
            "SentMessage",
            sendRestakedTokensReceipt.blockNumber,
        );
        expect(l2BridgeContractSentMessageEvents.length).to.equal(1);

        const sentEvent = l2BridgeContractSentMessageEvents[0];

        let sendMessageHash = sentEvent.args["messageHash"];

        console.log("sendMessageHash:", sendMessageHash);
        console.log("sentEvent:", sentEvent);

        const receiveMessageTx = await l1BridgeContract.receiveMessage(
            sentEvent.args["sender"],
            sentEvent.args["to"],
            sentEvent.args["value"],
            sentEvent.args["nonce"],
            sentEvent.args["data"],
        );
        let receiveMessageReceipt = await receiveMessageTx.wait();

        const bridgeEvents = await l1BridgeContract.queryFilter(
            "ReceivedMessage",
            receiveMessageReceipt.blockNumber,
        );
        const errorEvents = await l1BridgeContract.queryFilter(
            "Error",
            receiveMessageReceipt.blockNumber,
        );
        const gatewayEvents = await l1RestakerGatewayContract.queryFilter({
                address: l1GatewayContract.address,
                topics: [
                    ethers.utils.id("ReceivedTokens(address,address,uint256)")
                ]
            },
            receiveMessageReceipt.blockNumber,
        );

        console.log("bridgeEvents:", bridgeEvents);
        console.log("errorEvents:", errorEvents);
        expect(errorEvents.length).to.equal(0);
        expect(bridgeEvents.length).to.equal(1);
        console.log("gatewayEvents:", gatewayEvents);
        expect(gatewayEvents.length).to.equal(1);

        let batchDepositTx = await restakingPoolContract.batchDeposit(
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


        let claimRestakerTx = await restakingPoolContract.claimRestaker(RESTAKER_PROVIDER, 0);
        await claimRestakerTx.wait()

        const erc20PeggedTokenArtifact = await artifacts.readArtifact("ERC20PeggedToken");
        const erc20PeggedTokenAbi = erc20PeggedTokenArtifact.abi;

        let peggedTokenAddress = await l1RestakerGatewayContract.computePeggedTokenAddress(liquidityTokenContract.address);
        let peggedTokenContract = new ethers.Contract(
            peggedTokenAddress,
            erc20PeggedTokenAbi,
            l1GatewayContract.signer,
        );
        console.log("peggedTokenAddress:", peggedTokenAddress);
        console.log("l1Gateway.signer.address:", await l1GatewayContract.signer.getAddress())
        let tokenAmount = await peggedTokenContract.balanceOf(l1GatewayContract.signer.getAddress());
        console.log("tokenAmount:", tokenAmount);
        let l2Addresses = await ctxL2.listAddresses(); // TODO recheck l1 / l2?
        const sendUnstakingTokensTx = await l1RestakerGatewayContract.sendUnstakingTokens(
            l2Addresses[3],
            10,
        );
        console.log("liquidityToken.address:", liquidityTokenContract.address);
        await sendUnstakingTokensTx.wait();

        const sentBackEvents = await l1BridgeContract.queryFilter(
            "SentMessage",
            sendRestakedTokensReceipt.blockNumber,
        );
        expect(sentBackEvents.length).to.equal(1);
        let messageHash = sentBackEvents[0].args.messageHash;

        console.log(`backEvents:`, sentBackEvents);
        const sentBackEvent = sentBackEvents[0];

        let deposits = Buffer.from(sendMessageHash.substring(2), "hex");
        console.log(deposits);
        const acceptNextProofTx = await rollupContract.acceptNextProof(1, messageHash, deposits);
        await acceptNextProofTx.wait();

        const receiveMessageWithProofTx = await l2BridgeContract.receiveMessageWithProof(
            sentBackEvent.args["sender"],
            sentBackEvent.args["to"],
            sentBackEvent.args["value"],
            sentBackEvent.args["nonce"],
            sentBackEvent.args["data"],
            [],
            1,
        );
        await receiveMessageWithProofTx.wait();

        const bridgeBackEvents = await l2BridgeContract.queryFilter(
            "ReceivedMessage",
            receiveMessageReceipt.blockNumber,
        );
        const errorBackEvents = await l2BridgeContract.queryFilter(
            "Error",
            receiveMessageReceipt.blockNumber,
        );
        const gatewayBackEvents = await l2RestakerGatewayContract.queryFilter(
            {
                address: l1GatewayContract.address,
                topics: [
                    ethers.utils.id("TokensUnstaked(address,uint256)")
                ]
            },
            receiveMessageReceipt.blockNumber,
        );

        console.log("bridgeBackEvents:", bridgeBackEvents);
        console.log("errorBackEvents:", errorBackEvents);
        expect(errorBackEvents.length).to.equal(0);
        expect(bridgeBackEvents.length).to.equal(1);
        console.log("gatewayBackEvents:", gatewayBackEvents);
        expect(gatewayBackEvents.length).to.equal(1);

        let distributeUnstakesTx = await restakingPoolContract.distributeUnstakes();
        await distributeUnstakesTx.wait()
    });
});
