# The feel panel

Owner, 2026-10-20: "dev-only sliders for the new numbers. The owner tweaks them on a phone and tells us the values, and
we commit them." This is that panel. The owner tunes feel numbers on their own phone on the live site, and no other
player is affected.

## What it guarantees

- **Everyone plays the defaults.** `feel(id, DEFAULT)` returns the shipped constant. It returns an override only when
  all three of these hold:
  1. this device's `localStorage` holds an override (key `fel.feel.overrides.v1`; it is never sent anywhere);
  2. the server opened the panel for this user. `GET /api/feel-panel` answers `{ enabled: true }` only when
     `FEEL_PANEL_ENABLED` is on **and** the user's id is on `FEEL_PANEL_USERS`, or the user is an admin
     (`lib/admin/requireAdmin.ts`, `role === 'admin'`). `FEEL_PANEL_USERS` is a narrow permission: it opens the feel
     panel and nothing else. The `admin` role also opens the CRM and the admin dashboards (owner decision,
     2026-10-20). No email or id is written in code; the list lives only in the server env;
  3. the run may carry overrides (`lib/feel-panel/sessionGate.ts`).
- **Overrides apply only in a playtest run.** The run must be a `/play/<mode>?playtest=1` run. The server already
  records that run as unpaid with no `GameSession` row (`lib/sessions/runEligibility.ts`, `PLAYTEST`). It pays no XP,
  shards, Lab Credits, coins, PRQ, streak, season XP or mastery, and it adds nothing to a leaderboard or to the
  Arena's rival draw.
- **Some sessions are always blocked.** Overrides are ignored when any of these URL keys is present, even with an
  empty value, and on `/play/party`:

  | Key | Session |
  |---|---|
  | `arena` | a staked Arena duel |
  | `mp` | an async friend challenge |
  | `c` | a friend's challenge link |
  | `signature` | the weekly Signature ladder, the repo's ranked surface |
  | `story` | a Story node, which pays a reward |
  | `carnival` | the Court Carnival relay |
  | `net` | online play against another person |
  | `party` | a party-room start |
  | `ranked` | reserved for a future ranked session |
  | `agent` | a probe or agent run, which measures the defaults |

  A test fails if GameShell starts reading a new query key that this table does not cover
  (`lib/feel-panel/sessionGate.test.ts`).
- **No challenge links from an override run.** GameShell will not mint a challenge link from a page where overrides
  were applied. The mint route accepts any score the client sends.
- **Values stay in safe bounds.** Every knob has a safe `min`/`max`. Values are clamped and stepped on load and on
  every set, so a hand-edited `localStorage` value cannot go outside the bounds.
- **Reads are cheap.** `feel()` is a null check, or one `Map.get`. It allocates nothing and never reads storage per
  frame. Storage is read once, when the server opens the panel.

## Turning it on (the owner)

1. Find your user id. Sign in on the live site, open `/api/auth/session`, and copy the `"id"` value from `"user"`.
   This only reads; nothing is written.
2. Set two server env vars in the production server environment, then deploy. Deploying is the owner's step.
   - **`FEEL_PANEL_ENABLED=1`**. `1`, `true`, `on` and `yes` turn it on; anything else, or unset, leaves it off.
   - **`FEEL_PANEL_USERS=<your user id>`**. This is a comma list of exact user ids, matched case-sensitively, so
     add more people with `id1,id2`.

   Both are read per request (`lib/flags.ts` `isFeelPanelEnabled()`, `isFeelPanelUser()`). No role change, no schema
   change and no database write are needed. An account with role `admin` also opens the panel without being listed.
3. On your phone, sign in and open a mode as a playtest run, for example
   `/play/threevthree?playtest=1` or `/play/onevone?playtest=1`. A slim **FEEL** tab sits on the left edge, at
   mid-height.
4. Tap it. For each knob the sheet shows its name, id, default and current value, a slider, and **Reset**. At the
   bottom are **Reset all** and **Copy values**. When a value differs from its default, the amber
   **FEEL OVERRIDES ON · n** chip shows at the top, with the sheet open or closed.
5. Play, adjust and play again. Values take effect on the next frame.
6. **Copy values** puts the changed knobs on the clipboard as JSON, for example `{ "hoops.aiHandRangeM": 2.8 }`.
   Paste that to us and we commit it.

On a normal (paying) run the sheet still opens, but it says "Saved on this device, NOT applied here" and offers
**Restart as a playtest run**. To turn the panel off, unset `FEEL_PANEL_ENABLED` or remove your id from
`FEEL_PANEL_USERS`. Your saved values stay on your phone and do nothing.

