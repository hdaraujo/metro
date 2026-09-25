# Play `002` — Autopilot session instructions

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

This project's `documentation/context/` folder holds context documents shared by
every play — the product vision and tech stack the Architect maintains, plus any
others the user added. Read ALL of them before doing anything, and make all work
conform to them:

- [vision.md](documentation/context/vision.md) — the problem, users, and product direction.
- [tech.md](documentation/context/tech.md) — overall architecture plus the technology used in each repository.

## This play

Everything below is inside `plays/002-all-buses/`.

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
