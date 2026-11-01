# AGENTS.md

Conciliado pays a batch of contractor invoices in USDC on Arc mainnet (chain 5042) in one
transaction, then rebuilds the ledger from the chain and ties it to the payer's balance
change. It is a static client with no server, no database, and no server-held key.

## Start here

- Live app: https://conciliado.acachete.xyz
- Summary for machines: https://conciliado.acachete.xyz/llms.txt
- Evidence by judging axis: [docs/submission.md](docs/submission.md)
- Addresses and transactions: [docs/deployments/mainnet.md](docs/deployments/mainnet.md)

## Verify it

None of these sends a transaction or needs a key.

```bash
bun install --frozen-lockfile
bun run test             # app tests, offline
arc-forge test           # contract tests, needs Arc Foundry (see README)
bun run ledger:rebuild   # rebuilds the first mainnet batch and exits 1 unless it ties out
bun run test:e2e         # demo path; set E2E_BASE_URL to test a deployed URL
```

`bash scripts/check-mainnet.sh` reports the contract's health and usage from the chain.

## Rules for changes

- Never commit secrets, private keys, or salts.
- Mainnet transactions are signed by the payer's wallet. Do not send one from automation.
- Every figure in the docs must be read from the chain or measured.
- Diagrams are generated from `diagrams/generator/`, with Markdown twins in `docs/diagrams/`.
