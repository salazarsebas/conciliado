# Submission package

Judges rarely clone the repo first. They watch the video and read the submission
page, often with twenty other entries open. The package is the product's first
impression, so it has its own bar. `pitch-reviewer` checks it before the public flip.

## Demo video

- Under two minutes unless the event sets another limit. Their limit wins.
- **First fifteen seconds: the hook.** The moment from the card (`hook` on the record),
  shown, not described. No logo intro, no team slide, no "hi, we are".
- Then the before/after from the card: the messy input, the one action, the clean
  output, on the live deploy, in real time or with a visible cut marker.
- One line on why this tech: the property doing the work, said in the judges' words.
- Close on the proof metric and the live URL on screen.
- Captions or on-screen text for every claim. Judges often watch muted.
- Record the deployed product, never localhost. Re-record if the deploy changed.
- No claim the product does not do on that screen. Nothing "coming soon" in the
  first ninety seconds.

## Script

Write `docs/demo-script.md` before recording: timestamps, what is on screen, what is
said. The E2E test on the demo path walks the same steps, so the video cannot show a
flow the tests do not cover.

## Submission write-up

Fill every field the form asks for. For free text, use this order:

1. **One sentence.** The card's `idea_one_liner`.
2. **The problem**, with the cited pain: the quote and the link.
3. **What it does**: the before/after in three sentences.
4. **How it maps to the judging**: one short paragraph per scorecard axis, in the
   event's own words, each naming the artifact that proves it (the video timestamp,
   the test, the live URL, the metric).
5. **How it works**: the tech's property and the failure mode it handles, then one
   inline diagram from `docs/diagrams/`.
6. **Proof**: the metric, and how to reproduce it.
7. **Links**: live URL, public repo, video. Nothing else.
8. **What is next**: two lines at most. Only real, scoped next steps.

Bounties stacked from one submission each get a paragraph that answers that sponsor's
ask in their words. A generic paragraph pasted under every bounty reads as a template.

## Hard limits

- Public evidence only. No private pack URL, no third-party pack repository on the do-not-cite list, no internal
  repo. Run `check-output.sh` from the profile repo on the write-up when it is available.
- No invented numbers. Every metric in the write-up appears in the repo or the video.
- No placement, prize, or partner claim that the event has not published.
- English unless the event asks otherwise.
