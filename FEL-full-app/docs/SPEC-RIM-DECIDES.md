# The rim decides — hoops pass, phase 7 (2026-09-22)

## The gap

Every jumper in 1v1, 3v3 and the shootout was decided before it left the hand:

```ts
const made = Math.random() < Math.min(0.98, pct);          // 1v1 hero · 3v3 hero · 1v1 rival (rivalShotPct)
const made = err < perfectBand() || (err < goodBand() && Math.random() < 0.55 + powerBonus);   // 3PT
```

and the rim play was planned afterwards to match: `forcedMakeProfile` for a yes, `forcedMissProfile` for a no.
The iron narrated a verdict it had no part in. The owner's bar for this pass (09-18 queue): *real rim physics —
rattles, rolls, in-and-out, bank kisses*. For that the ring has to be the thing that says yes or no.

## The rule (`lib/babylon/core/RimDecides.ts`)

One error per shot, drawn so the make RATE is exactly what the meter and the contest earned:

- `radial = MAKE_RADIUS / (−ln(1 − pct))^(1/k) · (−ln(1 − u))^(1/k)` — a Weibull draw whose scale is chosen so
  `P(radial ≤ MAKE_RADIUS) == pct`. `k = 2 − quality`: a perfect release clusters at the centre (and swishes), a brick
  is Rayleigh and sprays.
- The direction is isotropic with the shot's bias as a push (`short` from a contest or an early release, `lateral`
  from a brick), so misses are not all short off the front (they used to be — measured).
- `made = radial ≤ MAKE_RADIUS` (`SWISH_WINDOW × 1.15`). The dwell (`planRimPlay`) is planned from that same error,
  so the scoreboard and the iron cannot disagree. An airball is drawn only from a miss.

Wired through a mode-local `rimVerdictFor(shooterPos, pct, q01, short, lateral)` in 1v1 (hero + rival) and 3v3 (hero),
and inline in 3PT where the bands set the rate (perfect 0.97, good 0.55 + tilt, outside 0.04). Finishes at the rim —
dunks, layups, put-backs, the mates' shots — keep their own resolution: a layup is a placement, not a shot at the ring.

## Measured

Before (30-possession jumper labs, `_hoops-lab PLAY=jumper LUCK=0.99`): 1v1 6/30 (20 %), kinds seen 6; 3v3 8/30
(27 %), kinds 10. 3PT random presses: in-and-out 12, swish 4, iron 4 of 18; timed at the target: 28/28 swish (100 %).

After: 1v1 6/30 (20 %) → 6/30 (20 %), kinds 7 (swish, in-and-out, off the glass, roll-in, side iron, back-iron-in,
rattle-in); 3v3 8/30 (27 %) → 11/30 (37 %; n = 30, one binomial sd is ~8 pts), kinds 9. 3PT random presses: 7/21
made (33 %), 8 kinds, 0 airballs (the first after-run had 11/21 airballs — the Weibull tail at pct 0.04 reached
metres past the ring; `MISS_RADIAL_MAX` (1.9 × RIM_RADIUS) clamps the tail above MAKE_RADIUS, which leaves P(made)
untouched — tested). 3PT timed at the target: 28/29 made (97 %), swish share 23/28 (82 %) — the bar was ≥ 70 %.
