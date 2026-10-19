# System architecture (agent twin)

Markdown twin of `01-system-architecture`. Keep this in lockstep with
`diagrams/generator/01-system-architecture.py`. Image: `output/01-system-architecture.svg`
and `.png`.

There is no application server and no server-held key. The payer's browser talks to the
wallet and to Arc RPC. The payer's wallet signs every transaction.

Layers:

- **Off-chain client** (payer's browser, static build): local invoice list, payer app,
  ledger rebuild. The wallet is the payer's own and sits beside the app.
- **On-chain, Arc mainnet (chain 5042)**: `Multicall3From`, `PayoutBatch`, the USDC
  ERC-20 interface at `0x3600000000000000000000000000000000000000` (6 decimals, also the
  gas token), and the Arc RPC endpoint `https://rpc.mainnet.arc.io`.
- **Build pipeline** (developer machine): Arc Studio, `arc-studio pull`, Arc Foundry.
  Studio iterations deploy to Arc testnet only.

```mermaid
flowchart TB
  subgraph client["Off-chain client: payer's browser, static build, no backend"]
    csv["Local invoice list: CSV with invoice ID, payee, amount, salt. Never leaves the browser"]
    app["Payer app: React + Vite + TypeScript, wagmi + ConnectKit"]
    wallet["Payer wallet: holds the key, signs every tx"]
    rebuild["Ledger rebuild: runs in the browser, outputs ledger + USDC tie-out"]
  end
  subgraph chain["On-chain: Arc mainnet, chain 5042"]
    multicall["Multicall3From: approve + payBatch in one tx"]
    payout[("PayoutBatch: payBatch(lines, expectedTotal), emits InvoicePaid and BatchPaid")]
    usdc[("USDC ERC-20 interface 0x3600...0000, 6 decimals, also the gas token")]
    rpc["Arc RPC: rpc.mainnet.arc.io, logs, receipts, balances"]
  end
  subgraph build["Build pipeline: developer machine"]
    studio["Arc Studio: contract, tests, app scaffold"]
    pull["arc-studio pull"]
    foundry["Arc Foundry: arc-forge test, arc-forge create"]
  end
  testnet[("Arc testnet: Studio iterations of PayoutBatch")]

  csv -->|parsed in memory| app
  app -->|request signature| wallet
  wallet ==>|one signed tx| multicall
  multicall -->|"approve(PayoutBatch, total)"| usdc
  multicall -->|"payBatch(lines, total)"| payout
  payout -->|"transferFrom(payer, payee)"| usdc
  rpc -->|logs + receipts + balances| rebuild
  app -.->|eth_call simulate, eth_getLogs| rpc
  csv -.->|invoice ID + salt match refs| rebuild
  studio -.->|deploys iterations| testnet
  studio --> pull
  pull -->|tests pass| foundry
  foundry ==>|mainnet deploy, source unchanged| payout
```

## Edges

| From | To | Meaning |
| --- | --- | --- |
| Local invoice list | Payer app | CSV parsed in memory, never uploaded |
| Payer app | Payer wallet | Request a signature |
| Payer wallet | Multicall3From | One signed transaction |
| Multicall3From | USDC | `approve(PayoutBatch, total)` |
| Multicall3From | PayoutBatch | `payBatch(lines, total)` |
| PayoutBatch | USDC | `transferFrom(payer, payee)` per line |
| Payer app | Arc RPC | Simulate with `eth_call`, read with `eth_getLogs` |
| Arc RPC | Ledger rebuild | Logs, receipts, balances |
| Local invoice list | Ledger rebuild | Invoice ID and salt, to match each `invoiceRef` |
| Arc Studio | Arc testnet | Iterations deploy to testnet |
| Arc Studio | `arc-studio pull` | Source lands in the repo |
| `arc-studio pull` | Arc Foundry | Tests pass under `arc-forge test` |
| Arc Foundry | PayoutBatch | `arc-forge create` to mainnet, source unchanged |
