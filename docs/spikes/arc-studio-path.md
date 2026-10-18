# Spike: Arc Studio to Arc mainnet path

Issue: #5. Run on 2026-10-18 with `arc-studio` 1.2.1 and Arc Foundry v0.8.0-2
(`arc-forge`, forge 1.7.1-dev). The contract is a throwaway `Counter`. No app code
for the product was written.

Result: the path works. Studio authored a contract and a test and deployed it to
Arc testnet. We pulled the source, ran the tests with Arc Foundry, and deployed the
pulled source unchanged to Arc mainnet (chain 5042).

## Evidence

| Item | Value |
| --- | --- |
| Studio project | https://studio.arc.io/app/0403fbb0-66d5-465d-b2b6-44b94a29301a |
| Testnet deploy (by Studio) | `0x90d8e858569ab90b5fcdecf07254cd51bf700f7a`, tx `0xc126c6fc080198b988ac06f146e30f437c52b82c8bd32f5b89433e29db8dfe17` |
| Testnet explorer | https://explorer.testnet.arc.io/address/0x90d8e858569ab90b5fcdecf07254cd51bf700f7a |
| Mainnet deploy (by us) | `0x76048774117B52D71b59A99996418997DEc374e9`, tx `0xfda2915de62b6547f51233baa24bcda441fb5049663688741bca7f4f82eee848` |
| Mainnet explorer | https://explorer.arc.io/tx/0xfda2915de62b6547f51233baa24bcda441fb5049663688741bca7f4f82eee848 |
| Mainnet address page | https://explorer.arc.io/address/0x76048774117B52D71b59A99996418997DEc374e9 |
| Deployer | `0x429Fd794Ed2166c0F6fFef39fA6A1F580Ba64364` |
| Mainnet block / gas used | 26618037 / 119509, status success |
| Mainnet cost | 0.00251 USDC (5.98 to 5.97749 USDC), effective gas price 21 gwei |

Checks that the deployed code is the pulled code:

- `sha256` of `contracts/Counter.sol` and `contracts/test/Counter.t.sol` is the same
  for the pulled copy and for `arc-studio cat` of the sandbox copy.
- The runtime bytecode on testnet, the runtime bytecode on mainnet, and the
  `deployedBytecode` in the local `arc-forge` artifact are identical (compared with
  `arc-cast code`).
- The mainnet transaction and address URLs and the testnet transaction URL return HTTP 200 (the pages render client side, so the status code
  proves the route exists, not the contents; the contents were checked with
  `arc-cast receipt`).

## Exact commands that worked

Work was done in a scratch directory outside the repository.

```bash
# 1. Register the Claude Code skill and subagent
arc-studio skills install --tool claude-code

# 2. One Studio turn: contract, test, run the test, deploy to testnet (2m13s)
arc-studio run --prompt-file prompt.txt --session conciliado-spike --output json > run1.json 2> run1.err

# 3. Inspect, then pull everything
arc-studio deployments --session conciliado-spike
arc-studio ls --session conciliado-spike
arc-studio pull --session conciliado-spike --out ./pulled

# 4. Install JS deps (OpenZeppelin is imported by Studio's helper scripts), run tests
cd pulled
bun install --frozen-lockfile
arc-forge test --force          # 5 passed, 0 failed

# 5. Mainnet deploy of the pulled source, unchanged
arc-forge create contracts/Counter.sol:Counter \
  --rpc-url https://rpc.mainnet.arc.io \
  --gas-price 25gwei --priority-gas-price 1gwei \
  --private-key "$K" --broadcast
```

The prompt used (about 540 characters, well under the 10,000 cap):

```text
Write a minimal Solidity contract named Counter in contracts/Counter.sol, about 20 lines: a public uint256 number, increment() that adds one and emits an Incremented(address indexed by, uint256 newNumber) event, and setNumber(uint256). Add a Foundry test file in the test directory using forge-std that covers increment, setNumber and the event, and run the tests with forge in the sandbox. Then deploy Counter to Arc testnet. Keep the app frontend minimal; do not build extra features.
```

