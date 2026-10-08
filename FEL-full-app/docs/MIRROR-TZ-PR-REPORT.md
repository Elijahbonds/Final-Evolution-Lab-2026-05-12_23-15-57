# MIRROR-TZ: explicit tie-breaker in progressSeries so the newest-saved log wins a completedAt tie (+ Pacific-time regression test)

> **PASTE SOURCE for the PR #210 body (follow-up 1).** This sandbox has no GitHub write access (REST/GraphQL PATCH
> returns 403 through the proxy), so the new PR body lives here. AM: retitle PR #210 to
> **"MIRROR-TZ: explicit tie-breaker in progressSeries so the newest-saved log wins a completedAt tie (+ Pacific-time regression test)"**,
> replace its body with everything below the rule, then DELETE this file before merge. The PR stays a DRAFT until AM merges it.

---

**PR:** `copilot/fixmirror-tz` → `lane/finish-release` (draft). Follow-up 1 on PR #210: the explicit tie-breaker replaces the first pass's build-order change (commit d3d0729f's `lastTimeFor` sort, removed as redundant — the tie-breaker decides in ANY input order).

## ROOT CAUSE (the time zone was a coincidence)

- `lib/coach/todayServer.ts` `saveClientLog` stamps a completed session with the wall clock: `const now = new Date();` (:349), written to `ExerciseLog.completedAt` and `ClientSession.completedAt`. Two saves in one millisecond tie on `completedAt`.
- `loadToday` reads the program's clientSessions with `orderBy { createdAt: 'desc' }` (:165) — NEWEST FIRST.
- `lastTimeFor` (:132) pushes the logs in that newest-first order and takes the LAST point as "last time": `if (points?.length) out[e.id] = points[points.length - 1];` (:149).
- `lib/coach/loop.ts` `progressSeries` sorted each series by the `completedAt` ISO string only: `out[k].sort((a, b) => a.at.localeCompare(b.at));` (:196 at the base). Array sort is stable, so on a tie the input order survived: newest-first in, OLDEST tied log last — Day 1's `3×8 @ 60 kg` instead of Day 2's line.
- **Proof it is not the time zone:** freezing `Date` (`vi.useFakeTimers({ toFake: ['Date'] })`) reproduces the failure with that exact message in BOTH `TZ=UTC` and `TZ=America/Los_Angeles` (T4 below). The Pacific failure on the Mac mini was same-millisecond saves on a fast machine. No code on this path keys "last time" by a calendar day (UTC or local): the choice is by instant, and stays that way.

## THE FIX (app code only; no schema, no migration, no lib/db.ts)

`lib/coach/loop.ts` `progressSeries` now sorts each series by THREE keys, the first exactly as before:

1. **`at`** — the `completedAt` ISO string, `a.at.localeCompare(b.at)`, unchanged.
2. **`savedAt`** — the log row's own `createdAt` (a `Date` → `getTime()`, an ISO string → `Date.parse`, missing or unparseable → 0). It never runs backwards in insert order; millisecond precision means it can tie too.
3. **`id`** — plain `<` / `>` (never localeCompare), missing → `''`. Prisma 6.7's `cuid()` (v1) is "c" + the millisecond timestamp + a per-process counter, so within one server process (one request) it increases in insert order. It is NOT a global sequence across instances — it is only the last step, never the main rule.

A full tie (both keys missing or equal) keeps input order — the sort is stable, and that is the only place input order still matters. **`updatedAt` is never used: a coach comment rewrites it later.** The keys ride beside each point while sorting (`{ p, savedAt, id }`) and only the points are returned, so `ProgressPoint`'s shape and every existing `toEqual` on it are unchanged. `LogRow` gains the two keys as OPTIONAL fields (`savedAt?: string | Date | null`, `id?: string | null`); a row without either reads exactly as before.

`lib/coach/todayServer.ts` `lastTimeFor` passes `savedAt: l.createdAt` and `id: l.id` on each LogRow (the rows are full ExerciseLog rows from the include, so both are present). Nothing else in todayServer.ts changes — not `saveClientLog`, not the query at :165, not `loadToday`. **The first pass's build-order change in `lastTimeFor` (the `createdAt` helper, the sessions/logs oldest-first sorts and their 4-line comment) is REMOVED as redundant**: the explicit tie-breaker decides the order whatever order the rows arrive in. Proof it is redundant: T1(b), T2 and T3 pass without it (below), and T4 shows the tie-breaker is the thing that turns the frozen-clock repro green.

**No strict global sequence exists today** (`ExerciseLog` has `id String @id @default(cuid())`, `createdAt @default(now())`, `updatedAt @updatedAt`; no autoincrement or sequence column — `ClientSession` is the same). Adding one would be a schema change, which is out of scope (schema is stop-and-ask) and NOT done.

## TESTS (none loosened, skipped or deleted)

