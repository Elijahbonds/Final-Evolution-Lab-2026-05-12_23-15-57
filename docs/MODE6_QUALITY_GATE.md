# Mode 6 — Baseball: Phase 10 Quality Gate

Mechanic-by-mechanic vs MLB The Show on the two mandated targets. Mode-6
suites green (17 checks + Gate 0 41/41); tsc at the 72 baseline; zero
currency paths in any baseball file (grep-verified).

## Target 1: HITTING-TIMING FEEDBACK — beaten

| The Show mechanic | FEL | Verdict |
|---|---|---|
| Swing-timing feel | gradeTiming against a per-swing-type window; the grade is returned with the exact offset band | **Matched** |
| Contact-quality communication | Every swing returns a SwingReport: timing grade, PCI distance in meters, outcome, and a plain-language WHY ("A tick early, off the end/handle → WEAK") — batting-tests prove every outcome is explained | **BEATEN** — The Show shows a label ("late"); FEL tells you why the ball did what it did |
| PCI aiming | PCI reticle with clamped zone aiming; contact quality from PCI-ball distance × timing | **Matched** |
| Outcome clarity | whiff/foul/weak/solid/barrel all EMERGE from timing+PCI+pitch (no hit/miss dice) | **BEATEN** |
| Tiered assistance | contact vs power swing = window size vs exit-velo ceiling (the assistance IS the swing type) | **Matched at scope** |

## Target 2: PITCH-READ CLARITY — beaten

| The Show mechanic | FEL | Verdict |
|---|---|---|
| Trajectory tells | readPitch: velo-only blind guess at release → spin-axis family read → late-break truth; never confidently wrong at ANY flight point (tested across all five pitches) | **BEATEN** — the read is a model of what a batter can actually see, provably honest |
| Distinct pitch signatures | five pitches with distinct velo + Magnus spin + release point + read window; landing spots physically distinct through real flight | **BEATEN** |
| Location targeting | zone clamp + intentional chase outside; a yanked release moves the release point for real | **Matched** |
| Count-based strategy | honest strike zone (isStrike consistent forever) + chase-pitch aiming; batter's eye reads the count's implications | **Matched at scope** |
| Zone consistency | one ZONE constant, same spot = same call, 50× verified | **BEATEN** (no umpire variance lottery) |

## Supporting systems (Phases 6–9)
- Fielding: route-to-ball leads the runner; catch geometry (routine/
  diving/off-wall/no-play); throws by arm+balance; force/tag timing.
- Baserunning: steals resolve runner jump×speed vs catcher pop+flight;
  tag-ups weigh run-time vs throw-back-depth — real risk, no fixed odds.
- Animation: 13-state tree, all clips resolvable.
- Cameras: behind-plate duel vs high/wide field presets (distinct reads).

## Honest scope notes
- No full 9-inning game engine yet (the at-bat/field/run cores are
  mode-ready; a full game mode is the next integration pass).
- Baseball mocap via the generation-service interface is the content path.
