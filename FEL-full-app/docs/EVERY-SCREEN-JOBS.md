# Training and coaching: every job, walked

**Phase 1, part B of `docs/PLAN-EVERY-SCREEN-10PHASE.md`.** The fifteen jobs of the phase-1 brief, walked on the real app as three people: 18 walks, because starting, logging and finishing a session are walked both as an athlete alone (the program the AI built) and as a coached client (the coach's session). Written by `scripts/every-screen/jobs.mts --report`; the walks are `scripts/every-screen/jobs-list.mts`.

**Taps and waits (phase 2).** In the session player a tap is counted only where the screen asks for one (the bright button: a counted set, or a pause). The ready count, every rest and every timed set run by themselves; the rig presses the quiet "skip" there instead of waiting out the clock, and counts those apart as waits, not taps.

**How to read it.** Taps are counted from the signed-in home; the Train tab is one tap. Typing is counted apart. Seconds are the rig's own, with no reading time: a floor, not a person's time. A camera job is walked to the moment it needs a person in front of the camera. "Stops" means a person cannot go further on that path today, and says where.

**Today: 31 of 31 jobs can be walked to their end** (or to the camera); 0 stop.

## An athlete training alone

| Job | Taps | Typing | Seconds | What happens | The plan's budget |
|---|---|---|---|---|---|
| Pick a game on Play and start playing | 2 | – | 31 | finishes | pick a game → playing in ≤ 2 taps (phase 7) |
| The party room: what each empty seat waits for | 0 | – | 0 | reaches it: the lobby: it waits for phones or controllers to join | a lobby always says what it is waiting for (phase 7) |
| Start today's workout (today's drill) | 3 | – | 2 | reaches it: the drill is on camera: it needs a person in the picture | open app → first exercise in ≤ 2 taps and ≤ 10 s (phase 2) |
| Start today's workout (a program kept on this phone) | 2 | – | 8.2 | finishes | open app → first exercise in ≤ 2 taps and ≤ 10 s (phase 2) |
| Ask the AI builder for a program and start it | 4 | 1 | 10.4 | finishes | ask → first rep in ≤ 4 taps (phase 3) |
| Change one thing in the program the AI built, and start it | 3 | – | 1.4 | finishes | change one thing without starting over; save, and start (phase 3) |
| Log a set (in the program the AI built) | 1 | – | 8.4 | finishes | log a set in 1 tap (phase 2) |
| Finish a session (in the program the AI built) | 15 (14 sets + 1 other) (+ 44 waits the rig skipped) | – | 40.1 | finishes | a 5-exercise session in ≤ 12 taps beyond the sets (phase 2) |
| Test a jump (measure my vertical) | 3 | – | 2.6 | reaches it: the camera: three jumps in front of it (the reading itself is measured on recorded jumps, not on this rig) | vertical in ≤ 3 taps (phase 4) |
| Run the movement screen | 3 | – | 2.6 | reaches it: the camera: four moves in front of it | movement screen in 3 taps and under 3 minutes (phase 4) |
| See progress | 2 | – | 2 | finishes | progress number → its source in 1 tap (phase 4) |
| See where a progress number came from | 2 | – | 10.9 | finishes | progress number → its source in 1 tap (phase 4) |
| Find and join a group | 0 | – | 0 | reaches it: switched off until the group-booking tables are applied: the screen says so and offers what to do instead | join a group in ≤ 4 taps (phase 5) |
| Book a 1:1 | 1 | – | 0.6 | reaches it: switched off until the group-booking tables are applied: the screen says so and offers what to do instead | book a 1:1 in ≤ 5 taps (phase 5) |
| Cancel a booking | 0 | – | 0 | reaches it: switched off: nothing can be booked, so there is nothing to cancel; the notice says what to do instead | cancel in ≤ 3 taps with the rule shown first (phase 5) |
| Find and join a group (booking open) | 4 | – | 1.9 | finishes | join a group in ≤ 4 taps (phase 5) |
| Book a 1:1 (booking open) | 5 | – | 2.4 | finishes | book a 1:1 in ≤ 5 taps (phase 5) |
| Cancel a booking (booking open) | 3 | – | 1.4 | finishes | cancel in ≤ 3 taps with the rule shown first (phase 5) |

