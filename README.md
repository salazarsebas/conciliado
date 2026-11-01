# Conciliado

Pay a batch of contractor invoices in USDC on Arc in one transaction, with every payment
stamped with its invoice reference, so the books can be rebuilt from the chain and nobody
reconciles by hand.

## Screening facts

| Fact | Value |
| --- | --- |
| Program | Arc Microgrants: Built with Arc Studio |
| Live app | https://conciliado.acachete.xyz (no wallet needed to rebuild a batch) |
| Demo video | https://youtu.be/NrJMAVy_LsI |
| Network | Arc mainnet, chain 5042 |
| Contract | [`0xC86e2241166785344E4d6692E4D2A3D4c8466d0e`](https://explorer.arc.io/address/0xC86e2241166785344E4d6692E4D2A3D4c8466d0e?tab=contract), source verified |
| Usage on 2026-11-01 | 2 batches, 12 invoice lines, 0.39 USDC paid, 1 payer, 6 payees ([live figures](https://conciliado.acachete.xyz/metrics)) |
| Batch paid from the app | [`0xd4a8008f...972665`](https://explorer.arc.io/tx/0xd4a8008fc7e1179fda869206b5c14999e47bdebc22f92a6087c942650e972665), tie-out difference 0 wei |
| Tests | 238 app tests, 25 Foundry tests, Playwright E2E of the demo path |
| What is demo | The invoices are demo invoices and the payees are wallets made for the demo. The USDC and the transactions are real. |
| External users | None yet |
| Write-up by judging axis | [docs/submission.md](docs/submission.md) |

## What it is

Conciliado is two pieces. `PayoutBatch` is a small contract that moves USDC from the payer
to each payee and emits one event per invoice line. A ledger rebuild reads those events,
the receipt, and the payer's balances back from Arc and checks that the ledger ties to the
payer's USDC balance change. Both are live on Arc mainnet. The web app has a wallet-free
landing page that runs the rebuild in the browser, a run-a-batch flow at `/run`, and a
metrics page at `/metrics` (see [Status](#status)).

**Live app:** https://conciliado.acachete.xyz

**Demo video:** https://youtu.be/NrJMAVy_LsI

Built for Arc Microgrants: Built with Arc Studio.

## The problem

Paying contractors in a batch usually leaves a list of transfers that someone matches to
invoices by hand, with the network fee booked somewhere else, if at all. Conciliado puts
the invoice reference in the payment itself. On Arc, gas is paid in USDC, so the fee is in
the same unit as the payouts and can be booked next to them.

This README does not quote industry statistics. The only numbers in it come from the real
batches documented in [docs/deployments/mainnet.md](docs/deployments/mainnet.md). The batch
paid from the app has six invoice lines, 0.195 USDC paid out, a 0.008637975 USDC network
fee, and a ledger that differs from the payer's balance change by 0.

## Status

### Live on Arc mainnet (chain 5042)

| Item | Link |
| --- | --- |
| Web app | [conciliado.acachete.xyz](https://conciliado.acachete.xyz) |
| Batch paid from the app | [`0xd4a8008f...972665`](https://explorer.arc.io/tx/0xd4a8008fc7e1179fda869206b5c14999e47bdebc22f92a6087c942650e972665) |
| `PayoutBatch` contract | [`0xC86e2241166785344E4d6692E4D2A3D4c8466d0e`](https://explorer.arc.io/address/0xC86e2241166785344E4d6692E4D2A3D4c8466d0e) |
| Deploy transaction | [`0xc7d5cba3...ff800f`](https://explorer.arc.io/tx/0xc7d5cba3e626bb8c4449075cb712b58a558928d2f5ce28e0b9d1119841ff800f) |
| Allow-list setup for the six payees (`addPayees`) | [`0x8d8652df...f89f36`](https://explorer.arc.io/tx/0x8d8652df005fe8cbfccb79afa8ed750c56be365dcd6e58fcdb87f3aaf7f89f36) |
| First batch, sent by script: 6 invoice lines, 0.195 USDC, one transaction | [`0x50d56ea9...100987056`](https://explorer.arc.io/tx/0x50d56ea910e0412c47a7dc186b5f89ccf7cbe71235db799379874d6100987056) |

Both batches matched 6 of 6 invoice references against their CSV, and in both the ledger
total equals the payer's balance change, difference 0 wei. Reproduce the first, with its
invoice match, using the commands [below](#run-it) or the button on the landing page. The
CSV of the second batch stays with the payer, so its
[rebuild link](https://conciliado.acachete.xyz/?tx=0xd4a8008fc7e1179fda869206b5c14999e47bdebc22f92a6087c942650e972665&network=mainnet) shows payees, amounts, fee, and the
tie-out, with each invoice reference marked "Reference only".

### What is a fixture

- `fixtures/mainnet-batch-1.csv` and `fixtures/mainnet-batch-1.json` describe the first
  batch. The `ledger:rebuild` command takes only the contract, payer, transaction hash,
  and invoice list from them; every number it prints is read from the chain. The offline
  tests use the same files as recorded chain data.
- The invoice IDs in both batches are demo IDs, and the six payees are fresh wallets made
  for the demo. The money and the transactions are real; the invoices are not.

### Built: the app

- `/run` takes an invoice CSV, reviews each line, simulates the batch against Arc RPC, and
  sends one transaction signed in the payer's browser wallet. It then rebuilds the ledger
  from that transaction.
- `/metrics` reads batches and lines from Arc mainnet in the browser.

- `/` needs no wallet. It shows the local invoice list (`fixtures/mainnet-batch-1.csv`,
  bundled), the payments ledger as deleted, and a "Rebuild from chain" button. The button
  runs `rebuildLedger` from `src/ledger/` in the browser against Arc mainnet
  (`https://rpc.mainnet.arc.io`, chain 5042) for the first batch, with a visible timer, then
  shows the six rows, the network fee row, `6 of 6 matched`, and the tie-out bar. Each row
  links to explorer.arc.io. If the RPC is unreachable it shows the last successful rebuild
  with its UTC timestamp, or an error with no data. The code is in `src/landing/`, authored
  in Arc Studio. The brand book and design system ([docs/brand-book.md](docs/brand-book.md),
  [docs/design-system.md](docs/design-system.md)) are applied with the tokens in
  [docs/brand/](docs/brand/).
- Response times: the first browser runs are in [docs/performance.md](docs/performance.md).
  They are local lab runs, not measurements against a deployed URL, so the targets stay
  targets.
- Run it with `bun run dev`, or `bun run build` and `bunx vite preview`.

Open work is tracked in the [issues](https://github.com/salazarsebas/conciliado/issues).

### Known issues

- `src/tracing.ts` and `src/console-capture.ts` (Arc Studio scaffold) post RPC parameters
  and console output to the parent frame. `src/main.tsx` loads them only inside a frame in
  dev or with `VITE_ARC_STUDIO_PREVIEW=true`, and a normal `bun run build` leaves them out
  (checked by `src/public-build.test.ts`, which builds the production bundle).
- The 200-line gas figure (8,661,135 gas, below the 30,000,000 block gas limit) uses a
  single payee. A 200-line run with distinct payees has not been measured
  ([#31](https://github.com/salazarsebas/conciliado/issues/31) covers the cap itself).

## Architecture

![System architecture](docs/diagrams/output/01-system-architecture.png)

There are three layers. There is no application server, no database, and no server-held
key. The payer's wallet signs every transaction.

- **Off-chain client** (the payer's browser, a static build). Holds the invoice CSV in
  memory, builds the batch, asks the wallet to sign, and rebuilds the ledger. It reads
  from Arc RPC and never uploads the invoice list. The chain stores only an opaque
  `bytes32` reference per line; the mapping from invoice to reference stays with the
  payer. The rebuild is a library in `src/ledger/`, also runnable as a Bun command.
- **On-chain, Arc mainnet.** `PayoutBatch` (`payBatch(lines, expectedTotal)` does one
  `transferFrom(payer, payee, amount)` per line, emits `InvoicePaid` per line and
  `BatchPaid` per batch, and holds no funds); the system contract `Multicall3From`, which
  runs `approve` and `payBatch` in one transaction with the payer as sender; and the USDC
  ERC-20 interface at `0x3600000000000000000000000000000000000000` (6 decimals, also the
  gas token).
- **Build pipeline** (developer machine). Arc Studio authors the code, `arc-studio pull`
  brings it into this repo, and Arc Foundry runs the tests and deploys to mainnet. Arc
  Studio itself deploys to Arc testnet only.

The boundaries in one line each: the browser never holds a key, the chain never sees an
invoice ID, and nothing between the browser and Arc RPC is operated by this project.

The mainnet, testnet, and off-chain table and the address list are in
[docs/architecture.md](docs/architecture.md). The diagrams, each with a Markdown twin for
agents: [system architecture](docs/diagrams/01-system-architecture.md),
[payment and rebuild flow](docs/diagrams/02-payment-and-rebuild-flow.md),
[deploy split](docs/diagrams/03-deploy-split.md) (images in
[docs/diagrams/output](docs/diagrams/output)).

## How it works

![Payment and rebuild flow](docs/diagrams/output/02-payment-and-rebuild-flow.png)

1. The payer provides a CSV with an invoice ID, payee, and amount per row, plus an optional
   cost center. The browser generates the salt.
2. The client validates each row: valid address, amount above zero, no duplicate
   reference, payee on the payer's allow-list, reference unused. A bad row stops the
   batch before anything is sent.
3. The client simulates `payBatch` with `eth_call` against Arc RPC. A revert shows its
   reason and nothing is sent.
4. The payer signs one transaction that runs `approve` and `payBatch` through
   `Multicall3From`.
5. `PayoutBatch` pays every line on Arc mainnet and emits one `InvoicePaid` per line plus
   one `BatchPaid`.
6. The rebuild reads the logs, the receipt, and the payer's balance before and after the
   batch block.
7. It builds one ledger row per `InvoicePaid` log and one fee row from the receipt
   (`gasUsed` times `effectiveGasPrice`, in USDC).
8. It matches each CSV row to a log: the reference is `keccak256(invoiceId ++ salt)`.
9. It ties out: the ledger total equals the payer's balance change, exactly, in the
   18-decimal native unit.

Steps 1 to 4 are the app, at `/run`. Steps 5 to 9 are reproducible for both batches. The
rebuild rules (which logs are counted, why the duplicate 18-decimal
`Transfer` logs are ignored, how the fee is rounded) are in
[docs/ledger-rebuild.md](docs/ledger-rebuild.md).

## How Arc Studio was used

The product code was authored in [Arc Studio](https://studio.arc.io) and pulled into this
repo with `arc-studio pull`: the `PayoutBatch` contract and its Foundry tests, the app
scaffold (`src/`, `scripts/`), the ledger rebuild library, the landing, and the `/run`
flow. The Conciliado project in Arc Studio is
[here](https://studio.arc.io/app/00732eb6-0372-4443-b5a3-2fa761fc0c3c). Studio offers no
public project sharing, so that link may not open for other accounts; the evidence anyone
can check is this repo and its history. Studio also ran its Solidity and functional auditors and Slither on the
contract. The findings and what was done about them are in
[docs/contracts/payout-batch.md](docs/contracts/payout-batch.md). Studio states that its
review is best effort and not a substitute for a paid third-party audit before real
funds.

Mainnet was deployed with Arc Foundry because Arc Studio deploys to Arc testnet only. The
same pulled `contracts/PayoutBatch.sol` went to mainnet unchanged, after `arc-forge test`
passed (22 passed at deploy time; the suite has 25 today). The testnet deployment of the Studio iteration is at
[`0x209dd046...1fb6`](https://explorer.testnet.arc.io/address/0x209dd04647d4c103081095176e5f58c5d91e1fb6).
The Studio to mainnet path was first tried on a throwaway contract, see
[docs/spikes/arc-studio-path.md](docs/spikes/arc-studio-path.md).

| Area | Where it was made |
| --- | --- |
| `contracts/PayoutBatch.sol` and its Foundry tests | Arc Studio |
| `src/ledger/`, `src/landing/` | Arc Studio |
| `src/run/` (CSV review, simulate, pay) | Arc Studio |
| Rebuild retries on load-balanced RPC ([#41](https://github.com/salazarsebas/conciliado/pull/41)) | Repo, after testing the live deploy |
| Keeping the parsed batch when a wallet connects ([#43](https://github.com/salazarsebas/conciliado/pull/43)) | Repo, after testing the live deploy |
| Mainnet deploy, Vercel config, E2E tests, metrics page | Repo |

## Run it

Each command below was run in a fresh git worktree of `main`. None of them sends a
transaction or needs a key.

### 1. Install

You need [Bun](https://bun.sh) 1.3.14 (see `.bun-version`).

```bash
git clone https://github.com/salazarsebas/conciliado.git
cd conciliado
bun install --frozen-lockfile
```

Install before running the contract tests: the contracts import OpenZeppelin from
`node_modules`.

### 2. Contract tests with Arc Foundry

Install Arc Foundry from the
[arc-foundry releases](https://github.com/circlefin/arc-foundry/releases). Assets exist
for macOS on Apple Silicon and for Linux. Download the archive for your platform and its
`.sha256`, check the hash, extract it, and put its `forge` binary on your `PATH` under the
name `arc-forge`. The version used here is v0.8.0-2; `arc-forge --version` prints
`forge Version: 1.7.1-dev`. `forge-std` is vendored in `lib/`.

```bash
arc-forge test
```

Expected: `25 tests passed, 0 failed, 0 skipped`. Add `--force` to recompile from scratch.

### 3. App tests

```bash
bun run test
```

Expected: `0 fail`. These cover the ledger, landing, and run flow, and run offline against
recorded chain data in `fixtures/`. The current count is in
[docs/metrics.md](docs/metrics.md).

### 4. Rebuild the first mainnet batch, read-only

```bash
bun run ledger:rebuild
```

This reads Arc mainnet through `https://rpc.mainnet.arc.io` (set `RPC_URL` to use another
endpoint), signs nothing, and exits 1 if the difference is not 0 or a reference is
unmatched or mismatched. The lines that matter in the output:

```text
Matched   6 of 6
Mismatch  0
differenceWei        : 0 wei
differenceDisplay    : $0.00
```

Cross-check the batch on the
[explorer](https://explorer.arc.io/tx/0x50d56ea910e0412c47a7dc186b5f89ccf7cbe71235db799379874d6100987056).

## Repository map

| Path | What is there |
| --- | --- |
| `contracts/` | `PayoutBatch.sol` and its tests, pulled from Arc Studio |
| `src/ledger/` | Ledger rebuild and tie-out library, with tests |
| `src/landing/` | The read-only landing: view model, formatting, CSV parser, components, with tests |
| `scripts/rebuild-ledger.ts` | The `ledger:rebuild` command |
| `scripts/brand-tokens.ts` | The `brand:tokens` and `brand:check` commands for the design tokens |
| `fixtures/` | The first mainnet batch as CSV and recorded chain data |
| `diagrams/generator/` | Graphviz sources for the diagrams |
| `docs/` | Architecture, deployment record, ledger rebuild notes, brand book, design system, response times, contract notes, spike, standards |
| `docs/brand/` | Design tokens (JSON, CSS variables, Tailwind theme) and the logo mark |

## Run a batch

Open `/run` from the "Run a batch" link in the landing header. The landing itself never asks for a wallet.

1. Pick the network. Arc mainnet (5042) is the default and carries the solid "Arc mainnet" badge. Arc testnet (5042002) is badged "test funds".
2. Connect an injected browser wallet (no WalletConnect project id needed).
3. Upload a CSV with the header `invoiceId,payee,amount,costCenter` (`costCenter` is optional). `amount` is decimal USDC with up to 6 decimals. Every row is checked before anything is signed: address, zero or over-precise amount, duplicate `invoiceId`, more than 200 lines, ref already used on chain, payee not allow-listed.
4. Download the payer CSV and the salt file. The salt is generated in the browser, never sent anywhere, and is the only way to reproduce the invoice references from your invoice IDs. Payee, amount, and timing are public on Arc; only the salted reference is written for each invoice.
5. If some payees are not allow-listed, send the separate `addPayees` transaction.
6. The whole batch is simulated with `eth_call` through `Multicall3From.aggregate3` (approve the exact total, then `payBatch`). Pay stays disabled while the simulation reverts, and the revert reason is shown.
7. Pay sends one transaction with `maxFeePerGas` of at least 20 gwei. The status goes from pending to final, then the ledger is rebuilt from the chain with the uploaded CSV (matched count and tie-out difference).

Any paid batch can be rebuilt read-only by link: `/?tx=<batch tx hash>&network=mainnet` (or `testnet`). Amounts, fee, and tie-out come from the chain. Invoice IDs are not on chain, so a link shows references only.
