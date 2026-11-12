# The every-screen scorecard

**Owner, 2026-11-10:** "To improve the total quality of the product from improving every screen."

Every screen a person can reach, scored on the plan's four checks (`docs/PLAN-EVERY-SCREEN-10PHASE.md`): phase 1 was the starting line; this is phase 10's re-score of all of them. Written by `scripts/every-screen/score.mts --report` from the rig's last run (2026-11-12); do not edit it by hand.

## The number

**57 of 187 screens pass all four checks.**

*Five rows re-measured by `lane/coach-words` on 2026-11-12 (the same scorer, version 6, two reads each), and patched into this page by hand because a five-screen run cannot regenerate the rest: `/coach/business/thanks`, `/coach/form-review`, `/coach/highlight/[id]`, `/coach/join/[token]`, `/coach/session`. Every other row, and the phase-1 column, is the every-screen run. Three of the five now pass. The owner approved every row of `docs/COACH-WORDING-REVIEW.md` on 2026-11-12, and options A–C; `/coach/form-review` and `/coach/join/[token]` were read twice more after A–C.*

| | Screens |
|---|---|
| Pages a person can reach (`app/**/page.tsx`, less the developer pages) | 187 |
| Scored on the rig | 154 |
| Not a screen of its own: it only sends you on to another | 7 |
| Switched off: a 404 for everyone today | 20 |
| Not scored, with the reason (section 5) | 6 |
| **Pass all four** | **57** |
| Training and coaching (phases 2–5): pass all four | 17 of 61 (44 scored) |

| Check | Pass | Fail | Not measured |
|---|---|---|---|
| 1. Clear and quick | 105 | **49** | 0 |
| 2. Looks finished | 88 | **66** | 0 |
| 3. Fast and smooth | 120 | **16** | 18 |
| 4. Right and trustworthy | 147 | **7** | 0 |

Of the 154 scored screens. "Not measured" is a 3D screen's tap time: the rig has no real GPU, so that one number is left open and the screen is not counted as passing.

## Before (phase 1) → after (phase 10), every screen

