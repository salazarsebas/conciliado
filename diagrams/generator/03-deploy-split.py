"""Deploy split: which component lives on Arc mainnet, Arc testnet, or off-chain."""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from _style import *  # noqa: F403
import graphviz

g = graphviz.Digraph("deploy-split")
g.attr(
    **base_graph_attr(
        rankdir="LR",
        splines="spline",
        size="14,8",
        label=hl(
            "Conciliado: Deploy Split",
            "Mainnet for the proof, testnet for iteration, off-chain for the app",
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


with g.subgraph(name="cluster_testnet") as t:
    style_cluster(t, "Arc testnet", "Iteration", B_DECISION)
    t.node(
        "studio_iter",
        hl("Studio iterations", "PayoutBatch deployed by Arc Studio"),
        fillcolor=F_DECISION,
        color=B_DECISION,
        shape="cylinder",
    )

with g.subgraph(name="cluster_mainnet") as m:
    style_cluster(m, "Arc mainnet", "Proof", B_EXTERNAL)
    m.node(
        "payout_main",
        hl("PayoutBatch", "Deployed with Arc Foundry"),
        fillcolor=F_EXTERNAL,
        color=B_EXTERNAL,
        shape="cylinder",
        penwidth="2.5",
    )
    m.node(
        "demo",
        hl("Demo batches", "Real USDC, real fees"),
        fillcolor=F_EXTERNAL,
        color=B_EXTERNAL,
    )

with g.subgraph(name="cluster_off") as o:
    style_cluster(o, "Off-chain", "No server, no server-held keys", B_CLIENT)
    o.node(
        "app",
        hl("Payer app", "Static client build"),
        fillcolor=F_CLIENT,
        color=B_CLIENT,
    )
    o.node(
        "rebuild",
        hl("Ledger rebuild", "In the browser, from chain data"),
        fillcolor=F_CLIENT,
        color=B_CLIENT,
    )
    o.node(
        "csv",
        hl("Invoice list", "CSV with salt, local only"),
        fillcolor=F_CLIENT,
        color=B_CLIENT,
        shape="note",
    )

g.edge("studio_iter", "payout_main", label="pull, test, redeploy\nsame source", style="dashed", color=B_DECISION, fontcolor=B_DECISION)
g.edge("payout_main", "demo", label="payBatch")
g.edge("app", "payout_main", label="wallet-signed txs", penwidth="2")
g.edge("demo", "rebuild", label="logs, receipts, balances", color=E_SUCCESS, fontcolor=B_SUCCESS)
g.edge("csv", "app")

render(g, "03-deploy-split")
