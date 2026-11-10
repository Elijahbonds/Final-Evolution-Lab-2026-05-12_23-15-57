# Readable: the standard, the audit and the guards

**Owner, 2026-11-02:** "We need to make sure people can read what they're looking at always."

The lane is `lane/readable`. This file says what "readable" means here, as numbers, why each number is what it is, how
it is measured, what was fixed and what still fails.

## 1. The standard

Each rule is a number in `lib/readable/rules.ts` (`READABLE`), so the rig, the source guard and this page cannot drift.

| Rule | The number | Why this number |
|---|---|---|
| **Smallest text** | Nothing a user must read is under **12 px**. | 12 px is the type scale's smallest role, `TYPE.label` (`lib/design/type.ts`, premium-ui P1), which the owner has seen and signed off. The menus were designed down to it; everything smaller was an ad-hoc `text-[9–11.5px]` from before the scale (premium-ui counted 33 such sizes). |
| **Body copy on a phone** | A run of more than 12 words is at least **16 px** at 390 px wide. | 16 px is `TYPE.body` and iOS's default body size; under 16 px iOS Safari also zooms a focused field. "More than 12 words" is the line `TYPE.small` draws: a supporting line of up to 12 words may be 14 px. |
| **HUD text during play** | A HUD **line** the player reads mid-play (3+ words: a hint, a callout, a card's sub-line) is at least **14 px** on a 390 px phone; every piece of HUD text is at least **24 px** on a 1080p TV. A label or value of one or two words (HR, OUTS, 0:14) keeps the 12 px floor. | 14 px is the smallest size the type scale uses for reading (`TYPE.small`); HUD text is read at a glance, in motion, over a moving scene, so it cannot be smaller than menu text that is read at rest. A label (HR, OUTS) is learned once and then recognised by place, so it keeps the app-wide floor. 24 px at 1080p is the HUD's own 10-foot floor (`TV_MIN_READ_PX`, A9.13). Console view zooms the HUD with the screen's height (`lib/ui/consoleView.ts`, ×2.25 at 1080 px), so 12 px on a phone draws at 27 px on the TV. |
| **Contrast** | WCAG 2.2 AA (1.4.3): **4.5:1**, or **3:1** for large text (24 px, or 18.66 px at weight 700+). Measured from the **rendered pixels** behind each glyph, not from CSS. Placeholder text counts. A disabled control is exempt (1.4.3), but is counted separately. | AA is the floor the a11y lane adopted (`lib/a11y/wcag.ts`). Pixels, because a computed background colour does not know about a gradient, a translucent panel over a photo, or the 3D scene. |
| **Text over 3D, video, camera or a photo** | It sits on a scrim or a plate, or carries a tight dark edge, so the 4.5:1 / 3:1 holds on the **worst** frame. | A frame changes every 16 ms; the one that matters is the brightest. The rig measures the HUD over ten real backdrops (snow, sky, sunlit court…), plus pure white and mid-grey. |
| **Never clipped** | No key information — a number, a score, a price, a time, an error, a heading or a control's label — is cut off at 390 px, at 200 % zoom (1280 × 800 at 200 %, a 640 × 400 CSS viewport), or with the root font at 150 % (iOS larger text). | These are the three ways a phone or a laptop shrinks the room text has. 150 % is the top of the brief's 125–150 % (the worst case). |
| **Never overlapping** | No text is left under the tab bar, the status rail, the HUD or a toast once the page is scrolled as far as it goes; no two runs of text are drawn on each other. | A run under a bar at the end of the page can never be scrolled clear. |
| **Up long enough to read** | A toast, banner, callout or lower third that goes away by itself stays up at least **words × 0.3 s + 1 s**, unless it persists or can be re-read. | 0.3 s a word is 200 words a minute, a slow reader's pace; the 1 s is noticing that something arrived and moving the eyes to it. |
| **Themes** | Both themes, if the app has two; `prefers-contrast`; reduced transparency where a blur carries text. | The app has **one theme** (dark: `<html class="dark">`, ink `#050505`) and no `prefers-contrast` handling (searched 2026-11-02). Every contrast number here is on the dark theme. Blur-backed text is measured as drawn. Since readable-2 (2026-11-10), under `prefers-reduced-transparency: reduce` the glass (`.fel-glass`, the toasts), the HUD panels (`.fel-panel`), the tab bar and the status rail (`.fel-bar`) are solid with no blur (`app/theme.css`; measured by `scripts/probes/readable/reduced-transparency.mts`). |

## 2. How it is measured

### The rig (`scripts/readable/audit.mts`)

Every `app/**/page.tsx` except `app/dev` and `app/api`, discovered from the tree, so a new route is audited the day it
lands. Each page is the real module rendered on the accessibility rig's stubbed server (`scripts/a11y/rig.mts`: no
database, every API answers "nothing yet", so each screen shows what a new account sees), with each route's nested
layouts, between the real StatusRail and TabBar, served over http from a random local port so `public/` images load.