**Phase 1 (2026-11-10, `2829eb31`): 4 of 184 screens passed all four. Now: 57 of 187.** The scorer was tightened between them (READABLE's body-size rule, the notices rule, clipped text at 150 % and 200 %), so a ✓ now is harder to get than a ✓ then.

Checks in order: 1 clear and quick · 2 looks finished · 3 fast and smooth · 4 right and trustworthy (✓ pass · ✗ fail · ? not measured).

| Screen | Phase 1 | Now | Passes | Why not (the single worst problem) | What it needs |
|---|---|---|---|---|---|
| `/` | ✓ ✓ ✓ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/account` | ✗ ✗ ✗ ✓ | ✓ ✓ ✗ ✓ | no | The screen jumps as it loads (layout shift 0.112; the budget is 0.02). | a fix: the "Jump numbers" panel (components/privacy/scan-save-account.tsx) draws nothing until its two fetches answer, then appears at the top of the page for a verified adult and pushes every section under it down. Layout shift 0.112 / 0.112 / 0.106 over three reads on 2026-11-12 (median 0.112; the budget is 0.02). Phase 10B read 0.001; assumption: its rig person was not shown the panel. Reserving the panel's room, or deciding it on the server, fixes it |
| `/account/bookings` | off | off | no | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) | owner: switch it on — COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/account/coaching` | ✗ ✓ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/admin/funnel` | ✗ ✗ ✗ ✓ | ✗ ✗ ✓ ✓ | no | An empty state with no next step: "No wins yet". | owner: the owner's tools, left as they are |
| `/admin/metrics` | ✗ ✗ ✗ ✓ | ✓ ✗ ✗ ✓ | no | An empty state with no next step: "No stored rollups yet. Click “Recompute” to generate them from traffic.". | owner: the owner's tools, left as they are |
| `/admin/review` | ✗ ✗ ✗ ✗ | ✗ ✗ ✓ ✗ | no | "WAITING" does nothing when tapped. | owner: the owner's tools, left as they are |
| `/age` | sends on | sends on | no | redirects to / for everyone who is signed in | nothing: it sends you on to its own screen |
| `/arena` | ✗ ✗ ✗ ✗ | ✗ ✗ ✓ ✗ | no | 1 serious accessibility finding (contrast). | owner: the arena age-gate screen (#543), read only |
| `/c/[code]` | off | off | no | not switched off: a challenge code that does not exist is the app's 404 (a real challenge needs a row a player makes by sending one) | nothing: not switched off: a challenge code that does not exist is the app's 404 (a real challenge needs a row a player makes by sending one) |
| `/c/[code]/play` | sends on | sends on | no | redirects to /c/NONE00 for everyone who is signed in | nothing: it sends you on to its own screen |
| `/camp` | ✗ ✗ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/card/[slug]` | not scored | not scored | no | not scored: needs a published creator card row; a new account has none | a row the rig cannot make: needs a published creator card row; a new account has none |
| `/cards` | ✗ ✗ ✗ ✗ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/closet` | ✗ ✗ ✗ ✗ | ✓ ✗ ? ✓ | no | 8 button looks on one screen (at most 3). | a design call: one button look for the studio's tools (10 → 8 in phase 10); 3D: the tap time needs a phone. Clothes: kit-glitch lane |
| `/coach` | ✗ ✓ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/coach-terms` | ✗ ✗ ✓ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/coach/[slug]` | off | off | no | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL); or COACH_MARKETPLACE_ENABLED (find a coach) | owner: switch it on — COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL); or COACH_MARKETPLACE_ENABLED (find a coach) |
| `/coach/[slug]/book/[listingId]` | off | off | no | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) | owner: switch it on — COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/[slug]/fee/[packageId]` | off | off | no | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL); or COACH_MARKETPLACE_ENABLED (find a coach) | owner: switch it on — COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL); or COACH_MARKETPLACE_ENABLED (find a coach) |
| `/coach/[slug]/programs/[lane]` | off | off | no | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) | owner: switch it on — COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/admin` | ✗ ✗ ✗ ✗ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/coach/admin/library` | ✗ ✗ ✗ ✓ | ✗ ✗ ✓ ✓ | no | 114 paragraphs of body copy under 16 px. | owner: the owner's tools, left as they are |
| `/coach/admin/programs` | ✗ ✗ ✗ ✓ | ✗ ✗ ✗ ✓ | no | 343 words before scrolling (the budget is 40). | owner: the owner's tools, left as they are |
| `/coach/business` | ✗ ✗ ✗ ✓ | ✗ ✗ ✓ ✓ | no | An empty state with no next step: "Coach Pro is not on sale yet. Nothing is limited until it is.". | owner: Coach Pro is not on sale; its empty line is the owner's |
| `/coach/business/thanks` | ✗ ✗ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/coach/combine` | ✗ ✗ ✗ ✓ | ✗ ✗ ✓ ✓ | no | Unfinished mark on screen: "Saving combines to your account is coming soon. This combine is kept on this pho". | owner: the feature is not built or not switched on ("coming soon"); owner-gated |
| `/coach/dashboard` | off | off | no | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) | owner: switch it on — COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/dashboard/settings` | off | off | no | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) | owner: switch it on — COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/form-review` | ✗ ✗ ✗ ✓ | ✗ ✓ ✓ ✓ | no | 41 words before scrolling (the budget is 40; 6 words of approved notices not counted). | owner: one word over after every approved cut (docs/COACH-WORDING-REVIEW.md rows 2.1-2.5, options A and B approved 2026-11-12): 56 -> 41 counted words (47 on the screen, 6 of them an approved privacy notice) on lane/coach-words' two reads (41, and 43 on the read that carried the rig's two-word "+100 coins" pop-up). What is left is the label, the exercise name, the setup line, the camera-and-estimate line and the button: a next cut is the owner's call |
| `/coach/groups` | ✗ ✗ ✗ ✓ | ✓ ✗ ✓ ✓ | no | Unfinished mark on screen: "Opens soon". | owner: group booking opens with the training deploy (its tables) |
| `/coach/highlight/[id]` | ✗ ✗ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/coach/join` | ✗ ✗ ✓ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/coach/join/[token]` | ✗ ✗ ✗ ✓ | ✓ ✓ ✗ ✓ | no | The screen jumps as it loads (layout shift 0.064; the budget is 0.02). | speed (a fix, not wording): words now pass (owner-approved option C, 2026-11-12: 20 counted, the consent line an approved notice). On lane/coach-words' two reads of 2026-11-12 the main tap answered in 240 ms and 272 ms (budget 200; assumption: machine load, eight browser jobs were queued, and earlier reads were 72-176 ms), and the page's column shifted once as it loaded in one of them (layout shift 0.064 / 0.001; earlier reads 0.064 / 0.001 / 0.064; budget 0.02) |
| `/coach/live/[room]` | off | off | no | switched off: NEXT_PUBLIC_COACH_LIVE_ENABLED (live coach sessions) | owner: switch it on — NEXT_PUBLIC_COACH_LIVE_ENABLED (live coach sessions) |
| `/coach/offers/[offer]` | off | off | no | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) | owner: switch it on — COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/review/[bookingId]` | off | off | no | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) | owner: switch it on — COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/session` | ✗ ✗ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/coach/shots` | ✗ ✗ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/coach/thanks` | off | off | no | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) | owner: switch it on — COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/velocity` | ✗ ✗ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/coaches` | off | off | no | switched off: COACH_MARKETPLACE_ENABLED (find a coach) | owner: switch it on — COACH_MARKETPLACE_ENABLED (find a coach) |
| `/consent/guardian` | ✗ ✗ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/consent/guardian/[token]` | not scored | not scored | no | not scored: needs a guardian-consent row with its emailed token | a row the rig cannot make: needs a guardian-consent row with its emailed token |
| `/controller/[code]` | ✓ ✓ ✓ ✗ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/create` | ✗ ✗ ✗ ✓ | ✓ ✗ ✓ ✓ | no | An empty state with no next step: "Nothing yet. Pick a tile above: three steps and it is a card.". | owner wording: "Pick a tile above" — the tiles are the next step, outside its box |
| `/create/[discipline]` | ✗ ✗ ✗ ✗ | ✗ ✗ ✓ ✗ | no | "From my Academy library" does nothing when tapped. | the rig taps the tab already chosen; owner wording for its 74 words |
| `/creator` | ✗ ✗ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/creator/athlete` | ✗ ✗ ✗ ✗ | ✗ ✓ ✓ ✓ | no | 85 words before scrolling (the budget is 40). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/credits` | ✗ ✗ ✓ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/education` | sends on | sends on | no | redirects to /learn for everyone who is signed in | nothing: it sends you on to its own screen |
| `/education/course/[id]` | ✗ ✓ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/education/playbook` | ✗ ✗ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/education/playbook/[chapter]` | ✗ ✓ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/groups` | ✓ ✗ ✓ ✓ | ✓ ✗ ✓ ✓ | no | Unfinished mark on screen: "Opens soon". | owner: group booking opens with the training deploy (its tables) |
| `/groups/[groupId]` | ✓ ✗ ✓ ✓ | ✓ ✗ ✓ ✓ | no | Unfinished mark on screen: "Opens soon". | owner: group booking opens with the training deploy (its tables) |
| `/groups/one-on-one` | ✓ ✗ ✓ ✓ | ✓ ✗ ✓ ✓ | no | Unfinished mark on screen: "Opens soon". | owner: group booking opens with the training deploy (its tables) |
| `/groups/trainer/[code]` | ✗ ✓ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/guardian/report/[token]` | not scored | not scored | no | not scored: needs a guardian report row with its emailed token | a row the rig cannot make: needs a guardian report row with its emailed token |
| `/guidance` | ✗ ✗ ✗ ✓ | ✓ ✗ ✓ ✓ | no | An empty state with no next step: "no history yet — this is an invitation, not a recommendation". | the rig reads a reason bullet ("no history yet") as an empty state; each card has its "Start →" |
| `/host` | ✗ ✗ ✓ ✗ | ✗ ✗ ✓ ✓ | no | 74 words before scrolling (the budget is 40). | owner wording: 74 words before scrolling on the big-screen start (its own explanation); its contrast was fixed in phase 10 |
| `/join` | ✓ ✓ ✓ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/kitchens` | ✗ ✗ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/kitchens/fuel` | ✗ ✗ ✗ ✗ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/ladder` | ✗ ✗ ✗ ✓ | ✗ ✗ ✓ ✓ | no | Nothing in the screen itself leads on: only the app's own bars do. | owner: no season has finalized; nothing to lead on to until one does |
| `/learn` | ✓ ✗ ✓ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/learn/feed` | ✓ ✗ ✗ ✓ | ✓ ✗ ✗ ✓ | no | The screen jumps as it loads (layout shift 0.035; the budget is 0.02). | speed pass: a 0.035 load shift, cause not found in phase 10 |
| `/links` | ✗ ✗ ✓ ✓ | ✓ ✗ ✓ ✓ | no | 4 button looks on one screen (at most 3). | a design call: its fourth button look is one two-line button |
| `/live` | ✗ ✗ ✗ ✗ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/live/schedule` | off | off | no | switched off: LIVE_STREAM_SCHEDULE_ENABLED (the live schedule) | owner: switch it on — LIVE_STREAM_SCHEDULE_ENABLED (the live schedule) |
| `/login` | ✗ ✗ ✗ ✓ | ✓ ✓ ✗ ✓ | no | "ENTER THE LAB" answers a tap in 336 ms (the budget is 200 ms). | speed: "ENTER THE LAB" answers a tap in 344 / 336 / 232 ms over three reads on 2026-11-12 (median 336 ms; the budget is 200 ms), read with the CPU slowed 4× while the machine's load was 9–13 on 4 cores. Phase 10B read 184 ms; no code on the screen changed between the two. A check on a quiet machine or a phone |
| `/market` | ✗ ✗ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/media-kit` | ✗ ✗ ✓ ✓ | ✓ ✗ ✓ ✓ | no | Unfinished mark on screen: "[OWNER: monthly players, as of date]". | owner: fill the [OWNER: …] blanks (the owner's content) |
| `/modes` | ✗ ✗ ✗ ✓ | ✓ ✗ ✓ ✓ | no | 29 paragraphs of body copy under 16 px. | a design call: tried in phase 10 — its descriptions at 16 px make the tiles different heights (6 button looks); taller equal tiles or fewer words |
| `/multiplayer` | ✗ ✗ ✗ ✗ | ✗ ✗ ✓ ✗ | no | An empty state with no next step: "No matches yet. Create a challenge above to get started.". | owner wording: "Create a challenge above" — the next step is outside its box |
| `/p/[token]` | not scored | not scored | no | not scored: needs a coach share-link row (a coach sharing a client's progress); none exists on a new account | a row the rig cannot make: needs a coach share-link row (a coach sharing a client's progress); none exists on a new account |
| `/party` | ✗ ✗ ✓ ✗ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/party/[code]` | ✗ ✗ ✓ ✗ | ✗ ✓ ✓ ✓ | no | 108 words before scrolling (the budget is 40). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/play` | ✗ ✗ ✗ ✓ | ✓ ✗ ✓ ✓ | no | Text cut off at 390 px: "Breakaway · Twelve Yards · Baseball · Moonsh". | owner: the Play shelf's mode lists clip at three lines (the owner's line-clamp-3, 2026-11-10) |
| `/play/acting` | ✗ ✗ ✓ ✗ | ✗ ✗ ✓ ✓ | no | 45 words before scrolling (the budget is 40). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/play/adventure` | ✗ ✗ ? ✓ | ✗ ✗ ? ✓ | no | 1 paragraph of body copy under 16 px. | game lanes: the 3D adventure shows nothing the rig can read (no GPU); a phone check |
| `/play/adventure-br` | ✗ ✗ ? ✗ | ✗ ✗ ✓ ✓ | no | Dead end: nothing on the screen leads on or back. | game lanes: the 3D adventure shows nothing the rig can read (no GPU); a phone check |
| `/play/aero-aces` | ✗ ✗ ? ✗ | ✓ ✗ ? ✗ | no | 1 critical accessibility finding (contrast). | game lanes: the HUD's item slot contrast (the play itself) |
| `/play/baseball` | ✗ ✗ ? ✗ | ✗ ✗ ? ✓ | no | 66 words before scrolling (the budget is 40). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/play/big-air` | ✗ ✗ ? ✗ | ✓ ✓ ? ✓ | no |  | nothing failed: a 3D screen's tap time is not measured on the rig (no GPU); a phone check |
| `/play/brain-brawl` | ✗ ✗ ? ✗ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/play/calibrate` | ✗ ✗ ✓ ✓ | ✗ ✗ ✓ ✓ | no | 98 words before scrolling (the budget is 40). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/play/carnival` | ✓ ✓ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/play/carnival/recap` | ✓ ✓ ✓ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/play/dance` | ✗ ✗ ? ✗ | ✓ ✗ ? ✗ | no | Text cut off at 200 % zoom: "◀ ▶ TRACK · ▲ ▼ LEVEL · Y MATCH · X FREE · A". | nothing failed: a 3D screen's tap time is not measured on the rig (no GPU); a phone check |
| `/play/derby` | ✗ ✗ ? ✗ | ✓ ✓ ✗ ✓ | no | "Capture and stream menu" answers a tap in 280 ms (the budget is 200 ms). | speed: on the rig (no GPU, CPU slowed 4×) the tap waits behind the page's own 3D or load; a phone check |
| `/play/drills` | ✗ ✗ ✓ ✗ | ✗ ✓ ✓ ✓ | no | 123 words before scrolling (the budget is 40). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/play/duel` | ✗ ✗ ? ✗ | ✓ ✓ ? ✓ | no |  | nothing failed: a 3D screen's tap time is not measured on the rig (no GPU); a phone check |
| `/play/dunk` | ✗ ✗ ? ✗ | ✓ ✗ ✓ ✓ | no | Text cut off at 200 % zoom: "0" and 5 more. | game lanes: the start card's controls swap from the keyboard list to the touch list after load |
| `/play/dunkduel` | ✗ ✓ ✓ ✓ | ✗ ✓ ✓ ✓ | no | 88 words before scrolling (the budget is 40). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/play/football` | ✗ ✗ ? ✗ | ✓ ✗ ✓ ✓ | no | 3 pieces of text under 12 px. | game lanes: the in-game HUD / touch controller (text under 12 px is the play itself) |
| `/play/freerun` | ✗ ✗ ? ✗ | ✓ ✗ ? ✓ | no | 1 piece of text under 12 px. | game lanes: the in-game HUD / touch controller (text under 12 px is the play itself) |
| `/play/gb-shelf` | not listed | off | no | switched off: BINJGB_SHELF_ENABLED (the Game Boy homebrew shelf) | owner: switch it on — BINJGB_SHELF_ENABLED (the Game Boy homebrew shelf) |
| `/play/gb-shelf/[slug]` | not listed | not scored | no | not scored: v1 of the homebrew shelf ships no titles (BINJGB-SHELF-1, OQ-10), so every slug is a 404 by design; switched off: BINJGB_SHELF_ENABLED (the Game Boy homebrew shelf) | a row the rig cannot make: v1 of the homebrew shelf ships no titles (BINJGB-SHELF-1, OQ-10), so every slug is a 404 by design; switched off: BINJGB_SHELF_ENABLED (the Game Boy homebrew shelf) |
| `/play/golf` | ✗ ✗ ? ✗ | ✓ ✓ ✗ ✓ | no | "Capture and stream menu" answers a tap in 248 ms (the budget is 200 ms). | nothing failed: a 3D screen's tap time is not measured on the rig (no GPU); a phone check |
| `/play/irl` | ✗ ✗ ✓ ✗ | ✗ ✓ ✓ ✓ | no | 42 words before scrolling (the budget is 40). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/play/karate` | ✗ ✗ ? ✗ | ✓ ✗ ✓ ✓ | no | 1 piece of text under 12 px. | game lanes: the in-game HUD / touch controller (text under 12 px is the play itself) |
| `/play/karate-vs` | ✗ ✗ ? ✗ | ✗ ✓ ? ✓ | no | A floating button covers what is under it: "Couch (2–4)" covers "BEST OF 3 — RIVAL SENSEI". | game lanes: at 150 % text the "Couch (2–4)" chip (components/controller-link/couch-start.tsx, shared by six mode pages) sits over the game's own top banner ("BEST OF 3 — RIVAL SENSEI", the shared game HUD). The fix is in a shared game surface, like Story's controls. Also: a 3D screen's tap time is not measured on the rig (no GPU); a phone check |
| `/play/map-preview` | ✗ ✗ ✗ ✓ | ✗ ✗ ✗ ✓ | no | The screen jumps as it loads (layout shift 0.062; the budget is 0.02). | a developer page (the map perf report); its numbers update as it measures |
| `/play/mirror` | ✗ ✗ ✗ ✓ | ✗ ✓ ✓ ✓ | no | 118 words before scrolling (the budget is 40). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/play/mirror/assess` | ✗ ✓ ✓ ✓ | ✗ ✓ ✓ ✓ | no | 42 words before scrolling (the budget is 40; 31 words of approved notices not counted). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/play/mirror/assess/results` | ✗ ✓ ✓ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/play/mirror/correctives` | ✗ ✗ ✓ ✓ | ✗ ✓ ✓ ✓ | no | 63 words before scrolling (the budget is 40). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/play/mixedcombat` | ✗ ✗ ? ✗ | ✓ ✓ ? ✓ | no |  | nothing failed: a 3D screen's tap time is not measured on the rig (no GPU); a phone check |
| `/play/music` | ✗ ✗ ✗ ✓ | ✗ ✗ ✗ ✓ | no | "TAP TO START" answers a tap in 368 ms (the budget is 200 ms). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/play/onevone` | ✗ ✗ ✓ ✗ | ✓ ✓ ? ✓ | no |  | nothing failed: a 3D screen's tap time is not measured on the rig (no GPU); a phone check |
| `/play/party` | ✗ ✗ ✓ ✗ | ✗ ✗ ✗ ✓ | no | The screen jumps as it loads (layout shift 0.052; the budget is 0.02). | speed pass: a 0.033 load shift, cause not found in phase 10 |
| `/play/shared` | off | off | no | a 404 by design: only its share links are pages (lib/nav/reachability.test.ts) | nothing: a 404 by design: only its share links are pages (lib/nav/reachability.test.ts) |
| `/play/shared/[token]` | off | off | no | switched off: STUDIO_SHARE_ENABLED (Studio share links) | owner: switch it on — STUDIO_SHARE_ENABLED (Studio share links) |
| `/play/showdown` | ✗ ✗ ? ✗ | ✓ ✓ ? ✓ | no |  | nothing failed: a 3D screen's tap time is not measured on the rig (no GPU); a phone check |
| `/play/skateboard` | ✗ ✗ ✓ ✗ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/play/snowboard` | ✗ ✗ ✓ ✗ | ✓ ✗ ? ✓ | no | Text cut off at 200 % zoom: "· PAR 60". | game lanes: the HUD at 200 % zoom (the play itself) |
| `/play/soccer` | ✗ ✗ ? ✗ | ✓ ✗ ? ✓ | no | Text cut off with 150 % text: "0" and 1 more. | game lanes: the HUD with 150 % text (the play itself) |
| `/play/sprint` | ✗ ✗ ? ✗ | ✓ ✓ ? ✓ | no |  | nothing failed: a 3D screen's tap time is not measured on the rig (no GPU); a phone check |
| `/play/surf` | ✗ ✗ ✓ ✗ | ✓ ✓ ? ✓ | no |  | nothing failed: a 3D screen's tap time is not measured on the rig (no GPU); a phone check |
| `/play/tennis` | ✗ ✗ ? ✗ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/play/threepoint` | ✗ ✗ ? ✗ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/play/threevthree` | ✗ ✗ ✓ ✗ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/play/tiebreak` | sends on | sends on | no | redirects to /play/tennis for everyone who is signed in | nothing: it sends you on to its own screen |
| `/play/training` | sends on | sends on | no | redirects to /train for everyone who is signed in | nothing: it sends you on to its own screen |
| `/play/velocity-kart` | ✗ ✗ ? ✗ | ✓ ✗ ✓ ✗ | no | 1 critical accessibility finding (contrast). | game lanes: the HUD's item slot contrast (the play itself) |
| `/play/volleyball` | ✗ ✗ ? ✗ | ✓ ✓ ? ✓ | no |  | nothing failed: a 3D screen's tap time is not measured on the rig (no GPU); a phone check |
| `/play/who-scene-it` | ✗ ✗ ✓ ✗ | ✓ ✗ ? ✓ | no | 1 piece of text under 12 px. | speed: on the rig (no GPU, CPU slowed 4×) the tap waits behind the page's own 3D or load; a phone check |
| `/press` | ✗ ✗ ✓ ✓ | ✓ ✗ ✓ ✓ | no | Unfinished mark on screen: "[OWNER: number]". | owner: fill the [OWNER: …] blanks (the owner's content) |
| `/press/[slug]` | ✗ ✗ ✓ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/press/library` | ✗ ✗ ✓ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/press/receipt` | ✗ ✗ ✓ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/privacy` | ✗ ✗ ✓ ✓ | ✗ ✓ ✓ ✓ | no | Nothing in the screen itself leads on: only the app's own bars do. | owner: a policy page; nothing on it leads on (policy wording) |
| `/pro` | ✗ ✗ ✗ ✓ | ✗ ✗ ✓ ✓ | no | Unfinished mark on screen: "Opens soon". | owner: Coach Pro is not on sale (switched off) |
| `/profile` | ✗ ✗ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/profile/challenges` | ✗ ✗ ✗ ✓ | ✗ ✗ ✓ ✓ | no | 69 words before scrolling (the budget is 40). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/profile/edit` | ✗ ✗ ✗ ✗ | ✗ ✗ ✓ ✓ | no | 79 words before scrolling (the budget is 40). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/profile/week` | ✗ ✗ ✗ ✓ | ✗ ✗ ✓ ✓ | no | 114 words before scrolling (the budget is 40). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/program/[accessId]` | off | off | no | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) | owner: switch it on — COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/program/unlock` | off | off | no | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) | owner: switch it on — COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/purchase-terms` | ✗ ✗ ✓ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/screen` | ✗ ✓ ✓ ✓ | ✗ ✓ ✓ ✓ | no | 42 words before scrolling (the budget is 40; 31 words of approved notices not counted). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/screen/privacy` | ✓ ✓ ✓ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/screen/program/[lane]` | ✗ ✓ ✓ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/session/[bookingId]` | off | off | no | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) | owner: switch it on — COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/sessions` | ✗ ✓ ✗ ✗ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/settings` | sends on | sends on | no | redirects to /account for everyone who is signed in | nothing: it sends you on to its own screen |
| `/shop` | ✗ ✗ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/shop/shards` | ✗ ✗ ✗ ✓ | ✗ ✗ ✓ ✓ | no | Nothing in the screen itself leads on: only the app's own bars do. | owner: payments are off, so the page has nothing to buy; its wording is the owner's |
| `/signature` | ✗ ✗ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/signup` | ✗ ✗ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/squads` | ✗ ✗ ✗ ✓ | ✓ ✗ ✓ ✓ | no | Unfinished mark on screen: "Squads and teams are coming soon. Your drills, games and streak keep counting in". | owner: Squads are switched off until the groups tables are applied |
| `/squads/[id]` | ✗ ✗ ✗ ✓ | ✓ ✗ ✓ ✓ | no | Unfinished mark on screen: "Squads and teams are coming soon. Your drills, games and streak keep counting in". | owner: Squads are switched off until the groups tables are applied |
| `/squads/join/[token]` | ✓ ✗ ✓ ✓ | ✓ ✗ ✓ ✓ | no | Unfinished mark on screen: "Squads and teams are coming soon. Your drills, games and streak keep counting in". | owner: Squads are switched off until the groups tables are applied |
| `/store` | ✗ ✗ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/store-terms` | ✗ ✗ ✓ ✓ | ✓ ✗ ✓ ✓ | no | An empty state with no next step: "Nothing here stops you from contacting a government consumer-protection agency.". | owner: a legal sentence the rig reads as an empty state (policy wording) |
| `/story` | ✗ ✗ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/story/boss` | ✗ ✗ ✗ ✗ | ✗ ✗ ✗ ✓ | no | A floating button covers what is under it: "Controls help" covers "SPACE / W — Jump (dodge)" (and 5 more). | game lanes: the in-game HUD / touch controller (text under 12 px is the play itself; at 150 % text its Controls help, Hide controller and GUARD buttons sit over the controls card; the coordinator lists them for the owner, 2026-11-12) |
| `/story/rail` | ✗ ✗ ✗ ✗ | ✗ ✗ ✗ ✓ | no | A floating button covers what is under it: "Controls help" covers "A / D / ← → — Switch rail" (and 4 more). | game lanes: the in-game HUD / touch controller (text under 12 px is the play itself; at 150 % text its Controls help, Hide controller and GUARD buttons sit over the controls card; the coordinator lists them for the owner, 2026-11-12) |
| `/studio` | off | ✗ ✗ ✗ ✓ | no | The screen jumps as it loads (layout shift 0.027; the budget is 0.02). | owner: Nexus Studio is flag-gated and unlinked (its own lanes); a 0.027 load shift |
| `/support` | ✗ ✗ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/teach` | ✗ ✗ ✗ ✓ | ✓ ✗ ✓ ✓ | no | Unfinished mark on screen: "Teaching on FEL opens soon.". | owner: teaching is not open yet |
| `/teach/motion` | not listed | ✗ ✗ ✓ ✓ | no | Unfinished mark on screen: "Motion lessons open soon.". | owner: teaching is not open yet |
| `/team` | ✗ ✗ ✓ ✓ | ✓ ✗ ✓ ✓ | no | Unfinished mark on screen: "[OWNER: profiles]". | owner: fill the [OWNER: …] blanks (the owner's content) |
| `/team/[slug]` | ✗ ✗ ✓ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/terms` | ✗ ✗ ✓ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/train` | ✗ ✗ ✗ ✓ | ✓ ✓ ✗ ✓ | no | "Account settings →" answers a tap in 208 ms (the budget is 200 ms). | speed: the tap the scorer makes ("Account settings →") answers in 176 / 208 / 224 ms over three reads on 2026-11-12 (median 208 ms; the budget is 200 ms), on the same busy machine (load 9–13 on 4 cores). Phase 10B read 144 ms; no code on the screen changed between the two. A check on a quiet machine or a phone |
| `/train/build` | ✗ ✗ ✗ ✓ | ✗ ✓ ✓ ✓ | no | 126 words before scrolling (the budget is 40). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/train/combine` | ✗ ✗ ✗ ✓ | ✓ ✗ ✓ ✓ | no | Unfinished mark on screen: "Combine results are coming soon.". | owner: the feature is not built or not switched on ("coming soon"); owner-gated |
| `/train/jumps` | ✗ ✗ ✗ ✓ | ✗ ✓ ✓ ✓ | no | 77 words before scrolling (the budget is 40). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/train/library` | ✗ ✗ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/train/programs` | ✗ ✗ ✗ ✓ | ✓ ✗ ✓ ✓ | no | Unfinished mark on screen: "Signature programs are coming soon. The daily drill and the exercise library are". | owner: the feature is not built or not switched on ("coming soon"); owner-gated |
| `/train/programs/[id]` | ✗ ✗ ✗ ✓ | ✗ ✗ ✓ ✓ | no | 238 words before scrolling (the budget is 40). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/train/progress` | ✗ ✗ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/train/readiness` | ✗ ✗ ✗ ✓ | ✗ ✓ ✓ ✓ | no | 57 words before scrolling (the budget is 40; 15 words of approved notices not counted). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/train/shots` | ✗ ✗ ✗ ✓ | ✗ ✓ ✓ ✓ | no | 75 words before scrolling (the budget is 40; 17 words of approved notices not counted). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/train/speed` | ✗ ✗ ✗ ✓ | ✗ ✗ ✓ ✓ | no | 66 words before scrolling (the budget is 40). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/train/today-drill` | ✗ ✗ ✗ ✓ | ✗ ✓ ✗ ✓ | no | A floating button covers what is under it: "Start" covers "New: one short drill a day, from you". | owner: Start is fixed at the bottom, always on screen, by the owner's playtest decision (2026-10-27, app/train/today-drill/_components/today-drill-run.tsx). At 150 % text it sits 55 px over the line under it on the first screen (the page keeps room so the line scrolls clear). Keep it fixed, or let it flow like the other primaries, is the owner's call. Also: the drill's 3D demo is drawn on the CPU on the rig (no GPU); a phone check |
| `/train/velocity` | ✗ ✗ ✗ ✓ | ✗ ✗ ✓ ✓ | no | 88 words before scrolling (the budget is 40). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |
| `/training` | sends on | sends on | no | redirects to /coach for everyone who is signed in | nothing: it sends you on to its own screen |
| `/try` | ✗ ✓ ✓ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/u/[slug]` | not scored | not scored | no | not scored: needs a published creator card row; a new account has none | a row the rig cannot make: needs a published creator card row; a new account has none |
| `/venues` | ✗ ✗ ✗ ✓ | ✓ ✗ ✓ ✓ | no | 1 paragraph of body copy under 16 px. | a design call: tried in phase 10 — the venue card's two-line mode list at 16 px is cut off; a taller card or a shorter list |
| `/wallet` | ✗ ✗ ✗ ✗ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/welcome` | ✗ ✗ ✗ ✓ | ✓ ✓ ✓ ✓ | **yes** |  |  |
| `/work-with-us` | ✗ ✗ ✓ ✓ | ✓ ✗ ✓ ✓ | no | Unfinished mark on screen: "[OWNER: link to the application, P2]". | owner: fill the [OWNER: …] blanks (the owner's content) |
| `/workout` | ✗ ✗ ✗ ✓ | ✗ ✗ ✓ ✓ | no | 183 words before scrolling (the budget is 40). | owner: shorter wording on its first screen (cutting a screen's own explanation is new copy) |

## 1. How a screen is scored

The real app (a production build) runs against a throwaway local database, and a phone-sized browser (390 × 844, CPU slowed 4×) opens every screen as the least-privileged person who can see it. The rules are `lib/every-screen/judge.ts`; each number below is the plan's.

| Check | What the rig measures | Fails when |
|---|---|---|
| 1. Clear and quick | Words before scrolling. Bright filled buttons on the first screen. Tap targets. Whether anything leads on or back. | A do-this screen shows more than 40 words before scrolling; more than 1 bright button competes; a tap target is under 44 px; nothing leads on. |
| 2. Looks finished | "Coming soon" / "opens soon", placeholder text, an empty state with no next step, a spinner with no words. Sideways scroll and cut-off text at 390 px, at 200 % zoom and with 150 % text. Text sizes, button looks, and the READABLE.md size floor. | Any of those marks; any sideways scroll or cut-off text; text under 12 px or body copy under 16 px; more than 4 text sizes or 3 button looks. |
| 3. Fast and smooth | First content, layout shift, and how long the main action takes to answer a tap (the browser's own event timing). | First content after 2.5 s; layout shift over 0.02; a tap answered after 200 ms. |
| 4. Right and trustworthy | Every link is fetched. The main action is tapped. Uncaught errors. The accessibility scan (`scripts/a11y/inpage.ts`). | A link answers 404 or 5xx, or goes nowhere; the main action does nothing; the screen throws; a critical or serious accessibility finding. |

**A person must still look at:** a measured number with no line saying how it was measured or how sure it is. The rig flags it ("review" in the table) and does not fail the screen on it, because a machine cannot tell a measurement from a count. On new accounts almost no screen shows a number yet, so phase 4 re-runs this with results on the account.

**Sorting screens into do-this, menu and reading pages** ("Kind" in the table) is a first sorting by address (`kindOf`), an `assumption:`; only a do-this screen takes the 40-word rule. Each phase corrects its own screens.

**Controls: passed** on 2026-11-12 15:23 UTC (scorer version 6).

**The scorer was checked before it was believed** (`score.mts --plant`, and again at the start of every crawl): a clean control page must pass all four, and each planted fault (three bright buttons, 120 words, a 30 px target, a dead end, "Coming soon", an owner placeholder, an empty state, a wordless spinner, sideways scroll, 10 px text, six text sizes, five button looks, slow first content, a jumping banner, a blocking tap handler, a link to a missing page, a link to nowhere, a button that does nothing, an unnamed button, a bare measured number) must be flagged on its own page and fail only its own check.

## 2. The ten most common faults, and where each comes from

The plan's rule: fix the shared thing first. "Alone" is how many screens would pass all four if this one fault were fixed everywhere and nothing else changed.

| # | Fault | Screens | Alone | Check |
|---|---|---|---|---|
| 1 | More than 40 words before scrolling on a do-this screen | 36 | 13 | 1 |
| 2 | Body copy under 16 px | 21 | 1 | 2 |
| 3 | More than 4 text sizes on one screen | 16 | 0 | 2 |
| 4 | More than 3 button looks on one screen | 15 | 1 | 2 |
| 5 | Tap targets under 44 px in the screen itself | 13 | 0 | 1 |
| 6 | An empty state with no next step | 10 | 3 | 2 |
| 7 | Unfinished mark: "opens soon" | 9 | 5 | 2 |
| 8 | The main action answers a tap in more than 200 ms | 10 | 4 | 3 |
| 9 | Text under 12 px | 9 | 2 | 2 |
| 10 | The screen jumps as it loads | 7 | 1 | 3 |

**Where the common faults come from (read from the rig's element lists below, 2026-11-10).** The plan's rule is
"fix the shared thing first". Most of the top ten come from a handful of shared parts:

| Fault | The shared part it comes from | Who should fix it |
|---|---|---|
| Tap targets under 44 px in the app's own bars | The **status rail** (`components/shell/status-rail.tsx`): the FEL wordmark and the PRQ chip are `min-h-10` (40 px), Sign out is `h-10 w-10`, and the wallet chip's link is 26 px tall. It is on every signed-in screen, so this one file fails "clear and quick" on most of the app. The **game header** (`[data-game-chrome]`: Home 30 px, Play with your body 32 px, the quality select 32 px, Full screen 32 px) does the same on every game screen. | Phase 2 (the rail: one class each); phase 7 (the game header). |
| The screen jumps as it loads | The **status rail's right-hand cluster** (`div.ml-auto.flex.min-w-0`): on a 390 px phone the PRQ chip, the three wallet pills and Sign out do not fit beside the wordmark, so the rail is two rows (seen on every signed-in shot), and the cluster moves as the profile and wallet answer, taking the page under it along (0.055–0.068 of the 0.02 budget, on every signed-in screen). `assumption:` the exact trigger (the wallet pills' width arriving) is read from the shift's source element, not traced line by line. On game screens the **game header**'s badge and full-screen button (`span.flex.items-center.gap-1.5`, `button.grid.h-8.w-8`) do the same. | Phase 2 (reserve the rail's second row, or keep the cluster to one row at 390 px); phase 7. |
| Body copy under 16 px | `TYPE.small` (14 px) used for paragraphs longer than 12 words: the **TabPage lede** (`components/shell/tab-page.tsx`, `main > header > div > p`), the **learn-while-you-wait card** at 12.5 px (`components/learn/learn-while-you-wait.tsx`, on every game's loading screen), and many `text-[12px]` paragraphs. | The readable-2 lane (text size is theirs while it runs); listed for them. |
| More than 4 text sizes | Mostly not a fault of the screens: the app's own approved type scale has **five** steps (`lib/design/type.ts`: 12, 14, 16, 20, 30), and a screen that uses all five fails the plan's "at most 4". The rest are one-off sizes (13, 12.5, 13.5, 15, 18, 22 px). | **Owner call** (below). The one-off sizes: phases 2–9, screen by screen. |
| More than 40 words before scrolling (do-this screens) | Screen copy, not a shared part: the game splash screens (controls sheet, location pickers, the learn card), the Mirror's health notice, today's drill, the jump tests. | Phases 2, 4 and 7. |
| Critical accessibility findings | The **Babylon canvas** on every game screen has no accessible name and is in the tab order (`canvas[data-engine=Babylon.js]`): one place, where the game shell makes the canvas. | Phase 7 / the game lanes. |
| The screen throws an error | **React error #425** (the text the server drew differs from the phone's first render: a hydration mismatch) on every game screen: one shared part of the game shell. `assumption:` it is a time- or device-dependent line in the shell; not traced further here. | Phase 7 / the game lanes. |
| Text under 12 px | The **in-game controls sheet** (`[data-controls-panel]`, 10.2–11.4 px rows) and HUD plates. | gameplay-clean / readable-2 (listed for them). |
| Tap targets under 44 px in screens | The game **Capture and stream** menu button (42 × 29), the public footer links (Terms, Privacy, Support: 18 px tall), the splash's pill pickers (24–28 px), the "← Train" back links (36 px). | Phases 6, 7 and 2. |
| A spinner with no words | Game loading screens. | Phase 7. |

**Owner call (recommendation first): count the type scale's five steps as the budget, not four.** The plan says "at
most 4 text sizes … the same ones the rest of the app uses", but the app's approved scale (premium-ui P1) has five. Held
at 4, a screen that uses only the approved sizes still fails. Recommend: 5, the scale's own steps, and any size off the
scale is a fault. Until the owner answers, the scorer keeps the plan's 4 (it is the approved number) and this page says
how many screens fail at exactly 5.

Measured for that call: 61 scored screens use exactly 5 text sizes; with 5 allowed, 0 more screens would pass all four today (the other faults on them stay).

<details><summary>The elements behind them (the rig's own list)</summary>

**Small tap targets in the app's own bars (screens)**

- 1 × `"Skip to the 3D view" 1×1 button.sr-only.focus:not-sr-only.focus:fixed.focus:left-3 in [data-testid data-own-input]`
- 1 × `"Skip to settings" 1×1 button.sr-only.focus:not-sr-only.focus:fixed.focus:left-3 in [data-testid data-own-input]`
- 1 × `"Skip to things to add" 1×1 button.sr-only.focus:not-sr-only.focus:fixed.focus:left-3 in [data-testid data-own-input]`
- 1 × `"Add" 91×40 button.h-10.flex-1.rounded-md.text-[12px] in [data-testid]`
- 1 × `"Stamps" 91×40 button.h-10.flex-1.rounded-md.text-[12px] in [data-testid]`
- 1 × `"Scene" 91×40 button.h-10.flex-1.rounded-md.text-[12px] in [data-testid]`
- 1 × `"Inspect" 91×40 button.h-10.flex-1.rounded-md.text-[12px] in [data-testid]`

**Small tap targets in screens (screens)**

- 2 × `"Controls help" 111×28 button.pointer-events-auto.flex.items-center.gap-1.5`
- 2 × `"Hide controller" 28×28 button.pointer-events-auto.flex.h-7.w-7`
- 2 × `"GUARD" 107×40 button.pointer-events-auto.relative.flex.select-none`
- 1 × `"Run re-engagement sweep" 232×38 button.inline-flex.items-center.gap-2.rounded-xl`
- 1 × `"WAITING" 79×28 button.rounded-lg.px-3.py-1.5.font-mono`
- 1 × `"FLAGGED" 79×28 button.rounded-lg.px-3.py-1.5.font-mono`
- 1 × `"IN ROTATION" 110×28 button.rounded-lg.px-3.py-1.5.font-mono`
- 1 × `"APPROVED" 86×28 button.rounded-lg.px-3.py-1.5.font-mono`
- 1 × `"REJECTED" 86×28 button.rounded-lg.px-3.py-1.5.font-mono`
- 1 × `"Discipline" 145×30 select.ml-auto.rounded-lg.bg-white/5.px-2`
- 1 × `"25 LC" 76×38 button.rounded-lg.border.px-4.py-2`
- 1 × `"50 LC" 76×38 button.rounded-lg.border.px-4.py-2`
- 1 × `"100 LC" 84×38 button.rounded-lg.border.px-4.py-2`
- 1 × `"250 LC" 84×38 button.rounded-lg.border.px-4.py-2`
- 1 × `"500 LC" 84×38 button.rounded-lg.border.px-4.py-2`
- 1 × `"QUICK MATCH — PLAY NOW" 249×40 button.inline-flex.items-center.gap-2.rounded-lg`
- 1 × `"STAKE & POST DUEL" 207×40 button.inline-flex.items-center.gap-2.rounded-lg`
- 1 × `"REFRESH" 90×28 button.inline-flex.items-center.gap-1.5.rounded-md`
- 1 × `"on" 13×13 input in [data-business-dashboard]`
- 1 × `"A CREATURE" 158×36 button.flex-1.rounded-lg.px-3.py-2 in [data-testid]`

**Text sizes per screen:** 1 sizes: 2 screens; 2 sizes: 3 screens; 3 sizes: 48 screens; 4 sizes: 25 screens; 5 sizes: 61 screens; 6 sizes: 11 screens; 7 sizes: 2 screens; 8 sizes: 2 screens

**The sizes themselves (screens that use each)**

- 144 × `12px`
- 130 × `16px`
- 127 × `20px`
- 97 × `14px`
- 73 × `30px`
- 15 × `18px`
- 13 × `24px`
- 9 × `13px`
- 8 × `44px`
- 7 × `36px`
- 6 × `22px`
- 4 × `13.6px`
- 4 × `21px`
- 2 × `12.5px`
- 2 × `28px`
- 2 × `15px`
- 2 × `10.8108px`
- 2 × `14.4144px`
- 1 × `17px`
- 1 × `26px`
- 1 × `40px`
- 1 × `19px`
- 1 × `60px`
- 1 × `13.5px`

**Button looks per screen:** 0: 31; 1: 67; 2: 23; 3: 18; 4: 5; 5: 2; 6: 3; 7: 3; 8: 2

**Text under the READABLE floor**

- 3 × `body-small 12px div>main>p`
- 3 × `body-small 12px div>div>div>p`
- 3 × `hud-small 12px div>div>span[data-hud-plate=true]>span`
- 2 × `body-small 14px div>div>div>p`
- 2 × `hud-small 12px div[data-hud-frame=true]>div>div[data-hud-plate=true]>div`
- 2 × `hud-small 12px div[data-hud-frame=true]>div>span[data-hud-plate=true]>span`
- 2 × `tiny 10.81px div>div>button>span`
- 1 × `body-small 12px div>section>div>p`
- 1 × `body-small 12px main>div>section>p`
- 1 × `body-small 12px main>div>section>div`
- 1 × `body-small 12px main>div>div>span`
- 1 × `body-small 12px main[data-testid=library-review]>section>div[data-testid=review-row]>div`
- 1 × `body-small 12px section>div[data-testid=review-row]>ul>li`
- 1 × `body-small 12px div[data-testid=review-row]>div>div>div`
- 1 × `body-small 13px div>div[data-testid=signature-review]>p`
- 1 × `body-small 12.5px div>div[data-testid=signature-review]>p[data-not-ready=true]`

**Accessibility findings**

- 1 × `serious contrast: button "STAKE & POST DUEL"`
- 1 × `critical label: select "Flight NightAero AcesVelocity KartDowntownStompG"`
- 1 × `critical contrast: div "NONE"`
- 1 × `serious contrast: span[data-hud-call=true] "♪ WINDWARD CIRCLE · 96 BPM · ●●○○○○ · NORMAL`
- 1 × `critical contrast: div "NO ITEM"`

