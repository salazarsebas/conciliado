# Deploy split (agent twin)

Markdown twin of `03-deploy-split`. Keep this in lockstep with
`diagrams/generator/03-deploy-split.py`. Image: `output/03-deploy-split.svg` and `.png`.
The table form is in `docs/architecture.md`.

```mermaid
flowchart LR
  subgraph testnet["Arc testnet: iteration"]
    studio_iter[("Studio iterations: PayoutBatch deployed by Arc Studio")]
  end
  subgraph mainnet["Arc mainnet: proof"]
    payout_main[("PayoutBatch: deployed with Arc Foundry")]
    demo["Demo batches: real USDC, real fees"]
  end
  subgraph off["Off-chain: no server, no server-held keys"]
    app["Payer app: static client build"]
    rebuild["Ledger rebuild: in the browser, from chain data"]
    csv["Invoice list: CSV with salt, local only"]
  end
  studio_iter -.->|pull, test, redeploy same source| payout_main
  payout_main -->|payBatch| demo
  app ==>|wallet-signed txs| payout_main
  demo -->|logs, receipts, balances| rebuild
  csv --> app
```
