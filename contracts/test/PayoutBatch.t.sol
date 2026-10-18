// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PayoutBatch} from "../PayoutBatch.sol";
import {MockUSDC} from "./MockUSDC.sol";

// ---------------------------------------------------------------------------
// MaliciousERC20 — re-enters payBatch on transferFrom to test reentrancy guard
// ---------------------------------------------------------------------------
contract MaliciousERC20 is IERC20 {
    PayoutBatch public victim;
    address public attacker;
    bool public reentryArmed;

    // Minimal IERC20 stubs
    function totalSupply() external pure override returns (uint256) { return 0; }
    function balanceOf(address) external pure override returns (uint256) { return 1_000_000e6; }
    function allowance(address, address) external pure override returns (uint256) { return type(uint256).max; }
    function approve(address, uint256) external pure override returns (bool) { return true; }
    function transfer(address, uint256) external pure override returns (bool) { return true; }

    function setup(address _victim, address _attacker) external {
        victim = PayoutBatch(_victim);
        attacker = _attacker;
    }

    function armReentry() external {
        reentryArmed = true;
    }

    /// @dev On the first call, attempts to re-enter payBatch before returning.
    function transferFrom(address, address to, uint256 amount) external override returns (bool) {
        if (reentryArmed) {
            reentryArmed = false; // disarm to avoid infinite recursion
            // Build a minimal valid-looking batch for re-entry attempt
            PayoutBatch.Line[] memory lines = new PayoutBatch.Line[](1);
            lines[0] = PayoutBatch.Line({
                payee: to,
                amount: amount,
                invoiceRef: keccak256("reentry-ref")
            });
            // This call MUST revert with ReentrancyGuardReentrantCall
            victim.payBatch(lines, amount);
        }
        return true;
    }
}