**What moves as a screen loads**

- 69 × `a.inline-flex.min-h-11.items-center`
- 69 × `a.fel-press.inline-flex.min-h-11`
- 4 × `#text`
- 3 × `svg`
- 2 × `h1.text-4xl.font-black.tracking-wide`
- 2 × `div.fel-boot-bar.h-full.rounded-full`
- 1 × `section.rounded-xl.border.border-white/10`
- 1 × `div.mt-8.rounded-xl.border`
- 1 × `div.mt-8.overflow-x-auto`
- 1 × `button.inline-flex.items-center.gap-2`
- 1 × `div.mt-6.space-y-8`
- 1 × `div.flex.min-w-0.shrink`

**Empty states with no next step**

- 4 × `No wins yet`
- 4 × `no history yet — this is an invitation, not a recommendation`
- 1 × `No stored rollups yet. Click “Recompute” to generate them fr`
- 1 × `Nothing here.`
- 1 × `Coach Pro is not on sale yet. Nothing is limited until it is`
- 1 × `Nothing yet. Pick a tile above: three steps and it is a card`
- 1 × `No songs of yours on this device yet. Make one in the Academ`
- 1 × `No season has finalized yet.`
- 1 × `No matches yet. Create a challenge above to get started.`
- 1 × `Nothing here stops you from contacting a government consumer`

