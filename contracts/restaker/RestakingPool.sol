// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./Configurable.sol";
import "./interfaces/IEigenPod.sol";
import "./restaker/IRestaker.sol";
import "./interfaces/ISignatureUtils.sol";

contract RestakingPool is Configurable, ReentrancyGuard, IRestakingPool {
    /**
     * @dev block gas limit
     */
    uint64 internal constant MAX_GAS_LIMIT = 30_000_000;

    /**
     * @notice gas available to receive unstake
     * @dev max gas allocated for {_sendValue}
     */
    uint256 public constant CALL_GAS_LIMIT = 10_000;

    uint256 internal _minStakeAmount;
    uint256 internal _minUnstakeAmount;

    /**
     * @dev staked ETH to protocol.
     */
    uint256 internal _totalStaked;
    /**
     * @dev unstaked ETH from protocol
     */
    uint256 internal _totalUnstaked;

    /**
     * @dev Current gap of {_pendingUnstakes}.
     */
    uint256 internal _pendingGap;
    /**
     * @dev Unstake queue.
     */
    Unstake[] internal _pendingUnstakes;
    /**
     * @dev Total unstake amount in {_pendingUnstakes}.
     */
    uint256 internal _totalPendingUnstakes;
    mapping(address => uint256) internal _totalUnstakesOf;
    /**
     * @dev max gas spendable per interation of {distributeUnstakes}
     */
    uint32 internal _distributeGasLimit;

    uint256 internal _totalClaimable;
    mapping(address => uint256) internal _claimable;

    /**
     * @dev keccak256(provider name) => Restaker
     */
    mapping(bytes32 => address) internal _restakers;

    /**
     * @dev max accepted TVL of protocol
     */
    uint256 _maxTVL;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50 - 13] private __gap;

    /*******************************************************************************
                        CONSTRUCTOR
    *******************************************************************************/

    /// @dev https://docs.openzeppelin.com/upgrades-plugins/1.x/writing-upgradeable#initializing_the_implementation_contract
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(
        IProtocolConfig config,
        uint32 distributeGasLimit,
        uint256 maxTVL
    ) {
        __Configurable_init(config);
        __RestakingPool_init(distributeGasLimit, maxTVL);
    }

    function __RestakingPool_init(
        uint32 distributeGasLimit,
        uint256 maxTVL
    ) internal {
        _setDistributeGasLimit(distributeGasLimit);
        _setMaxTVL(maxTVL);
    }

    /*******************************************************************************
                        WRITE FUNCTIONS
    *******************************************************************************/

    /**
     *
     * @dev need to open incoming transfers to receive ETH from EigenPods
     */
    receive() external payable {
        emit Received(_msgSender(), msg.value);
    }

    function stake(bytes32 code) external payable {
        stake();
        emit ReferralStake(code);
    }

    /**
     * @notice Exchange `msg.value` ETH for inETH by ratio.
     */
    function stake() public payable {
        uint256 amount = msg.value;

        if (amount < getMinStake()) {
            revert PoolStakeAmLessThanMin();
        }

        if (amount > availableToStake()) {
            revert PoolStakeAmGreaterThanAvailable();
        }

        ILiquidityToken token = config().getLiquidityToken();

        uint256 shares = token.convertToShares(amount);
        token.mint(_msgSender(), shares);

        _totalStaked += amount;
        emit Staked(_msgSender(), amount, shares);
    }

    /**
     *
     * @notice Deposit pubkeys together with 32 ETH to given `provider`.
     * @param provider Provider to restake ETH.
     * @param pubkeys Array of provider's `pubkeys`.
     * @param signatures Array of provider's `signatures`.
     * @param deposit_data_roots Array of provider's `deposit_data_roots`.
     */
    function batchDeposit(
        string memory provider,
        bytes[] calldata pubkeys,
        bytes[] calldata signatures,
        bytes32[] calldata deposit_data_roots
    ) external onlyOperator nonReentrant {
        uint256 pubkeysLen = pubkeys.length;

        if (
            pubkeysLen != signatures.length ||
            pubkeysLen != deposit_data_roots.length
        ) {
            revert PoolWrongInputLength();
        }
        if (address(this).balance < 32 ether * pubkeysLen) {
            revert PoolInsufficientBalance();
        }

        IEigenPodManager restaker = IEigenPodManager(
            _getRestakerOrRevert(provider)
        );

        for (uint i; i < pubkeysLen; i++) {
            restaker.stake{value: 32 ether}(
                pubkeys[i],
                signatures[i],
                deposit_data_roots[i]
            );
        }

        emit Deposited(provider, pubkeys);
    }

    function getLiquidityToken() external view returns (address) {
        return config().getLiquidityTokenAddress();
    }

    function unstake(address to, uint256 shares) external nonReentrant {
        this.unstakeFrom(_msgSender(), to, shares);
    }

    function unstakeFrom(address from, address to, uint256 shares) external {
        if (shares < getMinUnstake()) {
            revert PoolUnstakeAmLessThanMin();
        }

        ILiquidityToken token = config().getLiquidityToken();
        uint256 amount = token.convertToAmount(shares);

        // @dev don't need to check balance, because it throws ERC20InsufficientBalance
        token.burn(from, shares);

        _addIntoQueue(to, amount);

        _totalUnstaked += amount;
        emit Unstaked(from, to, amount, shares);
    }

    function _addIntoQueue(address recipient, uint256 amount) internal {
        if (recipient == address(0)) {
            revert PoolZeroAddress();
        }
        if (amount == 0) {
            revert PoolZeroAmount();
        }

        // each new request is placed at the end of the queue
        _totalPendingUnstakes += amount;
        _totalUnstakesOf[recipient] += amount;

        _pendingUnstakes.push(Unstake(recipient, amount));
    }

    function claimRestaker(
        string calldata provider,
        uint256 fee
    ) external onlyOperator {
        IRestaker restaker = IRestaker(_getRestakerOrRevert(provider));
        uint256 balanceBefore = address(this).balance;
        restaker.__claim();
        uint256 claimed = address(this).balance - balanceBefore;

        if (fee > claimed) {
            revert AmbiguousFee(claimed, fee);
        }

        address treasury = config().getTreasury();
        if (fee > 0) {
            // send committed by operator fee (deducted from ratio) to multi-sig treasury
            _sendValue(treasury, fee, false);
        }

        // from {provider} fee claimed to {treasury}
        emit FeeClaimed(address(restaker), treasury, fee, claimed);
    }

    /**
     * @notice Pay unstakes from {getPending} balance.
     * @dev Callable by operator once per 1-3 days if {getPending} enough to pay at least one unstake.
     */
    function distributeUnstakes() external onlyOperator nonReentrant {
        /// no need to check for {_distributeGasLimit} because it's never be 0
        /// TODO: claim from Restakers and spent fee from this sum

        uint256 poolBalance = getPending();

        uint256 unstakesLength = _pendingUnstakes.length;
        uint256 i = _pendingGap;

        while (
            i < unstakesLength &&
            poolBalance > 0 &&
            gasleft() > _distributeGasLimit
        ) {
            Unstake memory unstake_ = _pendingUnstakes[i];

            if (unstake_.recipient == address(0) || unstake_.amount == 0) {
                ++i;
                continue;
            }

            if (poolBalance < unstake_.amount) {
                break;
            }

            _totalUnstakesOf[unstake_.recipient] -= unstake_.amount;
            _totalPendingUnstakes -= unstake_.amount;
            poolBalance -= unstake_.amount;
            delete _pendingUnstakes[i];
            ++i;
            _addClaimable(unstake_.recipient, unstake_.amount);
        }
        _pendingGap = i;
    }

    function _sendValue(
        address recipient,
        uint256 amount,
        bool limit
    ) internal returns (bool success) {
        if (address(this).balance < amount) {
            revert PoolInsufficientBalance();
        }

        address payable wallet = payable(recipient);
        if (limit) {
            assembly {
                success := call(CALL_GAS_LIMIT, wallet, amount, 0, 0, 0, 0)
            }
        } else {
            (success, ) = wallet.call{value: amount}("");
        }

        return success;
    }

    function _addClaimable(address account, uint256 amount) internal {
        _totalClaimable += amount;
        _claimable[account] += amount;
        emit ClaimExpected(account, amount);
    }

    /**
     *
     * @notice Claim ETH available in {claimableOf}
     */
    function claimUnstake(address claimer) external nonReentrant {
        if (claimer == address(0)) {
            revert PoolZeroAddress();
        }

        uint256 amount = claimableOf(claimer);

        if (amount == 0) {
            revert PoolZeroAmount();
        }

        if (address(this).balance < getTotalClaimable()) {
            revert PoolInsufficientBalance();
        }
        _totalClaimable -= amount;
        _claimable[claimer] = 0;

        bool result = _sendValue(claimer, amount, false);
        if (!result) {
            revert PoolFailedInnerCall();
        }

        emit UnstakeClaimed(claimer, _msgSender(), amount);
    }

    /*******************************************************************************
                        EIGEN POD OWNER WRITE FUNCTIONS
                        THIS FUNCTIONS MAKE POSSIBLE TO
                        CALL DIFFERENT CONTRACTS WITH
                        RESTAKER CONTEXT
    *******************************************************************************/

    /**
     *
     * @notice Will be called only once for each restaker, because it activates restaking.
     * @dev deprecated. Remove after EigenPod activation
     */
    function activateRestaking(string memory provider) external onlyOperator {
        address restaker = _getRestakerOrRevert(provider);
        // it withdraw ETH to restaker
        IEigenPod(restaker).activateRestaking();
    }

    /**
     *
     * @notice withdraw not restaked ETH
     * @dev deprecated. Remove after EigenPod activation
     */
    function withdrawBeforeRestaking(
        string memory provider
    ) external onlyOperator {
        address restaker = _getRestakerOrRevert(provider);
        // it withdraw ETH to restaker
        IEigenPod(restaker).withdrawBeforeRestaking();
    }

    /**
     * @notice Verify that validators has withdrawal credentials pointed to EigenPod
     */
    function verifyWithdrawalCredentials(
        string memory provider,
        uint64 oracleTimestamp,
        BeaconChainProofs.StateRootProof calldata stateRootProof,
        uint40[] calldata validatorIndices,
        bytes[] calldata validatorFieldsProofs,
        bytes32[][] calldata validatorFields
    ) external onlyOperator {
        IEigenPod restaker = IEigenPod(_getRestakerOrRevert(provider));
        restaker.verifyWithdrawalCredentials(
            oracleTimestamp,
            stateRootProof,
            validatorIndices,
            validatorFieldsProofs,
            validatorFields
        );
    }

    function withdrawNonBeaconChainETHBalanceWei(
        string memory provider,
        uint256 amountToWithdraw
    ) external onlyOperator {
        IEigenPod restaker = IEigenPod(_getRestakerOrRevert(provider));
        restaker.withdrawNonBeaconChainETHBalanceWei(
            address(this),
            amountToWithdraw
        );
    }

    function recoverTokens(
        string memory provider,
        IERC20[] memory tokenList,
        uint256[] memory amountsToWithdraw
    ) external onlyOperator {
        IEigenPod restaker = IEigenPod(_getRestakerOrRevert(provider));
        restaker.recoverTokens(
            tokenList,
            amountsToWithdraw,
            config().getOperator()
        );
    }

    function delegateTo(
        string memory provider,
        address elOperator,
        ISignatureUtils.SignatureWithExpiry memory approverSignatureAndExpiry,
        bytes32 approverSalt
    ) external onlyOperator {
        IDelegationManager restaker = IDelegationManager(
            _getRestakerOrRevert(provider)
        );
        restaker.delegateTo(
            elOperator,
            approverSignatureAndExpiry,
            approverSalt
        );
    }

    function undelegate(string memory provider) external onlyOperator {
        IDelegationManager restaker = IDelegationManager(
            _getRestakerOrRevert(provider)
        );
        restaker.undelegate(address(restaker));
    }

    /*******************************************************************************
                        VIEW FUNCTIONS
    *******************************************************************************/

    /**
     *
     * @notice Get ETH amount available to stake before protocol reach max TVL.
     */
    function availableToStake() public view virtual returns (uint256) {
        uint256 totalAssets = config().getLiquidityToken().totalAssets();
        if (totalAssets > _maxTVL) {
            return 0;
        }
        return _maxTVL - totalAssets;
    }

    /**
     * @notice Get minimal available amount to stake.
     */
    function getMinStake() public view virtual returns (uint256 amount) {
        // 1 shares = minimal respresentable amount
        uint256 minConvertableAmount = config()
            .getLiquidityToken()
            .convertToAmount(1);
        return
            _minStakeAmount > minConvertableAmount
                ? _minStakeAmount
                : minConvertableAmount;
    }

    /**
     * @notice Get minimal availabe unstake of shares.
     */
    function getMinUnstake()
        public
        view
        virtual
        override
        returns (uint256 shares)
    {
        ILiquidityToken token = config().getLiquidityToken();
        // 1 shares => amount => shares = minimal possible shares amount
        uint256 minConvertableShare = token.convertToShares(
            token.convertToAmount(1)
        );
        return
            _minUnstakeAmount > minConvertableShare
                ? _minUnstakeAmount
                : minConvertableShare;
    }

    /**
     * @notice Get free to {batchDeposit}/{distributeUnstakes} balance.
     */
    function getPending() public view returns (uint256) {
        uint256 balance = address(this).balance;
        uint256 claimable = getTotalClaimable();

        if (claimable > balance) {
            return 0;
        } else {
            return balance - claimable;
        }
    }

    /**
     * @notice Total amount waiting for claim by users.
     */
    function getTotalClaimable() public view returns (uint256) {
        return _totalClaimable;
    }

    /**
     * @notice Total amount of waiting unstakes.
     */
    function getTotalPendingUnstakes() public view returns (uint256) {
        return _totalPendingUnstakes;
    }

    /**
     * @notice Get all waiting unstakes in queue.
     * @dev Avoid to use not in view methods.
     */
    function getUnstakes() external view returns (Unstake[] memory unstakes) {
        unstakes = new Unstake[](_pendingUnstakes.length - _pendingGap);
        uint256 j;
        for (uint256 i = _pendingGap; i < _pendingUnstakes.length; i++) {
            unstakes[j++] = _pendingUnstakes[i];
        }
    }

    /**
     * @notice Get waiting unstakes.
     * @dev Avoid to use not in view methods.
     */
    function getUnstakesOf(
        address recipient
    ) external view returns (Unstake[] memory unstakes) {
        unstakes = new Unstake[](_pendingUnstakes.length - _pendingGap);
        uint256 j;
        for (uint256 i = _pendingGap; i < _pendingUnstakes.length; i++) {
            if (_pendingUnstakes[i].recipient == recipient) {
                unstakes[j++] = _pendingUnstakes[i];
            }
        }
        uint256 removeCells = unstakes.length - j;
        if (removeCells > 0) {
            assembly {
                mstore(unstakes, j)
            }
        }
    }

    /**
     *
     * @notice Get total amount of waiting unstakes of user.
     */
    function getTotalUnstakesOf(
        address recipient
    ) public view returns (uint256) {
        return _totalUnstakesOf[recipient];
    }

    /**
     * @notice Is {claimableOf} > 0.
     */
    function hasClaimable(address claimer) public view returns (bool) {
        return _claimable[claimer] != uint256(0);
    }

    /**
     * @notice Claimable amount of non executed unstakes.
     * @dev Value increased when {_sendValue} failed during {distributeUnstakes} due to {CALL_GAS_LIMIT}.
     */
    function claimableOf(address claimer) public view returns (uint256) {
        return _claimable[claimer];
    }

    function getRestaker(
        string calldata provider
    ) public view returns (address) {
        return _restakers[_getProviderHash(provider)];
    }

    function _getRestakerOrRevert(
        string memory provider
    ) internal view returns (address restaker) {
        restaker = _restakers[_getProviderHash(provider)];
        if (restaker == address(0)) {
            revert PoolRestakerNotExists();
        }
    }

    function _getProviderHash(
        string memory providerName
    ) internal pure returns (bytes32) {
        return keccak256(bytes(providerName));
    }

    /*******************************************************************************
                        GOVERNANCE FUNCTIONS
    *******************************************************************************/

    /**
     * @notice Deploy Restaker contract for the given provider.
     */
    function addRestaker(string memory provider) external onlyGovernance {
        bytes32 providerHash = _getProviderHash(provider);
        address restaker = _restakers[providerHash];
        if (restaker != address(0)) {
            revert PoolRestakerExists();
        }
        restaker = address(config().getRestakerDeployer().deployRestaker());
        _restakers[providerHash] = restaker;
        emit RestakerAdded(provider, restaker);
    }

    /**
     * @dev Governance can set gas limit allocated for unstake payout
     */
    function setDistributeGasLimit(uint32 newValue) external onlyGovernance {
        _setDistributeGasLimit(newValue);
    }

    function _setDistributeGasLimit(uint32 newValue) internal {
        if (newValue > MAX_GAS_LIMIT || newValue == 0) {
            revert PoolDistributeGasLimitNotInRange(MAX_GAS_LIMIT);
        }
        emit DistributeGasLimitChanged(_distributeGasLimit, newValue);
        _distributeGasLimit = newValue;
    }

    function setMinStake(uint256 newValue) external onlyGovernance {
        emit MinStakeChanged(_minStakeAmount, newValue);
        _minStakeAmount = newValue;
    }

    function setMinUnstake(uint256 newValue) external onlyGovernance {
        emit MinUntakeChanged(_minUnstakeAmount, newValue);
        _minUnstakeAmount = newValue;
    }

    function setMaxTVL(uint256 newValue) external onlyGovernance {
        _setMaxTVL(newValue);
    }

    function _setMaxTVL(uint256 newValue) internal {
        if (newValue == 0) {
            revert PoolZeroAmount();
        }
        emit MaxTVLChanged(_maxTVL, newValue);
        _maxTVL = newValue;
    }
}