Four set-ups per route: **phone** 390 × 844, **desktop** 1280 × 800, **zoom200** (1280 × 800 at 200 %), **font150**
(390 × 844, root font 150 %).

For every visible run of text (`scripts/readable/inpage.ts`): the rendered size (the computed font size times any CSS
zoom), the colour with every ancestor's opacity folded in, the boxes of its glyphs, what clips it (an overflow-hidden
ancestor it runs past, an ellipsis, a line clamp, the viewport) and what covers it (a fixed or sticky layer, another run).

**Contrast from pixels.** Each viewport is shot twice: once as is, and once with every glyph made transparent — scrims,
panels and text shadows stay. The second shot is exactly what is behind the text. The ink is where the two shots differ;
the run's ratio is its colour (with its opacity) against the background pixel under each ink pixel, and the run's figure
is the 10th percentile, so one stray bright pixel does not fail a run but a bright patch behind a third of the letters
does (`pixelContrast`). Text with no solid colour (gradient-clipped, an SVG fill) is read from its own pixels.

**The HUD over real frames.** The 3D scene cannot draw in this container (no WebGL in headless Chromium here), so the
HUD is measured over recorded frames instead: the shared TV HUD pieces (scorebug, chips, meter, banner, lower third,
hint line) and JuiceKit's banner, score pop and callout, at phone size and at 1080p (zoom 2.25), over ten of the modes'
own backdrops (`public/backdrops/*.jpg`) plus pure white and mid-grey.

```
npx tsx scripts/readable/audit.mts <outDir> <label> --build-only                       # bundle (no browser)
/home/user/wt/gate-run.sh 900 npx tsx scripts/readable/audit.mts <outDir> <label> --plant
/home/user/wt/gate-run.sh 900 npx tsx scripts/readable/audit.mts <outDir> <label> --hud
/home/user/wt/gate-run.sh 900 npx tsx scripts/readable/audit.mts <outDir> <label> [--budget=780]
npx tsx scripts/readable/summary.mts <outDir> <label> [--vs=<before label>] [--pairs=/play,/terms]   # totals, worst screens, contact sheets
npx tsx scripts/readable/regressions.mts <outDir> <before label> <after label> [--all] [--body]   # the gate: exits 1 on anything new
/home/user/wt/gate-run.sh 900 npx tsx scripts/probes/readable/reduced-transparency.mts <outDir> <label>   # the glass and the bars, setting off / on
```

`regressions.mts` is the gate between two crawls: per route and set-up, the clipping, overlap and sideways scroll that
the after-crawl has and the before-crawl does not (counted, so a text clipped twice before and three times after is
one new finding), and any route that rendered before and does not now. `--workers=3` reads three routes at a time in
the one browser (a full crawl is then about two lock holds); `--trace=<text>` prints the measured ratio of a named run,
pass or fail, and says so when a run was never read because a fixed layer covered it at every scroll step.

The crawl resumes: each route is written to `<outDir>/<label>/routes/<route>.json` when it finishes, and a run stops
starting new routes after `--budget` seconds, so a crawl is several ≤ 15-minute lock holds. Output is JSON plus a JPG of
each first screen with every failing run boxed in red.

### Validating the rig

