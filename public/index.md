# Conciliado: pay the batch, rebuild the books

Conciliado pays a batch of contractor invoices in USDC on Arc in one transaction, with each payment stamped with its invoice reference. Delete the ledger whenever you like: Conciliado rebuilds it from Arc and ties it to the wallet's balance change.

## Try it

- [Rebuild a real mainnet batch](https://conciliado.acachete.xyz/), no wallet needed
- [Run a batch](https://conciliado.acachete.xyz/run) with a browser wallet
- [See the metrics](https://conciliado.acachete.xyz/metrics), read live from the chain ([dated snapshot](https://conciliado.acachete.xyz/metrics.md))

## How it works

1. Upload a CSV of invoices and review each line.
2. Simulate the batch against Arc mainnet.
3. Sign once. `Multicall3From` runs the USDC approval and `PayoutBatch.payBatch` in one transaction, and the contract emits one `InvoicePaid` event per line.
4. Rebuild the ledger from the logs, the receipt, and the payer's balances, with the network fee as its own row, because gas on Arc is paid in USDC.

## What is real

The USDC and the transactions are real. The invoices in the published batches are demo invoices and the six payees are wallets made for the demo.

- Contract: [`0xC86e2241166785344E4d6692E4D2A3D4c8466d0e`](https://explorer.arc.io/address/0xC86e2241166785344E4d6692E4D2A3D4c8466d0e?tab=contract), Arc mainnet, chain 5042
- Batch paid from the app: [`0xd4a8008f...972665`](https://explorer.arc.io/tx/0xd4a8008fc7e1179fda869206b5c14999e47bdebc22f92a6087c942650e972665), 0.195 USDC to 6 payees, 6 of 6 matched, difference 0 wei

Source and docs: [github.com/salazarsebas/conciliado](https://github.com/salazarsebas/conciliado)
