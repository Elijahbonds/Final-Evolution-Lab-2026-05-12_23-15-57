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

---

# Today's drill, redesigned (lane `lane/today-drill`, 2026-10-27)

The owner's playtest: "The today's drill section needs big improvement. Needs clearer instructions and better
purpose." The avatar T-posed on the page, and the cueing was "weird". The goal is that a first-timer understands **why**
they are doing it, **what** to do, and **how they did**. The pick, the gates, the claim and the economy are unchanged.

## What changed

| Where | Before | After |
|---|---|---|
| Train card | The book's name ("Safe Landing Check") and "Picked from your lowest number: shooting, 40% of 30 shots made." | A plain name ("Soft landings"), why today in a sentence ("Your shooting is your lowest number right now (40% of 30 shots made), so today's drill works on soft, balanced landings."), what it improves, the reward. A first-timer also gets "Each day we pick one short drill from your lowest number." |
| Drill page, top | The book's name, the old why-line, "The same drill all day…" | Plain name (the book's name small under it), why today, what it improves, and chips for minutes, floor and shoes, and phone distance |
| First-timer | Nothing | A two-line explainer of what the daily drill is, on the card and the page |
| Everyone | Start under eight phase cards, so the hop drill needed a scroll | Owner, 2026-10-27: "It should play automatically, don't make the platform confusing or hard to use." Nothing is folded away (the demo, the numbered steps, the 2–3 key cues and the setup are always shown, and the demo plays by itself). The next action is one big **Start**, fixed at the bottom above the phone's tab bar, so it is never scrolled to |
| Steps | One card per chart phase, in the book's words ("Pressurize the System · 1 min", "Set 1 · 0.3 min") | 3–4 short numbered steps read from the chart the day runs ("Warm up for 4 minutes: …", "3 sets of 20 hops.", "Rest 1 minute between sets.") |
| Demo | "Watch the 3D demo", which opened the drills page's `DrillDemo`: the one-clip `exercise-avatar-canvas` stand-in, where the owner saw the T-pose | The shared library stage (`components/library/exercise-stage.tsx`) looping the drill's own `ex_*` clip (`ex_pogo` for hops, `ex_jump` for landings: the same choice as lane/library-anatomy-2's `surfaceDemo.ts`). It loads once the box is near the screen. The slow squat check (a quarter dip, which the full-squat loop does not show) and the Wake-Up (six different phases) show a cue card, never a wrong movement |
| Setup | Only inside body play's space check | Phone on its side about chest high, 3.5 to 4.5 m (body play's own `SETUP_HINT`, pinned by a test), 2 m of floor, nothing overhead for jumps, shoes, and "the camera checks your framing before the clock starts" |
| During | Phase name, time left, the cue lane, the book's line, the Coach's caption, and "End the drill" | "Step 4 of 8" with a progress bar and time left. A big step name ("Hops: set 1") and a rep counter ("7 of 20", the chart's own beat). ONE cue (the Coach's caption, else the step's plain cue, else the book's timed line where a phase changes sides). "Next: Rest". A big Rest panel with its countdown. **Pause**, **Stop** and **This hurts: stop** are fixed at the bottom |
| Pause | Only by hiding the tab | A Pause button. It is the hidden-tab pause exactly (`liveDrill.pause()`): the camera goes off, the clock stops where it was, and the camera never restarts by itself. Camera back, the space check, then RESUME |
| Pain | None on the page | "This hurts: stop" turns the camera off and opens the **existing** pain check-in (`PainCheckInChip`, kind `during` → `POST /api/health/pain` → `lib/health/painRule.ts`), already open. Its decision is shown verbatim and feeds the drills page's gates as before. There is no second pain path |
| After | "<drill>: done", per-phase beat counts, "Timing overall: 75%" | **What we saw** ("The camera saw 15 of 20 hops and landings on time, and 9 of 10 holds kept still."), **What it means** (three bands per drill, encouraging and never shaming), **What's next** (tomorrow's likely focus), the claim line, the estimate line and the kept line. Back to Train, or Do it again |

