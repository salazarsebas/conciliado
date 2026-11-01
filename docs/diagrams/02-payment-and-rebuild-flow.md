# Payment and rebuild flow (agent twin)

Markdown twin of `02-payment-and-rebuild-flow`. Keep this in lockstep with
`diagrams/generator/02-payment-and-rebuild-flow.py`. Image:
`output/02-payment-and-rebuild-flow.svg` and `.png`.

The example batch has six invoice lines. Steps 1 and 3 run in the browser. Step 2 is one
Arc mainnet transaction. `PayoutBatch.payBatch` reverts for a payee that is not on the
payer's allow-list, so validation checks the allow-list and a missing payee is added
first with `addPayees`.

```mermaid
flowchart TB
  subgraph pay["1. Pay: off-chain client"]
    upload["CSV upload: invoice ID, payee, amount per row"]
    validate["Validate per row: address, amount above zero, no duplicate ref, payee allow-listed, ref unused"]
    simulate["Simulate: eth_call of payBatch against Arc RPC, revert reason shown, nothing sent"]
    sign["Sign one tx: approve + payBatch via Multicall3From"]
  end
  subgraph settle["2. Settle: Arc mainnet"]
    payb[("PayoutBatch.payBatch: six USDC transfers, payer to payees, final in under a second (to measure)")]
    events["Events and receipt: 6 InvoicePaid + 1 BatchPaid, gas used x effective gas price"]
  end
  subgraph rebuild["3. Rebuild: off-chain client, chain data only"]
    read["Read chain data: logs + receipt + balances, before and after the tx"]
    rows["Build ledger rows: one row per InvoicePaid log, one fee row from the receipt"]
    match["Match refs: hash invoice ID + salt per CSV row, compare with log invoiceRef"]
    tie["6 of 6 matched: ledger total = payer balance delta, tie-out $0.00"]
  end
  fix["Stop before sending: fix rows, or allow-list the payee first"]

  upload --> validate
  validate -->|all rows valid| simulate
  validate -.->|row invalid| fix
  simulate -.->|reverts| fix
  simulate -->|passes| sign
  sign ==>|one tx| payb
  payb --> events
  events -->|eth_getLogs, receipt, balances| read
  read --> rows
  rows --> match
  upload -.->|local list, never uploaded| match
  match --> tie
```

## Steps

| # | Step | Where | Output |
| --- | --- | --- | --- |
| 1 | CSV upload | Browser | Rows held in memory |
| 2 | Validate per row | Browser | Pass, or a list of bad rows and no transaction |
| 3 | Simulate | Browser, Arc RPC | Pass, or a revert reason and no transaction |
| 4 | Sign one tx (`approve` + `payBatch`) | Wallet | One transaction |
| 5 | Settle | Arc mainnet | 6 `InvoicePaid`, 1 `BatchPaid`, a receipt |
| 6 | Read chain data | Browser, Arc RPC | Logs, receipt, balances before and after |
| 7 | Build ledger rows | Browser | 6 payment rows, 1 fee row |
| 8 | Match refs | Browser | Each CSV row matched to a log by `invoiceRef` |
| 9 | Tie out | Browser | 6 of 6 matched, ledger total equals the payer's balance change, difference $0.00 |
