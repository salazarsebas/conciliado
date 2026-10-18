# Diagrams

Every judged project ships professional architecture diagrams. Source of truth is
Python + Graphviz. Each diagram also has a Markdown/Mermaid twin so agents can read
it without opening an image.

Copy `systems/standards/diagrams/generator/` into the project as
`diagrams/generator/`. Do not attribute this kit to another product.

## Stack

- Python 3, `graphviz` package, Graphviz binaries (`dot`)
- Shared style: `diagrams/generator/_style.py`
- One script per diagram, numbered (`01-system-architecture.py`, …)
- `render-all.py` writes SVG and PNG to `docs/diagrams/output/`
- Twin file: `docs/diagrams/<name>.md` with title, short prose, and a Mermaid graph
  that matches the Python diagram

## Required diagrams (minimum)

1. System architecture (trust boundaries, client, backend, chain, externals)
2. Happy-path data / signing / request flow for the demo
3. Deploy split: which boxes are mainnet, testnet, or off-chain

Add state machines, fallbacks, and protocol flows when the product has them.

## Style rules

- Transparent background, Helvetica, slate text, rounded filled nodes
- Color by role: client/blue, backend/green, external/purple, decision/amber,
  success/emerald, danger/red
- HTML labels via `hl(title, subtitle, subtitle2)`
- Clusters for trust boundaries
- No screenshots of a whiteboard. No hand-drawn boxes in Excalidraw as the
  official diagram (scratch is fine; ship Graphviz)

## Agent twin

The `.md` twin is not a caption. It must name every node and edge an agent needs
to reconstruct the architecture. If Graphviz and Mermaid disagree, fix both.