Tomorrow's focus is the same pick (`pickFocus`) over the same readings with tomorrow's date. It reads nothing new and
keeps nothing, and the line says "likely", because a reading taken today can still change it.

"First-timer" means no daily drill done in the 28 PT days before today, and none today. It is one count over the claims'
own unique ledger keys (`walletLedgerEntry.count`, idempotency keys `in` 28 keys). It reads no amounts and saves
nothing. A failed or missing count is treated as a returning player. assumption: four weeks away is "new again".

## Files

New: `lib/daily-drill/guide.ts` (+ test), `app/train/today-drill/_components/today-drill-live.tsx` (running, result, hurt),
`app/train/today-drill/_components/drill-demo-loop.tsx` (mounts the shared stage), `tests/daily-drill/today-drill-flow.test.tsx`,
`tests/helpers/readingLevel.ts` (Flesch–Kincaid estimate, test-only).

Shared files, additive only (flagged):
- `app/play/drills/_components/drill-live.tsx`: optional `renderRunning` / `renderResult` slots. Without them the drills
  page is unchanged. The space check, the grown-up step and the camera-off pause stay DrillLive's.
- `lib/drills/liveDrill.ts`: `pause()`, which is `bodyPlay.end()` plus the hidden-tab handler. Tested in `liveDrill.test.ts`.
- `components/coach/pain-checkin.tsx`: `initiallyOpen` on `PainCheckInChip`. The default is unchanged.

## Measured (esbuild + Playwright rig, Chromium, 390×844, DPR 3, 4× CPU throttle)

The rig renders the real card, page, `TodayDrillRun`, `DrillLive` and the real `DrillRunner` on a simulated clock. Two
pieces are rig stand-ins, both unchanged by this lane: the camera (`use-live-drill` → a fake that drives the real
runner, with a body always in frame) and body play's space check (a labelled placeholder with its START). The views
come from the real `viewFrom` over `tests/helpers/dailyDrillRows.ts`. Shots, before and after, are in
`scratchpad/round9/today-drill/shots/{before,after}/`.

**Tap the Train card → first rep.** Screens: Train → drill page → space check → running, 4 in both builds. Taps: card,
Start, START, 3 in both. A scroll is counted when Start is below the fold. Reading time is modelled at 200 words a
minute over every word above Start (a first-timer reads; a returning player does not). The chart's time to its first
target comes from the chart, and is the same in both builds. The camera's own setup (permission, framing) needs a real
camera and is not in these numbers.

| Who (fixture) | Build | Words before Start | Scrolls | UI time, tap → START | Read (200 wpm) | Chart → first rep | **Total** |
|---|---|---|---|---|---|---|---|
| First-timer, hooper (landings) | before | 127 | 0 | 0.7 s | 38 s | 6 s | **45 s** |
| | after | 236 | 1 | 3.4 s ¹ | 71 s | 6 s | **80 s** |
| First-timer, no number (Wake-Up) | before | 153 | 0 | 0.7 s | 46 s | 126 s ² | **173 s** |
| | after | 296 | 1 | 1.1 s | 89 s | 126 s ² | **216 s** |
| Returning, hooper | before | 127 | 0 | 0.8 s | — | 6 s | **7 s** |
| | after | 75 | 0 | 0.8 s | — | 6 s | **7 s** |
| Returning, jumper (hops) | before | 177 | **1** | 0.6 s | — | 6 s | **7 s** |
| | after | 68 | 0 | 0.8 s | — | 6 s | **7 s** |

¹ The demo's Babylon stage loads while the first-timer reads. On a 4× throttled CPU it delays the Start tap by about 2.7 s.
² The Wake-Up's first phase ("Loosen up", 2 min) has no target to count. The first rep of the main drill is at 246 s
(after the 4-minute warm-up) for every short drill, in both builds.

