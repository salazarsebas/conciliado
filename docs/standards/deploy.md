# Deploy

Every judged submission has a live URL before the public flip. "Works on my machine" is
not a submission.

## Cost

Prefer free tiers. Paid is allowed only if it is very cheap (a few dollars for the
event window) and Sebastián agrees first. Do not stand up a bill that outlives the event
without asking.

Default menu (pick what fits; do not use all of them):

- Frontend: Cloudflare Pages, Vercel hobby, Netlify free, GitHub Pages
- Workers / edge: Cloudflare Workers
- App server: Railway hobby, Fly.io free/low, Render free
- Data: Turso, Neon free, Supabase free, Cloudflare D1/KV
- Objects: Cloudflare R2, Railway bucket
- Contracts: the chain's cheap testnet always; mainnet when extra credit is real and
  fees are acceptable

If a host needs a credit card, say so before deploying.

## Mainnet extra credit

Read the event rules for mainnet, testnet, and "deployed product" scoring.

Allowed architectures:

1. Full demo on testnet, production-shaped, with a documented mainnet path.
2. **Hybrid**: the proof that judges extra-credit (contract, registry, attestation,
   payment) on **mainnet**; indexer, heavy compute, or UI backends on testnet or a
   free host. State the split in the README and in the architecture diagram.
3. Full mainnet when fees are negligible (Stellar-class) and the demo cannot brick
  funds.

Do not fake mainnet. A screenshot of a testnet explorer labeled "mainnet" is a kill.

## Required in the README

- Live URL
- Network names (mainnet / testnet) per component
- Contract IDs or account IDs if any
- One-command local run
- How to reset demo state

## Response times

State p95 targets for the demo path (page load, API, chain confirm). Measure them.
Put the numbers on the metrics page. If you cannot measure, the target is fiction:
cut it or add instrumentation.
