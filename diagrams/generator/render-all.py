"""Render every numbered diagram script to docs/diagrams/output/ (SVG + PNG).

Usage, from the project root: python diagrams/generator/render-all.py
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "docs" / "diagrams" / "output"
OUTPUT.mkdir(parents=True, exist_ok=True)

base = Path(__file__).parent
scripts = sorted(
    p.name for p in base.glob("*.py") if p.name[0].isdigit() and p.suffix == ".py"
)

errors = []
for script in scripts:
    result = subprocess.run(
        [sys.executable, str(base / script)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"\nfailed {script}\n{result.stderr}")
        errors.append(script)
    elif result.stdout:
        print(result.stdout.strip())

if errors:
    print(f"\n{len(errors)} script(s) failed: {errors}")
    sys.exit(1)

print(f"\nAll diagrams rendered -> {OUTPUT}")
