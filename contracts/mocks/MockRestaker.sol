import {ILiquidityToken} from "../interfaces/ILiquidityToken.sol";
import {IRestakerProvider} from "../interfaces/IRestakerProvider.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MockRestaker is IRestakerProvider, ReentrancyGuard {
    address public liquidityToken;

    constructor(address _liquidityToken) {
        liquidityToken = _liquidityToken;
    }

    function getMinStake() external view returns (uint256) {
        return 0;
    }

    function getMinUnstake() external view returns (uint256) {
        return 0;
    }

    function stake() external payable {
        uint256 amount = msg.value;

        ILiquidityToken token = ILiquidityToken(liquidityToken);
        uint256 shares = token.convertToShares(amount);
        token.mint(msg.sender, shares);

        emit Staked(msg.sender, amount, shares);
    }

    function getLiquidityToken() external view returns (address) {
        return liquidityToken;
    }

    function unstake(address to, uint256 shares) external nonReentrant {
        address from = msg.sender;
        this.unstakeFrom(from, to, shares);
    }

    function unstakeFrom(
        address from,
        address to,
        uint256 shares
    ) external nonReentrant {
        ILiquidityToken token = ILiquidityToken(liquidityToken);
        uint256 amount = token.convertToAmount(shares);

        token.burn(from, shares);

        emit Unstaked(from, to, amount, shares);
    }
}