**Unfinished marks**

- 6 × `opens soon: Opens soon`
- 3 × `coming soon: Squads and teams are coming soon. Your drills, gam`
- 2 × `opens soon: Teaching on FEL opens soon.`
- 1 × `coming soon: Saving combines to your account is coming soon. Th`
- 1 × `placeholder text: [OWNER: monthly players, as of date]`
- 1 × `placeholder text: [OWNER: number]`
- 1 × `opens soon: Motion lessons open soon.`
- 1 × `placeholder text: [OWNER: profiles]`
- 1 × `coming soon: Combine results are coming soon.`
- 1 × `coming soon: Signature programs are coming soon. The daily dril`
- 1 × `placeholder text: [OWNER: link to the application, P2]`

**Bright buttons that compete**

- 1 × `Challenge online + Create challenge`

</details>

### For phases 2–5: what each phase inherits, ranked

Phase 1 fixed only what stops a person (`docs/EVERY-SCREEN-JOBS.md`). Everything else found in training and coaching is listed here for the phase that owns the screen, most common first.

**Phase 2** (8 scored screens, 2 pass all four):

1. More than 40 words before scrolling on a do-this screen: 4 screens (`/play/drills`, `/train/programs/[id]`, `/train/today-drill`, `/workout`)
2. The main action answers a tap in more than 200 ms: 2 screens (`/train`, `/train/today-drill`)
3. Body copy under 16 px: 2 screens (`/train/programs/[id]`, `/workout`)
4. Unfinished mark: "coming soon": 1 screen (`/train/programs`)
5. More than 4 text sizes on one screen: 1 screen (`/train/programs/[id]`)
6. A floating button covers text or a link on the first screen: 1 screen (`/train/today-drill`)
7. Tap targets under 44 px in the screen itself: 1 screen (`/workout`)

