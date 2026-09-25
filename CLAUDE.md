# This repository

This repository holds a product's **specifications** — what is being built, why, and the
record of how each piece got there — and, when there is only one repository, its code as
well. It is laid out so that both an AI agent and a person can work in it directly: open a
terminal here, run `claude`, and everything below is where it says it is.

Building (the orchestration app) reads and writes this same structure. Nothing here is
Building-specific magic: it is plain folders, markdown and YAML, and it keeps working if
you never open the app again.

## Layout

```
documentation/
  context/     product-wide context every piece of work must conform to.
               vision.md (what the product is) and tech.md (the stack and architecture)
               are the two that always exist; anything else here is yours.
  modules/     what has actually shipped, organised by part of the product.
               Written once a play is approved, on its branch, from the real diff —
               not from the plan.
  design/      UI prototypes, when a piece of work introduced a new screen.
plays/
  <play-id>/   one folder per unit of work. See below.
```

A **play** is one unit of work: a change worth planning, doing and reviewing on its own.
Each play folder holds:

| File | What it is |
| --- | --- |
| `config.yaml` | the play's id, name, assigned team and lifecycle state |
| `intent.md` | what the user asked for, in their words |
| `plan.md` | the approved implementation plan |
| `CLAUDE.md` | instructions for an agent working on *this* play |
| `history.yaml` | the audit trail: transitions, decisions, documents, commits |
| `sessions/` | every agent session's transcript, kept as the record |

## How work flows

Each play is developed on **its own branch**, named after the play, in this repository and
in every code repository it touches. The play's folder, its documentation and its code all
move together on that branch and merge together — so reviewing a play means reviewing one
branch, and the specification can never drift from the change it describes. When a play is
approved, its branch in this repository is squash-merged into the default branch — **one
commit per play** — and deleted; its branches in the code repositories are left **unmerged**
for a person to review and merge.

Read `documentation/context/` before starting anything. Read the play's own `CLAUDE.md`
and `intent.md` before working on that play.

## Conventions

- Timestamps are UTC ISO 8601.
- A document under `documentation/modules/` describes a *part of the product*, not a play —
  several plays may update the same one. Update what is there rather than adding a
  near-duplicate.
- `documentation/context/` is shared by everything. Keep it short; it is read in full,
  every time, by every agent.