`--plant` renders a control page: five known faults beside known-good text, and exits 1 unless the rig flags exactly
the faults (section 3 has the result).

| Planted | Expected |
|---|---|
| 11 px `#999` on white | under 12 px **and** contrast (2.85:1) |
| "Score 12,345 points" in a 70 px overflow-hidden box | clipped (key information) |
| bare white 16 px caption on the snowboard backdrop | unreadable over an image |
| two runs drawn on each other | overlap |
| the page's last line under a fixed bottom bar, with no room to scroll it clear | overlap with fixed |
| **good:** 16 px `#f2f5f9` on the ink; the 12 px label step in `--fel-text-dim`; a 32 px bold number in `--fel-text-quiet`; a scrimmed caption on the same snow; text inside the fixed bar | nothing |

### The source guard (`tests/readable/source-floor.test.ts`, vitest)

Fast, no browser: every user-facing `.ts`/`.tsx` under `app/`, `components/` and `lib/` (not `app/dev`, tests or
scans) is read by `lib/readable/sourceScan.ts` for

- a Tailwind `text-[Npx]` / `text-[Nrem]` or an inline `fontSize` under 12 px, and
- a `text-<colour>[/<alpha>]` class under 4.5:1 on the app's three text surfaces (ink, card, raised panel). Dark solid
  colours (ink on a lit chip) and `disabled:` variants are not judged.

It is a ratchet: `tests/readable/source-baseline.json` holds what is left per file, a file may never rise above its line,
and a new file is held to zero. Lower a line when you fix one: `npx tsx scripts/readable/source-baseline.mts --write`.

The codemod also reads a tree this lane may not edit, to list what the floor would change there (never `--write`):
`git archive origin/main app components lib | tar -x -C <dir>`, then
`npx tsx scripts/readable/codemod.mts --root=<dir> --only=<file of paths> --list`.

### Timings (`scripts/readable/timings.mts`)

Every message call with a literal text — JuiceKit `banner()`/`callout()`, the modes' banner channels, sonner toasts —
against the read time.

## 3. Results

**The rig is validated** (`--plant`): on every bundle this lane built, phone and desktop, it flagged exactly the five
planted faults and none of the good controls.

### The source (every user-facing file; `tests/readable/source-floor.test.ts`)

| | before (`82e88b7c`) | after |
|---|---|---|
| text under 12 px | 1,356 uses in 298 files | **46** uses in 16 files (all routed or reviewed) |
| text colours under AA on the dark surfaces | 785 classes in 209 files | **27** (routed, or a brand accent on an icon) |
| passing messages up for less than the read time (literal call sites) | 75 of 211 | **0** of 211 |

### The pages (the rig: 170 routes before, 180 after; 123 / 130 render on the stubbed server)

Counts are runs of text; before is `82e88b7c`, after is this branch with `lane/finish-release` at `349a8f72` merged in.

| Rule | phone | desktop | 200 % zoom | 150 % root font |
|---|---|---|---|---|
| under 12 px | 507 → **8** | 459 → **8** | – | – |
| contrast under AA (from pixels) | 216 → **23** | 191 → **19** | – | – |
| unreadable over a photo | 4 → **1** | 7 → **2** | – | – |
| key information clipped | 53 → **15** | 19 → **17** | 22 → **18** | 86 → **18** |
| overlapped (under a fixed bar / text on text) | 9 → **6** | 3 → **3** | 4 → **4** | 1 → **1** |

