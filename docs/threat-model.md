# Threat model

Issue: #17 (threat model, monitoring plan, metrics). Written on 2026-10-19 against `main`.

Scope: the `PayoutBatch` contract live on Arc mainnet, the payer key, the invoice CSV and
reference privacy model, the read-only ledger rebuild, RPC trust, and the people around
them. The payer web app is not built yet (issues #12 to #15), so every app control below is
marked as designed, not as done. The monitoring plan is in [monitoring.md](monitoring.md) and
the numbers are in [metrics.md](metrics.md).

Review status: **sign-off pending.** The ship standards require the `threat-modeler` review
before the public flip, and it has not run on this file. There is also no paid third-party
audit of the contract (see [C5](#c5-no-owner-no-pause-no-upgrade-and-no-paid-audit)).

## How to read this

Every threat has a control and a status:

- **In place**: checked in the contract source, the tests, the rebuild code, or on chain.
  The check is named.
- **Designed**: described in the README or the architecture, but the app that would do it
  does not exist yet.
- **Gap**: nothing stops it today.

"Residual" is what is left after the control, stated as plainly as I can.

## 1. What we protect

| Asset | Where it lives | Why it matters |
| --- | --- | --- |
| The payer's USDC | The payer's own account, `0x429Fd794Ed2166c0F6fFef39fA6A1F580Ba64364` (5.753190523 USDC on 2026-10-19) | It is the money the batch moves. The contract holds none of it. |
| The payer's signing key | The payer's key or wallet | It authorizes every payment and every allow-list change. |
| Allow-list integrity | `PayoutBatch` storage, keyed by payer | It decides who can be paid from a payer's account through the contract. |
| Duplicate-payment guard | `PayoutBatch` storage, keyed by payer | A used `invoiceRef` cannot be paid again. |
| The invoice-to-payment mapping | The payer's CSV and salt, off chain | The chain shows who was paid and how much. It should not show which invoice. |
| Ledger correctness | Output of `src/ledger/` | People will rely on "difference 0" to close their books. |
| The page the payer loads (later) | Static host | A tampered bundle could change payees or amounts before signing. |

## 2. Who we assume

| Actor | Trust | What they can do |
| --- | --- | --- |
| Payer | Trusted with the key. Can make mistakes. | Signs everything. Adds and removes their own payees. |
| Payee | Untrusted, passive. | Receives USDC. Never signs, connects a wallet, or claims anything. |
| Any other address | Untrusted. | Reads all chain data. Can call `payBatch` with their own funds and their own allow-list (the contract is public). Can send USDC to the contract address. |
| Arc chain | Trusted for ordering and finality. | Arc documents a Proof-of-Authority validator set. A hostile validator set is out of scope. |
| USDC on Arc | Trusted token. Run by Circle. | Enforces a blocklist at runtime (see [B1](#b1-a-blocklisted-payee-reverts-the-whole-batch)). |
| RPC operator | Trusted for availability, not for integrity. | Can delay, drop, rate limit, or lie. See [N1](#n1-the-rpc-returns-wrong-or-stale-data). |
| Static host and CDN (later) | Trusted to serve the right bundle. | Can serve a different bundle. |
| Developer machine, Arc Studio, package registry | Trusted to produce the code. | Can introduce a bad dependency or a bad file. |

Trust boundaries, from the payer outward:

1. Payer to wallet: the key never enters the app. This is designed. The only signer in the
   repo today is the command line used for the deploy and the first batch.
2. Wallet to chain: the contract and USDC enforce their own rules, whatever the app says.
3. App or CLI to RPC: everything read here (logs, receipts, balances, `eth_call`) is
   claimed by the RPC, not proven.
4. Browser to host: the page the payer loads.
5. Developer machine to repo and registry: how the code got here.

## 3. What we do not protect (non-goals)

- **Who is paid, how much, and when.** Payer, payees, amounts, and block times are public
  on chain by design. Only the invoice identity is kept off chain.
- **A compromised payer key or wallet.** If an attacker holds the key, they can pay
  anyone. The allow-list does not help, because the same key edits it.
- **A wrong payee that the payer approved.** If the payer allow-lists the wrong address,
  the contract pays it. There is no recall.
- **Compliance.** Sanctions screening, KYC, tax treatment, and who may be paid.
- **A hostile chain or token issuer.** Reorgs are not a concern because Arc finality is
  deterministic, but a halted chain or a frozen payer account stops payments and nothing
  here can change that.
- **Malicious browser extensions and a compromised operating system.**
- **A paid third-party audit.** Not done.

## 4. Threats and controls

### Contract

#### C1: spending someone else's USDC, and approval abuse

- Threat: a caller makes `PayoutBatch` move another account's USDC, or a leftover allowance
  is used by someone else.
- Control: `payBatch` only calls `safeTransferFrom(msg.sender, payee, amount)`, so it can
  only spend the allowance of the account that calls it. The allow-list and the used-ref
  set are keyed by `msg.sender`, and the tests `test_allowListIsPerPayer` and
  `test_differentPayersCanReuseRef` cover that separation. The contract has no owner and
  no function that takes an address to spend from.
- The first batch approved exactly the batch total in the same transaction through
  `Multicall3From` and left an allowance of 0 afterwards (checked and recorded in
  [mainnet.md](deployments/mainnet.md)).
- Status: **in place** for the contract. **Designed** for the app (approve the exact total
  in the same transaction, never an unlimited allowance).
- Residual: an unlimited approval to `PayoutBatch` would still only be usable by the payer
  themselves, but it would be a standing permission on a contract that cannot be upgraded
  or paused. The app must not ask for it.

#### C2: reentrancy and hostile tokens

- Threat: a token callback re-enters `payBatch` mid-batch.
- Control: `nonReentrant`, and each `invoiceRef` is marked used before its transfer.
  `test_reentrancy` runs a malicious token against the guard and expects the revert. The
  token is an `immutable` set at construction, and `USDC()` on mainnet returns
  `0x3600000000000000000000000000000000000000`.
- Status: **in place.**
- Residual: the guard protects against the token calling back, not against the token
  itself misbehaving. The token is the Arc USDC interface, so the trust is in Circle.

#### C3: oversized batches

- Threat: a batch so large that it runs out of gas, or a quadratic duplicate scan that
  makes a large batch fail late.
- Control: `MAX_LINES = 200` and the `BatchTooLarge` error. The block gas limit at the head
  of the chain on 2026-10-19 was 30,000,000. Scaling the 524,474 gas of the 6-line batch
  linearly gives about 17.5 million for 200 lines, which is an estimate, not a measurement,
  and it ignores the quadratic scan.
- Status: **partial.** The cap is in the deployed contract (`MAX_LINES()` returns 200 on
  mainnet). **No test in `contracts/test/` mentions `MAX_LINES` or `BatchTooLarge`**, and a
  200-line batch has never been run or simulated.
- Residual: a failed oversized batch reverts as a whole and costs the payer the gas. No
  funds move. Until a 200-line simulation exists, treat 200 as an upper limit and not as a
  tested size.

#### C4: USDC stuck in the contract

- Threat: someone sends USDC to the contract address and it can never leave.
- Control: the contract is built to hold nothing. It has no `receive`, no `fallback`, and no
  payable function, and `test_noNativeValuePath` checks that a bare send and a payable call
  both fail. The contract balance on 2026-10-19 is 0.
- Status: **in place** for the intended flow. **Gap** for forced sends.
- Residual: an ERC-20 transfer does not call the recipient, so nothing in the contract can
  refuse one, and Arc documents that a self-destructing contract can move its USDC to a
  beneficiary. I did not try either (no transactions). Whatever lands there has no
  withdrawal function. The monitoring check reports a nonzero contract balance. The loss is
  limited to what the sender chose to send.

#### C5: no owner, no pause, no upgrade, and no paid audit

- Threat: a bug in the deployed contract cannot be patched.
- Control: the surface is small (about 200 lines, no admin functions), the tests pass (22 on
  record), and Arc Studio ran its Solidity and functional auditors and Slither. The findings
  and decisions are in [payout-batch.md](contracts/payout-batch.md). Studio says its review
  is not a substitute for a paid audit before real funds.
- The deployed runtime code was compared with the local build (same length, differing only
  in the constructor-filled `USDC` immutable). The source is **not verified on the explorer
  yet** because the explorer blocks command line clients; the manual steps are in
  [mainnet.md](deployments/mainnet.md).
- Status: **partial.** No paid audit, no explorer verification.
- Residual: the contract is immutable and unaudited by a third party. The fix for a bug is
  a new deployment, a new allow-list, and a fresh set of used refs. Keep balances and
  allowances small until that changes.

### The payer key

#### K1: key compromise

- Threat: an attacker obtains the payer key.
- Control: nothing in the contract or the rebuild can reduce this. The payer is an ordinary
  account (no contract code at the address), with no multisig and no spending limit. The contract has no owner, so
  the deployer key has no extra power over the contract or over other payers.
- Status: **gap** by design.
- Residual: the attacker can empty the account and call `addPayee` then `payBatch` for
  anything. The watcher raises an alert when the payer's transaction count changes or the
  allow-list events change from the record ([monitoring.md](monitoring.md)), which shortens
  the time to notice, not the damage. Keep only what the next batch needs in the account.

#### K2: key exposure during command line use

- Threat: the key leaks through process arguments or shell history.
- Control: the spike deploy read the key from the macOS Keychain into a shell variable,
  passed it with `--private-key`, masked the output, and unset the variable
  ([arc-studio-path.md](spikes/arc-studio-path.md)). The record states the key is briefly
  visible in the process arguments of that machine and recommends a keystore (`--account`).
  [mainnet.md](deployments/mainnet.md) does not record how the key was supplied for the three
  later transactions.
- Status: **partial.** The record says the key was never written to a file.
- Residual: another process on the same machine could read the key during those seconds.
  Use a keystore on any shared machine, and none of this applies once the wallet signs in
  the app.

#### K3: signing the wrong thing in the app

- Threat: a lookalike site or a tampered page shows the payer one batch and asks the wallet
  to sign another, or asks for an approval to a different spender.
- Control: designed. The app builds the batch, simulates it with `eth_call`, and the wallet
  shows the transaction. The contract address and chain id 5042 are meant to be fixed in
  the build. Today the scaffold `src/config.ts` is configured for Arc testnet (and mainnet
  Ethereum for ENS), so the mainnet address is not wired in anywhere in the app.
- Status: **designed.** No domain, host, or security headers exist yet.
- Residual: a wallet confirmation screen is the last line of defense, and many payers click
  through it. When the app is deployed, set a content security policy and frame-ancestors
  to none, and publish the domain and the contract address in the README so a payer can
  compare them.

### The allow-list

#### A1: allow-list misuse

- Threat: a payee address enters the allow-list that the payer did not mean to allow, or a
  stale one stays.
- What the allow-list is: a per-payer guard against a wrong or swapped address in a CSV.
  Every payee must be added first with `addPayee` or `addPayees`, and `payBatch` reverts
  with `PayeeNotAllowed` for anyone else. It is not authorization against the key holder,
  because the same account edits it.
- Control: the allow-list cannot be edited by anyone but its payer
  (`test_allowListIsPerPayer`), removal works (`test_removePayeeBlocksPayment`), and both
  directions emit events. The first batch used a separate `addPayees` transaction before the
  batch. The plan is to keep that as its own step in the app with its own review.
- Status: **in place** (contract), **designed** (separate review step).
- Residual:
  - If the attacker changes the CSV and also gets the payer to approve the new address in
    the allow-list step, nothing stops the payment. See [F1](#f1-payee-address-substitution).
  - Entries never expire. A former contractor or a payee who lost their key stays allowed
    until the payer calls `removePayee`.
  - `PayeeAdded` is public before the payment, so the intended payees are visible ahead of
    the batch.

### Duplicate references

#### D1: the same invoice paid twice

- Threat: the same invoice is paid in two batches.
- Control: `payBatch` rejects a ref that was used before by that payer, and a ref that
  appears twice in one batch (`test_revert_DuplicateRef_AcrossBatches`,
  `test_revert_DuplicateRef_WithinBatch`, `testFuzz_noRefReuse`). The batch is atomic, so
  one bad ref reverts the whole batch (`test_atomicity`).
- Status: **in place**, for identical refs.
- Residual: the ref is `keccak256(invoiceId ++ salt)`. If the same invoice is entered again
  with a different salt, the ref is different and the contract pays it. The guard is only as
  strong as the payer's discipline in keeping one stable salt per invoice. The rebuild
  cannot detect it either, because it only joins refs.

#### D2: the ref is not bound to the payee or the amount

- Threat: a tampered CSV keeps the ref and changes the payee or amount.
- Control: the contract checks that the payee is allow-listed, that the ref is unused, and
  that the lines sum to `expectedTotal`. It does not tie a ref to a payee or an amount.
  The rebuild matches local invoices to chain lines by ref only: the local invoice record
  has no payee or amount field to compare (`LocalInvoice` is `invoiceId` plus `salt` or
  `invoiceRef`).
- Status: **gap.** The pre-send review and simulation in the app are the only check, and
  they are not built.
- Residual: after a payment, the tie-out proves that the money matches the ledger, not that
  each line matches the payer's intent. Adding payee and amount to the join is a follow-up
  for the app issues.

#### D3: a used ref cannot be reused, and refs are not global

- A ref marked used stays used. If a payment went to the wrong allowed payee, the corrected
  payment needs a new invoice ID or salt. This costs time, not money.
- Refs are scoped to the payer, so two payers can use the same ref
  (`test_differentPayersCanReuseRef`). A ledger that ignores the payer would confuse them.
  The rebuild checks `BatchPaid.payer` against the requested payer and throws on a
  mismatch.
- Nobody can use up another payer's refs, because the used-ref map is keyed by `msg.sender`.
- Status: **in place.**

### Privacy: the CSV, the invoice reference, and the salt

#### P1: what is public on chain

| Public on Arc | Not on chain |
| --- | --- |
| Payer address | Invoice ID (`INV-0001`) |
| Every payee address | Salt |
| Every amount | Cost center and any other CSV column |
| Block and time of each batch | Anything about what the payment was for |
| Batch id and line index | |
| The `invoiceRef` of every line (`bytes32`) | |
| Allow-list adds and removes (`PayeeAdded`, `PayeeRemoved`) | |
| The fee paid | |

Anyone can see that a given payer paid a given address a given amount. The model hides the
invoice behind the reference, nothing more. Payees' addresses also link their other on-chain
activity to this payer.

#### P2: salt handling

- The ref is `keccak256(bytes(invoiceId) ++ salt)` with a 32-byte random salt
  (`src/ledger/ref.ts`). Without the salt, a ref cannot be linked to an invoice ID, even
  though invoice IDs are guessable. The first batch's salt is kept in the local Keychain and
  was never committed. A search of the repo finds no salt value: the fixtures hold refs, not
  salts.
- If a salt leaks, an attacker can test candidate IDs (`INV-0001`, `INV-0002`, and so on)
  against every ref made with that salt in a few hash operations. A payee who is given a
  salt for their own invoice learns every other invoice that shares it.
- The choice that decides the damage is one salt per invoice or one per batch. Per invoice
  limits a leak to one invoice, but the duplicate guard in [D1](#d1-the-same-invoice-paid-twice)
  then needs that salt to be kept and reused. [mainnet.md](deployments/mainnet.md) does not
  record which was used for the demo batch.
- Status: **designed.** The app must pick one and store the salt where the payer keeps the
  invoice record.
- Residual: the salt is a secret the payer must back up. If it is lost, the rebuild can
  still join by the ref in the CSV, but the payer cannot re-derive refs from invoice IDs.

#### P3: the CSV and what the page does with it

- Threat: the invoice list leaves the browser.
- Control: designed. The CSV is read in the browser and held in memory, with no backend to
  send it to. The CSV in `fixtures/` is demo data.
- Found while reading the code: the Studio scaffold imports `src/tracing.ts` and
  `src/console-capture.ts` from `src/main.tsx`. They patch `fetch`, `window.ethereum.request`,
  and `console`, and post the RPC parameters, HTTP request bodies, and console lines to
  `window.parent`, using the origin of the embedding page when there is one. When the page
  is the top-level window, that target is the page itself. If another site frames the
  deployed app, it would receive them. I read this code and did not run it in a browser.
- Status: **gap** until the app removes those two imports from the production build or
  gates them on the Studio preview.
- Residual: until then, do not log CSV rows or salts, and do not deploy the scaffold
  instrumentation to the public site.

### The read-only rebuild

#### R1: what the rebuild can and cannot claim

- It signs nothing. `src/ledger/` and `scripts/rebuild-ledger.ts` create only a public
  client, and a search for `sendTransaction`, `writeContract`, wallet clients, and key
  helpers in them finds nothing.
- It counts only `InvoicePaid` events, never `Transfer` logs, so the duplicate 18-decimal
  Arc transfer logs cannot double the payouts. The fixture tests cover a real receipt with
  those logs.
- It checks that `BatchPaid.payer` equals the payer and that the line count and total equal
  the `InvoicePaid` logs, then ties the ledger to the payer's native balance change, exactly,
  in 18 decimals.
- Status: **in place.** Measured on the first batch: 6 of 6 refs matched, difference 0 wei
  ([metrics.md](metrics.md)).
- Limits, from reading `rebuild.ts`:
  - If the `BatchPaid` log is missing from the response, the count and total checks are
    skipped. The tie-out against the balance is what would catch a dropped line.
  - If the payer sent more than one transaction in the batch block, the balance delta can
    include the other transaction. The rebuild adds a warning and does not fail.
  - The join is by ref only (see [D2](#d2-the-ref-is-not-bound-to-the-payee-or-the-amount)).
  - The tie-out compares data from the same RPC, so it is a consistency check and not
    independent proof (see [N1](#n1-the-rpc-returns-wrong-or-stale-data)).

### RPC trust

#### N1: the RPC returns wrong or stale data

- Threat: the endpoint serves false logs, receipts, balances, or `eth_call` results. The
  simulation passes and the real transaction does something else, or the rebuild shows a
  payment that did not happen.
- Control: the contract and the chain decide what executes, not the RPC. A false simulation
  can make a payer send a batch that then reverts and costs gas, and a payer who signs a
  transaction in a wallet signs exactly that transaction. For reads, a fabricated but
  self-consistent set of logs, receipt, and balances would pass the tie-out.
- The rebuild accepts another endpoint with `RPC_URL`. On 2026-10-19 the same command
  against Circle's endpoint and against the Blockdaemon, dRPC, and QuickNode endpoints that Arc lists
  gave the same result: 6 of 6 matched, difference 0 wei. A payer who wants more than
  one source can run it twice.
- Status: **partial.** The cross-check works by hand. The app has no second source yet.
- Residual: a single lying endpoint is detectable only if a second one is consulted. Arc's
  own docs say the public endpoint is load-balanced across backends at slightly different
  heights, so a request can briefly see older state (error `-32014` when a backend has not
  imported a block).

#### N2: the RPC is down or rate limited

- Threat: reads fail, so the rebuild or the monitor goes blind, or the payer cannot
  simulate.
- Observed: the public endpoint answered `-32005 rate limit exceeded` when I paged
  `eth_getLogs` through six ranges without a pause. `eth_getLogs` allows at most 10,000
  blocks per call.
- Control: paging with a pause and retries is in `scripts/check-mainnet.sh`. The rebuild
  pages by block range already.
- Status: **partial.** An outage stops reads, not funds. The app needs a fallback endpoint.
- Residual: during an outage the payer should not send a batch they could not simulate.

### People: payees and phishing

#### F1: payee address substitution

- Threat: someone asks the payer's team to pay a "new wallet address" for a real payee, the
  classic invoice-fraud pattern, or alters a CSV on the way.
- Control: the allow-list forces an explicit step for any new address, so a changed CSV
  cannot pay an unknown address by itself (`PayeeNotAllowed`). Nothing enforces that the
  address is checked with the payee by another channel.
- Status: **partial.**
- Residual: the weak point is the human who approves the allow-list entry. Confirm new
  addresses with the payee out of band, and show the full address, not a shortened one.

#### F2: address poisoning

- Threat: an attacker sends tiny transfers from an address that looks like a real payee, so
  the lookalike shows in the payer's history and is copied by mistake.
- Control: none in the contract. Designed for the app: compare the full address against the
  allow-list and the payee record, never against a shortened form or the wallet history.
- Status: **gap.**
- Residual: the same as F1.

#### F3: phishing of payees

- Threat: a fake "your payment is ready, connect your wallet to claim" message to payees.
- Control: the design pushes the USDC straight to the payee's address. Payees never sign,
  claim, or connect to anything, so any message that asks them to is not from this system.
  The README and the app should say that in one sentence.
- Status: **designed** (the payment flow), **gap** (the notice to payees does not exist).
- Residual: Conciliado cannot stop someone else from sending payees fake messages. It can
  only make the real flow one that never asks them for anything.

### The USDC blocklist

#### B1: a blocklisted payee reverts the whole batch

- Threat: one payee address is blocklisted by the token issuer, so its transfer reverts and
  the entire batch reverts, blocking everyone else in it.
- What Arc documents: a value transfer to or from a blocklisted address reverts, and an
  included transaction that reverts on a blocklist check still consumes gas. One page of
  the docs also says such reverts leave no receipt. I have not reproduced this (no
  transactions).
- Control: the batch is atomic, so no partial payment exists. The app is designed to simulate
  first and show the revert reason before anything is sent; the payer then fixes the CSV and
  rebuilds the batch. Whether `eth_call` reproduces a blocklist revert is expected, not
  verified.
- The USDC interface answers `isBlacklisted(address)` for the payer and the six payees with
  `false`. I have not seen it return `true`, so I cannot say it matches the blocklist the
  runtime enforces.
- Status: **partial.**
- Residual: a payee can be blocklisted after being allow-listed. Each retry of a doomed
  batch can cost gas. The contract cannot skip a line.

#### B2: the payer itself is blocklisted

- Every transaction from that account would fail. Nothing in this project can change that.
  I do not know whether such a failed transaction advances the account's transaction count or
  leaves a receipt, so the monitor cannot be relied on to see it; the payer sees it when the
  send fails.
- Status: **gap**, accepted as out of scope.

### Build pipeline

#### S1: how the code got here

- The contract, the tests, the app scaffold, and the ledger code were written in Arc Studio
  and pulled into the repo with `arc-studio pull`, and no Studio-authored file was edited by
  hand ([payout-batch.md](contracts/payout-batch.md)). The mainnet contract is the pulled file,
  deployed unchanged.
- Dependencies are installed with `bun install --frozen-lockfile`. The scaffold lists several
  Circle SDK packages that nothing in `src/` imports, and one script imports a package that
  is not on the public registry ([#27](https://github.com/salazarsebas/conciliado/issues/27)).
  Unused dependencies are surface that does not need to be there.
- Status: **partial.**
- Residual: a bad version of a dependency would reach the browser bundle. Pin versions with
  the lockfile, remove the unused packages when the app is built, and review lockfile changes.

## 5. Residual risk, in plain words

1. The payer key is a single point of failure for the payer's USDC. Keep the balance small.
2. The contract is immutable, has had only an automated Studio review, and its source is
   not verified on the explorer. Treat it as unaudited.
3. Duplicate protection depends on one stable salt per invoice, and the ref is not tied to
   the payee or amount. A careless CSV can pay the same invoice twice or pay the wrong
   amount, and the tie-out would still show 0.
4. The privacy is thin by design. Payees and amounts are public, and a leaked salt exposes
   the invoice IDs that used it.
5. One blocklisted payee stops a whole batch.
6. Reads depend on one public RPC. A second endpoint is a manual check today.
7. The app, which holds most of the planned controls, does not exist yet.

## 6. Open items

| Item | Where it goes |
| --- | --- |
| `threat-modeler` review and sign-off | Pending, before the public flip |
| Test for `MAX_LINES` and a 200-line simulation | Contract or app follow-up |
| Join local invoices to chain lines by payee and amount, not ref alone | App follow-up |
| Choose one salt per invoice or per batch, and store it | App (#12 to #15) |
| Remove or gate `tracing.ts` and `console-capture.ts` in the production build | App (#12 to #15) |
| Fixed mainnet chain id and contract address, CSP, frame-ancestors none | App deploy |
| Explorer source verification | Manual step in [mainnet.md](deployments/mainnet.md) |
| Paid third-party audit | Not scheduled |

## 7. Facts checked for this document (2026-10-19)

Read-only, against `https://rpc.mainnet.arc.io`: chain id 5042; `MAX_LINES()` returns 200;
contract balance 0; payer balance 5753190523000000000 wei; payer transaction count 4; the
contract's 13 logs since deploy are 6 `PayeeAdded`, 6 `InvoicePaid`, and 1 `BatchPaid`;
`isBlacklisted(address)` returns `false` for the payer and six payees; head block gas limit
30,000,000. Re-run them with `bash scripts/check-mainnet.sh`.