## Registering a knob (other lanes)

1. **Keep the constant.** It stays in its module, and it is still the default everyone plays:
   ```ts
   export const COMBO_WINDOW_SEC = 0.18;
   ```
2. **Read it through `feel()`** at the point of use, per frame or per call. Do not read it at module load: that read
   would happen once, before the panel exists.
   ```ts
   import { feel } from '@/lib/feel-panel/feel';   // inside lib/babylon: '../../feel-panel/feel'
   if (t > feel('hoops.comboWindowSec', COMBO_WINDOW_SEC)) { … }
   ```
   A default parameter also works: `fn(x, w = feel('hoops.comboWindowSec', COMBO_WINDOW_SEC))`. Use the id as a
   string literal, because the catalogue test finds reads by searching for `feel('…'`.
3. **Add a row** to the end of your group in `lib/feel-panel/knobs.ts` (`FEEL_KNOBS`). Append only, so a merge only
   ever adds lines.
   ```ts
   {
     id: 'hoops.comboWindowSec', label: 'Combo window', def: 0.18, min: 0.05, max: 0.4, step: 0.01, unit: 's',
     group: 'Hoops · moves', source: 'lib/babylon/core/HandleCombo.ts COMBO_WINDOW_SEC',
     hint: 'How late in a move the next press still chains.',
   },
   ```
4. **Pin the default.** Add one line to the first test in `lib/feel-panel/knobs.test.ts`:
   `expect(def('hoops.comboWindowSec')).toBe(COMBO_WINDOW_SEC);`.

`knobs.test.ts` checks every row automatically. Each id must have the form `<area>.<camelName>` and be unique. The
default must lie inside `[min, max]` and on the step grid. `source` must name a real file that exports that constant.
Every registered knob must be read somewhere in `lib/`, and every `feel('…')` read must name a registered knob.

**What may be a knob:** a feel number, such as a timing, distance, window or smoothing value. A score ceiling, a
payout or a price is never a knob. **assumption:** this lane chose the bounds for the four #375 knobs. They are safe,
not tuned. Widen a bound only with a reason.

## The pieces

| File | What it does |
|---|---|
| `lib/feel-panel/feel.ts` | `feel()`, the store (three conditions, storage, set/reset, copy JSON, the challenge-link latch) |
| `lib/feel-panel/sessionGate.ts` | `feelSessionBlock(pathname, search)`, the allow-list and the blocked keys |
| `lib/feel-panel/knobs.ts` | `FEEL_KNOBS`, the catalogue |
| `lib/flags.ts` | `isFeelPanelEnabled()` (`FEEL_PANEL_ENABLED`), `isFeelPanelUser()` (`FEEL_PANEL_USERS`) |
| `app/api/feel-panel/route.ts` | the server's yes or no. It always answers 200, so players get no console noise. With the flag off it reads no session |
| `components/feel-panel/feel-panel.tsx` | the client container. It is mounted once in `app/play/layout.tsx` and renders nothing until the server says yes |
| `components/feel-panel/feel-sheet.tsx` | the sheet itself (pure view) |

Knobs registered today, with their defaults unchanged: `hoops.aiHandRangeM` 2.4 m, `hoops.aiHandDwellSec` 0.35 s,
`hoops.aiHandGapSec` 0.9 s and `hoops.handClearM` 0.01 m (PR #375's `AI_HAND_RANGE_M`, `AI_HAND_DWELL_SEC`,
`AI_HAND_GAP_SEC` and `HAND_CLEAR_M`).

lane/hoops-shot-core (group "Hoops · shooting"), defaults unchanged: `hoops.distGreenNearM` 2.0 m, `hoops.distGreenFarM`
7.5 m, `hoops.distGreenMaxNarrow` 0.22 (`ShotWindow.ts`), `hoops.shotClock1v1Sec` 12 s, `hoops.shotClock3v3Sec` 14 s
(`ShotClock.ts`), `hoops.dunkRingQuality` 0.7, `hoops.dunkShortBias` 0.7, `hoops.dunkClankMinMps` 2.4 m/s and
`hoops.dunkClankSpanMps` 1.6 m/s (`RimForAll.ts`). **assumption:** the bounds are safe, not tuned. The dunk knobs move
only where a missed dunk hits the iron and how it bounces off, never the make rate (the ring's scale keeps P(made) = pct
at every quality).

