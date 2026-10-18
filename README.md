# Conciliado

Pay a batch of contractor invoices in USDC on Arc, each payment stamped with its invoice
reference, so nobody reconciles by hand.

## Status

Nothing is built or deployed yet. This commit is the repository seed: standards, review
agents, and the diagram generator. Product work follows the open issues on this
repository's board, one issue per commit.

## What it will do

1. A payer uploads a CSV of contractor invoices.
2. One Arc mainnet transaction pays every line through the `PayoutBatch` contract and
   records an opaque invoice reference per line.
3. The ledger is rebuilt from chain data alone. Because gas on Arc is paid in USDC, the
   network fee is booked in the same unit, and the ledger total ties to the payer's USDC
   balance change to the cent.

Contracts, tests, and app are built in [Arc Studio](https://studio.arc.io). Arc Studio
deploys to Arc testnet; the same source is deployed to Arc mainnet with Arc Foundry.

Built for Arc Microgrants: Built with Arc Studio.
