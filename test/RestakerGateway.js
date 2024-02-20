const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { address } = require("hardhat/internal/core/config/config-validation");

describe("RestakerGateway", function () {
  let bridge;
  let erc20Gateway;
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

    const ERC20GatewayContract =
      await ethers.getContractFactory("ERC20Gateway");
    erc20Gateway = await ERC20GatewayContract.deploy(
      bridge.address,
      tokenFactory.address,
      {
        value: ethers.utils.parseEther("1000"),
      },
    );
    await erc20Gateway.deployed();

    const authTx = await tokenFactory.transferOwnership(erc20Gateway.address);
    await authTx.wait();

    const Token = await ethers.getContractFactory("MockERC20Token");
    token = await Token.deploy(
      "Mock Token",
      "TKN",
      ethers.utils.parseEther("1000000"),
      accounts[0].address,
    );
    await token.deployed();

    const MockLiquidityToken = await ethers.getContractFactory("MockLiquidityToken");
    mockLiquidityToken = await MockLiquidityToken.deploy(
        "Liquidity Token",
        "LQT",
        ethers.utils.parseEther("1000000"),
        accounts[0].address,
    );
    await mockLiquidityToken.deployed();



    const MockRestaker = await ethers.getContractFactory("MockRestaker");
    mockRestaker = await MockRestaker.deploy(
        mockLiquidityToken.address,
    );
    await mockRestaker.deployed();

    let tokenWithSigner = mockLiquidityToken.connect(accounts[0])

    let tx = await tokenWithSigner.setRestaker(
        mockRestaker.address
    )
    await tx.wait()

    const RestakerGateway = await ethers.getContractFactory("RestakerGateway");
    restakingGatewayAbi = RestakerGateway.interface.format();
    restakerGateway = await RestakerGateway.deploy(
        erc20Gateway.address,
        mockRestaker.address,
        bridge.address

    );
    await restakerGateway.deployed();

  });

  it("Stake tokens test", async function () {
    const accounts = await hre.ethers.getSigners();

    const origin_account_balance = await hre.ethers.provider.getBalance(
        accounts[0].address,
    );
    const origin_balance = await mockLiquidityToken.balanceOf(erc20Gateway.address);

    const contractWithSigner = restakerGateway.connect(accounts[0]);

    const send_tx = await contractWithSigner.sendRestakedTokens(
      "0x1111111111111111111111111111111111111111",
        { value: 1000 },
    );

    let receipt = await send_tx.wait();

    let gasUsed = receipt.cumulativeGasUsed * receipt.effectiveGasPrice;

    const events = await bridge.queryFilter("SentMessage", send_tx.blockNumber);

    expect(events.length).to.equal(1);

    expect(events[0].args.sender).to.equal(erc20Gateway.address);


    const account_balance = await hre.ethers.provider.getBalance(
        accounts[0].address,
    );

    expect(origin_account_balance.sub(account_balance).sub(gasUsed)).to.be.eql(BigNumber.from(1000))

    const token_balance = await mockLiquidityToken.balanceOf(erc20Gateway.address);

    expect(token_balance.sub(origin_balance)).to.be.eql(BigNumber.from(1000))

  });

  it("Receive tokens test", async function () {
    const accounts = await hre.ethers.getSigners();
    const contractWithSigner = bridge.connect(accounts[0]);

    const receiverAddress = await accounts[3].getAddress();

    const origin_balance =
      await hre.ethers.provider.getBalance(receiverAddress);

    const gatewayInterface = new ethers.utils.Interface(restakingGatewayAbi);
    const _to = accounts[3].address;
    const _from = accounts[0].address;
    const _amount = 100;

    const functionSelector = gatewayInterface.getSighash(
      "receiveRestakedTokens(address,address,uint256)",
    );


    const _message =
      functionSelector +
      ethers.utils.defaultAbiCoder
        .encode(
          ["address", "address", "uint256"],
          [
            _from,
            _to,
            _amount,
          ],
        )
        .slice(2);

    const data = hre.ethers.utils.defaultAbiCoder
      .encode(
        ["address", "address", "uint256", "uint256", "bytes"],
        [erc20Gateway.address, accounts[3].address, 0, 0, _message],
      )
      .slice(2);

    const inputBytes = Buffer.from(data, "hex");
    const hash = ethers.utils.keccak256(inputBytes);

    expect(hash).to.equal(
      "0xece47fe60704fad6f857c8f1aaa2ff9dec7d886b6171252458f06bf5ee7ea699",
    );

    const receive_tx = await contractWithSigner.receiveMessage(
      "0x1111111111111111111111111111111111111111",
      erc20Gateway.address,
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
      "0x6451ff2a61f674a843f3db146d0fe0e8f0b5ba4c8288dd23c32d1e4dcc83d812",
    );
    expect(events[0].args.successfulCall).to.equal(true);

    const new_balance = await hre.ethers.provider.getBalance(receiverAddress);
    expect(new_balance.sub(origin_balance)).to.be.eql(BigNumber.from(0));

    const tokenArtifact = await artifacts.readArtifact("ERC20PeggedToken");
    const tokenAbi = tokenArtifact.abi;

    let peggedTokenContract = new ethers.Contract(
      peggedTokenAddress,
      tokenAbi,
      ethers.provider.getSigner(),
    );

    const balance = await peggedTokenContract.balanceOf(receiverAddress);

    expect(balance).to.be.eql(BigNumber.from(100));

    try {
      const repeat_receive_tx = await contractWithSigner.receiveMessage(
        "0x1111111111111111111111111111111111111111",
        erc20Gateway.address,
        0,
        0,
        [],
      );

      await repeat_receive_tx.wait();
    } catch (error) {
      expect(error.toString()).to.equal(
        "Error: VM Exception while processing transaction: " +
          "reverted with reason string 'Message already received'",
      );
    }
  });
});
