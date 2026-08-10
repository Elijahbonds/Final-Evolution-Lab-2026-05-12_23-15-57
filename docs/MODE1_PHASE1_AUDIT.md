# Mode 1 — Basketball: Phase 1 Audit & Benchmark

## 1. What exists today (verified by reading code + running suites)

### Live play (1v1 / 3v3)
- `lib/babylon/modes/OneVOneMode.ts` (v3, 430 lines) — two-way 1v1, first to 11,
  make-it-take-it, turbo resource gating dunks, drive dunks + posterize,
  steal/block windows on defense, ankle-breaker stun, shot arcs with live rebounds.
- `lib/babylon/modes/ThreeVThreeMode.ts` (v3, 456 lines) — same systems at 3v3,
  `TeammateBrain` spacing/cuts, pass-to-open-man, assists, 15-pair body collision.
- `lib/babylon/core/BasketballCore.ts` (297 lines) — `DribbleController`,
  `ShotMeter` (timing → perfect/good/early/late/brick), `classifyShot`
  (layup/floater/jumper/fadeaway), `DefenderBrain`, `contestLevel`, `TurboMeter`,
  `ShotArc`, `checkDriveDunk`, `checkBlock`, `resolveBodyCollision`.
- `lib/babylon/core/BallPhysics.ts` — `BallSim` + `arcVelocity`.
- `lib/babylon/core/PlayerSlot.ts` — Local/AI/Agent control sources.
- Camera: `CameraDirector` presets `hoops` (1v1 iso) and `team` (3v3) exist.
- Tests: `court-core-tests.ts` (9 checks) green.

### Dunk Contest
- `lib/babylon/modes/DunkMode.ts` (v5, 567 lines) — approach/charge/cinematic/
  resolve/judging loop; 3 judge personas (Silk/Doc/Prime) with weighted lenses;
  style tiers (power/flashy/sig), props (alley-oop/obstacle), STYLE TAPS
  (risk/reward difficulty pumps), VARIETY MEMORY (repeat combos score lower),
  THE NEED (final-round target score), RIM HANG bonus, chain meter, rim-cam cut,
  `DunkReplayRecorder`, hype meter.
- `lib/babylon/modes/DunkDuelMode.ts` (320 lines) — pass-and-play 2P variant.
- Tests: `dunk-feel-tests.ts` green.

### Shared/juice infrastructure
- `gameFeel.ts` — InputBuffer (140ms), coyote time, hit-stop, screen shake.
- `SoundKit`, `EffectsKit`, `VenueKit`, `CourtSurface`, `DunkReplayCam`.
- Gate 0 animation pipeline (rigNormalize, CharacterAnimator v2, authored clips,
  clip aliases) — verified 23/23.

### NOT present (by these names)
- **No Havok anywhere** — no `havok` in package.json, no `PhysicsBody`/
  `PhysicsAggregate` usage. All contact is `resolveBodyCollision` circle-pushback
  (kinematic, no mass/impulse).
- **No `Game-Breaker`, `InfluenceManager`, `CalibrationManager`, or shared
  `Judge/Scoring` module** — judge logic is copy-pasted between DunkMode and
  DunkDuelMode (same JUDGES trio). "Momentum" is per-mode `hype`/`chain` locals.
- No foot IK anywhere.
- No server ledger calls from any basketball mode (good: nothing to bypass;
  contest rewards simply don't exist client-side yet).

## 2. Benchmark: NBA 2K live play — the 6 mechanics that make it good

1. **Momentum-based movement weight** — acceleration curves, plant-and-cut
   deceleration, no instant direction reversal at speed. *2K's #1 differentiator.*
2. **Contact that respects mass** — driving into a set defender costs speed and
   can stall the drive; box-outs physically displace. Bodies never clip.
3. **Shot meter with context** — release timing modified by contest, distance,
   movement; perfect release is visibly rewarded ("green" flash).
4. **Animation blending responsiveness** — moves interrupt and re-blend in
   ~80-120ms; no pose pops between dribble/drive/gather.
5. **Defensive interplay** — contest timing, steal windows with whiff risk,
   block timing at release.
6. **Possession tension structure** — shot clock / make-it-take-it that keeps
   every exchange meaningful.

## 3. Benchmark: NBA Live 07/08 Dunk Contest — the 6 mechanics

1. **Trick-input combos** — stick gestures/button chains map to distinct dunk
   animations; combos chain mid-air (windmill → 360).
2. **In-air control window** — after launch, a real window to add flair before
   the finish; risk scales with ambition.
3. **Judge meter tension** — scores build anticipation; reveal is staged and
   dramatic, not a number flash.
4. **Crowd escalation** — audio/visual intensity tracks difficulty + success;
   crowd goes quiet on a miss.
5. **Score-reveal payoff** — the dopamine moment: staged card reveals, reaction
   beats, celebration.
6. **Round/attempt structure** — attempts, misses, finals pressure ("need X to win").

## 4. Gap list (what Mode 1 needs to match or beat each)

| Benchmark mechanic | Current state | Gap |
|---|---|---|
| 2K-1 movement weight | TurboMeter + basic accel in modes | No dedicated accel/decel/plant model; movement is mode-local velocity lerp. Needs a real movement controller (Phase 2). |
| 2K-2 contact mass | Circle pushback `resolveBodyCollision` | No Havok, no mass/impulse, no box-out state. Phase 4. |
| 2K-3 shot context | ShotMeter + classifyShot + contestLevel exist | Solid base; needs animation-synced release point + green-release reward feedback. Phase 3. |
| 2K-4 blend responsiveness | Aliased clip plays; crossfade 0.15s | Basketball-specific blend tree (dribble/crossover/drive/gather/release) missing; clips are karate-rig aliases. Phase 5. |
| 2K-5 defense | checkBlock/checkSteal windows exist | Present but untested for feel; needs whiff-risk tuning + contact reactions. Phase 4. |
| 2K-6 possession tension | First-to-11/21 + make-it-take-it | Adequate for scope. |
| DC-1 trick combos | STYLE TAPS (2 taps, +difficulty) | Not real input combos — no gesture sequences mapping to distinct dunk animations mid-air. Phase 6. |
| DC-2 in-air window | SLAM QTE window | Exists; needs widening into a timed trick-input window with chains. Phase 6. |
| DC-3 judge tension | 3 judges, canned lines | Reveal pacing is per-mode; needs staged card-reveal sequencing (shared JudgePanel). Phase 7. |
| DC-4 crowd escalation | `hype` local + SoundKit | Crowd intensity not systemically tied to difficulty/chain; no crowd visual bed. Phase 7/9. |
| DC-5 reveal payoff | Judging phase + replay | Needs beat-timed reveal (drum → card → reaction), camera push-in. Phase 7/8. |
| DC-6 round structure | Rounds + THE NEED | Present; keep. |
| Cross-cutting | Judge logic duplicated in DunkMode/DunkDuelMode | Extract shared `JudgePanel` module (Phase 7). NOTE: named systems (Game-Breaker/InfluenceManager) don't exist — hype/momentum lives per-mode; will extract a shared `MomentumBus` in Phase 6 rather than invent a parallel system. |
| Physics | No Havok dependency | Phase 2/4 introduce Havok for player bodies + ball. |
| Foot IK | Absent | Phase 5 (court is flat — IK scope = plant/cut contact lock). |
| Economy | No client currency paths in basketball | Keep it that way; contest rewards stay server-side (nothing to wire in v1). |