## A coached client

| Job | Taps | Typing | Seconds | What happens | The plan's budget |
|---|---|---|---|---|---|
| Start today's workout (the coach's session) | 2 | – | 1 | finishes | open app → first exercise in ≤ 2 taps and ≤ 10 s (phase 2) |
| Log a set (the coach's session) | 1 | – | 8.2 | finishes | log a set in 1 tap (phase 2) |
| Finish a session (the coach's session) | 9 (8 sets + 1 other) (+ 28 waits the rig skipped) | – | 25.1 | finishes | a 5-exercise session in ≤ 12 taps beyond the sets (phase 2) |

## The coach

| Job | Taps | Typing | Seconds | What happens | The plan's budget |
|---|---|---|---|---|---|
| See who trained | 2 | – | 2 | finishes | "Who needs me today" is the coach's first screen (phase 5) |
| Adjust a program (change one exercise) | 6 | – | 3.4 | finishes | adjust one exercise in ≤ 4 taps (phase 5) |
| Review a form clip | 3 | – | 1.6 | reaches it: switched off until the form-review table is applied: clients film a set and read their own flags; nothing reaches the coach yet, and the screen says so | – (phase 5) |
| Take group attendance | 3 | – | 2.4 | reaches it: switched off until the group-booking tables are applied: the screen says so and offers what to do instead | attendance in ≤ 1 tap per person (phase 5) |
| Open shot charts | 4 | – | 3 | reaches it: switched off until the shot-chart table is applied: the screen says so and offers a way back | – (phase 5) |
| Take group attendance (booking open) | 4 | – | 2.4 | finishes | attendance in ≤ 1 tap per person (phase 5) |

## What changed in phase 7 (around the games, measured on the rig)

The plan's gate: pick a game → playing in ≤ 2 taps; results → play again in 1; a lobby always says what it is waiting
for; every screen in this group passes all four checks. Not the play itself, and no feel number changed.

| Job | Now | The plan |
|---|---|---|
| Pick a game on Play and start playing (throttled phone) | 2 taps (the game, Tap to start), 35 s with the arena's load | ≤ 2 taps |
| Results → play again | 1 tap: the end screen's first, focused button is Play again (its own tests: `components/games/end-screen/end-screen.test.tsx`). Not walked: a whole game cannot be driven to its results in a production build on the rig. | 1 tap |
| A lobby says what it waits for | The party room: every empty seat says "Scan the code · or press A on a controller". Online parties are switched off; versus challenges are asynchronous (no waiting room); `/host` opens the game's own start card. | always |
| Owner (2026-11-11): sign up with a birth date, then the vertical test | No "How old are you?": straight to the pain question (the LIT rig, where the birth date is kept). On the main rig, as in production today, only the year is kept, and the question is asked. | asked once |

**The phase's 49 read screens:** 5 pass all four checks (2 before the phase); 11 more have no fault but "fast" not
measured (a 3D screen's tap time on a rig with no GPU). The wordless loading spinner is gone from all 26 game screens.
What still fails, and why it stays:

- the start card's how-to lines are 14 px and zoom with the rows to fit (never under 12 px), so a line of more than 12
  words reads as small body text on several modes. Tried in this phase: unzoomed lines that scroll at 14/16 px pass six
  more screens, but the panel then cut its own words off at 150 % and 200 % text (who-scene-it). Kept the version that
  hides nothing; a panel that scrolls as a whole is the fix (phase 10);

- the in-game HUD's 12 px plates (`data-hud-plate`, the score, RD 1/2) on several modes: the play itself, not this phase's;
- `/play`: the shelf's mode lists clip at three lines (the owner's line-clamp-3, 2026-11-10);
- `/play/party` jumped as it loaded in the last reading (0.052): not found in this phase;
- the tiebreak HUD's title under the shell's "⋯" capture menu: the HUD is the play itself, and the menu owns the stage's
  corner in every mode (a gameplay-lane or owner call);
- `/arena`: the owner's arena age-gate screen (#543), read only;
- words over 40 on the setup screens of acting, irl, calibrate, music, baseball, dunkduel, the party pages and the map
  preview (their own explanations; cutting them is new copy);
- the tennis start card's 0.138 shift did not reproduce (layout shift 0 in this crawl); `/coach/join/[token]`'s top bar
  arriving late reproduced once (0.135, phase 5's finding).

## What changed in phase 6 (the first five minutes, measured on the rig)

The plan's gate: a new person goes from the home page to doing something real (a game or a first workout) in ≤ 4 taps and
under 60 s on the throttled phone; sign-up asks for nothing twice; every screen in this group passes all four checks. The
walks below are a new person, signed out, on the throttled phone (CPU 4×, as the crawl reads every screen).

| Job | Now | The plan |
|---|---|---|
| From the home page to playing a game | 3 taps, 30 s: Play now, Play without saving (the arena loads), Tap to start | ≤ 4 taps, under 60 s |
| From the home page to a first workout (the vertical test) | 3 taps, 4 s to the camera: Measure my vertical, 18 or older, No, nothing hurts | ≤ 4 taps, under 60 s |
| Sign up | birth date (year, month, day), then the name, email and password, the terms tick: each asked once; it lands in the first game picked | asks for nothing twice |

**Asked again after sign-up (not changed: an age rule, the owner's call).** Sign-up records the birth date; the Quick Screen
and the vertical test then ask "How old are you?" again (the walk "New: sign up, then the vertical test"). Proposal for the
owner: for a signed-in person whose birth date is on file, take the screen's age band from the account and skip the
question. The question, its bands and what each band does would stay exactly as they are for everyone else.

### The phase's screens

| Screen | Result | Why |
|---|---|---|
| `/` | passes all four | The home headline (PR #540) is unchanged. |
| `/age` | redirects to `/` | |
| `/consent/guardian` | passes all four (was: 90 words) | Its two lines are approved consent and privacy notices (71 words), now marked and not counted; the wording is unchanged (`lib/consent/guardian-copy.ts`). |
| `/consent/guardian/[token]` | not read | Needs a guardian-consent row with its emailed token; the rig has none. |
| `/join` | passes all four | |
| `/login` | listed: 41 words (the budget is 40) | Was 166: the scorer counted the venue strip's cards past the right edge. One word over. Proposal (owner's wording): the tagline "Real sports, real training — your on-court reps become real stats." as "Real sports. Real training. Real stats." |
| `/signup` | listed: 51 words; 4 button looks; Continue answers in 280 ms | The age step comes first (an age rule) and its Continue is the age step's own (`components/age-step.tsx`, read only); under it, "What did you come for?" and its five choices. Proposal: show the five choices once the birth date is confirmed (a change of the flow: the owner's call). |
| `/try` | passes all four (was: QUIT 40 px tall) | |
| `/welcome` | passes all four (was: 13.5 px steps, five sizes) | |

### Approved notices: what the owner's rule changed (2026-11-11)

Medical, privacy and consent notices are marked in the code (`{...notice(kind)}`, only on a constant listed in
`lib/every-screen/notices.ts`) and left out of the 40 words; everything else counts. On the do-this screens that carry one:

| Screen | Phase | Phase 5 (old rule) | Now, all words | Approved notices | Counted | The 40-word rule |
|---|---|---|---|---|---|---|
| `/consent/guardian` | 6 | 90 | 90 | 71 | 19 | fails → passes |
| `/play/mirror/assess` | 4 | 73 | 73 | 31 | 42 | still over |
| `/play/mirror/assess/results` | 4 | 47 | 47 | 14 | 33 | fails → passes |
| `/screen` | 4 | 73 | 73 | 31 | 42 | still over |
| `/screen/program/[lane]` | 4 | 48 | 48 | 14 | 34 | fails → passes |
| `/train/readiness` | 4 | 72 | 72 | 15 | 57 | still over |
| `/train/shots` | 4 | 92 | 92 | 17 | 75 | still over |

**For phase 7 (around the games), not this phase's:** the tennis start card shifts 0.138 when its weather buttons re-wrap;
the game HUD's "…" menu button overlaps the TIEBREAK title at the top left; `/play/freerun` and `/play/tennis` answer a tap
slowly; `/play/adventure-br`'s word count; `/play/adventure` read blank in this crawl (a dead end).

Also in this re-score: words past the right edge (a carousel) are no longer "before scrolling": `/login` 166 → 41,
`/play/map-preview` 71 → 47.

## What changed in phase 5 (phase 4's "after" → now, measured on the rig)

Booking is switched off in production until the owner applies `prisma/pending/2026-11-02-group-booking.sql` and sets
the business owner: there the four booking walks still end at "Opens soon" with what to do instead. The rows marked
**(booking open)** are walked on the LIT rig (`scripts/every-screen/jobs.mts --lit`: every pending file applied, the
rig's coach as the business owner, one group seeded by `scripts/every-screen/booking-seed.mts`), as the screens will be
once the SQL is applied. Taps are counted from the home, as in every phase.

| Job | Phase 4 | Now | What changed |
|---|---|---|---|
| Find and join a group (booking open) | the switched-off notice, by its address | 4 taps (the plan: ≤ 4): Train, Groups, Join, Reserve | Train shows Groups and Book a 1:1 once booking is open (`app/train/page.tsx`, `groupBookingOpen`); nothing leads to "Opens soon" while it is off. |
| Book a 1:1 (booking open) | the notice | 5 taps (the plan: ≤ 5): Train, Book a 1:1, the gym, a time, Reserve | With one way to book open (in person while the coach store is off) it is already picked (`one-on-one-booker.tsx`). |
| Cancel a booking (booking open) | the notice | 3 taps (the plan: ≤ 3), the owner's cancel rule on screen before the first: Train, Cancel, "Cancel free" | Train shows your next two sessions with the rule above them (`my-group-sessions.tsx`, compact); the confirm button says what it costs. |
| Take group attendance (booking open) | the notice | 3 taps to today's roster, then 1 tap a person (the plan: ≤ 1 a person) | A group that meets today opens on today's roster (`coach-groups.tsx` todaySlot); its buttons are 44 px. |
| Adjust a program (change one exercise) | 8 taps (6 from the coach's first screen) | 6 taps (4 from the coach's first screen; the plan: ≤ 4) | The athlete's Program tab lists the next session; an exercise, then an effort band, and it is saved (`components/coach/quick-adjust.tsx`). The full builder is one tap away. |
| See who trained | 2 taps | 2 taps | Unchanged: "Needs you" and the week are the coach's first screen. |
| Change one thing in the program the AI built | 2 taps | 3 taps | Carried from phase 4: once a program is built, what FEL read folds into one line ("What FEL read: … Change"), so changing a chip is one more tap. The first screen after a build is the program. |

Every phase-5 change has a test that fails on the old code: `tests/every-screen/phase5.test.tsx`. The 61 training and
coaching entries, each passing all four checks or listed with the reason: `docs/every-screen/TRAINING-SCREENS.md`.

## What changed in phase 4 (phase 3's "after" → now, measured on the rig)

| Job | Phase 3 | Now | What changed |
|---|---|---|---|
| Test a jump (measure my vertical) | 4 taps (through Train) | 3 taps (the plan's budget: ≤ 3) | Walked from the home's "Measure my vertical" chip, as the VERTICAL-EASY gate counts it; the door through Train is one more. |
| Run the movement screen | 4 taps (through Train) | 3 taps, and 143 s from the camera to the result on the computer-made mover (the plan: 3 taps, under 3 minutes) | From the home's "Screen my movement" chip; the time is `scripts/every-screen/trust.mts` (lib/screen-easy/sim.ts, 8 seeds). |
| See progress → a number's source | – | 1 tap on the row; 1 more opens the tool (walked on the rig with two jump checks put on the phone as the jump check keeps them: the rig cannot jump in front of a camera) | Each row opens on the tool, how it measures and how sure, a link to the tool, and each number's own test and time (`components/progress/progress-view.tsx`). |
| Build a program: the first screen after it is built | The ask box and BUILD IT on top; the last two chip rows and "FEL assumed" sat under START TODAY | The ask folds to one line with "Change the ask"; every chip and "FEL assumed 5 things" sit above START TODAY | Words before scrolling went 92 → 117, not down to 40: the fold brings the chips and the program's summary into the first screen, and the budget counts every visible word. Reaching 40 means hiding the chips or the summary (an owner or layout call; not done). |

Every measured number now carries a line under it: how it was measured, and its ± from a measurement on the repository's fixtures (`docs/every-screen/TRUST.md`).

## What changed in phase 3 (phase 2's "after" → now, measured on the rig)

| Job | Phase 2 | Now | What changed |
|---|---|---|---|
| Ask the AI builder for a program and start it | 5 taps, 2.9 s | 4 taps, 10.9 s (the plan's budget: ask → first rep in ≤ 4) | The walk no longer presses the ready count's quiet "Start now": the count runs by itself (phase 2). The seconds now include that 5-second count and the build. |
| Change one thing in the program the AI built, and start it | – (new walk) | 2 taps, 1 s | The days chip's + rebuilds the plan in place; Start today. |
| Any request at all | 1 in 3 refused | every one of 10,080 grid requests gets a plan | The builder's own checks refused 1,489 of 5,040 requests with an error (no plan). The fixes are in `lib/program-ask/build.ts`; when a request cannot be met exactly, the nearest one that keeps every rule is built and the plan says so (`lib/program-ask/kept.ts`). |

The builder's written rules and the 24 fixed asks: `lib/program-ask/asks24.test.ts`; the grid: `scripts/every-screen/builder-rules.mts`.

## What was fixed in phase 2 (phase 1's "after" → now, measured on the rig)

| Job | Phase 1 after | Now | What changed |
|---|---|---|---|
| Finish a session (athlete alone, the program the AI built) | 65 taps | 18 taps: 17 sets + 1 (Back) | The player's bright button is shown only when the screen needs the person: a counted set ("Set done") or a pause. The ready count, rests and timed sets already run by themselves; their "Skip rest" / "Start now" is now a quiet button, so it no longer reads as the thing to press (`components/session-player/session-player.tsx`). The walker had pressed it 47 times. |
| Finish a session (coached client) | 37 taps | 9 taps: 8 sets + 1 | The same change. |
| Start today's workout (coached client) | 3 taps, 11 s | 2 taps, 1 s | Train's first card is Today's session; tapping it opens the session already started (`/coach?start=today`; `lib/coach/todayCard.ts`, `app/coach/_components/today-view.tsx`). |
| Start today's workout (a program kept on this phone) | – (new walk) | 2 taps, 8.7 s | Train shows "Your program" under Today when the phone holds a program the AI built; it opens the next session already started (`components/every-screen/resume-program-card.tsx`, `/train/build?start=today`). |
| Start today's workout (today's drill) | 3 taps | 3 taps for a first-timer (deliberate: the first time explains the camera); 2 for a returning athlete (covered by a test, not walked: the rig's athlete is a first-timer) | "Start" on the daily-drill card goes straight to the camera for someone who has done a drill before (`?start=1`). |

Every phase-2 fix has a test that fails on the old code: `tests/every-screen/phase2.test.tsx`.

## What was fixed in phase 1 (before → after, measured on the rig)

| Job | Before | After | What changed |
|---|---|---|---|
| Ask the AI builder for a program and start it; log a set; finish a session (athlete alone) | **Stopped**: "Start today" opened the session player under the tab bar and the status rail. Its one button (Start now / Set done) and its close and pause could not be tapped, so the program the AI built could not be trained at all. | Done: ask → first exercise in 5 taps and 1 typed line; a set in 1 tap; the 5-week band program's first session finishes in 65 taps. | The player mounts in a Layer at the end of the page, as Today's and the signature programs' already did (`components/program-ask/program-builder.tsx`). |
| See progress | **Stopped**: Train had no door to "My progress"; it was linked only from a result card, so it could be found only after taking a test. | 2 taps (Train, My progress). | A Train row (`app/train/page.tsx`, `messages/en/train.json`). |
| Find and join a group; book a 1:1; cancel a booking (athlete); take group attendance (coach) | **Stopped**: "Opens soon" and nothing else, on every booking screen. | Each says why ("Group training isn't open for booking yet.") and offers one thing to do instead ("Train on your own today" / "Back to your roster"). | `OpensSoon` takes a why line and one link (`components/shop/opens-soon.tsx`, `lib/group-booking/copy.ts`); the shop's product cards are unchanged. |
| Open shot charts (coach) | **Stopped**: the notice, and no way on but the tab bar. | The notice, then "Back to Coach" and "Track shots yourself". | `components/hoops-cam/coach-shots.tsx`. |
| Also fixed, not a job of their own | The coach's bar-speed screen, the athlete's combines, the signature-programs list and squads and teams: each a switched-off notice with no way on. The coach's "share a result?" link: said "This link is not for this account." to the client it was for, and led nowhere. | Each has its links to what works today; the share link says sharing is not switched on yet. | `components/every-screen/dark-instead.tsx` and its five uses; `components/coach-business/highlight-consent.tsx`. Squads and the share link were fixed after the "after" build: covered by tests, not re-measured on the rig. |

Every fix has a test that fails on the old code: `tests/every-screen/stops-a-person.test.tsx`.

## What the walks found for the next phases (not fixed here: polish, not a stop)

Ranked by how many people it costs, most first.

1. **Phase 2: finishing a session costs a tap per rest.** Every rest needs "Skip rest" (or a wait), so the coach's
   3-exercise, 18-set session is 37 taps (18 sets, 18 rests, 1 start) and the AI builder's first band session is 65.
   The plan's gate is ≤ 12 taps beyond the sets. The walk taps the one big button each time, as a person following the
   screen would; whether a rest also ends by itself without the tap is phase 2's to measure (not measured here). Phase 2
   owns the session player.
2. **Phase 5: adjusting one exercise takes 7 taps** (Train, Your roster, the athlete, Open the builder, Edit, the
   effort, Save) against the plan's ≤ 4, and the builder opens on every week of the block at once (a long scroll to
   the week being edited).
3. **Phase 5: the groups page has no door in the app.** `/groups` is linked only from the coach's own groups screen
   and from the 1:1 page. Nothing an athlete sees links to it. While it is switched off this costs nothing; the day it
   opens, Train needs a row for it (and the job "find and join a group" needs it to be findable at all).
4. **Phase 2: today's session for a coached client starts on the Coach screen, behind a card.** Train → the Today card
   → Start: 3 taps and about 11 s on the rig, of which about 5 s is the ready count. The plan's gate is ≤ 2 taps and
   ≤ 10 s from opening the app.
5. **Phase 4: the vertical and the movement screen ask the same two questions every time** (age, then "does anything
   hurt?") before the camera: 4 taps from home. The plan holds "vertical in ≤ 3 taps".
6. **Phase 4: the camera check says "This device may be slow"** on the rig's software-drawn browser before every
   camera test. On a real phone this depends on the phone; not measured here.
7. **Phase 5: "Review a form clip" reaches a queue that says sending opens soon** (the form-review table). It already
   says why and has a Back button, so it does not stop the coach; it is listed in the dark screens.

