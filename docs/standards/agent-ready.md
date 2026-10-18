# Agent-ready

Public sites must be understandable by AI agents, not only by browsers. Use
[isitagentready.com](https://isitagentready.com) as the check catalog. Apply every
check that fits the project type. Skip commerce protocols (x402, MPP, UCP, ACP) unless
the product actually charges agents.

## Always (any public site or docs)

- `robots.txt` with a sitemap line and explicit AI-bot rules (allow the judges' and
  common research crawlers; do not block the demo).
- `sitemap.xml`
- `llms.txt` at the site root pointing at Markdown docs
- `AGENTS.md` in the GitHub repo (how an agent should build, test, and demo)
- `Accept: text/markdown` (Markdown negotiation) when the host supports it (Cloudflare
  Pages/Workers: enable Markdown for Agents). If the host cannot negotiate, ship
  parallel `.md` routes (`/docs`, `/llms.txt`, README).
- Semantic HTML, one `h1`, unique title and meta description
- JSON-LD when it helps (SoftwareApplication, Organization, FAQ)

## When the product is an API or agent surface

- OpenAPI or an API catalog at a well-known URL
- MCP server card if there is an MCP
- Agent Skills (agentskills.io) if the product exposes skills
- OAuth discovery / protected-resource metadata if there is auth
- `/.well-known/` files the stack actually uses; do not invent well-knowns

## Repo Markdown twins

Every important page has a Markdown twin an agent can fetch without a browser:

- README (human + agent)
- `docs/architecture.md` (prose + Mermaid, matching the Graphviz diagrams)
- Threat model, monitoring plan, metrics, brand book: all Markdown

A judge-agent that only reads the GitHub repo must be able to explain the product.

## Do not

- Block GPTBot/ClaudeBot/Google-Extended on the demo by accident
- Ship a SPA with no HTML content and no Markdown alternate
- Put secrets in `llms.txt`
