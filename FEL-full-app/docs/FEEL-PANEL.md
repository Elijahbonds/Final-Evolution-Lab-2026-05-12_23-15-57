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

lane/hoops-shot-content (group "Hoops · shooting"), defaults unchanged: `hoops.ftSetupSec` 0.9 s, `hoops.ftRoutineSec` 1.2 s,
`hoops.ftSetSec` 0.3 s and `hoops.ftResultSec` 1.1 s (`FreeThrows.ts` `FT_SETUP_SEC`, `FT_ROUTINE_SEC`, `FT_SET_SEC`,
`FT_RESULT_SEC`: the free-throw trip's beats, never its meter), `hoops.bankSetDeg` 12° and `hoops.bankGlanceMs` 1100 ms
(`hoops/shotLooks.ts` `BANK_SET_DEG`, `BANK_GLANCE_MS`: the called bank's angled set and glance; look only, the ball's route is
unchanged), and `hoops.ftDistNarrow01` 0 (`FreeThrows.ts` `FT_DIST_NARROW_01`: the share of a jumper's distance narrowing the line's
green takes; owner 2026-10-24: 0, the full open window, ±65 ms; 1 = a jumper from the stripe, ±59 ms). Not knobs: the bank follow-through clips' own
chest / glance yaw (`shotKit.ts` `BANK_CHEST_YAW_DEG` 14, `BANK_GLANCE_YAW_DEG` 22), which are baked into the clip's keys when
the clip is built, not read at use. **assumption:** the bounds are safe, not tuned.

lane/hoops-defense-fx (group "Hoops · defense"), defaults unchanged, all in `BallSideShade.ts`: `hoops.ballSideShadeOn` 1
(`BALL_SIDE_SHADE_ON`; 0 = the old anchor exactly, for an A/B on the phone), `hoops.shadeOffsetM` 0.5 m, `hoops.shadeHoldSec`
0.22 s, `hoops.shadeSlideMps` 2.4 m/s, `hoops.shadeDeadBandM` 0.08 m, `hoops.shadeRangeM` 2.4 m and `hoops.shadeReseedM` 1.0 m.
**assumption:** the bounds are safe, not tuned. The shade moves only where the on-ball defender stands; no steal or strip odds,
speed or timing window reads a knob here.

lane/h3-handler (owner 2026-10-24: the still-missing parts of PRs #312 and #314, ported). Group "Hoops · handle (rest)": the dribble at
rest — `hoops.protectDribbleOn` 1, `hoops.restBounceOn` 1, `hoops.restTempoIdle` 1.2, `hoops.restTempoProtect` 1.45, `hoops.clipLockGain` 3,
`hoops.clipLockHzMax` 2.6 Hz, `hoops.clipLockMaxMps` 0.4 m/s (`anim/RestDribble.ts`); the eyes on the defender — `hoops.eyesOnDefenderOn` 1,
`hoops.readRangeM` 3.5 m, `hoops.readSpeed01` 0.42, `hoops.readGlanceEverySec` 2.4 s, `hoops.readGlanceSec` 0.55 s (`core/HoopsLook.ts`); the
guard — `hoops.protectGuardOn` 1, `hoops.guardBackM` 0.22 m, `hoops.guardOutM` 0.06 m, `hoops.guardDropM` 0.06 m, `hoops.guardSec` 0.15 s,
`hoops.guardBarXM` / `YM` / `ZM` 0.15 / 1.06 / 0.34 m (`anim/RestDribble.ts`); the protect posture — `hoops.protectPostureOn` 1,
`hoops.protectTurnDeg` 50°, `hoops.protectEyes` 0.9, `hoops.protectChestAim` 0.8 (`core/HoopsLook.ts`), `hoops.protectSinkM` 0.06 m,
`hoops.protectSinkSec` 0.18 s (`anim/ProtectSink.ts`); the move ease — `hoops.moveEaseOn` 1, `hoops.moveEaseSec` 0.2 s,
`hoops.moveEaseRateDeg` 1000°/s, `hoops.moveArmRateDeg` 1800°/s (`anim/MoveEase.ts`). Group "Hoops · jump shot": `hoops.jumperHopOn` 1
(TUNED: the jump's air time 0.88–1.02 s → ~0.5 s; 0 = the old float), `hoops.jumperApexAfterReleaseSec` 0.03 s, `hoops.jumperMinLoadSec`
0.08 s, `hoops.jumperHangOn` 1, `hoops.jumperHangScale` 0.1 (`core/JumperHop.ts`). Every `…On` knob at 0 gives back the old behaviour
exactly (each module's test pins it). None of them moves a timing window, the release frame, a speed or an odds number. **assumption:**
the bounds are safe, not tuned.

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
lane/hoops-def-tell (#273 and #274 rebuilt, owner 2026-10-23). Group "Hoops · defense", the tell and the separation shipped ON:
`hoops.aiReachTellOn` 1 (`ReachTell.ts` `AI_REACH_TELL_ON`; 0 = the release's reach exactly), `hoops.aiReachTellSec` 0.25 s,
`hoops.aiReachStunSec` 0.35 s, `hoops.aiReachGate` 0.5 (TUNED 0.7 by hoops-p02, below), `hoops.aiStealChance` 0.22, `hoops.aiStealOnBump` 0.6 (3v3's odds, unchanged,
now 1v1's too), `hoops.pokeReadOn` 1 (0 = the old per-frame poke at the deny point exactly), `hoops.stealRatePerSec` 1.2 /s,
`hoops.pokeRangeM` 1.2 m, `hoops.pokeLeadSec` 0.1 s; `hoops.bodySepOn` 1 (`BodySeparation.ts` `BODY_SEP_ON`; 0 = the release's contact
exactly), `hoops.capsuleRadius1v1M` 0.55 m (read when 1v1 loads its bodies: restart the run after changing it), `hoops.bodyHardGapM`
0.90 m, `hoops.sepPushMps` 2.4 m/s, `hoops.sepDeadbandM` 0.01 m, `hoops.sepPopMaxM` 0.10 m. Group "Hoops · blocks" (`HoopsBlocks.ts`,
BLK-1): the six windows' centres and half-widths (`hoops.blk<Type>TMs` / `hoops.blk<Type>HalfMs`), `hoops.blkHoldMs` 220,
`hoops.blkCatchMeterFullMs` 320, the swat ranges 1.5 / 1.2 m, the catch's 35° / 1.1 m, the spike's 30°, the pin's 0.9 m and the four foul
odds 25 / 50 / 15 / 35 % with their angle (60°) and late margin (100 ms). **These block knobs move nothing in a game yet**: the selector
is not wired into the modes until BLK-2, which waits on T-B. **assumption:** the bounds are safe, not tuned.
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

lane/hoops-p01-controls (1v1 / 3v3 ten-phase pass, phase 1 "controls that answer"; group "Hoops · movement"). The 1v1 / 3v3
ball handler (every DribbleController body) now runs on its own gears, `GEARS_HANDLER` (`core/CourtMovement.ts`); `GEARS_HOOPS` stays
release, so the dunk approach (DunkMode) is unchanged unless a knob is dialled. Five rows' **defaults changed** to H3a's own numbers (the
owner's #311 set), only where a phase-1 gate needed them, and three rows are **new**:

| Knob | Release | Now (default) | Why (the gate) |
|---|---|---|---|
| `hoops.jogTau` (TUNED) | 0.17 s | 0.10 s (H3a) | 90 % of the jog's pace ≤ 0.25 s (release 0.45 s) |
| `hoops.jogAccel` (TUNED) | 15 m/s² | 22 m/s² (H3a) | same |
| `hoops.loadScale` (TUNED) | 0.45 | 0.7 (H3a) | same, and the onset |
| `hoops.stopDecelLow` (TUNED) | 22 m/s² | 32 m/s² (H3a) | stop from a jog ≤ 0.25 s / ≤ 0.6 m |
| `hoops.stopDecelHigh` (TUNED) | 11 m/s² | 26 m/s² (H3a) | stop from a sprint ≤ 0.35 s / ≤ 1.0 m (release slid 0.42 s / 1.40 m) |
| `hoops.firstStepMps` (TUNED, new) | 0 | 0.3 m/s | the root moves 2 cm ≤ 2 frames after the press (release 4, H3a 3): the press is answered on its own frame |
| `hoops.reversePlantHold` (TUNED, new) | 1 | 0 | a reversal at pace ≤ 0.22 s to half the pace the new way: release's plant held 2.7 m/s the OLD way for 0.1 s first |
| `hoops.reverseLaunchSec` (TUNED, new) | 0 | 0.2 s | same: the push-off out of a reversal is a launch (no loaded step), as a move's explode is |

The step-back's committed hop still glides on the release stop (22 / 11) by name, whatever these say. The H3a preset now also carries the
three new knobs at their release values, so it still plays #311 exactly. **Everything is one paste from release**
(`RELEASE_STICK_PRESET` in `HoopsStick.ts`):

```json
{ "hoops.jogTau": 0.17, "hoops.jogAccel": 15, "hoops.loadScale": 0.45, "hoops.stopDecelLow": 22, "hoops.stopDecelHigh": 11,
  "hoops.firstStepMps": 0, "hoops.reversePlantHold": 1, "hoops.reverseLaunchSec": 0 }
```

Measured (the real DribbleController at 60 fps), release → now: onset 4 → 2 frames; jog to 90 % 450 → 250 ms; stop from a jog 250 ms /
0.53 m → 150 ms / 0.29 m; from a sprint 417 ms / 1.40 m → 233 ms / 0.69 m; a jog reversal to half pace the new way 450 → 183 ms. The
browser rig (`scripts/probes/hoops-gap`, the real modes, seed 7, PRO) agrees: onset 4 → 2 frames (1v1) and 3 → 2 (3v3); stop from a jog
250 ms / 0.53 m → 150 ms / 0.29 m and from a sprint 417 ms / 1.40 m → 233 ms / 0.68–0.69 m in both modes. A snap reversal of the left
stick at pace is a left-stick MOVE in the game (a behind-the-back / crossover cut), not this reversal: 283 ms to half pace, unchanged. **assumption:** the gates' bands are the hoops-audit's proposal, not owner numbers; the
three new values are the least that meet them, not felt yet.

lane/hoops-overtime (group "Hoops · rules"), **new**: `hoops.overtime3v3Sec` 30 s (`threevthreeOvertime.ts` `OVERTIME_3V3_SEC`, PR #268's
number): a 3v3 tied at the horn plays sudden-death overtime on this clock, and level again when it runs out is another overtime.
It moves only how long an overtime lasts, never who wins it or what a bucket is worth. **assumption:** the bounds (10–90 s) are
safe, not tuned.
lane/tiebreak-cam (group "Tennis · camera"), new number, default as shipped by that lane: `tennis.portraitHeroMargin` 0.15
(`netPortraitCam.ts` `PORTRAIT_HERO_MARGIN`: on a phone held upright, Tennis and its tiebreak variant turn the play camera
only when the player would come closer than this share of the frame's width to a side edge; wide screens are never touched).
**assumption:** the bounds (0.05 to 0.35) are safe, not tuned.
lane/dunk-flagship (group "Dunk · lobs"), new numbers, default as shipped by that lane: `dunk.oopLobFlightSec` 1.0 s
(`DunkFlagship.ts` `OOP_LOB_FLIGHT_SEC`: the ALLEY-OOP passer lobs the ball while the dunker is still running, this long
before the catch beat; it was a 0.35 s pass thrown after the take-off). It moves only when the pass leaves and how high it
arcs; the catch, the slam window and the card are unchanged. **assumption:** the bounds (0.5 to 1.6 s) are safe, not tuned.
lane/dunk-flagship Phase 3 (group "Dunk · lobs"), new number: `dunk.oopLateCatchClipT` 0.8 (`DunkFlagship.ts`
`OOP_LATE_CATCH_CLIP_T`): when the dunker leaves the floor before the passer's run-throw is due (A early, RT let go early), the
passer lobs on the take-off frame to this beat of the flight clip (the off-glass lob's hang beat). Before, it was a 0.35 s
bullet thrown at 0.9 × the rise. Later gives a higher drop into the hand and less time before the slam window (1.05).
**assumption:** the bounds (0.6 to 1.0) are safe, not tuned.
lane/dunk-flagship (group "Dunk · run-up"), new, default unchanged: `dunk.runwayStrideScale` 1 (`DunkFlagship.ts`
`RUNWAY_STRIDE_SCALE`): the run-up's leg pace reference (3.6 ÷ 1.1 m/s, as shipped) × this. Re-paced to 3.95 m/s on the rig,
the run-up skated less at a sprint and more at 2.5–5 m/s, no overall gain, so the shipped pace stays and this is the owner's
dial. **assumption:** the bounds (0.8 to 1.4) are safe, not tuned.
lane/dunk-flagship (group "Dunk · slam"), TUNED, flagged: `dunk.slamHitStopBigMs` 100 ms and `dunk.slamShakeBig` 0.18
(`DunkFlagship.ts` `SLAM_HITSTOP_BIG_MS`, `SLAM_SHAKE_BIG`): a perfect slam's hit-stop and shake. Every make froze 70 ms and
shook 0.12 before; an ordinary make (accuracy ≤ 0.5) still does, and cleaner ones grow toward these (`slamImpact`).
**assumption:** the bounds (70–160 ms, 0.12–0.30) are safe, not tuned.

lane/hoops-round2 (owner 2026-10-20, HOOPS DEFENSE / CONTACT; every number new, the owner has felt none of them yet):

- Group "Hoops · AI reaction" (`hoops/reaction.ts`), **TUNED (new behaviour)**: `hoops.aiReactRookieMs` 420 ms, `hoops.aiReactProMs`
  220 ms, `hoops.aiReactEliteMs` 120 ms (`AI_REACT_ROOKIE_MS` / `_PRO_MS` / `_ELITE_MS`, the owner's numbers and Difficulty's
  `reactionMs`). Every hoops defender brain (1v1's rival, 3v3's three) sees the ball and the attackers this late, carried forward on
  the motion it saw then: a straight run is tracked with no lag, a change of direction is seen this late. Before: 0 ms on every tier.
  No speed, reach or odds changes. Staked and head-to-head runs play PRO, at the default.
- Group "Hoops · team defense" (`hoops/teamDefense.ts`, 3v3 only): `hoops.doubleTeamOn` 1 (0 = one man on the ball, the release),
  `hoops.doublePaintM` 3.0 m, `hoops.doubleAfterSec` 0.45 s, `hoops.doubleMaxSec` 2.0 s, `hoops.doubleCooldownSec` 4.0 s (a ball held
  inside 3 m of the rim for 0.45 s draws the nearest other defender; he goes back on the pass, when the ball leaves the paint, or after
  2 s; then none for 4 s); `hoops.switchOnScreenOn` 1 (0 = fight through every screen, the release), `hoops.switchHelpM` 2.6 m,
  `hoops.switchCooldownSec` 1.5 s (a pick on the ball defender: the screener's man takes the ball when he is within 2.6 m of the
  handler and nearer than the screened man; a swap, nobody unmarked).
- Group "Hoops · contact" (`hoops/handCheck.ts`, `hoops/contactPoses.ts`, 1v1 and 3v3): `hoops.handCheckOn` 1 (0 = nothing counted,
  nothing drawn), `hoops.handCheckReachOverM` 0.15 m (the forearm is on the hip inside BODY_STANDOFF 1.10 m + this; the standoff is
  unchanged), `hoops.handCheckGapSec` 0.3 s, `hoops.handCheckFoulCount` 4, `hoops.handCheckWindowSec` 5 s (4 arrivals inside 5 s is the
  Ref's HAND-CHECK; staying on the hip is one), `hoops.contactPoseOn` 1, `hoops.contactEaseInSec` 0.12 s, `hoops.contactEaseOutSec`
  0.2 s, `hoops.contactChestLeanDeg` 7° (the drawn poses: the defender's forearm toward the hip, the handler's free arm as a bar, the
  defender's chest in; drawn only, every rotation put back after the frame).

**assumption:** the bounds are safe, not tuned. A ranked, staked or head-to-head run reads every default above (`feel()` is closed there).

lane/dunk-flagship Phase 2 (group "Dunk · landing"), new, default unchanged: `dunk.landLeadSec` 0 s (`DunkFlagship.ts`
`LAND_LEAD_SEC`): how long before touchdown the landing absorb fades in. A 0.10 s lead measured worse on the rig (the hips arrive
faster into the same short crouch: landing hip pops 2 → 4), so it ships off; the owner's dial. **assumption:** the bounds (0 to
0.25 s) are safe, not tuned.

lane/hoops-p02-defense (1v1 / 3v3 ten-phase pass, phase 2 "defence is skill, not dice"; owner 2026-10-20 HOOPS DEFENSE; the owner has
felt none of these yet — every default is flagged in the lane report):

- Group "Hoops · blocks (hand meets ball)" (`hoops/blocks.ts`), **TUNED (new behaviour)**: `hoops.blockDiceOn` 0 (1 = today's block rolls
  back exactly: `aiBlockChance`, `checkBlock`'s window, `jumpSwats`, goaltending with no touch); `hoops.blkShoulderM` 1.55 m and
  `hoops.blkArmM` 0.85 m (the reach: a sphere of the arm around the shoulder, the shoulder riding the contest jump — 2.40 m standing);
  `hoops.blkContactM` 0.14 m (the ball's centre this close to the reach is a touch); `hoops.blkLookSec` 0.25 s (how much of a release's
  flight is read); `hoops.aiBlockLeadSec` **TUNED 0.15 → 0.25 s** (the AI leaves the floor this long before the release it expects, so the
  top of his jump meets the ball); `hoops.aiBlockReactOn` 0 (1 = his jump also waits out his tier's reaction after my gather: measured,
  a PRO jump then never reached a quick finish); `hoops.blkReleaseJumperM` 2.6 m (TUNED 2.45 → 2.6 after calls 1A / 2A) and `hoops.blkReleaseLayupM`
  2.5 m (the block reads the ball from where it leaves the hand, above the court: the release fires before the clip's arms are up,
  the rig read their layups leaving from 1.65–1.74 m, and from the chest any jump reached them); `hoops.blkDeflectMps` 2.4 m/s and `hoops.blkDeflectUpMps` 1.4 m/s (the ball off the hand, along
  the line it was hit).
- Group "Hoops · contest" (`hoops/contest.ts`), **TUNED (new behaviour)**: `hoops.oneContestOn` 1 (0 = each shooter's old formula);
  `hoops.contestRangeM` 2.6 m (the distance term's zero; was 2.2 on my jumper, 3.0 on theirs and my mates'); `hoops.contestDistW` 1;
  `hoops.contestJump` 0.32 and `hoops.contestJumpFloor` 0.35 (a contest jump on its curve: 0.32 at the top, 0.11 leaving or landing,
  0 once landed — was a flat 0.3 for 0.7 s); `hoops.contestCloseout` 0.1 and `hoops.contestCloseoutFullMps` 3 m/s (a closeout running AT
  the shooter adds up to 0.1; past him, nothing).
- Group "Hoops · defense" (`hoops/steals.ts`, `hoops/pressure.ts`), **TUNED (new behaviour)**: `hoops.stealDiceOn` 0 (1 = today's strip
  rolls: 0.22 a reach, 0.6 on the bump, 0.18 a bump strip); `hoops.stripReachM` 1.2 m (TUNED 0.95 → 1.2: the poke's own reach), `hoops.stripShieldM` 0.25 m,
  `hoops.stripBallMaxY` 0.85 m (the strip lands when his hand can get to the ball: in reach, not behind the handler's body, off the
  palm); `hoops.onBallCushionM` 1.35 m and `hoops.onBallCushionPerMps` 0.3 s (the on-ball man's most room on a moving handler: 1.35 m + 0.3 s ×
  his speed — about today's room against a 6 m/s sprint, pressure on a probing dribble; 0 = today's contain lever, uncapped).

**assumption:** the bounds are safe, not tuned; the defaults are this lane's calibration on the rig and the headless sim (lane report),
not owner numbers. A ranked, staked or head-to-head run reads every default above.

lane/hoops-p02-defense, coordinator calls 1A / 2A (2026-10-28), **TUNED**: `hoops.aiReachGate` 0.5 → 0.7 (a steal intent in range becomes
a reach more often; the strip is still his hand on the ball) and, new as a knob, `hoops.aiBlockJumpChance` 0.3 → 0.45 (`HoopsDefense.ts`
`AI_BLOCK_JUMP_CHANCE`: in range at my gather the AI leaves the floor this often, else a hand up; the block is his hand on the ball).

lane/hoops-p03-rivals (1v1 / 3v3 ten-phase pass, phase 3 "rivals that play basketball"; owner playtest 2026-10-27; the owner has felt none of
these yet — every default is flagged in the lane report). Group "Hoops · rival offense", all **new**:

- The 1v1 rival's MOVE KIT (`hoops/rivalOffense.ts`): `hoops.rivalKitOn` 1 (0 = the release's script exactly: check, weave, sidestep,
  step-back, three shots); the reads — `hoops.rivalTightM` 1.25 m (tight invites the spin, the hesitation and the post-up; off him, the
  crossover and the in-and-out), `hoops.rivalClosingMps` 1.6 m/s (closing this fast is a bite: the hesitation), `hoops.rivalSagM` 2.6 m and
  `hoops.rivalPullUpRangeM` 6.2 m (in his lane but this far off, inside this range: PRO and ELITE pull up), `hoops.rivalAdaptK` 1 (× the
  tier's adapt rate: how hard he leans on what worked against you); the moves — `hoops.rivalHesiSec` 0.3 s, `hoops.rivalHesiGoMps` 5.8 m/s,
  `hoops.rivalSpinSec` 0.6 s; the post-up — `hoops.rivalPostMinM` / `hoops.rivalPostMaxM` 2.6 / 10 m (the rim distances he posts from: a back-down from the check is in it — the rig's scripted defender holds him at the top, 9.4–9.9 m),
  `hoops.rivalPostMps` 1.4 m/s (the back-down), `hoops.rivalPostMaxSec` 1.6 s (then the turnaround), `hoops.rivalPostHookM` 2.3 m (inside it,
  a hook); the floater's corridor `hoops.rivalFloaterMinM` / `hoops.rivalFloaterMaxM` 2.0 / 5.0 m. No make chance reads a knob here: a
  floater and a fade are `rivalShotPct` 'jumper' from where they leave the hand, a hook a 'layup'.
- The 3v3 rival TEAM OFFENCE (`hoops/teamOffense3v3.ts`): `hoops.teamOffenseOn` 1 (0 = the release's one lerped drive exactly);
  `hoops.rivalTakeBackM` 6.9 m (a fresh possession is taken back beyond the arc first; 0 = from where he is), `hoops.rivalHandlerMps`
  3.4 m/s (his pace off the drive), `hoops.rivalProbeSec` 1.6 s (the probe at the top, × the tier), `hoops.rivalScreenWaitSec` 2.4 s,
  `hoops.rivalBudgetSec` 10 s (past it he attacks now, × the tier), `hoops.rivalAttackPullUpSec` 0.8 s (held in front on the attack, the
  pull-up), `hoops.rivalPullUpMaxM` 6.0 m (the off-the-dribble pull-up only inside it: the release's jumper base has no range term). The
  attack's pace is the release's `DRIVE_MPS` 5.4 m/s and the tell its `GATHER_TELL_SEC` 0.35 s; every finish (`rivalReleasePct`, the
  block, the contest) is the release's.

**assumption:** the bounds are safe, not tuned; the defaults are this lane's calibration on the headless possession sim
(`scripts/probes/hoops-gap/rival-sim.mts`) and the rig, not owner numbers. A ranked, staked or head-to-head run reads every default above.
