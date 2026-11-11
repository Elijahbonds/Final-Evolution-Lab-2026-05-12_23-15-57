# The every-screen scorecard

**Owner, 2026-11-10:** "To improve the total quality of the product from improving every screen."

This is phase 1 of `docs/PLAN-EVERY-SCREEN-10PHASE.md`: every screen a person can reach, scored on the plan's four checks. It is the starting line for all ten phases. Written by `scripts/every-screen/score.mts --report` from the rig's last run (2026-11-11); do not edit it by hand.

## The number

**20 of 185 screens pass all four checks.**

| | Screens |
|---|---|
| Pages a person can reach (`app/**/page.tsx`, less the developer pages) | 185 |
| Scored on the rig | 153 |
| Not a screen of its own: it only sends you on to another | 7 |
| Switched off: a 404 for everyone today | 20 |
| Not scored, with the reason (section 5) | 5 |
| **Pass all four** | **20** |
| Training and coaching (phases 2–5): pass all four | 13 of 61 (44 scored) |

| Check | Pass | Fail | Not measured |
|---|---|---|---|
| 1. Clear and quick | 70 | **83** | 0 |
| 2. Looks finished | 45 | **108** | 0 |
| 3. Fast and smooth | 121 | **9** | 23 |
| 4. Right and trustworthy | 137 | **16** | 0 |

Of the 153 scored screens. "Not measured" is a 3D screen's tap time: the rig has no real GPU, so that one number is left open and the screen is not counted as passing.

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

**Controls: passed** on 2026-11-11 07:11 UTC (scorer version 4).

**The scorer was checked before it was believed** (`score.mts --plant`, and again at the start of every crawl): a clean control page must pass all four, and each planted fault (three bright buttons, 120 words, a 30 px target, a dead end, "Coming soon", an owner placeholder, an empty state, a wordless spinner, sideways scroll, 10 px text, six text sizes, five button looks, slow first content, a jumping banner, a blocking tap handler, a link to a missing page, a link to nowhere, a button that does nothing, an unnamed button, a bare measured number) must be flagged on its own page and fail only its own check.

## 2. The ten most common faults, and where each comes from

The plan's rule: fix the shared thing first. "Alone" is how many screens would pass all four if this one fault were fixed everywhere and nothing else changed.

| # | Fault | Screens | Alone | Check |
|---|---|---|---|---|
| 1 | Body copy under 16 px | 58 | 1 | 2 |
| 2 | More than 40 words before scrolling on a do-this screen | 46 | 17 | 1 |
| 3 | Tap targets under 44 px in the screen itself | 45 | 0 | 1 |
| 4 | More than 4 text sizes on one screen | 39 | 0 | 2 |
| 5 | A spinner with no words | 26 | 1 | 2 |
| 6 | Text under 12 px | 22 | 0 | 2 |
| 7 | More than 3 button looks on one screen | 19 | 0 | 2 |
| 8 | Tap targets under 44 px in the app's own bars | 19 | 4 | 1 |
| 9 | An empty state with no next step | 12 | 0 | 2 |
| 10 | Unfinished mark: "opens soon" | 9 | 5 | 2 |

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

Measured for that call: 57 scored screens use exactly 5 text sizes; with 5 allowed, 0 more screens would pass all four today (the other faults on them stay).

