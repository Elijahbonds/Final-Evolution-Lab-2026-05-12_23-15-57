# Mode 1 — Basketball: Phase 10 Quality Gate

Mechanic-by-mechanic accounting vs both inspirations. Tests cited are
headless suites under scripts/ (all green at this commit).

## vs NBA 2K (live 1v1/3v3)

| 2K mechanic | FEL Mode 1 | Verdict |
|---|---|---|
| Momentum-based movement weight | `CourtMovement`: ramped accel (0.48s to 95% sprint), stronger decel (0.17s stop), speed-scaled plant-and-cut with per-reversal latch (sprint cut keeps ~45% speed, jog ~63%), turn-rate cap (court-movement-tests 8/8) | **Exceeded for scope** — 2K's plant cost is constant; ours scales with speed |
| Contact that respects mass | Real Havok dynamic capsules, momentum exchange on impact, box-out brace (braced displacement 0.51m vs 1.47m), zero clip-through (contact-system-tests 10/10) | **Exceeded** — 2K is canned contact animations; ours is solver-true |
| Shot meter with context | ShotMeter (contest narrows window/ speeds rise) × classifyShot (layup/floater/jumper/fadeaway) × momentum multiplier; jumpshot clip paced so the contact frame IS the green center (ball-handling-tests 14/14) | **Matched** — animation-synced release is something 2K only approximates visually |
| Animation blend responsiveness | 16-state basketball blend tree, deduped transitions, all fades 0.06–0.2s, one-shots never loop; foot-plant IK locks cuts (basketball-anim-tests 6/6) | **Matched** — constrained by the shared 9-clip rig until sport mocap lands (content workstream, not code) |
| Defensive interplay | Steal pokes in range, timed block window at release, box-out brace (L1/LT), fouls classified by closing speed + airborne context → whistle/ball-back | **Matched at scope** |
| Possession tension | First-to-11/21, make-it-take-it, turbo-gated drives | **Matched at scope** |

## vs NBA Live 07/08 (Dunk Contest)

| Live 07/08 mechanic | FEL Mode 1 | Verdict |
|---|---|---|
| Trick-input combos | GestureRecognizer: right-stick sequences (↓↑ windmill, ←→ 360, ↓← eastbay, ↑↓ tomahawk, →←→ between-the-legs), longest-match wins, 900ms expiry; two mid-air = combo ×1.35 (dunk-system-tests 11/11) | **Exceeded** — Live had trick modifiers; we have true gesture chains |
| In-air control window | DunkFlight: airtime budgeted by approach speed + style tier; every trick spends window and tightens the slam | **Exceeded** — Live's window was fixed; ours is an economy |
| Judge meter tension | Shared JudgePanel: 3 persona lenses (style/execution/difficulty weights), STAGED reveal — confer → Silk → Doc → drum beat → Prime → total over ~4.6s (judge-panel-tests 5/5) | **Exceeded** — Live flashed scores; ours is a paced TV reveal |
| Crowd escalation | CrowdEnergy (eruption/approval/tepid/hush) drives ambient bed level live (SoundKit.setAmbientLevel); blown dunks hush the building instantly | **Exceeded** |
| Score-reveal payoff | Staged cards + camera pulse by band + confetti/haptics + replay before judging | **Exceeded** |
| Round structure | 2 rounds × 2 dunks, THE NEED pressure number, chain multiplier, variety memory, rival turns | **Matched** (kept from v5, already strong) |

## Architecture / non-negotiables check
- Rig/animation: canonical unprefixed Mixamo names enforced at import (Gate 0 rigNormalize + 23/23 verification).
- Loading: LoadAssetContainerAsync + instantiateModelsToScene everywhere; no MergeMeshes.
- Economy: zero currency logic in any basketball file (grep-verified); no client minting paths exist to bypass. Contest rewards remain a server-side follow-up.
- Shared systems: JudgePanel (Judge/Scoring) and MomentumBus (Game-Breaker) extracted and shared; CameraDirector extended, not forked.
- tsc: 72 pre-existing errors in unrelated app/ pages — identical count to baseline; zero introduced.

## Known follow-ups (logged, not blocking)
- Basketball clip aliases point at the karate-rig base set; commissioning sport-specific mocap via the generation-service interface is a content workstream.
- 3v3 contact still uses the kinematic pair solver (1v1 has full Havok bodies); promote ContactSystem to 3v3 in the next iteration.
- Networked head-to-head intentionally out of scope (PlayerSlot's NetworkInputSource is the documented seam).