No clip, overlap or sideways scroll in the after-crawl is new against the before: the ones the floor caused (the
sign-up mode shelf, `/train`'s rows, the party room on a phone, the docked primary at 150 %) were fixed and re-read.
| page scrolls sideways | 0 → 0 | 0 → 0 | 0 → 0 | 72 → **6** |
| body copy under 16 px on a phone | 424 → 440 | – | – | – |

The 8 left under 12 px are the owner's `[OWNER: …]` placeholders on /press, /media-kit, /team and /work-with-us
(bracketed copy waiting for the owner). Body copy under 16 px went up because text that was 9–11 px (and so counted as
"under 12") is now 12–14 px and counts here instead, and the merged lanes added pages; it is section 5's owner call.

### The HUD over real frames (the shared TV HUD; JuiceKit's banner, score pop and callout)

| | before | after |
|---|---|---|
| HUD text under 12 px on a phone | 90 (9 runs × 10 frames) | **0** |
| HUD lines under 14 px on a phone | 10 | **0** |
| HUD text under AA / 3:1 over the frames (phone + 1080p) | 17 | **1** (the decorative "·" divider, on pure white only) |
| JuiceKit text under its floor over the frames | 26 contrast + 10 size | **0** |

Contact sheets (JPG): the worst screens before (`before/contact.jpg`) and after (`after/contact-after.jpg`), and the
HUD before / after (`contact-hud.jpg`), in the lane's scratchpad; the route JSONs beside them.

### readable-2 (2026-11-10): the owner calls, the small misses, the lanes that landed

Phase 1's crawl data was lost with its scratch folder, so both crawls here are fresh, on one build of the rig: before is
release `a5bb51e9`, after is `lane/readable-2`. 184 routes; 133 render on the stubbed server in both. The plant control
passed on both bundles (exactly the five planted faults, phone and desktop).

**The gate** (`scripts/readable/regressions.mts <outDir> before after`): **0** new clipped runs, **0** new overlaps, **0**
pages that newly scroll sideways, **0** routes that stopped rendering, across phone, desktop, 200 % zoom and 150 % root
font. Nothing is new under the size and contrast rules either.

| Rule | phone | desktop | 200 % zoom | 150 % root font |
|---|---|---|---|---|
| under 12 px | 23 → **8** | 23 → **8** | – | – |
| contrast under AA (from pixels) | 20 → **7** | 20 → **7** | – | – |
| unreadable over a photo | 1 → 1 | 3 → 3 | – | – |
| key information clipped | 13 → **7** | 17 → **2** | 17 → **2** | 17 → **12** |
| overlapped (under a fixed bar / text on text) | 1 → 1 | 2 → 2 | 3 → 3 | 1 → 1 |
| page scrolls sideways | 0 → 0 | 0 → 0 | 0 → 0 | 6 → **0** |
| body copy under 16 px on a phone | 441 → **157** | – | – | – |

The source (`tests/readable/source-floor.test.ts`): text under 12 px **48 → 0** uses; sub-AA text colours **26 → 7**
(the 7 are `text-fel-violet` / `text-fel-indigo` on icons, reviewed as non-text). The baseline went from 17 files to 6.

What each number is:

- **Under 12 px, 8 left:** the owner's `[OWNER: …]` placeholders on /press, /media-kit, /team and /work-with-us.
- **Contrast, 7 left on a phone:** 6 on `/play/party` (the four empty player slots "P 1"–"P 4" at 1.7–2.8:1 and two
  "1–2 PLAYERS" badges at 3.67 and 4.42:1) and "Save card" on `/profile/edit` (3.96:1). Gone: /cards'
  creator names, /multiplayer's active tab, /party's "PARTY", /live's category chips, /play/drills' camera line and the
  athlete stage's "3D isn't available" line (3.18:1 → clear).
- **Clipped, phone 13 → 7:** gone are the Quick Screen / Privacy / Correctives header `h1`s (2 px) and one Play shelf
  list. Six of the Play shelf's seven lists still end in an ellipsis after two lines (see section 5); the seventh item
  is "Your week · Nov 4 – Nov 10" on /train (32 px).
- **Clipped, desktop and 200 % zoom 17 → 2:** the Play shelf's lists and the mode rows' lines fit in two lines on a desktop (what is left is two
  lines of the hero's card strip, 3–5 px); at 200 % zoom the Sports list still clamps and one strip line is cut.
- **Sideways scroll at 150 %, 6 → 0:** /store-terms (105 px), /multiplayer (88), /support (61), /purchase-terms (48),
  /learn (34) and /modes (6).
- **Body copy under 16 px, 441 → 157:** the five legal pages (244 runs), /credits (22), the guardian consent page (2),
  the Playbook's chapter list (10 of 11) and /play/drills (6 of 7) are at 16 px. What is left is supporting copy on
  59 screens (it was on 66), not long-form: section 5.
- **`/profile`'s two 1.3:1 lines** ("No duels yet…", "Jump check, hands on hips →"): read by name with `--trace`, they
  measure **5.3:1** and **12.1–12.5:1** on a phone and a desktop, before and after alike. The 1.3:1 was the rig's, not the
  page's: it read them while the docked button covered half the run; since 60a01b76 a run any fixed layer covers is read
  at another scroll step. The same trace has the athlete stage's "3D isn't available" line at 3.18:1 before and 6.51:1
  after.

**Reduced transparency**, measured with the browser reporting `prefers-reduced-transparency: reduce`
(`scripts/probes/readable/reduced-transparency.mts`, computed styles on `/play` at 390 px):

| Surface | setting off | setting on |
|---|---|---|
| tab bar | `rgba(5, 5, 5, 0.9)`, blur 24 px | `rgb(5, 5, 5)`, no blur |
| status rail | `rgba(5, 5, 5, 0.85)`, blur 24 px | `rgb(5, 5, 5)`, no blur |
| toast glass (`.fel-glass`) | `rgba(20, 26, 34, 0.86)`, blur 18 px | `rgb(20, 26, 34)`, no blur |
| HUD panel (`.fel-panel`) | `rgba(13, 17, 23, 0.72)`, blur 14 px | `rgb(13, 17, 23)`, no blur |

**Not measured on the rig:** the lesson reader (`/education/playbook/[chapter]`), a course lesson
(`/education/course/[id]`) and the guardian's link page (`/consent/guardian/[token]`) need a record and do not render
on the stubbed server; their 16 px is a class change read in the source, not a measured one. Nothing here was read on
a real phone.

**The HUD over real frames** was not touched by this lane; re-read on the after bundle it is as phase 1 left it: the
shared TV HUD has one miss, the decorative "·" divider on pure white (3.48:1). The `juice-legacy` rows in `hud.json` are
the pre-phase-1 JuiceKit styles kept as the rig's own control, and still fail as they should.

Contact sheets (JPG, the lane's scratch folder `readable-2/`): `before/contact.jpg` and `after0/contact-after.jpg` (the
same 15 worst screens), `after0/contact-pairs.jpg` (six changed screens, before over after), `after0/rt-off.jpg` and
`after0/rt-on.jpg` (the bars with the setting off and on).

## 4. What was fixed

Token and shared-component fixes first; per-screen edits only for the live sweep's named items.

| Fix | Where | What it moves |
|---|---|---|
| **The 12 px floor**, one mechanical rule | `scripts/readable/codemod.mts` over every user-facing file not held by a live lane | `text-[9–11.5px]`, `text-[<0.75rem]` and inline `fontSize < 12` → 12 px (`TYPE.label`) |
| **Muted text to AA** | the same codemod | a `text-<colour>/<alpha>` under 4.5:1 on ink, card and raised panel → the smallest alpha that clears all three (white `/15–/45` → `/50`); `neutral/slate/zinc/gray-500/600` → their `-400` |
| **Brand text tints** | `lib/design/tokens.ts`, `app/theme.css` (`--fel-violet-text`, `--fel-indigo-text`), `text-fel-violet-text` | violet `#A855F7` → `#ad5ff7`, indigo `#7B61FF` → `#876fff`, for small text only (4.28 / 4.03 → 4.66 / 4.64:1 on the raised panel); the accents stay for large text, icons and fills |
| **HUD sizes** | `components/games/tv-hud/tokens.ts` `HUD_TYPE` | phone caption / label / body 10 / 11 / 12 → 12 / 12 / 14 px; 1080p 24.3 / 27.6 / 30.4 → 27 / 27.6 / 31.5 px |
| **HUD text edge** | `HUD_TEXT_SHADOW` | a tight `0 0 2px` dark edge before the glow: a bare meter label went from 1.4–2.9:1 to clean over every backdrop |
| **JuiceKit text** | `lib/babylon/premium/juiceStyles.ts` (new), `JuiceKit.ts` | banner and score pop get the dark edge; the callout plate .62 → .82 and its font 12 → 14 px on a phone; one banner at a time |
| **Read time** | JuiceKit `banner`/`callout`, `HudLowerThird`, `BannerChannel`, `BannerSlot`, `BannerQueue`, `felToast`, `readToast` (new) | on screen for max(own time, words × 0.3 s + 1 s); a queued beat is shown sooner rather than dropped |
| **Reflow at 150 % font** | `components/shell/status-rail.tsx` | the rail wraps (min-h-14) instead of a fixed h-14, so the wallet cluster no longer pushes every page 95 px sideways |
| **Live sweep J6, J8, J11, J12, J13** | `learn/topic-picker`, `games/guest-dunk-shell`, `challenges/guest-challenge-run`, `public-chrome`, `controller-link/host-lobby`, `party/join-form` | an opaque disabled CTA (no titles through it) and 3-line blurbs; 12–14 px controls with 40–44 px targets; a legible disabled JOIN |

### Guards

- `tests/readable/source-floor.test.ts` (vitest, no browser): the per-file ratchet on sub-12 px sizes and sub-AA text
  colours. `tests/readable/source-baseline.json` holds what is left, with the reason for each line.
- `tests/readable/read-time.test.ts`: the shared primitives keep the read time; no literal sonner toast over ten words.
- `lib/readable/rules.test.ts`: the numbers and the judgments, including the 2.85:1 control.
- The rig, on demand, with JSON output (section 2).

## 5. Left, and owner calls

**Routed, not edited** (each line is in `tests/readable/source-baseline.json` with its lane): `components/coach/**`
(coach-tools-easy), the session player and `lib/coach/today` (plat-p07), the hoops modes (hoops-p04), the dunk modes
(dunk-flagship-p6), and public-polish's files (`app/modes`, `party-hub`, the adventure stages, `lib/policies.ts`,
`coach/business/thanks`, `press/receipt`). The fix in each is the same codemod line; run
`npx tsx scripts/readable/codemod.mts --write` once the lane lands, then `source-baseline.mts --write`.

**lane/readable-2 (2026-11-10) took the owner calls and the small misses.** Each is in section 3's readable-2 table.

- **The Play shelf** (`components/shell/play-shelf.tsx`): a family's mode list wraps to two lines, then clamps (it was
  one line with an ellipsis). A mode's name and, from 640 px up, its line wrap to two lines as well.
