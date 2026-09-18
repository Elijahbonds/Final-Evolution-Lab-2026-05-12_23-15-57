# Mode 6 — Baseball: Phase 1 Audit & Benchmark

Gate 0 holds (41/41; baseball clips — bat stance, swing, homer trot,
keeper dives reused for fielding — all resolver-backed).

## 1. What exists today

- `DerbyMode` (in precisionModes.ts) — home-run derby: pitcher tosses
  lobbed balls, `swingQuality(ballZ, …)` timing check, Flight arc on
  contact. One pitch "type" (a flat lob), no zone, no reads, no fielding.
- `BallPhysics`/`Flight` — kinematic arcs. SoccerBall (Mode 5) is the
  real ball with mass+Magnus — baseball reuses that with a diamond tune.
- No pitch types, no PCI/zone aiming, no swing types, no contact-quality
  feedback beyond a number, no fielding/baserunning.
- Reusable: CourtMovement, MomentumBus, JudgePanel, CameraDirector
  ('swing' fixed preset exists), SoundKit.

## 2. Benchmark: MLB The Show — hitting-timing feedback (beat it)

1. **Swing-timing feel** — the window is learnable; the player always
   knows their timing (early/late/perfect) immediately.
2. **Contact-quality communication** — foul/weak/solid/barrel explained by
   timing + location, every swing.
3. **PCI aiming** — plate-coverage reticle the player aims; location and
   timing both matter.
4. **Outcome clarity** — whiff/foul/hit read instantly, with the WHY.
5. **Tiered assistance** — readable at casual, pure at sim.

## 3. Benchmark: MLB The Show — pitch-read clarity (beat it)

1. **Trajectory tells** — release point + spin/velocity cues readable
   before commitment.
2. **Distinct pitch signatures** — fastball/curve/slider/changeup/sinker
   look AND fly differently (velocity + break + release).
3. **Location targeting** — the pitcher paints corners (or misses).
4. **Count-based strategy** — the batter's eye adjusts with the count.
5. **Consistent strike zone** — honest zone, consistent calls.

## 4. Gap list

| Mechanic | Current | Gap |
|---|---|---|
| Pitch types | one lob | 5 pitches with distinct velo/break/release (P2) |
| Pitch-read window | none | release-point + early-trajectory read model (P3) |
| PCI aiming | none | zone reticle (P4) |
| Swing types | none | contact vs power tradeoffs (P4) |
| Contact physics | swingQuality z-check | exit velo/launch/spin from timing+PCI+pitch (P5) |
| Outcome feedback | number only | explained outcome (why) every swing (P5) |
| Fielding | none | route/catch/throw/outs (P6) |
| Baserunning | none | leads/steals/tags (P7) |
