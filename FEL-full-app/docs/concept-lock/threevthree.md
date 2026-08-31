# Concept Lock — Basketball 3v3

**Benchmark (LOCKED, bible §4.1): NBA 2K.**
**Mode id:** `threevthree` · **Implementation:** `lib/babylon/modes/ThreeVThreeMode.ts`

Phase 1 of the convergence pass. The benchmark is NBA 2K, and the relevant part
of 2K is its **Park / Blacktop 3v3**: half court, one basket, first to 21, twos
and threes. Those are the criteria below.

Note the bible names **Streetball 1v1 as the validated reference** to diff
against. That diff turned out to be worth doing in an unexpected direction —
see D2.

---

## A. Contest format

| # | Criterion | Status | Where |
|---|---|---|---|
| A1 | Half court, ONE basket | ✅ **fixed** | venue gave it a full court with two hoops — D1 |
| A2 | First to 21 | ✅ | `TARGET_SCORE = 21` |
| A3 | Twos and threes | ✅ **fixed** | a dunk scored **1** — D8 |
| A4 | **Real three-point arc, not a circle** | ✅ **fixed** | flat 6.75m radius — D3 |
| A5 | Possession changes after a made basket | ✅ | `opponentPossession()` |
| A6 | Shot clock / game clock | ✅ | `POSSESSION_SEC = 90`, higher score wins at 0 |
| A7 | Regulation 10ft rim | ✅ **fixed** | hoop was built at 2.70m — D2 |

## B. On-court play

| # | Criterion | Status |
|---|---|---|
| B1 | Shot meter with a release window | ✅ `ShotMeter` |
| B2 | Contested shots are worse than open ones | ✅ `contestLevel` feeds the meter |
| B3 | Turbo/sprint is a resource | ✅ `TurboMeter` — drains, regens, re-arms at 25% |
| B4 | Dunks at the rim, posterize through a defender | ✅ `checkDriveDunk` (scoring fixed — D8) |
| B5 | Blocks and steals on defence | ✅ `checkBlock`, steal poke |
| B6 | Ankle-breakers off a stick snap | ✅ `checkAnkleBreak` |
| B7 | Passing that flies, with an open-man read | ✅ `PassFlight`, `lockTarget` |
| B8 | Assists are tracked | ✅ `assists` + HUD |

## C. Teammates and defence — what makes it 3v3 and not 1v1 with extras

| # | Criterion | Status |
|---|---|---|
| C1 | **Teammates space the floor** | ✅ **fixed** | both cut to the same point — D4 |
| C2 | **Defenders match up on a man** | ✅ **fixed** | all three chased one point — D4 |
| C3 | Teammates cut when a lane opens | ✅ `TeammateBrain` cut logic |
| C4 | Bodies collide rather than interpenetrate | ✅ all 15 pairs, every frame |

---

## D. Deviations

**D1 — The mode shot at a rim that was not there. → FIXED.**
`RIM` is `(0, 3.05, -0.6)` and the mode enforces half court in code
(`clampToHalfCourt` keeps every player in z 0.5–15). The venue spec gave it a
FULL court with baskets at z −13.5 and +13.5, so the nearest real hoop stood at
z +14.22 — **behind the players** — while they shot at empty air past their own
baseline. The mode was right; the venue was wrong. One hoop now, at the mode's
rim. Guarded by `hoop-alignment-tests`.

**D2 — The rim was a foot low. → FIXED.**
The hoop prop built its rim at y 2.70 — about 8'10". A basketball rim is 3.05m
and it is the most widely known number in the sport. This affected **every**
basketball mode in the game. Worth recording: `VenueKit`'s fallback court had
the rim at exactly (0, 3.05, −0.6) all along — the correct value was already in
the codebase, and only the newer "premium" Nexus venue specs disagreed with it.