What this says: a first-timer now reads about 35–45 s more before starting, which is the explainer, the steps, the
cues and the setup the owner asked for. A returning player reads 40–60% fewer words to reach Start, and no longer
scrolls on the hop drill. Taps and screens are unchanged (3 and 4).

In-drill (pogo plan, `live-jump-*.png`): the controls in view while running were "End the drill" (before) and "Pause ·
Stop · This hurts: stop" (after), on every running shot (warm-up, set, rest). There was no horizontal overflow and no
page error on any shot. The rig's paused shot shows the space-check stand-in, because the fake body play never goes
`off`. On a phone, `pause()` turns the camera off and DrillLive shows its "Turn the camera on" card (pinned in
`liveDrill.test.ts`).

## Would a first-timer understand? (walked on the shots)

| # | Question | Before | After |
|---|---|---|---|
| 1 | Why am I doing this drill today? | Partly. "Picked from your lowest number: jump, 26 in best jump." does not say how the drill helps that number | Yes. "Your jump is your lowest number right now (26 in best jump), so today's drill works on quick, springy hops." (`drill-jump.png`) |
| 2 | What will it do for me? | No | Yes. "Builds springy ankles for a quicker first step and a higher jump." |
| 3 | What exactly do I do, and for how long? | Partly. Eight cards in the book's words ("Pressurize the System", "Wake Up the Tripod", "Set 1 · 0.3 min"), and the demo was behind a tap and T-posed | Yes. 4 numbered steps, the minutes, 3 key cues, and a looping demo of the move |
| 4 | Where do I put my phone, and what do I need? | No. It was only inside the space check, after Start | Yes. "Before you start": phone, distance, floor, shoes, and the framing check |
| 5 | How did I do, and what's next? | Partly. Beat counts and "Timing overall", no meaning, nothing about tomorrow | Yes. What we saw / what it means / what's next, plus the credits and streak (`live-jump-done.png`) |

## Copy style

Every fixed line in `guide.ts` is screened in `guide.test.ts`. None contains a word from `MEDICAL_WORDS`. Every line of
5 or more words reads at Flesch–Kincaid grade 8 or below, and the set averages 6 or below (measured: mean 1.2, max 7.6
over 74 lines; short cues score low on this formula). The low-score meanings are checked for blame words. This also
caught the old `STOPPED_LINE`'s "diagnosis", which is reworded: "Today's drill is on pause. Check with a clinician
first, then clear it from the Mirror. It's a pause, not a verdict." The cue-rewrite lane's `docs/CUE-STYLE.md` was not
on origin when this lane ran. When it lands, `guide.ts` is the one file to re-read against it.

## Owner calls

1. **Copy for review (product copy):** every line in `guide.ts` (plain names, why-today, improves, cues, steps, the
   during words, the three result bands, the hurt panel's two lines) and the reworded `STOPPED_LINE`.
2. **First-timer page length:** a first-timer who reads everything reads for about a minute or more (see the table).
   Following the owner's 2026-10-27 call, nothing is folded away. Start is always on screen, so reading is a choice,
   not a gate.
3. **The shooting → landings link:** "Steady landings are the base of a good jump shot." It is the existing mapping's
   reasoning (`plan.ts`), now said out loud.
4. **The demo:** the T-pose was the drills page's old `DrillDemo` (`exercise-avatar-canvas`, one unrelated clip; on this
   rig the head was off the canvas, `shots/before/demo-jump-*.png`). This page mounts the shared library stage instead.
   lane/library-anatomy-2 (pushed, not yet merged) adds `components/library/avatar-demo.tsx` with a bind-pose guard and
   the "Demo coming" still. Once it lands, `drill-demo-loop.tsx` should become `<AvatarDemo clip={drillDemoLoop(id)} />`,
   a one-line swap. It is not done here, because that file is not on this lane's base. The slow squat check and the
   Wake-Up show the cue card.
5. **assumption:** "the 10/day cap" in the brief could not be found as a rule in this code (searched `lib/`, `app/`,
   `docs/`). This lane changes no cap, gate, youth rule, claim or economy number, so whatever it names is untouched.