lane/hoops-moves (group "Hoops · handle"), defaults unchanged: `hoops.comboOpenK` 0.5 and `hoops.comboGraceSec` 0.15 s
(`comboFlow.ts` `COMBO_OPEN_K`, `COMBO_GRACE_SEC`: when a press flows into the running move and counts toward the on-screen
combo; flow only, no odds), and `hoops.guardRangeM` 2.0 m (`GuardHand.ts` `GUARD_RANGE_M`: a live defender inside it moves the
player's ball to the outside hand; the dwell and gap are the AI hand's `hoops.aiHandDwellSec` / `hoops.aiHandGapSec`).
**assumption:** the bounds are safe, not tuned.

lane/hoops-defense-fx (group "Hoops · defense"), defaults unchanged, all in `BallSideShade.ts`: `hoops.ballSideShadeOn` 1
(`BALL_SIDE_SHADE_ON`; 0 = the old anchor exactly, for an A/B on the phone), `hoops.shadeOffsetM` 0.5 m, `hoops.shadeHoldSec`
0.22 s, `hoops.shadeSlideMps` 2.4 m/s, `hoops.shadeDeadBandM` 0.08 m, `hoops.shadeRangeM` 2.4 m and `hoops.shadeReseedM` 1.0 m.
**assumption:** the bounds are safe, not tuned. The shade moves only where the on-ball defender stands; no steal or strip odds,
speed or timing window reads a knob here.

