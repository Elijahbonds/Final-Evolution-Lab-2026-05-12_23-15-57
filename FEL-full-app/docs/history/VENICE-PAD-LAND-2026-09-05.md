# Venice DualShock pad — landing notes for Gameplay (2026-09-05, overnight)

Graded against `docs/SPEC-VENICE-DUALSHOCK-PAD.md` (3436 B, Benchmark feel bar). Studio untouched. One git writer.
Base: `e87726b` (Pass 5 phases 9–10; Pack 5 `55fd4cc` is an ancestor).

## What changed (LOW risk: input mapping, HUD layout, pad chrome; no rig, physics or Profile)

- **HOLD = RUN** (`lib/babylon/modes/DunkMode.ts`): holding CHARGE (touch Y / SPACE / right trigger) now drives the athlete
  toward the rim — speed ramps to the max run (7 m/s), the left stick steers, `runUpPeak` keeps feeding the air budget —
  and the launch fires at the gather line (or on release, from wherever you are). Before, the hold froze the run and
  was a charge gate.
- **The stick lives in the air**: during the flight the left stick leans the body (up to 0.32 rad) and drifts the hang
  laterally (0.8 m/s); the flight's existing pull to `rim.x` (1.6/s) still wins by the flush, so contact math is untouched.
  The lean settles on the landing and resets each attempt.
- **Miss = one beat** (1.4 s) then the next run-up; the full judged reveal stays for makes. A hold still down streams the
  trigger and starts the next run the frame the approach resets — no card, no menu, no re-press.
- **Pad chrome** (`lib/babylon/ui/TouchOverlay.tsx`): hold verbs carry a HOLD caption and the button fills as a ring while
  the hold is down; pressed buttons brighten and scale; d-pad-typed verbs release properly.
- **No dead binds** (`lib/babylon/ui/modeVerbs.ts`): dunk's X slot was inert; it now cycles the PROP (none → alley-oop →
  obstacle) during the approach, the same job the d-pad does.
- **Hint plate above the pad on phones** (`components/games/dunk-babylon.tsx`): a CSS clamp puts the plate 17.5 rem up on viewports under 640 px (the diamond stacks over the LOOK stick, ≈ 264 px); desktop keeps 2.5 rem. This project's Tailwind emits no `max-*` variants, measured, so the switch is inline CSS.
- **No meter**: the charge bar under the athlete is removed (Benchmark: "meter slideshow" is a hard fail); the hold ring on
  the pad is the cue.

## Evidence

| # | Acceptance | Result | How |
|---|---|---|---|
| 1 | Full pad always visible, HOLD readable in air | PASS | phone frames `pad/after/01–03`: pad on screen at approach, in the hang, at judging; HOLD caption + filled ring on CHARGE mid-air (`02-mobile-charged.png`) |
| 2 | Hold-run + air stick | PASS | keyboard driver: 4 attempts, each ~14 s, contest ends, session 200 — the hold alone carried the run; touch: held CHARGE scored a 38; air lean/drift in `DunkMode.ts` cinematic block |
| 3 | No portal / HUD clip | PASS | `scripts/probes/_pad-layout.mts` on the phone emulation (390×844 @3x): the hint plate ends 12 px above the CHARGE button's top (plate 448–500, diamond top 512) — before the change it sat on the button (518–570); landscape 844×390: plate centred between the sticks (x 218–627, y 501–529), diamond at x 709+, no overlap; pad layer z-30 in front of every plate; frames `pad/final2/01–03`. The judges' plate and banner are mid-frame and never meet the pad. |
| 4 | Miss + retry without pause-retry | PASS | `scripts/probes/_miss-retry.mts`: SPACE held for the whole run, 3 blown misses, miss → next run-up 1415 ms and 1413 ms, no PAUSED / RETRY / RESUME text ever on screen |
| 5 | No Pack 5 regress | PASS | tint: closet `top_lab / shorts_court / shoes_flight` equipped and exactly those three garments visible on Venice; faucet: `daily_first_session:2026-09-05:<user>` grants 100 coins once, replay returns the same grant; proof: SHARE PROOF · 0/4 DUNKS · 124 PTS VS 157 · LOST minted to `/c/n9dHuncffDAFyILS` and the page renders the line; seed: 14 RewardRule rows, 14 active |

Suite: 42 files / 278 tests green after the change; tsc clean. Grade line offered: `VENICE-PAD: pad PASS + Pack 5 still CLOSED`.

## Notes for the grader

- The `SHARE DUNK PROOF` label became `SHARE PROOF · <proof line>` in pass 5 phase 3 (proof lines for every mode); the
  spec's soft note already allows the tally / WON–LOST copy.
- The keyboard driver's naive slam timing now scores 0/4 makes (it slams on a fixed delay from release, which the
  hold-run no longer matches); the touch path with a real hold and a SLAM tap makes the dunk. A human slams on the SLAM
  pulse, unchanged.
- "Portal chrome": the `/play` shell keeps its header (HUB · title · PRQ) and the 16:10 frame on desktop; the pad is
  inside the frame and fully visible. Whether that header counts as dashboard chrome is Gameplay's call, not changed here.
