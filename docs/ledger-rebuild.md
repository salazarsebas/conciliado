# Ledger rebuild and tie-out

Issue: #7. Read path only, no UI. The code was authored in Arc Studio and pulled into
`src/ledger/`; the CLI wrapper is `scripts/rebuild-ledger.ts`.

## What it does

`rebuildLedger` takes a viem client, the `PayoutBatch` address, the payer, a target (a batch
transaction hash, or a batch id with a block range) and the payer's local invoice list. It
returns the ledger rows and the tie-out for one batch, built from chain data alone.

- **Logs.** Reads `InvoicePaid` and `BatchPaid` with `getLogs`, paged by `blockRangePerPage`
  (default 10000 blocks, inclusive, no gaps or overlap). It checks that the `BatchPaid` payer
  is the payer and that its line count and total equal the `InvoicePaid` logs, and throws a
  typed error if not.
- **Payout rows.** One per `InvoicePaid` event. `Transfer` logs are never counted. A real
  Arc receipt also carries a duplicate 18-decimal `Transfer` per payout from
  `0xfffffffffffffffffffffffffffffffffffffffe`; counting those would double the payouts.
- **Fee row.** `gasUsed x effectiveGasPrice` from the receipt, in native 18-decimal USDC.
  The 6-decimal display value rounds to the nearest unit, half up (11013.954 units shows as
  11014).
- **Tie-out.** Exact in 18 decimals: payouts x 10^12 plus the fee wei, minus the payer's
  native balance at block B-1 minus the balance at block B. The ERC-20 `balanceOf` delta is
  returned too, as a secondary view, because `balanceOf` truncates the 18-decimal balance to
  6 decimals. The result also reports `payerTxCountInBlock` and warns when the payer sent
  other transactions in the batch block.
- **Join.** Local invoices are matched to on-chain refs by `invoiceRef`. An invoice is
  either `{ invoiceId, salt }` (the ref is `keccak256(invoiceId ++ salt)`) or
  `{ invoiceId, invoiceRef }` (the CSV case). Unmatched refs on either side are returned,
  never dropped.
- **Status.** `pending` (no receipt yet) or `final`. Arc finality is deterministic, so there
  is no confirmation counter. A reverted receipt is `final`, books only the fee row, and sets
  `receiptStatus: 'reverted'`.

## Run it against Arc mainnet

```bash
bun install
bun run ledger:rebuild          # RPC_URL overrides https://rpc.mainnet.arc.io
```

It reads the contract, payer, and batch transaction from `fixtures/mainnet-batch-1.json` and
the invoices from `fixtures/mainnet-batch-1.csv`, signs nothing, and exits 1 if the
difference is not 0 or a ref is unmatched. Only the target addresses come from the fixture;
every number printed comes from the chain.

Result for the first mainnet batch (block 26689516):

| Item | Value |
| --- | --- |
| Payouts | 195000000000000000 wei (0.195 USDC, 6 lines) |
| Fee row | 524474 x 21000000000 = 11013954000000000 wei (11014 units displayed) |
| Ledger total | 206013954000000000 wei |
| Payer native balance delta, block 26689515 to 26689516 | 206013954000000000 wei |
| Difference | 0 wei (0.000000 at 6 decimals) |
| ERC-20 `balanceOf` delta | 206014 units |
| Invoices matched by `invoiceRef` | 6 of 6 |

## Tests

```bash
bun run test                    # 42 tests: money, ref, paging, pending, reverted, join, fixture
arc-forge test                  # contract tests
```

The fixture tests build an offline client from `fixtures/mainnet-batch-1.json`: the six
`InvoicePaid` logs, the `BatchPaid` log, the receipt, the balances at both blocks, and the
extra `Approval` and `Transfer` logs a real receipt carries.

## Known gap

`bun run typecheck` and `bun run lint` report errors in `scripts/compass-deploy.ts` on
`main`, because it imports `@circlefin/compass-chains`, a package that is not on the public
npm registry. They are unrelated to the ledger code, which has no typecheck or lint findings.
