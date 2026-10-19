# Conciliado

Pay a batch of contractor invoices in USDC on Arc, each payment stamped with its invoice
reference, so nobody reconciles by hand.

## Status

`PayoutBatch` is deployed on Arc mainnet (chain 5042) at
[`0xC86e2241166785344E4d6692E4D2A3D4c8466d0e`](https://explorer.arc.io/address/0xC86e2241166785344E4d6692E4D2A3D4c8466d0e)
(deploy tx
[`0xc7d5cba3...ff800f`](https://explorer.arc.io/tx/0xc7d5cba3e626bb8c4449075cb712b58a558928d2f5ce28e0b9d1119841ff800f)).
The first real batch, 6 invoice lines for 0.195 USDC, was paid in
[`0x50d56ea9...100987056`](https://explorer.arc.io/tx/0x50d56ea910e0412c47a7dc186b5f89ccf7cbe71235db799379874d6100987056).
Details, tie-out, and the source verification status are in
[docs/deployments/mainnet.md](docs/deployments/mainnet.md). The ledger rebuild library is
built (`src/ledger/`, run it with `bun run ledger:rebuild`, see
[docs/ledger-rebuild.md](docs/ledger-rebuild.md)). The app is not built yet.

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
