# Play `project-setup` — Autopilot session instructions

This play is run by the **Autopilot** team: the Architect shapes the product
vision + tech stack, the Planner then checks whether the play introduces a new
user interface and — if the user wants one — designs a visual prototype before
shaping an implementation plan (in plan mode), DevOps prepares an isolated git
worktree carrying the play's branch in each target repo, the Developer implements
the plan inside those worktrees, then DevOps commits the changes and posts testing
instructions before the play goes to validation.

Your session starts at the root of the project's **specs repository** — the one
holding `documentation/` and `plays/`. While this play is in progress that root is
its own git worktree, checked out on the play's branch, so everything you write
here belongs to this play and lands on the default branch as a single commit
when the play closes.

## Product context (read first)

This project has no context documents yet — the Architect creates the product vision
and tech stack in `documentation/context/`, and the user can add more from the
Documentation tab of the project screen.

## This play

Everything below is inside `plays/project-setup-product-vision-tech-stack/`.

- [Intent](intent.md) — background context the user provided (may be empty).
- `design/` — present only if the user asked for a UI prototype: the
  design canvas source plus `design/design.md`. When it exists it is the
  **specification for the user interface**, and the page the user reads it from
  lives in `documentation/design/`.
- `plan.md` — the approved implementation plan, written when the Planner
  finishes. **The Developer and DevOps treat `plan.md` as the source of
  truth for which repositories this play touches.**
- `sessions/` — every agent session on this play, kept as the record.

## Repositories

The project's main clones are on this machine at the paths below. Once DevOps prep
has run, each target repo's play worktree sits under its own folder and that — not
the clone — is where the Developer and DevOps work.

- `metro` — `C:\Users\Hugo\.building\data\projects\001-metro\repos\metro`
