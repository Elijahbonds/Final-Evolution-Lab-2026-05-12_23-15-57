# The 10-phase UI pass: menus, screens, accessibility

**Owner, 2026-10-27:** "Let's make this feel like a premium app in the screens and UI/UX, it still feels cheap to me."
Later the same day: "10 phase pass improving the menus, screens, accessibility."

**Lane:** `lane/premium-ui`. The audit behind this plan is in `docs/PREMIUM-UI.md`.

**Direction (owner's picks):**

- dark premium athletic: a deep dark base and ONE bold FEL accent (cyan `#00E5FF`);
- big confident type and real imagery: the player's avatar, the venue art and the 3D scene captures already in `public/`;
- smooth motion.

**Benchmarks:**

- Nike / Apple Fitness+ for the type, space and motion;
- Whoop / Oura for the rings and numbers;
- NBA 2K / EA for the energy;
- Strava / TrainHeroic for the hierarchy.

**Standing rule:** autoplay, no extra taps, never confusing. One obvious primary action per screen.

## How every phase ships

- **One phase at a time.** The lane merges `origin/lane/finish-release`, commits and pushes. The coordinator opens a PR
  for the phase, and it ships on green. The next phase starts after that.
- **Measured on the rig:** `scripts/premium-ui/shots.mts`, under the gate lock. It takes before and after shots at
  390 px and 1280 px. The phone run is CPU-throttled 4x. A contact sheet goes to `scratchpad/round9/premium-ui/`.
- **The common gates.** Every phase must hold these on every screen it touches:
  - **Words above the fold:** the number the phase names, and never more than before.
  - **Style counts:** font sizes, button looks and card looks on the page. Never more than before; the phase target
    is named in its section.
  - **A11y:** `scripts/a11y/audit.mts` shows 0 criticals on the gated pages, and the total never rises.
  - **Jank:** CLS ≤ 0.02. Long tasks during the load do not rise. FCP on the throttled phone is no worse than
    before +10 %.
  - **Contrast floor:** every text token is at least 4.5:1 on every surface, and UI parts are at least 3:1
    (`lib/design/tokens.test.ts`).
- **Never touched:** files that running lanes own, including:
  - `today-drill`: `lib/daily-drill/**` and `app/train/today-drill/**`;
  - `cue-rewrite`: the copy in `lib/mirror`, `lib/screen`, `lib/coach/formReview` and the results;
  - dunk, hoops and demo-loops files.

  Those screens change only through shared components and tokens. Where a screen needs a one-line swap in their file,
  this plan lists it for them.

---

## P1 — The design system

**Goal:** give every later phase a single type scale, colour set, spacing scale, motion vocabulary and component kit.

**What it adds:**

- `lib/design/{type,motion,space,feedback}.ts`;
- the `--fel-*` premium tokens in `app/theme.css`;
- `components/ui/fel/**`:
  - a hero header;
  - a stat ring and a big-number tile;
  - a docked primary CTA;
  - media and stat cards and a list row;
  - segmented tabs, a chip and an empty state;
  - a skeleton, a toast, a page enter and press feedback;
- `/dev/ui`, the living style page. It is dev-only: a 404 outside `next dev`, held by `lib/dev/devPagesGate.test.ts`.

**Additive:** no existing screen changes in P1.

**Gates:**

- type scale: 6 sizes; one display face and one text face; tabular numbers;
- every new text/surface pair reaches 4.5:1 (by test);
- reduced motion works from both the OS and the in-app Motion setting (by test);
- `/dev/ui` shows 0 a11y criticals;
- tsc, lint and vitest stay green.

**Files:**

- `lib/design/**`;
- `components/ui/fel/**`;
- `app/theme.css`;
- `app/dev/ui/**`;
- `messages/en/ui.json`;
- `lib/i18n/index.ts` (one import).

**Owner look-check:** `/dev/ui` at phone width. Do the rings, numbers, hero, pill and cards read as Whoop and Nike
rather than as a form?

## P2 — The fonts fix

**Goal:** one display face (Barlow Condensed) and one text face (IBM Plex Sans) in the app's menus and pages, with
tabular figures.

**Findings:**

- Production does load all four faces. Measured 2026-10-27: the live CSS carries every `@font-face`, and a woff2
  returns 200.
- The rig's serif comes from `font-family: var(--font-sans), …`. When the variable is missing, that whole declaration
  is invalid and falls back to the browser's serif. That happens on any probe rig, and on the root crash screen,
  which renders its own `<html>`.
- `--fel-font-body` names `'Inter'`, which is never loaded.
- The pages mix four faces: Barlow, Chakra Petch, JetBrains Mono and Plex. There are 767 `font-mono` uses, mostly
  the dev-style eyebrows.

**The fix:**

- var() fallbacks, so a missing variable gives the system sans, never serif;
- `--fel-font-body` from Plex;
- mono eyebrows and labels in the shell and the top screens move to the text face, in small caps with tracking.

The game HUD keeps Chakra Petch, which the owner chose on 2026-09-29.

**Gates:**

- 0 serif text on any rig scene;
- ≤ 2 families rendered on the top screens (plus mono only where a number is code-like);
- `lib/design/fonts.test.ts` extended.

**Files:**

- `tailwind.config.ts` (font stacks: a shared file, flagged);
- `app/theme.css`;
- `app/globals.css`;
- `lib/design/fonts.test.ts`.

**Owner look-check:** the eyebrows and tab labels. Do they read as product rather than as a terminal?

## P3 — Shell and navigation

**Goal:** the tab bar, the status rail, the tab page frame, the doors row and a page enter, all on the system. One
accent: the lit tab is FEL cyan, not three tab colours.

**What changes:**

- a glass tab bar with an active pill and press feedback;
- a calmer rail: the PRQ as a mini ring;
- `TabPage` becomes the hero frame;
- a page enter that is opacity-only, so a fixed game canvas is never re-parented;
- the Motion setting on `<html>` (`data-fel-motion`), so CSS honours it.

**Gates:**

- the tab bar and rail use ≤ 2 font sizes and 1 button look;
- CLS ≤ 0.01 on navigation;
- a11y criticals stay 0;
- focus is never hidden under the bar or the dock (2.4.11);
- pad and remote focus still works (`scripts/a11y/pad-run.mts`).

**Files:** `components/shell/**`, `app/globals.css` and `app/theme.css`.

**Owner look-check:** the bottom bar and the top rail on a phone. Switch tabs: does it glide?

## P4 — Home, Play, Train, Profile

**Goal:** each screen gets:

- a full-bleed hero with real imagery:
  - Venice golden hour for the landing and Play;
  - Muscle Beach for Train;
  - the player's avatar for Profile;
- one docked primary action;
- words cut: headlines of 6 words or fewer, supporting lines of 12 or fewer, labels rather than sentences;
- Whoop-style numbers on Profile;
- the Train shelf as media and list rows instead of 16 paragraphs.

**Gates (phone):**

- words above the fold ≤ 30 on each screen, down from the audit numbers;
- ≤ 5 font sizes above the fold;
- ≤ 3 button looks and ≤ 3 card looks per page;
- flat-empty first screen ≤ 30 %;
- imagery on the first screen of all four;
- exactly 1 primary action;
- FCP no worse than +10 %.

**Files:**

- `components/guest-landing-hero.tsx`;
- `app/{play,train,profile}/page.tsx`;
- `components/shell/{play-shelf,venue-strip}.tsx`;
- `components/profile-v2/{progress-header,athlete-stage,tile}.tsx` (restyle only, data unchanged);
- `messages/en/{play,train,profile,ui}.json`.

**Owner look-check:**

- the four first screens, side by side, before and after;
- the dunk and Muscle Beach imagery, and the docked pill;
- the cut copy: is anything gone that you wanted?

## P5 — Game menus and the TV/couch menus

**Goal:** bring the same system to the mode shelf, the boot and READY cards, the pause and end menus, the party and
join screens, and the couch view. This builds on a11y #461: pad and remote focus, and the couch zoom. Large focus
targets, the focus ring as a glow on the one accent, and the hero art from the mode's backdrop.

**Gates:**

- every menu stop reachable by pad (`pad-run.mts`), 0 focus-hidden;
- the couch view at 1080p: body text ≥ 24 px effective;
- ≤ 3 button looks across the menus;
- no change to any timing window or HUD meter size (TUNED: none).

**Files:**

- `components/games/{boot-splash,end-screen,...}` menu chrome only;
- `components/party/**` lobby chrome;
- `lib/design/couch.ts`.

Hoops and dunk files are not touched: the swaps are listed for those lanes.

**Owner look-check:** the TV at a sofa distance. A pad walks the shelf, starts a game, pauses and quits.

## P6 — Training and results screens

**Goal:** the Mirror, Quick Screen results, Today's drill, readiness, sprint and VBT get:

- the hero header;
- stat rings for the scored numbers;
- big-number tiles;
- skeletons while the camera loads;
- one docked action.

This goes through the shared components only. The `today-drill` and `cue-rewrite` copy stays theirs, and their pages
get a list of swaps of one line each.

**Gates:**

- results first screen ≤ 30 words;
- skeletons where a load used to show a blank;
- CLS ≤ 0.02;
- band colours keep an icon and a word, never colour alone.

**Files:**

- `components/ui/fel/**`;
- the shared result components not owned by a running lane;
- the swap list in `docs/PREMIUM-UI.md`.

**Owner look-check:** Quick Screen results and Today's drill on a phone.

## P7 — Learn and education

**Goal:** the Knowledge Feed, the Playbook and Education become media cards and a reading column: the text face at
17 px with a 1.55 line height, chapter art, and progress rings.

**Gates:**

- the reading measure is 60–75 characters;
- ≤ 4 font sizes;
- the Playbook first screen has imagery;
- a11y criticals stay 0 on learn, education and playbook.

**Files:** `app/{learn,education}/**`, `components/learn/**` and `components/education/**`.

**Owner look-check:** `/learn` and one Playbook chapter.

## P8 — Coach screens

**Goal:** Today, Clients, Combine and the builder become Strava/TrainHeroic hierarchy:

- list rows;
- segmented tabs;
- one primary per tab;
- dense but calm numbers.

**Gates:**

- ≤ 3 button looks and ≤ 3 card looks across `/coach`;
- tables become rows on the phone with no horizontal scroll;
- a11y criticals stay 0 on coach, combine and squads.

**Files:**

- `app/coach/_components/**` chrome;
- `components/coach/**` chrome.

Wiring files already shared with the coach lanes stay additive.

**Owner look-check:** `/coach` Today and Clients on a phone.

## P9 — Accessibility deepening

**Goal:** go past the ten key pages:

- a WCAG 2.2 AA re-audit of every route the rig can render;
- a screen reader pass: names, roles, live regions on the toasts and results;
- captions (`captions-audit.mts`);
- reduced motion in every new component;
- dynamic type: 200 % text zoom with no loss (1.4.4) and text spacing (1.4.12);
- focus order (2.4.3);
- the target size (2.5.8) everywhere.

**Gates:**

- 0 criticals across all audited routes;
- 0 serious on the top 10;
- 200 % zoom shows no clipped text on the top screens.

**Files:**

- `scripts/a11y/**` (scene list widened);
- fixes in the owned files.

Fixes in another lane's file are reported to that lane, not made here.

**Owner look-check:** VoiceOver on Play, Train and Profile; iOS text size at maximum.

## P10 — Consistency sweep and premium polish

**Goal:** sweep the remaining pages onto the system:

- `bg-[#050505]` and ad-hoc `text-[Npx]` become tokens;
- every loading state gets a skeleton;
- every empty state gets an avatar or an illustration;
- press feedback and haptics on every primary;
- motion audited: no jank, reduced motion honoured.

**Gates:**

- the ad-hoc `text-[Npx]` sizes in owned folders → 0;
- hard-coded `bg-[#050505]` in owned folders → 0;
- distinct button looks app-wide ≤ 4;
- every route's first screen ≤ 35 % flat-empty;
- the full a11y audit holds P9's numbers.

**Files:** owned folders only. The rest is listed by owner.

**Owner look-check:** a 2-minute walk through the app on a phone. Does anything still look like a different app?