- **Long-form copy at 16 px**, size and wrapping only, no wording: `lib/legal/legalProse.ts` (every legal page, tables
  included), the credits and their licence lines, the guardian consent pages, the lesson reader's "remember" list, the
  Playbook chapter theses, the drills' Playbook text, and a course lesson's text (`TEACH_LOOK.lesson`).
- **`prefers-reduced-transparency`** (`app/theme.css`): `.fel-glass`, `.fel-panel`, the tab bar and the status rail
  (`.fel-bar`) are solid, with no blur.
- **The small misses:** the Quick Screen, Privacy, Correctives and mirror-harness `h1`s keep their glyph tails; /cards,
  /multiplayer, /party, /live and the athlete stage's "3D isn't available" line clear AA; the legal tables scroll inside
  themselves and long words and code break; /support's e-mail, /multiplayer's tabs, /learn's Practice rows and /modes'
  cards wrap, so no page scrolls sideways at 150 % root font.
- **The floor over the lanes that landed since #532** (hoops P4/P4b, gameplay-clean 3 and 4, platform P9/P10, BBS-04,
  dunk P7–P9, public-polish, bat-grip, #546): 11 files changed by the codemod, 48 sizes to 12 px and 19 colours to AA.
  The teacher platform, the shot chart's page, gameplay-clean, bat-grip and #546 needed nothing.
