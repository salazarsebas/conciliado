// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PayoutBatch
/// @author Conciliado
/// @notice Executes batched USDC payouts from the payer directly to allowed payees.
/// @dev Uses checks-effects-interactions and SafeERC20 transfers from payer to payee; contract holds no funds.
contract PayoutBatch is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Reverts when a required address is zero.
    error ZeroAddress();

    /// @notice Reverts when an empty batch is provided.
    error EmptyBatch();

    /// @notice Reverts when a line contains a zero payee address.
    error ZeroPayee();

    /// @notice Reverts when a line contains a zero amount.
    error ZeroAmount();

    /// @notice Reverts when a payee is not allowed by the payer.
    /// @param payer The payer attempting to execute the batch.
    /// @param payee The disallowed payee.
    error PayeeNotAllowed(address payer, address payee);

    /// @notice Reverts when an invoice reference has already been used.
    /// @param payer The payer attempting to reuse the reference.
    /// @param ref The invoice reference that is already used.
    error InvoiceRefAlreadyUsed(address payer, bytes32 ref);

    /// @notice Reverts when computed batch total does not equal expected total.
    /// @param computed The computed sum of all line amounts.
    /// @param expected The caller-provided expected total.
    error TotalMismatch(uint256 computed, uint256 expected);

    /// @notice Reverts when the batch exceeds the maximum allowed number of lines.
    /// @param given The number of lines provided.
    /// @param max The maximum allowed.
    error BatchTooLarge(uint256 given, uint256 max);

    /// @notice A payout line item.
    /// @param payee The payout recipient.
    /// @param amount The USDC amount to transfer.
    /// @param invoiceRef The unique invoice reference for idempotency.
    struct Line {
        address payee;
        uint256 amount;
        bytes32 invoiceRef;
    }

    /// @notice Emitted when a payer adds an allowed payee.
    event PayeeAdded(address indexed payer, address indexed payee);

    /// @notice Emitted when a payer removes an allowed payee.
    event PayeeRemoved(address indexed payer, address indexed payee);

    /// @notice Emitted when an invoice line is paid.
    event InvoicePaid(
        uint256 indexed batchId,
        uint256 lineIndex,
        address indexed payee,
        uint256 amount,
        bytes32 indexed invoiceRef
    );

    /// @notice Emitted when a full batch is paid.
    event BatchPaid(uint256 indexed batchId, address indexed payer, uint256 lineCount, uint256 total);

    /// @notice Maximum number of lines allowed in a single batch.
    /// @dev Bounds the O(n²) duplicate-ref check and prevents gas-limit DoS.
    uint256 public constant MAX_LINES = 200;

    /// @notice USDC token address used for payouts.
    address public immutable USDC;

    uint256 private _batchCounter;
    mapping(address => mapping(address => bool)) private _allowedPayees;
    mapping(address => mapping(bytes32 => bool)) private _usedRefs;

    /// @notice Sets the USDC token address.
    /// @dev Reverts if the provided USDC address is zero.
    /// @param usdc The USDC token contract address.
    constructor(address usdc) {
        if (usdc == address(0)) revert ZeroAddress();
        USDC = usdc;
    }

    /// @notice Adds an allowed payee for the caller.
    /// @dev Reverts if `payee` is the zero address.
    /// @param payee The address to allow for payouts.
    function addPayee(address payee) external {
        if (payee == address(0)) revert ZeroAddress();
        _allowedPayees[msg.sender][payee] = true;
        emit PayeeAdded(msg.sender, payee);
    }

    /// @notice Removes an allowed payee for the caller.
    /// @dev Reverts if `payee` is the zero address.
    /// @param payee The address to disallow for payouts.
    function removePayee(address payee) external {
        if (payee == address(0)) revert ZeroAddress();
        _allowedPayees[msg.sender][payee] = false;
        emit PayeeRemoved(msg.sender, payee);
    }

    /// @notice Adds multiple allowed payees for the caller.
    /// @dev Reverts if any address in `payees` is the zero address.
    /// @param payees The addresses to allow for payouts.
    function addPayees(address[] calldata payees) external {
        uint256 length = payees.length;
        for (uint256 i = 0; i < length; ++i) {
            address payee = payees[i];
            if (payee == address(0)) revert ZeroAddress();
            _allowedPayees[msg.sender][payee] = true;
            emit PayeeAdded(msg.sender, payee);
        }
    }

    /// @notice Removes multiple allowed payees for the caller.
    /// @dev Reverts if any address in `payees` is the zero address.
    /// @param payees The addresses to disallow for payouts.
    function removePayees(address[] calldata payees) external {
        uint256 length = payees.length;
        for (uint256 i = 0; i < length; ++i) {
            address payee = payees[i];
            if (payee == address(0)) revert ZeroAddress();
            _allowedPayees[msg.sender][payee] = false;
            emit PayeeRemoved(msg.sender, payee);
        }
    }

    /// @notice Returns whether a payee is allowed by a payer.
    /// @dev Reads the allow-list mapping.
    /// @param payer The payer address.
    /// @param payee The payee address.
    /// @return True if allowed, false otherwise.
    function isPayeeAllowed(address payer, address payee) external view returns (bool) {
        return _allowedPayees[payer][payee];
    }

    /// @notice Returns whether an invoice reference has already been used by a payer.
    /// @dev Reads the invoice-reference usage mapping.
    /// @param payer The payer address.
    /// @param ref The invoice reference.
    /// @return True if used, false otherwise.
    function isInvoiceRefUsed(address payer, bytes32 ref) external view returns (bool) {
        return _usedRefs[payer][ref];
    }

    /// @notice Pays a batch of invoice lines in USDC.
    /// @dev Enforces checks-effects-interactions and marks invoice refs as used before each transfer. Reverts BatchTooLarge if lines.length exceeds MAX_LINES.
    /// @param lines The payout lines to execute.
    /// @param expectedTotal The expected total amount for all lines.
    /// @return batchId The incremented batch identifier.
    function payBatch(Line[] calldata lines, uint256 expectedTotal) external nonReentrant returns (uint256 batchId) {
        uint256 length = lines.length;
        if (length == 0) revert EmptyBatch();
        if (length > MAX_LINES) revert BatchTooLarge(length, MAX_LINES);

        uint256 sum = 0;

        for (uint256 i = 0; i < length; ++i) {
            Line calldata line = lines[i];

            if (line.payee == address(0)) revert ZeroPayee();
            if (line.amount == 0) revert ZeroAmount();
            if (!_allowedPayees[msg.sender][line.payee]) revert PayeeNotAllowed(msg.sender, line.payee);
            if (_usedRefs[msg.sender][line.invoiceRef]) revert InvoiceRefAlreadyUsed(msg.sender, line.invoiceRef);

            sum += line.amount;
        }

        for (uint256 i = 0; i < length; ++i) {
            bytes32 refI = lines[i].invoiceRef;
            for (uint256 j = 0; j < i; ++j) {
                if (lines[j].invoiceRef == refI) {
                    revert InvoiceRefAlreadyUsed(msg.sender, refI);
                }
            }
        }

        if (sum != expectedTotal) revert TotalMismatch(sum, expectedTotal);

        _batchCounter++;
        batchId = _batchCounter;

        IERC20 token = IERC20(USDC);

        for (uint256 i = 0; i < length; ++i) {
            Line calldata line = lines[i];

            _usedRefs[msg.sender][line.invoiceRef] = true;
            token.safeTransferFrom(msg.sender, line.payee, line.amount);

            emit InvoicePaid(batchId, i, line.payee, line.amount, line.invoiceRef);
        }

        emit BatchPaid(batchId, msg.sender, length, expectedTotal);
    }
}
