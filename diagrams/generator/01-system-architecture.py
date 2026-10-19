"""System architecture of Conciliado: three layers, no server, no server-held keys.

On-chain (Arc mainnet), off-chain client (the payer's browser), and the build
pipeline (Arc Studio on testnet, then Arc Foundry to mainnet).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from _style import *  # noqa: F403
import graphviz

g = graphviz.Digraph("system-architecture")
g.attr(
    **base_graph_attr(
        rankdir="TB",
        splines="spline",
        size="14,12",
        label=hl(
            "Conciliado: System Architecture",
            "Three layers. No server and no server-held keys.",
        ),
    )
)
g.attr("node", **base_node_attr())
g.attr("edge", **base_edge_attr())


def style_cluster(c, title, subtitle, color):
    c.attr(
        label=hl(title, subtitle),
        style="rounded",
        color=color,
        fontcolor=color,
        fontname=FONT,
        fontsize="12",
        penwidth="2.5",
        margin="18",
    )


# Layer 1: off-chain client. Everything the payer touches runs in the browser.
with g.subgraph(name="cluster_client") as c:
    style_cluster(
        c,
        "Off-chain client",
        "Payer's browser. Static build, no backend.",
        B_CLIENT,
    )
    c.node(
        "csv",
        hl(
            "Local invoice list",
            "CSV: invoice ID, payee, amount, salt",
            "Never leaves the browser",
        ),
        fillcolor=F_CLIENT,
        color=B_CLIENT,
        shape="note",
    )
    c.node(
        "app",
        hl(
            "Payer app",
            "React + Vite + TypeScript",
            "wagmi + ConnectKit",
        ),
        fillcolor=F_CLIENT,
        color=B_CLIENT,
    )
    c.node(
        "wallet",
        hl("Payer wallet", "Holds the key, signs every tx", "Keys never leave it"),
        fillcolor=F_CLIENT,
        color=B_CLIENT,
        penwidth="2.5",
    )
    c.node(
        "rebuild",
        hl(
            "Ledger rebuild",
            "Runs in the browser",
            "Output: ledger + USDC tie-out",
        ),
        fillcolor=F_SUCCESS,
        color=B_SUCCESS,
    )

# Layer 2: on-chain. Arc mainnet is where PayoutBatch and the demo batches live.
with g.subgraph(name="cluster_chain") as n:
    style_cluster(
        n,
        "On-chain: Arc mainnet (chain 5042)",
        "PayoutBatch and demo batches",
        B_EXTERNAL,
    )
    n.node(
        "multicall",
        hl("Multicall3From", "approve + payBatch in one tx"),
        fillcolor=F_EXTERNAL,
        color=B_EXTERNAL,
    )
    n.node(
        "payout",
        hl(
            "PayoutBatch",
            "payBatch(lines, expectedTotal)",
            "Emits InvoicePaid per line, BatchPaid per batch",
        ),
        fillcolor=F_EXTERNAL,
        color=B_EXTERNAL,
        shape="cylinder",
        penwidth="2.5",
    )
    n.node(
        "usdc",
        hl(
            "USDC ERC-20 interface",
            "0x3600...0000, 6 decimals",
            "Also the gas token",
        ),
        fillcolor=F_EXTERNAL,
        color=B_EXTERNAL,
        shape="cylinder",
    )
    n.node(
        "rpc",
        hl("Arc RPC", "rpc.mainnet.arc.io", "Logs, receipts, balances"),
        fillcolor=F_ACCENT,
        color=B_ACCENT,
    )

# Layer 3: build pipeline. Authoring on testnet, release to mainnet.
with g.subgraph(name="cluster_build") as b:
    style_cluster(
        b,
        "Build pipeline",
        "Runs on the developer machine, not in production",
        B_BACKEND,
    )
    b.node(
        "studio",
        hl(
            "Arc Studio",
            "Contract, tests, app scaffold",
            "Iterations deploy to Arc testnet only",
        ),
        fillcolor=F_BACKEND,
        color=B_BACKEND,
    )
    b.node(
        "pull",
        hl("arc-studio pull", "Source lands in this repo"),
        fillcolor=F_BACKEND,
        color=B_BACKEND,
    )
    b.node(
        "foundry",
        hl("Arc Foundry", "arc-forge test, arc-forge create"),
        fillcolor=F_BACKEND,
        color=B_BACKEND,
    )

g.node(
    "testnet",
    hl("Arc testnet", "Studio iterations of PayoutBatch"),
    fillcolor=F_DECISION,
    color=B_DECISION,
    shape="cylinder",
)

# Pay path.
g.edge("csv", "app", label="parsed in memory")
g.edge("app", "wallet", label="request signature", color=B_CLIENT, fontcolor=B_CLIENT)
g.edge(
    "wallet",
    "multicall",
    label="one signed tx",
    penwidth="2",
    color=B_EXTERNAL,
    fontcolor=B_EXTERNAL,
)
g.edge("multicall", "usdc", label="approve(PayoutBatch, total)")
g.edge("multicall", "payout", label="payBatch(lines, total)")
g.edge("payout", "usdc", label="transferFrom(payer, payee)")

# Read path.
g.edge("rpc", "rebuild", label="logs + receipts + balances", color=E_SUCCESS, fontcolor=B_SUCCESS)
g.edge("app", "rpc", label="eth_call simulate, eth_getLogs", style="dashed")
g.edge("csv", "rebuild", label="invoice ID + salt match refs", style="dashed")

# Build path.
g.edge("studio", "testnet", label="deploys iterations", style="dashed", color=B_DECISION, fontcolor=B_DECISION)
g.edge("studio", "pull")
g.edge("pull", "foundry", label="tests pass")
g.edge(
    "foundry",
    "payout",
    label="mainnet deploy, source unchanged",
    penwidth="2",
    color=B_BACKEND,
    fontcolor=B_BACKEND,
)

render(g, "01-system-architecture")