Arc Foundry install (Apple Silicon, no Homebrew formula): download
`arc-foundry-v0.8.0-2-aarch64-apple-darwin.tar.gz` and its `.sha256` from
https://github.com/circlefin/arc-foundry/releases, check the hash, extract, and copy
`forge`, `cast`, `anvil` to `arc-forge`, `arc-cast`, `arc-anvil` on `PATH`. No fallback
to stock forge was needed. The release assets for macOS are Apple Silicon only.

### Mainnet key handling

The key was read from the macOS Keychain into a shell variable in the same command that
deployed (`K="$(security find-generic-password -s conciliado-arc-deployer -w)"`), passed to
`--private-key`, output was filtered through `sed` to mask it, and the variable was
unset afterwards. It was never written to a file. `forge create` did not read
`ETH_PRIVATE_KEY` from the environment, so the key is briefly visible in the process
arguments of the local machine. A keystore (`--account`) avoids that; use one for any
shared or CI machine.

## Project layout Studio generates

Studio creates a full Vite plus Foundry app, not just a contract:

```text
contracts/Counter.sol              the contract (17 lines)
contracts/test/Counter.t.sol       Foundry tests (5 tests, forge-std)
contracts/script/                  Create2Factory.sol, DeployCreate2.s.sol (boilerplate)
contracts/contract-metadata/       Counter.json (ABI and metadata)
foundry.toml                       src=contracts, test=contracts/test, solc 0.8.28, evm_version paris
remappings.txt                     forge-std and @openzeppelin/contracts
lib/forge-std/                     vendored by the pull
src/                               React app (App.tsx, config.ts, wagmi setup)
scripts/                           deploy:self, compass-deploy, fetch-abi, check.sh (bun/TypeScript)
package.json, bun.lock             package manager is bun (1.3.14); Foundry pinned to v1.7.1
AGENTS.md                          generated app notes, lists deployed contracts
.env                               exists in the sandbox, not pulled
```

Gaps and pitfalls seen:

- `pull` skips `.env` and `node_modules`. `arc-forge test` fails until `bun install`
  runs, because `contracts/script/Create2Factory.sol` imports
  `@openzeppelin/contracts` from `node_modules` and `forge test` compiles the
  scripts directory too.
- `foundry.toml` sets `evm_version = "paris"`. Arc targets Osaka, and the paris
  bytecode deployed fine. Keep it unless a feature needs a newer opcode.
- The generated `foundry.toml` has no Arc RPC entries (only Ethereum, Base, Arbitrum,
  Polygon, Optimism). Pass `--rpc-url` explicitly.
- `package.json` has no `build` script. `bunx vite build` works (6 seconds, outputs
  `dist/`).
- The generated frontend is wired to Arc testnet only (`arcTestnet` from `viem/chains`
  in `src/config.ts`). Pointing it at mainnet needs a chain config change by hand.
- `AGENTS.md` in the generated app says USDC has 6 decimals at
  `0x3600000000000000000000000000000000000000`. That is the ERC-20 interface. Native
  gas balance is 18 decimals (the deployer balance reads as `5980000000000000000`).
- `arc-studio pull` hit one Cloudflare 502 from `studio.arc.io` and printed an HTML
  page with exit code 0 and no files written. Check the output, retry.
- The `--output json` result has `budget: null` on a completed turn and `previewUrl:
  null`. The stderr stream (`run1.err`) carries a signed preview URL with a token. Do
  not paste stderr anywhere public.

## Questions from the issue

### Does Studio run tests itself?

Yes, when asked. In the turn, the agent loaded its contracts skill, noticed the word
"minimal" selects its `quick` preset (no audit, no Slither, unit tests skipped by the
preset), and ran tests anyway because the prompt asked for them, through a tester
subagent that compiled and ran `forge test`. The sandbox command text is redacted in the
event stream, so the only evidence from Studio is its own summary (5 tests passed). We
reproduced that independently with Arc Foundry on the pulled files: 5 passed, 0 failed.
Ask for tests explicitly in the prompt; do not assume a default preset writes them.

