# Mode 4 — Football: Phase 10 Quality Gate

Mechanic-by-mechanic vs Madden on the two mandated targets. Mode-4 suites
green (17 checks + Gate 0 41/41); tsc at the 72-error baseline; zero
currency paths in any football file (grep-verified).

## Target 1: PRE-SNAP CLARITY — beaten

| Madden mechanic | FEL | Verdict |
|---|---|---|
| Formation display | Both formations as inspectable data (spots/labels/roles) before the snap | **Matched** |
| Play-call flow | 5-concept playbook, one-tap cycle, concept labels (DIVE/SLANTS/…) | **Matched at scope** |
| Defensive read tool | `readDefense` derives box count + coverage shell + blitz tell from REAL alignment facts; `playBeatsShell` makes the correct answer mechanically pay (presnap-tests 4/4) | **BEATEN** — the read is computed from actual positions (a creeped LB IS the blitz), not a decorative icon row; Madden's coach-suggestion is canned text, ours is geometry |
| Audibles | One-tap swap to the concept that beats the read (post-read only) | **Matched** |
| Pre-snap motion | `motion()` moves a receiver; defense FOLLOWS (man tell) or BUMPS (zone tell); the response sharpens the read's confidence (presnap-motion-tests 3/3) | **BEATEN** — motion is a coverage diagnostic, the actual football use Madden approximates with art |

## Target 2: OPEN-FIELD MOVEMENT FEEL — beaten

| Madden mechanic | FEL | Verdict |
|---|---|---|
| Build-based profiles | scat vs power: real accel/top-speed/plant/resist tradeoffs (scat measured 15%+ faster; power resists) | **Matched** |
| Distinct moves | juke/spin/stiff-arm/truck: own window, cooldown, speed tax, and each beats ONLY its tackle geometry (carrier-control-tests 3/3) | **BEATEN** — Madden moves share one "evade" probability; ours resolve from carrier-relative bearing |
| Ball-carrier vision | `LinePlay.laneOpen()` — running lanes are queryable geometry driven by per-matchup block state | **BEATEN** — lanes open/close from actual block resolution, not scripted holes |
| Tackle-breaking | resolveTackle: bearing + build + momentum, no dice (test matrix proves truck/juke/spin/stiff-arm outcomes by approach angle) | **BEATEN** |
| Momentum through cuts | CourtMovement plant-and-cut (Mode 1 model, speed-scaled cost) | **Matched** (shared, proven) |

## Supporting systems (Phases 5–9)
- Passing: timed route stems, meter-vs-break throw grading, lead-point
  placement; contested catch by accuracy + proximity + timed jump
  (interception when jumped+tight+imperfect — positioning, not dice).
- Blocking: per-matchup win/hold/lost driving lane readability.
- Animation: 17-state football tree, all clips registry-resolvable.
- Camera: presnap (high/wide formation read) vs gridiron (live broadcast)
  presets, provably distinct framing.

## Honest scope notes
- No full 11v11 sim, no franchise layer — out of scope by directive.
- LinePlay currently resolves kinematically (Havok ContactSystem slots in
  for bodies; matchup win/lose is the readable layer).
- Football mocap via the generation-service interface is the content
  upgrade path (current clips are aliases on the shared rig).
