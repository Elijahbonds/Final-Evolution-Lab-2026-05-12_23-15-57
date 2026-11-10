# The every-screen scorecard

**Owner, 2026-11-10:** "To improve the total quality of the product from improving every screen."

This is phase 1 of `docs/PLAN-EVERY-SCREEN-10PHASE.md`: every screen a person can reach, scored on the plan's four checks. It is the starting line for all ten phases. Written by `scripts/every-screen/score.mts --report` from the rig's last run (2026-11-10); do not edit it by hand.

## The number

**4 of 184 screens pass all four checks.**

| | Screens |
|---|---|
| Pages a person can reach (`app/**/page.tsx`, less the developer pages) | 184 |
| Scored on the rig | 115 |
| Not a screen of its own: it only sends you on to another | 5 |
| Switched off: a 404 for everyone today | 20 |
| Not scored, with the reason (section 5) | 44 |
| **Pass all four** | **4** |
| Training and coaching (phases 2–5): pass all four | 0 of 61 (42 scored) |

| Check | Pass | Fail | Not measured |
|---|---|---|---|
| 1. Clear and quick | 11 | **104** | 0 |
| 2. Looks finished | 10 | **105** | 0 |
| 3. Fast and smooth | 34 | **61** | 20 |
| 4. Right and trustworthy | 72 | **43** | 0 |

Of the 115 scored screens. "Not measured" is a 3D screen's tap time: the rig has no real GPU, so that one number is left open and the screen is not counted as passing.

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

**Controls: passed** on 2026-11-10 09:45 UTC (scorer version 2).

**The scorer was checked before it was believed** (`score.mts --plant`, and again at the start of every crawl): a clean control page must pass all four, and each planted fault (three bright buttons, 120 words, a 30 px target, a dead end, "Coming soon", an owner placeholder, an empty state, a wordless spinner, sideways scroll, 10 px text, six text sizes, five button looks, slow first content, a jumping banner, a blocking tap handler, a link to a missing page, a link to nowhere, a button that does nothing, an unnamed button, a bare measured number) must be flagged on its own page and fail only its own check.

## 2. The ten most common faults, and where each comes from

The plan's rule: fix the shared thing first. "Alone" is how many screens would pass all four if this one fault were fixed everywhere and nothing else changed.

| # | Fault | Screens | Alone | Check |
|---|---|---|---|---|
| 1 | Tap targets under 44 px in the screen itself | 93 | 0 | 1 |
| 2 | Body copy under 16 px | 69 | 0 | 2 |
| 3 | The screen jumps as it loads | 58 | 0 | 3 |
| 4 | More than 4 text sizes on one screen | 49 | 0 | 2 |
| 5 | More than 40 words before scrolling on a do-this screen | 43 | 1 | 1 |
| 6 | More than 3 button looks on one screen | 42 | 0 | 2 |
| 7 | Tap targets under 44 px in the app's own bars | 31 | 0 | 1 |
| 8 | Critical accessibility findings | 30 | 1 | 4 |
| 9 | The screen throws an error | 26 | 0 | 4 |
| 10 | Text under 12 px | 18 | 0 | 2 |

