# Archived: the repo-root twin of the app

Until 2026-09-03 the repository root carried a second, older copy of the
Next.js app (`app/`, `lib/`, `components/`, `public/`, its configs) beside the
live one in `FEL-full-app/`. It predates the ThreePoint, Sprint and Air Session
modes and none of the ship-pass work; nothing builds or deploys from it (no
deploy configuration ever pointed at the root, and the live app's `next.config.js`
carries the hosting error reporter). It confused every repository-wide search
and typed-path import, so Ship Pass 2 (Phase 8) moved it here unchanged.

Restore with `git mv _archive/root-twin/<path> <path>` if anything turns out
to need it. `scripts/` and `docs/` at the root were left in place: other
sessions write there.
