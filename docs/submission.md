# Submission write-up

Conciliado pays a batch of contractor invoices in USDC on Arc in one transaction, each payment stamped with its invoice reference, so nobody reconciles by hand.

## The problem

Stablecoin payouts settle fast, but the books do not follow. Eco's write-up on settlement reconciliation calls the accounting layer ["the real bottleneck"](https://eco.com/support/en/articles/14466065-stablecoin-settlement-reconciliation-in-2026-why-the-accounting-layer-is-the-real-bottleneck). A finance team still matches payments to invoices by hand.

## What it does

Upload a CSV of invoices. Review each line, simulate the batch, and pay it in one transaction. Delete the ledger whenever you like: Conciliado rebuilds it from Arc and ties it to the wallet's balance change exactly.

## How it maps to the judging

**Real USDC on Arc mainnet (30%).** `PayoutBatch` is deployed and fully verified at [`0xC86e2241166785344E4d6692E4D2A3D4c8466d0e`](https://explorer.arc.io/address/0xC86e2241166785344E4d6692E4D2A3D4c8466d0e?tab=contract). Batch paid from the [live app](https://explorer.arc.io/tx/0xd4a8008fc7e1179fda869206b5c14999e47bdebc22f92a6087c942650e972665): 0.195 USDC to 6 payees in one transaction, signed in a browser wallet, 6 of 6 matched with a difference of 0 wei. First batch, sent by script, [`0x50d56ea9...`](https://explorer.arc.io/tx/0x50d56ea910e0412c47a7dc186b5f89ccf7cbe71235db799379874d6100987056), also rebuilds 6 of 6 with zero mismatch.

**Use of Arc Studio (25%).** The contract, its tests and the app were built in the [Studio project](https://studio.arc.io/app/00732eb6-0372-4443-b5a3-2fa761fc0c3c), iterating on Arc testnet. Late production fixes (PRs #41 and #43) and deployment work were done outside Studio, then synced back to the Studio project; the repo history shows which is which.

**Working product (25%).** The [live app](https://conciliado.acachete.xyz) runs the rebuild with no wallet, and `/run` handles CSV review, simulation, and payment. 198 app tests and 25 Foundry tests pass.

**Potential to go further (20%).** Rebuild-from-chain is an accounting primitive: the same flow fits payroll runs and vendor payouts, with exports for accounting tools as the next scoped step.

## How it works

`PayoutBatch` moves USDC from the payer to each payee and emits one `InvoicePaid` event per line. It rejects duplicate references and enforces a per-payer allow-list. `Multicall3From` bundles approve and pay into one sender-preserving transaction. Only a salted hash of each invoice ID goes on chain.

## Links

- Live: https://conciliado.acachete.xyz
- Repo: https://github.com/salazarsebas/conciliado
- Video: https://youtu.be/NrJMAVy_LsI
