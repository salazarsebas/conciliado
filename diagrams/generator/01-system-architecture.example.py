"""Example system-architecture diagram. Copy, rename without .example, and
replace nodes with the project's real trust boundaries.
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
        size="14,10",
        label=hl("System Architecture", "Replace this example with the real split"),
    )
)
g.attr("node", **base_node_attr())
g.attr("edge", **base_edge_attr())

with g.subgraph(name="cluster_client") as c:
    c.attr(
        label=hl("Client  -  Trust Boundary"),
        style="rounded",
        color=B_CLIENT,
        fontcolor=B_CLIENT,
        fontname=FONT,
        fontsize="12",
        penwidth="2.5",
        margin="18",
    )
    c.node(
        "ui",
        hl("UI", "Wallet connect · demo path"),
        fillcolor=F_CLIENT,
        color=B_CLIENT,
    )
    c.node(
        "signer",
        hl("Signer", "Keys never leave the client"),
        fillcolor=F_CLIENT,
        color=B_CLIENT,
        penwidth="2.5",
    )

with g.subgraph(name="cluster_backend") as b:
    b.attr(
        label=hl("Backend  -  Stateless"),
        style="rounded",
        color=B_BACKEND,
        fontcolor=B_BACKEND,
        fontname=FONT,
        fontsize="12",
        penwidth="2.5",
        margin="18",
    )
    b.node(
        "api",
        hl("API", "Builds unsigned work · no custody"),
        fillcolor=F_BACKEND,
        color=B_BACKEND,
    )

with g.subgraph(name="cluster_chain") as n:
    n.attr(
        label=hl("Chain"),
        style="rounded",
        color=B_EXTERNAL,
        fontcolor=B_EXTERNAL,
        fontname=FONT,
        fontsize="12",
        penwidth="2.5",
        margin="18",
    )
    n.node(
        "mainnet",
        hl("Mainnet", "Proof / extra-credit surface"),
        fillcolor=F_EXTERNAL,
        color=B_EXTERNAL,
        shape="cylinder",
    )
    n.node(
        "testnet",
        hl("Testnet", "Heavy demo flows if fees bite"),
        fillcolor=F_EXTERNAL,
        color=B_EXTERNAL,
        shape="cylinder",
    )

g.edge("ui", "api", label="plan + unsigned tx")
g.edge("api", "signer", label="only after verify", color=B_CLIENT, fontcolor=B_CLIENT)
g.edge("signer", "mainnet", label="extra-credit proof", penwidth="2")
g.edge("api", "testnet", label="demo volume", style="dashed")

render(g, "01-system-architecture")
