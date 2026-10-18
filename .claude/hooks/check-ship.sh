#!/usr/bin/env bash
# Block Stop on a submission repo when the ship bar is obviously missing.
# Copy into the submission repo as .claude/hooks/check-ship.sh
set -euo pipefail
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$root"

reasons=()
if [[ ! -f README.md ]]; then
  reasons+=("README.md missing")
fi
if [[ -f README.md ]]; then
  live="$(grep -Eo 'https://[^ )]+' README.md | grep -vE 'github\.com|githubusercontent\.com|shields\.io|badgen\.net|star-history\.com' || true)"
  if [[ -z "$live" ]]; then
    reasons+=("README.md has no live deploy URL (github.com and badge links do not count)")
  fi
fi
if [[ ! -f AGENTS.md ]]; then
  reasons+=("AGENTS.md missing")
fi
if [[ ! -f docs/brand-book.md ]]; then
  reasons+=("docs/brand-book.md missing")
fi
if [[ ! -d docs/diagrams ]]; then
  reasons+=("docs/diagrams missing")
fi
if [[ ! -f docs/threat-model.md ]]; then
  reasons+=("docs/threat-model.md missing")
fi
if ! find . \( -path ./node_modules -o -path ./.git -o -path ./dist -o -path ./target \) -prune -o \
  \( -type d \( -name test -o -name tests -o -name e2e -o -name __tests__ \) -o -name '*.test.*' -o -name '*.spec.*' \) -print \
  2>/dev/null | grep -q .; then
  reasons+=("no test directory or test files found")
fi

if [[ ${#reasons[@]} -gt 0 ]]; then
  printf '{"decision":"block","reason":"Ship bar incomplete: %s. Read docs/standards/. Do not stop."}\n' "$(IFS='; '; echo "${reasons[*]}")"
  exit 0
fi
exit 0
