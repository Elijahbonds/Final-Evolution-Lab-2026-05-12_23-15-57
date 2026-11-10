# The 10-phase every-screen pass (training and coaching first)

**Owner, 2026-11-10:** "To improve the total quality of the product from improving every screen."

**Status: PLAN ONLY. Nothing here is built until the owner approves the plan.**

| Question | The owner's answer |
|---|---|
| How wide | **Every screen, training first.** Phases 1–5 are training and coaching; phases 6–10 are the rest of the app. |
| A screen is done when it is | **Clear and quick to use. Looks finished. Fast and smooth on a phone. Right and trustworthy.** All four. |
| What to push hardest | Polish what exists. No big new features. |
| Training and coaching parts | All four: the workout, the AI program builder, the Mirror and jump testing, the coach side and booking. |
| Who first | An athlete training alone. |
| When real people use it | Already, or this month. |
| What bothers the owner most | Too many steps. Looks unfinished. Demos and animations. Numbers I don't trust. |
| How each phase is checked | Screenshots and numbers after each phase; the owner plays it when a batch is deployed. |
| When it starts | Plan now; build as the running lanes finish. |

**The size of it (counted 2026-11-10):** 218 pages in `app/`. 34 are developer pages nobody outside reaches, so about
**184 screens** count. 52 of those are training and coaching. Phase 1 makes the exact list.

**Lane:** `lane/every-screen-pNN`, one phase at a time. It builds on: `PREMIUM-UI.md` and `PLAN-UI-10PHASE.md` (the
look), `READABLE.md` (text), `TOOLS-EASY-AUDIT.md`, `COACH-TOOLS-EASY-AUDIT.md`, `VERTICAL-EASY-AUDIT.md`,
`SCREEN-EASY-AUDIT.md`, `PROGRAM-ASK.md`, `JUMP-PRO.md`.

## The scorecard: one line per screen, four checks

"Total quality" becomes one number the owner can watch: **screens that pass all four checks, out of about 184.**
Every phase reports it. A screen that cannot pass is listed with the reason, never quietly skipped.

| Check | A screen passes when (measured on the rig, phone width first) |
|---|---|
| **1. Clear and quick** | One obvious main action. A do-this screen shows ≤ 40 words before scrolling. The job the screen exists for is within its tap budget and never takes more taps than before. No dead end: there is always a next step or a way back. Tap targets ≥ 44 px. |
| **2. Looks finished** | No "coming soon", placeholder text, empty screen without a next step, or spinner without words. Nothing clipped and no sideways scroll at 390 px, at 200 % zoom and at 150 % text size. Text meets `READABLE.md`. At most 4 text sizes and 3 button styles on the screen, the same ones the rest of the app uses. |
| **3. Fast and smooth on a phone** | On the rig's throttled phone (CPU 4× slower): first content in ≤ 2.5 s and no slower than before; nothing jumps as it loads (layout shift ≤ 0.02); a tap answers within 200 ms. `assumption:` these three budgets are new numbers; phase 1 reports how many screens already meet them, and the owner can move them. |
| **4. Right and trustworthy** | Every link and button goes where it says (0 broken). A measured number says how it was measured and how sure it is. A demo shows the right movement, or a labelled still. Nothing stale or contradicting another screen. Accessibility audit: 0 serious findings. |

## How every phase ships

- **One phase at a time.** The lane merges the release, commits, pushes. The coordinator opens a PR and merges on green.
- **The owner gets, per phase:** the scorecard number before → after; one before/after contact sheet (JPG, phone
  width) of the screens the phase touched; a short table of the phase's own gates; a 3-minute phone check list.
- **Fix the shared thing first.** Most screens are built from the same parts (`components/ui`, the page shells, the
  design tokens). A fault found on ten screens is fixed once in the shared part, then the ten are re-scored.
- **Never touched:** prices, legal and policy wording (layout around them only), age gates owned by the owner's other
  workstream, `schema.prisma`, the deploy config, captured clips and the rig, and how any game plays. No existing tuned
  number changes. New numbers are flagged.
- **Gameplay is not in this pass.** The screens around the games are (menus, setup, pause, results). What happens
  during play belongs to the game lanes (dunk, hoops, gameplay-clean).

## Two owner steps that decide what real people can use this month

Several features are built but **switched off until their database tables exist**. Polishing those screens changes
nothing for a real person until then.

1. **Apply the pending tables** (`docs/PENDING-SQL.md`: `plan`, then `apply`). Turns on group booking, saved AI
   programs, coach shot charts, the teacher pages and studio sharing, plus older ones.
2. **Booking setup:** the trainer's account (`GROUP_BOOKING_OWNER_ID`), the three gym addresses, the $75 online listing.

## Phases 1–5: training and coaching (52 screens, in depth)

### Phase 1 — Score every screen, and fix what trips people in training
- Build the scorecard: every reachable screen in the app, scored on the four checks, with a phone screenshot. This is
  the baseline for all ten phases.
- Walk every training and coaching job as three people (an athlete alone, a coached client, the coach) and fix on the
  spot anything that stops them: a dead end, a broken link, a button that does nothing, a dark screen with no reason.