- **`main`-only files** (the arena age gate #543, the seller gate #544, the Venice court #542; the owner's workstream,
  not edited): the codemod would change **nothing** in them (0 sizes, 0 colours; checked against a planted control).

**What the after-crawl still finds** (each was there before this lane; none is new):

- **The Play shelf still ends six of its seven lists in an ellipsis on a 390 px phone**, after two lines. Five need one
  more line (19 px); the Sports list ("Breakaway · Twelve Yards · Baseball · …") needs about seven. At 150 % root font
  all seven clamp. The owner's call was two lines; **recommendation: three lines** shows five of the six in full.
- `/play/party`: the empty player slots "P 1"–"P 4" (1.7–2.8:1) and the "1–2 PLAYERS" badges (3.67 and 4.42:1); the banner
  "Scan the code to join — or press any button" is cut off on a phone (389 px). `/profile/edit`: "Save card" 3.96:1.
- `/train`: "Your week · Nov 4 – Nov 10" loses 32 px on a phone. `/profile/edit`: "Generating your link…" 3 px.
- `/play` on desktop: two lines of the hero's card strip are cut by 3–5 px.
- `/`: the hero's two lines ("Dunk in Venice now…" and "Built by pro dunker Elijah Bonds.") are drawn on each other.
  `/join` and `/coach/join` at 200 % zoom: the last lines sit under the docked button. `/learn/feed` on desktop: a topic
  label over "Pick at least one topic"; at 150 % four topic blurbs clamp by one line.
