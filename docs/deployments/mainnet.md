# Arc mainnet deployment

Issue: #8. Run on 2026-10-19 (UTC) against Arc mainnet, chain 5042, RPC
`https://rpc.mainnet.arc.io`, explorer https://explorer.arc.io.

`PayoutBatch` was deployed from `contracts/PayoutBatch.sol` on `main`, unchanged from the
Studio pull, with Arc Foundry (`arc-forge` forge 1.7.1-dev), constructor argument USDC
`0x3600000000000000000000000000000000000000`. The tests pass first (`arc-forge test`: 22
passed, 0 failed). Then one batch of 6 invoice lines was paid on mainnet.

## Contract

| Item | Value |
| --- | --- |
| `PayoutBatch` | [`0xC86e2241166785344E4d6692E4D2A3D4c8466d0e`](https://explorer.arc.io/address/0xC86e2241166785344E4d6692E4D2A3D4c8466d0e) |
| Deploy tx | [`0xc7d5cba3e626bb8c4449075cb712b58a558928d2f5ce28e0b9d1119841ff800f`](https://explorer.arc.io/tx/0xc7d5cba3e626bb8c4449075cb712b58a558928d2f5ce28e0b9d1119841ff800f) |
| Deploy block | 26689148 (gas used 702091, effective gas price 21 gwei) |
| Deployer and payer | [`0x429Fd794Ed2166c0F6fFef39fA6A1F580Ba64364`](https://explorer.arc.io/address/0x429Fd794Ed2166c0F6fFef39fA6A1F580Ba64364) |
| Constructor argument | USDC ERC-20 interface `0x3600000000000000000000000000000000000000` |
| Gas settings | `--gas-price 25gwei --priority-gas-price 1gwei` (above the 20 gwei floor) |

Checks that the deployed code is the repository code: `USDC()` returns the constructor
argument, `MAX_LINES()` returns 200, and the runtime bytecode from `arc-cast code` has the
same length as the `deployedBytecode` of the local `arc-forge` artifact and differs only
in the four hex digits of the `USDC` immutable that the constructor fills in.

## Source verification

Status: **not verified on explorer.arc.io yet.**

`arc-forge verify-contract` with the Blockscout verifier against
`https://explorer.arc.io/api/` was run and failed: the explorer answers command line
clients with a Cloudflare "Just a moment" challenge page (HTTP 403) instead of the
Blockscout API, so the CLI cannot read or submit anything. No way around the challenge was
attempted.

To finish it by hand, use the explorer's contract verification page for this address
with these inputs, which match the deployed build:

- Method: Solidity (standard JSON input).
- Compiler: `v0.8.28+commit.7893614a`, EVM version `paris`, optimizer enabled, 200 runs.
- Standard JSON input: [`payout-batch-standard-input.json`](payout-batch-standard-input.json)
  (generated with `arc-forge verify-contract ... --show-standard-json-input`).
- Constructor arguments (ABI encoded):
  `0x0000000000000000000000003600000000000000000000000000000000000000`.

## Payees

Six fresh wallets made with `arc-cast wallet new`. Their private keys are only in the
local macOS Keychain, never in this repository. They hold payout USDC only and sent no
transaction.

| # | Payee |
| --- | --- |
| 1 | [`0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571`](https://explorer.arc.io/address/0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571) |
| 2 | [`0x5eb1f8E7b85938E2eB71a1a0A0c71c9155B79F07`](https://explorer.arc.io/address/0x5eb1f8E7b85938E2eB71a1a0A0c71c9155B79F07) |
| 3 | [`0x46DC111108143D53A119927f0CD60f463F2671d0`](https://explorer.arc.io/address/0x46DC111108143D53A119927f0CD60f463F2671d0) |
| 4 | [`0xF80060bDA0F08b9D9000c138e44eAdeD4BAEFA97`](https://explorer.arc.io/address/0xF80060bDA0F08b9D9000c138e44eAdeD4BAEFA97) |
| 5 | [`0x361fceB4632D9215a4B0b7f7b9288308312f7A4A`](https://explorer.arc.io/address/0x361fceB4632D9215a4B0b7f7b9288308312f7A4A) |
| 6 | [`0xdA131CBb1cbB8AF35FFCd9B8D3bC065CF630932C`](https://explorer.arc.io/address/0xdA131CBb1cbB8AF35FFCd9B8D3bC065CF630932C) |

## Transactions

| Step | Tx | Block | Gas used | Fee (USDC) |
| --- | --- | --- | --- | --- |
| Deploy `PayoutBatch` | [`0xc7d5cba3...ff800f`](https://explorer.arc.io/tx/0xc7d5cba3e626bb8c4449075cb712b58a558928d2f5ce28e0b9d1119841ff800f) | 26689148 | 702091 | 0.014743911 |
| `addPayees` (6 payees) | [`0x8d8652df...f89f36`](https://explorer.arc.io/tx/0x8d8652df005fe8cbfccb79afa8ed750c56be365dcd6e58fcdb87f3aaf7f89f36) | 26689404 | 168663 | 0.003541923 |
| `approve` plus `payBatch` through `Multicall3From` | [`0x50d56ea9...100987056`](https://explorer.arc.io/tx/0x50d56ea910e0412c47a7dc186b5f89ccf7cbe71235db799379874d6100987056) | 26689516 | 524474 | 0.011013954 |

All three succeeded. Full hashes are in the links and in
[`fixtures/mainnet-batch-1.json`](../../fixtures/mainnet-batch-1.json).

The simulations described below were `eth_call` reads. They sent no transaction and cost
nothing. The payer sent exactly three transactions after the spike deploy.

### How the batch was sent

1. `addPayees(address[6])` from the payer, so every payee is on the payer's allow-list.
2. Simulation before spending: for each of the 6 lines, `isPayeeAllowed` and
   `isInvoiceRefUsed` were read, then a one-line `approve` plus `payBatch` was run as an
   `eth_call` through `Multicall3From.aggregate3` (6 of 6 succeeded). The full 6-line batch
   was simulated the same way and succeeded.
3. One transaction to `Multicall3From.aggregate3` with two subcalls, both with
   `allowFailure` false: `USDC.approve(PayoutBatch, 195000)` then
   `PayoutBatch.payBatch(lines, 195000)`. Multicall3From keeps the payer as `msg.sender`
   in both subcalls (the approval event and the `BatchPaid` event both name the payer), so
   no separate approval transaction was needed.

The `invoiceRef` of each line is `keccak256(bytes(invoiceId) ++ salt)`, where `salt` is 32
random bytes kept in the local Keychain and never committed. Only the resulting refs are
on chain and in the fixtures. The `invoiceId` values are demo IDs `INV-0001` to
`INV-0006`.

### Batch lines

Amounts are raw USDC units (6 decimals). Batch id 1, 6 lines, total 195000 (0.195 USDC).

| Invoice | Payee | Amount (USDC) | `invoiceRef` |
| --- | --- | --- | --- |
| INV-0001 | `0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571` | 0.020000 | `0x480f1d091980e77bfd5476fefacccaf148fd2eda7228cb643226eb5e0948b6db` |
| INV-0002 | `0x5eb1f8E7b85938E2eB71a1a0A0c71c9155B79F07` | 0.025000 | `0x877fa72df36ad606e17c95f4810e171ccf89f2388e4904aaa43ca7885c49a9bd` |
| INV-0003 | `0x46DC111108143D53A119927f0CD60f463F2671d0` | 0.030000 | `0x81c573e0a1e3c4ee65db10d9472f4127c084f794c539350958bc9e8470724762` |
| INV-0004 | `0xF80060bDA0F08b9D9000c138e44eAdeD4BAEFA97` | 0.035000 | `0x09877960442bd25d36f9b8490678413a808abeb7a3b38f87cbff55acac2a4f71` |
| INV-0005 | `0x361fceB4632D9215a4B0b7f7b9288308312f7A4A` | 0.040000 | `0x1b30e5e92b78f8c6a336beacda678c84b606c8bdc756a9f217fdb68bd0f7d053` |
| INV-0006 | `0xdA131CBb1cbB8AF35FFCd9B8D3bC065CF630932C` | 0.045000 | `0xc0d92519e0006e0ed36a0f1270f24d2ac732a46f1edc7fd5a40365efe0bf03bb` |

The six `invoiceRef` values in the `InvoicePaid` logs equal the six in
[`fixtures/mainnet-batch-1.csv`](../../fixtures/mainnet-batch-1.csv) (checked with a diff).
After the batch each payee holds exactly its amount, the contract holds 0 USDC, and the
leftover allowance is 0.

## Tie-out

Payer balance read at block 26689515 (before) and block 26689516 (the batch block).

| Unit | Before | After | Delta |
| --- | --- | --- | --- |
| Native, 18 decimals (wei) | 5959204477000000000 | 5753190523000000000 | 206013954000000000 |
| USDC ERC-20, 6 decimals | 5959204 | 5753190 | 206014 |

Fee from the receipt: `gasUsed` 524474 times `effectiveGasPrice` 21000000000 =
11013954000000000 wei = 0.011013954 USDC.

- Exact, 18 decimals: payouts 195000 x 10^12 = 195000000000000000 plus fee
  11013954000000000 = 206013954000000000. Equal to the balance delta, difference
  **0 wei**.
- 6-decimal display: the fee rounds to nearest, half up, to 11014 units. Payouts 195000
  plus fee 11014 = 206014, equal to the ERC-20 balance delta, difference **0**.

Caveat: the ERC-20 `balanceOf` view truncates the 18-decimal balance to 6 decimals, so its
delta can be off by one unit from the exact delta (here the truncated parts, 0.477 and
0.523, happen to net out to the rounded fee). The 18-decimal comparison is the one that
holds to the unit by construction.

Receipt logs for the batch: 1 USDC `Approval`, 6 USDC `Transfer`, 6 `InvoicePaid`, 1
`BatchPaid`, plus 6 more `Transfer` logs from `0xfffffffffffffffffffffffffffffffffffffffe`
that carry the same payouts in 18 decimals. The ledger rebuild (#7) must count one of the
two transfer sets, not both.

## Total spent

| Item | USDC |
| --- | --- |
| Deploy | 0.014743911 |
| `addPayees` | 0.003541923 |
| Batch fee | 0.011013954 |
| Payouts to the 6 payees | 0.195000000 |
| **Total** | **0.224299788** |

The payer balance went from 5977490311000000000 wei (5.977490311 USDC) before the deploy to
5753190523000000000 wei after the batch, a difference of 224299788000000000 wei, which
equals the total above. The payouts are not lost: the six payee wallets hold them.