**Phase 3** (1 scored screens, 0 pass all four):

1. More than 40 words before scrolling on a do-this screen: 1 screen (`/train/build`)

**Phase 4** (14 scored screens, 4 pass all four):

1. More than 40 words before scrolling on a do-this screen: 9 screens (`/play/mirror`, `/play/mirror/assess`, `/play/mirror/correctives`, `/screen`, `/train/jumps`, `/train/readiness`, …)
2. Tap targets under 44 px in the screen itself: 2 screens (`/train/shots`, `/train/velocity`)
3. More than 3 button looks on one screen: 2 screens (`/train/speed`, `/train/velocity`)
4. Unfinished mark: "coming soon": 1 screen (`/train/combine`)
5. More than 4 text sizes on one screen: 1 screen (`/train/velocity`)

**Phase 5** (21 scored screens, 11 pass all four):

1. More than 40 words before scrolling on a do-this screen: 4 screens (`/coach/admin/library`, `/coach/admin/programs`, `/coach/combine`, `/coach/form-review`)
2. Unfinished mark: "opens soon": 4 screens (`/coach/groups`, `/groups`, `/groups/[groupId]`, `/groups/one-on-one`)
3. Body copy under 16 px: 3 screens (`/coach/admin/library`, `/coach/admin/programs`, `/coach/business`)
4. More than 4 text sizes on one screen: 3 screens (`/coach/admin/programs`, `/coach/business`, `/coach/combine`)
5. The main action answers a tap in more than 200 ms: 2 screens (`/coach/admin/programs`, `/coach/join/[token]`)
6. An empty state with no next step: 1 screen (`/coach/business`)
7. Tap targets under 44 px in the screen itself: 1 screen (`/coach/business`)
8. Unfinished mark: "coming soon": 1 screen (`/coach/combine`)
9. The screen jumps as it loads: 1 screen (`/coach/join/[token]`)