<details><summary>The elements behind them (the rig's own list)</summary>

**Small tap targets in the app's own bars (screens)**

- 23 × `"Home" 75×30 a.flex.shrink-0.items-center.gap-1.5 in [data-game-chrome]`
- 23 × `"Play with your body" 81×32 button.inline-flex.items-center.gap-2.rounded-lg in [data-game-chrome]`
- 23 × `"Auto Performance Quality" 118×32 select.h-8.rounded-md.border.border-white/10 in [data-game-chrome]`
- 23 × `"Full screen" 32×32 button.grid.h-8.w-8.place-items-center in [data-game-chrome]`
- 2 × `"Terms" 39×44 a.hover:text-white/70`
- 2 × `"Log in" 37×44 a.hover:text-white/70`
- 2 × `"VENUES" 55×15 a.font-sans.text-[12px].uppercase.tracking-[0.14em] in [data-couch-scale]`
- 2 × `"ARENA" 47×15 a.font-sans.text-[12px].uppercase.tracking-[0.14em] in [data-couch-scale]`
- 2 × `"LADDER" 55×15 a.font-sans.text-[12px].uppercase.tracking-[0.14em] in [data-couch-scale]`
- 2 × `"STORY" 45×15 a.font-sans.text-[12px].uppercase.tracking-[0.14em] in [data-couch-scale]`
- 2 × `"BIG SCREEN" 85×15 a.font-sans.text-[12px].uppercase.tracking-[0.14em] in [data-couch-scale]`
- 2 × `"JOIN A GAME" 93×15 a.font-sans.text-[12px].uppercase.tracking-[0.14em] in [data-couch-scale]`

**Small tap targets in screens (screens)**

- 54 × `"FE L" 28×40 a.fel-heading.inline-flex.min-h-10.shrink-0 in [data-couch-scale]`
- 54 × `"—" 65×40 a.fel-press.inline-flex.min-h-10.items-center in [data-couch-scale]`
- 54 × `"Sign out" 40×40 button.fel-press.grid.h-10.w-10 in [data-couch-scale]`
- 53 × `"Open the store" 188×26 a.transition-transform.active:scale-95 in [data-couch-scale]`
- 27 × `"Capture and stream menu" 42×29 button in [data-testid]`
- 6 × `"Motion and flashes: Match de" 158×28 button.rounded-full.border.px-3.py-1 in [data-splash-corner]`
- 6 × `"CONTROLLER" 101×24 button.rounded-full.border.px-2.py-0.5 in [data-controls-panel data-controls-fit]`
- 6 × `"KEYBOARD" 86×24 button.rounded-full.border.px-2.py-0.5 in [data-controls-panel data-controls-fit]`
- 6 × `"TOUCH" 61×24 button.rounded-full.border.px-2.py-0.5 in [data-controls-panel data-controls-fit]`
- 5 × `"← Train" 69×36 a.rounded-xl.border.border-white/10.px-3 in [data-couch-scale]`
- 4 × `"Home" 75×30 a.flex.shrink-0.items-center.gap-1.5 in [data-game-chrome]`
- 4 × `"Play with your body" 81×32 button.inline-flex.items-center.gap-2.rounded-lg in [data-game-chrome]`
- 4 × `"Auto Performance Quality" 118×32 select.h-8.rounded-md.border.border-white/10 in [data-game-chrome]`
- 4 × `"Full screen" 32×32 button.grid.h-8.w-8.place-items-center in [data-game-chrome]`
- 3 × `"FINAL EVOLUTION LAB" 206×32 a.fel-heading.text-2xl.font-bold.text-white`
- 2 × `"on" 13×13 input.mt-0.5`
- 2 × `"FINAL EVOLUTION LAB" 155×28 a.fel-heading.mb-10.text-lg.font-bold`
- 2 × `"Open local party room" 177×36 a.inline-flex.rounded-xl.bg-[#00E5FF].px-4 in [data-testid]`
- 2 × `"Got a code? Join a game" 157×20 a.font-semibold.text-[#00E5FF].underline.underline-offset-2 in [data-testid]`
- 2 × `"Creator Hub" 100×20 a.inline-flex.items-center.gap-2.text-sm`

**Text sizes per screen:** 1 sizes: 1 screens; 2 sizes: 2 screens; 3 sizes: 37 screens; 4 sizes: 26 screens; 5 sizes: 28 screens; 6 sizes: 15 screens; 7 sizes: 4 screens; 8 sizes: 1 screens; 10 sizes: 1 screens

**The sizes themselves (screens that use each)**

- 106 × `12px`
- 87 × `20px`
- 77 × `14px`
- 69 × `16px`
- 41 × `30px`
- 19 × `18px`
- 18 × `24px`
- 17 × `13px`
- 13 × `36px`
- 6 × `44px`
- 6 × `12.5px`
- 6 × `15px`
- 6 × `22px`
- 4 × `13.5px`
- 3 × `10px`
- 3 × `21px`
- 2 × `17px`
- 2 × `28px`
- 2 × `26px`
- 2 × `40px`
- 1 × `15.5px`
- 1 × `19px`
- 1 × `11.9px`
- 1 × `48px`
- 1 × `9px`
- 1 × `10.5px`
- 1 × `11px`

**Button looks per screen:** 0: 2; 1: 31; 2: 20; 3: 20; 4: 17; 5: 14; 6: 6; 7: 1; 8: 1; 9: 2; 14: 1

**Text under the READABLE floor**

- 12 × `body-small 12.5px div[data-splash-column=true]>div[data-splash-main=true]>aside[data-learn-idle=true]>p`
- 7 × `body-small 14px main[data-couch-scale=true]>header>div>p`
- 7 × `tiny 10.2px span[data-controls-panel=touch]>span[data-controls-rows=true]>span>span`
- 5 × `body-small 12px div>main>p`
- 4 × `body-small 14px div>div>div>p`
- 3 × `body-small 12px div>div>div>p`
- 3 × `body-small 12px div>div>section>p`
- 3 × `body-small 12px div>div>p`
- 3 × `tiny 11.4px span[data-controls-panel=touch]>span[data-controls-rows=true]>span>span`
- 2 × `body-small 12px div>div>label>span`
- 2 × `body-small 14px div>p`
- 2 × `body-small 14px div>div>p`
- 2 × `body-small 14px div>main>p`
- 2 × `body-small 14px main>div>div>p`
- 2 × `body-small 12px div>div>div`
- 2 × `body-small 14px main[data-live=1]>div>p`

**Accessibility findings**

- 25 × `critical name: canvas[data-engine=Babylon.js v9.23.0] ""`
- 25 × `serious tabindex: canvas[data-engine=Babylon.js v9.23.0] ""`
- 2 × `serious contrast: p "PARTY"`
- 1 × `serious contrast: button "STAKE & POST DUEL"`
- 1 × `serious contrast: p "Elijah Bonds"`
- 1 × `serious contrast: p "Amir Smith"`
- 1 × `serious contrast: p "Flight Lab"`
- 1 × `serious contrast: p "Coach V"`
- 1 × `serious contrast: p "Neural Max"`
- 1 × `serious contrast: p "Director Stella"`
- 1 × `serious tabindex: canvas[data-engine=Babylon.js v9.23.0] "3D Studio stage: drag to spin,`
- 1 × `serious target-size: button "Rename LOOK 1"`
- 1 × `critical label: input "New category name…"`
- 1 × `serious contrast: button "Add Category"`
- 1 × `critical label: input[data-testid=controller-name] "Your name"`
- 1 × `critical label: input "Filter…"`

**What moves as a screen loads**

- 54 × `div.ml-auto.flex.min-w-0`
- 27 × `span.flex.items-center.gap-1.5`
- 26 × `button.grid.h-8.w-8`
- 17 × `div.relative.min-h-screen.bg-fel-bg`
- 10 × `div.min-h-screen.bg-[#050505].pb-20`
- 7 × `div.min-h-screen.bg-[#050505].pb-24`
- 5 × `div.min-h-screen.bg-fel-bg.pb-20`
- 4 × `h1.text-4xl.font-black.tracking-wide`
- 3 × `#text`
- 3 × `button.rounded-full.border.px-2`
- 2 × `div.min-h-screen.bg-fel-bg`
- 2 × `main.mx-auto.max-w-3xl.px-5`

**What sticks out sideways**

- 3 × `font150: main[data-couch-scale=true]>section[data-learn-playbook=true]>ol>li `
- 3 × `font150: div>section>div>a `
- 2 × `font150: div `
- 1 × `font150: div>main>div>button `
- 1 × `font150: section>ol[data-sonner-toaster=true] `
- 1 × `phone: div>div>div>input `
- 1 × `phone: div>div>div>span `
- 1 × `phone: div>div>div>div `
- 1 × `font150: div>div>div>input `
- 1 × `font150: div>div>div>span `
- 1 × `font150: div>div>div>div `
- 1 × `font150: div>div>div>button `

**Empty states with no next step**

- 3 × `no history yet — this is an invitation, not a recommendation`
- 2 × `Not on sale yet`
- 1 × `a full refund for any session, or any program week, that has`
- 1 × `The Blueprint's 5-second overcoming isometric and the Integr`
- 1 × `Shooting is re-tested only where the game counts body-play s`
- 1 × `Not enough to go on yet — try a few of these and let what yo`
- 1 × `No season is open this week yet. Play a ranked mode and ente`
- 1 × `No season has finalized yet.`

**Unfinished marks**

- 4 × `opens soon: Opens soon`
- 1 × `opens soon: Teaching on FEL opens soon.`
- 1 × `coming soon: Saving combines to your account is coming soon. Th`
- 1 × `placeholder text: [OWNER: monthly players, as of date]`
- 1 × `coming soon: Combine results are coming soon.`
- 1 × `coming soon: Signature programs are coming soon. The daily dril`

**Bright buttons that compete**

- 1 × `Dunk session + Training session`
- 1 × `Take the free movement screen + Copy`
- 1 × `Challenge online + Create challenge`

</details>

### For phases 2–5: what each phase inherits, ranked

Phase 1 fixed only what stops a person (`docs/EVERY-SCREEN-JOBS.md`). Everything else found in training and coaching is listed here for the phase that owns the screen, most common first.

**Phase 2** (7 scored screens, 0 pass all four):

1. The screen jumps as it loads: 6 screens (`/signature`, `/train`, `/train/library`, `/train/programs`, `/train/today-drill`, `/workout`)
2. Tap targets under 44 px in the screen itself: 6 screens (`/signature`, `/train`, `/train/library`, `/train/programs`, `/train/today-drill`, `/workout`)
3. Body copy under 16 px: 5 screens (`/play/drills`, `/signature`, `/train`, `/train/programs`, `/workout`)
4. More than 4 text sizes on one screen: 4 screens (`/play/drills`, `/signature`, `/train`, `/train/today-drill`)
5. More than 40 words before scrolling on a do-this screen: 3 screens (`/play/drills`, `/train/today-drill`, `/workout`)
6. More than 3 button looks on one screen: 3 screens (`/train`, `/train/library`, `/workout`)
7. Serious accessibility findings: 2 screens (`/play/drills`, `/train/today-drill`)
8. Tap targets under 44 px in the app's own bars: 2 screens (`/play/drills`, `/train`)
9. Text under 12 px: 1 screen (`/play/drills`)
10. Text cut off (150 % text): 1 screen (`/train/library`)
11. Unfinished mark: "coming soon": 1 screen (`/train/programs`)
12. The main action answers a tap in more than 200 ms: 1 screen (`/train/today-drill`)

**Phase 3** (1 scored screens, 0 pass all four):

1. The screen jumps as it loads: 1 screen (`/train/build`)
2. Body copy under 16 px: 1 screen (`/train/build`)
3. Tap targets under 44 px in the screen itself: 1 screen (`/train/build`)

**Phase 4** (14 scored screens, 0 pass all four):

1. More than 40 words before scrolling on a do-this screen: 11 screens (`/play/mirror`, `/play/mirror/assess`, `/play/mirror/assess/results`, `/play/mirror/correctives`, `/screen`, `/screen/program/[lane]`, …)
2. The screen jumps as it loads: 8 screens (`/play/mirror`, `/train/combine`, `/train/jumps`, `/train/progress`, `/train/readiness`, `/train/shots`, …)
3. Tap targets under 44 px in the screen itself: 8 screens (`/play/mirror/correctives`, `/train/combine`, `/train/jumps`, `/train/progress`, `/train/readiness`, `/train/shots`, …)
4. Body copy under 16 px: 7 screens (`/play/mirror`, `/play/mirror/correctives`, `/train/jumps`, `/train/readiness`, `/train/shots`, `/train/speed`, …)
5. Text cut off (150 % text): 7 screens (`/play/mirror/assess`, `/play/mirror/assess/results`, `/play/mirror/correctives`, `/screen`, `/screen/privacy`, `/screen/program/[lane]`, …)
6. Text cut off (390 px): 6 screens (`/play/mirror/assess`, `/play/mirror/assess/results`, `/play/mirror/correctives`, `/screen`, `/screen/privacy`, `/screen/program/[lane]`)
7. Text cut off (200 % zoom): 6 screens (`/play/mirror/assess`, `/play/mirror/assess/results`, `/play/mirror/correctives`, `/screen`, `/screen/privacy`, `/screen/program/[lane]`)
8. More than 3 button looks on one screen: 6 screens (`/train/jumps`, `/train/progress`, `/train/readiness`, `/train/shots`, `/train/speed`, `/train/velocity`)
9. More than 4 text sizes on one screen: 5 screens (`/train/jumps`, `/train/progress`, `/train/readiness`, `/train/speed`, `/train/velocity`)
10. The main action answers a tap in more than 200 ms: 2 screens (`/screen`, `/train/readiness`)
11. Unfinished mark: "coming soon": 1 screen (`/train/combine`)
12. Text under 12 px: 1 screen (`/train/speed`)

**Phase 5** (20 scored screens, 0 pass all four):

1. Tap targets under 44 px in the screen itself: 17 screens (`/account/coaching`, `/coach`, `/coach/admin`, `/coach/admin/library`, `/coach/admin/programs`, `/coach/business`, …)
2. The screen jumps as it loads: 16 screens (`/account/coaching`, `/coach`, `/coach/admin`, `/coach/admin/library`, `/coach/admin/programs`, `/coach/business`, …)
3. Body copy under 16 px: 10 screens (`/coach/admin/library`, `/coach/admin/programs`, `/coach/business`, `/coach/business/thanks`, `/coach/combine`, `/coach/highlight/[id]`, …)
4. More than 4 text sizes on one screen: 9 screens (`/coach`, `/coach/admin`, `/coach/admin/programs`, `/coach/business`, `/coach/combine`, `/coach/highlight/[id]`, …)
5. More than 40 words before scrolling on a do-this screen: 7 screens (`/coach/admin/library`, `/coach/admin/programs`, `/coach/business/thanks`, `/coach/combine`, `/coach/highlight/[id]`, `/coach/join/[token]`, …)
6. Unfinished mark: "opens soon": 4 screens (`/coach/groups`, `/groups`, `/groups/[groupId]`, `/groups/one-on-one`)
7. More than 3 button looks on one screen: 3 screens (`/coach/admin/library`, `/coach/admin/programs`, `/coach/business/thanks`)
8. The main action answers a tap in more than 200 ms: 2 screens (`/coach/business`, `/coach/combine`)
9. Critical accessibility findings: 1 screen (`/coach/admin`)
10. Sideways scroll (150 % text): 1 screen (`/coach/admin`)
11. An empty state with no next step: 1 screen (`/coach/admin/programs`)
12. Unfinished mark: "coming soon": 1 screen (`/coach/combine`)

## 3. What is switched off today

Scored in the state production has them in. `assumption:` the rig's database is `prisma db push` of today's schema with nothing from `prisma/pending/` applied (`docs/LAUNCH-CHECKLIST.md` C1: "not done"), and every env switch is at its default (off). Checked against the live site on 2026-11-10: `/groups` says "Opens soon"; `/coaches`, `/studio`, `/live/schedule` and `/session/x` are a 404. The owner's `npx tsx scripts/pending-sql/cli.ts plan` prints what production really lacks.

### 3a. A 404 for everyone: 20 screens, behind a switch

| Screen | Phase | What turns it on |
|---|---|---|
| `/account/bookings` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/c/[code]` | 7 | the app's own 404 page |
| `/coach/[slug]` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL); or COACH_MARKETPLACE_ENABLED (find a coach) |
| `/coach/[slug]/book/[listingId]` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/[slug]/fee/[packageId]` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL); or COACH_MARKETPLACE_ENABLED (find a coach) |
| `/coach/[slug]/programs/[lane]` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/dashboard` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/dashboard/settings` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/form-review` | 5 | a 404 for every person on the rig |
| `/coach/live/[room]` | 5 | NEXT_PUBLIC_COACH_LIVE_ENABLED (live coach sessions) |
| `/coach/offers/[offer]` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/review/[bookingId]` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coach/thanks` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/coaches` | 5 | COACH_MARKETPLACE_ENABLED (find a coach) |
| `/live/schedule` | 7 | LIVE_STREAM_SCHEDULE_ENABLED (the live schedule) |
| `/play/shared` | 7 | a 404 for every person on the rig |
| `/play/shared/[token]` | 7 | STUDIO_SHARE_ENABLED (Studio share links) |
| `/program/[accessId]` | 2 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/program/unlock` | 2 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/session/[bookingId]` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |

### 3b. Dark until its tables are applied

Not measured yet: run `scripts/every-screen/dark.mts`.

### 3c. Screens that say "opens soon" or "coming soon" today: 8

- `/admin/review`: "Teaching on FEL opens soon."
- `/coach/combine`: "Saving combines to your account is coming soon. This combine is kept on this pho"
- `/coach/groups`: "Opens soon"
- `/groups`: "Opens soon"
- `/groups/[groupId]`: "Opens soon"
- `/groups/one-on-one`: "Opens soon"
- `/train/combine`: "Combine results are coming soon."
- `/train/programs`: "Signature programs are coming soon. The daily drill and the exercise library are"

## 4. What the rig cannot render, and what it did instead

- **3D play (Babylon / WebGL).** The rig has no real GPU; the scenes draw in software. A 3D screen is scored on what is around the game (words, buttons, links, first content, layout shift) and its tap time is left "not measured", so it cannot count as passing yet. What happens during play is not in this pass (the game lanes own it).
- **The camera.** The browser is given a fake camera, so a camera screen is scored up to the moment it needs a person in front of it. Jump, sprint, bar-speed and screen readings come from the recorded fixtures and benches (`scripts/tools-easy-bench.ts`), not from this rig.
- **Screens that need a row someone else made** (an emailed token, a purchase): listed in section 5 with the reason.
- **Network.** The rig serves from the same machine, so there is no mobile-network delay in the first-content number: a real phone on mobile data is slower than these numbers. The JavaScript each screen downloads is recorded (`jsKb` in the JSON) for the speed work in phase 10.
- **A shared machine.** Other lanes run at the same time. A screen that misses the first-content budget by less than double is read twice and the better number stands.
- **Contrast** is the accessibility scan's computed contrast, not the readable lane's pixel measurement (`docs/READABLE.md`), which stays that lane's number.
- **Only the main action is tapped.** The other buttons on a screen are not pressed by the scorer; in training and coaching the job walks press them (`docs/EVERY-SCREEN-JOBS.md`).