**D3 — The three-point line was a circle. → FIXED.**
`THREE_POINT_RADIUS = 6.75`, one flat radius. The real arc is 6.71m in the
corners and 7.24m at the top, and that difference is the whole of basketball
shot selection. This is the *identical* mistake 3PT shipped as its own D1 and
then fixed — repeated here because the knowledge lived inside `ThreePointMode`
instead of the shared core. It now lives in `BasketballCore` as
`threePointRadius()` / `isThree()`, and 3PT re-exports it, so the two cannot
drift to different lines.

**D4 — Every AI converged into a heap. → FIXED.**
The first frame captured of this mode had all six players stacked at centre
court. Two independent causes, both "steer at one ideal point":
`DefenderBrain` had no matchup, so all three defenders solved for the same deny
point between ball and rim and piled onto it, leaving two attackers completely
unguarded; `TeammateBrain` cut to the hoop *exactly*, so both teammates arrived
in the same square metre. Defenders now mark a man and play help-side; teammates
cut to their own side of the rim; both carry a separation term. Guarded by
`threevthree-core-tests`.

Also fixed while in there: `allies`/`foes` were the same two functions for
every AI, so a **defender** received the player's team as its allies and its own
team as its foes — exactly backwards. Harmless only because `DefenderBrain`
ignored both parameters; it would have produced a defence that marked its own
teammates the moment it stopped ignoring them.

**D5 — The mode rendered an empty void. → FIXED.**
Booted through the dev runner it came up at draws 5 / meshes 5 while the HUD
reported "playing". `mountVenue` ran twice: the StrictMode double-mount, same as
the Dunk guest path. The host started `runMode` immediately, so the phantom
mount also built an engine its own cleanup could not cancel. 5 meshes → 57.

**D6 — Win-by-2. → RULED OUT OF SCOPE.**
Street 21 is often played win-by-2. NBA 2K's Park is first to 21 flat, and 2K is
the locked benchmark, so first-to-21 stands. Recorded so the decision is not
re-litigated.

**D8 — A dunk was worth one point. → FIXED.**
The jumper path awards 2 or 3 by the arc; the dunk path awarded `myScore += 1`,
left over from the old "1 inside the paint, 2 outside" scale. This file's own
header records that scale being fixed once — *"a layup scored LESS than a
jumper"* — but only the jumper branch was corrected. So the highest-percentage,
most spectacular shot in the game was worth half a jump shot. A dunk is inside
the arc, so it is a two. Guarded by a source check, because the bug is a bare
literal in one branch and nothing else would catch it.

**D9 — Pressing forward walked you away from the basket. → FIXED.**
Every input source in this game reports up-stick as NEGATIVE y: the Gamepad
API's `axes[1]` is −1 pushed up, `InputBus` maps W to −1 to match, and the touch
stick uses screen deltas so up is negative too. `CourtMovement` documents the
opposite — *"+Y = up-stick"* — and maps `wantDir = (moveX, 0, -moveY)`. The three
input paths agree with each other and disagree with the movement core, so
forward was backward. Measured: holding W drove the hero from z 6 to z 8.6 with
the rim at z −0.6.

This is also where the mode's `[FEL-FRAME]` errors came from — the camera frames
the hero against the rim, and walking the wrong way pulled him out of shot until
the guard auto-recentred. After the fix a full playthrough logs **zero**.

Negated at this mode's boundary rather than in `CourtMovement`, which a dozen
other files share. See the sign-off carry-forward.

**D10 — Full-court markings on a half-court game. → FIXED.**
The ground was 18×30 centred on the origin with `markings: 'basketball'` — two
keys, a halfway line and a centre circle — for a game that uses one basket and
never crosses z 0. The painted key sat at the opposite end from the hoop. Now an
18×20 half court offset so the baseline sits 1.575m behind the rim, with
`halfcourt` markings, and the stands moved in behind it.

**D7 — No alley-oops between teammates. → DEFERRED, Phase 8.**
2K has them and the passing system (`PassFlight`) plus the dunk system could
support one. Not format-critical; it is polish.

---

## E. Exit criteria

Parity when A1–A7, B1–B8 and C1–C4 hold, with D6 ruled and D7 recorded.

**Currently: 19 of 19 criteria hold.** D6 ruled, D7 deferred to a later polish pass.
