# MIRROR-TZ: Today's "Last time" picks the newest log on a completedAt tie (+ Pacific-time regression test)

**PR:** fix/mirror-tz → lane/finish-release (draft). **Base SHA** (`git log --oneline -5` at base):

```
d8ad68a Merge pull request #206: SCREEN A voice-only live run for movement screen   <- base (lane/finish-release)
d71ddb5 Merge branch 'lane/finish-release' into copilot/screen-a-voice-only-live-run
9b08a93 Merge PR #207: LEGAL-COPY (18+ / privacy fixes, draft banners removed)
```
(the fix branch is `d8ad68a` + `ef15677` Initial plan + `d3d0729` the fix)

## ROOT CAUSE (the time zone was a coincidence)

- `lib/coach/todayServer.ts` `saveClientLog` stamps a completed session with the wall clock: `const now = new Date();` (:349), written to `ExerciseLog.completedAt` and `ClientSession.completedAt` (:362, :383-384). In the test the two `done()` calls (Day 1, then Day 2) run back to back; on a fast machine both land in the SAME millisecond, so both logs have an identical `completedAt`.
- `loadToday` reads the program's clientSessions with `orderBy { createdAt: 'desc' }` (:165) — NEWEST FIRST.
- `lastTimeFor` (:132-152) pushes the logs in that newest-first order (:136-144), then calls `progressSeries(rows)` (:145) and takes the LAST point as "last time": `if (points?.length) out[e.id] = points[points.length - 1];` (:149).
- `lib/coach/loop.ts` `progressSeries` sorts each series by the `completedAt` ISO string only: `out[k].sort((a, b) => a.at.localeCompare(b.at));` (:196). Array sort is stable, so on a tie the input order survives: newest-first. The last point is then the OLDEST tied log (Day 1's `3×8 @ 60 kg`) — exactly the wrong line seen on the Mini.
- **Proof it is not the time zone:** freezing `Date` (`vi.useFakeTimers({ toFake: ['Date'] })`) makes the existing test fail with that exact message in BOTH `TZ=UTC` and `TZ=America/Los_Angeles`; with the real clock it passes in both on a slower machine. The tie-break that keeps the newest log last makes the frozen-clock run pass in both zones. No code on this path keys "last time" by a calendar day (UTC or local): the choice is by instant, and stays that way.

## THE FIX (minimal; app code only)

`lib/coach/todayServer.ts` `lastTimeFor` ONLY: build `rows` from the program's clientSessions in OLDEST-FIRST order (sort a copy by `createdAt` ascending; within a session, its exerciseLogs by `createdAt` ascending), so that when `completedAt` ties, the stable sort in `progressSeries` leaves the newest log last. `createdAt` is parsed the way the file already treats dates (Date or ISO string → `getTime` / `Date.parse`; a missing value sorts first). `p.clientSessions` is NOT mutated (loadToday uses its newest-first order for `open` and `done`). One comment at the change names the tie and why.

Not changed: `lib/coach/loop.ts` (`progressSeries` / `lastTimeLine`), `saveClientLog`'s timestamps, the query at :165, `todayMemoryDb.ts`, the routes, `today-view.tsx`. No calendar-day key, no `toISOString().slice(0, 10)`, no `getUTC*`, no time-zone logic.

## TESTS

**T1 — new `tests/mirror-progress/today-last-time-pacific.test.ts`** (existing file untouched):
- Zone pinned before anything reads a date: `vi.hoisted(() => { process.env.TZ = 'America/Los_Angeles'; })`, with a guard test: `new Date('2026-10-08T04:40:00.000Z').getTimezoneOffset() === 420` and `.getDate() === 7` (9:40 PM PT Oct 7, already Oct 8 in UTC) so the file fails loudly if the pin ever stops working.
- Same harness as `today-last-time.test.ts` (copied, not imported): the `vi.mock` blocks for react/hookRuntime, `@/lib/camp/server` and `@/lib/db` over `todayMemoryDb`, the same `seed()` and `done()` helpers.
- (a) the "NEWEST completed log wins" scenario with the real clock — same expectations ("Day 3", `Last time: 3 sets: 8, 8, 7 @ 62.5 kg`, the row `Last time: 2×10 @ 30 lb` in lb).
- (b) the same scenario with `Date` frozen at `2026-10-08T04:40:00.000Z` via `vi.useFakeTimers({ toFake: ['Date'], now: ... })` so both saves share one `completedAt` — still `Last time: 3 sets: 8, 8, 7 @ 62.5 kg`. Real timers restored after.
- (c) Day 1 saved at `2026-10-08T06:30:00Z` (11:30 PM PT Oct 7), Day 2 at `2026-10-08T07:30:00Z` (12:30 AM PT Oct 8) via `vi.setSystemTime` between the two `done()` calls — Day 2's line wins (newest instant wins across a Pacific midnight).

**T2 — red then green.** T1(b) against the UNFIXED code (fix stashed):
```
× Today serves "last time" in Pacific time > (b) the NEWEST completed log wins when both saves share one completedAt (frozen clock)
  → expected 'Last time: 3×8 @ 60 kg' to be 'Last time: 3 sets: 8, 8, 7 @ 62.5 kg' // Object.is equality
AssertionError: expected 'Last time: 3×8 @ 60 kg' to be 'Last time: 3 sets: 8, 8, 7 @ 62.5 kg'
```
(The frozen-clock repro fails identically in TZ=UTC and TZ=America/Los_Angeles.) After F1: green.

**T3 — existing test unchanged + both zones.** `tests/mirror-progress/today-last-time.test.ts` is byte-for-byte unchanged (`git diff` empty). `TZ=America/Los_Angeles npx vitest run tests/mirror-progress/` and `TZ=UTC npx vitest run tests/mirror-progress/` both: **Test Files 5 passed (5), Tests 48 passed (48)**. All other tests under `tests/mirror-progress/` and `lib/coach/` (47 files, 1450 tests) pass unchanged.

## FINISH (gates from `FEL-full-app/`, DB vars unset)

- `npx tsc --noEmit` — **0 errors**.
- Full `npx vitest run` — **Test Files 1321 passed | 4 skipped (1325); Tests 19106 passed | 39 skipped | 1 todo (19146)**.
- `npm run test:suites` — **passed 203, failed 0, skipped 11**. `DATABASE_URL: unset (DB suites skipped)`: the 11 `[db]` suites (arena, coach-store-db, creative-card, economy, ledger-invariants, ledger, m2, m3, m4, prq, wallet) are skipped without `DATABASE_URL` and **must pass in GitHub CI's `npm run test:ci`**.
- `npm run lint` (`--max-warnings=0`) — clean, 0 warnings.
- `npm run build:check` — green.

- **Existing test unchanged:** yes (byte-for-byte).
- **No schema, no lib/db.ts, no new deps, no lockfile change:** confirmed — the diff is only `lib/coach/todayServer.ts` (lastTimeFor) + the new test file. (`yarn install` / `build:check` dirt on `yarn.lock` and `public/_prisma/client/{edge,index}.js` was reverted; none of it is committed.)
- **ENV VARS:** none read or added.
- **Files:** `lib/coach/todayServer.ts` (lastTimeFor only) and `tests/mirror-progress/today-last-time-pacific.test.ts`. Plus this report (`docs/MIRROR-TZ-PR-REPORT.md`) — documentation only, no behaviour.

## Manual check for AM (Mac mini)

```
cd FEL-full-app && TZ=America/Los_Angeles npx vitest run tests/mirror-progress/today-last-time.test.ts
```
passes 10 times in a row.