- **T1 — `tests/mirror-progress/today-last-time-pacific.test.ts` (kept from the first pass):** zone pinned before anything reads a date via `vi.hoisted(() => { process.env.TZ = 'America/Los_Angeles'; })` with a loud guard (`getTimezoneOffset() === 420`, `getDate() === 7` at `2026-10-08T04:40:00.000Z` = 9:40 PM PT Oct 7, already Oct 8 in UTC). (a) the newest-wins scenario on the real clock; (b) the same scenario with `Date` frozen at `2026-10-08T04:40:00.000Z` so both saves share one `completedAt`; (c) across a Pacific midnight (11:30 PM PT → 12:30 AM PT via `vi.setSystemTime`).
- **T2 — new `lib/coach/progress-tiebreak.test.ts` (pure `progressSeries`/`lastTimeLine`, no routes or DB):**
  - `same completedAt, savedAt 1 s apart: the newer-saved log is last in BOTH input orders` — `[older, newer]` and `[newer, older]`, and `lastTimeLine` reads Day 2's numbers (`Last time: 3 sets: 8, 8, 7 @ 62.5 kg`).
  - `savedAt as an ISO string sorts the same; an unparseable savedAt reads as missing`.
  - `same completedAt AND same savedAt: the larger id (cuid-shaped 'ckzaaaa0000'/'ckzaaaa0001', created later in the same process) is last in BOTH input orders`.
  - `completedAt still decides when savedAt and id point the other way` — the tie-breaker never overrides a real time difference.
  - `a full tie with no savedAt or id keeps input order (rows from before this change), and the tie keys never reach a point` — backward compatible, and the returned points have exactly the `ProgressPoint` keys (`at, load, loadText, reps, repsText, rpe, sets`; no `savedAt`/`id` leak).
- **T3 — route-level, both orders** (`(c)` in the Pacific file): with `Date` frozen, the "NEWEST completed log wins" scenario runs through the real routes (`POST /api/coach/me/log`, `GET /api/coach/me/today` over the in-memory DB) and Day 3's goblet card reads `Last time: 3 sets: 8, 8, 7 @ 62.5 kg`; then the same stored rows are built into LogRows the way `lastTimeFor` does and handed to `progressSeries` newest-first AND reversed (oldest-first) — Day 2's line wins both ways.
- **T4 — red → green proof.** With F1 reverted (only the old `a.at.localeCompare(b.at)` sort) and WITHOUT the first pass's build-order change, the frozen-clock repro fails:

```
× Today serves "last time" in Pacific time > (b) the NEWEST completed log wins when both saves share one completedAt (frozen clock)
  → expected 'Last time: 3×8 @ 60 kg' to be 'Last time: 3 sets: 8, 8, 7 @ 62.5 kg' // Object.is equality
AssertionError: expected 'Last time: 3×8 @ 60 kg' to be 'Last time: 3 sets: 8, 8, 7 @ 62.5 kg'
Received: "Last time: 3×8 @ 60 kg"
Test Files  1 failed (1)
     Tests  2 failed | 3 passed (5)     ← (b) and the new both-orders route test (c); identical under TZ=UTC
```

  With F1 + F2 restored: `Test Files 2 passed (2), Tests 10 passed (10)` (the Pacific file + `lib/coach/progress-tiebreak.test.ts`).

- **T5 — both zones green** (run from `FEL-full-app/`, DB vars unset):

```
$ TZ=America/Los_Angeles npx vitest run tests/mirror-progress/ lib/coach/
 Test Files  53 passed (53)
      Tests  1504 passed | 1 skipped (1505)

$ TZ=UTC npx vitest run tests/mirror-progress/ lib/coach/
 Test Files  53 passed (53)
      Tests  1504 passed | 1 skipped (1505)
```

- **Unchanged, byte-for-byte:** `tests/mirror-progress/today-last-time.test.ts` and `lib/coach/loop.test.ts` (`git diff lane/finish-release` empty for both).

## FINISH (gates from `FEL-full-app/`, DB vars unset)

- `npx tsc --noEmit` — **0 errors**.
- Full `npx vitest run` — **Test Files 1322 passed | 4 skipped (1326); Tests 19112 passed | 39 skipped | 1 todo (19152)** (the first pass was 1321 files / 19106 tests; +1 file `lib/coach/progress-tiebreak.test.ts`, +6 tests — the counts only go up).
- `npm run test:suites` — **passed 203, failed 0, skipped 11**. `DATABASE_URL` unset, so the 11 `[db]` suites (arena, coach-store-db, creative-card, economy, ledger-invariants, ledger, m2, m3, m4, prq, wallet) are skipped here and **must pass in GitHub CI's `npm run test:ci`**.
- `npm run lint` (`--max-warnings=0`) — clean, 0 warnings.
- `npm run build:check` — green.

- **No schema, no `lib/db.ts`, no new deps, no lockfile change, no new npm script, no SQL/data writes.** Diff vs `lane/finish-release`: `lib/coach/loop.ts`, `lib/coach/todayServer.ts` (lastTimeFor only), `tests/mirror-progress/today-last-time-pacific.test.ts`, `lib/coach/progress-tiebreak.test.ts`, and this file (`docs/MIRROR-TZ-PR-REPORT.md`, the paste source for this body — deleted before merge).
- **ENV VARS:** none read or added.

## Manual check for AM (Mac mini) before merge

```
cd FEL-full-app && for i in $(seq 1 10); do TZ=America/Los_Angeles npx vitest run tests/mirror-progress/today-last-time.test.ts || break; done
```

green 10 of 10, then the full gate.
