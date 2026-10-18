# AGENTS.md

How an agent should work in this submission repo.

1. Read the README. Use the live URL. Do not assume local-only.
2. Demo path: follow `docs/demo-script.md` if present, else the README demo section.
3. Tests: unit, functional, E2E for the demo path. The demo path without E2E is not done.
4. Diagrams: Graphviz under `diagrams/generator/`, Markdown twins under `docs/diagrams/`.
5. Deploy split is documented in the README (mainnet / testnet / off-chain).
6. Ship standards live in `docs/standards/`. Auditors load from there.
7. Ship auditors (`ship-auditor`, `deploy-auditor`, `agent-ready-auditor`,
   `threat-modeler`, `design-auditor`, `pitch-reviewer`) exist as matching subagents in both
   `.claude/agents/` and `.grok/agents/`. Run the set that matches the
   harness you are in; both read the same standards.
8. Do not commit secrets. Do not cite private pack URLs.
9. Issue work is driven from the profile repo with `/working-hack` (Grok:
   the `working-hack` skill), not from a copy of that command in this repo.
   It picks every unblocked open issue, starts at once, and runs one
   `issue-worker` per issue in parallel across independent lanes, each on
   its own branch and pull request. `--plan` stops for approval.
10. The countdown dates on the event record rule every turn: after
   `feature_freeze`, no new behavior. The video and write-up follow
   `docs/standards/submission.md`.

Brand, threat model, monitoring, metrics, and performance docs live under `docs/`.
