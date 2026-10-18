# GitHub board

Every product and judged submission is driven from GitHub, not from chat.

The board exists before product code. The first commit is the submission
seed (`systems/hackathons/templates/submission/`) and a README that states
the promise and that no behavior is implemented yet. The next act is
opening milestones, then epics, then child issues. A commit that adds
product behavior before those issues exist is a failed start. Delete that
start and open the board before writing the behavior again.

Do not cite private repositories or private pack URLs in the submission.

## Milestones

At least four, due on the event close when that date is published. Do not
invent an earlier date. Titles:

1. Explain
2. Core
3. Surface
4. Proof

A longer product may add phases. It may not collapse these four into one
milestone.

## Epics

GitHub issues labeled `epic`. One epic is one judge-visible slice.

Each epic body has these headings:

- Goal
- Scope
- Gate (the issue that must close first, or "open")
- Child issues (unchecked links to issue numbers)

Minimum epics on a judged submission:

| Milestone | Epic | What closing it means |
|---|---|---|
| Explain | README | A stranger can explain the product from the README alone |
| Core | The wedge | The card's one control, with tests in the acceptance lines |
| Surface | Landing | The live page meets the landing bar below |
| Proof | Ship | Threat model, demo-path E2E, and a live URL that is not github.com |

Deploy, security review, and E2E are issues under Proof. They are not a
paragraph at the bottom of the wedge epic.

## Child issues

Every child has:

- Context (the doc or record line this implements)
- Problem (one sentence)
- Scope (what this issue will not change)
- Acceptance (a checklist that includes the test or the check that proves it)
- Label `epic:<n>` pointing at the parent epic
- One area label: `docs`, `frontend`, `backend`, `tests`, `security`, or `infra`

Work starts only when that issue is open and its epic gate is clear.
One issue per commit. The commit message names the issue number.
Close the issue only when every acceptance line is true.

Do not open an issue titled "make it nice". Split brand, design system,
accessibility, and empty states.

## README bar (Explain)

The README issue stays open until the file itself contains:

- A one-line promise
- What the product is
- The problem, with a number only when that number is already in the event record or on a page the README links
- An architecture section, with the diagram image inline and the layer boundaries written out
- How it works, as numbered steps, with the flow diagram inline
- An honest status: what is live, what is a fixture, what is not built

A README that only tells you how to run a test does not close this issue.

## Landing bar (Surface)

The landing issue stays open until the live page has:

- The product name and the one-line promise
- The one demo action
- Empty, loading, and error states
- Type, spacing, and contrast that hold on a phone, with 44px targets
- A finish a stranger would take for a product, not an unstyled card


## Labels (minimum)

`epic`, `bug`, `spike`, `docs`, `blocked`, `wont-do`, `frontend`,
`backend`, `tests`, `security`, `infra`.

## Feedback

When Sebastián corrects how a project was built, follow the playbook
section "When he corrects a project" before the next product commit.
