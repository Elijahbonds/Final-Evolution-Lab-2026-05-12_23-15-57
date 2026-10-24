# Daily drill (value round item 3)

The promise is "get measurably better". Each account gets one 5–10 minute drill a day, picked from its weakest measured
number. Finishing it on the camera keeps the streak going and pays Lab Credits once. This is lane `lane/daily-drill`.
There is no schema change, no new dependency and no deploy file.

## Where it lives

| Surface | What | File |
|---|---|---|
| `/train` | The daily drill card, above the coach's Today card, for every account | `components/daily-drill/daily-drill-card.tsx`; one read and one mount line in `app/train/page.tsx` |
| `/train/today-drill` | The drill: why it was picked, its phases, and the camera run | `app/train/today-drill/page.tsx`, `_components/today-drill-run.tsx` |
| `/profile/week` (progress card, #432) | One line under the card: "Daily drill done on N of the last 7 days" and a door to today's. It is not on the share image | `components/daily-drill/week-line.tsx`; one read (a count over the 7 claim keys) and one line in `app/profile/week/page.tsx` |
| `POST /api/daily-drill/claim` | `{ key }` → the day's credit and streak day, once | `app/api/daily-drill/claim/route.ts` |
| Logic | Skills, pick, plan, compose, load, claim, copy | `lib/daily-drill/**` |

The camera run is the drills page's own screen (`DrillLive`). It has two new optional props: `onResult`, so the claim
fires once per finished run, and `keptLine`, because today's drill keeps one fact.

## The pick

1. **Readings** (`skills.ts`). These are numbers FEL already saves, read with profile v2's gates inside the query. Each
   one is put on a 0–100 standing, where higher is better.

   | Number | Source | Standing |
   |---|---|---|
   | Jump | Best saved jump (`WorkoutScan` dunk / prove_it / rescreen / jump) | The existing vertical map `powerFromJumpCm` (12 → 40 in = 0 → 100) |
   | Form | Mean clean-rep share of Mirror squat and lunge sets | × 100 |
   | Shooting | Body-play shots the game counted (`WorkoutScan` `shot_form`, `made`), at least 10 of them | Make % |
   | Power, mobility | PRQ on the score scale, from a real source (not a game's `drillResult` copy) | The score. PRQ power stands in for the jump only when no saved jump exists |

   These do not count: game scores (they have no scale shared with a body number), reaction (nothing saves it), and
   numbers a teen's phone keeps (the server never sees them, and the pick must be the same on every device).
2. **Weakest wins.** A tie is the same whole-number standing. It goes to the number that got worse against last week.
   If they are still tied, a hash of (user, day, skill) decides, so the pick is fixed for the day and rotates across days.
3. **No number** gives the Pre-Game Wake-Up and a nudge that depends on the account's gates. An opted-in adult is sent
   to the jump check. An adult who has not opted in is sent to Account settings. Under-18s are told honestly that their
   numbers stay on the phone, with a link to the Quick Screen.
4. **Same all day.** The day is the wallet's day, the America/Los_Angeles calendar date (`ptDayBounds`). The window is
   the 28 days before the start of today. A reading taken today changes tomorrow's drill, not today's.

## Drill mapping (existing content only)

Every drill is on the `/play/drills` shelf. A short drill comes after FEL's quick Wake-Up (`WAKE_UP_BY_MINUTES[6]`:
pressurize, tripod, joints, all calm, 4 minutes), in the Playbook's order.

| Focus | Gates open | Jumps held (youth, jump gate, pain) | Minutes |
|---|---|---|---|
| Jump | Pogo Progression: Both Feet | Countermovement Geometry Check | 7 / 5 |
| Form | Countermovement Geometry Check | same | 5 |
| Shooting | Safe Landing Check | Countermovement Geometry Check | 6 / 5 |
| Mobility | Pre-Game Wake-Up | its calm phases | 10 / 6 |
| No number | Pre-Game Wake-Up | its calm phases | 10 / 6 |

The safety gates are the drills page's (`lib/drills/access.ts`), read from the same context. A standing intake red flag
means no drill at all. If a gate changes during the day, the gate wins, and the claim accepts either drill of the day's
focus.

## The claim (race-safe, once a day)

The claim is one transaction:

1. Lock the `PlayerProfile` row (`lockPlayerForDailyCap`).
2. Claim the streak day with `claimPlayStreak`. This is STREAK-CLAIM-RACE #277/#292, moved unchanged from the sessions
   route to `lib/streak/claim.ts`.
3. Write `applyLc` under `daily_drill:<PT day>:<user>` with `rejectReplay`.

The loser of any race answers `already` from the winner's row. That ledger row is the record that the drill was done;
there is no new table. The credit is `REASON.DAILY_DRILL_COMPLETE`, a wallet reward rule that is editable live in
`RewardRule`. It is server-granted only: it is not in `EVENT_REASON`, so a client cannot name it to `/v1/wallet/earn`.
When finishing the drill opens the streak day, that day's streak LC (5 × day, unchanged) rides on the same row, as it
does for a game.

The drill's "done" is the device's word, like every camera number. So the claim is bounded rather than trusted: once a
day, and only for today's focus. Nothing the camera read is sent.

## Teens

Teens get the same logic and the same card. Their account rows are never read (the query gates), so they get the
all-round drill unless their account holds a PRQ score. Youth rules hold every jump. Nothing is shared: the claim posts
only the drill key, and no other person can see the result.

## Training buddies (not built: no friends graph)

FEL has no friend relation (`docs/PROFILE-V2.md`: "Friends-only" means the owner and their coaches for now). The plan,
for when a friends lane lands one:

- **Read.** For each accepted friend, read whether `WalletLedgerEntry` has `daily_drill:<PT day>:<friendId>`. That is
  one `findMany` over `idempotencyKey in [...]`, selecting no amounts. The answer is only *done* or *not done*: never
  the drill, the number, the amount or the time.
- **Who.** Mutual, accepted friends only. A minor's status shows only to friends the existing rules already allow;
  under-18 friends-only stays as profile v2 has it.
- **Nudge.** One tap sends one preset: "Today's drill is waiting". There is no free text. It is rate-limited to one
  per friend per day. It needs a small pending table (`DrillNudge(fromId, toId, day)`, unique on all three), behind a
  guarded seam like `lib/coach/pendingSchema.ts`. That is a schema change, so it is the owner's call.
- **Where.** A row of friends' done or not-done dots under the daily drill card.

## Measured

| | Result |
|---|---|
| Unit and route tests | `lib/daily-drill` (pick 27, claim 13, load 6, compose 4), `lib/streak` 4, `tests/daily-drill` (route 6, card 7, DrillLive 3, claim call 2, week line 3): 75 |
| Concurrent claims (test double: row lock, unique key) | 8 at once × 5 rounds → 1 granted, 7 already; one row; streak 3 → 4 once |
| **Real Postgres probe** (throwaway local PG 16; tables from the client's DMMF, no Prisma CLI; real `applyLc`, `postLc`, lock, streak claim, gated reads) | 17 of 17. 8 concurrent × 5 → exactly 1 granted, 1 ledger row, 1 house-book row, +30 LC once, streak 3 → 4. Drill and game at once → the streak day once. Pick from real rows through real gated queries; a teen's rows are not returned. **CONTROL:** naive check-then-write with no transaction → +240 LC on one ledger row. Database dropped and cluster deleted afterwards |
| Control for the throwaway schema | `wallet-tests` 33 of 33 and `economy-tests` 18 of 18 against it |
| Phone rig (esbuild + Playwright, Chromium, 390×844, DPR 3, 4× CPU) | Train card: open, calm, new, teen, done, stopped. Drill page: open, calm, new, done. 0 overflow, 0 errors, 0 backdrop-filter. Shots are in `scratchpad/round7/daily-drill/shots/` |
| `/train` cost | 0 client JavaScript (the card is server-rendered). In parallel in the page's batch: 9 reads of its own plus the drills page's context (4–6) |

## Owner calls

1. **Credit (new):** 10 LC per day's drill. With the streak day it opens, a typical day is 10 + 5 × day.
2. **Drill mapping:**
   - Shooting maps to the Safe Landing Check, because the shelf has no shooting drill.
   - Speed, agility and strength have no shelf drill yet, so they are not picked. The SAQ charts exist but have not been
     run on a camera.
3. **Copy for review (product copy):**
   - The why-line: "Picked from your lowest number: shooting, 40% of 30 shots made."
   - The reward line, the done line and the three nudges.
   - `KEPT_LINE`: "Only the fact that you finished today's drill is kept…"
4. **Card order:** the daily drill sits above the coach's Today card. It was placed before the Today card, not after,
   so that it merges cleanly beside progress-card's `WeekCardEntry`.
5. **Assumptions:**
   - The PT calendar day is "a day".
   - 28 days of readings count as current.
   - 10 shots are enough for a make rate.
   - The five-point shot band reads as "same".
6. **Progress card line:** applied after #432 merged. It is one line under the card and is left off the share image.
