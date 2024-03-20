const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Contract deployment and interaction", function () {
  let l1Token;
  let l1Gateway, l2Gateway;
  let l1Bridge, l2Bridge;
  let l1Url = 'http://127.0.0.1:8545/';
  let l2Url = 'http://127.0.0.1:8546/';
  let l1Implementation, l2Implementation;
  let rollup;
  let l1RestakerGateway, l2RestakerGateway;
  let restakerPool;
  let liquidityToken;

  before(async () => {
    [l1Gateway, l1Bridge, l1Implementation, l1Factory] = await SetUpChain(
      l1Url,
      true,
    );

    [l2Gateway, l2Bridge, l2Implementation, l2Factory] =
      await SetUpChain(l2Url);

    let providerL1 = new ethers.providers.JsonRpcProvider(l1Url); // Replace with your node's RPC URL

    const signerL1 = providerL1.getSigner()

    let providerL2 = new ethers.providers.JsonRpcProvider(l2Url)
    const signerL2 = providerL2.getSigner()

    const accounts = await hre.ethers.getSigners();

    const Token = await ethers.getContractFactory("MockERC20Token");
    l1Token = await Token.connect(signerL1).deploy(
      "Mock Token",
      "TKN",
      ethers.utils.parseEther("1000000"),
      accounts[0].address,
    ); // Adjust initial supply as needed
    await l1Token.deployed();
    console.log("l1token: ", l1Token.address);

    console.log("L1 gw: ", l1Gateway.address, "L2 gw: ", l2Gateway.address);

    [l1RestakerGateway, restakerPool, liquidityToken, l1RestakerFactory, l1RestakerImplementation] = await SetUpL1Restaker(signerL1, l1Bridge.address);

    console.log("L1 Restaker gateway: ", l1RestakerGateway.address);

    [l2RestakerGateway, l2RestakerFactory, l2RestakerImplementation] = await SetUpL2Restaker(signerL2, l2Bridge.address)

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

  async function SetUpL1Restaker(l1Signer, bridgeAddress) {

    const ProtocolConfig = await ethers.getContractFactory("ProtocolConfig");
    let protocolConfig = await ProtocolConfig.connect(l1Signer).deploy(
      l1Signer.getAddress(),
      l1Signer.getAddress(),
      l1Signer.getAddress(),
    );
    await protocolConfig.deployed();

    const RatioFeed = await ethers.getContractFactory("RatioFeed");
    let ratioFeed = await RatioFeed.connect(l1Signer).deploy(
        protocolConfig.address,
        "40000"
    );
    await ratioFeed.deployed();

    let setRatioFeed = await protocolConfig.setRatioFeed(ratioFeed.address)
    await setRatioFeed.wait()

    const LiquidityToken = await ethers.getContractFactory("LiquidityToken");
    let liquidityToken = await LiquidityToken.connect(l1Signer).deploy(
        protocolConfig.address,
        'Liquidity Token',
        'lETH'
    );
    await liquidityToken.deployed();

    let updateRatio = await ratioFeed.updateRatio(liquidityToken.address, 10);
    await updateRatio.wait();

    console.log("Liquidity Token: ", liquidityToken.address)
    let setToken = await protocolConfig.setLiquidityToken(liquidityToken.address)
    await setToken.wait()

    const RestakingPool = await ethers.getContractFactory("RestakingPool");
    let restakingPool = await RestakingPool.connect(l1Signer).deploy(
        protocolConfig.address,
        '200000',
        '200000000000000000000',
    );
    await restakingPool.deployed();

    let setPool= await protocolConfig.setRestakingPool(restakingPool.address)
    await setPool.wait()

    const FeeCollector = await ethers.getContractFactory("FeeCollector");
    let feeCollector = await FeeCollector.connect(l1Signer).deploy(
        protocolConfig.address,
        '1500',
    );
    await feeCollector.deployed();

    const PeggedToken = await ethers.getContractFactory("ERC20PeggedToken");
    let peggedToken = await PeggedToken.connect(l1Signer).deploy();
    await peggedToken.deployed();

    const TokenFactoryContract =
        await ethers.getContractFactory("ERC20TokenFactory");
    let tokenFactory = await TokenFactoryContract.connect(l1Signer).deploy(
        peggedToken.address,
    );
    await tokenFactory.deployed();

    const RestakerGateway = await ethers.getContractFactory("RestakerGateway");
    let restakerGateway = await RestakerGateway.connect(l1Signer).deploy(
        bridgeAddress,
        restakingPool.address,
        tokenFactory.address,
    );
    await restakerGateway.deployed();
    console.log("REstaking Pool, ", restakingPool.address)

    const authTx = await tokenFactory.transferOwnership(restakerGateway.address);
    await authTx.wait();

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

  async function SetUpChain(provider_url, withRollup) {
    let provider = new ethers.providers.JsonRpcProvider(provider_url);

    let signer = provider.getSigner();

    const PeggedToken = await ethers.getContractFactory("ERC20PeggedToken");
    let peggedToken = await PeggedToken.connect(signer).deploy();
    await peggedToken.deployed();
    console.log("Pegged token: ", peggedToken.address);

    const BridgeContract = await ethers.getContractFactory("Bridge");
    const accounts = await hre.ethers.getSigners();

    let rollupAddress = "0x0000000000000000000000000000000000000000";
    if (withRollup) {
      const RollupContract = await ethers.getContractFactory("Rollup");
      rollup = await RollupContract.connect(signer).deploy();
      rollupAddress = rollup.address;
      console.log("Rollup address: ", rollupAddress);
    }

    let bridge = await BridgeContract.connect(signer).deploy(
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
    let tokenFactory = await TokenFactoryContract.connect(signer).deploy(
      peggedToken.address,
    );
    await tokenFactory.deployed();
    console.log("TokenFactory: ", tokenFactory.address);

    const ERC20GatewayContract =
      await ethers.getContractFactory("ERC20Gateway");
    let erc20Gateway = await ERC20GatewayContract.connect(signer).deploy(
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
    let provider = new ethers.providers.JsonRpcProvider(l1Url);
    let accounts = await provider.listAccounts();

    const approve_tx = await l1Token.approve(l1Gateway.address, 100);
    await approve_tx.wait();

    console.log("Provider", l1Gateway.provider);

    console.log("Token send");

    let amount = await liquidityToken.convertToAmount(1);
    console.log("Token: ", liquidityToken.address, "Amount: ", amount)

    const send_tx = await l1RestakerGateway.sendRestakedTokens(
        l2Gateway.signer.getAddress(),
        {
          value: "1000000000000000000"
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
    const sendBackTx = await l2RestakerGateway.sendUnstakingTokens(
      accounts[3],
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
  });
});
