# Mode 3 — Board Sports: Phase 20 Quality Gate

Mechanic-by-mechanic per discipline. 20 suites green (234 checks total
incl. the Mode 1/2 battery); tsc at the 72-error pre-existing baseline.

## Shared core (one core, no hidden forks)

- BoardPhysics (4/4): slope response, balance model, BoardSync prop
  contract (detachment throws — board/rider desync is unshippable).
- BoardMovement (5/5): push/pump momentum economy (flat-pump asymptote,
  slope over-cruise), carve hold vs scrub, stance switch tax.
- FlickStick (5/5): Skate 3 gesture vocabulary — recorded traces map to
  exactly one trick; holds are grabs; no mash-random.
- AirControl + LandingSystem (6/6): spin momentum with damping, axis
  control, grab holds; landing error monotonic in residual rotation +
  slope + speed; sketchy save window is a skill check (save AND fail both
  reachable by input, zero dice).
- ComboChain (4/4): Nth-trick-pays-Nx, bank vs burn risk loop,
  MomentumBus escalations.
- GrindManual (5/5): tuned balance channel (hands-off slips ~1.5s,
  skilled low-speed sustains, fast is a fight), manuals, reverts.
- No discipline forks: skate (SkateRunMode), snow (SnowboardSlalomMode),
  and surf (WaveSim/SurfHeat on the same BoardMovement/AirControl) all
  consume the same core modules; discipline differences live in tunings
  (SKATE/SNOW/SURF) and terrain modules, not parallel logic.

## Skateboarding vs Skate 3 + THPS

| Mechanic | FEL | Verdict |
|---|---|---|
| Flick-stick input | Gesture vocabulary with hysteresis + budget + longest-match; face buttons remain as accessibility fallback | **Exceeded in precision** (tested identity per gesture) |
| Physics-driven landings | Landing error = rotation residue + slope + speed; sketchy window is a counter-stick skill check | **Exceeded** (Skate 3 landings are animation-canned; ours derive from the trick state) |
| Manual/revert linking | BalanceChannel manuals + revert-on-transition into manuals | **Matched** |
| Momentum management | Push cooldown pacing, pump asymptote on flat, carve hold vs scrub | **Matched** |
| Combo flow + banking | Nx multiplier, bank-vs-burn, best-combo tracking | **Matched** |
| Goals/gimmicks | 4-goal set (score/combo/gap/collect) + patrolling grind rail gimmick | **Matched at scope** |

## Snowboarding vs SSX + Shaun White

| Mechanic | FEL | Verdict |
|---|---|---|
| Boost meter | Tricks fill, R1 spends on a real burst (drains to zero) | **Matched** |
| Big-air spectacle | AirControl spin momentum + amplitude-scaled pipe airs | **Matched at scope** |
| Carve weight | SNOW_TUNING carve hold + slope energy; grounded even at speed | **Matched** |
| Halfpipe | HalfpipeRun: wall pumping builds amplitude, value scales with air | **Matched** |
| Run structure | CheckpointTracker: ordered gates, branch high/low line with different payouts | **Matched** |
| Hazards | Rockfall band (timed, rolling, airborne clears) + existing yeti/rocks | **Matched** |

## Surfing vs Kelly Slater Pro Surfer

| Mechanic | FEL | Verdict |
|---|---|---|
| Wave selection/positioning | PaddleSim pace-match inside the takeoff window (slow/early/late all fail) | **Matched** |
| Pumping for speed | Wave face steepness drives the shared momentum economy | **Matched** |
| Barrel riding | BarrelRide: power-section entry, tube time banks on exit, overstay wipes the unbanked points | **Exceeded in stakes** (KS banks passively; ours is a live risk decision) |
| Aerials | Shared FlickStick/AirControl off the lip | **Matched** |
| Judged heats | scoreWave (selection + maneuvers + tube) into HeatScore best-N; JudgePanel reveal pattern shared | **Matched** |
| Evolving wave | WaveLifecycle: swell→forming→breaking→dissipated, traveling power section | **Matched at scope** (1D line model vs full 3D bathymetry) |

## Architecture / non-negotiables
- Server-authoritative: CompetitionBridge posts earned scores to the
  existing competition pipeline; client never computes rewards (tested);
  no coin/shard paths in any board file (grep-verified).
- Rig/loading unchanged: canonical rig via Gate 0 (35/35 incl. board
  clips), container-based loading everywhere.
- Leaderboard payouts rely on the server competition feature flag being
  enabled — offline practice degrades honestly (flagged in bridge).

## Follow-ups
- Full 3D wave bathymetry (current: parametric line model).
- Live head-to-head board sessions need the same transport seam as M1/M2.
- Real board-sport mocap via the generation-service interface.
