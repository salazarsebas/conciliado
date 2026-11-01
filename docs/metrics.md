# Metrics

Issue: #17. Measured on 2026-10-19 (UTC) against Arc mainnet, chain 5042, through
`https://rpc.mainnet.arc.io`, read-only. The chain head was about block 26746700.

**The in-app metrics page is not built.** It comes with the payer app (issues #12 to #15),
and it will show these same figures computed from the chain in the browser. Until then this
file is the page. Every number below was read from the chain or timed by running the
command shown, and nothing is a target or an estimate unless it says so.

There is one real batch on mainnet, and it is the demo batch described in
[mainnet.md](deployments/mainnet.md): demo invoice IDs, six fresh payee wallets, real USDC.
Every figure here is therefore a figure for one batch of six lines. It is not a trend and it
is not a claim about production load.

## Usage, from the chain

Read with `bash scripts/check-mainnet.sh` (it pages `eth_getLogs` from the deploy block
26689148 to the head) and cross-checked against `cast logs`.

| Metric | Value | Why it matters |
| --- | --- | --- |
| Batches (`BatchPaid`) | 1 | The product's unit of work |
| Distinct payers | 1 | Only the project's own payer has used the contract |
| Invoice lines paid (`InvoicePaid`) | 6 | One per invoice |
| USDC paid out | 0.195000 (195000 units, 6 decimals) | What the payees received |
| Allow-list entries added | 6 added, 0 removed | `PayeeAdded` events from the payer |
| Contract balance | 0 wei | The contract holds no funds, as designed |
| Leftover allowance, payer to contract | 0 | The batch approved exactly its total |

## Cost, from the receipt

| Metric | Value | How it was computed |
| --- | --- | --- |
| Gas used by the batch transaction | 524,474 | Receipt of the `approve` plus `payBatch` call through `Multicall3From` |
| Effective gas price | 21 gwei (21000000000 wei) | Receipt |
| Network fee for the batch | 0.011013954 USDC (11013954000000000 wei) | 524,474 x 21,000,000,000 |
| **Fee per line** | **0.001835659 USDC** | 0.011013954 / 6, exact |
| Gas per line | about 87,412 | 524,474 / 6; includes the `approve`, so it overstates a line in a bigger batch |
| One-time cost: deploy | 0.014743911 USDC | [mainnet.md](deployments/mainnet.md) |
| One-time cost: `addPayees` for 6 payees | 0.003541923 USDC | [mainnet.md](deployments/mainnet.md) |

The fee per line comes from one 6-line batch that includes a one-time `approve`. I have not
run a batch of another size, so I have no figure for how it scales, and I do not state one.

## Tie-out

Measured by `bun run ledger:rebuild`, which reads the logs, the receipt, and the payer's
balance at blocks 26689515 and 26689516.

| Metric | Value |
| --- | --- |
| Payouts | 195000000000000000 wei (0.195 USDC) |
| Fee row | 11013954000000000 wei |
| Ledger total | 206013954000000000 wei |
| Payer native balance change | 206013954000000000 wei |
| **Tie-out difference** | **0 wei** (`$0.00` at 2 decimals) |
| ERC-20 `balanceOf` change (secondary view) | 206014 units, difference 0 |
| Invoice refs matched | 6 of 6 |
| Unmatched on chain / unmatched in the CSV | 0 / 0 |
| Same result through Blockdaemon, dRPC, and QuickNode | yes, 3 of 3 endpoints |

## Rebuild time

Wall time of `bun run ledger:rebuild`, the whole process: Bun start, reading the fixture and
the CSV, the RPC calls (receipt, logs, four balance reads, the block with its transactions),
and printing. Ten consecutive runs against `https://rpc.mainnet.arc.io`, three seconds apart,
from a laptop in Costa Rica with a timer around each run. All ten exited 0.

| Run | Seconds |
| --- | --- |
| 1 | 0.261 |
| 2 | 2.336 |
| 3 | 0.251 |
| 4 | 0.277 |
| 5 | 0.240 |
| 6 | 0.348 |
| 7 | 0.241 |
| 8 | 0.247 |
| 9 | 0.304 |
| 10 | 0.255 |

| Statistic | Seconds |
| --- | --- |
| Fastest | 0.240 |
| Median | 0.258 |
| Slowest | 2.336 |

Ten runs is too few for a p95, so I report the median and the extremes. The slow run was a
single outlier and I did not look into its cause.

Three runs each through the other endpoints Arc lists:

| Endpoint | Run 1 | Run 2 | Run 3 |
| --- | --- | --- | --- |
| Blockdaemon | 0.195 | 0.232 | 0.209 |
| dRPC | 0.317 | 0.349 | 0.409 |
| QuickNode | 0.279 | 0.304 | 0.291 |

Those ten runs date from 2026-10-19, when the offline tests (`bun run test`, 42 pass, 0 fail at that date) finished in 58 ms. Today `bun run test` has 237 tests and Foundry has 25. They
read recorded data, so they say nothing about network time.

## Chain timing

| Metric | Value | How |
| --- | --- | --- |
| Block interval | 0.507 s (about 1.97 blocks per second) | Block 26736537 to 26746537: 10,000 blocks in 5,067 s from the block timestamps |
| Block interval, shorter window | 0.5065 s | 2,000 blocks in 1,013 s |
| Batch transaction position | Block 26689516, transaction index 2 | The `BatchPaid` log |
| Receipt status of the batch | success | `cast receipt <hash> status` |
| RPC `eth_blockNumber` latency | 53 to 84 ms | 5 calls from one machine, one moment |

The batch was included in a single block and the receipt is final. Arc documents
deterministic finality in under one second, with no confirmation count to wait for. **I did
not measure the time from sending to final.** The three mainnet transactions were sent
before this measurement existed, and sending a new one is outside this issue's rules. The
app records send time and block time on the next real batch, and this file gets that number
then.

## Not measured yet

| Metric | Why | When |
| --- | --- | --- |
| Time from send to final | Needs a new transaction | With the app, on a real batch |
| Cost and gas of a batch other than 6 lines, including 200 | A 200-line test with one payee measured 8,661,135 gas; distinct payees and real cost need more | Before claiming a scaling figure |
| p95 rebuild time | Ten runs is too few | After the app exists and runs repeatedly |
| Page load and app response times | The app does not exist | `docs/performance.md`, with the app |
| Payees' receipt of funds in their wallets | Not part of the tie-out | The six payee wallets hold exactly their amounts per [mainnet.md](deployments/mainnet.md) |

## Reproduce

```bash
bash scripts/check-mainnet.sh          # batches, lines, USDC paid, balance, allow-list
bun run ledger:rebuild                 # tie-out difference, matched refs, fee row
RPC_URL=https://rpc.blockdaemon.mainnet.arc.io bun run ledger:rebuild    # another endpoint
cast block 26746537 -f timestamp --rpc-url https://rpc.mainnet.arc.io    # block timing, as above
```

For the rebuild time, wrap `bun run ledger:rebuild` in your own timer. Expect your numbers to
differ with your network.