**Gate:** the scorecard exists for every screen; 0 dead ends in training and coaching; every switched-off feature says
why and what to do instead. **Owner gets:** the starting number (N of 184), and the list of what is dark.

### Phase 2 — From opening the app to finishing a workout
The Train front door and the session player.
- One obvious thing to do today; resume where you left off.
- In the workout: the demo leads and starts by itself; logging a set is one tap; the rest timer runs by itself;
  finishing shows what you did and what is next.

**Gate:** open app → first exercise in ≤ 2 taps and ≤ 10 s; log a set in 1 tap; a 5-exercise session in ≤ 12 taps
beyond the sets. Every exercise in the built-in and signature programs shows the right demo or a labelled still, 0
wrong; the missing ones go to the animation lane as a ranked list.

### Phase 3 — The AI program builder
"All I have is a band" → a full program you can start today. Change one thing without starting over. Save, and start.

**Gate:** ask → first rep in ≤ 4 taps. A fixed set of 24 asks (band only, dumbbells, no equipment, teen, bad knee,
20 minutes, and so on) all pass written rules, kept as tests: only equipment the person has, every major movement
covered each week, sensible weekly volume, youth rules kept, no medical claims.

### Phase 4 — Numbers you can trust
Jump testing, the Mirror's movement screen, sprint, bar speed, readiness, and the progress page.
- One results layout for all: the number, how it was measured, how sure, what it means, what to do next.
- A bad set-up (camera angle, feet out of frame) is caught before the test, not after.
- Every number on the progress page traces to the session or test it came from.

**Gate:** on the recorded fixtures, error and repeat-to-repeat spread are measured and shown as a ± line; no measured
number appears without its method and confidence; progress number → its source in 1 tap; the earlier results hold
(vertical in ≤ 3 taps; movement screen in 3 taps and under 3 minutes).

### Phase 5 — Booking, groups and the coach's day
- Joining: find a group, see the gym and time, join, book a 1:1, see my bookings, cancel. The rules are shown where
  they apply, in the owner's approved words only.
- Coaching: who trained, who needs attention, adjust a program, review a form clip, run a group at the gym.

**Gate:** join a group in ≤ 4 taps; book a 1:1 in ≤ 5; cancel in ≤ 3 with the rule shown first. "Who needs me today" is
the coach's first screen; adjust one exercise in ≤ 4 taps; attendance in ≤ 1 tap per person. **All 52 training and
coaching screens pass all four checks, or are listed with the reason.**

## Phases 6–10: the rest of the app (about 132 screens)

Less depth per screen than phases 1–5: the four checks, the shared parts fixed first, and each area's main jobs timed.

### Phase 6 — The first five minutes
Home, try-it, welcome, sign-up, sign-in, consent and onboarding.

**Gate:** a new person goes from the home page to doing something real (a game or a first workout) in ≤ 4 taps and
under 60 s on the throttled phone; sign-up asks for nothing twice; every screen in this group passes all four checks.

### Phase 7 — Around the games
The Play shelf and every mode's own screens: setup, how-to, pause, results, rematch; party, live and multiplayer
lobbies. About 50 screens. Not the play itself.

**Gate:** pick a game → playing in ≤ 2 taps; results → play again in 1; a lobby always says what it is waiting for;
every screen in this group passes all four checks.

### Phase 8 — Your things
Profile, account, wallet, shop and store, closet, squads and teams, settings, support.

**Gate:** each area's main job within its tap budget (set from the phase-1 baseline, never more than before); a
balance or a purchase always shows where it came from; every screen in this group passes all four checks.

### Phase 9 — Learn, create and the public pages
Education and lessons, story, kitchens, the teacher pages, Nexus Studio's screens, the creator pages, press and the
coach's public pages, and the layout of the terms pages (never their words).

**Gate:** open a lesson → reading or doing in ≤ 2 taps; Studio's first screen says what you can make and starts it in
1 tap; every screen in this group passes all four checks.

### Phase 10 — The whole app, once more
- Re-score all 184 screens. Fix what slipped.
- One look everywhere: the same text sizes, buttons, cards, empty states, loading and error screens across areas.
- Speed: the slowest ten screens get their own fix.
- Rehearse four journeys end to end on the rig: a new athlete alone; a coached client; the coach; a player who only
  wants the games.

**Gate:** the scorecard reads 184 of 184, or every screen that does not pass is named with the reason and what it
needs (an owner decision, a table, another lane). All four journeys complete with no dead end. **Owner gets:** the
scorecard before → after for every screen, and a 15-minute phone check.

## What this pass will not do

- No new features beyond what a gate needs. Ideas that come up are listed for the owner, not built.
- No prices, legal, policy or age-gate changes. No payment switch-on.
- No new exercise animations (listed for the animation lane) and no gameplay changes (the game lanes).
- No change to how a measurement is calculated without the fixture numbers before and after.

## Owner calls before it starts (recommendation first)

1. **Approve this plan** as written, or change the order. *Recommend:* approve.
2. **Run the pending-tables command.** *Recommend:* now, so phase 1 scores the real screens and not the dark ones.
3. **Booking setup.** *Recommend:* before phase 5.
4. **The three speed budgets in check 3** (2.5 s, 0.02, 200 ms). *Recommend:* keep them; phase 1 will show how far off we are.
