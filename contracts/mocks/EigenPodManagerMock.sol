// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../restaker/interfaces/IEigenPodManager.sol";
import "hardhat/console.sol";

contract EigenPodManagerMock is Initializable, IEigenPodManager {
    bytes internal constant beaconProxyBytecode =
        type(BeaconProxy).creationCode;
    uint256 public numPods;
    uint256 public maxPods = 1000;
    IBeacon public eigenPodBeacon;

    IETHPOSDeposit public ethPOS;
    IStrategyManager public strategyManager;
    ISlasher public slasher;

    mapping(address => IEigenPod) public ownerToPod;

    constructor(
        IETHPOSDeposit _ethPOS,
        IBeacon _eigenPodBeacon,
        IStrategyManager _strategyManager,
        ISlasher _slasher
    ) {
        ethPOS = _ethPOS;
        eigenPodBeacon = _eigenPodBeacon;
        strategyManager = _strategyManager;
        slasher = _slasher;
        _disableInitializers();
    }

    function test_addPod(address owner, IEigenPod pod) external {
        ownerToPod[owner] = pod;
    }

    function createPod() external override returns (address) {
        require(
            !hasPod(msg.sender),
            "EigenPodManager.createPod: Sender already has a pod"
        );
        // deploy a pod if the sender doesn't have one already
        return address(_deployPod());
    }

    function _deployPod() internal returns (IEigenPod) {
        // check that the limit of EigenPods has not been hit, and increment the EigenPod count
        require(
            numPods + 1 <= maxPods,
            "EigenPodManager._deployPod: pod limit reached"
        );
        ++numPods;
        // create the pod
        IEigenPod pod = IEigenPod(
            Create2.deploy(
                0,
                bytes32(uint256(uint160(msg.sender))),
                // set the beacon address to the eigenPodBeacon and initialize it
                abi.encodePacked(
                    beaconProxyBytecode,
                    abi.encode(eigenPodBeacon, "")
                )
            )
        );
        pod.initialize(msg.sender);
        // store the pod in the mapping
        ownerToPod[msg.sender] = pod;
        emit PodDeployed(address(pod), msg.sender);
        return pod;
    }

    function stake(
        bytes calldata pubkey,
        bytes calldata signature,
        bytes32 depositDataRoot
    ) external payable override {}

    function getPod(
        address podOwner
    ) external view override returns (IEigenPod) {
        return ownerToPod[podOwner];
    }

    function beaconChainOracle()
        external
        view
        override
        returns (IBeaconChainOracle)
    {
        return IBeaconChainOracle(address(0));
    }

    function getBlockRootAtTimestamp(
        uint64 timestamp
    ) external view override returns (bytes32) {
        return bytes32(0);
    }

    function hasPod(address podOwner) public view override returns (bool) {
        return address(ownerToPod[podOwner]) != address(0);
    }

    function podOwnerShares(
        address podOwner
    ) external view override returns (int256) {
        return 0;
    }

    function beaconChainETHStrategy()
        external
        view
        override
        returns (IStrategy)
    {
        return IStrategy(address(0));
    }

    function recordBeaconChainETHBalanceUpdate(
        address podOwner,
        int256 sharesDelta
    ) external override {}

    function updateBeaconChainOracle(
        IBeaconChainOracle newBeaconChainOracle
    ) external override {}

    function removeShares(address podOwner, uint256 shares) external override {}

    function addShares(
        address podOwner,
        uint256 shares
    ) external override returns (uint256) {}

    function withdrawSharesAsTokens(
        address podOwner,
        address destination,
        uint256 shares
    ) external override {}

    function denebForkTimestamp() external view override returns (uint64) {}

    function setDenebForkTimestamp(
        uint64 newDenebForkTimestamp
    ) external override {}
}
