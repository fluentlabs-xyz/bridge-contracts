const { expect } = require("chai");
const { BigNumber, AbiCoder} = require("ethers");

describe("RestakerGateway", function () {
  let bridge;
  let restakingGatewayAbi;
  let token;
  let tokenFactory;
  let restakerGateway;
  let mockRestaker;
  let mockLiquidityToken;

  before(async function () {
    const PeggedToken = await ethers.getContractFactory("ERC20PeggedToken");
    let peggedToken = await PeggedToken.deploy(); // Adjust initial supply as needed
    peggedToken = await peggedToken.waitForDeployment();

    const BridgeContract = await ethers.getContractFactory("Bridge");
    const accounts = await hre.ethers.getSigners();
    bridge = await BridgeContract.deploy(
      accounts[0].address,
      accounts[1].address,
    );
    bridge = await bridge.waitForDeployment();

    const TokenFactoryContract =
      await ethers.getContractFactory("ERC20TokenFactory");
    tokenFactory = await TokenFactoryContract.deploy(peggedToken.target);
    tokenFactory = await tokenFactory.waitForDeployment();

    const Token = await ethers.getContractFactory("MockERC20Token");
    token = await Token.deploy(
      "Mock Token",
      "TKN",
      ethers.parseEther("1000000"),
      accounts[0].address,
    );
    token = await token.waitForDeployment();

    const MockLiquidityToken =
      await ethers.getContractFactory("MockLiquidityToken");
    mockLiquidityToken = await MockLiquidityToken.deploy(
      "Liquidity Token",
      "LQT",
      ethers.parseEther("1000000"),
      accounts[0].address,
    );
    mockLiquidityToken = await mockLiquidityToken.waitForDeployment();

    const MockRestaker = await ethers.getContractFactory("MockRestaker");
    mockRestaker = await MockRestaker.deploy(mockLiquidityToken.target);
    mockRestaker = await mockRestaker.waitForDeployment();

    let tokenWithSigner = mockLiquidityToken.connect(accounts[0]);

    let tx = await tokenWithSigner.setRestaker(mockRestaker.target);
    await tx.wait();

    const RestakerGateway = await ethers.getContractFactory("RestakerGateway");
    restakingGatewayAbi = RestakerGateway.interface.format();
    restakerGateway = await RestakerGateway.deploy(
      bridge.target,
      mockRestaker.target,
      tokenFactory.target,
    );
    restakerGateway = await restakerGateway.waitForDeployment();

    const authTx = await tokenFactory.transferOwnership(
      restakerGateway.target,
    );
    await authTx.wait();
  });

  it("Stake tokens test", async function () {
    const accounts = await hre.ethers.getSigners();

    const origin_account_balance = await hre.ethers.provider.getBalance(
      accounts[0].address,
    );
    const origin_balance = await mockLiquidityToken.balanceOf(
      restakerGateway.target,
    );

    const contractWithSigner = restakerGateway.connect(accounts[0]);

    const send_tx = await contractWithSigner.sendRestakedTokens(
      "0x1111111111111111111111111111111111111111",
      { value: 1000 },
    );

    let receipt = await send_tx.wait();

    let gasUsed = receipt.cumulativeGasUsed * receipt.gasPrice;

    const events = await bridge.queryFilter("SentMessage", send_tx.blockNumber);

    expect(events.length).to.equal(1);

    expect(events[0].args.sender).to.equal(restakerGateway.target);

    const account_balance = await hre.ethers.provider.getBalance(
      accounts[0].address,
    );

    expect(origin_account_balance - account_balance - gasUsed).to.be.eql(
      1000n,
    );

    const token_balance = await mockLiquidityToken.balanceOf(
      restakerGateway.target,
    );

    expect(token_balance -  origin_balance).to.be.eql(1000n);
  });

  it("Unstake tokens test", async function () {
    const accounts = await hre.ethers.getSigners();
    const contractWithSigner = bridge.connect(accounts[0]);

    const receiverAddress = await accounts[0].getAddress();

    const gatewayInterface = new ethers.Interface(restakingGatewayAbi);
    const _token = mockLiquidityToken.target;
    const _to = accounts[0].address;
    const _from = accounts[3].address;
    const _amount = 1000;

    const functionSelector = gatewayInterface.getFunction(
      "receivePeggedTokens",
    ).selector;

    const peggedTokenAddress = await tokenFactory.computePeggedTokenAddress(
      restakerGateway.target,
      mockLiquidityToken.target,
    );

    const tokenMetadata = {
      name: "Liq token",
      symbol: "LQT",
      decimals: 18,
    };

    const encodedTokenMetadata = AbiCoder.defaultAbiCoder().encode(
      ["string", "string", "uint8"],
      [tokenMetadata.symbol, tokenMetadata.name, tokenMetadata.decimals],
    );

    const _message =
      functionSelector +
        AbiCoder.defaultAbiCoder()
        .encode(
          ["address", "address", "address", "address", "uint256", "bytes"],
          [
            _token,
            peggedTokenAddress,
            _from,
            _to,
            _amount,
            encodedTokenMetadata,
          ],
        )
        .slice(2);

    const data = AbiCoder.defaultAbiCoder()
      .encode(
        ["address", "address", "uint256", "uint256", "bytes"],
        [restakerGateway.target, accounts[3].address, 0, 0, _message],
      )
      .slice(2);

    const inputBytes = Buffer.from(data, "hex");
    const hash = ethers.keccak256(inputBytes);

    expect(hash).to.equal(
      "0xd0330375c6a7ea9ccd0085294287f20d60982f8e2d18c61eca5015c0e67a88e5",
    );

    const receive_tx = await contractWithSigner.receiveMessage(
      "0x1111111111111111111111111111111111111111",
      restakerGateway.target,
      0,
      0,
      _message,
    );

    await receive_tx.wait();

    const tokenArtifact = await artifacts.readArtifact("ERC20PeggedToken");
    const tokenAbi = tokenArtifact.abi;
    let peggedTokenContract = new ethers.Contract(
      peggedTokenAddress,
      tokenAbi,
      await ethers.provider.getSigner(),
    );

    const origin_balance = await peggedTokenContract.balanceOf(receiverAddress);

    let error_events = await bridge.queryFilter(
      "Error",
      receive_tx.blockNumber,
    );

    expect(error_events.length).to.equal(0);
    let events = await bridge.queryFilter(
      "ReceivedMessage",
      receive_tx.blockNumber,
    );

    expect(events.length).to.equal(1);

    const restakerWithSigner = restakerGateway.connect(accounts[0]);

    let setTokenTx = await restakerWithSigner.setLiquidityToken(
      mockLiquidityToken.target,
    );

    await setTokenTx.wait();

    const send_tx = await restakerWithSigner.sendUnstakingTokens(
      "0x1111111111111111111111111111111111111111",
      100,
    );

    await send_tx.wait();

    events = await bridge.queryFilter("SentMessage", send_tx.blockNumber);

    expect(events.length).to.equal(1);

    expect(events[0].args.sender).to.equal(restakerGateway.target);

    const token_balance = await peggedTokenContract.balanceOf(receiverAddress);
    expect(origin_balance - token_balance).to.be.eql(100n);
  });

  it("Receive tokens test", async function () {
    const accounts = await hre.ethers.getSigners();
    const contractWithSigner = bridge.connect(accounts[0]);

    const balance_before = await mockLiquidityToken.balanceOf(
      restakerGateway.target,
    );

    const gatewayInterface = new ethers.Interface(restakingGatewayAbi);
    const _to = accounts[3].address;
    const _from = accounts[0].address;
    const _amount = 100;

    const functionSelector = gatewayInterface.getFunction(
      "receiveUnstakingTokens",
    ).selector;

    const _message =
      functionSelector +
      AbiCoder.defaultAbiCoder()
        .encode(["address", "address", "uint256"], [_from, _to, _amount])
        .slice(2);

    const data = AbiCoder.defaultAbiCoder()
      .encode(
        ["address", "address", "uint256", "uint256", "bytes"],
        [restakerGateway.target, accounts[3].address, 0, 0, _message],
      )
      .slice(2);

    const inputBytes = Buffer.from(data, "hex");
    const hash = ethers.keccak256(inputBytes);

    expect(hash).to.equal(
      "0xe81bf0a02588d8847097c757448a4d06f94c7f093af5e7aea71a59f847186fb3",
    );

    const receive_tx = await contractWithSigner.receiveMessage(
      "0x1111111111111111111111111111111111111111",
      restakerGateway.target,
      0,
      0,
      _message,
    );

    await receive_tx.wait();

    let error_events = await bridge.queryFilter(
      "Error",
      receive_tx.blockNumber,
    );

    expect(error_events.length).to.equal(0);
    let events = await bridge.queryFilter(
      "ReceivedMessage",
      receive_tx.blockNumber,
    );

    expect(events.length).to.equal(1);
    expect(events[0].args.messageHash).to.equal(
      "0xd82bfefc775c0014ba0b0e4b4b91779ee868954168ccde3d9a52712bb6396664",
    );
    expect(events[0].args.successfulCall).to.equal(true);

    const balance = await mockLiquidityToken.balanceOf(restakerGateway.target);

    expect(balance_before - balance).to.be.eql(100n);
  });
});
