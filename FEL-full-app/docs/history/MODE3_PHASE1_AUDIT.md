# Mode 3 — Board Sports: Phase 1 Audit & Benchmark

Gate 0: rig verified for combat/basketball; board-specific gate addition
needed (board as attached prop — boardCore already parents the board mesh
to char.root and animates the rider; add a Gate 0 section proving
board_ride_idle/board_grind/board_grab play with motion — trivially true
via aliases, verified in Phase 2 test run).

## 1. What exists today (all suites green: 98 checks)

### Shared base
- `boardCore.ts` — buildRig (rider + board mesh parented to root, NO
  desync by construction), TrickMachine (TRICKS table: ollie/kickflip/
  heelflip/360/grab; spin accumulation; clean/bail landing by turns
  completed; combo multiplier + banking; grind banking).
- `GroundRide.ts` — Rider: carve physics, pump accel, drag, ground-snap
  raycast + hard floor, grind-line attachment (rails + cable), air state.
- `rideWorlds.ts` (343) — buildSlopeRun / buildSurfBreak / park worlds
  (rails, kickers, cable, buoys, funnel/barrel shell).
- Modes: SkateRunMode (113), SnowboardSlalomMode (240 — rocks, rails,
  lift grind, yeti chase, gates), SurfBreakMode (192 — pocket flow,
  cutbacks, grabs, breathing barrel on 18s cycle, buoys), BigAirMode.
- Mode 1+2 systems available: MomentumBus, JudgePanel, CameraDirector
  ('board' preset + pulse), SoundKit ambient levels, FootPlant IK.

### NOT present (gaps driving phases)
- **No flick-stick input** — tricks are button presses (TRICKS by key),
  not analog gestures. (Phase 4)
- **No landing-angle resolution** — clean/bail is "did the spin finish",
  not board-vs-ground angle; no sketchy/save window. (Phase 6)
- **No manuals/reverts** — combo chains only through airs + grinds. (Phase 9)
- **Grind has no balance meter** — attachment is automatic until dismount. (Phase 9)
- **No boost meter** (snowboard); descent is gate-racing, no checkpoints/
  branching lines/halfpipe. (Phases 12–13)
- **Wave is a moving pocket + barrel shell, but no paddle/positioning/
  pop-up phase** — rider starts standing. (Phase 14)
- **No judged surf heat** — score trickle, no JudgePanel heat. (Phase 16)
- **No Havok in board physics** — Rider is kinematic raycast (deliberate,
  cheap); board-sport physics stay kinematic-with-weight by design
  (boards are not player-vs-player contact). No physics gap to close.
- **No leaderboard/contest server wiring** for board scores. (Phase 19)

## 2. Benchmark: Skate 3 + THPS (Skateboarding)

1. **Flick-stick trick input** — stick gestures (flick down-up = ollie,
   left-down = kickflip…) map 1:1 to tricks; muscle-memory vocabulary.
2. **Physics-driven landings** — clean vs sketchy vs bail from board angle
   + speed at contact, never dice.
3. **Manual/revert linking** — ground balance tricks keep combos alive
   between features.
4. **Momentum management** — push/pump builds speed, carving bleeds or
   holds it; vert pumping converts rhythm into amplitude.
5. **Combo flow with banking** — risk it all vs bank the points (THPS).
6. **Level gimmicks/goals** — gaps, collectibles, score targets, a
   park-as-puzzle gimmick.

## 3. Benchmark: SSX + Shaun White (Snowboarding)

1. **Boost meter** — tricks fill it, boost spends it on speed bursts.
2. **Big-air spectacle** — huge amplitude jumps with slow readable spins.
3. **Carve weight** — grounded, edgey turns (Shaun White), not floaty.
4. **Halfpipe execution** — pump for amplitude, spin/flip scoring.
5. **Run structure** — checkpoints, branching high/low lines.
6. **Environmental hazards** — rockfall/obstacle pressure mid-run.

## 4. Benchmark: Kelly Slater Pro Surfer (Surfing)

1. **Wave selection/positioning** — paddle phase, reading the forming wave,
   committing at the right moment.
2. **Pumping/carving for speed** — speed comes from the wave face, not a
   throttle.
3. **Barrel riding** — tube time as the high-risk high-reward state with
   its own camera.
4. **Aerials off the lip** — air tricks launched from the wave's power
   section.
5. **Judged heats** — wave choice + maneuver difficulty + tube time scored
   by judges (JudgePanel).
6. **Wave that evolves** — the face steepens and breaks under you.

## 5. Gap list per discipline

**Skate:** flick-stick input (P4), angle-based landings + save window (P6),
manuals/reverts (P9), grind balance meter (P9), goals/gimmick (P11).
Terrain + grinding + combos exist.

**Snowboard:** boost meter (P12), checkpoint/branch run structure (P13),
halfpipe amplitude area (P13), hazard (P13 — yeti exists as one, add
rockfall). Carve weight tune on existing Rider (P12).

**Surf:** paddle/positioning/pop-up (P14), wave-face speed economy (P15),
lip aerials via shared trick system (P16), judged heat via JudgePanel
(P16). Barrel exists — add camera treatment + exit-timing risk (P16/17).

**Shared:** flick-stick vocabulary (P4), landing/balance/bail (P6),
combo banking polish + MomentumBus hooks (P7), board anim tree (P8),
per-discipline cameras/audio (P17/18), server-authoritative progression +
leaderboard (P19).
