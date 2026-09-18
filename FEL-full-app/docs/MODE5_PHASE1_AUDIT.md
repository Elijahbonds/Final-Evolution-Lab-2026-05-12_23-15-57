# Mode 5 — Soccer: Phase 1 Audit & Benchmark

Gate 0 holds (41/41; soccer clips alias through the shared rig — kick/
dive/celebrate family all resolver-backed).

## 1. What exists today

- `precisionModes.ts` — PenaltyMode (512 lines shared file): keeper AI
  guess, feint mechanics, aim + power on the BallSim projectile. It's a
  penalty shootout, not open play.
- `BallPhysics.ts` — BallSim: gravity, bounce with restitution, swept-
  sphere collision (no tunneling), deflect(normal). **Kinematic, no mass,
  no spin/Magnus, no surface friction model.**
- `components/games/soccer-game.tsx` — legacy 2D/three-era game shell
  (superseded by Babylon modes).
- No open-play soccer mode, no off-ball AI, no first-touch, no passing
  weight model, no offside, no tackling.
- Reusable: CourtMovement, ContactSystem, MomentumBus, JudgePanel,
  CameraDirector, PassFlight (basketball — ground/bounce pass concept
  exists but is basketball-shaped).

## 2. Benchmark: EA FC shot/pass weight (beat at FEL scope)

1. **Ball mass + spin** — Magnus curve on struck balls, bounce and roll
   with grass friction; the ball must SIMULATE, not rail.
2. **Pass power scaling** — hold-to-charge mapped to distance; a 5-yard
   push and a 40-yard switch are visibly different physical events.
3. **Weighted first touch** — control quality from pass pace + timing +
   body position; a hard ball into a tight space can be knocked loose.
4. **Shot power/accuracy tradeoff** — harder = less placement.
5. **Finesse vs power** — genuinely different mechanics (curl vs pace),
   not a cosmetic swap.
6. **Deflection/rebound physics** — keeper parries, post-outs, defender
   blocks emerge from physics, never scripted outcomes.

## 3. Benchmark: EA FC off-ball AI (beat at FEL scope)

1. **Supporting runs** — teammates attack space relative to the ball,
   not formation waypoints.
2. **Spacing/width** — shape holds width; nobody bunches on the ball.
3. **Defensive shape/pressing** — press triggers vs hold by game state.
4. **Near/far-post runs on crosses** — crossing produces box runs.
5. **Passing-lane awareness** — AI runs open lanes; defenders track them.

## 4. Gap list

| Mechanic | Current | Gap |
|---|---|---|
| Ball mass/spin/friction | BallSim kinematic bounce only | HavokBall with Magnus + grass friction (P2) |
| First touch | none | touch quality model (P3) |
| Pass types/weight | PassFlight (basketball) | ground/loft/through with charge scaling (P4) |
| Shot tradeoff/finesse | penalty aim only | power/accuracy + curl (P5) |
| Deflections | keeper guess only | physics parry/block/post (P5) |
| Off-ball runs | TeammateBrain (basketball spacing) | role-aware soccer runs + width + lane logic (P6) |
| Defensive shape/offside | none | press triggers, tackle kinds, offside (P7) |