## 3. What is switched off today

Scored in the state production has them in. `assumption:` the rig's database is `prisma db push` of today's schema with nothing from `prisma/pending/` applied (`docs/LAUNCH-CHECKLIST.md` C1: "not done"), and every env switch is at its default (off). Checked against the live site on 2026-11-10: `/groups` says "Opens soon"; `/coaches`, `/studio`, `/live/schedule` and `/session/x` are a 404. The owner's `npx tsx scripts/pending-sql/cli.ts plan` prints what production really lacks.

### 3a. A 404 for everyone: 20 screens, behind a switch

| Screen | Phase | What turns it on |
|---|---|---|
| `/account/bookings` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/c/[code]` | 7 | not switched off: a challenge code that does not exist is the app's 404 (a real challenge needs a row a player makes by sending one) |
| `/coach/[slug]` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL); or COACH_MARKETPLACE_ENABLED (find a coach) |
| `/coach/[slug]/book/[listingId]` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/[slug]/fee/[packageId]` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL); or COACH_MARKETPLACE_ENABLED (find a coach) |
| `/coach/[slug]/programs/[lane]` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/dashboard` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/dashboard/settings` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/live/[room]` | 5 | NEXT_PUBLIC_COACH_LIVE_ENABLED (live coach sessions) |
| `/coach/offers/[offer]` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/review/[bookingId]` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/thanks` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coaches` | 5 | COACH_MARKETPLACE_ENABLED (find a coach) |
| `/live/schedule` | 7 | LIVE_STREAM_SCHEDULE_ENABLED (the live schedule) |
| `/play/gb-shelf` | 7 | BINJGB_SHELF_ENABLED (the Game Boy homebrew shelf) |
| `/play/shared` | 7 | a 404 by design: only its share links are pages (lib/nav/reachability.test.ts) |
| `/play/shared/[token]` | 7 | STUDIO_SHARE_ENABLED (Studio share links) |
| `/program/[accessId]` | 2 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/program/unlock` | 2 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/session/[bookingId]` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |

### 3b. Dark until its tables are applied

Not measured yet: run `scripts/every-screen/dark.mts`.

### 3c. Screens that say "opens soon" or "coming soon" today: 15

- `/admin/review`: "Teaching on FEL opens soon."
- `/coach/combine`: "Saving combines to your account is coming soon. This combine is kept on this pho"
- `/coach/groups`: "Opens soon"
- `/groups`: "Opens soon"
- `/groups/[groupId]`: "Opens soon"
- `/groups/one-on-one`: "Opens soon"
- `/press`: "Opens soon"
- `/pro`: "Opens soon"
- `/squads`: "Squads and teams are coming soon. Your drills, games and streak keep counting in"
- `/squads/[id]`: "Squads and teams are coming soon. Your drills, games and streak keep counting in"
- `/squads/join/[token]`: "Squads and teams are coming soon. Your drills, games and streak keep counting in"
- `/teach`: "Teaching on FEL opens soon."
- `/teach/motion`: "Motion lessons open soon."
- `/train/combine`: "Combine results are coming soon."
- `/train/programs`: "Signature programs are coming soon. The daily drill and the exercise library are"

## 4. What the rig cannot render, and what it did instead

