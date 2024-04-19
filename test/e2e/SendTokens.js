const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Contract deployment and interaction", function () {
  let l1Token;
  let l1Gateway, l2Gateway;
  let l1Bridge, l2Bridge;
  let l1Url = 'http://127.0.0.1:8545/';
  // let l1Url =
  //   "https://eth-sepolia.g.alchemy.com/v2/DBpiq0grreNG4r0wdvAUCfdGJswhIPhk";
  let l2Url = 'http://127.0.0.1:8546/';
  // let l2Url = "https://rpc.dev1.fluentlabs.xyz/";
  let l1Implementation, l2Implementation;
  let rollup;

  before(async () => {
    [l1Gateway, l1Bridge, l1Implementation, l1Factory] = await SetUpChain(
      l1Url,
      true,
    );

    [l2Gateway, l2Bridge, l2Implementation, l2Factory] =
      await SetUpChain(l2Url);

    let providerL1 = new ethers.providers.JsonRpcProvider(l1Url); // Replace with your node's RPC URL
    // const privateKey = process.env.PRIVATE_KEY;
    // const signerL1 = new ethers.Wallet(privateKey, providerL1);
    let signerL1 = providerL1.getSigner();
    let wallet = ethers.Wallet.fromMnemonic("test test test test test test test test test test test junk")

    signerL1 = wallet.connect(providerL1)

    const accounts = await hre.ethers.getSigners();

    console.log("Link bridges")
    const Token = await ethers.getContractFactory("MockERC20Token");
    l1Token = await Token.connect(signerL1).deploy(
      "Mock Token",
      "TKN",
      ethers.utils.parseEther("1000000"),
      accounts[0].address,        {
          gasLimit: 2000000,
      }
    );
    await l1Token.deployed();
    console.log("l1token: ", l1Token.address);

    console.log("L1 gw: ", l1Gateway.address, "L2 gw: ", l2Gateway.address);

    let tx = await l1Gateway.setOtherSide(
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

  async function SetUpChain(provider_url, withRollup) {
    let provider = new ethers.providers.JsonRpcProvider(provider_url);

    console.log("SetUp chain: ", provider_url)

    let wallet = ethers.Wallet.fromMnemonic("test test test test test test test test test test test junk")

    let signer = wallet.connect(provider)

    const PeggedToken = await ethers.getContractFactory("ERC20PeggedToken");
    let peggedToken = await PeggedToken.connect(signer).deploy(
        {
          gasLimit: 2000000,
        }
    );
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
    const authTx = await tokenFactory.transferOwnership(erc20Gateway.address,  {
        gasLimit: 1000000,
    });
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

    const approve_tx = await l1Token.approve(l1Gateway.address, 100, {
      gasLimit: 2000000,
    });
    await approve_tx.wait();

    console.log("Token send");
    const send_tx = await l1Gateway.sendTokens(
      l1Token.address,
      l2Gateway.signer.getAddress(),
      100,        {
          gasLimit: 2000000,
        }
    );
    console.log("Token sent", l1Token.address);
    let receipt = await send_tx.wait();

    console.log("Await event", receipt.blockNumber)
    const events = await l1Bridge.queryFilter(
      "SentMessage",
      receipt.blockNumber,
    );
    console.log("Check events")
    console.log("Events: ", events)
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

    console.log("ReceivedMessage: ", bridge_events)
    const error_events = await l2Bridge.queryFilter(
      "Error",
      receive_tx.blockNumber,
    );
    console.log("Error: ", error_events, l2Gateway.address)
    const gateway_events = await l2Gateway.queryFilter(
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

    let peggedToken = await l2Gateway.computePeggedTokenAddress(
      l1Token.address,
    );
    console.log("Pegged tokens: ", peggedToken);
    const sendBackTx = await l2Gateway.sendTokens(
      peggedToken,
      accounts[3],
      100,
    );
    console.log("Token sent", l1Token.address);
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
    const gatewayBackEvents = await l1Gateway.queryFilter(
        {
          address: l2Gateway.address,
          topics: [
            ethers.utils.id("ReceivedTokens(address,address,uint256)")
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
