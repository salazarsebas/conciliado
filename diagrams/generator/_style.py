"""Shared design system for project diagrams.

Professional palette, transparent background, light/dark compatible.
Copy this kit into a project's diagrams/generator/. Do not attribute it
to another product.
"""

BGCOLOR = "transparent"

FONT = "Helvetica"
T_DARK = "#1E293B"
T_MED = "#475569"
T_LITE = "#94A3B8"

F_DEFAULT = "#F8FAFC"
F_CLIENT = "#EFF6FF"
F_BACKEND = "#F0FDF4"
F_EXTERNAL = "#FAF5FF"
F_DECISION = "#FFFBEB"
F_SUCCESS = "#ECFDF5"
F_DANGER = "#FEF2F2"
F_ACCENT = "#F0F9FF"

B_DEFAULT = "#64748B"
B_CLIENT = "#3B82F6"
B_BACKEND = "#16A34A"
B_EXTERNAL = "#9333EA"
B_DECISION = "#D97706"
B_SUCCESS = "#059669"
B_DANGER = "#DC2626"
B_ACCENT = "#0284C7"

E_DEFAULT = "#94A3B8"
E_SUCCESS = "#059669"
E_DANGER = "#DC2626"
E_WARNING = "#D97706"


def render(g, name: str, out: str = "docs/diagrams/output") -> None:
    """Render graph to both SVG and PNG."""
    from pathlib import Path

    Path(out).mkdir(parents=True, exist_ok=True)
    Path(f"{out}/{name}.svg").write_bytes(g.pipe(format="svg"))
    Path(f"{out}/{name}.png").write_bytes(g.pipe(format="png"))
    print(f"  rendered {name} (.svg + .png)")


def base_graph_attr(**extra):
    return {
        "bgcolor": BGCOLOR,
        "fontname": FONT,
        "fontsize": "13",
        "fontcolor": T_DARK,
        "labelloc": "t",
        "labeljust": "l",
        "pad": "0.7",
        "nodesep": "0.55",
        "ranksep": "0.8",
        "dpi": "150",
        **extra,
    }


def base_node_attr(**extra):
    return {
        "shape": "box",
        "style": "filled,rounded",
        "fillcolor": F_DEFAULT,
        "color": B_DEFAULT,
        "fontname": FONT,
        "fontsize": "11",
        "fontcolor": T_DARK,
        "margin": "0.22,0.13",
        "penwidth": "1.6",
        **extra,
    }


def base_edge_attr(**extra):
    return {
        "color": E_DEFAULT,
        "fontname": FONT,
        "fontsize": "10",
        "fontcolor": T_MED,
        "arrowsize": "0.85",
        "penwidth": "1.4",
        **extra,
    }


def _safe(text: str) -> str:
    return text.replace("\n", "<BR/>").replace("->", "-&gt;")


def hl(title: str, subtitle: str = "", subtitle2: str = "") -> str:
    s = f"<B>{_safe(title)}</B>"
    if subtitle:
        s += f'<BR/><FONT POINT-SIZE="9" COLOR="{T_MED}">{_safe(subtitle)}</FONT>'
    if subtitle2:
        s += f'<BR/><FONT POINT-SIZE="9" COLOR="{T_MED}">{_safe(subtitle2)}</FONT>'
    return f"<{s}>"
