# The documents

There were 123 of these. Almost all were reports from finished passes — `PHASE3_GATE0_REPORT`,
`AUDIT_COMPLETION_SUMMARY`, `10PHASE_REMEDIATION_COMPLETE`, nine `MODE*_PHASE1_AUDIT` files, six `SHIP-PASS-*` — and
the one that called itself "the single source of truth" was three weeks stale and wrong about eight modes.

So they are split, because a stale authority is worse than no authority.

## Here: documents that describe what the product IS

Specs, plans, briefs and standing rules. If one of these is wrong, fix it — they are meant to be true today.

- `SPEC-*` — what a feature is and what it is not (Kitchens, weather, mode controls, court locations, movement)
- `PLAN-*` — work in progress with open items named (`PLAN-COMBAT-OVERHAUL` carries its own measured C1–C4 status)
- `CLAUDE-KITCHENS-BRIEF`, `BRIEF-WARDROBE` — lane briefs
- `CAMP-BLUEPRINT`, `OWNERSHIP-MAP`, `AGENT-OPERATING-RULES` — how the project is organised and run
- `COACH-COMPETITIVE-AUDIT`, `SCOPE-AUDIT-2026-09-19` — where the product stands against the field and against itself
- `DEPLOY-NOTES-PRISMA` — the deploy's packaging constraints, learned the expensive way
- `BACKLOG`, `CHANGELOG`

## `history/` — what was believed at the time

92 files. Point-in-time reports, gate results, per-mode audits, migration notes. Kept because they are the record of
how the thing was built, and because several contain measurements worth re-reading. Not maintained, not authoritative,
and not to be cited as current.

## Generated, not written

`MASTER_MODE_LIST.md` at the repo root is generated from `lib/babylon/modes/registry.ts` by
`scripts/mode-list-check.ts`, which fails if the two disagree. The hand-written version it replaced is in
`history/MASTER_MODE_LIST-2026-08-27.md`.
