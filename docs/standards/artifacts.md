# Project artifacts

Ship these in the submission repo. Paths are suggestions; keep them linked from the
README.

Brand book and design system are **per product**, written for that product, not
a copied skeleton. Tokens, voice, and components must match what the UI actually
ships. A file named `brand-book.md` that still says "Replace this example" is
not done.

## Always

| Artifact | Path | Notes |
|---|---|---|
| Brand book | `docs/brand-book.md` | Logo rules, color, type, voice, do/don't |
| Design system | `docs/design-system.md` | Tokens, spacing, components, states |
| Response times | `docs/performance.md` | p95 targets and how they were measured |
| Metrics page | live route + `docs/metrics.md` | What we measure, why, current numbers |
| Threat model | `docs/threat-model.md` | Assets, actors, threats, mitigations |
| Monitoring plan | `docs/monitoring.md` | Signals, alerts, who looks, demo failure |
| Architecture diagrams | `docs/diagrams/` | Graphviz output + Markdown twins |
| AGENTS.md | repo root | How an agent builds, tests, demos |
| llms.txt | site root | Pointers to Markdown docs |

## When it applies

| Artifact | When |
|---|---|
| Whitepaper | Novel mechanism, protocol, or cryptography. Not for a CRUD demo. |
| MCP / skill surface | The product is meant to be called by agents. |
| OpenAPI | There is an HTTP API. |
| Incident runbook | Anything that can lose funds or lock users. |

## Brand and design, even under a timebox

A default shadcn theme with no tokens and no brand book is unfinished. Define a
small system: palette, type scale, radius, one accent, empty/loading/error states,
and apply it. Mobile-first. 44px touch targets.

## Threat model shape

1. What we protect (keys, funds, PII, demo integrity)
2. Who we assume (user, operator, chain, host, judge)
3. What we do not protect (explicit non-goals)
4. Top threats and the control for each
5. Residual risk

## Monitoring plan shape

- SLOs that match the response-time doc
- Logs / traces / chain watchers
- What "demo is down" looks like and how to recover in five minutes
- If there is no on-call, say so and make the demo recoverable from the README
