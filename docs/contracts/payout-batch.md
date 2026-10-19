# PayoutBatch

Issue: #6. The contract, its tests, and the app scaffold were written in Arc Studio
(`arc-studio run --session conciliado`) and pulled with `arc-studio pull`. No Studio
authored file was edited by hand.

## Evidence

| Item | Value |
| --- | --- |
| Studio project | https://studio.arc.io/app/00732eb6-0372-4443-b5a3-2fa761fc0c3c |
| Arc testnet address | `0x209dd04647d4c103081095176e5f58c5d91e1fb6` |
| Deploy tx | `0xc11eb6069a386c84a2365fa2bdc6dc7e6bf32e52a347de4676e91e3f92d1c529` |
| Explorer | https://explorer.testnet.arc.io/address/0x209dd04647d4c103081095176e5f58c5d91e1fb6 |
| Constructor argument | `0x3600000000000000000000000000000000000000` (USDC ERC-20 interface, 6 decimals) |

On-chain checks (`arc-cast`, testnet RPC): `USDC()` returns the address above, the
receipt status is success, and the runtime bytecode equals the local `arc-forge`
artifact except for the four hex digits of the `USDC` immutable that the constructor
fills in.

## Interface

- `payBatch(Line[] lines, uint256 expectedTotal) returns (uint256 batchId)`, where
  `Line` is `{address payee, uint256 amount, bytes32 invoiceRef}`. The caller is the
  payer; each line is `transferFrom(payer, payee, amount)` on USDC. There is no
  payable function, no `receive`, and no `fallback`.
- Per payer allow-list: `addPayee`, `removePayee`, `addPayees`, `removePayees`,
  `isPayeeAllowed`. Per payer duplicate guard: `isInvoiceRefUsed`.
- Events: `InvoicePaid(batchId, lineIndex, payee, amount, invoiceRef)` per line,
  `BatchPaid(batchId, payer, lineCount, total)` per batch, `PayeeAdded`,
  `PayeeRemoved`.
- Reverts (custom errors): empty batch, more than `MAX_LINES` (200) lines, zero payee,
  zero amount, payee not allow-listed, invoice reference already used (also inside
  one batch), total mismatch.

## Run the tests locally

```bash
bun install --frozen-lockfile   # OpenZeppelin is resolved from node_modules
arc-forge test --force          # Arc Foundry; 22 passed, 0 failed
```

## Studio audit step

Studio ran its solidity and functional auditors and Slither. Findings and decisions:

| Source | Severity | Finding | Decision |
| --- | --- | --- | --- |
| solidity-auditor | High | Unbounded batch with an O(n^2) duplicate check can exceed the block gas limit | Fixed in a Studio turn: `MAX_LINES = 200` and `BatchTooLarge` |
| functional-auditor | Medium | O(n^2) in-batch duplicate scan | Bounded by the same cap |
| Slither | Low | `sum` declared without an explicit initializer | Fixed |
| Slither | Informational | `cyclomatic-complexity`, `naming-convention` | Accepted |

Studio states its review is best effort and not a substitute for a paid third-party
audit before real funds.

## EVM version

`foundry.toml` keeps `evm_version = "paris"`, the Studio default. It compiles, passes
22 tests, and deployed to Arc testnet. Arc documents an Osaka baseline, so Studio's own
claim that Arc rejects newer opcodes is not what the Arc docs say; the setting is kept
only because nothing in the contract needs a newer opcode.
