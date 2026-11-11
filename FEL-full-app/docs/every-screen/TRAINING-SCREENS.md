# Training and coaching screens: the end of phase 5

The plan's gate for phase 5: "All 52 training and coaching screens pass all four checks, or are listed with the reason."
Read on the rig (2026-11-11), re-judged with `lib/every-screen/judge.ts`. Checks: clear and quick · looks finished · fast and smooth · right and trustworthy.

**15 pass all four · 29 listed with the reason · 15 switched off · 2 redirect to another screen** (61 entries in phases 1–5).

| Screen | Phase | Checks | Result | What failed, and why it stays |
|---|---|---|---|---|
| `/account/bookings` | 5 | – | switched off | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/account/coaching` | 5 | ✓ ✓ ✓ ✓ | **passes all four** | |
| `/coach` | 5 | ✓ ✓ ✓ ✓ | **passes all four** | |
| `/coach/[slug]` | 5 | – | switched off | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL); or COACH_MARKETPLACE_ENABLED (find a coach) |
| `/coach/[slug]/book/[listingId]` | 5 | – | switched off | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/[slug]/fee/[packageId]` | 5 | – | switched off | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL); or COACH_MARKETPLACE_ENABLED (find a coach) |
| `/coach/[slug]/programs/[lane]` | 5 | – | switched off | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/admin` | 5 | ✓ ✓ ✓ ✓ | **passes all four** | |
| `/coach/admin/library` | 5 | ✗ ✗ ✓ ✓ | listed | 114 paragraphs of body copy under 16 px. 78 words before scrolling (the budget is 40). **Why it stays:** The owner's review of the exercise library drafts. Dense by design. |
| `/coach/admin/programs` | 5 | ✗ ✗ ✗ ✓ | listed | 343 words before scrolling (the budget is 40). 22 paragraphs of body copy under 16 px. "Edit the sessions" answers a tap in 296 ms (the budget is 200 ms). **Why it stays:** The owner's review of the signature programs: every check, gap and dose on one page. Dense by design. |
| `/coach/business` | 5 | ✗ ✗ ✓ ✓ | listed | An empty state with no next step: "Coach Pro is not on sale yet. Nothing is limited until it is.". 1 paragraph of body copy under 16 px. 1 tap target under 44 px (smallest: "on"). **Why it stays:** "Coach Pro is not on sale yet" and the payments line are owner-approved (money is switched off); the terms tick is a native checkbox in a 44 px row. |
| `/coach/business/thanks` | 5 | ✗ ✓ ✓ ✓ | listed | 41 words before scrolling (the budget is 40). **Why it stays:** One word over: the page says why it is empty and offers two ways on. |
| `/coach/combine` | 5 | ✗ ✗ ✓ ✓ | listed | Unfinished mark on screen: "Saving combines to your account is coming soon. This combine is kept on this pho". 81 words before scrolling (the budget is 40). 5 text sizes on one screen besides 16 px body text (at most 4). **Why it stays:** The same combine switch; the coach can still run a combine on the device. Also over the word budget: the owner-approved switched-off line and the how-to. |
| `/coach/dashboard` | 5 | – | switched off | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/dashboard/settings` | 5 | – | switched off | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/form-review` | 5 | ✗ ✓ ✓ ✓ | listed | 56 words before scrolling (the budget is 40). **Why it stays:** The set-up line and "every number is an estimate" (wording not changed). |
| `/coach/groups` | 5 | ✓ ✗ ✓ ✓ | listed | Unfinished mark on screen: "Opens soon". **Why it stays:** The same switch as /groups. With the SQL applied, today's session opens on its roster: one tap a person. |
| `/coach/highlight/[id]` | 5 | ✗ ✓ ✓ ✓ | listed | 53 words before scrolling (the budget is 40). **Why it stays:** The consent wording for sharing a result (not changed). |
| `/coach/join` | 5 | ✓ ✓ ✓ ✓ | **passes all four** | |
| `/coach/join/[token]` | 5 | ✗ ✓ ✗ ✓ | listed | The screen jumps as it loads (layout shift 0.135; the budget is 0.02). 44 words before scrolling (the budget is 40). **Why it stays:** The invite line (what the coach can do, and that you can leave at any time) and the join button: 4 words over, wording not changed. Under heavy load the rig once measured the page dropping by the top bar's height (an invite can be opened signed out, so the bar's space is not held); holding it would need the session on the server for every page, a deploy change. |
| `/coach/live/[room]` | 5 | – | switched off | switched off: NEXT_PUBLIC_COACH_LIVE_ENABLED (live coach sessions) |
| `/coach/offers/[offer]` | 5 | – | switched off | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/review/[bookingId]` | 5 | – | switched off | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/session` | 5 | ✗ ✓ ✓ ✓ | listed | 43 words before scrolling (the budget is 40). **Why it stays:** The nickname and privacy note for a court session (not changed); 3 words over. |
| `/coach/shots` | 5 | ✓ ✓ ✓ ✓ | **passes all four** | |
| `/coach/thanks` | 5 | – | switched off | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/velocity` | 5 | ✓ ✓ ✓ ✓ | **passes all four** | |
| `/coaches` | 5 | – | switched off | switched off: COACH_MARKETPLACE_ENABLED (find a coach) |
| `/groups` | 5 | ✓ ✗ ✓ ✓ | listed | Unfinished mark on screen: "Opens soon". **Why it stays:** Group booking is switched off until the owner applies prisma/pending/2026-11-02-group-booking.sql and sets the business owner: the screen says "Opens soon", why, and what to do instead. With the SQL applied (the LIT rig) joining is 4 taps, a 1:1 is 5, a cancel is 3 with the rule first. |
| `/groups/[groupId]` | 5 | ✓ ✗ ✓ ✓ | listed | Unfinished mark on screen: "Opens soon". **Why it stays:** The same switch as /groups (a shared group link). |
| `/groups/one-on-one` | 5 | ✓ ✗ ✓ ✓ | listed | Unfinished mark on screen: "Opens soon". **Why it stays:** The same switch as /groups. |
| `/groups/trainer/[code]` | 5 | ✓ ✓ ✓ ✓ | **passes all four** | |
| `/play/drills` | 2 | ✗ ✓ ✓ ✓ | listed | 123 words before scrolling (the budget is 40). **Why it stays:** The drill shelf's descriptions: each drill is a choice with its line. |
| `/play/mirror` | 4 | ✗ ✓ ✓ ✓ | listed | 118 words before scrolling (the budget is 40). **Why it stays:** The health check before the Mirror: what is stored, why, who sees it (consent wording, not changed). |
| `/play/mirror/assess` | 4 | ✗ ✓ ✓ ✓ | listed | 42 words before scrolling (the budget is 40; 31 words of approved notices not counted). **Why it stays:** The same screen as /screen. |
| `/play/mirror/assess/results` | 4 | ✓ ✓ ✓ ✓ | **passes all four** | |
| `/play/mirror/correctives` | 4 | ✗ ✓ ✓ ✓ | listed | 63 words before scrolling (the budget is 40). **Why it stays:** The correctives' explanation and the switched-off line (wording not changed). |
| `/play/training` | 2 | – | redirects | redirects to /train for everyone who is signed in |
| `/program/[accessId]` | 2 | – | switched off | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/program/unlock` | 2 | – | switched off | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/screen` | 4 | ✗ ✓ ✓ ✓ | listed | 42 words before scrolling (the budget is 40; 31 words of approved notices not counted). **Why it stays:** Two choices, then the "not a medical exam" notice, the early-version note, the four moves and the privacy line (owner-approved notices). |
| `/screen/privacy` | 4 | ✓ ✓ ✓ ✓ | **passes all four** | |
| `/screen/program/[lane]` | 4 | ✓ ✓ ✓ ✓ | **passes all four** | |
| `/session/[bookingId]` | 5 | – | switched off | switched off: COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/sessions` | 5 | ✓ ✓ ✓ ✓ | **passes all four** | |
| `/signature` | 2 | ✓ ✓ ✓ ✓ | **passes all four** | |
| `/train` | 2 | ✓ ✓ ✓ ✓ | **passes all four** | |
| `/train/build` | 3 | ✗ ✓ ✓ ✓ | listed | 168 words before scrolling (the budget is 40). **Why it stays:** Once a program is built, the program is the first screen: its summary, the weeks and the day cards (the ask and what FEL read fold to one line). 40 words is a single-action screen; reaching it means a different program view. |
| `/train/combine` | 4 | ✓ ✗ ✓ ✓ | listed | Unfinished mark on screen: "Combine results are coming soon.". **Why it stays:** Saving combines is switched off until the combine tables are applied (lib/combine/store.ts combineReady). The line is the owner-approved one. |
| `/train/jumps` | 4 | ✗ ✓ ✓ ✓ | listed | 77 words before scrolling (the budget is 40). **Why it stays:** A menu of six jump tests, each with a short line: the words are the choices. |
| `/train/library` | 2 | ✓ ✓ ✓ ✓ | **passes all four** | |
| `/train/programs` | 2 | ✓ ✗ ✓ ✓ | listed | Unfinished mark on screen: "Signature programs are coming soon. The daily drill and the exercise library are". **Why it stays:** Signature programs are switched off until their tables are applied and the owner approves programs (owner-approvals #469); the line is the owner-approved one. |
| `/train/programs/[id]` | 2 | ✗ ✗ ✓ ✓ | listed | 238 words before scrolling (the budget is 40). 7 paragraphs of body copy under 16 px. 7 text sizes on one screen besides 16 px body text (at most 4). **Why it stays:** Shown only to the owner while programs are off: the owner's review of a program (its sources, gaps and every dose). Dense by design. |
| `/train/progress` | 4 | ✓ ✓ ✓ ✓ | **passes all four** | |
| `/train/readiness` | 4 | ✗ ✓ ✓ ✓ | listed | 57 words before scrolling (the budget is 40; 15 words of approved notices not counted). **Why it stays:** The set-up picture line, "not a diagnosis", and the coach's rules for the day (safety wording). |
| `/train/shots` | 4 | ✗ ✓ ✓ ✓ | listed | 75 words before scrolling (the budget is 40; 17 words of approved notices not counted). 1 tap target under 44 px (smallest: "on"). **Why it stays:** The set-up choices (where the phone stands, height) with the beta and privacy lines; the set-up guide is now one tap away. The front-camera tick is a native checkbox in a 44 px row. |
| `/train/speed` | 4 | ✗ ✗ ✓ ✓ | listed | 66 words before scrolling (the budget is 40). 4 button looks on one screen (at most 3). **Why it stays:** The tests, the diagram and the settings line; the four set-up steps are now one tap away. Its four button looks (test chips, the settings line, CSV/clear, Start) are not merged in this phase. |
| `/train/today-drill` | 2 | ✗ ✓ ✗ ✓ | listed | "Start" answers a tap in 344 ms (the budget is 200 ms). 61 words before scrolling (the budget is 40). **Why it stays:** The drill's three steps, its why and the first-time line. Start answers in 280–720 ms: the tap starts the camera and the pose model (280 ms in phase 4 too); not fixed in this phase. |
| `/train/velocity` | 4 | ✗ ✗ ✓ ✓ | listed | 88 words before scrolling (the budget is 40). 1 tap target under 44 px (smallest: "on"). 6 button looks on one screen (at most 3). **Why it stays:** The lift, load and the stop line, with the privacy line; the tips and the slow-motion picker are now one tap away. Six button looks are not merged in this phase; the warm-up tick is a native checkbox in a 44 px row. |
| `/training` | 2 | – | redirects | redirects to /coach for everyone who is signed in |
| `/workout` | 2 | ✗ ✗ ✓ ✓ | listed | 183 words before scrolling (the budget is 40). 1 paragraph of body copy under 16 px. 2 tap targets under 44 px (smallest: "on"). **Why it stays:** The template picker's own explanation and its two products with their prices; cutting words means new copy (owner's call). Its consent ticks are native checkboxes. |

Made by `scripts/every-screen/training-list.mts`.
