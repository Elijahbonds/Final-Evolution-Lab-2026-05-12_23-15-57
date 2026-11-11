# Training and coaching: every job, walked

**Phase 1, part B of `docs/PLAN-EVERY-SCREEN-10PHASE.md`.** The fifteen jobs of the phase-1 brief, walked on the real app as three people: 18 walks, because starting, logging and finishing a session are walked both as an athlete alone (the program the AI built) and as a coached client (the coach's session). Written by `scripts/every-screen/jobs.mts --report`; the walks are `scripts/every-screen/jobs-list.mts`.

**Taps and waits (phase 2).** In the session player a tap is counted only where the screen asks for one (the bright button: a counted set, or a pause). The ready count, every rest and every timed set run by themselves; the rig presses the quiet "skip" there instead of waiting out the clock, and counts those apart as waits, not taps.

**How to read it.** Taps are counted from the signed-in home; the Train tab is one tap. Typing is counted apart. Seconds are the rig's own, with no reading time: a floor, not a person's time. A camera job is walked to the moment it needs a person in front of the camera. "Stops" means a person cannot go further on that path today, and says where.

**Today: 28 of 28 jobs can be walked to their end** (or to the camera); 0 stop.

## An athlete training alone

| Job | Taps | Typing | Seconds | What happens | The plan's budget |
|---|---|---|---|---|---|
| Start today's workout (today's drill) | 3 | – | 2 | reaches it: the drill is on camera: it needs a person in the picture | open app → first exercise in ≤ 2 taps and ≤ 10 s (phase 2) |
| Start today's workout (a program kept on this phone) | 2 | – | 8.1 | finishes | open app → first exercise in ≤ 2 taps and ≤ 10 s (phase 2) |
| Ask the AI builder for a program and start it | 4 | 1 | 9.8 | finishes | ask → first rep in ≤ 4 taps (phase 3) |
| Change one thing in the program the AI built, and start it | 3 | – | 1.4 | finishes | change one thing without starting over; save, and start (phase 3) |
| Log a set (in the program the AI built) | 1 | – | 8.1 | finishes | log a set in 1 tap (phase 2) |
| Finish a session (in the program the AI built) | 15 (14 sets + 1 other) (+ 44 waits the rig skipped) | – | 36.5 | finishes | a 5-exercise session in ≤ 12 taps beyond the sets (phase 2) |
| Test a jump (measure my vertical) | 3 | – | 2.2 | reaches it: the camera: three jumps in front of it (the reading itself is measured on recorded jumps, not on this rig) | vertical in ≤ 3 taps (phase 4) |
| Run the movement screen | 3 | – | 2.2 | reaches it: the camera: four moves in front of it | movement screen in 3 taps and under 3 minutes (phase 4) |
| See progress | 2 | – | 1.9 | finishes | progress number → its source in 1 tap (phase 4) |
| See where a progress number came from | 2 | – | 10.9 | finishes | progress number → its source in 1 tap (phase 4) |
| Find and join a group | 0 | – | 0 | reaches it: switched off until the group-booking tables are applied: the screen says so and offers what to do instead | join a group in ≤ 4 taps (phase 5) |
| Book a 1:1 | 1 | – | 0.5 | reaches it: switched off until the group-booking tables are applied: the screen says so and offers what to do instead | book a 1:1 in ≤ 5 taps (phase 5) |
| Cancel a booking | 0 | – | 0 | reaches it: switched off: nothing can be booked, so there is nothing to cancel; the notice says what to do instead | cancel in ≤ 3 taps with the rule shown first (phase 5) |
| Find and join a group (booking open) | 4 | – | 2 | finishes | join a group in ≤ 4 taps (phase 5) |
| Book a 1:1 (booking open) | 5 | – | 2.5 | finishes | book a 1:1 in ≤ 5 taps (phase 5) |
| Cancel a booking (booking open) | 3 | – | 1.4 | finishes | cancel in ≤ 3 taps with the rule shown first (phase 5) |

## A coached client

| Job | Taps | Typing | Seconds | What happens | The plan's budget |
|---|---|---|---|---|---|
| Start today's workout (the coach's session) | 2 | – | 1 | finishes | open app → first exercise in ≤ 2 taps and ≤ 10 s (phase 2) |
| Log a set (the coach's session) | 1 | – | 7.8 | finishes | log a set in 1 tap (phase 2) |
| Finish a session (the coach's session) | 9 (8 sets + 1 other) (+ 28 waits the rig skipped) | – | 22.7 | finishes | a 5-exercise session in ≤ 12 taps beyond the sets (phase 2) |

## The coach

| Job | Taps | Typing | Seconds | What happens | The plan's budget |
|---|---|---|---|---|---|
| See who trained | 2 | – | 2 | finishes | "Who needs me today" is the coach's first screen (phase 5) |
| Adjust a program (change one exercise) | 6 | – | 3.9 | finishes | adjust one exercise in ≤ 4 taps (phase 5) |
| Review a form clip | 3 | – | 2.4 | reaches it: switched off until the form-review table is applied: clients film a set and read their own flags; nothing reaches the coach yet, and the screen says so | – (phase 5) |
| Take group attendance | 3 | – | 2.4 | reaches it: switched off until the group-booking tables are applied: the screen says so and offers what to do instead | attendance in ≤ 1 tap per person (phase 5) |
| Open shot charts | 4 | – | 2.9 | reaches it: switched off until the shot-chart table is applied: the screen says so and offers a way back | – (phase 5) |
| Take group attendance (booking open) | 4 | – | 2.9 | finishes | attendance in ≤ 1 tap per person (phase 5) |

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

