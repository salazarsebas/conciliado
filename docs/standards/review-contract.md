# Review contract

Every reviewer subagent returns **only** this shape. No preamble, no praise.

## Where to read standards

Use the first directory that exists:

1. `systems/standards/` (this profile repo)
2. `docs/standards/` (a submission repo)

If neither exists, `Verdict: fail` and `[fail] .: standards directory missing`. Do not
invent checks.

```
## Verdict
pass | pass-with-warns | fail

## Findings
- [fail] <path or URL>: <evidence in one line>
- [warn] <path or URL>: <evidence in one line>
- [pass] <what was actually checked>

## Next
One concrete fix, or "none".
```

`fail` means the parent must not ship or must not pick that idea.
Empty findings is itself a `fail` (the reviewer did not look).
