# Monitoring plan

Issue: #17. Written on 2026-10-19. Every command in this file was run that day against
`https://rpc.mainnet.arc.io` and is read-only: no key, no transaction, no gas.

## What exists and what does not

- There is **no on-call, no pager, no scheduler, and no server**. One person owns this, and
  checks run when that person runs them. Nothing here sends an alert on its own.
- What exists today is a script that prints `OK`, `WARN`, or `PAGE` per signal and exits
  1 when any line is `PAGE`: [`scripts/check-mainnet.sh`](../scripts/check-mainnet.sh). It
  needs `curl`, `jq`, `bc`, and Foundry's `cast` (Arc Foundry's `arc-cast` works the same).
- The payer app is not built (issues #12 to #15), so there is nothing to monitor in a
  browser yet. The app signals are listed at the end as planned, not as running.
- Because the app will be a static page with no backend, there is no telemetry to collect
  from payers, by design (see [threat-model.md](threat-model.md)). The monitoring is about
  the chain, the payer account, and the RPC.

## What is watched on mainnet

Contract `PayoutBatch` `0xC86e2241166785344E4d6692E4D2A3D4c8466d0e`, payer
`0x429Fd794Ed2166c0F6fFef39fA6A1F580Ba64364`, chain 5042.

| Signal | Why it matters | `PAGE` when | `WARN` when | Covered by the script |
| --- | --- | --- | --- | --- |
| Chain id of the RPC | A wrong network makes every other answer meaningless | not 5042, or no answer | | yes |
| Head block age | A stalled RPC or chain | older than 30 s | | yes |
| Payer balance | The next batch needs payouts plus fee | below 0.25 USDC | below 1 USDC | yes |
| Payer transaction count | Any transaction that is not in the record, including a key compromise | differs from the recorded 4 | | yes |
| Contract balance | The contract is meant to hold nothing; funds there cannot be withdrawn | | above 0 | yes |
| Contract runtime code hash | Detects that the address does not hold the recorded code | differs from the recorded hash | | yes |
| Allow-list events for the payer | An unexpected `PayeeAdded` is the sharpest sign of misuse | net count differs from the recorded 6 | | yes |
| `BatchPaid`, `InvoicePaid`, paid total | Usage and a record of who used the contract | | | prints counts |
| Failed transactions | Reverted batches cost the payer gas | | | partly, see below |
| RPC latency and errors | The rebuild and the app depend on one public endpoint | | | no, manual |

The thresholds are my choices, not limits taken from Arc. Change them with the environment
variables at the top of the script. The 30 second head age is generous: blocks arrive about
every half second (see [metrics.md](metrics.md)).

### The recorded state

The script compares against what [mainnet.md](deployments/mainnet.md) says happened. When a
real transaction is sent, update the record and then these values, otherwise the script
reports the new activity as `PAGE`, which is the point.

| Value | Recorded | Source |
| --- | --- | --- |
| Payer transaction count | 4 | The spike deploy, then deploy, `addPayees`, and the first batch |
| Allow-list events | 6 added, 0 removed | The `addPayees` transaction |
| Runtime code hash | `0x6aa81ec65c8a13dc19048ac2d34ca9b8270a7de2a1a13cb0f6ec04adbb4d7932` | `cast keccak "$(cast code <contract>)"` on 2026-10-19 |
| Contract balance | 0 | Read on 2026-10-19 |

## Run it

```bash
bash scripts/check-mainnet.sh
```

Output on 2026-10-19:

```text
OK    chain id 5042
OK    head block 26746766, 0s old
OK    payer balance 5753190523000000000 wei
OK    payer nonce 4
OK    contract holds 0 wei
OK    runtime code hash unchanged
OK    allow-list events: 6 added, 0 removed
INFO  since block 26689148: 1 batches, 6 lines, 195000 USDC units paid (6 decimals)
```

It takes about 8 seconds, almost all of it the pauses between `eth_getLogs` pages. With the
thresholds forced to trip (`EXPECTED_NONCE=5 EXPECTED_ALLOWED=7 PAGE_BALANCE_WEI=6000000000000000000
MAX_HEAD_AGE_S=-1`) it printed four `PAGE` lines and exited 1. With an unreachable
`RPC_URL` it printed one `PAGE` line and exited 1.

## The same signals by hand

```bash
RPC=https://rpc.mainnet.arc.io
C=0xC86e2241166785344E4d6692E4D2A3D4c8466d0e
P=0x429Fd794Ed2166c0F6fFef39fA6A1F580Ba64364

# RPC health: expect 5042, and an age of a few seconds
cast chain-id --rpc-url $RPC
echo $(( $(date -u +%s) - $(cast block latest -f timestamp --rpc-url $RPC) ))

# Payer: native balance in wei (18 decimals), and transaction count
cast balance $P --rpc-url $RPC
cast nonce $P --rpc-url $RPC

# Contract: balance (expect 0), runtime code hash, constructor token, cap
cast balance $C --rpc-url $RPC
cast keccak "$(cast code $C --rpc-url $RPC)"
cast call $C "USDC()(address)" --rpc-url $RPC
cast call $C "MAX_LINES()(uint256)" --rpc-url $RPC

# Allowance left from the payer to the contract (expect 0)
cast call 0x3600000000000000000000000000000000000000 \
  "allowance(address,address)(uint256)" $P $C --rpc-url $RPC

# State of one payee and one reference
cast call $C "isPayeeAllowed(address,address)(bool)" $P 0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571 --rpc-url $RPC
cast call $C "isInvoiceRefUsed(address,bytes32)(bool)" $P \
  0x480f1d091980e77bfd5476fefacccaf148fd2eda7228cb643226eb5e0948b6db --rpc-url $RPC

# Events in one block range (at most 10000 blocks per call)
cast logs --address $C --from-block 26689148 --to-block 26699146 \
  "BatchPaid(uint256 indexed batchId, address indexed payer, uint256 lineCount, uint256 total)" \
  --rpc-url $RPC

# Receipt status of a known transaction (the first batch)
cast receipt 0x50d56ea910e0412c47a7dc186b5f89ccf7cbe71235db799379874d6100987056 status --rpc-url $RPC
```

The event signatures the script filters on, from `cast sig-event`:

| Event | Topic 0 |
| --- | --- |
| `PayeeAdded(address,address)` | `0xdc5ead19b6024fc846be8ef64aa124f9d38b64826b5d39d63010d18b34942cdb` |
| `PayeeRemoved(address,address)` | `0x45b8bd2a50254d8668cba83d731f47650a5372807cedc4f4dccf0fdf7fc8dd6d` |
| `InvoicePaid(uint256,uint256,address,uint256,bytes32)` | `0xdeb7ab14506804b2d5cb07e7e77a7f93f7f6defd4de1637c3ccb39f471341dd3` |
| `BatchPaid(uint256,address,uint256,uint256)` | `0x57fc392f5c64b45d764276082cc4f05bd8711464a10a8b3ee6d0ab92fccb0a39` |

## What the RPC does to a watcher

Measured or documented, and the reason the script is written the way it is:

- `eth_getLogs` allows at most 10,000 blocks per call (Arc docs). Since the deploy block
  26689148 the chain is about 57,600 blocks long, so the script pages in 9,999-block steps.
- The public endpoint rate limits. Six `eth_getLogs` calls in a row, plus a few other calls
  just before, got `{"code":-32005,"message":"rate limit exceeded"}` on the sixth. The script
  waits a second between pages and retries three times with two seconds between tries.
- The endpoint is load-balanced across backends that can sit at slightly different heights
  (Arc docs). A request for a block the serving backend has not imported can fail with
  `-32014`. A retry after a short pause is the documented answer.
- Latency from my machine for `eth_blockNumber`: 53 ms to 84 ms over five calls. That is
  one place and one moment, not a service level.
- Other providers answer on the same chain. Blockdaemon, dRPC, and QuickNode returned chain id
  5042 on 2026-10-19, and the rebuild gave the same tie-out through each one. Use
  `RPC_URL=<endpoint>` for either the script or `bun run ledger:rebuild` when the primary
  endpoint is slow.

## Failed transactions

What can be seen and what cannot:

- A transaction that reverts on chain and has a receipt shows `status 0` in
  `cast receipt <hash> status`. That only works for a hash you already know.
- The chain has no per-address transaction index in the standard RPC, so "list every failed
  call to the contract" is not a single read. The script instead watches the payer's
  transaction count: a new count means a transaction the record does not have, and its hash
  is then found on the explorer or from the wallet.
- Arc docs say an included transaction that reverts on a blocklist check still consumes
  gas, and one page says such reverts leave no receipt. I have not reproduced either (no
  transactions are allowed here), so a blocklist revert may be invisible to a receipt
  lookup. The payer sees it when the send fails.
- Other payers' failed calls to the contract are not watched. The contract is public, and
  their activity is not this project's to track. Their successful batches do appear as
  `BatchPaid`, and the script counts them.
- The explorer API cannot be used from a script: `explorer.arc.io` answers command line
  clients with a Cloudflare challenge ([mainnet.md](deployments/mainnet.md)).

## Service levels

There is no `docs/performance.md` yet, so these are the targets for what exists. They are
mine, set against the measurements in [metrics.md](metrics.md), and the app adds its own once
it exists.

| Target | Value | Measured on 2026-10-19 |
| --- | --- | --- |
| Rebuild of one batch finishes (the `bun run ledger:rebuild` command, whole process) | under 5 s | median 0.258 s, slowest 2.336 s, 10 runs |
| Head block age at the RPC | under 30 s | 0 s to 1 s in the runs above |
| Tie-out difference for a settled batch | exactly 0 wei | 0 wei |

## When the demo is down: recovery in five minutes

There is no hosted service yet, so "down" today means a command in the README does not work.
Work through these in order:

1. `bash scripts/check-mainnet.sh`. If the first line is `PAGE`, the problem is the RPC.
2. Set another endpoint: `RPC_URL=https://rpc.blockdaemon.mainnet.arc.io bun run ledger:rebuild`,
   and the same for the script. The dRPC and QuickNode URLs are in the Arc docs.
3. If the chain id or head block is wrong on every endpoint, the problem is Arc, not this
   repo. Nothing is lost: the contract holds no funds and the batch record is on chain.
4. If `ledger:rebuild` prints a nonzero difference, open the batch on the explorer and check
   whether the payer sent another transaction in the same block. The rebuild warns about
   that case.
5. If a `PAGE` line says the nonce, allow-list, or code hash changed and the record does not
   explain it, treat the payer key as compromised: move the remaining USDC to a new account,
   then investigate. Nothing on the contract side can be paused.

Once the app is deployed, add its static host's uptime check here, and the fallback
endpoint the app uses.

## Planned for the app (not running)

| Signal | Source | Note |
| --- | --- | --- |
| Static page reachable | Host uptime check | Not set up, no host chosen |
| Simulation result per batch | Shown to the payer before signing | Local, never sent anywhere |
| Rebuild result and tie-out difference | Shown in the app | Local |
| Time from send to `final` | Measured in the app | Needs a real batch, see [metrics.md](metrics.md) |
| Second RPC endpoint | App configuration | Manual cross-check today |
