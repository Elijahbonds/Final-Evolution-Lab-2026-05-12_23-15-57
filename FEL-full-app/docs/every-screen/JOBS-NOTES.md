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
