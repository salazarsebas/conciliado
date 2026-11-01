# Submission write-up

Conciliado pays a batch of contractor invoices in USDC on Arc in one transaction, each payment stamped with its invoice reference, so nobody reconciles by hand.

## The problem

Stablecoin payouts settle fast, but the books do not follow. Eco's write-up on settlement reconciliation calls the accounting layer ["the real bottleneck"](https://eco.com/support/en/articles/14466065-stablecoin-settlement-reconciliation-in-2026-why-the-accounting-layer-is-the-real-bottleneck). Without a reference in the payment, someone matches each transfer to an invoice by hand and books the network fee elsewhere. On Arc the fee is in USDC, so Conciliado books it as a ledger row next to the payouts.

## What it does

Upload a CSV of invoices. Review each line, simulate the batch, and pay it in one transaction. Delete the ledger whenever you like: Conciliado rebuilds it from Arc and ties it to the wallet's balance change exactly.

## How it maps to the judging

**Real USDC on Arc mainnet (30%).** `PayoutBatch` is deployed and fully verified at [`0xC86e2241166785344E4d6692E4D2A3D4c8466d0e`](https://explorer.arc.io/address/0xC86e2241166785344E4d6692E4D2A3D4c8466d0e?tab=contract). Batch paid from the [live app](https://explorer.arc.io/tx/0xd4a8008fc7e1179fda869206b5c14999e47bdebc22f92a6087c942650e972665): 0.195 USDC to 6 payees in one transaction, signed in a browser wallet, 6 of 6 matched with a difference of 0 wei. First batch, sent by script, [`0x50d56ea9...`](https://explorer.arc.io/tx/0x50d56ea910e0412c47a7dc186b5f89ccf7cbe71235db799379874d6100987056), also rebuilds 6 of 6 with zero mismatch. Both are demo invoices paid with real USDC to wallets made for the demo.

**Use of Arc Studio (25%).** The contract, its Foundry tests, the ledger library, the landing and the `/run` flow were authored in the [Studio project](https://studio.arc.io/app/00732eb6-0372-4443-b5a3-2fa761fc0c3c), iterating on Arc testnet. Studio deploys to testnet only, so mainnet used Arc Foundry with the same unchanged `PayoutBatch.sol`. Two fixes found on the live deploy (PRs #41, #43) were made in the repo; the [README table](https://github.com/salazarsebas/conciliado#how-arc-studio-was-used) lists what came from where.

**Working product (25%).** The [live app](https://conciliado.acachete.xyz) runs the rebuild with no wallet, and `/run` handles CSV review, simulation, and payment. An end-to-end test runs the demo path against the live deploy, and [`/metrics`](https://conciliado.acachete.xyz/metrics) reads every batch from the chain. The app and Foundry suites pass; the README has the commands.

**Potential to go further (20%).** [Any batch rebuilds from its tx hash alone](https://conciliado.acachete.xyz/?tx=0xd4a8008fc7e1179fda869206b5c14999e47bdebc22f92a6087c942650e972665&network=mainnet), so an auditor needs no access to our systems. That fits the payroll and scheduled payouts Arc lists as starting points. Next steps: a CSV export of the rebuilt ledger, a measured 200-line batch with distinct payees, and recurring batches.

## How it works

`PayoutBatch` moves USDC from the payer to each payee and emits one `InvoicePaid` event per line. It rejects duplicate references and enforces a per-payer allow-list. `Multicall3From` bundles approve and pay into one sender-preserving transaction. Only a salted hash of each invoice ID goes on chain.

## Links

- Live: https://conciliado.acachete.xyz
- Repo: https://github.com/salazarsebas/conciliado
- Video: https://youtu.be/NrJMAVy_LsI
- Builder: https://github.com/salazarsebas