## 5. Not scored: 44

| Screen | Phase | Why |
|---|---|---|
| `/card/[slug]` | 8 | needs a published creator card row; a new account has none |
| `/consent/guardian/[token]` | 6 | needs a guardian-consent row with its emailed token |
| `/guardian/report/[token]` | 9 | needs a guardian report row with its emailed token |
| `/p/[token]` | 8 | needs a coach share-link row (a coach sharing a client's progress); none exists on a new account |
| `/train/programs/[id]` | 2 | the programs page links to no program |
| `/play/tiebreak` | 7 | the crawl has not reached it yet |
| `/play/velocity-kart` | 7 | the crawl has not reached it yet |
| `/play/volleyball` | 7 | the crawl has not reached it yet |
| `/play/who-scene-it` | 7 | the crawl has not reached it yet |
| `/press` | 9 | the crawl has not reached it yet |
| `/press/[slug]` | 9 | the crawl has not reached it yet |
| `/press/library` | 9 | the crawl has not reached it yet |
| `/press/receipt` | 9 | the crawl has not reached it yet |
| `/privacy` | 9 | the crawl has not reached it yet |
| `/pro` | 8 | the crawl has not reached it yet |
| `/profile` | 8 | the crawl has not reached it yet |
| `/profile/challenges` | 8 | the crawl has not reached it yet |
| `/profile/edit` | 8 | the crawl has not reached it yet |
| `/profile/week` | 8 | the crawl has not reached it yet |
| `/purchase-terms` | 9 | the crawl has not reached it yet |
| `/settings` | 8 | the crawl has not reached it yet |
| `/shop` | 8 | the crawl has not reached it yet |
| `/shop/shards` | 8 | the crawl has not reached it yet |
| `/signup` | 6 | the crawl has not reached it yet |
| `/squads` | 8 | the crawl has not reached it yet |
| `/squads/[id]` | 8 | the crawl has not reached it yet |
| `/squads/join/[token]` | 8 | the crawl has not reached it yet |
| `/store` | 8 | the crawl has not reached it yet |
| `/store-terms` | 9 | the crawl has not reached it yet |
| `/story` | 9 | the crawl has not reached it yet |
| `/story/boss` | 9 | the crawl has not reached it yet |
| `/story/rail` | 9 | the crawl has not reached it yet |
| `/studio` | 9 | the crawl has not reached it yet |
| `/support` | 8 | the crawl has not reached it yet |
| `/teach` | 9 | the crawl has not reached it yet |
| `/team` | 9 | the crawl has not reached it yet |
| `/team/[slug]` | 9 | the crawl has not reached it yet |
| `/terms` | 9 | the crawl has not reached it yet |
| `/try` | 6 | the crawl has not reached it yet |
| `/u/[slug]` | 8 | the crawl has not reached it yet |
| `/venues` | 7 | the crawl has not reached it yet |
| `/wallet` | 8 | the crawl has not reached it yet |
| `/welcome` | 6 | the crawl has not reached it yet |
| `/work-with-us` | 9 | the crawl has not reached it yet |

**Not a screen of its own (5):** `/age` → /; `/c/[code]/play` → /c/NONE00; `/education` → /learn; `/play/training` → /train; `/training` → /coach.

## 6. Every screen

✓ pass · ✗ fail · ? not measured. "Who" is measured: the rig opens each screen signed out, as an adult athlete, a coached client, a coach, an admin and a 15-year-old, and records who gets the page.

### Phase 2 — from opening the app to finishing a workout (12 screens; 0 of 7 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/play/drills` | signed-in | do | ✗ | ✗ | ✓ | ✗ | 15 pieces of text under 12 px. |
| `/play/training` | nobody (redirects away) | do | – | – | – | – | *not its own screen: redirects to /train for everyone who is signed in* |
| `/program/[accessId]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/program/unlock` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/signature` | signed-in | hub | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/train` | signed-in | hub | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/train/library` | signed-in | hub | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.190; the budget is 0.02). |
| `/train/programs` | signed-in | hub | ✗ | ✗ | ✗ | ✓ | Unfinished mark on screen: "Signature programs are coming soon. The daily drill and the exercise library are". |
| `/train/programs/[id]` | unknown (no fixture) | do | – | – | – | – | *not scored: the programs page links to no program* |
| `/train/today-drill` | signed-in | do | ✗ | ✗ | ✗ | ✗ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/training` | nobody (redirects away) | do | – | – | – | – | *not its own screen: redirects to /coach for everyone who is signed in* |
| `/workout` | signed-in | do | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.818; the budget is 0.02). |