// ---------------------------------------------------------------------------
// PayoutBatch test suite
// ---------------------------------------------------------------------------
contract PayoutBatchTest is Test {
    PayoutBatch internal batchContract;
    MockUSDC    internal usdc;

    address internal payer   = makeAddr("payer");
    address internal payee0  = makeAddr("payee0");
    address internal payee1  = makeAddr("payee1");
    address internal payee2  = makeAddr("payee2");
    address internal payee3  = makeAddr("payee3");
    address internal payee4  = makeAddr("payee4");
    address internal payee5  = makeAddr("payee5");

    address[6] internal payees;

    uint256 internal constant LARGE_SUPPLY = 1_000_000_000e6; // 1 billion USDC (6 dec)

    // -----------------------------------------------------------------------
    // setUp — runs before every test
    // -----------------------------------------------------------------------
    function setUp() public {
        // Deploy token and main contract
        usdc          = new MockUSDC();
        batchContract = new PayoutBatch(address(usdc));

        // Populate payees array
        payees[0] = payee0;
        payees[1] = payee1;
        payees[2] = payee2;
        payees[3] = payee3;
        payees[4] = payee4;
        payees[5] = payee5;

        // Mint large supply to payer
        usdc.mint(payer, LARGE_SUPPLY);

        // Payer approves batchContract for max
        vm.prank(payer);
        usdc.approve(address(batchContract), type(uint256).max);

        // Payer whitelists all 6 payees
        for (uint256 i = 0; i < 6; i++) {
            vm.prank(payer);
            batchContract.addPayee(payees[i]);
        }
    }

    // -----------------------------------------------------------------------
    // Helper: build a 6-line batch with distinct refs and amounts
    // -----------------------------------------------------------------------
    function _build6Lines() internal view returns (PayoutBatch.Line[] memory lines, uint256 total) {
        lines = new PayoutBatch.Line[](6);
        for (uint256 i = 0; i < 6; i++) {
            lines[i] = PayoutBatch.Line({
                payee: payees[i],
                amount: (i + 1) * 100e6, // 100, 200, 300, 400, 500, 600 USDC
                invoiceRef: keccak256(abi.encode("ref", i))
            });
            total += lines[i].amount;
        }
    }

    // -----------------------------------------------------------------------
    // 1. test_happyPath_6Lines
    // -----------------------------------------------------------------------
    function test_happyPath_6Lines() public {
        (PayoutBatch.Line[] memory lines, uint256 total) = _build6Lines();

        // Snapshot balances before
        uint256 payerBefore = usdc.balanceOf(payer);
        uint256[6] memory payeeBefore;
        for (uint256 i = 0; i < 6; i++) {
            payeeBefore[i] = usdc.balanceOf(payees[i]);
        }

        // Set up all event expectations BEFORE calling payBatch
        for (uint256 i = 0; i < 6; i++) {
            vm.expectEmit(true, true, true, true, address(batchContract));
            emit PayoutBatch.InvoicePaid(1, i, payees[i], lines[i].amount, lines[i].invoiceRef);
        }
        vm.expectEmit(true, true, true, true, address(batchContract));
        emit PayoutBatch.BatchPaid(1, payer, 6, total);

        // Execute
        vm.prank(payer);
        uint256 batchId = batchContract.payBatch(lines, total);
        assertEq(batchId, 1, "first batchId should be 1");

        // Assert payee balances increased
        for (uint256 i = 0; i < 6; i++) {
            assertEq(
                usdc.balanceOf(payees[i]),
                payeeBefore[i] + lines[i].amount,
                "payee balance mismatch"
            );
        }

        // Assert payer balance decreased by total
        assertEq(usdc.balanceOf(payer), payerBefore - total, "payer balance mismatch");

        // Assert batch contract holds no USDC
        assertEq(usdc.balanceOf(address(batchContract)), 0, "batch contract should hold 0");

        // Second batch — new refs, batchId should be 2
        PayoutBatch.Line[] memory lines2 = new PayoutBatch.Line[](1);
        lines2[0] = PayoutBatch.Line({
            payee: payee0,
            amount: 50e6,
            invoiceRef: keccak256(abi.encode("ref-batch2", 0))
        });
        vm.prank(payer);
        uint256 batchId2 = batchContract.payBatch(lines2, 50e6);
        assertEq(batchId2, 2, "second batchId should be 2");
    }

    // -----------------------------------------------------------------------
    // 2. test_revert_EmptyBatch
    // -----------------------------------------------------------------------
    function test_revert_EmptyBatch() public {
        PayoutBatch.Line[] memory lines = new PayoutBatch.Line[](0);
        vm.prank(payer);
        vm.expectRevert(PayoutBatch.EmptyBatch.selector);
        batchContract.payBatch(lines, 0);
    }

    // -----------------------------------------------------------------------
    // 3. test_revert_ZeroPayee
    // -----------------------------------------------------------------------
    function test_revert_ZeroPayee() public {
        PayoutBatch.Line[] memory lines = new PayoutBatch.Line[](1);
        lines[0] = PayoutBatch.Line({
            payee: address(0),
            amount: 100e6,
            invoiceRef: keccak256("zero-payee-ref")
        });
        vm.prank(payer);
        vm.expectRevert(PayoutBatch.ZeroPayee.selector);
        batchContract.payBatch(lines, 100e6);
    }

    // -----------------------------------------------------------------------
    // 4. test_revert_ZeroAmount
    // -----------------------------------------------------------------------
    function test_revert_ZeroAmount() public {
        PayoutBatch.Line[] memory lines = new PayoutBatch.Line[](1);
        lines[0] = PayoutBatch.Line({
            payee: payee0,
            amount: 0,
            invoiceRef: keccak256("zero-amount-ref")
        });
        vm.prank(payer);
        vm.expectRevert(PayoutBatch.ZeroAmount.selector);
        batchContract.payBatch(lines, 0);
    }

    // -----------------------------------------------------------------------
    // 5. test_revert_PayeeNotAllowed
    // -----------------------------------------------------------------------
    function test_revert_PayeeNotAllowed() public {
        address notAllowed = makeAddr("notAllowed");
        PayoutBatch.Line[] memory lines = new PayoutBatch.Line[](1);
        lines[0] = PayoutBatch.Line({
            payee: notAllowed,
            amount: 100e6,
            invoiceRef: keccak256("not-allowed-ref")
        });
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(PayoutBatch.PayeeNotAllowed.selector, payer, notAllowed)
        );
        batchContract.payBatch(lines, 100e6);
    }

    // -----------------------------------------------------------------------
    // 6. test_revert_DuplicateRef_AcrossBatches
    // -----------------------------------------------------------------------
    function test_revert_DuplicateRef_AcrossBatches() public {
        bytes32 refX = keccak256("reused-ref");

        // First batch — succeeds
        PayoutBatch.Line[] memory lines1 = new PayoutBatch.Line[](1);
        lines1[0] = PayoutBatch.Line({payee: payee0, amount: 100e6, invoiceRef: refX});
        vm.prank(payer);
        batchContract.payBatch(lines1, 100e6);

        // Second batch — same ref, should revert
        PayoutBatch.Line[] memory lines2 = new PayoutBatch.Line[](1);
        lines2[0] = PayoutBatch.Line({payee: payee0, amount: 100e6, invoiceRef: refX});
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(PayoutBatch.InvoiceRefAlreadyUsed.selector, payer, refX)
        );
        batchContract.payBatch(lines2, 100e6);
    }

    // -----------------------------------------------------------------------
    // 7. test_revert_DuplicateRef_WithinBatch
    // -----------------------------------------------------------------------
    function test_revert_DuplicateRef_WithinBatch() public {
        bytes32 dupRef = keccak256("dup-within-batch");

        PayoutBatch.Line[] memory lines = new PayoutBatch.Line[](2);
        lines[0] = PayoutBatch.Line({payee: payee0, amount: 100e6, invoiceRef: dupRef});
        lines[1] = PayoutBatch.Line({payee: payee1, amount: 200e6, invoiceRef: dupRef});

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(PayoutBatch.InvoiceRefAlreadyUsed.selector, payer, dupRef)
        );
        batchContract.payBatch(lines, 300e6);
    }

    // -----------------------------------------------------------------------
    // 8. test_revert_TotalMismatch_TooHigh
    // -----------------------------------------------------------------------
    function test_revert_TotalMismatch_TooHigh() public {
        uint256 amount = 100e6;
        PayoutBatch.Line[] memory lines = new PayoutBatch.Line[](1);
        lines[0] = PayoutBatch.Line({payee: payee0, amount: amount, invoiceRef: keccak256("tm-high-ref")});

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(PayoutBatch.TotalMismatch.selector, amount, amount + 1)
        );
        batchContract.payBatch(lines, amount + 1);
    }

    // -----------------------------------------------------------------------
    // 9. test_revert_TotalMismatch_TooLow
    // -----------------------------------------------------------------------
    function test_revert_TotalMismatch_TooLow() public {
        uint256 amount = 100e6;
        PayoutBatch.Line[] memory lines = new PayoutBatch.Line[](1);
        lines[0] = PayoutBatch.Line({payee: payee0, amount: amount, invoiceRef: keccak256("tm-low-ref")});

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(PayoutBatch.TotalMismatch.selector, amount, amount - 1)
        );
        batchContract.payBatch(lines, amount - 1);
    }

    // -----------------------------------------------------------------------
    // 10. test_revert_InsufficientAllowance
    // -----------------------------------------------------------------------
    function test_revert_InsufficientAllowance() public {
        // Revoke approval
        vm.prank(payer);
        usdc.approve(address(batchContract), 0);

        PayoutBatch.Line[] memory lines = new PayoutBatch.Line[](1);
        lines[0] = PayoutBatch.Line({payee: payee0, amount: 100e6, invoiceRef: keccak256("insuf-allowance-ref")});

        vm.prank(payer);
        vm.expectRevert(); // ERC20InsufficientAllowance — we just check it reverts
        batchContract.payBatch(lines, 100e6);
    }

    // -----------------------------------------------------------------------
    // 11. test_revert_InsufficientBalance
    // -----------------------------------------------------------------------
    function test_revert_InsufficientBalance() public {
        address brokePayer = makeAddr("brokePayer");

        // Mint nothing, approve max, add payee
        vm.prank(brokePayer);
        usdc.approve(address(batchContract), type(uint256).max);

        vm.prank(brokePayer);
        batchContract.addPayee(payee0);

        PayoutBatch.Line[] memory lines = new PayoutBatch.Line[](1);
        lines[0] = PayoutBatch.Line({payee: payee0, amount: 1e6, invoiceRef: keccak256("insuf-balance-ref")});

        vm.prank(brokePayer);
        vm.expectRevert(); // ERC20InsufficientBalance — check it reverts
        batchContract.payBatch(lines, 1e6);
    }

    // -----------------------------------------------------------------------
    // 12. test_revert_ConstructorZeroAddress
    // -----------------------------------------------------------------------
    function test_revert_ConstructorZeroAddress() public {
        vm.expectRevert(PayoutBatch.ZeroAddress.selector);
        new PayoutBatch(address(0));
    }

    // -----------------------------------------------------------------------
    // 13. test_differentPayersCanReuseRef
    // -----------------------------------------------------------------------
    function test_differentPayersCanReuseRef() public {
        address payer2 = makeAddr("payer2");
        bytes32 refX   = keccak256("shared-ref");

        // Setup payer2
        usdc.mint(payer2, LARGE_SUPPLY);
        vm.prank(payer2);
        usdc.approve(address(batchContract), type(uint256).max);
        vm.prank(payer2);
        batchContract.addPayee(payee0);

        // payer1 pays with refX — should succeed
        PayoutBatch.Line[] memory lines1 = new PayoutBatch.Line[](1);
        lines1[0] = PayoutBatch.Line({payee: payee0, amount: 100e6, invoiceRef: refX});
        vm.prank(payer);
        batchContract.payBatch(lines1, 100e6);

        // payer2 pays with same refX — should also succeed (per-payer namespace)
        PayoutBatch.Line[] memory lines2 = new PayoutBatch.Line[](1);
        lines2[0] = PayoutBatch.Line({payee: payee0, amount: 100e6, invoiceRef: refX});
        vm.prank(payer2);
        uint256 batchId2 = batchContract.payBatch(lines2, 100e6);
        assertEq(batchId2, 2, "payer2 batch should be batchId 2");
    }

    // -----------------------------------------------------------------------
    // 14. test_allowListIsPerPayer
    // -----------------------------------------------------------------------
    function test_allowListIsPerPayer() public {
        address payerB = makeAddr("payerB");
        address payeeP = makeAddr("payeeP");

        // payer A adds payeeP
        vm.prank(payer);
        batchContract.addPayee(payeeP);

        // payer B does NOT add payeeP
        usdc.mint(payerB, LARGE_SUPPLY);
        vm.prank(payerB);
        usdc.approve(address(batchContract), type(uint256).max);

        PayoutBatch.Line[] memory lines = new PayoutBatch.Line[](1);
        lines[0] = PayoutBatch.Line({payee: payeeP, amount: 100e6, invoiceRef: keccak256("per-payer-ref")});

        vm.prank(payerB);
        vm.expectRevert(
            abi.encodeWithSelector(PayoutBatch.PayeeNotAllowed.selector, payerB, payeeP)
        );
        batchContract.payBatch(lines, 100e6);
    }

    // -----------------------------------------------------------------------
    // 15. test_addRemovePayee_events
    // -----------------------------------------------------------------------
    function test_addRemovePayee_events() public {
        address newPayee = makeAddr("eventPayee");

        // Expect PayeeAdded event
        vm.expectEmit(true, true, true, true, address(batchContract));
        emit PayoutBatch.PayeeAdded(payer, newPayee);

        vm.prank(payer);
        batchContract.addPayee(newPayee);

        assertTrue(batchContract.isPayeeAllowed(payer, newPayee), "should be allowed after add");

        // Expect PayeeRemoved event
        vm.expectEmit(true, true, true, true, address(batchContract));
        emit PayoutBatch.PayeeRemoved(payer, newPayee);

        vm.prank(payer);
        batchContract.removePayee(newPayee);

        assertFalse(batchContract.isPayeeAllowed(payer, newPayee), "should not be allowed after remove");
    }

    // -----------------------------------------------------------------------
    // 16. test_removePayeeBlocksPayment
    // -----------------------------------------------------------------------
    function test_removePayeeBlocksPayment() public {
        // payee0 is allowed in setUp; now remove it
        vm.prank(payer);
        batchContract.removePayee(payee0);

        PayoutBatch.Line[] memory lines = new PayoutBatch.Line[](1);
        lines[0] = PayoutBatch.Line({payee: payee0, amount: 100e6, invoiceRef: keccak256("remove-blocks-ref")});

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(PayoutBatch.PayeeNotAllowed.selector, payer, payee0)
        );
        batchContract.payBatch(lines, 100e6);
    }

    // -----------------------------------------------------------------------
    // 17. test_atomicity
    // -----------------------------------------------------------------------
    function test_atomicity() public {
        // Pre-pay a batch to mark refX as used
        bytes32 refX = keccak256("used-ref-for-atomicity");
        PayoutBatch.Line[] memory preBatch = new PayoutBatch.Line[](1);
        preBatch[0] = PayoutBatch.Line({payee: payee0, amount: 100e6, invoiceRef: refX});
        vm.prank(payer);
        batchContract.payBatch(preBatch, 100e6);

        // Snapshot balances after the pre-batch
        uint256 payerBefore = usdc.balanceOf(payer);
        uint256 p1Before    = usdc.balanceOf(payee1);
        uint256 p2Before    = usdc.balanceOf(payee2);

        // Build a 3-line batch: lines 0 & 1 are fresh, line 2 reuses refX
        bytes32 freshRef0 = keccak256("fresh-ref-0");
        bytes32 freshRef1 = keccak256("fresh-ref-1");

        PayoutBatch.Line[] memory atomLines = new PayoutBatch.Line[](3);
        atomLines[0] = PayoutBatch.Line({payee: payee1, amount: 200e6, invoiceRef: freshRef0});
        atomLines[1] = PayoutBatch.Line({payee: payee2, amount: 300e6, invoiceRef: freshRef1});
        atomLines[2] = PayoutBatch.Line({payee: payee3, amount: 400e6, invoiceRef: refX}); // already used!

        uint256 atomTotal = 200e6 + 300e6 + 400e6;

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(PayoutBatch.InvoiceRefAlreadyUsed.selector, payer, refX)
        );
        batchContract.payBatch(atomLines, atomTotal);

        // All intermediate payees should NOT have received funds
        assertEq(usdc.balanceOf(payee1), p1Before, "payee1 should not have received funds (atomicity)");
        assertEq(usdc.balanceOf(payee2), p2Before, "payee2 should not have received funds (atomicity)");

        // Fresh refs are still unused
        assertFalse(batchContract.isInvoiceRefUsed(payer, freshRef0), "freshRef0 should still be unused");
        assertFalse(batchContract.isInvoiceRefUsed(payer, freshRef1), "freshRef1 should still be unused");

        // Payer balance unchanged
        assertEq(usdc.balanceOf(payer), payerBefore, "payer balance should be unchanged");
    }

    // -----------------------------------------------------------------------
    // 18. test_noNativeValuePath
    // -----------------------------------------------------------------------
    function test_noNativeValuePath() public {
        // Give this test contract ETH to work with
        vm.deal(address(this), 10 ether);

        // Plain ETH send to batch contract (no receive/fallback) → must fail
        (bool success,) = address(batchContract).call{value: 1}("");
        assertFalse(success, "bare ETH send should fail: no receive/fallback");

        // payBatch is non-payable, calling with ETH value → must fail
        PayoutBatch.Line[] memory lines = new PayoutBatch.Line[](1);
        lines[0] = PayoutBatch.Line({payee: payee0, amount: 100e6, invoiceRef: keccak256("no-value-ref")});
        uint256 total = 100e6;

        bytes memory data = abi.encodeWithSelector(
            PayoutBatch.payBatch.selector,
            lines,
            total
        );
        (bool ok,) = address(batchContract).call{value: 1}(data);
        assertFalse(ok, "payBatch with ETH value should fail: not payable");
    }

    // -----------------------------------------------------------------------
    // 19. test_reentrancy
    // -----------------------------------------------------------------------
    function test_reentrancy() public {
        // Deploy malicious token
        MaliciousERC20 malToken = new MaliciousERC20();

        // Deploy a PayoutBatch backed by the malicious token
        PayoutBatch malBatch = new PayoutBatch(address(malToken));

        // Wire the malicious token to re-enter malBatch
        address attacker = makeAddr("attacker");
        malToken.setup(address(malBatch), attacker);

        // Attacker adds payee0 as allowed payee
        vm.prank(attacker);
        malBatch.addPayee(payee0);

        // Arm the re-entry
        malToken.armReentry();

        // Build the outer call
        PayoutBatch.Line[] memory lines = new PayoutBatch.Line[](1);
        lines[0] = PayoutBatch.Line({
            payee: payee0,
            amount: 100e6,
            invoiceRef: keccak256("outer-ref")
        });

        // The outer payBatch call triggers transferFrom → re-entry → should revert
        vm.prank(attacker);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        malBatch.payBatch(lines, 100e6);
    }

    // -----------------------------------------------------------------------
    // 20. testFuzz_totalConservation
    // -----------------------------------------------------------------------
    /// forge-config: default.fuzz.runs = 256
    function testFuzz_totalConservation(uint8 lineCount, uint256[20] calldata amounts) public {
        lineCount = uint8(bound(uint256(lineCount), 1, 20));

        // Use a fresh fuzz payer to avoid cross-test state pollution
        address fuzzPayer = makeAddr(string(abi.encode("fuzz-payer", lineCount, amounts[0])));

        uint256 total = 0;
        PayoutBatch.Line[] memory lines = new PayoutBatch.Line[](lineCount);

        for (uint256 i = 0; i < lineCount; i++) {
            uint256 amt = bound(amounts[i], 1, 1e12);
            // Derive distinct payee addresses for this fuzz run
            address fuzzPayee = address(uint160(uint256(keccak256(abi.encode("fuzz-payee", i, lineCount, amounts[0])))));
            bytes32 ref       = keccak256(abi.encode("fuzz-ref", lineCount, amounts[0], i));

            lines[i] = PayoutBatch.Line({payee: fuzzPayee, amount: amt, invoiceRef: ref});
            total += amt;

            // Whitelist the payee for fuzzPayer
            vm.prank(fuzzPayer);
            batchContract.addPayee(fuzzPayee);
        }

        // Fund and approve fuzzPayer
        usdc.mint(fuzzPayer, total);
        vm.prank(fuzzPayer);
        usdc.approve(address(batchContract), total);

        // Snapshot balances
        uint256 payerBefore = usdc.balanceOf(fuzzPayer);
        uint256[] memory payeeBefore = new uint256[](lineCount);
        for (uint256 i = 0; i < lineCount; i++) {
            payeeBefore[i] = usdc.balanceOf(lines[i].payee);
        }

        // Execute batch
        vm.prank(fuzzPayer);
        batchContract.payBatch(lines, total);

        // Assert conservation
        uint256 payerDelta = payerBefore - usdc.balanceOf(fuzzPayer);
        uint256 payeeDelta = 0;
        for (uint256 i = 0; i < lineCount; i++) {
            payeeDelta += usdc.balanceOf(lines[i].payee) - payeeBefore[i];
        }

        assertEq(payerDelta, total, "payer delta != total");
        assertEq(payeeDelta, total, "payee delta != total");
        assertEq(payerDelta, payeeDelta, "payer delta != payee delta");
        assertEq(usdc.balanceOf(address(batchContract)), 0, "batch contract must hold 0");
    }

    // -----------------------------------------------------------------------
    // 21. testFuzz_noRefReuse
    // -----------------------------------------------------------------------
    /// forge-config: default.fuzz.runs = 256
    function testFuzz_noRefReuse(bytes32 ref) public {
        // Use a fresh payer to avoid inter-test pollution
        address fuzzPayer = makeAddr(string(abi.encode("fuzz-ref-payer", ref)));

        // Setup fuzzPayer
        usdc.mint(fuzzPayer, 1_000_000e6);
        vm.prank(fuzzPayer);
        usdc.approve(address(batchContract), type(uint256).max);
        vm.prank(fuzzPayer);
        batchContract.addPayee(payee0);

        // First use of ref — must succeed
        PayoutBatch.Line[] memory lines1 = new PayoutBatch.Line[](1);
        lines1[0] = PayoutBatch.Line({payee: payee0, amount: 1e6, invoiceRef: ref});
        vm.prank(fuzzPayer);
        batchContract.payBatch(lines1, 1e6);

        // Second use of same ref — must revert
        PayoutBatch.Line[] memory lines2 = new PayoutBatch.Line[](1);
        lines2[0] = PayoutBatch.Line({payee: payee0, amount: 1e6, invoiceRef: ref});
        vm.prank(fuzzPayer);
        vm.expectRevert(
            abi.encodeWithSelector(PayoutBatch.InvoiceRefAlreadyUsed.selector, fuzzPayer, ref)
        );
        batchContract.payBatch(lines2, 1e6);
    }

    // -----------------------------------------------------------------------
    // 22. testFuzz_totalMismatch
    // -----------------------------------------------------------------------
    /// forge-config: default.fuzz.runs = 256
    function testFuzz_totalMismatch(uint256 wrongTotal) public {
        uint256 actualAmount = 1_000_000; // 1 USDC (6 dec)
        vm.assume(wrongTotal != actualAmount);

        PayoutBatch.Line[] memory lines = new PayoutBatch.Line[](1);
        lines[0] = PayoutBatch.Line({
            payee: payee0,
            amount: actualAmount,
            invoiceRef: keccak256(abi.encode("mismatch-ref", wrongTotal))
        });

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(PayoutBatch.TotalMismatch.selector, actualAmount, wrongTotal)
        );
        batchContract.payBatch(lines, wrongTotal);
    }
}