- `/education/playbook`: the eyebrow "The Playbook" over the hero photo, 2.24:1.
- The `[OWNER: …]` placeholders at under 12 px on /press, /media-kit, /team, /work-with-us: owner copy.

**Body copy under 16 px, what is left (157 runs on 59 screens).** None of it is long-form. It is the supporting line
that runs past 12 words: the mode cards' descriptions on `/modes` (30, at 14 px), settings help on `/account` (7, at
12 px) and `/profile/edit` (6), `/press` (6), `/workout` (6), `/profile` (7), `/cards` (8, at 12 px), and one to five
on each of the rest. Owner call: move these to 16 px too (the standard's letter; cards get taller), or change the
standard's line to "more than 20 words". **Recommendation: 16 px on `/account` and `/profile/edit` (they explain what
happens to your data), leave the cards.** Not done here: it changes the look of 59 screens.

The earlier list, for the record (phase 1's after-crawl; all addressed above or listed again):

- `/play`: the Play shelf's one-line mode lists ("Breakaway · Twelve Yards · Basebal…") end in an ellipsis by design
  (premium-ui P4), and the hero clips its card strip. Recommendation: `line-clamp-2` on the list line.
- The Quick Screen / Correctives header `h1` (`/screen`, `/screen/privacy`, `/play/mirror/assess`, `…/results`,
  `/play/mirror/correctives`) clips its glyph tails by 2 px (`leading-none` inside an `overflow-hidden` row): the mirror
  lanes hold those files.
- `/profile`: "No duels yet…" and "Jump check, hands on hips →" measure 1.3:1 — they sit on the athlete stage's light
  fallback panel when the 3D view cannot start (no WebGL here); worth a look on a device. The empty-tile dashes "—" are
  2.7–2.9:1 (large, decorative).
- `/cards` creator names, `/multiplayer` "Challenge online", `/party` "PARTY", `/live` tags: 3.1–4.46:1 from inline or
  tinted backgrounds the class scanner cannot see (each a one-line colour change).
- `/learn` and the legal pages (`/store-terms`, `/purchase-terms`, `/support`): a code block or a table scrolls the page
  sideways at 150 % root font.
- The `[OWNER: …]` placeholders render at 9–11 px on `/press`, `/media-kit`, `/team`, `/work-with-us`: owner copy.

**Coverage.** The rig renders a page module with the server stubbed. Pages that need a record (`notFound()` without
one), pages that mount Babylon (`/play/*` hosts: no WebGL here), and pages whose client code needs a populated API
shape do not render on it; the HUD is covered over recorded frames instead. Each route's JSON says why it did not render.

**Themes.** One theme (dark). No `prefers-contrast` handling exists. Reduced transparency is handled since readable-2
(section 1, Themes); the blurred overlays that use Tailwind's `backdrop-blur-*` directly (59 files: sheets, HUD chips)
are not in that rule — each has its own tinted background under the blur, and none measured a miss.
