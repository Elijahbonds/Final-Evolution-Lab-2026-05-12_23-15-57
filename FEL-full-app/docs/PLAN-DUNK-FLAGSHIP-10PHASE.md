# Dunk flagship — the ten-phase improvement pass (lane/dunk-flagship)

**Owner, 2026-10-27:** *"Dunk game mode is the flagship — needs to be improved still … smoother movement, better lobs."* Then:
*"10 phase improvement pass focused on the dunk mode."* The order below is the owner's order of felt impact. Each phase ships on
its own: commit, push, merge `origin/lane/finish-release`, phase report, PR, green, then the next phase on the same branch.

Instrument: `scripts/probes/_dunk-flagship-probe.mts` on the esbuild + Playwright rig, on the virtual clock (1 frame = 1/60 s of
game time). Method, rig findings and the running numbers are in `docs/DUNK-FLAGSHIP.md`. Shots and frame strips go in the lane's
scratchpad (`round9/dunk-flagship/shots/`), and contact sheets are built with `progress-tools/sheet.cjs`.

**Standing rules for every phase:** a changed feel number is flagged **TUNED (from → to, why)**, or it becomes a feel-panel knob
with its default unchanged. Knobs never apply in ranked, staked or paid play (the panel enforces this). The shared hoops files
(`OneVOneMode`, `ThreeVThreeMode`, `BasketballCore`, HandleSystem, `Dribble`, `CourtMovement`) are not edited: a needed change is
written up here as a diff. Before/after numbers are taken on the rig for every change. A guard that goes red is a finding.

## Baseline (origin/lane/finish-release 36593d3a; plain one-foot run, stick walk → RT run → take-off at the line, slam on the beat)

| Measure | Baseline |
|---|---|
| Root speed into push 1-2 | **7.0 → 5.98 m/s in one frame** (the gather fit clamps its rate) |
| Take-off frame | **2.1 → 4.2 → 2.2 m/s** (the run's last step and the plant's first step in one frame) |
| Foot skate on the run-up (carrying foot, ≥ 2.5 m/s) | **1.11 m/s** (sprint 1.66): the feet cycled faster than the ground (the loop paced at 3.6 ÷ 1.1 = 3.27 m/s) |
| Hips one-frame pops / bone pops before take-off | 12 / 31 (arms 21 of the 31) |
| Launch → feet off · hang (feet off → on) · hips' rise | 100 ms · 2150 ms · 1.94 m |
| Alley-oop | the passer throws **after** the take-off: a 0.35 s pass from 3.5 m (~10 m/s; top 0.20 m over the catch) |
| Lob read | nothing marks where a lob meets the hand |
| Slam beat | every make: 70 ms hit-stop, shake 0.12 for 140 ms, whatever the slam |
| First runway | the Venice storefronts stood between the camera and the dunker while the dressing loaded |
| Camera through a make | 1 cut (the rim cut at 0.92 s) before the replay |

## The phases

