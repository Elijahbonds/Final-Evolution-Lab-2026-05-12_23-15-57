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
