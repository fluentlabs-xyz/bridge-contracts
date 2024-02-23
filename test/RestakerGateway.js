const { expect } = require("chai");
const { BigNumber } = require("ethers");

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
    await peggedToken.deployed();

    const BridgeContract = await ethers.getContractFactory("Bridge");
    const accounts = await hre.ethers.getSigners();
    bridge = await BridgeContract.deploy(
      accounts[0].address,
      accounts[1].address,
    );
    await bridge.deployed();

    const TokenFactoryContract =
      await ethers.getContractFactory("ERC20TokenFactory");
    tokenFactory = await TokenFactoryContract.deploy(peggedToken.address);
    await tokenFactory.deployed();

    const Token = await ethers.getContractFactory("MockERC20Token");
    token = await Token.deploy(
      "Mock Token",
      "TKN",
      ethers.utils.parseEther("1000000"),
      accounts[0].address,
    );
    await token.deployed();

    const MockLiquidityToken =
      await ethers.getContractFactory("MockLiquidityToken");
    mockLiquidityToken = await MockLiquidityToken.deploy(
      "Liquidity Token",
      "LQT",
      ethers.utils.parseEther("1000000"),
      accounts[0].address,
    );
    await mockLiquidityToken.deployed();

    const MockRestaker = await ethers.getContractFactory("MockRestaker");
    mockRestaker = await MockRestaker.deploy(mockLiquidityToken.address);
    await mockRestaker.deployed();

    let tokenWithSigner = mockLiquidityToken.connect(accounts[0]);

    let tx = await tokenWithSigner.setRestaker(mockRestaker.address);
    await tx.wait();

    const RestakerGateway = await ethers.getContractFactory("RestakerGateway");
    restakingGatewayAbi = RestakerGateway.interface.format();
    restakerGateway = await RestakerGateway.deploy(
      bridge.address,
      mockRestaker.address,
      tokenFactory.address,
    );
    await restakerGateway.deployed();

    const authTx = await tokenFactory.transferOwnership(
      restakerGateway.address,
    );
    await authTx.wait();
  });

  it("Stake tokens test", async function () {
    const accounts = await hre.ethers.getSigners();

    const origin_account_balance = await hre.ethers.provider.getBalance(
      accounts[0].address,
    );
    const origin_balance = await mockLiquidityToken.balanceOf(
      restakerGateway.address,
    );

    const contractWithSigner = restakerGateway.connect(accounts[0]);

    const send_tx = await contractWithSigner.sendRestakedTokens(
      "0x1111111111111111111111111111111111111111",
      { value: 1000 },
    );

    let receipt = await send_tx.wait();

    let gasUsed = receipt.cumulativeGasUsed * receipt.effectiveGasPrice;

    const events = await bridge.queryFilter("SentMessage", send_tx.blockNumber);

    expect(events.length).to.equal(1);

    expect(events[0].args.sender).to.equal(restakerGateway.address);

    const account_balance = await hre.ethers.provider.getBalance(
      accounts[0].address,
    );

    expect(origin_account_balance.sub(account_balance).sub(gasUsed)).to.be.eql(
      BigNumber.from(1000),
    );

    const token_balance = await mockLiquidityToken.balanceOf(
      restakerGateway.address,
    );

    expect(token_balance.sub(origin_balance)).to.be.eql(BigNumber.from(1000));
  });

  it("Unstake tokens test", async function () {
    const accounts = await hre.ethers.getSigners();
    const contractWithSigner = bridge.connect(accounts[0]);

    const receiverAddress = await accounts[0].getAddress();

    const gatewayInterface = new ethers.utils.Interface(restakingGatewayAbi);
    const _token = mockLiquidityToken.address;
    const _to = accounts[0].address;
    const _from = accounts[3].address;
    const _amount = 1000;

    const functionSelector = gatewayInterface.getSighash(
      "receivePeggedTokens(address,address,address,address,uint256,bytes)",
    );

    const peggedTokenAddress = await tokenFactory.computePeggedTokenAddress(
      restakerGateway.address,
      mockLiquidityToken.address,
    );

    const tokenMetadata = {
      name: "Liq token",
      symbol: "LQT",
      decimals: 18,
    };

    const encodedTokenMetadata = ethers.utils.defaultAbiCoder.encode(
      ["string", "string", "uint8"],
      [tokenMetadata.symbol, tokenMetadata.name, tokenMetadata.decimals],
    );

    const _message =
      functionSelector +
      ethers.utils.defaultAbiCoder
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

    const data = hre.ethers.utils.defaultAbiCoder
      .encode(
        ["address", "address", "uint256", "uint256", "bytes"],
        [restakerGateway.address, accounts[3].address, 0, 0, _message],
      )
      .slice(2);

    const inputBytes = Buffer.from(data, "hex");
    const hash = ethers.utils.keccak256(inputBytes);

    expect(hash).to.equal(
      "0xd0330375c6a7ea9ccd0085294287f20d60982f8e2d18c61eca5015c0e67a88e5",
    );

    const receive_tx = await contractWithSigner.receiveMessage(
      "0x1111111111111111111111111111111111111111",
      restakerGateway.address,
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
      ethers.provider.getSigner(),
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
      mockLiquidityToken.address,
    );

    await setTokenTx.wait();

    const send_tx = await restakerWithSigner.sendUnstakingTokens(
      "0x1111111111111111111111111111111111111111",
      100,
    );

    await send_tx.wait();

    events = await bridge.queryFilter("SentMessage", send_tx.blockNumber);

    expect(events.length).to.equal(1);

    expect(events[0].args.sender).to.equal(restakerGateway.address);

    const token_balance = await peggedTokenContract.balanceOf(receiverAddress);
    expect(origin_balance.sub(token_balance)).to.be.eql(BigNumber.from(100));
  });

  it("Receive tokens test", async function () {
    const accounts = await hre.ethers.getSigners();
    const contractWithSigner = bridge.connect(accounts[0]);

    const balance_before = await mockLiquidityToken.balanceOf(
      restakerGateway.address,
    );

    const gatewayInterface = new ethers.utils.Interface(restakingGatewayAbi);
    const _to = accounts[3].address;
    const _from = accounts[0].address;
    const _amount = 100;

    const functionSelector = gatewayInterface.getSighash(
      "receiveUnstakingTokens(address,address,uint256)",
    );

    const _message =
      functionSelector +
      ethers.utils.defaultAbiCoder
        .encode(["address", "address", "uint256"], [_from, _to, _amount])
        .slice(2);

    const data = hre.ethers.utils.defaultAbiCoder
      .encode(
        ["address", "address", "uint256", "uint256", "bytes"],
        [restakerGateway.address, accounts[3].address, 0, 0, _message],
      )
      .slice(2);

    const inputBytes = Buffer.from(data, "hex");
    const hash = ethers.utils.keccak256(inputBytes);

    expect(hash).to.equal(
      "0xc01c06cce741e56315d428806aa809561eac38bc4c8e96deb2d0662578f6dc0d",
    );

    const receive_tx = await contractWithSigner.receiveMessage(
      "0x1111111111111111111111111111111111111111",
      restakerGateway.address,
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

    const balance = await mockLiquidityToken.balanceOf(restakerGateway.address);

    expect(balance_before.sub(balance)).to.be.eql(BigNumber.from(100));
  });
});