### Phase 3 — the AI program builder (1 screens; 0 of 1 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/train/build` | signed-in | do | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |

### Phase 4 — numbers you can trust (14 screens; 0 of 14 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/play/mirror` | signed-in | do | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.125; the budget is 0.02). |
| `/play/mirror/assess` | anyone | do | ✗ | ✗ | ✓ | ✓ | Text cut off at 390 px: "Quick Screen". |
| `/play/mirror/assess/results` | anyone | do | ✗ | ✗ | ✓ | ✓ | Text cut off at 390 px: "Quick Screen". |
| `/play/mirror/correctives` | signed-in | do | ✗ | ✗ | ✓ | ✓ | Text cut off at 390 px: "Correctives". |
| `/screen` | anyone | do | ✗ | ✗ | ✗ | ✓ | Text cut off at 390 px: "Quick Screen". |
| `/screen/privacy` | anyone | read | ✓ | ✗ | ✓ | ✓ | Text cut off at 390 px: "Privacy". |
| `/screen/program/[lane]` | anyone | do | ✗ | ✗ | ✓ | ✓ | Text cut off at 390 px: "Your Dunk Program". |
| `/train/combine` | signed-in | do | ✗ | ✗ | ✗ | ✓ | Unfinished mark on screen: "Combine results are coming soon.". |
| `/train/jumps` | signed-in | do | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/train/progress` | signed-in | hub | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/train/readiness` | signed-in | do | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/train/shots` | signed-in | do | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). review: a number with no method line |
| `/train/speed` | signed-in | do | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/train/velocity` | signed-in | do | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |

### Phase 5 — booking, groups and the coach's day (34 screens; 0 of 20 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/account/bookings` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/account/coaching` | signed-in | do | ✗ | ✓ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.027; the budget is 0.02). |
| `/coach` | signed-in; scored as coach | hub | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/coach/[slug]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL); or COACH_MARKETPLACE_ENABLED (find a coach))* |
| `/coach/[slug]/book/[listingId]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/coach/[slug]/fee/[packageId]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL); or COACH_MARKETPLACE_ENABLED (find a coach))* |
| `/coach/[slug]/programs/[lane]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/coach/admin` | admin | hub | ✗ | ✗ | ✗ | ✗ | 1 critical accessibility finding (label, contrast). |
| `/coach/admin/library` | admin | do | ✗ | ✗ | ✗ | ✓ | 40 tap targets under 44 px (smallest: "Open the store"). |
| `/coach/admin/programs` | admin | do | ✗ | ✗ | ✗ | ✓ | An empty state with no next step: "The Blueprint's 5-second overcoming isometric and the Integrated Set's lockdown ". |
| `/coach/business` | signed-in; scored as coach | hub | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.056; the budget is 0.02). |
| `/coach/business/thanks` | anyone; scored as coach | do | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/coach/combine` | signed-in; scored as coach | do | ✗ | ✗ | ✗ | ✓ | Unfinished mark on screen: "Saving combines to your account is coming soon. This combine is kept on this pho". |
| `/coach/dashboard` | nobody (a 404 for everyone) | hub | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/coach/dashboard/settings` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/coach/form-review` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (a 404 for every person on the rig)* |
| `/coach/groups` | signed-in; scored as coach | do | ✗ | ✗ | ✗ | ✓ | Unfinished mark on screen: "Opens soon". |
| `/coach/highlight/[id]` | signed-in | do | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). (no highlight row exists on a new account: the screen for a link that names none) |
| `/coach/join` | anyone | do | ✗ | ✗ | ✓ | ✓ | 1 paragraph of body copy under 16 px. |
| `/coach/join/[token]` | anyone; scored as solo | do | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.056; the budget is 0.02). (a real invite made by the rig's coach, opened by an athlete who has not joined) |
| `/coach/live/[room]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (NEXT_PUBLIC_COACH_LIVE_ENABLED (live coach sessions))* |
| `/coach/offers/[offer]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/coach/review/[bookingId]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/coach/session` | signed-in; scored as coach | do | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/coach/shots` | signed-in; scored as coach | do | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/coach/thanks` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/coach/velocity` | signed-in; scored as coach | do | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/coaches` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_MARKETPLACE_ENABLED (find a coach))* |
| `/groups` | anyone | hub | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Opens soon". |
| `/groups/[groupId]` | anyone | do | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Opens soon". (the group-booking table is not applied: any group link shows the dark screen) |
| `/groups/one-on-one` | anyone | do | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Opens soon". |
| `/groups/trainer/[code]` | signed-in; scored as coach | do | ✗ | ✓ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.052; the budget is 0.02). (the group-booking table is not applied: any trainer invite shows the dark screen) |
| `/session/[bookingId]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/sessions` | signed-in | hub | ✗ | ✓ | ✗ | ✗ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |

### Phase 6 — the first five minutes (6 screens; 2 of 4 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/` | anyone | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/age` | nobody (redirects away) | do | – | – | – | – | *not its own screen: redirects to / for everyone who is signed in* |
| `/consent/guardian` | signed-in | do | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/consent/guardian/[token]` | unknown (no fixture) | do | – | – | – | – | *not scored: needs a guardian-consent row with its emailed token* |
| `/join` | anyone | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/login` | anyone | do | ✗ | ✗ | ✗ | ✓ | 166 words before scrolling (the budget is 40). |

### Phase 7 — around the games (50 screens; 2 of 45 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/arena` | signed-in | hub | ✗ | ✗ | ✗ | ✗ | The screen jumps as it loads (layout shift 0.069; the budget is 0.02). |
| `/c/[code]` | anyone | do | – | – | – | – | *switched off: a 404 (the app's own 404 page)* |
| `/c/[code]/play` | nobody (redirects away) | do | – | – | – | – | *not its own screen: redirects to /c/NONE00 for everyone who is signed in* |
| `/controller/[code]` | anyone | do | ✓ | ✓ | ✓ | ✗ | 1 critical accessibility finding (label). (a made-up room code: the screen a phone shows before the TV answers) |
| `/host` | anyone | do | ✗ | ✗ | ✓ | ✗ | 30 tap targets under 44 px (smallest: "Downtown"). |
| `/ladder` | signed-in | hub | ✗ | ✗ | ✗ | ✓ | An empty state with no next step: "No season is open this week yet. Play a ranked mode and enter from the Arena to ". |
| `/live` | signed-in | hub | ✗ | ✗ | ✗ | ✗ | An empty state with no next step: "Not on sale yet". |
| `/live/schedule` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (LIVE_STREAM_SCHEDULE_ENABLED (the live schedule))* |
| `/modes` | anyone | hub | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.172; the budget is 0.02). |
| `/multiplayer` | signed-in | hub | ✗ | ✗ | ✗ | ✗ | 1 critical accessibility finding (label, contrast). |
| `/party` | anyone | hub | ✗ | ✗ | ✓ | ✗ | 1 serious accessibility finding (contrast). |
| `/party/[code]` | anyone | do | ✗ | ✗ | ✓ | ✗ | 108 words before scrolling (the budget is 40). (a made-up party code) |
| `/play` | signed-in | hub | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/play/acting` | signed-in | do | ✗ | ✗ | ✓ | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/adventure` | anyone | do | ✗ | ✗ | ? | ✓ | 1 piece of text under 12 px. |
| `/play/adventure-br` | anyone | do | ✗ | ✗ | ? | ✗ | Dead end: nothing on the screen leads on or back. |
| `/play/aero-aces` | signed-in | do | ✗ | ✗ | ✓ | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/baseball` | signed-in | do | ✗ | ✗ | ✗ | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/big-air` | signed-in | do | ✗ | ✗ | ? | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/brain-brawl` | signed-in | do | ✗ | ✗ | ✓ | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/calibrate` | signed-in | do | ✗ | ✗ | ✓ | ✓ | 98 words before scrolling (the budget is 40). |
| `/play/carnival` | signed-in | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/play/carnival/recap` | signed-in | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/play/dance` | signed-in | do | ✗ | ✗ | ? | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/derby` | signed-in | do | ✗ | ✗ | ? | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/duel` | signed-in | do | ✗ | ✗ | ? | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/dunk` | signed-in | do | ✗ | ✗ | ? | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/dunkduel` | signed-in | do | ✗ | ✓ | ✓ | ✓ | 88 words before scrolling (the budget is 40). |
| `/play/football` | signed-in | do | ✗ | ✗ | ✓ | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/freerun` | signed-in | do | ✗ | ✗ | ? | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/golf` | signed-in | do | ✗ | ✗ | ? | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/irl` | signed-in | do | ✗ | ✗ | ✓ | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/karate` | signed-in | do | ✗ | ✗ | ? | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/karate-vs` | signed-in | do | ✗ | ✗ | ? | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/map-preview` | signed-in | do | ✗ | ✗ | ? | ✓ | 76 words before scrolling (the budget is 40). |
| `/play/mixedcombat` | signed-in | do | ✗ | ✗ | ? | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/music` | signed-in | do | ✗ | ✗ | ✗ | ✓ | A spinner with no words: it never says what it is waiting for. |
| `/play/onevone` | signed-in | do | ✗ | ✗ | ? | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/party` | signed-in | do | ✗ | ✗ | ✓ | ✗ | 4 critical accessibility findings (contrast). |
| `/play/shared` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (a 404 for every person on the rig)* |
| `/play/shared/[token]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (STUDIO_SHARE_ENABLED (Studio share links))* |
| `/play/showdown` | signed-in | do | ✗ | ✗ | ? | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/skateboard` | signed-in | do | ✗ | ✗ | ? | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/snowboard` | signed-in | do | ✗ | ✗ | ✓ | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/soccer` | signed-in | do | ✗ | ✗ | ? | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/sprint` | signed-in | do | ✗ | ✗ | ✓ | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/surf` | signed-in | do | ✗ | ✗ | ? | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/tennis` | signed-in | do | ✗ | ✗ | ? | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/threepoint` | signed-in | do | ✗ | ✗ | ? | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |
| `/play/threevthree` | signed-in | do | ✗ | ✗ | ✓ | ✗ | The screen throws an error: Error: Minified React error #425; visit https://react.dev/errors/425 for the full message  |

### Phase 8 — your things (9 screens; 0 of 7 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/account` | signed-in | hub | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.232; the budget is 0.02). |
| `/admin/funnel` | admin | hub | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/admin/metrics` | admin | hub | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.764; the budget is 0.02). |
| `/admin/review` | admin | hub | ✗ | ✗ | ✗ | ✓ | Unfinished mark on screen: "Teaching on FEL opens soon.". |
| `/card/[slug]` | unknown (no fixture) | do | – | – | – | – | *not scored: needs a published creator card row; a new account has none* |
| `/cards` | signed-in | hub | ✗ | ✗ | ✗ | ✗ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/closet` | signed-in | hub | ✗ | ✗ | ✗ | ✗ | 40 tap targets under 44 px (smallest: "Rename LOOK 1"). |
| `/market` | signed-in | hub | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/p/[token]` | unknown (no fixture) | do | – | – | – | – | *not scored: needs a coach share-link row (a coach sharing a client's progress); none exists on a new account* |

### Phase 9 — learn, create and the public pages (19 screens; 0 of 17 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/camp` | signed-in | read | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/coach-terms` | anyone | read | ✗ | ✗ | ✓ | ✓ | An empty state with no next step: "a full refund for any session, or any program week, that has not been delivered ". |
| `/create` | signed-in | hub | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/create/[discipline]` | signed-in | do | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/creator` | signed-in | hub | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/creator/athlete` | signed-in | do | ✗ | ✗ | ✗ | ✗ | The screen scrolls sideways at 390 px (157 px). |
| `/credits` | anyone | read | ✗ | ✗ | ✓ | ✓ | 34 tap targets under 44 px (smallest: "CC0 1.0"). |
| `/education` | nobody (redirects away) | read | – | – | – | – | *not its own screen: redirects to /learn for everyone who is signed in* |
| `/education/course/[id]` | signed-in | read | ✗ | ✓ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/education/playbook` | signed-in | read | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/education/playbook/[chapter]` | signed-in | read | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/guardian/report/[token]` | unknown (no fixture) | read | – | – | – | – | *not scored: needs a guardian report row with its emailed token* |
| `/guidance` | signed-in | read | ✗ | ✗ | ✗ | ✓ | An empty state with no next step: "Not enough to go on yet — try a few of these and let what you keep coming back t". |
| `/kitchens` | signed-in | read | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.124; the budget is 0.02). |
| `/kitchens/fuel` | signed-in | read | ✗ | ✗ | ✗ | ✗ | 38 tap targets under 44 px (smallest: "Jump height"). |
| `/learn` | anyone | read | ✓ | ✗ | ✓ | ✓ | The screen scrolls sideways with 150 % text (35 px). |
| `/learn/feed` | anyone | read | ✓ | ✗ | ✗ | ✓ | Text cut off with 150 % text: "How minds remember, decide and form habits" and 3 more. |
| `/links` | anyone | read | ✗ | ✗ | ✓ | ✓ | 2 bright buttons compete on the first screen (Take the free movement screen, Copy). |
| `/media-kit` | anyone | read | ✗ | ✗ | ✓ | ✓ | Unfinished mark on screen: "[OWNER: monthly players, as of date]". |

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