<details><summary>The elements behind them (the rig's own list)</summary>

**Small tap targets in the app's own bars (screens)**

- 15 × `"FINAL EVOLUTION LAB" 206×32 a.fel-heading.text-2xl.font-bold.text-white`
- 7 × `"Terms" 39×44 a.hover:text-white/70`
- 7 × `"Log in" 37×44 a.hover:text-white/70`
- 4 × `"TEAM" 60×30 a.rounded-md.border.border-white/15.px-3`
- 4 × `"MEDIA KIT" 93×30 a.rounded-md.border.border-white/15.px-3`
- 4 × `"WORK WITH US" 120×30 a.rounded-md.bg-[#F5C518].px-3.py-1.5`
- 1 × `"← Create" 84×32 a.rounded-lg.bg-neutral-800.px-3.py-1.5`
- 1 × `"1. Make or import" 114×42 button.w-full.rounded-lg.px-2.py-1.5 in [data-qa]`
- 1 × `"VITALS" 192×30 button.mb-0.5.block.w-full.rounded-lg`
- 1 × `"APPEARANCE" 192×30 button.mb-0.5.block.w-full.rounded-lg`
- 1 × `"BODY" 192×30 button.mb-0.5.block.w-full.rounded-lg`
- 1 × `"INK" 192×30 button.mb-0.5.block.w-full.rounded-lg`

**Small tap targets in screens (screens)**

- 8 × `"FINAL EVOLUTION LAB" 180×15 a.hover:text-white/70`
- 8 × `"Terms" 33×18 a.hover:text-white/70`
- 8 × `"Privacy" 39×18 a.hover:text-white/70`
- 4 × `"Support" 43×18 a.hover:text-white/70`
- 4 × `"MY LIBRARY" 103×30 a.rounded-md.border.border-white/15.px-3`
- 4 × `"Support" 44×18 a.hover:text-white/70`
- 3 × `"on" 13×13 input.mt-0.5`
- 2 × `"Open local party room" 177×36 a.inline-flex.rounded-xl.bg-[#00E5FF].px-4 in [data-testid]`
- 2 × `"Got a code? Join a game" 157×20 a.font-semibold.text-[#00E5FF].underline.underline-offset-2 in [data-testid]`
- 2 × `"Creator Hub" 100×20 a.inline-flex.items-center.gap-2.text-sm`
- 2 × `"Motion and flashes: Match de" 158×28 button.rounded-full.border.px-3.py-1 in [data-splash-corner]`
- 2 × `"Next card" 79×26 button.rounded-full.bg-white/10.px-3.py-1 in [data-learn-idle]`
- 2 × `"CONTROLLER" 101×24 button.rounded-full.border.px-2.py-0.5 in [data-controls-panel data-controls-fit]`
- 2 × `"KEYBOARD" 86×24 button.rounded-full.border.px-2.py-0.5 in [data-controls-panel data-controls-fit]`
- 2 × `"TOUCH" 61×24 button.rounded-full.border.px-2.py-0.5 in [data-controls-panel data-controls-fit]`
- 2 × `"← Back to profile" 122×36 a.rounded-xl.border.border-white/10.px-3 in [data-couch-scale]`
- 2 × `"Controls help" 111×28 button.pointer-events-auto.flex.items-center.gap-1.5`
- 2 × `"Hide controller" 28×28 button.pointer-events-auto.flex.h-7.w-7`
- 2 × `"GUARD" 107×40 button.pointer-events-auto.relative.flex.select-none`
- 1 × `"on" 13×13 input in [data-testid]`

**Text sizes per screen:** 1 sizes: 2 screens; 2 sizes: 3 screens; 3 sizes: 47 screens; 4 sizes: 23 screens; 5 sizes: 57 screens; 6 sizes: 10 screens; 7 sizes: 7 screens; 8 sizes: 2 screens; 9 sizes: 1 screens; 10 sizes: 1 screens

**The sizes themselves (screens that use each)**

- 144 × `12px`
- 112 × `20px`
- 105 × `16px`
- 103 × `14px`
- 57 × `30px`
- 32 × `18px`
- 31 × `24px`
- 16 × `36px`
- 15 × `13px`
- 7 × `44px`
- 7 × `22px`
- 6 × `12.5px`
- 5 × `15px`
- 4 × `11.9px`
- 4 × `21px`
- 3 × `13.5px`
- 3 × `26px`
- 2 × `19px`
- 2 × `17px`
- 2 × `28px`
- 2 × `40px`
- 2 × `48px`
- 2 × `10.8108px`
- 2 × `14.4144px`
- 1 × `15.5px`
- 1 × `60px`

**Button looks per screen:** 0: 31; 1: 66; 2: 23; 3: 14; 4: 8; 5: 3; 6: 4; 7: 2; 8: 1; 12: 1

**Text under the READABLE floor**

- 8 × `body-small 14px div>div>div>p`
- 7 × `body-small 12px div>div>div>p`
- 7 × `tiny 10.2px span[data-controls-panel=touch]>span[data-controls-rows=true]>span>span`
- 5 × `body-small 12px div>main>p`
- 5 × `body-small 14px main>header>div>p`
- 4 × `body-small 12px div>p`
- 3 × `body-small 12px div>div>section>p`
- 3 × `body-small 14px div>main>p`
- 3 × `tiny 11.4px span[data-controls-panel=touch]>span[data-controls-rows=true]>span>span`
- 3 × `hud-small 12px div>div>span[data-hud-plate=true]>span`
- 2 × `body-small 12px div>div>label>span`
- 2 × `body-small 14px main>div>div>p`
- 2 × `body-small 14px div>main[data-couch-scale=true]>p`
- 2 × `body-small 12px div>div>div`
- 2 × `body-small 12px div>div>p`
- 2 × `tiny 11.9px div>main>p[data-public-copy=true]>mark[data-owner-blank]`

**Accessibility findings**

- 1 × `serious contrast: button "STAKE & POST DUEL"`
- 1 × `serious target-size: button "Rename LOOK 1"`
- 1 × `critical label: input[data-testid=controller-name] "Your name"`
- 1 × `critical label: input "Filter…"`
- 1 × `serious contrast: p "Goes fullscreen and keeps the screen awake."`
- 1 × `serious target-size: input "Trunk lean"`
- 1 × `serious contrast: span[data-testid=derived-leak] "LEAK · MID-BACK"`
- 1 × `serious contrast: span[data-testid=rx-leak] "LEAK · MID-BACK"`
- 1 × `critical label: select "Flight NightAero AcesVelocity KartDowntownStompG"`
- 1 × `critical contrast: div "NONE"`
- 1 × `serious contrast: button "Neuro Arena — THE QUIZ IN THE DARK"`
- 1 × `serious contrast: button "Global Pitch — THE STADIUM AT DUSK · GLASS DOWN "`
- 1 × `serious contrast: button "Stadium Straight — THE TARTAN UNDER A CLEAR SKY"`
- 1 × `serious contrast: button "Center Court — HARDCOURT UNDER A DUSK SKY"`
- 1 × `critical contrast: div "NO ITEM"`
- 1 × `critical label: input ""`

**What moves as a screen loads**

- 72 × `a.inline-flex.min-h-11.items-center`
- 72 × `a.fel-press.inline-flex.min-h-11`
- 4 × `#text`
- 2 × `h1.text-4xl.font-black.tracking-wide`
- 2 × `div.fel-boot-bar.h-full.rounded-full`
- 1 × `div.mt-8.overflow-x-auto`
- 1 × `button.inline-flex.items-center.gap-2`
- 1 × `div.mt-6.space-y-8`
- 1 × `div.flex.gap-1`
- 1 × `section.mt-6`
- 1 × `p.font-sans.text-[14px].font-medium`
- 1 × `div.pointer-events-auto.flex.items-center`

**What sticks out sideways**

- 1 × `phone: div>div>div>input `
- 1 × `phone: div>div>div>span `
- 1 × `phone: div>div>div>div `
- 1 × `font150: div>div>div>input `
- 1 × `font150: div>div>div>span `
- 1 × `font150: div>div>div>div `

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
- 1 × `Nothing measured yet`
- 1 × `No tiers yet. Play any mode a few times to climb from Bronze`
- 1 × `No duels yet. Send a challenge and your record starts here.`

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

- 1 × `Take the free movement screen + Copy`
- 1 × `Challenge online + Create challenge`

</details>

### For phases 2–5: what each phase inherits, ranked

Phase 1 fixed only what stops a person (`docs/EVERY-SCREEN-JOBS.md`). Everything else found in training and coaching is listed here for the phase that owns the screen, most common first.

**Phase 2** (8 scored screens, 3 pass all four):

1. More than 40 words before scrolling on a do-this screen: 4 screens (`/play/drills`, `/train/programs/[id]`, `/train/today-drill`, `/workout`)
2. Body copy under 16 px: 2 screens (`/train/programs/[id]`, `/workout`)
3. Unfinished mark: "coming soon": 1 screen (`/train/programs`)
4. More than 4 text sizes on one screen: 1 screen (`/train/programs/[id]`)
5. The main action answers a tap in more than 200 ms: 1 screen (`/train/today-drill`)
6. Tap targets under 44 px in the screen itself: 1 screen (`/workout`)

**Phase 3** (1 scored screens, 0 pass all four):

1. More than 40 words before scrolling on a do-this screen: 1 screen (`/train/build`)

**Phase 4** (14 scored screens, 2 pass all four):

1. More than 40 words before scrolling on a do-this screen: 11 screens (`/play/mirror`, `/play/mirror/assess`, `/play/mirror/assess/results`, `/play/mirror/correctives`, `/screen`, `/screen/program/[lane]`, …)
2. Tap targets under 44 px in the screen itself: 2 screens (`/train/shots`, `/train/velocity`)
3. More than 3 button looks on one screen: 2 screens (`/train/speed`, `/train/velocity`)
4. Unfinished mark: "coming soon": 1 screen (`/train/combine`)
5. More than 4 text sizes on one screen: 1 screen (`/train/velocity`)

**Phase 5** (21 scored screens, 8 pass all four):

1. More than 40 words before scrolling on a do-this screen: 8 screens (`/coach/admin/library`, `/coach/admin/programs`, `/coach/business/thanks`, `/coach/combine`, `/coach/form-review`, `/coach/highlight/[id]`, …)
2. Unfinished mark: "opens soon": 4 screens (`/coach/groups`, `/groups`, `/groups/[groupId]`, `/groups/one-on-one`)
3. Body copy under 16 px: 3 screens (`/coach/admin/library`, `/coach/admin/programs`, `/coach/business`)
4. More than 4 text sizes on one screen: 3 screens (`/coach/admin/programs`, `/coach/business`, `/coach/combine`)
5. An empty state with no next step: 1 screen (`/coach/business`)
6. Tap targets under 44 px in the screen itself: 1 screen (`/coach/business`)
7. Unfinished mark: "coming soon": 1 screen (`/coach/combine`)

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
| `/play/shared` | 7 | a 404 by design: only its share links are pages (lib/nav/reachability.test.ts) |
| `/play/shared/[token]` | 7 | STUDIO_SHARE_ENABLED (Studio share links) |
| `/program/[accessId]` | 2 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/program/unlock` | 2 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/session/[bookingId]` | 5 | COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL) |
| `/studio` | 9 | NEXUS_STUDIO_ENABLED (Nexus Studio) |

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

