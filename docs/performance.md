# Response times

These are the p95 targets for the demo path, and how the app will measure each one. The
machine-readable copy is [performance-targets.json](performance-targets.json); the metrics
page reads that file, so the numbers here and on the page cannot drift.

**Status: targets only.** The landing is built, but nothing below is measured against a deployed
URL yet. There is a command line baseline and a first set of local browser runs (see below). A target stays a target until the app records at least 20 runs against the live deploy.
If a target cannot be measured, it is cut, not kept as decoration.

## Targets

| Id | What it measures | p95 target | Profile |
| --- | --- | --- | --- |
| `landing-fcp` | Landing first contentful paint | 1.2 s | Mobile, throttled |
| `landing-lcp` | Landing largest contentful paint | 2.0 s | Mobile, throttled |
| `landing-js` | Landing JavaScript, gzipped | 200 kB | Production build output |
| `csv-validate-200` | CSV parse and local validation of 200 lines | 250 ms | Desktop and mobile |
| `rebuild-6` | Rebuild from chain, 6 line batch, click to data resolved | 2.5 s | Desktop, warm RPC connection |
| `rebuild-200` | Rebuild from chain, 200 line batch, click to data resolved | 5 s | Desktop, warm RPC connection |
| `rebuild-visible` | Rebuild click to the matched count painted | 3 s | Desktop, warm RPC connection |
| `pending-shown` | Transaction hash returned to the pending pill painted | 100 ms | Desktop and mobile |
| `time-to-final` | Transaction hash returned to receipt received | 5 s | Arc mainnet |
| `inp` | Interaction to next paint | 200 ms | Mobile, throttled |
| `cls` | Cumulative layout shift | 0.05 | Mobile, throttled |

200 lines is the contract's `MAX_LINES`, so `-200` is the largest batch the product accepts.

## Why these numbers

- **Landing first paint.** The landing is the first thing a judge opens. It is a static page
  with system fonts and no wallet code on the critical path, so 1.2 s on a throttled phone is
  a budget the page can meet by construction. The 200 kB gzipped JavaScript budget is what
  enforces it: the wallet and ledger code load after the first paint, not before.
- **Rebuild time.** The rebuild reads logs, one receipt, and two balances from Arc RPC. In the
  demo it is the hook, so it has to feel like a single beat. 2.5 s for six lines leaves room
  for a slow RPC round trip; the visible target (3 s) adds the 600 ms the motion rules allow
  for rows to reappear.
- **Time to final.** Arc finality is deterministic, so this is "receipt received", with no
  confirmation counter. 5 s is the number the first measured runs in the app (#13) must
  confirm or correct. If Arc's measured time is lower, tighten the target; if it is higher,
  change the number and say why, never the method.
- **Pending shown.** The pill must appear the instant the wallet returns a hash. 100 ms is the
  threshold at which the interface feels immediate.
- **INP and CLS.** The usual "good" web vitals thresholds are 200 ms and 0.1. CLS is held to
  0.05 because the ledger table and tie-out bar must not jump while rows arrive.

## Baseline, rebuild, read-only

Measured on 2026-10-19 from a laptop on a home connection. `bun run ledger:rebuild` against
Arc mainnet (`https://rpc.mainnet.arc.io`) for the first real batch, 6 lines, 5 consecutive
runs. Wall clock for the whole process, including `bun` startup and module load, so it
overstates the in-app rebuild:

| Run | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- |
| Wall clock | 245 ms | 267 ms | 212 ms | 827 ms | 1512 ms |

Every run exited 0 and printed `Matched 6 of 6` with a difference of 0 wei. Five runs are not
a p95. They show the 2.5 s target is not unreasonable for 6 lines, and that RPC latency varies
by a factor of seven between runs, which is why the target is a p95 and not a median.
The 200 line target has no baseline yet.

## First browser runs, local lab

Measured on 2026-10-19 with headless Chrome driving `vite preview` of the production build on
localhost, from a laptop on a home connection, against Arc mainnet. Three runs, one per
profile, each recorded by the app with `performance.measure`. These are not valid runs under
the rules below (localhost, not the deployed URL, not 20 runs), so no target is marked met.

| Profile | `rebuild-6` | `rebuild-visible` |
| --- | --- | --- |
| 1280 px wide, light | 379 ms | 394 ms |
| 360 px wide, dark | 312 ms | 319 ms |
| 360 px wide, light, reduced motion | 306 ms | 320 ms |

Every run reached `6 of 6 matched` with a difference of `$0.00` (0 wei) and no horizontal
scroll at 360 px. `landing-js` from the build output: 155.24 kB gzipped for the initial JS
chunk, under the 200 kB target.

## How each one is measured

The app records every interval with `performance.mark` and `performance.measure`, named
`conciliado:<id>`, and sends nothing off the device. The metrics page lists the last 20 runs
and their p95.

| Id | Start | End |
| --- | --- | --- |
| `landing-fcp`, `landing-lcp`, `inp`, `cls` | Browser performance observers (`paint`, `largest-contentful-paint`, `event`, `layout-shift`) | Same |
| `landing-js` | `vite build` output | Sum of gzipped initial chunks |
| `csv-validate-200` | File read complete | Validation result in state |
| `rebuild-6`, `rebuild-200` | "Rebuild from chain" pressed | `rebuildLedger` resolves with rows and tie-out |
| `rebuild-visible` | "Rebuild from chain" pressed | First frame where the matched count and difference are painted |
| `pending-shown` | Wallet returns the transaction hash | First frame with the pending pill |
| `time-to-final` | Wallet returns the transaction hash | Receipt received |

Rules for a valid run:

- Run against the deployed URL, not localhost.
- Record the profile with the result: device, network, whether the RPC connection was warm.
  Lab runs for the paint metrics use a mobile profile with network and CPU throttling.
- A run that fails is recorded as a failure, not dropped.
- The reduced-motion setting does not change `rebuild-6` or `rebuild-200`. It shortens
  `rebuild-visible`, because the animation is skipped.

## If a target is missed

The metrics page shows the number in `pending` amber with the target next to it, not in green.
A missed target is written down on the page with the cause. It is not hidden and it is not
quietly raised.