### Phase 1 — Smooth run-up (movement I)
- **Goal:** the run carries its speed into push 1-2 and through the take-off frame; the run-up's feet stay planted.
- **Exit gates:**
  - no one-frame root speed change over 0.6 m/s before the plant (baseline 1.02 and 2.07);
  - foot skate on the carrying foot at run speed (≥ 2.5 m/s; the lower foot within 3 cm of the floor, weighted) below baseline in the mean of the reps (baseline 1.11 m/s; the first plan's span measure counted a swing foot skimming the floor as a plant and was dropped);
  - pre-take-off bone pops not above baseline (31);
  - frame strip of the run-up from behind and from the side.
- **Files:** `modes/DunkMode.ts`, `core/DunkGatherRun.ts`, `core/DunkFlagship.ts`, `lib/feel-panel/knobs.ts` (+ test, `FEEL-PANEL.md`); shared, flagged: `nexus/veniceBoardwalk.ts` (the storefronts hidden until placed).
- **Risk:** MEDIUM (approach timing). The run-up's leg pace stays as shipped (a re-pace to 3.95 m/s measured no overall skate gain); it is a knob, `dunk.runwayStrideScale` (default 1 = shipped).
- **Owner feel-check:** hold RUN from a walk and watch the feet from behind: no moonwalk, no brake-pop into the last two steps, no hitch on the take-off frame. The first runway of the night shows the dunker, not a taco stand.

### Phase 2 — Take-off and landing flow (movement II)
- **Goal:** the jump answers the press at once, leaves cleanly, and lands into the next beat without a pop.
- **Exit gates:**
  - press (A on the run, RT let go) → feet off ≤ 150 ms on the rig (measured per path);
  - no root height step over 2 cm at the take-off frame (baseline 3 cm);
  - land → celebrate blend without a hard cut, hips pops on landing ≤ baseline;
  - frame strip of the take-off and the landing.
- **Files:** `modes/DunkMode.ts`, `core/DunkLegs.ts` / `dunkLandAbsorb.ts` if needed.
- **Risk:** MEDIUM.
- **Owner feel-check:** tap A on the run from three distances; let RT go at the line; watch the plant, the push and the landing crouch.

### Phase 3 — The alley-oop is a lob (lobs I)
- **Goal:** the passer lobs it on your run so it hangs over the rim and you go and meet it; you can see where.
- **Exit gates:**
  - oop flight ≥ 0.9 s with its top ≥ 0.5 m over the catch (baseline 0.35 s, 0.20 m);
  - CAUGHT on 100 % of runs across varied run timings (6 runs: standing start, walk-in, early and late RT), and the catch's clip time within ±0.05 of the beat;
  - the catch ring and the ball's shadow shown for the whole lob and gone after;
  - a frame strip of the lob from the run-up camera.
- **Files:** `modes/DunkMode.ts`, `core/DunkFlagship.ts` (`OOP_LOB_FLIGHT_SEC`, new, knob `dunk.oopLobFlightSec`), new `visual/LobMarker.ts`.
- **Risk:** MEDIUM (feel).
- **Owner feel-check:** pick ALLEY-OOP, run in at different paces: the pass should go up as you run, hang, and land in your hand at the top. The ring says where.

### Phase 4 — Self-lob, off the glass, the bounce (lobs II)
- **Goal:** every self-thrown lob is catchable from every sensible run, arrives softly, and stays in frame.
- **Exit gates:**
  - catch rate ≥ 95 % per lob type across a run-timing sweep (self-lob standing and on the run, off-glass, bounce, the oop variants);
  - ball speed into the hand ≤ baseline;
  - the ball is in the camera's frame for ≥ 90 % of its flight;
  - a whiff always says why (no silent LOST).
- **Files:** `modes/DunkMode.ts`, `core/DunkLob.ts`.
- **Risk:** MEDIUM.
- **Owner feel-check:** Y standing then run; Y on the run; off the glass; bounce: each from a slow and a fast run.

### Phase 5 — Dunk feel: hang, the iron, your real jump
- **Goal:** the slam hits as hard as it was; the hang reads; your real jump drives the flight.
- **Exit gates:**
  - the slam beat scales with the slam (ordinary make unchanged at 70 ms / 0.12; a perfect one 100 ms / 0.18; **TUNED**, knobs `dunk.slamHitStopBigMs`, `dunk.slamShakeBig`);
  - the rim, net and glass react on every make (HoopJuice finds the hoop's meshes: > 0);
  - the body path's jump maps to the flight on the rig with recorded jumps (a 30 / 50 / 70 cm rise → the trigger and the apex, monotonic), and only verified adult jumps can personalise it (feel knob, off by default).
- **Files:** `modes/DunkMode.ts`, `core/DunkFlagship.ts`, `lib/move/dunkBody.ts` (read-only unless the mapping needs a knob), `visual/HoopJuice.ts` (only if the meshes are not found).
- **Risk:** MEDIUM.
- **Owner feel-check:** a sloppy slam and a perfect one back to back; a rim hang; the body path with a small and a big real jump.

### Phase 6 — More distinct dunks (dunks I)
- **Goal:** every named air trick reads as itself.
- **Exit gates:**
  - all 16 air tricks fire on the rig, GATE 0 verified first;
  - the nearest-neighbour body-path distance is ≥ the median for every trick, or the closest pairs are fixed and re-measured;
  - a frame-strip sheet of all 16 from the side.
- **Files:** `anim/authored/dunkTricks.ts` (+ tests), `modes/DunkMode.ts`.
- **Risk:** RIG-ADJACENT (animation; GATE 0 first, the owner signs off).
- **Owner feel-check:** throw each trick once from the practice runway (R1).

### Phase 7 — New finishes from the existing sets (dunks II)
- **Goal:** the variety the owner named (360, windmill, between the legs) plus the finishes that exist and are unused in the contest (the reverse dunk, the two-hand power), each with its own name and card.
- **Exit gates:**
  - each new finish passes GATE 0;
  - it fires from its input on the rig and lands on the iron (ball ≤ 0.2 m from the ring centre at contact);
  - it scores through the card with its own name;
  - it is distinct from its nearest neighbour by the phase 6 metric.
- **Files:** `modes/DunkMode.ts`, `core/DunkSystem.ts`, `anim/authored/dunkFinishes.ts` (+ tests).
- **Risk:** RIG-ADJACENT.
- **Owner feel-check:** the new finishes from the practice runway, then in a contest.

### Phase 8 — Presentation: replay, judges, crowd, sound, camera
- **Goal:** a make plays as a broadcast moment: the slow-mo replay from 2–3 angles, the judges' reveal, the crowd and the sound in one beat.
- **Exit gates:**
  - replay angles all frame the dunker and the iron (the subject is in frame on every replay frame);
  - the reveal-to-next-dunk dead time ≤ baseline;
  - no camera cut outside the authored cuts;
  - sound and crowd events land within one frame of the iron;
  - a contact sheet of the show.
- **Files:** `modes/DunkMode.ts`, `scene/DunkReplayCam.ts`, `core/DunkCuts.ts`, `core/JudgePanel.ts`.
- **Risk:** LOW–MEDIUM.
- **Owner feel-check:** land a big one and watch it through to the next runway.

### Phase 9 — Modes and progression
- **Goal:** contest rounds, a friends battle over the existing challenge links, challenges, and unlocks from the verified vertical.
- **Exit gates:**
  - an unlock opens only on a verified adult jump (the device history's `verified`; a teen's or kid's is never read) — tests prove it;
  - the friends battle runs on the existing `?c=` link as the classic staked night (`nightFormat`), the card unchanged (`arena-score-integrity` green);
  - no knob applies in ranked, staked or paid play.
- **Files:** `core/DunkUnlocks.ts`, `core/DunkChallenges.ts`, `modes/DunkMode.ts`, read-only `lib/jump/historyStore.ts`.
- **Risk:** MEDIUM (fairness, youth rules).
- **Owner feel-check:** a verified jump on the phone, then the dunk ladder; send a dunk challenge to a friend.

### Phase 10 — Premium look and UI, and the final re-measure
- **Goal:** the dunk menus and HUD on the premium-ui design system (`lib/design`, `components/ui`) once that lane lands; the whole pass re-measured.
- **Exit gates:**
  - the dunk host renders through the design system's tokens with no layout shift at 390×844;
  - phone-profile frame time ≤ baseline (the esbuild rig's phone profile: 390×844, DPR 3, 4× CPU, `tier=mobile`);
  - every earlier gate re-run green;
  - the owner sign-off list.
- **Files:** `components/games/dunk-babylon.tsx` and its HUD parts (with the hud-hoops / tv-hud owners), `docs/DUNK-FLAGSHIP.md`.
- **Risk:** LOW–MEDIUM.
- **Owner feel-check:** the full night on a phone.