### What app framework does it generate?

React 18, Vite 6, TypeScript 7, Tailwind CSS 3, wagmi 2 with viem 2 and ConnectKit,
TanStack Query, bun as package manager, oxlint for lint, plus Circle SDKs
(app-kit, developer-controlled and user-controlled wallets, modular wallets, smart
contract platform) in `dependencies`. Contracts use Foundry with solc 0.8.28.

### How can the frontend be hosted?

- Inside Studio: a live preview that renders only inside the workspace
  (`webUrl`), served from `*.preview.studio.arc.io` with a short-lived token. Not a
  public link.
- Studio's own prompt after the turn: connect Netlify, Hugging Face, or Vercel from the
  workbench Integrations menu, then say "deploy this". Not tested in this spike.
- Anywhere that serves static files: the app is a client-only Vite build (`bunx vite
  build` produced `dist/` with no backend). Netlify, Vercel, Cloudflare Pages, GitHub
  Pages all fit. The wallet connect code needs no server.

## Credits, budget, and time

| Turn | Duration | Result |
| --- | --- | --- |
| 1: contract, test, test run, testnet deploy, minimal frontend | 2m13s wall clock | completed |

- The result document has no per-turn credit figure (`budget: null`). Studio exposes
  only a percentage of a usage limit through `arc-studio usage`.
- Before the turn: 0% of the 30-day limit used. After the turn: 3% of the daily limit
  used (`arc-studio usage --json` reports `percentUsed: 3`, `windowMs: 86400000`,
  `scope: user`). The reporting window changed between the two reads, so treat this as
  roughly 3% of a daily cap per small turn. A mainnet-grade turn with audit and a real
  app will cost more; check `arc-studio usage` between turns.
- The official docs say a contract deploy turn can take 5 to 20 minutes. This quick
  turn took 2m13s.

## Mainnet recipe

- Chain 5042, RPC `https://rpc.mainnet.arc.io`, explorer https://explorer.arc.io.
- Studio deploys to Arc testnet only, as the docs state. Mainnet is outside Studio: pull
  the source and deploy with `arc-forge create` (or `arc-forge script`). Studio's
  `compass-deploy` reference owns a separate mainnet path that was not exercised.
- Gas: the network gas price read 20.001 gwei. The mempool drops a `maxFeePerGas` below
  20 gwei, so use `--gas-price 25gwei --priority-gas-price 1gwei`. The transaction
  settled at an effective 21 gwei, 119509 gas, about 0.0025 USDC.
- Gas is paid in native USDC (18 decimals), so no other token is needed. Confirm the
  derived address before broadcasting: run `arc-forge create` without `--broadcast`
  first (a dry run), and compare `arc-cast wallet address --private-key "$K"`.
- Verify afterward with `arc-cast receipt <tx> --rpc-url https://rpc.mainnet.arc.io` and
  compare `arc-cast code <address>` with the artifact's `deployedBytecode`.

## Skills install

`arc-studio skills install --tool claude-code` ran without prompts. It added a
marketplace `arc-studio-cli` and installed plugin `arc-studio@arc-studio-cli` at user
scope, which writes under `~/.claude/plugins` (the plugin cache and
`installed_plugins.json`, `known_marketplaces.json`) and the user settings. It does not
touch the repository. Restart Claude Code to activate the skill and subagent. Other
agents use `arc-studio agent-guide`.

## Implications for the product

- The Studio to mainnet path is proven end to end, so the scorecard line "Arc Studio
  across contracts, testing, and app" can be met with real artifacts: Studio-authored
  source and tests, tests green under Arc Foundry, mainnet address and tx on
  explorer.arc.io.
- Prompt for tests explicitly and ask for the preset you want (`quick` skips audit).
- Budget a manual step to move the frontend from testnet to mainnet config.
- Plan for the pulled `lib/` and `node_modules` requirement in CI: run `bun install`
  before `arc-forge test`.
