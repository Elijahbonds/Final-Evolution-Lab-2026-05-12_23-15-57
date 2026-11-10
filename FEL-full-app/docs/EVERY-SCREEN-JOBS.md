# Training and coaching: every job, walked

**Phase 1, part B of `docs/PLAN-EVERY-SCREEN-10PHASE.md`.** The fifteen jobs of the phase-1 brief, walked on the real app as three people: 18 walks, because starting, logging and finishing a session are walked both as an athlete alone (the program the AI built) and as a coached client (the coach's session). Written by `scripts/every-screen/jobs.mts --report`; the walks are `scripts/every-screen/jobs-list.mts`.

**How to read it.** Taps are counted from the signed-in home; the Train tab is one tap. Typing is counted apart. Seconds are the rig's own, with no reading time: a floor, not a person's time. A camera job is walked to the moment it needs a person in front of the camera. "Stops" means a person cannot go further on that path today, and says where.

**Today: 18 of 18 jobs can be walked to their end** (or to the camera); 0 stop. Before this phase's fixes: 9 of 18.

## An athlete training alone

| Job | Taps | Typing | Seconds | Before | What happens | The plan's budget |
|---|---|---|---|---|---|---|
| Start today's workout (today's drill) | 3 | – | 2.1 | 3 taps, 2.2 s | reaches it: the drill is on camera: it needs a person in the picture | open app → first exercise in ≤ 2 taps and ≤ 10 s (phase 2) |
| Ask the AI builder for a program and start it | 5 | 1 | 4.7 | stopped at step 7 | finishes | ask → first rep in ≤ 4 taps (phase 3) |
| Log a set (in the program the AI built) | 1 | – | 9.7 | stopped at step 6 | finishes | log a set in 1 tap (phase 2) |
| Finish a session (in the program the AI built) | 65 | – | 72.8 | stopped at step 5 | finishes | a 5-exercise session in ≤ 12 taps beyond the sets (phase 2) |
| Test a jump (measure my vertical) | 4 | – | 4.2 | 4 taps, 3.9 s | reaches it: the camera: three jumps in front of it (the reading itself is measured on recorded jumps, not on this rig) | vertical in ≤ 3 taps (phase 4) |
| Run the movement screen | 4 | – | 3.9 | 4 taps, 4.1 s | reaches it: the camera: four moves in front of it | movement screen in 3 taps and under 3 minutes (phase 4) |
| See progress | 2 | – | 1.2 | stopped at step 3 | finishes | progress number → its source in 1 tap (phase 4) |
| Find and join a group | 0 | – | 0 | stopped at step 2 | reaches it: switched off until the group-booking tables are applied: the screen says so and offers what to do instead | join a group in ≤ 4 taps (phase 5) |
| Book a 1:1 | 1 | – | 0.6 | stopped at step 3 | reaches it: switched off until the group-booking tables are applied: the screen says so and offers what to do instead | book a 1:1 in ≤ 5 taps (phase 5) |
| Cancel a booking | 0 | – | 0.1 | stopped at step 2 | reaches it: switched off: nothing can be booked, so there is nothing to cancel; the notice says what to do instead | cancel in ≤ 3 taps with the rule shown first (phase 5) |

## A coached client

| Job | Taps | Typing | Seconds | Before | What happens | The plan's budget |
|---|---|---|---|---|---|---|
| Start today's workout (the coach's session) | 3 | – | 11 | 3 taps, 10.9 s | finishes | open app → first exercise in ≤ 2 taps and ≤ 10 s (phase 2) |
| Log a set (the coach's session) | 1 | – | 10.4 | 1 taps, 9.9 s | finishes | log a set in 1 tap (phase 2) |
| Finish a session (the coach's session) | 37 | – | 39.8 | 37 taps, 39.6 s | finishes | a 5-exercise session in ≤ 12 taps beyond the sets (phase 2) |

## The coach

| Job | Taps | Typing | Seconds | Before | What happens | The plan's budget |
|---|---|---|---|---|---|---|
| See who trained | 2 | – | 2.1 | 2 taps, 1.8 s | finishes | "Who needs me today" is the coach's first screen (phase 5) |
| Adjust a program (change one exercise) | 7 | – | 4.7 | 7 taps, 4.7 s | finishes | adjust one exercise in ≤ 4 taps (phase 5) |
| Review a form clip | 3 | – | 2.7 | 3 taps, 2.2 s | reaches it: switched off until the form-review table is applied: clients film a set and read their own flags; nothing reaches the coach yet, and the screen says so | – (phase 5) |
| Take group attendance | 3 | – | 2 | stopped at step 5 | reaches it: switched off until the group-booking tables are applied: the screen says so and offers what to do instead | attendance in ≤ 1 tap per person (phase 5) |
| Open shot charts | 4 | – | 2.7 | stopped at step 6 | reaches it: switched off until the shot-chart table is applied: the screen says so and offers a way back | – (phase 5) |

*Adjust a program (change one exercise):* walked at 11:00 on the before build, opening the athlete from the 'Needs you' card; the coach screens are the same in both builds (this phase did not change them). A walk from the roster strip is queued.

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

