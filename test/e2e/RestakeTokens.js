const {expect} = require("chai");
const {ethers, artifacts} = require("hardhat");
const {TestingCtx} = require("./helpers");

describe("Contract deployment and interaction", function () {
    let ctxL1;
    let ctxL2;

    let l2FactoryAddress, l1FactoryAddress;
    let l2GatewayContract, l1GatewayContract;
    let l2BridgeContract, l1BridgeContract;
    let l2ImplementationAddress, l1ImplementationAddress;
    let l1TokenContract;
    let rollupContract;
    let l2RestakerGatewayContract, l1RestakerGatewayContract;
    let l2RestakerFactoryContract, l1RestakerFactoryContract;
    let l2RestakerImplementationContract, l1RestakerImplementationContract;
    let restakingPoolContract;
    let liquidityTokenContract;
    const RESTAKER_PROVIDER = "RESTAKER_PROVIDER"
    
    let l2GasLimit = 100_000_000;
    let l1GasLimit = 30000000;
    before(async () => {
        ctxL1 = TestingCtx.new_L1();
        ctxL2 = TestingCtx.new_L2();
        for (let v of [ctxL1, ctxL2]) {
            await v.printDebugInfoAsync()
        }

        // erc20GatewayContract, bridgeContract, erc20PeggedTokenContract.address, erc20TokenFactoryContract.address
        [l2GatewayContract, l2BridgeContract, l2ImplementationAddress, l2FactoryAddress] = await SetUpChain(ctxL2, true);
        [l1GatewayContract, l1BridgeContract, l1ImplementationAddress, l1FactoryAddress] = await SetUpChain(ctxL1);

        const mockERC20TokenFactory = await ethers.getContractFactory("MockERC20Token");
        l1TokenContract = await mockERC20TokenFactory.connect(ctxL2.owner()).deploy(
            "Mock Token",
            "TKN",
            ethers.utils.parseEther("1000000"),
            ctxL1.owner().address,
        ); // Adjust initial supply as needed
        await l1TokenContract.deployed();
        console.log("l1TokenContract.address:", l1TokenContract.address);

        console.log("L1 gw:", l1GatewayContract.address, "L2 gw:", l2GatewayContract.address);

        [
            l2RestakerGatewayContract,
            restakingPoolContract,
            liquidityTokenContract,
            l2RestakerFactoryContract,
            l2RestakerImplementationContract,
        ] = await SetUpL2Restaker(l2BridgeContract.address);
        console.log("l2RestakerGatewayContract.address:", l2RestakerGatewayContract.address);

        [l1RestakerGatewayContract, l1RestakerFactoryContract, l1RestakerImplementationContract] = await SetUpL1Restaker(l1BridgeContract.address)

        l1RestakerGatewayContract.setLiquidityToken(liquidityTokenContract.address);
        console.log("L2 Restaker gateway: ", l1RestakerGatewayContract.address)
        let tx = await l2RestakerGatewayContract.setOtherSide(
            l1RestakerGatewayContract.address,
            l1RestakerImplementationContract.address,
            l1RestakerFactoryContract.address,
        );
        await tx.wait();
        tx = await l1RestakerGatewayContract.setOtherSide(
            l2RestakerGatewayContract.address,
            l2RestakerImplementationContract.address,
            l2RestakerFactoryContract.address,
        );
        await tx.wait();

        tx = await l2GatewayContract.setOtherSide(
            l1GatewayContract.address,
            l1ImplementationAddress,
            l1FactoryAddress,
        );
        await tx.wait();
        tx = await l1GatewayContract.setOtherSide(
            l2GatewayContract.address,
            l2ImplementationAddress,
            l2FactoryAddress,
        );
        await tx.wait();
    });

    async function SetUpL2Restaker(bridgeAddress) {
        let l2owner = ctxL2.owner();

        console.log(`protocolConfigContract started`)
        const protocolConfigFactory = await ethers.getContractFactory("ProtocolConfig");
        let protocolConfigContract = await protocolConfigFactory.connect(l2owner).deploy(
            l2owner.address,
            l2owner.address,
            l2owner.address,
            {
                gasLimit: l2GasLimit,
            }
        );
        await protocolConfigContract.deployed();

        console.log(`ratioFeedFactory started`);
        const ratioFeedFactory = await ethers.getContractFactory("RatioFeed");
        let ratioFeedContract = await ratioFeedFactory.connect(l2owner).deploy(
            protocolConfigContract.address,
            "40000",
            {
                gasLimit: l2GasLimit,
            }
        );
        await ratioFeedContract.deployed();

        console.log(`setRatioFeed started`);
        let setRatioFeedTx = await protocolConfigContract.setRatioFeed(ratioFeedContract.address)
        await setRatioFeedTx.wait()

        console.log(`liquidityTokenContract started`);
        const LiquidityTokenFactory = await ethers.getContractFactory("LiquidityToken");
        let liquidityTokenContract = await LiquidityTokenFactory.connect(l2owner).deploy(
            protocolConfigContract.address,
            'Liquidity Token',
            'lETH',
            {
                gasLimit: l2GasLimit,
            }
        );
        await liquidityTokenContract.deployed();

        console.log(`updateRatioTx started`);
        let updateRatioTx = await ratioFeedContract.updateRatio(
            liquidityTokenContract.address,
            1000,
            {
                gasLimit: l2GasLimit,
            }
        );
        await updateRatioTx.wait();

        console.log("liquidityTokenContract.address:", liquidityTokenContract.address)
        let setLiquidityTokenTx = await protocolConfigContract.setLiquidityToken(liquidityTokenContract.address)
        await setLiquidityTokenTx.wait()

        console.log(`restakingPoolContract started`);
        const restakingPoolFactory = await ethers.getContractFactory("RestakingPool");
        let restakingPoolContract = await restakingPoolFactory.connect(l2owner).deploy(
            protocolConfigContract.address,
            '200000',
            '200000000000000000000',
            {
                gasLimit: l2GasLimit,
            }
        );
        await restakingPoolContract.deployed();
        console.log("restakingPoolContract.address:", restakingPoolContract.address);

        let setRestakingPoolTx = await protocolConfigContract.setRestakingPool(restakingPoolContract.address)
        await setRestakingPoolTx.wait()

        console.log(`feeCollectorContract started`);
        const feeCollectorFactory = await ethers.getContractFactory("FeeCollector");
        let feeCollectorContract = await feeCollectorFactory.connect(l2owner).deploy(
            protocolConfigContract.address,
            '1500',
            {
                gasLimit: l2GasLimit,
            }
        );
        await feeCollectorContract.deployed();

        console.log(`erc20PeggedTokenContract started`);
        const erc20PeggedTokenFactory = await ethers.getContractFactory("ERC20PeggedToken");
        let erc20PeggedTokenContract = await erc20PeggedTokenFactory.connect(l2owner).deploy({
            gasLimit: l2GasLimit,
        });
        await erc20PeggedTokenContract.deployed();

        console.log(`erc20TokenFactoryContract started`);
        const erc20TokenFactoryFactory = await ethers.getContractFactory("ERC20TokenFactory");
        let erc20TokenFactoryContract = await erc20TokenFactoryFactory.connect(l2owner).deploy(
            erc20PeggedTokenContract.address,
            {
                gasLimit: l2GasLimit,
            }
        );
        await erc20TokenFactoryContract.deployed();

        console.log(`restakerGatewayContract started`);
        const restakerGatewayFactory = await ethers.getContractFactory("RestakerGateway");
        let restakerGatewayContract = await restakerGatewayFactory.connect(l2owner).deploy(
            bridgeAddress,
            restakingPoolContract.address,
            erc20TokenFactoryContract.address,
            {
                // value: ethers.utils.parseEther("50"),
                gasLimit: l2GasLimit,
            }
        );
        await restakerGatewayContract.deployed();
        console.log("restakerGatewayContract.address:", restakerGatewayContract.address);

        const eigenPodMockFactory = await ethers.getContractFactory("EigenPodMock");
        let eigenPodMockContract = await eigenPodMockFactory.connect(l2owner).deploy(
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            0,
            {
                gasLimit: l2GasLimit,
            }
        )
        await eigenPodMockContract.deployed();

        console.log(`restakerGatewayContract started`);
        const upgradeableBeaconFactory = await ethers.getContractFactory('UpgradeableBeacon');
        let upgradeableBeaconContract = await upgradeableBeaconFactory.connect(l2owner).deploy(
            eigenPodMockContract.address,
            await l2owner.getAddress(),
            {
                gasLimit: l2GasLimit,
            }
        );
        await upgradeableBeaconContract.deployed();

        console.log(`eigenPodManagerMockContract started`);
        const eigenPodManagerMockFactory = await ethers.getContractFactory("EigenPodManagerMock");
        let eigenPodManagerMockContract = await eigenPodManagerMockFactory.connect(l2owner).deploy(
            "0x0000000000000000000000000000000000000000",
            upgradeableBeaconContract.address,
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            {
                gasLimit: l2GasLimit,
            }
        )
        await eigenPodManagerMockContract.deployed();

        console.log(`delegationManagerMockContract started`);
        const delegationManagerMockFactory = await ethers.getContractFactory("DelegationManagerMock");
        let delegationManagerMockContract = await delegationManagerMockFactory.connect(l2owner).deploy({
            gasLimit: l2GasLimit,
        })
        await delegationManagerMockContract.deployed();

        console.log(`restakerFacetsFactory started`);
        const restakerFacetsFactory = await ethers.getContractFactory("RestakerFacets");
        let restakerFacetsContract = await restakerFacetsFactory.connect(l2owner).deploy(
            l2owner.getAddress(),
            eigenPodManagerMockContract.address,
            delegationManagerMockContract.address,
            {
                gasLimit: l2GasLimit,
            }
        );
        await restakerFacetsContract.deployed();
        console.log("restakerFacetsContract.address:", restakerFacetsContract.address);

        const restakerFactory = await ethers.getContractFactory('Restaker');
        let restakerContract = await restakerFactory.connect(l2owner).deploy({
            gasLimit: l2GasLimit,
        });
        await restakerContract.deployed();
        console.log("restakerContract.address:", restakerContract.address);

        upgradeableBeaconContract = await upgradeableBeaconFactory.connect(l2owner).deploy(
            restakerContract.address,
            await l2owner.getAddress(),
            {
                gasLimit: l2GasLimit,
            }
        );
        await upgradeableBeaconContract.deployed();
        console.log("upgradeableBeaconContract.address:", upgradeableBeaconContract.address);

        const restakerDeployerFactory = await ethers.getContractFactory("RestakerDeployer");
        let restakerDeployerContract = await restakerDeployerFactory.connect(l2owner).deploy(
            upgradeableBeaconContract.address,
            restakerFacetsContract.address,
            {
                gasLimit: l2GasLimit,
            }
        );
        await restakerDeployerContract.deployed();
        console.log("restakerDeployerContract.address:", restakerDeployerContract.address);

        let setRestakerDeployerTx = await protocolConfigContract.setRestakerDeployer(restakerDeployerContract.address)
        await setRestakerDeployerTx.wait()

        const transferOwnershipTx = await erc20TokenFactoryContract.transferOwnership(restakerGatewayContract.address);
        await transferOwnershipTx.wait();


        let addRestakerTx = await restakingPoolContract.addRestaker(RESTAKER_PROVIDER);
        await addRestakerTx.wait()

        return [restakerGatewayContract, restakingPoolContract, liquidityTokenContract, erc20TokenFactoryContract, erc20PeggedTokenContract];
    }

    async function SetUpL1Restaker(bridgeAddress) {
        let l1owner = ctxL1.owner();

        const peggedTokenFactory = await ethers.getContractFactory("ERC20PeggedToken");
        let peggedTokenContract = await peggedTokenFactory.connect(l1owner).deploy();
        await peggedTokenContract.deployed();

        const erc20TokenFactoryFactory = await ethers.getContractFactory("ERC20TokenFactory");
        let erc20TokenFactoryContract = await erc20TokenFactoryFactory.connect(l1owner).deploy(
            peggedTokenContract.address,
        );
        await erc20TokenFactoryContract.deployed();

        const restakerGatewayFactory = await ethers.getContractFactory("RestakerGateway");
        let restakerGatewayContract = await restakerGatewayFactory.connect(l1owner).deploy(
            bridgeAddress,
            "0x0000000000000000000000000000000000000000",
            erc20TokenFactoryContract.address,
        );
        await restakerGatewayContract.deployed();

        const transferOwnershipTx = await erc20TokenFactoryContract.transferOwnership(restakerGatewayContract.address);
        await transferOwnershipTx.wait();

        return [restakerGatewayContract, erc20TokenFactoryContract, peggedTokenContract];
    }

    async function SetUpChain(ctx, withRollup) {
        console.log(`${ctx.networkName}: SetUpChain withRollup=${withRollup}`)

        let owner = ctx.owner()

        const erc20PeggedTokenFactory = await ethers.getContractFactory("ERC20PeggedToken");
        let erc20PeggedTokenContract = await erc20PeggedTokenFactory.connect(owner).deploy();
        await erc20PeggedTokenContract.deployed();
        console.log("erc20PeggedTokenContract.address:", erc20PeggedTokenContract.address);

        const bridgeFactory = await ethers.getContractFactory("Bridge");
        const ownerAddresses = await ctx.listAddresses();

        let rollupAddress = "0x0000000000000000000000000000000000000000";
        if (withRollup) {
            const rollupFactory = await ethers.getContractFactory("Rollup");
            rollupContract = await rollupFactory.connect(owner).deploy();
            rollupAddress = rollupContract.address;
            console.log("rollupAddress:", rollupAddress);
        }

        let bridgeContract = await bridgeFactory.connect(owner).deploy(
            ownerAddresses[0],
            rollupAddress,
        );
        await bridgeContract.deployed();
        console.log("bridgeContract.address:", bridgeContract.address);

        if (withRollup) {
            let setBridgeTx = await rollupContract.setBridge(bridgeContract.address);
            await setBridgeTx.wait();
        }

        const erc20TokenFactoryFactory = await ethers.getContractFactory("ERC20TokenFactory");
        let erc20TokenFactoryContract = await erc20TokenFactoryFactory.connect(owner).deploy(
            erc20PeggedTokenContract.address,
        );
        await erc20TokenFactoryContract.deployed();
        console.log("erc20TokenFactoryContract.address:", erc20TokenFactoryContract.address);

        const erc20GatewayFactory = await ethers.getContractFactory("ERC20Gateway");
        let erc20GatewayContract = await erc20GatewayFactory.connect(owner).deploy(
            bridgeContract.address,
            erc20TokenFactoryContract.address,
            {
                value: ethers.utils.parseEther("1000"),
            },
        );

        console.log("erc20TokenFactoryContract.owner:", await erc20TokenFactoryContract.owner());
        const transferOwnershipTx = await erc20TokenFactoryContract.transferOwnership(erc20GatewayContract.address);
        await transferOwnershipTx.wait();
        console.log("erc20TokenFactoryContract.owner:", await erc20TokenFactoryContract.owner());

        await erc20GatewayContract.deployed();
        console.log("erc20GatewayContract.address:", erc20GatewayContract.address);

        return [erc20GatewayContract, bridgeContract, erc20PeggedTokenContract.address, erc20TokenFactoryContract.address];
    }

    it("Compare pegged token addresses", async function () {
        let t1 = await l2GatewayContract.computePeggedTokenAddress(l1TokenContract.address);
        let t2 = await l1GatewayContract.computeOtherSidePeggedTokenAddress(l1TokenContract.address);
        expect(t1).to.equal(t2);
    });

    it("Bridging tokens between to contracts", async function () {
        let l2Addresses = await ctxL2.listAddresses();

        const approveTx = await l1TokenContract.approve(l2GatewayContract.address, 100);
        await approveTx.wait();

        console.log("Token send");

        let liquidityTokenAmount = await liquidityTokenContract.convertToAmount(1);
        console.log("liquidityTokenContract.address:", liquidityTokenContract.address, "liquidityTokenAmount:", liquidityTokenAmount)
        for (let v of [ctxL1, ctxL2]) {
            await v.printDebugInfoAsync()
        }

        const sendRestakedTokensTx = await l2RestakerGatewayContract.sendRestakedTokens(
            l1GatewayContract.signer.getAddress(),
            {
                value: "32000000000000000000",
                gasLimit: l2GasLimit,
            },
        );
        let sendRestakedTokensTxReceipt = await sendRestakedTokensTx.wait();
        console.log("liquidityTokenContract.address:", liquidityTokenContract.address);

        const l1BridgeSentMessageEvents = await l2BridgeContract.queryFilter(
            "SentMessage",
            sendRestakedTokensTxReceipt.blockNumber,
        );

        expect(l1BridgeSentMessageEvents.length).to.equal(1);

        const sentEvent = l1BridgeSentMessageEvents[0];

        let sendMessageHash = sentEvent.args["messageHash"];

        console.log("sendMessageHash:", sendMessageHash);
        console.log("sentEvent:", sentEvent);

        const receiveMessageTx = await l1BridgeContract.receiveMessage(
            sentEvent.args["sender"],
            sentEvent.args["to"],
            sentEvent.args["value"],
            sentEvent.args["nonce"],
            sentEvent.args["data"],
            {
                gasLimit: l1GasLimit,
            },
        );
        await receiveMessageTx.wait();

        console.log(`receivedMessageEvents started`)
        const receivedMessageEvents = await l1BridgeContract.queryFilter(
            "ReceivedMessage",
            receiveMessageTx.blockNumber,
        );
        const errorEvents = await l1BridgeContract.queryFilter(
            "Error",
            receiveMessageTx.blockNumber,
        );
        const gatewayEvents = await l1RestakerGatewayContract.queryFilter(
            {
                address: l1GatewayContract.address,
                topics: [
                    ethers.utils.id("ReceivedTokens(address,address,uint256)")
                ]
            },
            receiveMessageTx.blockNumber,
        );

        console.log("receivedMessageEvents:", receivedMessageEvents);
        console.log("errorEvents:", errorEvents);
        expect(errorEvents.length).to.equal(0);
        expect(receivedMessageEvents.length).to.equal(1);
        console.log("gatewayEvents:", gatewayEvents);
        expect(gatewayEvents.length).to.equal(1);

        console.log(`batchDeposit started`)
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
            ],
            {
                gasLimit: l2GasLimit,
            },
        );
        await batchDepositTx.wait();

        console.log(`claimRestaker started`)
        let claimRestakerTx = await restakingPoolContract.claimRestaker(
            RESTAKER_PROVIDER,
            0,
            {
                gasLimit: l2GasLimit,
            },
        );
        await claimRestakerTx.wait()

        const erc20PeggedTokenArtifact = await artifacts.readArtifact("ERC20PeggedToken");
        const erc20PeggedTokenAbi = erc20PeggedTokenArtifact.abi;

        console.log(`computePeggedTokenAddress started`)
        let peggedTokenAddress = await l1RestakerGatewayContract.computePeggedTokenAddress(
            liquidityTokenContract.address,
            {
                gasLimit: l1GasLimit,
            },
        );
        let peggedTokenContract = new ethers.Contract(
            peggedTokenAddress,
            erc20PeggedTokenAbi,
            l1GatewayContract.signer,
        );
        console.log("peggedTokenAddress:", peggedTokenAddress);
        console.log("l1GatewayContract.signer.address:", await l1GatewayContract.signer.getAddress())
        let tokenAmount = await peggedTokenContract.balanceOf(l1GatewayContract.signer.getAddress());
        console.log("tokenAmount:", tokenAmount);
        const sendUnstakingTokensTx = await l1RestakerGatewayContract.sendUnstakingTokens(
            l2Addresses[3],
            10,
            {
                gasLimit: l1GasLimit,
            },
        );
        console.log("liquidityTokenContract.address:", liquidityTokenContract.address);

        await sendUnstakingTokensTx.wait();

        const sentMessageEvents = await l1BridgeContract.queryFilter(
            "SentMessage",
            sendRestakedTokensTx.blockNumber,
        );

        expect(sentMessageEvents.length).to.equal(1);
        let messageHash = sentMessageEvents[0].args.messageHash;

        console.log(`sentMessageEvents:`, sentMessageEvents);
        const sentMessageEvent = sentMessageEvents[0];

        let deposits = Buffer.from(sendMessageHash.substring(2), "hex");
        console.log(deposits);
        const acceptNextProofTx = await rollupContract.acceptNextProof(
            1,
            messageHash,
            deposits,
            {
                gasLimit: l2GasLimit,
            },
        );
        await acceptNextProofTx.wait();

        const receiveMessageWithProofTx = await l2BridgeContract.receiveMessageWithProof(
            sentMessageEvent.args["sender"],
            sentMessageEvent.args["to"],
            sentMessageEvent.args["value"],
            sentMessageEvent.args["nonce"],
            sentMessageEvent.args["data"],
            [],
            1,
            {
                gasLimit: l2GasLimit,
            },
        );
        await receiveMessageWithProofTx.wait();

        const bridgeBackEvents = await l2BridgeContract.queryFilter(
            "ReceivedMessage",
            receiveMessageTx.blockNumber,
        );
        const errorBackEvents = await l2BridgeContract.queryFilter(
            "Error",
            receiveMessageTx.blockNumber,
        );
        const gatewayBackEvents = await l2RestakerGatewayContract.queryFilter(
            {
                address: l1GatewayContract.address,
                topics: [
                    ethers.utils.id("TokensUnstaked(address,uint256)")
                ]
            },
            receiveMessageTx.blockNumber,
        );

        console.log("bridgeBackEvents:", bridgeBackEvents);
        console.log("errorBackEvents:", errorBackEvents);
        expect(errorBackEvents.length).to.equal(0);
        expect(bridgeBackEvents.length).to.equal(1);
        console.log("gatewayBackEvents:", gatewayBackEvents);
        expect(gatewayBackEvents.length).to.equal(1);


        let distributeUnstakesTx = await restakingPoolContract.distributeUnstakes({
            gasLimit: l2GasLimit,
        });
        await distributeUnstakesTx.wait()
    });
});