- **3D play (Babylon / WebGL).** The rig has no real GPU; the scenes draw in software. A 3D screen is scored on what is around the game (words, buttons, links, first content, layout shift) and its tap time is left "not measured", so it cannot count as passing yet. What happens during play is not in this pass (the game lanes own it).
- **The camera.** The browser is given a fake camera, so a camera screen is scored up to the moment it needs a person in front of it. Jump, sprint, bar-speed and screen readings come from the recorded fixtures and benches (`scripts/tools-easy-bench.ts`), not from this rig.
- **Screens that need a row someone else made** (an emailed token, a purchase): listed in section 5 with the reason.
- **Network.** The rig serves from the same machine, so there is no mobile-network delay in the first-content number: a real phone on mobile data is slower than these numbers. The JavaScript each screen downloads is recorded (`jsKb` in the JSON) for the speed work in phase 10.
- **A shared machine.** Other lanes run at the same time. A screen that misses the first-content budget by less than double is read twice and the better number stands.
- **Contrast** is the accessibility scan's computed contrast, not the readable lane's pixel measurement (`docs/READABLE.md`), which stays that lane's number.
- **A tap time is one sample.** Re-reading the same screen moved one tap from 168 ms to 296 ms on the shared machine (the machine's load is recorded beside each screen, `load.machineLoad`). Phase 10 should take the median of three; until then a screen just over 200 ms is a candidate, not a verdict.
- **First content is measured from the same machine**, so it is a floor: every scored screen met 2.5 s here (median about 0.6 s), and that number says nothing about a phone on mobile data.
- **Only the main action is tapped.** The other buttons on a screen are not pressed by the scorer; in training and coaching the job walks press them (`docs/EVERY-SCREEN-JOBS.md`).

## 5. Not scored: 6

| Screen | Phase | Why |
|---|---|---|
| `/card/[slug]` | 8 | needs a published creator card row; a new account has none |
| `/consent/guardian/[token]` | 6 | needs a guardian-consent row with its emailed token |
| `/guardian/report/[token]` | 9 | needs a guardian report row with its emailed token |
| `/p/[token]` | 8 | needs a coach share-link row (a coach sharing a client's progress); none exists on a new account |
| `/play/gb-shelf/[slug]` | 7 | v1 of the homebrew shelf ships no titles (BINJGB-SHELF-1, OQ-10), so every slug is a 404 by design; switched off: BINJGB_SHELF_ENABLED (the Game Boy homebrew shelf) |
| `/u/[slug]` | 8 | needs a published creator card row; a new account has none |

**Not a screen of its own (7):** `/age` → /; `/c/[code]/play` → /c/NONE00; `/education` → /learn; `/play/tiebreak` → /play/tennis; `/play/training` → /train; `/settings` → /account; `/training` → /coach.

## 6. Every screen

✓ pass · ✗ fail · ? not measured. "Who" is measured: the rig opens each screen signed out, as an adult athlete, a coached client, a coach, an admin and a 15-year-old, and records who gets the page.

### Phase 2 — from opening the app to finishing a workout (12 screens; 2 of 8 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/play/drills` | signed-in | do | ✗ | ✓ | ✓ | ✓ | 123 words before scrolling (the budget is 40). |
| `/play/training` | nobody (redirects away) | do | – | – | – | – | *not its own screen: redirects to /train for everyone who is signed in* |
| `/program/[accessId]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/program/unlock` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/signature` | signed-in | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/train` | signed-in | hub | ✓ | ✓ | ✗ | ✓ | "Account settings →" answers a tap in 208 ms (the budget is 200 ms). |
| `/train/library` | signed-in | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/train/programs` | signed-in | hub | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Signature programs are coming soon. The daily drill and the exercise library are". |
| `/train/programs/[id]` | admin | do | ✗ | ✗ | ✓ | ✓ | 238 words before scrolling (the budget is 40). review: a number with no method line (the list links no program while it is switched off: opened by its address) |
| `/train/today-drill` | signed-in | do | ✗ | ✓ | ✗ | ✓ | A floating button covers what is under it: "Start" covers "New: one short drill a day, from you". |
| `/training` | nobody (redirects away) | do | – | – | – | – | *not its own screen: redirects to /coach for everyone who is signed in* |
| `/workout` | signed-in | do | ✗ | ✗ | ✓ | ✓ | 183 words before scrolling (the budget is 40). |

### Phase 3 — the AI program builder (1 screens; 0 of 1 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/train/build` | signed-in | do | ✗ | ✓ | ✓ | ✓ | 126 words before scrolling (the budget is 40). review: a number with no method line (scored with the sample ask built: the program view) |

### Phase 4 — numbers you can trust (14 screens; 4 of 14 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/play/mirror` | signed-in | do | ✗ | ✓ | ✓ | ✓ | 118 words before scrolling (the budget is 40). |
| `/play/mirror/assess` | anyone | do | ✗ | ✓ | ✓ | ✓ | 42 words before scrolling (the budget is 40; 31 words of approved notices not counted). |
| `/play/mirror/assess/results` | anyone | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/play/mirror/correctives` | signed-in | do | ✗ | ✓ | ✓ | ✓ | 63 words before scrolling (the budget is 40). |
| `/screen` | anyone | do | ✗ | ✓ | ✓ | ✓ | 42 words before scrolling (the budget is 40; 31 words of approved notices not counted). |
| `/screen/privacy` | anyone | read | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/screen/program/[lane]` | anyone | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/train/combine` | signed-in | do | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Combine results are coming soon.". |
| `/train/jumps` | signed-in | do | ✗ | ✓ | ✓ | ✓ | 77 words before scrolling (the budget is 40). |
| `/train/progress` | signed-in | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/train/readiness` | signed-in | do | ✗ | ✓ | ✓ | ✓ | 57 words before scrolling (the budget is 40; 15 words of approved notices not counted). |
| `/train/shots` | signed-in | do | ✗ | ✓ | ✓ | ✓ | 75 words before scrolling (the budget is 40; 17 words of approved notices not counted). review: a number with no method line |
| `/train/speed` | signed-in | do | ✗ | ✗ | ✓ | ✓ | 66 words before scrolling (the budget is 40). |
| `/train/velocity` | signed-in | do | ✗ | ✗ | ✓ | ✓ | 88 words before scrolling (the budget is 40). |

### Phase 5 — booking, groups and the coach's day (34 screens; 11 of 21 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/account/bookings` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/account/coaching` | signed-in | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/coach` | signed-in; scored as coach | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/coach/[slug]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL); or COACH_MARKETPLACE_ENABLED (find a coach))* |
| `/coach/[slug]/book/[listingId]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/coach/[slug]/fee/[packageId]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL); or COACH_MARKETPLACE_ENABLED (find a coach))* |
| `/coach/[slug]/programs/[lane]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/coach/admin` | admin | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/coach/admin/library` | admin | do | ✗ | ✗ | ✓ | ✓ | 114 paragraphs of body copy under 16 px. |
| `/coach/admin/programs` | admin | do | ✗ | ✗ | ✗ | ✓ | 343 words before scrolling (the budget is 40). |
| `/coach/business` | signed-in; scored as coach | hub | ✗ | ✗ | ✓ | ✓ | An empty state with no next step: "Coach Pro is not on sale yet. Nothing is limited until it is.". |
| `/coach/business/thanks` | anyone; scored as coach | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/coach/combine` | signed-in; scored as coach | do | ✗ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Saving combines to your account is coming soon. This combine is kept on this pho". |
| `/coach/dashboard` | nobody (a 404 for everyone) | hub | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/coach/dashboard/settings` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/coach/form-review` | signed-in (coached client) | do | ✗ | ✓ | ✓ | ✓ | 41 words before scrolling (the budget is 40; 6 words of approved notices not counted). (opened from the first exercise of the client's session, as the app links it) |
| `/coach/groups` | signed-in; scored as coach | do | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Opens soon". |
| `/coach/highlight/[id]` | signed-in | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/coach/join` | anyone | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/coach/join/[token]` | anyone; scored as solo | do | ✓ | ✓ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.064; the budget is 0.02). (a real invite made by the rig's coach, opened by an athlete who has not joined) |
| `/coach/live/[room]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (NEXT_PUBLIC_COACH_LIVE_ENABLED (live coach sessions))* |
| `/coach/offers/[offer]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/coach/review/[bookingId]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/coach/session` | signed-in; scored as coach | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/coach/shots` | signed-in; scored as coach | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/coach/thanks` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/coach/velocity` | signed-in; scored as coach | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/coaches` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_MARKETPLACE_ENABLED (find a coach))* |
| `/groups` | anyone | hub | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Opens soon". |
| `/groups/[groupId]` | anyone | do | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Opens soon". (the group-booking table is not applied: any group link shows the dark screen) |
| `/groups/one-on-one` | anyone | do | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Opens soon". |
| `/groups/trainer/[code]` | signed-in; scored as coach | do | ✓ | ✓ | ✓ | ✓ | **passes all four** (the group-booking table is not applied: any trainer invite shows the dark screen) |
| `/session/[bookingId]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/sessions` | signed-in | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |

### Phase 6 — the first five minutes (9 screens; 6 of 7 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/` | anyone | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/age` | nobody (redirects away) | do | – | – | – | – | *not its own screen: redirects to / for everyone who is signed in* |
| `/consent/guardian` | signed-in | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/consent/guardian/[token]` | unknown (no fixture) | do | – | – | – | – | *not scored: needs a guardian-consent row with its emailed token* |
| `/join` | anyone | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/login` | anyone | do | ✓ | ✓ | ✗ | ✓ | "ENTER THE LAB" answers a tap in 336 ms (the budget is 200 ms). |
| `/signup` | anyone | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/try` | anyone | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/welcome` | signed-in | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |

### Phase 7 — around the games (57 screens; 10 of 49 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/arena` | signed-in | hub | ✗ | ✗ | ✓ | ✗ | 1 serious accessibility finding (contrast). |
| `/c/[code]` | anyone | do | – | – | – | – | *switched off: a 404 (not switched off: a challenge code that does not exist is the app's 404 (a real challenge needs a row a player makes by sending one))* |
| `/c/[code]/play` | nobody (redirects away) | do | – | – | – | – | *not its own screen: redirects to /c/NONE00 for everyone who is signed in* |
| `/controller/[code]` | anyone | do | ✓ | ✓ | ✓ | ✓ | **passes all four** (a made-up room code: the screen a phone shows before the TV answers) |
| `/host` | anyone | do | ✗ | ✗ | ✓ | ✓ | 74 words before scrolling (the budget is 40). |
| `/ladder` | signed-in | hub | ✗ | ✗ | ✓ | ✓ | Nothing in the screen itself leads on: only the app's own bars do. |
| `/live` | signed-in | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/live/schedule` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (LIVE_STREAM_SCHEDULE_ENABLED (the live schedule))* |
| `/modes` | anyone | hub | ✓ | ✗ | ✓ | ✓ | 29 paragraphs of body copy under 16 px. |
| `/multiplayer` | signed-in | hub | ✗ | ✗ | ✓ | ✗ | An empty state with no next step: "No matches yet. Create a challenge above to get started.". |
| `/party` | anyone | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/party/[code]` | anyone | do | ✗ | ✓ | ✓ | ✓ | 108 words before scrolling (the budget is 40). (a made-up party code) |
| `/play` | signed-in | hub | ✓ | ✗ | ✓ | ✓ | Text cut off at 390 px: "Breakaway · Twelve Yards · Baseball · Moonsh". |
| `/play/acting` | signed-in | do | ✗ | ✗ | ✓ | ✓ | 45 words before scrolling (the budget is 40). |
| `/play/adventure` | anyone | do | ✗ | ✗ | ? | ✓ | 1 paragraph of body copy under 16 px. |
| `/play/adventure-br` | anyone | do | ✗ | ✗ | ✓ | ✓ | Dead end: nothing on the screen leads on or back. |
| `/play/aero-aces` | signed-in | do | ✓ | ✗ | ? | ✗ | 1 critical accessibility finding (contrast). |
| `/play/baseball` | signed-in | do | ✗ | ✗ | ? | ✓ | 66 words before scrolling (the budget is 40). |
| `/play/big-air` | signed-in | do | ✓ | ✓ | ? | ✓ | not measured: tap response; Fast and smooth: a 3D screen: the rig has no real GPU, so the tap response is not timed |
| `/play/brain-brawl` | signed-in | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/play/calibrate` | signed-in | do | ✗ | ✗ | ✓ | ✓ | 98 words before scrolling (the budget is 40). |
| `/play/carnival` | signed-in | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/play/carnival/recap` | signed-in | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/play/dance` | signed-in | do | ✓ | ✗ | ? | ✗ | Text cut off at 200 % zoom: "◀ ▶ TRACK · ▲ ▼ LEVEL · Y MATCH · X FREE · A". |
| `/play/derby` | signed-in | do | ✓ | ✓ | ✗ | ✓ | "Capture and stream menu" answers a tap in 280 ms (the budget is 200 ms). |
| `/play/duel` | signed-in | do | ✓ | ✓ | ? | ✓ | not measured: tap response; Fast and smooth: a 3D screen: the rig has no real GPU, so the tap response is not timed |
| `/play/dunk` | signed-in | do | ✓ | ✗ | ✓ | ✓ | Text cut off at 200 % zoom: "0" and 5 more. |
| `/play/dunkduel` | signed-in | do | ✗ | ✓ | ✓ | ✓ | 88 words before scrolling (the budget is 40). |
| `/play/football` | signed-in | do | ✓ | ✗ | ✓ | ✓ | 3 pieces of text under 12 px. |
| `/play/freerun` | signed-in | do | ✓ | ✗ | ? | ✓ | 1 piece of text under 12 px. |
| `/play/gb-shelf` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (BINJGB_SHELF_ENABLED (the Game Boy homebrew shelf))* |
| `/play/gb-shelf/[slug]` | unknown (no fixture) | do | – | – | – | – | *not scored: v1 of the homebrew shelf ships no titles (BINJGB-SHELF-1, OQ-10), so every slug is a 404 by design; switched off: BINJGB_SHELF_ENABLED (the Game Boy homebrew shelf)* |
| `/play/golf` | signed-in | do | ✓ | ✓ | ✗ | ✓ | "Capture and stream menu" answers a tap in 248 ms (the budget is 200 ms). |
| `/play/irl` | signed-in | do | ✗ | ✓ | ✓ | ✓ | 42 words before scrolling (the budget is 40). |
| `/play/karate` | signed-in | do | ✓ | ✗ | ✓ | ✓ | 1 piece of text under 12 px. |
| `/play/karate-vs` | signed-in | do | ✗ | ✓ | ? | ✓ | A floating button covers what is under it: "Couch (2–4)" covers "BEST OF 3 — RIVAL SENSEI". |
| `/play/map-preview` | signed-in | do | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.062; the budget is 0.02). |
| `/play/mixedcombat` | signed-in | do | ✓ | ✓ | ? | ✓ | not measured: tap response; Fast and smooth: a 3D screen: the rig has no real GPU, so the tap response is not timed |
| `/play/music` | signed-in | do | ✗ | ✗ | ✗ | ✓ | "TAP TO START" answers a tap in 368 ms (the budget is 200 ms). |
| `/play/onevone` | signed-in | do | ✓ | ✓ | ? | ✓ | not measured: tap response; Fast and smooth: a 3D screen: the rig has no real GPU, so the tap response is not timed |
| `/play/party` | signed-in | do | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.052; the budget is 0.02). |
| `/play/shared` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (a 404 by design: only its share links are pages (lib/nav/reachability.test.ts))* |
| `/play/shared/[token]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (STUDIO_SHARE_ENABLED (Studio share links))* |
| `/play/showdown` | signed-in | do | ✓ | ✓ | ? | ✓ | not measured: tap response; Fast and smooth: a 3D screen: the rig has no real GPU, so the tap response is not timed |
| `/play/skateboard` | signed-in | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/play/snowboard` | signed-in | do | ✓ | ✗ | ? | ✓ | Text cut off at 200 % zoom: "· PAR 60". |
| `/play/soccer` | signed-in | do | ✓ | ✗ | ? | ✓ | Text cut off with 150 % text: "0" and 1 more. |
| `/play/sprint` | signed-in | do | ✓ | ✓ | ? | ✓ | not measured: tap response; Fast and smooth: a 3D screen: the rig has no real GPU, so the tap response is not timed |
| `/play/surf` | signed-in | do | ✓ | ✓ | ? | ✓ | not measured: tap response; Fast and smooth: a 3D screen: the rig has no real GPU, so the tap response is not timed |
| `/play/tennis` | signed-in | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/play/threepoint` | signed-in | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/play/threevthree` | signed-in | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/play/tiebreak` | nobody (redirects away) | do | – | – | – | – | *not its own screen: redirects to /play/tennis for everyone who is signed in* |
| `/play/velocity-kart` | signed-in | do | ✓ | ✗ | ✓ | ✗ | 1 critical accessibility finding (contrast). |
| `/play/volleyball` | signed-in | do | ✓ | ✓ | ? | ✓ | not measured: tap response; Fast and smooth: a 3D screen: the rig has no real GPU, so the tap response is not timed |
| `/play/who-scene-it` | signed-in | do | ✓ | ✗ | ? | ✓ | 1 piece of text under 12 px. |
| `/venues` | signed-in | hub | ✓ | ✗ | ✓ | ✓ | 1 paragraph of body copy under 16 px. |

### Phase 8 — your things (24 screens; 7 of 20 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/account` | signed-in | hub | ✓ | ✓ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.112; the budget is 0.02). |
| `/admin/funnel` | admin | hub | ✗ | ✗ | ✓ | ✓ | An empty state with no next step: "No wins yet". |
| `/admin/metrics` | admin | hub | ✓ | ✗ | ✗ | ✓ | An empty state with no next step: "No stored rollups yet. Click “Recompute” to generate them from traffic.". |
| `/admin/review` | admin | hub | ✗ | ✗ | ✓ | ✗ | "WAITING" does nothing when tapped. |
| `/card/[slug]` | unknown (no fixture) | do | – | – | – | – | *not scored: needs a published creator card row; a new account has none* |
| `/cards` | signed-in | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/closet` | signed-in | hub | ✓ | ✗ | ? | ✓ | 8 button looks on one screen (at most 3). |
| `/market` | signed-in | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/p/[token]` | unknown (no fixture) | do | – | – | – | – | *not scored: needs a coach share-link row (a coach sharing a client's progress); none exists on a new account* |
| `/pro` | signed-in | do | ✗ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Opens soon". |
| `/profile` | signed-in | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/profile/challenges` | signed-in | do | ✗ | ✗ | ✓ | ✓ | 69 words before scrolling (the budget is 40). |
| `/profile/edit` | signed-in | do | ✗ | ✗ | ✓ | ✓ | 79 words before scrolling (the budget is 40). |
| `/profile/week` | signed-in | do | ✗ | ✗ | ✓ | ✓ | 114 words before scrolling (the budget is 40). |
| `/settings` | nobody (redirects away) | do | – | – | – | – | *not its own screen: redirects to /account for everyone who is signed in* |
| `/shop` | signed-in | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/shop/shards` | signed-in | do | ✗ | ✗ | ✓ | ✓ | Nothing in the screen itself leads on: only the app's own bars do. review: a number with no method line |
| `/squads` | signed-in | hub | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Squads and teams are coming soon. Your drills, games and streak keep counting in". |
| `/squads/[id]` | signed-in | do | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Squads and teams are coming soon. Your drills, games and streak keep counting in". (the teams-and-squads tables are not applied) |
| `/squads/join/[token]` | anyone | do | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Squads and teams are coming soon. Your drills, games and streak keep counting in". (the teams-and-squads tables are not applied) |
| `/store` | signed-in | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/support` | anyone | read | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/u/[slug]` | unknown (no fixture) | do | – | – | – | – | *not scored: needs a published creator card row; a new account has none* |
| `/wallet` | signed-in | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |

### Phase 9 — learn, create and the public pages (36 screens; 17 of 34 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/camp` | signed-in | read | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/coach-terms` | anyone | read | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/create` | signed-in | hub | ✓ | ✗ | ✓ | ✓ | An empty state with no next step: "Nothing yet. Pick a tile above: three steps and it is a card.". |
| `/create/[discipline]` | signed-in | do | ✗ | ✗ | ✓ | ✗ | "From my Academy library" does nothing when tapped. |
| `/creator` | signed-in | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/creator/athlete` | signed-in | do | ✗ | ✓ | ✓ | ✓ | 85 words before scrolling (the budget is 40). |
| `/credits` | anyone | read | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/education` | nobody (redirects away) | read | – | – | – | – | *not its own screen: redirects to /learn for everyone who is signed in* |
| `/education/course/[id]` | signed-in | read | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/education/playbook` | signed-in | read | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/education/playbook/[chapter]` | signed-in | read | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/guardian/report/[token]` | unknown (no fixture) | read | – | – | – | – | *not scored: needs a guardian report row with its emailed token* |
| `/guidance` | signed-in | read | ✓ | ✗ | ✓ | ✓ | An empty state with no next step: "no history yet — this is an invitation, not a recommendation". |
| `/kitchens` | signed-in | read | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/kitchens/fuel` | signed-in | read | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/learn` | anyone | read | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/learn/feed` | anyone | read | ✓ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.035; the budget is 0.02). |
| `/links` | anyone | read | ✓ | ✗ | ✓ | ✓ | 4 button looks on one screen (at most 3). |
| `/media-kit` | anyone | read | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "[OWNER: monthly players, as of date]". |
| `/press` | anyone | read | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "[OWNER: number]". |
| `/press/[slug]` | anyone | read | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/press/library` | anyone | read | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/press/receipt` | anyone | read | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/privacy` | anyone | read | ✗ | ✓ | ✓ | ✓ | Nothing in the screen itself leads on: only the app's own bars do. |
| `/purchase-terms` | anyone | read | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/store-terms` | anyone | read | ✓ | ✗ | ✓ | ✓ | An empty state with no next step: "Nothing here stops you from contacting a government consumer-protection agency.". |
| `/story` | signed-in | read | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/story/boss` | signed-in | read | ✗ | ✗ | ✗ | ✓ | A floating button covers what is under it: "Controls help" covers "SPACE / W — Jump (dodge)" (and 5 more). |
| `/story/rail` | signed-in | read | ✗ | ✗ | ✗ | ✓ | A floating button covers what is under it: "Controls help" covers "A / D / ← → — Switch rail" (and 4 more). |
| `/studio` | admin | hub | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.027; the budget is 0.02). |
| `/teach` | signed-in | hub | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Teaching on FEL opens soon.". |
| `/teach/motion` | signed-in | do | ✗ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Motion lessons open soon.". |
| `/team` | anyone | read | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "[OWNER: profiles]". |
| `/team/[slug]` | anyone | read | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/terms` | anyone | read | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/work-with-us` | anyone | read | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "[OWNER: link to the application, P2]". |

## 7. Running it again

```sh
export ES_OUT=<a scratch folder>                                             # results, shots, the sign-ins; never the repo
/home/user/wt/cpu-run.sh npx tsx scripts/every-screen/rig.mts build         # next build into .next-every-screen (then: git checkout -- tsconfig.json)
/home/user/wt/gate-run.sh 900 npx tsx scripts/every-screen/score.mts --plant      # the controls: must print PLANT OK
/home/user/wt/gate-run.sh 900 npx tsx scripts/every-screen/score.mts --budget=850 # the crawl; run again until "0 screens left"
/home/user/wt/gate-run.sh 900 npx tsx scripts/every-screen/dark.mts               # dark vs lit
npx tsx scripts/every-screen/score.mts --report                              # this file and docs/every-screen/scorecard.json
npx tsx scripts/every-screen/rig.mts db-down && rm -rf .next-every-screen    # stop the database, drop the build
```

Re-score some screens: `--routes=/train,/coach --redo`. Training and coaching only: `--tc`. The rules and their tests: `lib/every-screen/judge.ts`, `lib/every-screen/judge.test.ts`.
