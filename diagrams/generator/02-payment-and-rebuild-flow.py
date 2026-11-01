"""Happy path of the demo: CSV in, one transaction, ledger rebuilt from chain data.

The example batch has six invoice lines, so the rebuild ends at 6 of 6 matched.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from _style import *  # noqa: F403
import graphviz

g = graphviz.Digraph("payment-and-rebuild-flow")
g.attr(
    **base_graph_attr(
        rankdir="TB",
        splines="spline",
        size="12,16",
        label=hl(
            "Conciliado: Payment and Rebuild Flow",
            "Example batch of six invoices. Everything off-chain runs in the browser.",
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


with g.subgraph(name="cluster_pay") as c:
    style_cluster(c, "1. Pay", "Off-chain client", B_CLIENT)
    c.node(
        "upload",
        hl("CSV upload", "Invoice ID, payee, amount per row"),
        fillcolor=F_CLIENT,
        color=B_CLIENT,
        shape="note",
    )
    c.node(
        "validate",
        hl(
            "Validate per row",
            "Address, amount above zero, no duplicate ref",
            "Payee allow-listed, ref unused",
        ),
        fillcolor=F_CLIENT,
        color=B_CLIENT,
    )
    c.node(
        "simulate",
        hl("Simulate", "eth_call of payBatch against Arc RPC", "Revert reason shown, nothing sent"),
        fillcolor=F_CLIENT,
        color=B_CLIENT,
    )
    c.node(
        "sign",
        hl("Sign one tx", "approve + payBatch", "via Multicall3From"),
        fillcolor=F_CLIENT,
        color=B_CLIENT,
        penwidth="2.5",
    )

with g.subgraph(name="cluster_chain") as n:
    style_cluster(n, "2. Settle", "Arc mainnet", B_EXTERNAL)
    n.node(
        "pay",
        hl(
            "PayoutBatch.payBatch",
            "Six USDC transfers, payer to payees",
            "Final in under a second (to measure)",
        ),
        fillcolor=F_EXTERNAL,
        color=B_EXTERNAL,
        shape="cylinder",
        penwidth="2.5",
    )
    n.node(
        "events",
        hl(
            "Events and receipt",
            "6 InvoicePaid + 1 BatchPaid",
            "Gas used x effective gas price",
        ),
        fillcolor=F_EXTERNAL,
        color=B_EXTERNAL,
    )

with g.subgraph(name="cluster_rebuild") as r:
    style_cluster(r, "3. Rebuild", "Off-chain client, chain data only", B_SUCCESS)
    r.node(
        "read",
        hl("Read chain data", "Logs + receipt + balances", "Before and after the tx"),
        fillcolor=F_ACCENT,
        color=B_ACCENT,
    )
    r.node(
        "rows",
        hl(
            "Build ledger rows",
            "One row per InvoicePaid log",
            "One fee row from the receipt",
        ),
        fillcolor=F_SUCCESS,
        color=B_SUCCESS,
    )
    r.node(
        "match",
        hl("Match refs", "Hash invoice ID + salt per CSV row", "Compare with log invoiceRef"),
        fillcolor=F_SUCCESS,
        color=B_SUCCESS,
    )
    r.node(
        "tie",
        hl(
            "6 of 6 matched",
            "Ledger total = payer balance delta",
            "Tie-out $0.00",
        ),
        fillcolor=F_SUCCESS,
        color=B_SUCCESS,
        penwidth="2.5",
    )

g.node(
    "fix",
    hl("Stop before sending", "Fix rows, or allow-list the payee first"),
    fillcolor=F_DANGER,
    color=B_DANGER,
)

g.edge("upload", "validate")
g.edge("validate", "simulate", label="all rows valid")
g.edge("validate", "fix", label="row invalid", color=E_DANGER, fontcolor=B_DANGER, style="dashed")
g.edge("simulate", "fix", label="reverts", color=E_DANGER, fontcolor=B_DANGER, style="dashed")
g.edge("simulate", "sign", label="passes")
g.edge("sign", "pay", label="one tx", penwidth="2", color=B_EXTERNAL, fontcolor=B_EXTERNAL)
g.edge("pay", "events")
g.edge("events", "read", label="eth_getLogs, receipt, balances")
g.edge("read", "rows")
g.edge("rows", "match")
g.edge("upload", "match", label="local list, never uploaded", style="dashed", constraint="false")
g.edge("match", "tie", color=E_SUCCESS, fontcolor=B_SUCCESS)

render(g, "02-payment-and-rebuild-flow")