## 5. Not scored: 5

| Screen | Phase | Why |
|---|---|---|
| `/card/[slug]` | 8 | needs a published creator card row; a new account has none |
| `/consent/guardian/[token]` | 6 | needs a guardian-consent row with its emailed token |
| `/guardian/report/[token]` | 9 | needs a guardian report row with its emailed token |
| `/p/[token]` | 8 | needs a coach share-link row (a coach sharing a client's progress); none exists on a new account |
| `/u/[slug]` | 8 | needs a published creator card row; a new account has none |

**Not a screen of its own (7):** `/age` → /; `/c/[code]/play` → /c/NONE00; `/education` → /learn; `/play/tiebreak` → /play/tennis; `/play/training` → /train; `/settings` → /account; `/training` → /coach.

## 6. Every screen

✓ pass · ✗ fail · ? not measured. "Who" is measured: the rig opens each screen signed out, as an adult athlete, a coached client, a coach, an admin and a 15-year-old, and records who gets the page.

### Phase 2 — from opening the app to finishing a workout (12 screens; 3 of 8 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/play/drills` | signed-in | do | ✗ | ✓ | ✓ | ✓ | 123 words before scrolling (the budget is 40). |
| `/play/training` | nobody (redirects away) | do | – | – | – | – | *not its own screen: redirects to /train for everyone who is signed in* |
| `/program/[accessId]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/program/unlock` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/signature` | signed-in | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/train` | signed-in | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/train/library` | signed-in | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/train/programs` | signed-in | hub | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Signature programs are coming soon. The daily drill and the exercise library are". |
| `/train/programs/[id]` | admin | do | ✗ | ✗ | ✓ | ✓ | 238 words before scrolling (the budget is 40). review: a number with no method line (the list links no program while it is switched off: opened by its address) |
| `/train/today-drill` | signed-in | do | ✗ | ✓ | ✗ | ✓ | "Start" answers a tap in 288 ms (the budget is 200 ms). |
| `/training` | nobody (redirects away) | do | – | – | – | – | *not its own screen: redirects to /coach for everyone who is signed in* |
| `/workout` | signed-in | do | ✗ | ✗ | ✓ | ✓ | 183 words before scrolling (the budget is 40). |

### Phase 3 — the AI program builder (1 screens; 0 of 1 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/train/build` | signed-in | do | ✗ | ✓ | ✓ | ✓ | 168 words before scrolling (the budget is 40). review: a number with no method line (scored with the sample ask built: the program view) |

### Phase 4 — numbers you can trust (14 screens; 2 of 14 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/play/mirror` | signed-in | do | ✗ | ✓ | ✓ | ✓ | 118 words before scrolling (the budget is 40). |
| `/play/mirror/assess` | anyone | do | ✗ | ✓ | ✓ | ✓ | 73 words before scrolling (the budget is 40). |
| `/play/mirror/assess/results` | anyone | do | ✗ | ✓ | ✓ | ✓ | 47 words before scrolling (the budget is 40). |
| `/play/mirror/correctives` | signed-in | do | ✗ | ✓ | ✓ | ✓ | 63 words before scrolling (the budget is 40). |
| `/screen` | anyone | do | ✗ | ✓ | ✓ | ✓ | 73 words before scrolling (the budget is 40). |
| `/screen/privacy` | anyone | read | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/screen/program/[lane]` | anyone | do | ✗ | ✓ | ✓ | ✓ | 48 words before scrolling (the budget is 40). |
| `/train/combine` | signed-in | do | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Combine results are coming soon.". |
| `/train/jumps` | signed-in | do | ✗ | ✓ | ✓ | ✓ | 77 words before scrolling (the budget is 40). |
| `/train/progress` | signed-in | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/train/readiness` | signed-in | do | ✗ | ✓ | ✓ | ✓ | 72 words before scrolling (the budget is 40). |
| `/train/shots` | signed-in | do | ✗ | ✓ | ✓ | ✓ | 92 words before scrolling (the budget is 40). review: a number with no method line |
| `/train/speed` | signed-in | do | ✗ | ✗ | ✓ | ✓ | 66 words before scrolling (the budget is 40). |
| `/train/velocity` | signed-in | do | ✗ | ✗ | ✓ | ✓ | 88 words before scrolling (the budget is 40). |

### Phase 5 — booking, groups and the coach's day (34 screens; 8 of 21 scored pass all four)

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
| `/coach/admin/programs` | admin | do | ✗ | ✗ | ✓ | ✓ | 343 words before scrolling (the budget is 40). |
| `/coach/business` | signed-in; scored as coach | hub | ✗ | ✗ | ✓ | ✓ | An empty state with no next step: "Coach Pro is not on sale yet. Nothing is limited until it is.". |
| `/coach/business/thanks` | anyone; scored as coach | do | ✗ | ✓ | ✓ | ✓ | 41 words before scrolling (the budget is 40). |
| `/coach/combine` | signed-in; scored as coach | do | ✗ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Saving combines to your account is coming soon. This combine is kept on this pho". |
| `/coach/dashboard` | nobody (a 404 for everyone) | hub | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/coach/dashboard/settings` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/coach/form-review` | signed-in (coached client) | do | ✗ | ✓ | ✓ | ✓ | 56 words before scrolling (the budget is 40). (opened from the first exercise of the client's session, as the app links it) |
| `/coach/groups` | signed-in; scored as coach | do | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Opens soon". |
| `/coach/highlight/[id]` | signed-in | do | ✗ | ✓ | ✓ | ✓ | 53 words before scrolling (the budget is 40). (no highlight row exists on a new account: the screen for a link that names none) |
| `/coach/join` | anyone | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/coach/join/[token]` | anyone; scored as solo | do | ✗ | ✓ | ✓ | ✓ | 44 words before scrolling (the budget is 40). (a real invite made by the rig's coach, opened by an athlete who has not joined) |
| `/coach/live/[room]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (NEXT_PUBLIC_COACH_LIVE_ENABLED (live coach sessions))* |
| `/coach/offers/[offer]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/coach/review/[bookingId]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (COACH_STORE_ENABLED (the coach store; also needs the coach-store SQL))* |
| `/coach/session` | signed-in; scored as coach | do | ✗ | ✓ | ✓ | ✓ | 43 words before scrolling (the budget is 40). |
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

### Phase 6 — the first five minutes (9 screens; 2 of 7 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/` | anyone | hub | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/age` | nobody (redirects away) | do | – | – | – | – | *not its own screen: redirects to / for everyone who is signed in* |
| `/consent/guardian` | signed-in | do | ✗ | ✓ | ✓ | ✓ | 90 words before scrolling (the budget is 40). |
| `/consent/guardian/[token]` | unknown (no fixture) | do | – | – | – | – | *not scored: needs a guardian-consent row with its emailed token* |
| `/join` | anyone | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/login` | anyone | do | ✗ | ✗ | ✓ | ✓ | 166 words before scrolling (the budget is 40). |
| `/signup` | anyone | do | ✗ | ✗ | ✗ | ✓ | "CONTINUE" answers a tap in 288 ms (the budget is 200 ms). |
| `/try` | anyone | do | ✗ | ✓ | ✓ | ✓ | 1 tap target under 44 px in the app's own bars. |
| `/welcome` | signed-in | hub | ✓ | ✗ | ✓ | ✓ | 1 paragraph of body copy under 16 px. |

### Phase 7 — around the games (55 screens; 2 of 49 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/arena` | signed-in | hub | ✗ | ✗ | ✓ | ✗ | 1 serious accessibility finding (contrast). |
| `/c/[code]` | anyone | do | – | – | – | – | *switched off: a 404 (not switched off: a challenge code that does not exist is the app's 404 (a real challenge needs a row a player makes by sending one))* |
| `/c/[code]/play` | nobody (redirects away) | do | – | – | – | – | *not its own screen: redirects to /c/NONE00 for everyone who is signed in* |
| `/controller/[code]` | anyone | do | ✓ | ✓ | ✓ | ✗ | 1 critical accessibility finding (label). (a made-up room code: the screen a phone shows before the TV answers) |
| `/host` | anyone | do | ✗ | ✗ | ✓ | ✗ | 30 tap targets under 44 px (smallest: "Downtown"). |
| `/ladder` | signed-in | hub | ✗ | ✗ | ✓ | ✓ | Nothing in the screen itself leads on: only the app's own bars do. |
| `/live` | signed-in | hub | ✓ | ✗ | ✓ | ✓ | 2 paragraphs of body copy under 16 px. |
| `/live/schedule` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (LIVE_STREAM_SCHEDULE_ENABLED (the live schedule))* |
| `/modes` | anyone | hub | ✓ | ✗ | ✓ | ✓ | 29 paragraphs of body copy under 16 px. |
| `/multiplayer` | signed-in | hub | ✗ | ✗ | ✓ | ✗ | An empty state with no next step: "No matches yet. Create a challenge above to get started.". |
| `/party` | anyone | hub | ✗ | ✗ | ✓ | ✓ | 2 paragraphs of body copy under 16 px. |
| `/party/[code]` | anyone | do | ✗ | ✗ | ✓ | ✓ | 108 words before scrolling (the budget is 40). (a made-up party code) |
| `/play` | signed-in | hub | ✓ | ✗ | ✓ | ✓ | Text cut off at 390 px: "Breakaway · Twelve Yards · Baseball · Moonsh". |
| `/play/acting` | signed-in | do | ✗ | ✗ | ✓ | ✓ | 45 words before scrolling (the budget is 40). |
| `/play/adventure` | anyone | do | ✗ | ✗ | ? | ✓ | 1 paragraph of body copy under 16 px. |
| `/play/adventure-br` | anyone | do | ✗ | ✗ | ? | ✓ | Dead end: nothing on the screen leads on or back. |
| `/play/aero-aces` | signed-in | do | ✓ | ✗ | ✓ | ✗ | 1 critical accessibility finding (contrast). |
| `/play/baseball` | signed-in | do | ✗ | ✗ | ? | ✓ | 64 words before scrolling (the budget is 40). |
| `/play/big-air` | signed-in | do | ✓ | ✗ | ? | ✓ | A spinner with no words: it never says what it is waiting for. |
| `/play/brain-brawl` | signed-in | do | ✓ | ✗ | ? | ✗ | A spinner with no words: it never says what it is waiting for. |
| `/play/calibrate` | signed-in | do | ✗ | ✗ | ✓ | ✓ | 98 words before scrolling (the budget is 40). |
| `/play/carnival` | signed-in | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/play/carnival/recap` | signed-in | do | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/play/dance` | signed-in | do | ✓ | ✗ | ✓ | ✓ | A spinner with no words: it never says what it is waiting for. |
| `/play/derby` | signed-in | do | ✓ | ✗ | ? | ✓ | A spinner with no words: it never says what it is waiting for. |
| `/play/duel` | signed-in | do | ✓ | ✗ | ? | ✓ | A spinner with no words: it never says what it is waiting for. |
| `/play/dunk` | signed-in | do | ✓ | ✗ | ? | ✓ | A spinner with no words: it never says what it is waiting for. |
| `/play/dunkduel` | signed-in | do | ✗ | ✓ | ✓ | ✓ | 88 words before scrolling (the budget is 40). |
| `/play/football` | signed-in | do | ✓ | ✗ | ✓ | ✓ | A spinner with no words: it never says what it is waiting for. |
| `/play/freerun` | signed-in | do | ✓ | ✗ | ✗ | ✓ | "TAP TO START" answers a tap in 1272 ms (the budget is 200 ms). |
| `/play/golf` | signed-in | do | ✓ | ✗ | ? | ✓ | A spinner with no words: it never says what it is waiting for. |
| `/play/irl` | signed-in | do | ✗ | ✗ | ✓ | ✓ | 1 paragraph of body copy under 16 px. |
| `/play/karate` | signed-in | do | ✓ | ✗ | ? | ✓ | A spinner with no words: it never says what it is waiting for. |
| `/play/karate-vs` | signed-in | do | ✓ | ✗ | ? | ✓ | A spinner with no words: it never says what it is waiting for. |
| `/play/map-preview` | signed-in | do | ✗ | ✗ | ✗ | ✓ | The screen jumps as it loads (layout shift 0.062; the budget is 0.02). |
| `/play/mixedcombat` | signed-in | do | ✓ | ✗ | ? | ✓ | A spinner with no words: it never says what it is waiting for. |
| `/play/music` | signed-in | do | ✗ | ✗ | ✗ | ✓ | "TAP TO START" answers a tap in 288 ms (the budget is 200 ms). review: a number with no method line |
| `/play/onevone` | signed-in | do | ✓ | ✗ | ✓ | ✓ | A spinner with no words: it never says what it is waiting for. |
| `/play/party` | signed-in | do | ✗ | ✗ | ✓ | ✓ | 91 words before scrolling (the budget is 40). |
| `/play/shared` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (a 404 by design: only its share links are pages (lib/nav/reachability.test.ts))* |
| `/play/shared/[token]` | nobody (a 404 for everyone) | do | – | – | – | – | *switched off: a 404 (STUDIO_SHARE_ENABLED (Studio share links))* |
| `/play/showdown` | signed-in | do | ✓ | ✗ | ? | ✓ | A spinner with no words: it never says what it is waiting for. |
| `/play/skateboard` | signed-in | do | ✓ | ✗ | ? | ✓ | A spinner with no words: it never says what it is waiting for. |
| `/play/snowboard` | signed-in | do | ✓ | ✗ | ? | ✓ | A spinner with no words: it never says what it is waiting for. |
| `/play/soccer` | signed-in | do | ✓ | ✗ | ✓ | ✗ | A spinner with no words: it never says what it is waiting for. |
| `/play/sprint` | signed-in | do | ✓ | ✗ | ? | ✗ | A spinner with no words: it never says what it is waiting for. |
| `/play/surf` | signed-in | do | ✓ | ✗ | ? | ✓ | A spinner with no words: it never says what it is waiting for. |
| `/play/tennis` | signed-in | do | ✓ | ✗ | ? | ✗ | A spinner with no words: it never says what it is waiting for. |
| `/play/threepoint` | signed-in | do | ✓ | ✗ | ? | ✓ | A spinner with no words: it never says what it is waiting for. |
| `/play/threevthree` | signed-in | do | ✓ | ✗ | ✓ | ✓ | A spinner with no words: it never says what it is waiting for. |
| `/play/tiebreak` | nobody (redirects away) | do | – | – | – | – | *not its own screen: redirects to /play/tennis for everyone who is signed in* |
| `/play/velocity-kart` | signed-in | do | ✓ | ✗ | ? | ✗ | 1 critical accessibility finding (contrast). |
| `/play/volleyball` | signed-in | do | ✓ | ✗ | ? | ✓ | A spinner with no words: it never says what it is waiting for. |
| `/play/who-scene-it` | signed-in | do | ✓ | ✗ | ? | ✓ | A spinner with no words: it never says what it is waiting for. |
| `/venues` | signed-in | hub | ✗ | ✗ | ✓ | ✓ | 1 paragraph of body copy under 16 px. |

### Phase 8 — your things (24 screens; 0 of 20 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/account` | signed-in | hub | ✗ | ✗ | ✓ | ✓ | 11 tap targets under 44 px (smallest: "on"). |
| `/admin/funnel` | admin | hub | ✗ | ✗ | ✓ | ✓ | An empty state with no next step: "No wins yet". |
| `/admin/metrics` | admin | hub | ✓ | ✗ | ✗ | ✓ | An empty state with no next step: "No stored rollups yet. Click “Recompute” to generate them from traffic.". |
| `/admin/review` | admin | hub | ✗ | ✗ | ✓ | ✗ | "WAITING" does nothing when tapped. |
| `/card/[slug]` | unknown (no fixture) | do | – | – | – | – | *not scored: needs a published creator card row; a new account has none* |
| `/cards` | signed-in | hub | ✓ | ✗ | ✓ | ✓ | 8 paragraphs of body copy under 16 px. |
| `/closet` | signed-in | hub | ✗ | ✗ | ? | ✗ | 40 tap targets under 44 px (smallest: "Rename LOOK 1"). |
| `/market` | signed-in | hub | ✗ | ✗ | ✓ | ✓ | 8 tap targets under 44 px (smallest: "SHOP"). |
| `/p/[token]` | unknown (no fixture) | do | – | – | – | – | *not scored: needs a coach share-link row (a coach sharing a client's progress); none exists on a new account* |
| `/pro` | signed-in | do | ✗ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Opens soon". |
| `/profile` | signed-in | hub | ✗ | ✗ | ✓ | ✓ | An empty state with no next step: "Nothing measured yet". |
| `/profile/challenges` | signed-in | do | ✗ | ✗ | ✓ | ✓ | Nothing in the screen itself leads on: only the app's own bars do. |
| `/profile/edit` | signed-in | do | ✗ | ✗ | ✓ | ✓ | 24 tap targets under 44 px (smallest: "+ Log measurement"). |
| `/profile/week` | signed-in | do | ✗ | ✗ | ✓ | ✓ | 114 words before scrolling (the budget is 40). |
| `/settings` | nobody (redirects away) | do | – | – | – | – | *not its own screen: redirects to /account for everyone who is signed in* |
| `/shop` | signed-in | hub | ✓ | ✗ | ✓ | ✓ | 1 paragraph of body copy under 16 px. |
| `/shop/shards` | signed-in | do | ✗ | ✗ | ✗ | ✓ | Nothing in the screen itself leads on: only the app's own bars do. review: a number with no method line |
| `/squads` | signed-in | hub | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Squads and teams are coming soon. Your drills, games and streak keep counting in". |
| `/squads/[id]` | signed-in | do | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Squads and teams are coming soon. Your drills, games and streak keep counting in". (the teams-and-squads tables are not applied) |
| `/squads/join/[token]` | anyone | do | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Squads and teams are coming soon. Your drills, games and streak keep counting in". (the teams-and-squads tables are not applied) |
| `/store` | signed-in | hub | ✓ | ✗ | ✓ | ✓ | 2 paragraphs of body copy under 16 px. |
| `/support` | anyone | read | ✗ | ✗ | ✓ | ✓ | 1 paragraph of body copy under 16 px. |
| `/u/[slug]` | unknown (no fixture) | do | – | – | – | – | *not scored: needs a published creator card row; a new account has none* |
| `/wallet` | signed-in | hub | ✗ | ✗ | ✓ | ✗ | 1 critical accessibility finding (label, contrast). |

### Phase 9 — learn, create and the public pages (36 screens; 3 of 33 scored pass all four)

| Screen | Who | Kind | 1 | 2 | 3 | 4 | The single worst problem |
|---|---|---|---|---|---|---|---|
| `/camp` | signed-in | read | ✗ | ✗ | ✓ | ✓ | 1 paragraph of body copy under 16 px. |
| `/coach-terms` | anyone | read | ✗ | ✓ | ✓ | ✓ | 3 tap targets under 44 px in the app's own bars. |
| `/create` | signed-in | hub | ✓ | ✗ | ✓ | ✓ | An empty state with no next step: "Nothing yet. Pick a tile above: three steps and it is a card.". |
| `/create/[discipline]` | signed-in | do | ✗ | ✗ | ✓ | ✗ | "From my Academy library" does nothing when tapped. |
| `/creator` | signed-in | hub | ✓ | ✗ | ✓ | ✓ | 5 paragraphs of body copy under 16 px. |
| `/creator/athlete` | signed-in | do | ✗ | ✗ | ✓ | ✗ | The screen scrolls sideways at 390 px (157 px). |
| `/credits` | anyone | read | ✗ | ✗ | ✓ | ✓ | 33 tap targets under 44 px (smallest: "CMU Graphics Lab Motion Capture Database"). |
| `/education` | nobody (redirects away) | read | – | – | – | – | *not its own screen: redirects to /learn for everyone who is signed in* |
| `/education/course/[id]` | signed-in | read | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/education/playbook` | signed-in | read | ✓ | ✗ | ✓ | ✓ | 1 paragraph of body copy under 16 px. |
| `/education/playbook/[chapter]` | signed-in | read | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/guardian/report/[token]` | unknown (no fixture) | read | – | – | – | – | *not scored: needs a guardian report row with its emailed token* |
| `/guidance` | signed-in | read | ✗ | ✗ | ✓ | ✓ | Nothing in the screen itself leads on: only the app's own bars do. |
| `/kitchens` | signed-in | read | ✗ | ✗ | ✓ | ✓ | 2 paragraphs of body copy under 16 px. |
| `/kitchens/fuel` | signed-in | read | ✗ | ✗ | ✓ | ✗ | 34 tap targets under 44 px (smallest: "Jump height"). |
| `/learn` | anyone | read | ✓ | ✓ | ✓ | ✓ | **passes all four** |
| `/learn/feed` | anyone | read | ✓ | ✗ | ✗ | ✓ | Text cut off with 150 % text: "How minds remember, decide and form habits" and 3 more. |
| `/links` | anyone | read | ✗ | ✗ | ✓ | ✓ | 2 bright buttons compete on the first screen (Take the free movement screen, Copy). |
| `/media-kit` | anyone | read | ✗ | ✗ | ✓ | ✓ | Unfinished mark on screen: "[OWNER: monthly players, as of date]". |
| `/press` | anyone | read | ✗ | ✗ | ✓ | ✓ | Unfinished mark on screen: "[OWNER: number]". |
| `/press/[slug]` | anyone | read | ✗ | ✗ | ✓ | ✓ | 11 tap targets under 44 px (smallest: "on"). |
| `/press/library` | anyone | read | ✗ | ✗ | ✓ | ✓ | 3 paragraphs of body copy under 16 px. |
| `/press/receipt` | anyone | read | ✗ | ✗ | ✓ | ✓ | 3 paragraphs of body copy under 16 px. |
| `/privacy` | anyone | read | ✗ | ✓ | ✓ | ✓ | Nothing in the screen itself leads on: only the app's own bars do. |
| `/purchase-terms` | anyone | read | ✗ | ✓ | ✓ | ✓ | 3 tap targets under 44 px in the app's own bars. |
| `/store-terms` | anyone | read | ✗ | ✗ | ✓ | ✓ | An empty state with no next step: "Nothing here stops you from contacting a government consumer-protection agency.". |
| `/story` | signed-in | read | ✓ | ✗ | ✓ | ✓ | Text cut off with 150 % text: "The Snow Slope". |
| `/story/boss` | signed-in | read | ✗ | ✗ | ✗ | ✓ | "FACE THE GLITCH" answers a tap in 432 ms (the budget is 200 ms). |
| `/story/rail` | signed-in | read | ✗ | ✗ | ✓ | ✓ | 2 pieces of text under 12 px. |
| `/studio` | nobody (a 404 for everyone) | hub | – | – | – | – | *switched off: a 404 (NEXUS_STUDIO_ENABLED (Nexus Studio))* |
| `/teach` | signed-in | hub | ✓ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Teaching on FEL opens soon.". |
| `/teach/motion` | signed-in | do | ✗ | ✗ | ✓ | ✓ | Unfinished mark on screen: "Motion lessons open soon.". |
| `/team` | anyone | read | ✗ | ✗ | ✓ | ✓ | Unfinished mark on screen: "[OWNER: profiles]". |
| `/team/[slug]` | anyone | read | ✗ | ✗ | ✓ | ✓ | 11 tap targets under 44 px (smallest: "FINAL EVOLUTION LAB"). |
| `/terms` | anyone | read | ✗ | ✓ | ✓ | ✓ | 3 tap targets under 44 px in the app's own bars. |
| `/work-with-us` | anyone | read | ✗ | ✗ | ✓ | ✓ | Unfinished mark on screen: "[OWNER: link to the application, P2]". |

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
