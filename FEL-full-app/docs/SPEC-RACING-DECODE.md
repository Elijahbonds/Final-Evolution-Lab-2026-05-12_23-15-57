# Racing decode — what the reference games do, what FEL does, the gap (2026-09-23)

The racing pass's phase 2. The references are the ones the owner's briefs name or imply: Diddy Kong Racing for Aero Aces
("supposed to be like Diddy Kong flyers"), Mario Kart 8 as the kart genre's spine, Mirror's Edge / Titanfall 2 for the Free
Run brief (Titanfall is named for the grapple), Track & Field / Mario & Sonic for the sprint. Each is decoded into the
GRAMMAR a player learns — what you press, what you read before you press it, and what answers you — not its content.

## The reference grammars

**Mario Kart 8 (kart).**
- The start is a skill: hold the accelerator at the right beat of the countdown (on "2") for a rocket start; too early
  burns out. The countdown is the first thing every race teaches.
- Drift is a hold into a corner that charges a MINI-TURBO in visible tiers (blue → orange → purple sparks at the rear
  wheels). The boost is paid on RELEASE, sized by the tier. The sparks are the whole read; no meter.
- Slipstream: sit in a rival's wake and wind lines appear; after a beat you get a speed burst past them.
- Items come from boxes and are weighted by place (the back of the pack gets the equalisers). You see what you hold.
- The read: place (big, bottom right), lap counter with a FINAL LAP sting, the minimap, a WRONG WAY warning. The finish
  says your place first, then the time.
- Rivals rubber-band, but a clean driver wins 150cc; bad lines lose.

**Diddy Kong Racing (planes).**
- The start: tap accelerate as the countdown's last beat lands for a boost.
- Balloons by COLOUR are the item grammar; flying through the same colour again LEVELS the item (up to three).
- Zippers (boost pads) on the course, and the "banana" count raises top speed.
- Planes: pitch and roll with the stick, the shoulder buttons are sharp turns; tricks (loop, roll) are the plane's own
  flourish and a dodge. Courses are laps through the sky, with ground-level lines and high lines.
- Silver coin challenges and the boss race give each track a second life.

**Mirror's Edge / Titanfall 2 (Free Run).**
- Momentum is the resource. A clean line keeps speed; a wall hit or a bad landing kills it. Runner Vision paints the
  next useful surface red — the route reads before you commit.
- Every verb is one press with a TIMING window (roll on landing, wall-run, wall-kick); the payoff is speed kept, not points.
- Titanfall's grapple: a slack cable you swing on, released at the right arc for a slingshot; slide-hop chains.
- The race is against a ghost / a time; the HUD is minimal because the world is the read.

**Track & Field / Mario & Sonic 100 m (sprint).**
- The gun: a false start is punished; a reaction start is rewarded and shown (reaction time on the card).
- Alternating presses build speed; the rhythm, not raw mashing, is the ceiling (Mario & Sonic's cadence; Track & Field
  mashes). A lean / dip at the tape is the last press.
- The read: the clock, a speed bar, the rival alongside, the finish in photo-finish order with times.

## FEL today (read from the code, 2026-09-23; measured in phase 1)

| | Velocity Kart | Aero Aces | Free Run | Sprint |
|---|---|---|---|---|
| start | none: the race runs from frame one | none | a 'GO' flash when you cross z 1.5 or after the grace | READY / SET / GO, false start penalised |
| drive / move | RT throttle, B brake, stick steer | RT gas, X brake, stick pitch / yaw | stick + RT sprint, LT slide | d-pad L / R alternate |
| skill verb | X drift → fills the shared BOOST meter; hold RB burns it | stunts (5, chained, decaying repeats), terrain hug / shave | vault (graded), rebound, wall run, grind, surf, grapple, flips | the cadence; RHYTHM ×10 callouts |
| items | balloon rows, A fires (shell / mine / …) | DKR balloons, same colour levels 1–3 | — | — |
| contact | RaceContact bump / punt / near miss | same | rival lunge → PARRY-VAULT (B), drive-by (RB), draft → slingshot (A) | — |
| rivals | RaceField pacers, bounded rubber band ±14 % | same (+16 % pace) | FreeRunRivals pacers on three lanes | one pacer at 13.4 s |
| read | dev HUD pos / lap / toGate / delta, ghost | WRONG WAY, place | flow tier, kinetic, place / delta | clock, speed, rival |
| end | `COMPLETE_<medal>` or OUT, cup standings | WIN / PODIUM / FINISHED / OUT | grade S–D (`win` on S / A) or timeout | win under 13 s else complete |

## The gap table (what this pass works on)

| # | gap | reference | modes | phase |
|---|---|---|---|---|
| 1 | no countdown and no start to win | MK rocket start, DKR start boost | kart, aero | 4 |
| 2 | drift pays a meter, not a tiered mini-turbo on release; the read is a number | MK drift sparks | kart | 8 |
| 3 | ~~BOOST silent when empty~~ — measured closed: an empty R1 answers with a tick (26 of 26 masher presses); it still says nothing a player READS | every press answered | kart, aero | 3 |
| 4 | no slipstream on kart / aero (the championship header claims one) | MK slipstream | kart, aero | 7/8 |
| 5 | Free Run controller: L3 quick-180 / rear view, R3 lock-on unmapped (InputBus has no stick clicks) | the brief's map | freerun | 3 |
| 6 | the kart ends on a MEDAL, not a place — a 4th-of-4 finish reads as "complete" | MK: place first | kart | 9 |
| 7 | Free Run ends on a grade, not the race (`win` on S / A regardless of place) | a race is won by finishing first | freerun | 9 |
| 8 | no WRONG WAY on the kart (aero has one) | MK | kart | 5 |
| 9 | the brief's HUD table (speed ring, overdrive arc, rank + delta top-left) | the brief | freerun | 5 |
| 10 | sprint: no reaction-time read, no dip at the tape | T&F, Mario & Sonic | sprint | 4/8 |
| 11 | speed gates (red → cyan by speed tier) | the brief | freerun | 7 |
| 12 | items weighted by place | MK | kart, aero | 6 |
| 13 | the sprint's face buttons, R1 and RT answer nothing (13 % of the masher's presses silent — the only silent presses in the suite) | every press answered | sprint | 3 |
| 14 | the kart cannot be won by a driver that races the line and fires every item: 4th of 4, out of time (field leader ~24 m/s average) | MK 150cc: a clean line wins | kart | 6 |
| 15 | Free Run's P1 in 23.1 s ends as "complete" (grade B) — the race result is not the outcome | a race is won by finishing first | freerun | 9 |

Phase 1 measured (c377961): intent drivers — kart OUT 4th of 4 at 113.6 s; aero WIN 1st of 8 in 172.8 s; free run P1 23.1 s
grade B → "complete"; sprint win 9.83 s. Idle: every race ends on its own. Mechanics: 0 % silent everywhere except the sprint
masher (13 %). 60 fps in all four. A gap the baseline shows is already closed is struck, not built.