lane/h3-aware (PR #313 / #315 ported onto release, owner 2026-10-24). Group "Hoops · 3v3 awareness": `hoops.offBallLookOn` 1
(`OffBallLook.ts` `OFF_BALL_LOOK_ON`; 0 = the release feed), `hoops.manGlanceEverySec` 1.6 s, `hoops.manGlanceSec` 0.4 s;
`hoops.possessionSwapOn` 1 (`PossessionSwap.ts`; 0 = every body keeps its own brain on their ball), `hoops.foeSpaceAngleK` 0.3 (×π),
`hoops.hasBallM` 1.0 m (TUNED: release 1.8; 1.8 = release); `hoops.defenseStanceOn` 1 (`DefenseStance.ts`; 0 = no raise, the table's
lean), `hoops.defenseRaiseM` 0.15 m, `hoops.raiseReach` 0.97, `hoops.stanceEaseSec` 0.18 s, `hoops.defendLeanDeg` −6° (TUNED: the table's
10 / 8 in 3v3; the table itself is unchanged) and `hoops.defendSpine1Deg` 2° (TUNED: 8). Group "Hoops · teammate" (`threevthreeMate.ts`):
`hoops.mateReadOn` 1 (0 = release's 1 %-a-frame roll), `hoops.mateSettleSec` 0.35 s, `hoops.mateReadSec` 0.9 s, `hoops.mateHoldMaxSec`
1.8 s, `hoops.mateShootRangeM` 7.3 m, `hoops.mateDriveFromM` 8.5 m, `hoops.mateFinishM` 2.4 m, `hoops.mateDriveMaxSec` 1.6 s and
`hoops.mateLaneM` 0.9 m. **assumption:** the bounds are safe, not tuned. No make rate reads a knob here: the teammate's shot is
`teammateShoots` on the ring (RimDecides), unchanged.
lane/hoops-reverse (group "Hoops · movement"), all in `lib/babylon/core/HoopsStick.ts`, read per frame by `CourtMovement` on the
hoops gears (the 1v1 / 3v3 player's DribbleController and the dunk approach; `hoops.handlerTurnDeg` is the DribbleController's
alone). The owner's decision of 2026-10-23: port PR #311's H3a ("the ball handler answers the stick: quicker starts, firmer stops,
a real reversal") as knobs whose **defaults are the release values**, so nobody's game changes until the owner dials them in.

**The reversal fix ships ON** (`hoops.reverseDeg` 135): a bug fix, not a feel change. Release steered the run with
`Lerp(dir, wantDir).normalize()`; for a stick thrown straight back that lerp shrinks along the same line and normalises back to the
old direction, so after the plant the handler ran the OLD way again. A stick 135° or more round from the run now brakes through zero
and pushes off the new way. **assumption:** its brake (`hoops.reverseDecel`) defaults to today's plant bleed, 47.6 m/s².

The H3a preset (#311's tuned values; `H3A_STICK_PRESET` in `HoopsStick.ts`):

| Knob | Release (default) | H3a | What it is |
|---|---|---|---|
| `hoops.jogTau` | 0.17 s | 0.10 s | the lag to jog speed |
| `hoops.sprintTau` | 0.15 s | 0.10 s | the lag to sprint speed |
| `hoops.jogAccel` | 15 m/s² | 22 m/s² | the accel cap toward a jog |
| `hoops.sprintAccel` | 24 m/s² | 26 m/s² | the accel cap toward a sprint |
| `hoops.loadScale` | 0.45 | 0.7 | the loaded first step (1 = no load) |
| `hoops.gearDownDecel` | 9 m/s² | 12 m/s² | easing down off the turbo |
| `hoops.stopDecelLow` | 22 m/s² | 32 m/s² | the stop's brake at a walk |
| `hoops.stopDecelHigh` | 11 m/s² | 26 m/s² | the stop's brake at top speed |
| `hoops.plantDecel` | 47.6 m/s² | 34 m/s² | the plant's bleed on a cut over ~110° at pace |
| `hoops.handlerTurnDeg` | 540 °/s | 720 °/s | the handler's turn rate |
| `hoops.turnTrueArc` (new) | 0 | 1 | 1 = a turn is a real rotation (slerp); 0 = the lerp, which turns a 90° stick at ~64 % of the rate |
| `hoops.kickSec` (new) | 0 s | 0.1 s | the turbo press's 0.9 m/s kick spread over this (0 = one frame) |
| `hoops.cutSec` (new) | 0 s | 0.08 s | the cut cost paid over this (0 = one frame) |
| `hoops.jerk` (new) | 0 (off) | 900 m/s³ | the most the acceleration changes per second |
| `hoops.reverseDeg` (new) | 135° | 135° | THE FIX: a stick this far round is a reversal |
| `hoops.reverseDecel` (new) | 47.6 m/s² | 34 m/s² | the reversal's brake through zero |
| `hoops.retreatSpeedK` (TUNED, new) | 0.7 | 0.7 | the retreat (the stick held more than 120° from the facing the retreat dribble keeps) tops out at this share of a jog; forward runs, sprints and slides never read it; 1 = no cap |

**The retreat cap** (owner decision 2026-10-24: "a real backpedal is slower than running forward"): with the fix a held straight pull-back
retreats, and before the cap it backpedalled at a full jog, or at a full sprint with the turbo held. `hoops.retreatSpeedK` 0.7 caps it at
0.7 × jog (3.05 m/s), with the turbo held too. It is not part of #311 and is the same in the H3a preset.

`hoops.turnTrueArc` is the one knob #311 did not have as a number: its slerp came on with `reverseDeg`. It is split out so the fix can
ship on while the turn stays exactly as it is. A committed hop (the step-back's `ignoreStickFor`) always glides on the release stop
(22 / 11), whatever the stop knobs say, as #311 kept it: its travel is the move's separation.

Paste this into the panel's values (the format **Copy values** produces) to play H3a:

```json
{ "hoops.jogTau": 0.1, "hoops.sprintTau": 0.1, "hoops.jogAccel": 22, "hoops.sprintAccel": 26, "hoops.loadScale": 0.7,
  "hoops.gearDownDecel": 12, "hoops.stopDecelLow": 32, "hoops.stopDecelHigh": 26, "hoops.plantDecel": 34,
  "hoops.handlerTurnDeg": 720, "hoops.turnTrueArc": 1, "hoops.kickSec": 0.1, "hoops.cutSec": 0.08, "hoops.jerk": 900,
  "hoops.reverseDecel": 34 }
```

Measured (`scripts/probes/_stick-response.mts`, the real DribbleController at 60 fps; `PRESET=h3a` applies the preset through
`feel()`), release → H3a: jog to 90 % 450 → 267 ms; sprint to 90 % 400 → 300 ms; stop from a jog 233 ms / 0.53 m → 150 ms / 0.32 m;
from a sprint 400 ms / 1.41 m → 233 ms / 0.73 m; the velocity flips on a straight pull-back never (before the fix) → 217 ms (the fix
at defaults) → 250 ms (H3a), and the retreat then runs at 3.05 m/s (the cap); a 90° cut settled 250 → 167 ms; the largest one-frame speed jump 1.13 → 0.57 m/s. These are #311's own
numbers, reproduced exactly (the retreat cap aside: it came after #311). **assumption:** the bounds are safe, not tuned.

lane/hoops-overtime (group "Hoops · rules"), **new**: `hoops.overtime3v3Sec` 30 s (`threevthreeOvertime.ts` `OVERTIME_3V3_SEC`, PR #268's
number): a 3v3 tied at the horn plays sudden-death overtime on this clock, and level again when it runs out is another overtime.
It moves only how long an overtime lasts, never who wins it or what a bucket is worth. **assumption:** the bounds (10–90 s) are
safe, not tuned.
