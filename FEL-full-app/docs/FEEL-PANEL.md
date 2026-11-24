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
lane/dunk-flagship Phase 5 (group "Dunk · body"), new, OFF by default: `dunk.realJumpPersonal` 0 (`DunkFlagship.ts`
`REAL_JUMP_PERSONAL`): on, the body path's full take-off is the athlete's own VERIFIED best countermovement jump (a saved Quick
Screen, read through GET /api/dunk/verified-jump: verified 18+ and opted in, checked at read time; lib/jump/seam.ts's verified
rule) instead of the fixed 0.70 m; clamped to 0.25–0.95 m. No verified jump: the fixed mapping. Like every knob, never in
ranked, staked or paid play.
lane/dunk-flagship (group "Dunk · run-up"), new, default unchanged: `dunk.runwayStrideScale` 1 (`DunkFlagship.ts`
`RUNWAY_STRIDE_SCALE`): the run-up's leg pace reference (3.6 ÷ 1.1 m/s, as shipped) × this. Re-paced to 3.95 m/s on the rig,
the run-up skated less at a sprint and more at 2.5–5 m/s, no overall gain, so the shipped pace stays and this is the owner's
dial. **assumption:** the bounds (0.8 to 1.4) are safe, not tuned.
lane/dunk-flagship (group "Dunk · slam"), TUNED, flagged: `dunk.slamHitStopBigMs` 100 ms and `dunk.slamShakeBig` 0.18
(`DunkFlagship.ts` `SLAM_HITSTOP_BIG_MS`, `SLAM_SHAKE_BIG`): a perfect slam's hit-stop and shake. Every make froze 70 ms and
shook 0.12 before; an ordinary make (accuracy ≤ 0.5) still does, and cleaner ones grow toward these (`slamImpact`).
**assumption:** the bounds (70–160 ms, 0.12–0.30) are safe, not tuned.

lane/dunk-flagship Phase 7 (group "Dunk · finishes"), new, OFF by default: `dunk.slamVariants` 0 (`DunkSlamVariant.ts`
`SLAM_VARIANTS_ON`): on, the LEFT STICK held at the A press inside the slam window calls the finish — back (away from the rim)
a REVERSE (`dunk_finish_reverse`; the body turns its back to the iron at 15.7 rad/s and meets it once 0.8 of the half-turn is
done), up a TWO-HAND POWER (`dunk_finish_two_hand`), each named on the card (+0.6 / +0.3 difficulty, new numbers). Read only on
the live press inside the window; a called air trick keeps its own flush; the d-pad tricks are untouched (DunkSlamVariant.test).
Like every knob, never in ranked, staked or paid play.

lane/dunk-flagship P11 (group "Dunk · finishes"), new, OFF by default: `dunk.finishOverRing` 0 (`DunkOverRing.ts`
`FINISH_OVER_RING`; owner call 1 of 2026-11-10: the shipped finish stays, this is the A/B to feel first). 0 = the shipped finish,
line for line: the ball meets the front of the rim and the flush carries it in. 1 = the hand carries the ball over the ring —
up in front of the rim, in over the lip, down through the middle — and lets it go inside the ring. Every dunk in the mode ends
this way while it is on (the plain flush, the REVERSE, the TWO-HAND POWER, a called trick's flush). The numbers behind it are all
new and read only with the knob on (`OVER_RING` in `DunkOverRing.ts`); the measured table is in `docs/DUNK-FLAGSHIP.md` §17.
A ball the hand could not carry over in time is let go at the front of the rim as shipped: the knob never turns a make into a
miss. Like every knob, never in ranked, staked or paid play (DunkUnlocks.verifiedJump.test proves it on this knob).

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

lane/hoops-p04 (1v1 / 3v3 ten-phase pass, phase 4 "feet and transitions"; owner 2026-10-20: "blend + minimum-hold rules on every clip
change"). The owner has felt none of these yet; every default is flagged in the lane report.

- Group "Hoops · transitions" (`anim/hoopsTransitions.ts`), **TUNED (new behaviour)**: `hoops.transitionRuleOn` 1 (0 = every state's
  own fade and the old dwell exactly); the fade floors — `hoops.gaitFadeSec` 0.22 s (dribble / run loop to loop; was 0.10–0.18),
  `hoops.defenseFadeSec` 0.2 s (slide / backpedal / closeout / crossover step; was 0.12–0.20), `hoops.crossFadeSec` 0.2 s (offence ↔
  defence, a loop after a beat), `hoops.beatFadeFloorSec` 0.1 s (a mode's beat: a move, a reach, a shot — the clip still starts on the
  press's frame; was as low as 0.05), `hoops.priorityFadeSec` 0.08 s (a stagger, the floor, a dunk); `hoops.minHoldSec` 0.22 s (a loop
  plays this long before a sibling loop replaces it — the release's dwell, now for every loop group).
- Same group (`hoops/releaseTiming.ts`): `hoops.releaseToClipOn` 1 (the rival's jumper / finish clip is paced so the ball leaves on its
  release key — the 3v3 tell, the 1v1 gather; 0 = the clip from its first frame, as before) and `hoops.jumperFromRiseOn` 1 (the hero's
  jumper is entered at its rise, its load dip skipped, and paced from there to the green; 0 = from the first frame). Neither moves a
  release in time or a make chance: only the clip moves.
- Same group (`anim/basketballTree.ts`, **TUNED (new behaviour)**): `hoops.plantReleaseFadeSec` 0.12 s — the plant-and-cut lock (0.18 s)
  lets its foot back to the clip over this instead of in one frame; 0 = the old one-frame release. (Correction, hoops-p04b: p04 credited
  the hero's 8–10 000 °/s thigh spike to this lock's release. The rig's stage tracer puts it on the stop accent below; this fade stays as
  a general one-frame-release fix, not as that spike's cure.)
- hoops-p04b, same group (`anim/locoAccent.ts`): `hoops.accentOffBeatsOn` 1 — the stop / start accent (the sink and lean, legSink's leg
  re-solve) is off while the tree plays a beat or a hold, as the layer's header always said; 0 = it read the loop state under a beat and
  kept sinking through the step-back gather (the thigh spike: 7 396 and 10 254 °/s, 1v1 seed 7 frames 343 / 349, traced to this layer).
- hoops-p04b, same group (`hoops/contactPoses.ts`, **TUNED (new)**): `hoops.contactArmSwapSec` 0.15 s — which arm the contact poses drive
  (the defender's hand-check arm, the handler's arm bar) eases per arm over this when it changes, and a handle move lets the bar go over it
  (the hand-check keeps the last ball side through the move); 0 = the one-frame swap (3v3 seed 7: one arm 0 → 79°, the other 58 → 0° in
  a frame, 3 500–6 000 °/s). A body's first contact still takes its arm at once (the hand-check's own k eases in).
- hoops-p04b, same group (`anim/ballCarry.ts`, **TUNED (new)**): `hoops.carryArmSpeedSec` 0.12 s — the dribble's arm weights (the ball
  arm's pace reach, the off arm's swing in at 0.35–0.65 of speed) follow the body's speed eased over this; a gear change stepped them in
  a frame. 0 = the frame's speed, as before. The ball's push-ahead and the guard keep their own easing.
- hoops-p05, same group (`anim/ballCarry.ts`): `hoops.carryLetGoToClipOn` 1 — when a shot, a pass or a pick-up takes the ball out of the
  dribble, the ball arm (and the off arm) eases ALL the way back to the clip's pose over the let-go's own fade (0.14 s, unchanged). 0 = the
  let-go as it was: the reach's target faded but the solved arm still sat about 44° off the clip on the fade's last frame and cut there in
  one frame (the step-back gather, 1v1 seed 7: about 3 967 °/s, the hero's last severe pop in phase 4b). No new time, so no new number.
- hoops-p05b, same group (`anim/ballCarry.ts`): `hoops.carryStartHandOn` 1 — a dribble starts from where the palm had the ball, and that
  offset fades out over the first bounce (START_FADE_PHASE, unchanged). Only the ball took it: the hand went straight to the stroke's own
  point, so the palm sat the offset off the ball through the whole first bounce (1v1 seed 7, the gear stop into the sprint: the first top
  drawn 12.8 cm off; the hand tracer has the carry's own pass take the palm from on the ball to 13.5 cm off it). The hand now takes the
  same faded offset — starting from where the hand held the ball (the held ball sits in the palm, not under the stroke's hand point),
  so the wrist does not jump round the ball on the first frame — and the reach that takes the arm over from the hold keeps the elbow's
  swing limit (720 °/s, unchanged) from its
  first frame (without that, aiming the hand at the real ball swung the upper arm 8 696 °/s on the rig's first dribble frame). 0 = as it
  was. No new number.
- hoops-p05, the hero's slide (owner 2026-11-10: "fix it"), same group. Each is NEW BEHAVIOUR, on by default, with 0 = today's exactly:
  - `hoops.backpedalReverseOn` 1 (`anim/basketballTree.ts`) — the captured backpedal (CMU 78_24) is a forward run on the hero rig, so a
    retreat was a moonwalk (the feet ran forward on the spot while the body backed off). 1 plays it in reverse: the feet plant and the body
    backs off over them. The stride reference is unchanged (3.31 m/s). 0 = forward, as before. Every body with the capture (hero, rival,
    3v3) gets it: it is the clip's direction, not a hero rule.
  - `hoops.defenseLegsOn` 1 (`anim/basketballTree.ts`, `anim/moveLegs.ts`) — the steal reach, the block reach and the held hand-up are
    whole-body clips whose feet stand still. While one plays on a body moving on the floor, the legs keep the defensive loop they were in
    (stride-matched, by speed: none under 1.0 m/s, all from 2.4 — the legs layer's own numbers), follow a change of direction after the
    usual 0.22 s hold with the defence loops' own 0.2 s blend, and stand down in a block jump's flight. 0 = the clip's standing legs.
  - `hoops.hipSteerOn` 1 (`anim/hipSteer.ts`, the hero in 1v1 and 3v3, on defence only) — the pelvis and legs turn toward where the body
    is going while the chest stays on the man, so a diagonal slide or retreat steps along its travel. **NEW NUMBERS (flagged):**
    `hoops.hipSteerMaxDeg` 50° (the most the pelvis turns off the chest), `hoops.hipSteerSec` 0.14 s (the ease), `hoops.hipSteerFromMps`
    0.8 m/s and `hoops.hipSteerFullMps` 1.8 m/s (no turn under the first, all of it from the second). 0 = square hips, as before.
- hoops-p05b, same group: `hoops.closeoutStepOn` 1 (`anim/basketballTree.ts`; the clip `bball_closeout_step`, authored in
  `anim/authored/basketball.ts`) — the closeout fires only at 2.9 m/s and up, but the old closeout swung its legs in place (about 0.9 m/s at
  its rate cap), so every closeout skated. The new clip is the same picture (chest up, hips low, one hand high) on chop steps paced to the
  closeout's stride reference, 3.6 m/s at rate 1 (2.0–6.7 m/s across the stride matcher's range). Bench, the man 2 m ahead, 3–6 m/s:
  slide p90 9–12 → 0.1–1.0 cm a frame. 0 = the old closeout clip exactly. No new feel number (the clip's own keys are pinned by a test).
- hoops-p05b, same group: `hoops.loopInStepOn` 1 (`anim/basketballTree.ts` RIGHT_STRIKE_PHASE) — the stepping closeout started on its
  first frame (the right foot landing) wherever the run it cut was in its stride, so through the crossfade the two clips had the legs in
  opposite stances (3v3 seed 7: the two leg pops the switches added, 741–809 °/s). A run into it now starts it at the same point of the
  stride. The table's numbers are where each clip's right foot lands (bball_mc_run 0.88, measured with the slide bench), not feel
  numbers. 0 = as it was.
- hoops-p05, phase 5 (the ball lives in the hand), same group: `hoops.passFromHandOn` 1 (`hoops/ballHandoff.ts`) — a 3v3 teammate's
  pass (the swing, the ball back to me, the lob) starts its flight where the ball is in his hands; it started at his root + 1.2 m, so the
  ball jumped out of the hand on the release. The aim point and the pass speed are unchanged. 0 = the old start.
- hoops-p05b, phase 5, same group: `hoops.passHomeOn` 1 (`hoops/ballHandoff.ts`, `core/BallHandling.ts` PassFlight.homeTo) — a 3v3 chest
  or bounce pass in flight eases its landing point from where it was aimed (the receiver led at the ball's speed) onto where the receiver
  really is, at the same chest height (smoothstep in the flight's progress: nothing at the throw, all of it at the catch). The flight time
  is the throw's, so catch timing is unchanged. It landed on its aim wherever he was: 3v3 seed 7, the hero's pass to mate1 caught with his
  palms 1.14 / 1.48 m off the ball and drawn into the hand in one frame (1.67 m). The lob keeps its own aim. 0 = as it was.

**assumption:** the bounds are safe, not tuned. A ranked, staked or head-to-head run reads every default above.

lane/gameplay-clean-3 (owner: "Gameplay needs to be really clean"; the runtime pops clip-smooth could not reach). The owner has not felt it
yet.

- Group "Anim · transitions" (`anim/FootPlanting.ts`), **TUNED (new behaviour)**: `anim.plantEngageSec` 0.1 s. The foot planter on every
  body now eases its two-bone leg solve in when it starts holding a foot and out when it stops, instead of stepping in one frame. The
  solve throws the knee toward the root's forward, so on a stance whose knees open elsewhere (Derby's batter) the first solved frame
  was a 25° thigh jump with the foot still. 0 = the old one-frame engage and release exactly. The pin, its weight curve and its release
  fade (`RELEASE_FADE_SEC` 0.1 s) are unchanged.

- Same group (`anim/PostureLayer.ts`), **TUNED (new behaviour)**: `anim.hipYawFold` 1. A posture window that keeps only part of the
  clip hip turn (Football Rush `spin`, keep 0.5) read the clip yaw WRAPPED, which jumps from +180 to -180 degrees: the hips flipped
  180 degrees in one frame at the half-turn. The read is folded past 90 degrees (unchanged up to 90, back to 0 at 180), so the strip
  is continuous. 0 = the old wrapped read exactly.

- Same group (`anim/FootPlanting.ts`, lane/gameplay-clean-4), **TUNED (new behaviour)**: `anim.plantReleaseSec` 0.1 s, the release
  fade's own time. A pin the clip lets go of (a lift, a take-off, a landing) now eases back onto the clip in ROTATION: the hip and knee
  the layer wrote last are held and slerped onto the clip's. The old release faded the target and solved it each frame, which rebuilt
  the leg in one frame when the root or the clip jumped on that frame (Football Rush's hurdle and TD spike: thighs 41 to 70 degrees a
  frame). 0 = the old target fade exactly.

- Same group (`anim/FootPlanting.ts`, lane/gameplay-clean-5), **NEW (on / off, no tuned number)**: `anim.plantReplantEase` 1. A foot
  that plants again while its leg is still easing off the last plant keeps easing (the release carries on under the new plant). The
  clean-4 release ended on the spot at a replant and the leg snapped the rest of the way in one frame: a body sliding in a stance let
  each foot go at the drift limit and took it straight back, so a thigh jumped about 33 degrees at every replant (measured headless,
  `FootPlanting.replant.test.ts`; 6 degrees with the clean-4 release off). 0 = a replant ends the release at once, exactly as before.
  Feel-check: Showdown or Karate, walk and strafe in guard; watch the knees.

- Same group (`anim/CharacterAnimator.ts`, lane/gameplay-clean-5), **NEW (on / off, no tuned number)**: `anim.fadeHoldEnded` 1. A
  one-shot move (a strike, a hit react) that reaches its last frame while it is still blending out is held on that frame until the
  blend ends. Before, it stopped mid-blend, the weight it still had was gone in one frame, and the body jumped toward a stale pose:
  Showdown's hit react into guard moved the arms 21 to 30 degrees and the thighs 22 to 25 in one frame, every time (the rig); on the
  hero headless 33 degrees, now 16, no worse than the blend around it (`CharacterAnimator.fadeHold.test.ts`). 0 = the old behaviour
  exactly. No blend time changed. This is the shared animator: every mode's moves blend out through it, the hoops modes included.
  Feel-check: Showdown, take a hit and watch the body come back to guard.

- Same group (`anim/FootPlanting.ts` + one call in `modes/AeroAcesMode.ts`, lane/gameplay-clean-5), **NEW (on / off, no tuned
  number)**: `anim.plantSeatedOff` 1. A body its mode seats in a vehicle holds no foot plant. Every spawned hero carries the foot
  planter, and the Aero Aces pilot sits with his ankles at the root's height, so the planter pinned his feet to the ground while the
  plane flew on and let them go a frame later: knees 51 to 63 degrees and thighs 22 to 40 in one frame, 2 to 3 hard pops a run (the
  rig; none with the planter off). Aero now marks its pilot seated. 0 = the mark is ignored, exactly the old layer. Feel-check: Aero
  Aces, watch the pilot's knees through a loop.

**assumption:** the bounds (0 to 0.4 s) are safe, not tuned. A ranked, staked or head-to-head run reads the defaults.

## Owner calls, 2026-11-10 (delegated: "handle those 5 open calls"; lane/owner-calls-1110)

The owner has not felt this yet.

- Group "Anim · transitions" (`anim/footballTree.ts`), **TUNED (flagged)**: `football.hurdleFadeSec` 0.12 s (was the stiff-arm slot's
  0.06 s, which the hurdle shared). How long the carry blends into the hurdle's jump. Measured headless on the hero over 24 carry
  phases, at 1× and 1.4× carry rate (`footballTree.hurdleFade.test.ts`): the worst one-frame thigh turn is 24–25° at 0.06 s (the rig
  read 26° in play), 15–17° at 0.12 s, 13–15° at 0.15 s; the knee 12–13° → 7.5–8.7°. The carry's own stride is about 6° a frame.
  0.06 = the old blend exactly. The juke, the spin and the stiff arm keep 0.06 s. Feel-check: football, hurdle a downed man at a
  sprint; do the legs tuck with the hop, or lag it?

## Baseball bat, 2026-11-10 (lane/bat-grip-2)

The owner has not felt this yet.

- Group "Baseball · bat" (`modes/baseballBat.ts`), **NEW numbers (flagged)**: `baseball.batGripLostM` 0.4 m and
  `baseball.batGripBackM` 0.3 m. The bat (Derby and the three-innings batter) is drawn only while both fists can be on it: it hides
  once the fists are more than 0.4 m apart and comes back when they close to 0.3 m. Before, the bat was strung between the two
  hands whatever the arms were doing, so the innings batter coming back to the stance (after a strikeout, a run, a celebration)
  held it across hands 0.5 to 0.8 m apart for the first tenth of a second. Measured on the clips (`baseballBatHeld.test.ts`,
  `scripts/probes/bat-grip-2/blend-headless.ts`): a held stance reads 0.07 m, the swing's follow-through 0.23 m, the swing back to
  the stance 0.35 m at its widest (the bat stays drawn through it), a free hand 0.40 m and more. `batGripLostM` at its 2 m maximum
  never hides the bat: the old behaviour exactly. Draw-only: no score, grade or timing reads the bat. Feel-check: baseball, strike
  out or get a hit and watch the batter come back to the plate; does the bat appear in the hands cleanly, or pop in late?
  **assumption:** the bounds (0.25 to 2 m, 0.1 to 0.4 m) are safe, not tuned.
## gameplay-clean-5, 2026-11-10 (the hurdle's way out; the owner has not felt this yet)

- Group "Anim · transitions" (`anim/footballTree.ts`), **TUNED (new, flagged)**: `football.hurdleExitFadeSec` 0.2 s (the hurdle used
  the carry's own 0.1 s on the way out). How long the hurdle's jump blends back into the carry. The jump's clip runs out a few frames
  before the landing and the arms came down from the jump's reach to the tuck in six frames: the rig read LeftArm 31, RightArm 23 and
  RightForeArm 15 degrees a frame at every hurdle, football's last repeating hard pop. Measured headless on the hero over 6 carry
  phases at 1× and 1.4× (`footballTree.hurdleExit.test.ts`): the off arm 30.9° a frame at 0.1 s, 19.6° at 0.16, 15.7° at 0.2, 12.6°
  at 0.25. 0.1 = the old blend exactly. Every other way into the carry (the snap, a juke, a spin, the stiff arm) keeps 0.1 s.
  Feel-check: football, hurdle at a sprint; do the arms come down with the landing, or hang in the air after it?

lane/dunk-switch-on (owner 2026-11-10, "turn all 4 on"): `dunk.finishOverRing` and `dunk.slamVariants` default **1** (both off in
staked, ranked and challenge runs whatever the default; 0 restores the old finish / slam exactly); new `dunk.slamPower` 1 (the
TWO-HAND POWER on its own); `dunk.runwayStrideScale` **TUNED 1 → 1.1** (1 = the old pace); new `dunk.landAbsorbDeep` 1 (the deep
landing; 0 = the old `dunk_land_absorb` alone). Measurements in docs/DUNK-FLAGSHIP.md §18.

## gameplay-clean-6, 2026-11-10 (owner: "address what you found"; the owner has not felt these yet)

- Group "Anim · transitions" (`anim/ballCarry.ts`), **NEW (on / off, no tuned number)**: `anim.carryPushedBounce` 1. The dunk run-up's
  dribble uses the pushed bounce the hoops modes already use: the ball is fastest at the floor and the hand meets it slowing at the
  top. The old bounce was fastest at the hand and turned round there in one frame, and the ball arm turned with it: 35 to 60 degrees
  in one frame at every bounce (the rig's dunk run-up: 14 hard pops in 14 s). Headless on the hero: 56.8 → 26.2 degrees. Only the dunk
  runway uses this carry. 0 = the old bounce exactly. Feel-check: dunk, run up with the ball; watch the dribbling arm.
- `anim.inertial` (AF-1's inertial clip transitions, existing knob, still **0**): when on it now reaches every spawned body (it was
  the heroes of the modes that opted in), and three of its holes are fixed with no knob of their own (they only run while a body is
  inertial): a switch made from a clip's end callback (the late switch: a hit react or knockdown running out into the idle threw the
  arms 55 to 57 degrees in one frame), clips that key only some bones (a leg the guard does not key: 35.7 degrees), and a node no
  clip shown so far had keyed (guard to the high kick: the knee 68.4 degrees; now held by `anim.inertialAllBones`).
- The switch-on lane's inertial work, taken over by this lane (coordinator 2026-11-10; `docs/SWITCH-ON.md` section 6 on
  lane/switch-on), merged on top of the three fixes above. All read only while a body is inertial; each off value restores AF-1:
  - `anim.inertialAllBones` 1 (new): every bone any of the body's clips keys keeps its pose history; a bone the new clip does not key
    eases onto its bind pose. 0 = AF-1.
  - `anim.inertialMatchVel` 1 (new): the offset is a 3-D rotation vector starting at the old motion's speed minus the new clip's. 0 = AF-1.
  - `anim.inertialMinHalfLifeSec` **0.045 s** (new number): the shortest half-life an offset decays with (AF-1's 0.5 x the fade is
    0.02 to 0.03 s on the fighters' switches). 0 = AF-1.
  - `anim.inertialModesOn` **1** (new switch, ON): the inertial blend on by default on the hero in karate, karate VS, showdown, mixed
    combat, duel and skateboard, the modes measured better; 0 = those modes linear exactly as before. Every other mode stays linear
    unless `anim.inertial` is 1. Measurements and the per-mode decision: GAMEPLAY-CLEAN-AUDIT section 4h. Feel-check: karate, throw
    jabs out of a run; showdown, take a hit; skateboard, push and ollie.

## gameplay-clean-7, 2026-11-11 (owner: "address what you found above"; the owner has not felt these yet)

All in group "Anim · transitions", all **NEW (on / off, no tuned number)**; each 0 restores the old behaviour exactly. Measurements:
GAMEPLAY-CLEAN-AUDIT section 4i.
- `anim.inertialEndedHold` 1: with inertial transitions, after a hit react or a knockdown has FINISHED and the idle takes over, the legs
  the idle does not move stay where they are, as with the plain crossfade. Before, they swung back to the rest pose: the hero's thighs
  up to 25 degrees a frame for about 10 frames (headless: 25.1 to 4.9 degrees; the plain crossfade 5.0). A move cut before its end
  still eases those bones the old way (it matches the plain crossfade there). Feel-check: karate or showdown, get hit and stand still.
- `anim.inertialHipsPos` 1: with inertial transitions, the hip height eases into the new move like the rotations do. The blend looked
  for the hips by a name the bodies a mode spawns do not have (`Hips_c240`), so on every in-game body the hips jumped to the new move's
  height in one frame (headless, crouch to idle: 25 cm in a frame to 3 cm; in play, the six inertial modes' largest hip step a frame
  22-43 cm to 4-13 cm). The trade: skateboard's first push bends the right leg about 36 degrees for one frame (all three runs). Feel-check:
  karate, a knockdown and the get-up; skateboard, the first push.
- `anim.inertialFootballOn` 1 and `anim.inertialSurfOn` 1 (new switches, ON): the inertial blend by default on the football runner and
  on the surfer (the rig measured fewer hard pops on each, two runs a side). 0 = the plain crossfade there, exactly as before.
  Feel-check: football, juke and hurdle; surf, air and land.
- `anim.inertialTwinLinear` 1: when a basketball body switches the ball to the other hand, that one switch uses the plain crossfade
  even with inertial transitions on (inertial, both upper arms flipped about 128 degrees in one frame after every hand change in
  3v3). Only matters where a basketball body is inertial, which none is by default.
- `anim.celebrateEase` 1: the arms-up celebration after a made shot or a dunk (`dunk_mc_celebrate_big`) turns the upper arms at most
  about 20 degrees a frame; its capture swung them 28 to 32 degrees a frame as the elbows came out (headless: 29.5 / 31.5 to 15.9 /
  16.2 degrees). The clip is re-keyed when it is built; the file is not edited. Feel-check: 1v1, make a shot.

## hoops-p06, 2026-11-12 (1v1 / 3v3 phase 6 "flow and pace"; the owner has not felt these yet)

Group "Hoops · flow and pace". Each is NEW; 0 restores the old behaviour exactly (tests pin both). Measurements: HOOPS-GOAL-GAP §3i.
- `hoops.boardBounceOn` 1 (`hoops/rebound.ts`): the board RACE the modes fall back on (a swat at the rim, a block at the release, a
  rattled-out dunk, and a live board nobody came down with in 4 s) has no die any more. It goes to the body nearest the spot where the
  ball next comes down to `hoops.boardTakeYM` (2.4 m), less the seal (the mode's own 1.6 m) and `hoops.boardJumpEdgeM` (0.5 m) for a
  jump that is still up. A dead heat goes to the defence. 0 = distance plus a 2.6 m random term, as before. Most boards were already
  physical (the live board) and do not change. Feel-check: 1v1, get a shot swatted, then box out a miss.
- `hoops.replayCapSec` 2.5 s (`court/hoopsMoments.ts`): a big-play replay (a dunk, a block, an ankle-breaker) holds the game at most this
  long on screen, cut to the window around the moment (60 % before it, 40 % after). Before it was 2.4–5 recorded seconds at half speed:
  4.8–10 s before the next possession. 0 = the old length. Feel-check: dunk on him; the replay should be short and on the moment.
- `hoops.rivalSizeUpSec` 4 s (`hoops/rivalOffense.ts`): after the check the 1v1 rival works you beyond the arc (a walk to the top, a slow
  weave, a probe move about every second — the kit's moves at a third of their push) for this long (× ROOKIE 0.75 / PRO 1 / ELITE 1.15,
  ± 25 %) before he attacks. A probe that beats you ends it at once; a reach that misses is punished as often as his tier reads
  (ROOKIE 15 %, PRO 55 %, ELITE 90 %); the 6 s shot clock counts only the attack after it. 0 = he attacks off the check, as before.
  Feel-check: 1v1 PRO on defence: does he size you up, and does reaching at the top cost you?
- `hoops.teamSizeUpSec` 1.5 s (`hoops/teamOffense3v3.ts`): the 3v3 rivals' FIRST touch of a possession (not a swing's catch) probes
  this much longer at the top (× the tier's probe share), with one more probe move. Flag: the same lever as `hoops.rivalProbeSec`, on
  the first touch only. 0 = the probe as before.
- `hoops.handChangeCatchLeadSec` 0.45 s (`anim/ballCarry.ts`; `anim/handlePaths.ts` pathAt's `catchLeadSec`): on a dribble HAND CHANGE (the
  carry's own crossing, not a stick or AI move) the hand that will catch the ball starts to come and meet it this long before the catch.
  It used to be the schedule's 0.06 s: the arm swung 100–140° in four frames at the move limit (a hard pop on both arm bones). Headless,
  the hero with the carry, 64 hand changes: hard events within half a second of a change 56 → 35; the catching palm on the catch frame
  unchanged (median 0.20 m both). 0.06 = as before. Feel-check: 1v1, dribble at a stand and switch hands with the stick.
- Phase 7 (bodies that touch) adds no knob: both its gates already read true on the release (0 overlap frames in nine rig runs; defensive
  clip changes ≤ 2.5 a second, the 1v1 hero 0.6 with the size-up on). The 3v3 pair loop now reads the one standoff (`BODY_STANDOFF / 2`,
  the same 0.55 m it typed). HOOPS-GOAL-GAP §3i.
- `hoops.guardHandRestGapSec` 1.5 s (`modes/hoopsFlow.ts`; the play audit's sinker 1, HOOPS-AAA-GAP-PLAY): standing guarded (under 0.6 m/s),
  the automatic outside hand crosses the ball at most once in 1.5 s; it crossed about once a second, and every crossing is a hand change
  (the audit: 14 of 21 hard pops in a 22 s idle 1v1 run). On the move it is the rule as before (`hoops.aiHandDwellSec` 0.35, `hoops.aiHandGapSec`
  0.9, unchanged). Its crossing also takes `hoops.handChangeCatchLeadSec` (headless, that path: 56 → 35 hard events in 64 changes, as the
  carry's own). 0 = as before. Feel-check: 1v1, stand dribbling with him shading you; the ball should not ping-pong.

### hoops-p08 — clean screen (2026-11-12)

Group "Hoops · screen". Each is NEW; its off value restores the old behaviour exactly (tests pin both: `lib/babylon/ui/hudHints.test.ts`).
The audit is `docs/HOOPS-AAA-GAP-SHOW.md` (sinkers 2 and 4); the before / after counts are in the lane's report.
- `hud.mcSubsWithVoice` 0 (`ui/micSubtitles.ts`): a line the court's MC is saying out loud (ModeMic marks `micVoiced` when the line's audio
  starts) shows no subtitle box; the player can turn subtitles on with the new CC chip beside MC (kept on the device), and a line with
  no audio (the voice off, no bank, no Web Audio) always shows its words. Screen readers are unchanged (they read `mic` from the caption
  bus). 1 = every line subtitled, as before. Feel-check: 1v1 on a phone; the MC talks and nothing covers the player.
- `hud.hintPlays` 3 (`ui/hudHints.ts`): the one-line control hint in 1v1 and 3v3 shows for the first three plays of a mode in a session
  (a play ends at a score on either side, a shot or dunk that starts, the next ball, the next dunk), then stops. "GET OUT OF THE PAINT"
  is a rule warning and always shows. On a touch screen the hint never names a pad button or a key: a button the touch deck has is
  named by the deck's own word (SQUARE (L) → SHOOT), and any part that still names a pad or a key is dropped. 0 = always, as before.
- `venue.halfCourtCrowdCards` 0 (`nexus/veniceBoardwalk.ts`): the boardwalk row's twelve flat cut-out figures stand behind the dunk's
  rim only (the dunk and the duel). 1v1, 3v3 and 3-Point stand on the same Venice and had them right behind their rim; they no
  longer load the file. 1 = on every Venice court, as before.

### hoops-p08 — phone budget (2026-11-12)

Group "Hoops · phone budget". Each is NEW; its "as before" value restores the old build exactly. What they cut was found with the lane's
census probe (`scripts/probes/hoops-p08/scene-census.mts`: the phone's worst frame, mesh by mesh); `scripts/hoops-phone-budget-tests.ts`
holds the result in CI. Phone tier only unless said.
- `perf.phoneInkTrim` 1 (`scene/phoneCasters.ts`): the ink contour (AnimeInk: two extra draws a part) skips the eyes, the shoe soles, the
  socks and the accessories — each inside a bigger part's outline. The body, hair, top, shorts and shoes keep their line. 0 = every part.
- `perf.phoneSockCast` 0 (`scene/phoneCasters.ts`): the sock stays out of the 512² shadow map (its shadow is inside the leg's). 1 = it casts.
- `perf.phoneFarPropTex` 512 (`scene/phoneTextureCap.ts`): in 1v1, 3v3 and 3-Point the parked bus and sedan (30–60 m off) and the ball
  (24 cm) upload their maps at 512² (37 MB → 9 MB). The dunk parks the bus on its corner as a wall-run prop and keeps 1024². 1024 = as before.
- `perf.propMergeOn` 1 (`visual/VenueProps.ts`, every tier): a prop model's parts that share a material are one thin-instanced mesh (the
  far pier: fifteen parts in two materials → two; the Venice dunk set: 35 masters → 22). Same geometry, same placements. 0 = one per part.
- `venue.veniceLookV2` 1 (`lib/adventure/venice/courtsDressing.ts`, the Venice hub; improvement pass phase 5, NEW): chain-link fences (open
  on the walk-up side), benches (the run's long bench), light poles, a name board per court on one atlas, and PBR grounds and sea. 0 = V1's
  look (its floating name signs).
- `venue.veniceLife` 1 (`lib/adventure/venice/hubLife.ts`, the Venice hub; improvement pass phase 6, NEW): gulls wheeling over the sea (one
  thin-instanced billboard draw; a phone flies 3, desktop 6) and, on desktop and up only, people standing at Court 2's sideline and by the
  other courts (the shipped crowd bodies). A phone gets no crowd-tier people (cut-out cards); `venue.venicePhoneWatchers` stands six real ones. 0 = V1's empty park.
- `venue.venicePhoneWatchers` 1 (`lib/adventure/venice/hubLife.ts`, the Venice hub; V2, NEW, owner 2026-11-18): a phone stands six real
  people at the courts (four at the run, two by Court 1) — the crowd's baked bodies, never its cut-out cards. 0 = gulls only.
- `venue.veniceCourtLife` 1 (`lib/adventure/venice/courtLife.ts`, the Venice hub; V2, NEW): a shooter working round Court 4's arc (the
  shipped jump shot, follow-through and catch; the ball arcs to the rim, in or off the iron), and on desktop a rebounder there, a pair on
  Court 1 and a jogger on the bike path (no riding clip fits). A phone gets none: one shooter measured 57-77 draws against the phone row's 56, even without its outline and shadow. 0 = empty courts.
- `venue.veniceCamCollide` 0 (`lib/adventure/venice/courtsDressing.ts`, the Venice hub; V2, NEW): one invisible proxy mesh of the park's
  solids (fences, poles, posts, hoops, palms, the boardwalk row) and name boards, flagged for the shared CameraDirector's own occlusion
  probe. No camera number changes. 1 leaves the see-through chain-link fences out (measured with them in: the pull-in at a fence jumped
  3-5 m in a frame and swung off the player); 2 puts them in; 0 = the camera passes through everything, as before. SHIPS AT 0
  (reverted, 2026-11-18): at the boardwalk row level 1 cut the camera 3.9 m in one frame to straight overhead (the director's
  boxed-in fallback). Easing the shared director's pull-in is the owner's call; the levels stay for that test.
- `venue.veniceSound` 1 (`lib/adventure/venice/hubSound.ts`, the Venice hub; improvement pass phase 7, NEW): the ocean bed, dribbles and
  shots from unseen pickup games down the beach, the run cheering now and then near Court 2, and footsteps (concrete vs sand), all through
  SoundKit (mute and volume apply; the recorded hoops bank once loaded). 0 = V1 (the harness's mood crowd bed).
- `venue.veniceSolids` 1 (`lib/adventure/venice/hubSolids.ts`, the Venice hub; improvement pass phase 8, NEW): the hoop posts, the boardwalk
  row's front, the palms in the park and (with `venue.veniceLookV2`) the fences, benches, light poles and board posts are block pieces: walls
  to the movement sim's own step rule. No movement number changes. 0 = V1 (walk through them).
- `venue.walkupV2` 1 (`lib/adventure/venice/hubSolids.ts`, the Venice hub; improvement pass phase 8, NEW): a court's card comes up on the
  court or in its gold ring after 0.25 s, and holds until a metre past. 0 = V1 (a 28 m box round the court, behind the fence too, at once).
- `venue.veniceWayfinding` 1 (`lib/adventure/venice/hubUi.ts`, shown by `app/play/venice/wayfinding.tsx`, the Venice hub; improvement pass phase 9, NEW): the first-visit hint (once per
  device), the north-up mini-map of the four courts with you on it, and the card's keys (Enter or X plays, Y plays with your party). 0 = V1.
- `venue.coastDoor` 1 (`lib/adventure/venice/coastDoor.ts`, drawn by `coastDoorView.ts`, the card in `app/play/venice/stage.tsx`; lane/coast-door, NEW): the boat to the Coast and Islands. A jetty and a boat on the sand west of the courts (a stand-in for the pier end until the Pier district is walkable); step into its gold ring and the card's "Take the boat to the coast" opens `/play/coast?from=venice&spot=pier.end`; the coast's way back (`?spot=pier.end`) lands you beside the ring, facing the boat. 0 = no boat, no card, and `?spot=pier.end` lands at the court gate as before. One draw (the landing, merged), the ring an instance of the courts' own.
- `venue.storyDoor` 1 (`lib/adventure/venice/storyDoor.ts`, drawn by `storyDoorView.ts`, the card in `app/play/venice/stage.tsx`; lane/story, NEW): the story gate. A stone gate on the sand east of the courts, mirroring the boat; step into its gold ring and the card's "Play the story" opens `/play/adventure?from=venice`; the story's "Back to Venice" opens `/play/venice?spot=story.gate` and lands you beside the ring, facing the gate. 0 = no gate, no card, and `?spot=story.gate` lands at the court gate. One draw (the gate, merged), the ring an instance of the courts' own.
- `story.endCard` 1 (`lib/babylon/adventure/story/progress.ts`, shown by `app/play/adventure/stage.tsx`; lane/story, NEW): when a chapter ends, its end card (the chapter's recap, the XP its beats paid, the level, the spell and the gates it opened, then the next chapter or "to be continued"), with Keep exploring and the way out. Its words are data (`[DRAFT]` until the owner writes them). 0 = the chapter ends straight into the hub's free roam, as before.
- `story.foeFallBack` 1 (`lib/babylon/adventure/world/story/runtime.ts`; lane/story, NEW, a fix): a live encounter's monster or boss that falls below its world's kill height is put back where it spawned. Before, it fell for ever while still alive, so its camp could never be cleared — measured: Chapter 1 resumed at the wall run (seed 11) knocked a skitter off camp 1's edge to y −10,629 and the chapter could not go on. 0 = as before.
- `story.shutGateLine` 1 (`lib/babylon/adventure/story/progress.ts`, read by `AdventureMode`; lane/story, NEW): in free roam (no chapter beat waiting), standing in a hub gate with no chapter behind it yet, the HUD's objective line reads "This gate is still asleep". Before, walking into such a gate did nothing and said nothing (a dead end). HUD text, not a banner. 0 = as before.
- `story.showDraftTags` 0 (`lib/babylon/adventure/story/shown.ts`, read by `AdventureMode` and `app/play/adventure/stage.tsx`; lane/story, NEW, coordinator 2026-11-21: "Players must never see the literal bracket tags"): the story's data keeps its `[PLACEHOLDER]` / `[DRAFT]` marks; at 0 every story string on screen (the HUD's spell and partner, the objective line, the dialogue box, the start screen, the end card) shows its words plainly ("Fire Bolt", not "[PLACEHOLDER] Fire Bolt"), and the dialogue box's PLACEHOLDER chip and the end card's DRAFT chip are hidden. 1 = tags and chips shown, for the owner's review. Before: the chips always showed and the HUD showed the raw spell name.
- `story.startProgress` 1 (`lib/babylon/adventure/story/progress.ts`, shown by `app/play/adventure/stage.tsx`; lane/story, NEW): the start screen says which chapter and which step you are at, and its button says CONTINUE (START on a fresh story, EXPLORE THE HUB once every chapter is played). 0 = START and the first chapter's title, as before. The resume itself is unchanged (it always resumed at the saved beat).
- `venue.deferScenery` 1 (`lib/adventure/venice/courtsView.ts`, the Venice hub; venice-v1 improvement pass phase 3, NEW): the courts load in
  their plain base colour and the player first; the painted courts, the palms and the boardwalk row arrive once the player can move.
  0 = everything during the load, as V1.
- `perf.veniceSharedCourt` 1 (`lib/adventure/venice/courtsView.ts`, the Venice hub, every tier; lane/venice-v1, 2026-11-17, NEW): the four courts
  are ONE court mesh drawn as instances. 0 = a mesh, material and asphalt detail map per court (the prototype's way: about 4 MB more on a
  phone, measured 73 → 77 MB; the painted court itself was already cached per scene).
- `perf.sharedGroundOn` 1 (`nexus/veniceBoardwalk.ts`, every tier): the boardwalk's tiled grounds wear the kind's one painted tile (the
  tiling is in the UVs: the same repeat) instead of a copy each, and the two sand planes share one grain and one mottle; so the four
  aprons, the two sands, the two seas, the two surf strips, the posts and the flags are one mesh each. A plane's tint rides in its vertex
  colours (the PBR shader multiplies albedo colour, texture and vertex colour the same way), so the aprons, the walk and the plaza (one
  concrete, three tints) are ONE mesh too. (The sands share only when both planes are
  long enough for the shared repeat to be the same picture; measured on 3v3 and 3-Point, the north strip keeps its own.) 0 = a texture copy, a material and a draw per plane.
- `perf.phoneRailBodies` 2 (`nexus/veniceBoardwalk.ts`): a phone's Venice rail keeps two of its five onlookers (the two ends).
  Half-court modes only (1v1, 3v3, 3-Point); the dunk and the duel keep their rail. FLAG: this one is visible — three fewer
  people at the side of the court on a phone (the 3v3's texture memory reaches its row only with it). 5 = all five.

## hoops-perf, 2026-11-12 (owner: "join each body into one mesh", "cut heap churn"; no feel number changes)

Group "Hoops · phone budget". NEW; its off value restores the old build exactly.
- `perf.bodyMergeOn` 1 (`core/bodyMerge.ts`, mounted by `core/CharacterLibrary.ts` for every spawned body, every mode; 1 = the phone
  tier, 2 = every tier):
  once a body has held still for 12 frames, its skinned parts that the renderer treats alike (same skeleton, shadow maps, lights,
  vertex attributes, morph target names, culling, render group, side, visibility) are drawn by ONE mesh with one sub-mesh per part.
  The parts are not changed or disposed: they are only taken out of the camera pass and the render-target lists while the merged
  mesh draws for them. It swaps in only when every sub-mesh compiled to the same shader its part draws with; opaque and
  alpha-tested sub-meshes keep their part's place in the draw order, and the ink line is set per part. Any change to a part
  (a kit swap, a tint, the body mask, a creator shape, a fade) puts the parts back that frame. Draws are the same; active meshes
  drop (a court body: nine or ten parts become three or four). Phone by default: the phone's frame measured identical (0 px on every
  look and court checked); desktop's cascaded shadow showed small differences on two looks (football kit body 181 px, max step 21; a
  tall Creator frame 12 px, max 4). Kit PACK garments keep their own mesh. 0 = one mesh per part.

## hoops-p09, 2026-11-12 (1v1 / 3v3 phase 9 "one rulebook"; the play audit's sinkers 2 to 6 and 10; the owner has not felt these yet)

Group "Hoops · one rulebook". Each is NEW, and its OFF value restores the old behaviour exactly (`lib/babylon/hoops/rulebook.test.ts`
pins both). Measured with `scripts/probes/hoops-p09/rulebook-measure.mts` (before = every knob off).
- `hoops.skillShotOn` 1 (`hoops/rulebook.ts`, `core/SharedShot.ts`): **the release decides the shot.** Inside the green it goes in, outside
  it misses; how far outside says how (a rim-out just past the edge, a brick far off; early short, late long). The contest AT THE RELEASE
  and the distance only narrow the green; tiredness and a cold run narrow it a little, a hot run and called glass widen it a little. No
  draw. 0 = the grade sets a rate (perfect 0.97, good 0.80, early 0.35, late 0.30) and the ring draws, as before.
- `hoops.jumpGreenScale` **ships at 1 (today's width)** (coordinator 2026-11-12: the rule alone removes the luck without costing a decent
  player points before the owner has felt a narrower green). **The proposal for the shooting session is 0.62**: the jumper and fadeaway
  green at this share of the old width (an open jumper's green 117 → 72 ms at 4.5 m, 104 → 65 ms from three). Session: start at 1.0 and
  narrow toward 0.62 (0.8 in between: a decent thumb 25.7 points over the 20 shots). Measured: at 1.0 a decent thumb (45 ms) scores the
  same over a game's 20 shots as before (29.5 → 29.5 points) while a masher falls 18 → 6; at 0.62 the decent thumb falls to 22 and a
  sharp one (12 ms) rises 39 → 46.
- `hoops.freeFinishContest` 0.3: a layup or other finish contested less than this goes in however it was timed. 0 = every finish needs the green.
- `hoops.finishContestNarrow` 0.5: with the release deciding, a contested finish's green is narrowed by this share at a full contest (the
  layup bars are floored, so a body on you barely narrowed them; the old contest bite on the rate did that job). 0 = no extra narrowing.
- `hoops.aiSharedShotOn` 1: the 1v1 rival, the 3v3 rivals and your 3v3 teammates release on YOUR meter (their style, contest and
  distance), graded and decided by the same rule. What differs is their hand: a timing error drawn from a spread per level,
  `hoops.aiTimingRookieMs` 100 / `hoops.aiTimingProMs` 71 / `hoops.aiTimingEliteMs` 52 / `hoops.aiTimingMateMs` 71 ms; a rival behind and
  forcing it spreads wider, one protecting a lead a little tighter (core/Nerve). The lob and the putback stay dunk rates. 0 = their own
  tables (rivalShotPct, rivalReleasePct, matePct), as before. Measured at the shipped width (the rival sim, human-like defender): the 1v1
  rival's jumpers ROOKIE 7 → 17 %, PRO 7 → 24 %, ELITE 6 → 31 %; his layups 53 / 54 / 55 → 35 / 42 / 56 %; the 3v3 rivals' points a shot
  0.41 / 0.54 / 0.67 → 0.38 / 0.56 / 0.76. The spreads were picked against the green: the same rates as 62 / 44 / 32 give at the proposed
  0.62, so if the session narrows the green, tighten these by the same share (× the new scale) or the rivals get worse.
- `hoops.moveReadOn` 1 (`hoops/rulebook.ts readTheMan`; HandleSystem, TripleThreat's jab, the pump fake, the pass fake, off the head): a
  move or a fake beats the man only when he is off balance (in his jump or his reach), coming at you faster than `hoops.moveCommitMps`
  1.4 m/s, or moving across you the wrong way faster than `hoops.moveLeanMps` 0.6 m/s (the modes' own "closing" and "set" lines). Against
  a set man the move keeps the ball safe and nothing more. The jab bites only the first two of a possession; the pass fake moves a man
  standing at least `hoops.passFakeLaneCos` 0.6 square in the lane; off the head comes off clean when its odds are 0.5 or better. No roll.
  0 = the odds and the roll, as before.
- `hoops.gatherCloseoutOn` 1 (`DefenderBrain.closeOnGather`): once his tier's reaction (420 / 220 / 120 ms) has passed inside your jump-shot
  meter, the man on you steps up to `hoops.gatherCloseoutM` 0.8 m. The pull-up three for a decent thumb: 1.7 → 0.6 to 0.7 points a shot at
  PRO and ELITE. Its answers: the pump fake (he is flying at you, so he bites) and a move into his closeout. 0 = he holds his spot.
- `hoops.pressFloorOn` 1: a showtime flush or a trick dunk pressed at the wrong moment pays at least what not pressing pays (showtime
  early 42 → 70 %, late 50 → 70 %; a mistimed trick pays the plain dunk). 0 = the old table.

## hoops-sound, 2026-11-12 (phase 11a "the sound of the court", part one; the owner has not heard these yet)

Group "Hoops · sound". Each is NEW, and its OFF value restores today's sound exactly. With all three switches off (`sampleSfxOn`,
`dribbleSoundOn`, `passCatchSoundOn` at 0) the game asks for and plays exactly the cues it did before, as synths, and fetches nothing.
The sounds are CC0 recordings (`public/audio/hoops/CREDITS.md`). Tests: `lib/babylon/audio/samples.test.ts`, `dribbleSound.test.ts`,
`SoundKit.samples.test.ts`.
- `hoops.sampleSfxOn` 1 (`audio/samples.ts`): in 1v1, 3v3 and the 3-point contest, recordings stand in for the synth swish (a nylon
  rustle: no CC0 net recording was found), rim rattle, squeak and cheer, the crowd bed (a 14 s murmur loop) and the two new cues
  (dribble, catch). They load after READY, about 250 KB. Until a cue's files are in, or if they fail, the cue plays its synth. Every
  recording goes through the same SFX or crowd bus, ducking, limiter, mute and phone/TV/headphones preset as the synths. 0 = synth only,
  nothing fetched. Still synth either way: the groan, whistle, score chime, whoosh, impacts, the body thud and the backboard.
- `hoops.dribbleSoundOn` 1 (`audio/dribbleSound.ts`, a watcher on the ball installed by `anim/ballCarry.ts`): the ball is heard each
  time it meets the floor, whoever moved it: every hoops handler's dribble (yours, the 1v1 rival, all six 3v3 bodies, the handle moves),
  the last bounce into a gather, a bounce pass, a rebound. Once per contact (one detector per ball; it re-arms only after the ball has
  risen 0.2 m). 0 = silent, as before.
- `hoops.dribbleSoundVol` 0.6: your dribble's level at a full-speed bounce (5 m/s, the hoops dribble at 2 bounces a second). A bounce
  plays at its speed's share of that, from 0.3x to 1.25x.
- `hoops.dribbleSoundAiK` 0.5: an AI handler's dribble as a share of yours (a ball no carry has, such as a rebound, plays at yours). Which carry is yours: the first hoops carry a mode mounts
  (assumption, true of 1v1, 3v3 and 3-Point today; `BallCarryOpts.soundRole` names it explicitly when the mode files are next edited).
- `hoops.passCatchSoundOn` 1 (`core/BallHandling.ts` PassFlight): a 3v3 pass is heard in the hands when it arrives. The throw still
  plays the menu click (`ThreeVThreeMode.ts` uiTick): that line belongs to the mode file, owned by hoops-p08 now, and is listed for after
  it. 0 = no catch sound, as before.
- `hoops.passCatchVol` 0.7: the catch's level.
Feel-check: 1v1, dribble in place and on the move; you should hear one bounce per dribble, louder on a hard crossover. 3v3, pass to a mate.
Measured (2026-11-12, `scripts/probes/hoops-sound/`: the real hoops screens on the show rig's site, phone profile, seed 7, SwiftShader):
- Dribble: 1v1, 12 game s: 15 floor contacts of the ball (read off its height alone), 15 bounce sounds, each on its contact's frame (14
  same frame, 1 a frame early), no extra sound, no double. 3v3, 12 game s: 18 contacts, 18 sounds, all on the frame, no double. By whose:
  1v1 player 2 / AI 12 / loose 1; 3v3 player 11 / AI 5 / loose 2.
- Loading: no hoops file is fetched before READY (the harness's own `#<mode>-ready` marker); all 24 (251 KB) arrive 0.03–0.18 s after it
  on this box, and the crowd bed switches to the recording.
- Levels (`loudness.mts`, rendered offline through SoundKit's own graph, the loudest 50 ms at the limiter): each recording within 2 dB of
  the synth it replaces (swish -48.7 / -48.0, rim -33.8 / -33.9, cheer about -35, bed -46); squeak -39 (its synth -71); bounce -38.5;
  catch -40. Chromium decodes the bed to exactly 14.000 s, so the loop is seamless.

## hoops-builder, 2026-11-12 (the hoops ratings; owner: "5 ratings … that really change how you play, within limits"; the owner has not felt these yet)

Group "Hoops · ratings" (`lib/babylon/hoops/ratings.ts`). A rating runs 40 to 90. Each band below is the change AT 90; at 40 the number
moves the other way by a quarter of it; at 50 nothing moves, whatever the band. Every one is NEW, and 0 takes that rating out of play
(`lib/babylon/hoops/ratings.test.ts` pins rating 50 = today and each edge). Casual runs only: a ranked, staked, arena, challenge, online or
party run plays today's numbers (and so does an agent / probe run). **Phase B (2026-11-12) wires them into 1v1 and 3v3** through
`lib/babylon/hoops/ratedPlay.ts`; the measured edges are `scripts/probes/hoops-builder/bands.mts`.
- `hoops.ratingsOn` 1: the ratings change play. 0 = every athlete plays today's numbers, in every run.
- `hoops.rateSpeedBand` 0.06: top speed (6.4 m/s → 6.78 at 90) and first-step acceleration ×1.06 at 90 (×0.985 at 40).
- `hoops.rateHandleBand` 20: the handle the moves read, 50 → 70 at 90 (45 at 40): the combo window 0.44 → 0.54 s and a tighter dribble.
  Moves stay unlocked for everyone (H2's `MOVES_UNLOCKED_GATE` is untouched).
- `hoops.rateReadBand` 0.15: the "moving the wrong way" line a move needs (rulebook `hoops.moveLeanMps` 0.6 m/s) ×0.85 at 90 (0.51 m/s).
- `hoops.rateGreenBand` 0.1: the jump-shot green ×1.10 at 90 (×0.975 at 40). The owner's 2026-10-20 rule: ratings widen the green in casual only.
- `hoops.rateFinishBand` 0.15: the contest a defender puts on a layup or a dunk ×0.85 at 90.
- `hoops.rateSlideBand` 0.06: the defensive slide ×1.06 at 90.
- `hoops.rateStealReachBand` 0.05: the hero's poke range (1v1 `STEAL_RANGE` and the 3v3 poke, both 1.6 m) ×1.05 at 90 (1.68 m).
- `hoops.rateBlockReachM` 0.04: block reach +0.04 m at 90.
- `hoops.heightReachMPerIn` 0.015: playing height, 6'0" to 6'8": the hero's block reach and his release height against a block +1.5 cm an
  inch over 6'4" (6'8" +6 cm, 6'0" −6 cm).
- `hoops.heightLookPerIn` 0.01 (phase B; owner 2026-11-12 "the body on screen follows the playing height"): the hero is DRAWN 1 % taller an
  inch over 6'4" (6'0" 96 %, 6'8" 104 %, the cosmetic clamp). Drawing only: while he is drawn scaled the modes read the ball on his hand on
  the standard frame (playFramePoint), so the size changes no outcome. Casual runs only; 0 = the standard body.

## move-feel, 2026-11-12 (the owner: "Find out why the movement still feels off?"; docs/MOVE-FEEL-DIAGNOSIS.md)

**Owner, 2026-11-17: "Turn all six on now."** The six values of the list below are the shipped defaults since then, each still a knob whose
off value restores the game before (TUNED, from → to): `hoops.camLeadEase` 0 → 1, `hoops.turnTrueArc` 0 → 1, `hoops.kickSec` 0 → 0.1 s,
`hoops.cutSec` 0 → 0.08 s, `hoops.gearBlendBand` 0 → 0.2, `hoops.stickSprintFallback` 1 → 0. The three H3a switches moved on the 1v1 / 3v3
ball handler only (`HANDLER_TURN_TRUE_ARC`, `HANDLER_KICK_SEC`, `HANDLER_CUT_SEC` in `GEARS_HANDLER`): the dunk approach (`GEARS_HOOPS`) keeps
0, as it keeps the release stick for every phase-1 number (**assumption:** the owner's six are about 1v1 / 3v3, the modes measured).
`RELEASE_STICK_PRESET` now carries all four movement ones at their old values, so one paste still puts the release stick back.

The section as written on 2026-11-12, when they were off:

Three NEW knobs, each **off by default (today's game exactly)**, each pinned in `lib/feel-panel/knobs.test.ts` and held by its own test:
- `hoops.gearBlendBand` 0 (group "Hoops · movement"; `core/HoopsStick.ts` HOOPS_GEAR_BLEND_BAND, the 1v1 / 3v3 handler only): past the
  stick's walk line (0.45) the jog starts at 85 % of its top, so a thumb on the line asks for 2.38 or 3.71 m/s (+56 %) a pixel apart. With
  a band the jog's target eases up from the walk's edge over that much more stick; full tilt and every stick past line + band are
  unchanged (`core/gearBand.test.ts`). Try 0.2.
- `hoops.stickSprintFallback` 1 (`core/PlayerSlot.ts`): as shipped, until a trigger has ever reported (a phone whose TURBO pad has not been
  touched, a keyboard before its first Shift) a stick past 0.85 IS the turbo: the same full push runs 6.2 m/s at the start of a game and
  4.3 m/s once TURBO has been touched, and the fallback sprint empties the tank in 2.9 s and drops to a jog by itself. 0 = the turbo is the
  button only (`core/PlayerSlot.sprintFallback.test.ts`). Try 0.
- `hoops.camLeadEase` 0 (group "Camera · follow"; `core/CameraDirector.ts` HOOPS_CAM_LEAD_EASE, 1v1 and 3v3 only): the hoops modes never
  took the eased look-ahead every other follow camera got in gameplay-clean P2 #10, so on a start, a stop, a cut or a turnaround the
  point the camera looks at jumps in one frame. 1 = it eases over `camera.leadEaseSec` (0.2 s) and grows to full by `camera.leadFullMps`
  (1 m/s) (`core/CameraDirector.hoopsLead.test.ts`). Try 1.

**Try these values** (2026-11-12; now the defaults — paste them with 0s / 1 to feel the old game). The first three are #311's H3a
switches that change no top speed, stop or distance — only how a change arrives:

```json
{ "hoops.turnTrueArc": 1, "hoops.kickSec": 0.1, "hoops.cutSec": 0.08,
  "hoops.camLeadEase": 1, "hoops.gearBlendBand": 0.2, "hoops.stickSprintFallback": 0 }
```

Measured (`scripts/probes/move-feel/stick-feel.mts`, the real DribbleController at 60 fps; `PRESET=try` is the first three): a 90° cut at a
jog turns 261 → 348 °/s over its first 100 ms and settles within 10° in 283 → 233 ms; at a sprint 203 → 275 °/s, 367 → 300 ms; the sprint
cut's one-frame brake 71 → 17 m/s²; the turbo kick's one-frame push 68 → 23 m/s²; starts, stops and top speeds unchanged (jog 90 % 250 ms,
stop 150 ms / 0.29 m, sprint stop 217 ms / 0.69 m). **assumption:** the bounds are safe, not tuned.

## hoops-flow, 2026-11-12 (owner decisions: "3v3 is first to 21 on a 4-minute clock", "any press skips a replay")

Group "Hoops · flow and pace". Both are the owner's own calls; each knob puts the old behaviour back exactly (tests pin both ends).
- `hoops.threeGameSec` 240 s (`modes/threevthreeOvertime.ts` `THREE_GAME_SEC`; it was `ThreeVThreeMode.ts` `POSSESSION_SEC` 90): the 3v3
  game clock. First to 21 still ends it outright; at the horn the leader wins; level at the horn is the sudden-death overtime as before
  (`hoops.overtime3v3Sec`, 30 s). Read when the game starts. The clock chip reads m:ss from a minute up ('4:00'), seconds under it. The
  MC's recorded 3v3 welcome names a ninety-second clock, so it is said only on a 90 s game until the lines are re-recorded. 90 = before.
  Feel-check: play a full PRO 3v3: does a comeback have room, and does the game still feel tight at the end?
- `hoops.replaySkipOn` 1 (`core/replaySkip.ts` `REPLAY_SKIP_ON`): during a hoops replay (1v1, 3v3, the 3-point money ball, the dunk
  contest's and the duel's cuts) any press ends it at once and the next possession starts: a button, the d-pad, a trigger pulled, a
  stick pushed out from rest (a dribble flick, the keyboard's dribble keys) or a tap on the court. The skipping press is the replay's:
  not a shot, not a dribble move (the right stick and a trigger are held back until let go); the walking stick is passed on, so a held
  stick moves you when the ball comes back. In the dunk contest A still hurries the judges and the d-pad still throws your
  celebration. 0 = only a button or d-pad press skips (the dunk cuts: A or B, a tap or Space), as before. Feel-check: 1v1, break his
  ankles, score, and flick the stick the moment the replay starts.


### Hoops · gathers (lane/hoops-gather, owner 2026-11-12: "good escape moves, good gathers and pick ups"; `docs/HOOPS-GATHER-ESCAPE-PLAN.md`)

All new numbers. Every switch ships OFF except `hoops.pickupReadOn`, turned ON with G2 (coordinator 2026-11-12, flagged); each switch's 0
restores the old behaviour exactly.
- `hoops.pickupReadOn` 1 (`anim/ballCarry.ts` `pickUp`, G1): on, a shot / finish / footwork pressed while the ball is low keeps the ball on
  its own bounce while the dribbling hand goes down `hoops.pickupReachM` 0.3 m to meet it, and takes it where they meet; the last bounce runs
  at most `hoops.pickupRateMax` 2× its pace so it never waits longer than `hoops.pickupWaitMaxSec` 0.2 s; a ball within
  `hoops.pickupTopGapM` 0.1 m of the top is taken at once (as before). Off: the ball is taken on the press frame wherever it is and flown up to
  the hand (measured: 57–94 cm off the palm when pressed near the floor). The meter and the body answer the press on its frame either way.
  The take is the ball within `hoops.pickupContactM` 0.04 m of the palm as drawn (past its radius); a hand that did not get all the way
  down gets the ball rising on to it for at most `hoops.pickupOverrunSec` 0.1 s more. When the shot wants the other hand, it comes to the
  ball's far side for the meeting (both hands on it), then takes it.
- `hoops.bufferFreshPressOn` 1 (`hoops/response/pressBuffer.ts` `BUFFER_FRESH_PRESS_ON`; FLAGGED, on by default): a shot press made while
  the body is committed (a shot, a dunk, a spin) waits the move out and fires as it ends (hoops-p01); with this on only a press that went
  down DURING the lock does. The press that started a shot is held through its own pump, so with it off (0, as before) the buffer replays
  it the frame the pump ends: measured on every pump the gather probe made (1v1 and 3v3), the step-through started one frame after the
  fake, the fake never showed, and the next squeeze became a double-tapped hop. On: the pump holds, and a squeeze inside its window
  (`STEP_THROUGH_SEC` 1.0 s) is the step-through. Feel-check: pump, wait, step through; and tap Square during a spin: it still shoots
  as the spin ends.
- `hoops.pumpBallHandOn` 1 (`hoops/response/pumpHold.ts` `PUMP_BALL_HAND_ON`; FLAGGED, on by default): the pump fake keeps the ball in
  the hands while its clip plays. The pump ends the shot, and the dribble used to restart on the very next frame from wherever the ball
  was: measured, once the pump showed at all (`hoops.bufferFreshPressOn`), the ball left the hand 2 frames after the pump and fell
  0.5-0.6 m loose through the pump clip before the step-through picked it up off the bounce. On: the dribble stays parked for the pump
  clip's length (a pick-up still reading the bounce is taken at the pump), then comes back as before if nothing follows. Off (0): as
  before. Feel-check: pump and wait: the ball stays at the chest through the fake; pump and step through: one carry, no drop.
- `hoops.pickupRateFloorHz` 2 Hz (`anim/ballCarry.ts` `PICKUP_RATE_FLOOR_HZ`; FLAGGED, on by default; the default is `HOOPS_DRIBBLE.hzFast`):
  the pick-up's harder last dribble (`hoops.pickupRateMax`) is counted from at least this rate. At a drive or a sprint the stride lock
  slows the bounce to one a stride (measured 0.5-1.5 Hz on the press), so twice THAT could not meet a low ball inside the 0.2 s wait
  and the pick-up fell back to the old take: on the 3v3 speed set 10 of 11 presses at 2.8 m/s or more were taken at once, a median
  35 cm off the palm, 3 of them yanked up from below the knee. 0 = counted from the bounce's own rate (as at G2). Feel-check: sprint at
  the rim and pull up off a low dribble: the hand meets the ball on its way up, no snatch.
- `hoops.releaseSnapEaseSec` 0.03 s (`anim/ballCarry.ts`, G2): the smoothing of the shooting wrist's snap at the release (58°). 0.03 is
  the value it always had (TUNED, unchanged): the wrist turns ~58° in one frame on every jumper. A longer ease spreads it over frames.
- `hoops.comboDunkOn` 1 (`core/ComboFinish.ts`, G4; FLAGGED 0 → 1, the owner asked for a euro step dunk; open: two arm pops in the
  footwork → dunk crossfade, 164°/frame on one euro and 126°/frame on one hop in the G4 runs): on, a euro or a hop step with the turbo held, at least `hoops.comboDunkMinMps`
  3.4 m/s at the press and its last plant inside dunk range (2.8 m) takes off into a dunk: the euro's cross gives the angle (the windmill
  at speed, the cradle without it), the hop's two feet none, a body in the way the double clutch (the drive dunk's own picker). Off:
  they end in a layup or a floater, as before.

## move-feel-2, 2026-11-17 (owner: "stick right runs a straight line while held"; "redesign the phone stick")

Two NEW knobs, **shipped ON** (assumption, flagged: the owner chose both; each knob's 0 restores the game before), pinned in
`lib/feel-panel/knobs.test.ts`, each held by its own test:
- `hoops.stickFrameHold` 1 (group "Hoops · movement"; `core/StickFrame.ts`, read in `OneVOneMode` camRel and `ThreeVThreeMode`'s wish): the
  camera's flat axes are captured when the stick leaves centre (past 0.2) and held while it stays out; the stick home, or the camera more
  than 75° from the held frame (a cut), takes the live camera again. Measured on the rig (a stick held still while the camera orbits the
  rim): the run bent 36° over a 1 s sprint and 4.6° over a 0.7 s cut leg → 0° and 0° (3v3 cut leg 0°). The trade: by the time you let go,
  "up" on the stick is the court direction it was when you pushed, up to the camera's turn since (18–35° a second held). 0 = the live camera
  every frame.
- `touch.floatStick` 1 (group "Hoops · movement"; `lib/babylon/ui/floatStick.ts`, TouchOverlay `FloatStick`; 1v1 and 3v3 only): a 172 × 136
  zone where the fixed stick sat; the stick's centre appears under the thumb, its base 144 px (1.5× the old 96), full speed at its rim, a
  10 % radial dead zone rescaled from 0. Measured (`scripts/probes/move-feel/phone-stick.mjs`, the real deck): thumb travel to full speed
  48 → 70 px upright (7.9 → 11.5 mm, assumption 6.1 px a mm), 40.8 → 61.2 px sideways (6.7 → 10.0 mm); a thumb landing 20 px off the
  stick's centre sent 0.42–0.49 (a jog) and now sends 0 (a standstill); a 30 px push sent full speed and now 0.35. No overlap with any other
  control, inside the stage, in both orientations. "The same push always the same speed": with `hoops.stickSprintFallback` 0 and
  `hoops.gearBlendBand` 0.2 (move-feel) the stick's scale has no hidden turbo and no step. 0 = the fixed 96 px stick.
- `hoops.escapeReadOn` 1 (`hoops/response/escapeRead.ts` `ESCAPE_READ_ON`, G3; FLAGGED, on; 1v1): the step-back (the hop-back escape)
  reads the man, never a roll: a man on his heels (giving ground toward the rim faster than `hoops.moveLeanMps`, the backpedal that cuts
  a drive off) or off balance is beaten and late by `hoops.escapeLateSec`; a set man, or one coming at you, is not (he mirrors, as before;
  the ball is safe). Measured (1v1, the step-back off a drive, the stick let go): 2.74-2.84 m from him 0.8 s later (+1.58-1.74 m) against
  1.77-1.91 m with no read; against a set man +0.58-0.73 m, the same as no read. Off (0): as before. Feel-check: drive, he backs off,
  step back: the space is yours; step back on a man standing in front of you: he is still there.
- `hoops.escapeLateSec` 0.7 s (G3): how long a beaten man brakes and stands before he recovers: the same as a man a move shook
  (`ANKLE_BREAK_STUN_SEC`). Measured: 0.45 s bought nothing over no read (the man braked onto the hop and closed again inside 0.8 s).
- `hoops.trapReadOn` 1 (G3; ON since the owner's answer 2026-11-17, FLAGGED): in a 3v3 double team on the ball, a crossing move
  (crossover, behind-the-back, between-the-legs: a move with a sideways body) reads both men: SPLIT when a body fits between them (with
  the squeeze, 1.6 m apart, plus `hoops.trapGapMinM` 0 m): both men late; STRIPPED when it is thrown into the closed side, a trapper
  inside `hoops.escapeStripReachM` 1.5 m on the side the ball goes (the owner's rule: an escape into the closed side of a trap is a
  steal); otherwise a man who bit is late. Measured (3v3 trap trials, the crossover and the behind-the-back, 5 each): with the squeeze,
  5 splits and 4 steals of 9 reads; without it (2.2 m), 2 splits, 6 steals, 2 open. A split leaves the second man 1.5-2.6 m off in 0.8 s;
  the near man is still at 1.1-1.5 m. Off (0): as before.
- `hoops.trapSqueezeOn` 1, `hoops.trapSqueezeM` 0.8 m, `hoops.trapSqueezeSec` 0.6 s (owner 2026-11-17: "let the handler slip between two
  defenders ~1.6 m apart"): for the split's 0.6 s the handler meets the two trappers at 0.8 m centre to centre instead of the bodies'
  1.10 m stand-off (no contact event), so two men 1.6 m apart can be split. Off: the stand-off holds and a split needs 2.2 m.
- `hoops.dunkGatherOn` 1 (`hoops/response/dunkGather.ts`, owner 2026-11-17: "drive dunk — gather, then go up"; FLAGGED, on): a sprint
  squeeze in dunk range gathers first — the last dribble meets the hands (the pick-up) — and the plant and take-off come when the ball is
  in them, at most `hoops.dunkGatherMaxSec` 0.3 s after the press (a ball near the top goes up at once, as before). Measured (1v1 poster
  dunks and 3v3 sprint dunks): the gathered dunks took the ball 1.7-12.5 cm off the palm, no yank (with it off the low ones were 59-72 cm,
  yanked); the take-off came 100-267 ms after the press (today: on the press). Off: up on the press, as before.
- `hoops.pumpEndsDribbleOn` 1 (`hoops/response/pumpHold.ts`, owner 2026-11-17: "a pump fake ends the dribble, like real basketball";
  FLAGGED, on; this overrides phase 3's assumption that the dribble comes back, #601): after a pump the ball stays in the hands (the
  chest hold) and the feet are set; no dribble move; the shot, the pass or the step-through only. Measured (a standing pump, then a
  crossover flick 1.2 s later): on, 3 of 3 in 1v1 and 3 of 3 in 3v3 kept the ball in the hands for all 66 recorded frames, no move; the
  step-through on the squeeze still comes (4 of 4). Off: the crossover played and the ball went back to the floor. Off: the dribble comes
  back when the pump clip ends.

## kit-tight, 2026-11-18 (owner: "make the clothes appear to be skin tight and not baggy ... right now it looks poofy")

Group **Kit · fit**. A look slider, not a feel number: it moves no body, no bone and no timing.

- `kit.fitTightness` **0** (the shipped value is chosen from the browser rig and the pictures; 0 = today exactly): how close the worn
  kit tee / tank and shorts sit on the body. Today they stand about 3–4 cm off the skin (the garment files 2–2.5 cm, plus the runtime
  lift and edge flare). Each vertex further than 8 mm off is pulled toward the skin by this share of the excess, once, when the body
  mask is fitted; the pull fades out near the hems, cuffs, armholes and leg openings, where the skin is still drawn. Kit packs (the
  football jersey) and the Creator's built clothes are not touched. `lib/babylon/core/fitTight.ts` `FIT_TIGHTNESS` (with `FIT_FLOOR`
  8 mm and `FIT_EDGE_BAND` 7 cm).
- `kit.inseamShade` **0.55 — the coordinator's reversible default, 2026-11-18 (option (a); flagged to the owner)** (new; 0 = as before,
  no texture): how much darker the one-piece short's cloth between the legs is, a gusset panel, so its stretch in a stride reads
  as a seam (KIT-FIT-PLAN §12.3: no weight or shape change removed it). A texture made from the short's own UVs and weights; no
  geometry, UV, bone or vertex-data change. `lib/babylon/core/inseamShade.ts` `INSEAM_SHADE`.
- `kit.setLiftScale` **0.5 — owner 2026-11-18 pick (3) from the contact sheet** (new; 1 = today's numbers): the runtime lift
  (`GARMENT_INFLATE` 13 mm tops / 20 mm shorts) and edge flare on the Blender-made garment sets ONLY (the one-piece short, the new
  jerseys); every other garment takes today's. `lib/babylon/core/fitTight.ts` `SET_LIFT_SCALE`.

## kit-mac-jobs, 2026-11-18 (owner: "The clothes are the biggest eye sore immediately"; "skin tight and not baggy, or more natural")

Group "Kit · garments". NEW; both ship at 0, which loads nothing new and leaves every body exactly as before. They apply to the
next body a scene loads (the garments go into the loaded file once, before any spawn is cloned from it). The garments are the
owner's two Blender jobs, made headless from the free MakeHuman garments (docs/SHORTS-BUILD-STEPS.md, docs/JERSEY-BUILD-STEPS.md;
`scripts/avatar/mpfb/onepiece-shorts.py`, `jersey.py`, `fit-outfit.py`, `scripts/avatar/kit-fit/graft.ts`); the files are
`public/models/kits/sets/` and no body file changes.
- `kit.onePieceShorts` **1 — owner 2026-11-18 pick (3) from the contact sheet** (was 0) (`core/kitGarmentSet.ts` `ONE_PIECE_SHORTS`): 1 = the kit bodies (Closet, games, phone files) wear the
  one-piece court short: one piece of cloth with a gusset 2.5 cm under the crotch, fitted to the legs and seat, in place of the
  three pieces whose legs reached 10 cm into each other. Both short items (`shorts_court`, `shorts_glitch`) take it.
- `kit.newJerseys` **1 — owner 2026-11-18 pick (3) from the contact sheet** (was 0) (`core/sportKitDefaults.ts` `NEW_JERSEYS`): 1 = the kit bodies carry `top_basketball` (the sleeveless jersey
  from the MakeHuman tee, the default top in 1v1, 3v3, the dunk modes, 3-Point and the carnival) and `top_football` (from the
  MakeHuman polo; the body now carries it, so the Meshy football pack is not fetched). A Closet pick still wins.
- MEASURED (KIT-FIT-PLAN §11): with either knob on, more skin shows through in the game (the basketball jersey about twice,
  the short 2-5x in its slot); the football jersey cuts the pack's torn edges 25x but lets 11-13 % more skin through. The owner judged
  by eye instead (KIT-FIT-PLAN §12.2): both ship at 1, with `kit.setLiftScale` 0.5.

## hoops-items, 2026-11-18 (the basketball items the gather, escape, sound and perf lanes left open; the owner has not felt or heard these)

Each knob is NEW and its off value restores the game as it was (tests pin both sides). Probes: `scripts/probes/hoops-items/`.

**The 3v3 step-back (group "Hoops · gathers").** Measured on the hoops-gap rig (`stepback.mjs` over `hoops-gather/trials.mjs SET=g3`):
the press moves the body just as fast in 3v3 as in 1v1 (the root leaves 2-3 frames after the flick in both, 2 m/s by frame 4 in 3v3 and
5 in 1v1; the step-back clip fades in over the same 0.12 s, `moveFadeSec`, the same call in both modes). What was "late" is the man: in
1v1 the read beats a backpedalling man and he keeps going (3.7 → 1.7 m/s over 0.8 s), so a step-back off a drive gains +1.64 m; in 3v3
nobody was read and the man recovered at once: +0.58 m. After (5 trials a side, the same seed): **+1.66 m** (1.35-1.75).
- `hoops.escapeRead3v3On` 1: the 1v1 read (`stepBackRead`: off balance, or on his heels) in 3v3, with `hoops.escapeLateSec` 0.7 s. The
  beaten man is not frozen (a 3v3 stun zeroes his speed in the frame — why the first try cost space); he gets a late reaction instead.
- `hoops.escapeLateCarry` 0.7: through the late window he carries his own backpedal at 0.7 of his speed (the 1v1 man's average), then
  stops and recovers. 0 = he brakes at once and stands (measured: +0.73 m, he stood inside 0.2 s).
A set man, or one coming at you, is not beaten (the standing step-back against a man at his 2 m cushion: −0.8 m with or without, he
closes; the man who bit by stepping up: 0, the same).

**Sound (group "Hoops · sound"; `lib/babylon/audio/hoopsSfx.ts`).**
- `hoops.passThrowQuietOn` 1: a 3v3 pass no longer plays the menu click on the throw; it is heard in the hands that catch it, and a sling
  pass still whooshes. 0 = the click.
- `hoops.driftSqueakOn` 1: the DRIFT plays a shoe squeak (the hardest scuff: volume 0.26, pitch 1.12) instead of the net swish (0.8, 0.4).
  About 5 dB louder than the swish was (−51 against −55 dB at the limiter): the owner's ear decides.
- `hoops.glassSoundOn` 1: the backboard kiss has its own cue, `glass` — the CC0 "Ball against wall" already in the set (`bounce_6`,
  BigSoundBank s1825; one file, fetched once for both cues) with its own synth as the fallback — at the level the old kiss played (the
  thud at pitch 1.5, −30.6 dB; the recording's gain 2.62 measured by `hoops-sound/loudness.mts`). 1v1, 3v3 and the 3-point contest. 0 = the thud.

**The d-pad (group "Hoops · movement").**
- `touch.dpadTapOn` 1 (`lib/babylon/ui/dpadTap.ts`): every d-pad arrow is at least 44 px AS DRAWN (`dpad.mjs`, a 390 × 844 phone and
  sideways): a row of four 44 px arrows upright, a cross of 52 px arms sideways (the compact deck draws at 0.85: 44.2 px). Before: 24 px,
  drawn 23.3 upright on 1v1 / 3v3 and 20.4 sideways. On 1v1 and 3v3, where the d-pad is not a verb (1v1 reads none, 3v3 only says MOVE
  WITH THE STICK), a 44 px row upright covered the TURBO pad, so there it is a hollow, unpressable cross in the old 72 px place (the owner's
  rule for an unused slot, 2026-09-05), and the floating stick and TURBO stay exactly where they were. 0 = the old 24 px cross everywhere.

**The shot meter under `?engine=webgpu` (group "Hoops · phone budget").**
- `perf.meterWgslOn` 1 (`visual/ShotMeter3D.ts`): under WebGPU the 3D meter is drawn by a WGSL twin of its shader (the same six layers);
  if it does not compile on a device, a plain bar in the fill colour is drawn instead of nothing. WebGL is byte-identical (the GLSL is
  pinned to its hash, the WebGL material built with exactly its old options). 0 = as before (missing under WebGPU). Not verified on a
  GPU: this box's WebGPU loses its device in about a second (PHONE-PERF-CHECK), so the owner's phone is the first real test.

**Moves: the hands (group "Hoops · handle (rest)").**
- `hoops.moveHandEaseOn` 1 (FLAGGED, on), `hoops.moveHandRateDeg` 1800 °/s (`anim/MoveEase.ts`): the arm ease (#314) extended to the hand
  bones. The behind-the-back's whip is the HAND, which the arm ease never held: measured on the rig (`whip.mjs`, the retreat and the BTB
  slide, 3 trials each), the ball hand's worst turn in one frame 125-132° → 30° in 1v1 and 131° → 30° in 3v3; the ball's path and its
  contact with the hand unchanged (the hand bone's position is not touched, only its turn). The clip's keys are untouched (GATE 0). The
  arms' own limit (1800 °/s) is the hands'. 0 = the hands as the layers wrote them, as before.
- **The hop step's feet: not curable at runtime — a clip job** (docs/HOOPS-GATHER-ESCAPE-PLAN.md, hoops-items): at the take-off the
  planted foot slides 6-13 cm a frame (3v3 rig) while the root moves 3-6, because the clip folds the legs up under the body.

## coast-islands, 2026-11-18 (the Coast & Islands zone, phase A; docs/COAST-ISLANDS-PLAN.md; NEW, no shipped number moved)

Group **Coast · zone**. Every row is new behaviour in the new zone; nothing outside `/play/coast` reads them. The zone walks on the
Adventure host's movement and camera exactly as the Venice hub does: no movement or camera number was touched.

- `coast.streamOn` 1 (`lib/adventure/coast/zoneView.ts`): the zone streams its 64 m pieces. 0 = every piece at full detail with every
  prop, the phone-budget control the guard (`scripts/coast-zone-budget-tests.ts`) and the rig (`scripts/probes/coast-islands/zone-rig.mts`)
  compare against.
- `coast.streamFull` 1, `coast.streamLod` 2, `coast.streamKeep` 1 (`lib/adventure/coast/zoneLayout.ts`): the rings, in pieces round
  yours — the full 3 × 3, the low-detail 5 × 5 (the plan's phone rule, docs/VENICE-HUB-PLAN.md §3) — and the hysteresis before a piece
  drops its detail. Bounds are assumptions until felt.
- `coast.deepWaterTurnBack` 1 (`lib/adventure/coast/zoneWorld.ts`): a body that ends a frame over water deeper than you can wade
  (0.85 m) goes back to the last place it could stand. On the ground the deep water is already a wall to the movement sim; this
  catches a jump off the dock. 0 = off (a probe that wants the raw sim).

## coast-b, 2026-11-18 (the Coast & Islands zone, phase B: the partner, the creatures, the log; NEW, no shipped number moved)

Group **Coast · zone**. The partner is the Adventure's own (its brain, its speed, its follow slot are untouched); these are the
zone's rules around it, and the creatures and the log, all new. Each 0 restores phase A.

- `coast.partnerOn` 1 (`lib/adventure/coast/zonePartner.ts`): one partner walks with you — the Adventure save's own, or the
  Adventure's default creature (strideraptor) on loan, never written to the save. 0 = you walk alone.
- `coast.partnerCatchupM` 24 m: left this far behind (on a flat-out sprint you reach 14 m/s, the partner about 10.5 m/s), it
  reappears 3 m behind you on your own path. The story's own catch-up is 32 m; the zone's 3 × 3 full-detail ring is 192 m wide.
- `coast.partnerStuckSec` 1 s: blocked (under 0.5 m/s) for this long while more than 6 m behind, it reappears on your path. The
  brain walks straight at its follow slot and has no path-finding.
- `coast.creaturesOn` 1 (`lib/adventure/coast/zoneCreatures.ts`): four placeholder creatures wander near home. 0 = none.
- `coast.logSeenM` 16 m, `coast.logMeetM` 3 m: how close you come for a creature to go in your log as seen, and as met.

## coast-d, 2026-11-18 (the Coast & Islands zone, phase D: the harbour town, the sports spots, the side quests; NEW)

Group **Coast · zone**. All new; each off restores phase B.

- `coast.streamSliced` 0 (`lib/adventure/coast/zoneView.ts`; lane/coast-f, NEW): crossing into a 64 m piece used to build the newly full pieces' fine ground and refresh all seven prop models in that one frame; now the coarse ground stands in and the work runs one job a frame (the full ring's fine ground first, then one prop model, then load-ahead). The load (the first stream) still builds at once. **Off by default, no measured win on the rig; try on a real phone** (3 runs a side: worst frame 1.52–1.79 s against 1.44–2.30 s, p95 574–632 ms against 511–606 ms). 0 = phases A–D.
- `coast.zoneGrow` 1 (`lib/adventure/coast/zoneLayout.ts`; lane/coast-f, NEW): the zone grows toward the plan's 768 m by the 2 × 2 block of 64 m pieces north-west of Reef Rock — mostly open sea, a sandbank (crest 0.55 m under, wadeable) from Reef Rock's west shore, and Gull Key, a 15 m palm islet. The grid gained two columns west (x −320 … −192); only that block of them is zone. 0 = the 6 × 6 zone of phases A–D.
- `coast.prewarmLate` 0 (`lib/adventure/coast/zoneView.ts`, `zoneTownView.ts`; lane/coast-f, NEW): the models that land after the load (the seven prop models, the market kit, each townsperson's body) have their shaders — lit, shadow depth, instanced, skinned — compiled as they land (`core/hitchProbe` prewarmMeshes, the harness's own phone pre-warm for late meshes), not on the frame they first come into view mid-walk (measured: one such first sight compiled for 3.4 s on the rig). **Ships 0**: measured 3 runs a side, it doubled the rig's compile time (5.1–5.2 s against 1.9–2.7 s: it compiles every variant a mesh could draw) and the worst frame was no better. 0 = phases A–D.
- `coast.townOn` 1 (`lib/adventure/coast/zoneTown.ts`): the harbour town beside the dock (four houses you cannot walk through,
  the shipped Venice boardwalk kit as the market strip, the street). 0 = the bare beach, and no quests.
- `coast.townsfolk` 4: how many townsfolk stand in town (the Venice watchers' roster bodies; each is a skinned body with its own
  textures, measured on the phone rig). 0–4; the first three give the quests.
- `coast.townLoadAfterSec` 0.5 s: the market kit and the townsfolk's bodies start loading this long after the zone is playable, not during its load (measured: loading them with the zone made it playable about 5 s later on the rig). 0 = with the zone. New (coast-d), [TUNE].
- `coast.sportsOn` 1: the sports spots (surf, beach volleyball, golf, the kart) open their games in one tap and the end screen
  brings you back to the spot. 0 = none.
- `coast.questsOn` 1 (`lib/adventure/coast/zoneQuests.ts`): the townsfolk give three quests, saved in the Adventure save like the
  creature log. 0 = they only say hello.

## hoops-followups, 2026-11-19 (the two items the hoops-items lane left: the 3v3 worst frame after the body merge, every-screen on the two hoops pages)

Group "Hoops · phone budget". NEW; its off value restores the old build exactly (tests pin both sides). Probes: `scripts/probes/hoops-followups/`.
- `perf.shadowBakeAtStart` 1 (`scene/ShadowCache.ts` `settle()`, called once from `core/ModeHarness.ts` at the START press; every
  mode on the phone tier): the phone shadow cache watches the scene for 1 s after loading, then bakes the still scenery once. A START
  press inside that second used to leave the rest of the watch in play (every shadow redrawn each frame: 59 shadow draws against 29)
  and the bake on a play frame, which on 3v3 was the worst frame of the run when it fell on a full-court frame: 207 draws against a
  row of 208 (2 of 12 runs on the rig, `perf3v3.sh`; the hoops-items lane saw 209). Now the press ends the watch and the bake runs
  on the first frame of play, under the intro camera (measured 150 draws): worst frame 194 in every run (6 runs). Nothing in a mode
  moves before START, so the rest of the watch was watching play, not scenery. 0 = the full watch, as before (re-measured: 207).

Not a knob: the MIX / MC / CC chips over the court (`components/games/mic-caption.tsx`) were 22 px tall tap targets; each is now a
see-through 44 px box with the chip drawn inside it as before (1v1, 3v3, 3-Point, the carnival, the dunk duel; the dunk's stacked
chips unchanged). Nothing drawn moves.

## kit-numbers, 2026-11-19 (the player's number and name on the new court jerseys)

Group **Kit · fit**. A look switch: it moves no body, no bone and no timing.

- `kit.jerseyDecals` **1** (new; 0 = a blank jersey, as before — and the floating back plate for a player with a number, as before):
  the new basketball and football jerseys (`kit.newJerseys`) print the player's number small on the chest and large on the back,
  with the name across the back, in their own `decal` UV map, mixed over the tinted cloth (light ink on a dark jersey, dark on a
  light one). Any other top keeps the plate. `lib/babylon/core/jerseyDecals.ts` `JERSEY_DECALS`. assumption: a player who never
  set a number prints the default jersey's 0, no name.

## kit-jersey-fix, 2026-11-19 (the dark marks on the new basketball jersey's lower back)

- `kit.layerGap` **0 (ships off; 0 = as before)**: metres the worn short is held UNDER the worn top where the top covers it. The
  marks are the one-piece short showing through the jersey (hiding the shorts on the rig removes them): the runtime lift is
  20 mm a short against 13 a top. 0.006 removes them on the rig pictures, but fails the 10.1a bar by noise-level margins
  (KIT-FIT-PLAN §14), so it ships off for the owner to judge. `lib/babylon/core/fitTight.ts` `LAYER_GAP`.

## hoops-cam, 2026-11-21 (the 1v1 high sideline camera)

Owner, 2026-11-21: "There needs to be improvements to the camera in the 1v1 mode. When it follows it's hard to play. When it's
stationary like 2k high camera angle it's easier." Group **Hoops · camera**. Every number is NEW (the owner has not felt them);
all in `lib/babylon/core/HighSidelineCam.ts`.

- `hoops.oneVOneCam` **1 (ships ON, owner's ask)**: the 1v1 play camera is the high sideline view. It stands high, behind the play
  and swung toward the +x sideline, and it never turns: it only slides (trucks), slowly and critically damped, after the midpoint of
  the two players, and backs away along its own look when both players and the rim cannot fit across the screen (a phone held
  upright). So screen-up is always toward the rim and a stick direction keeps its meaning for the whole game. **0 = the follow
  camera exactly as it shipped** (unit-tested frame for frame). In a game, SELECT on a pad or C on a keyboard switches between the
  two for that run (it was the follow ↔ fixed debug switch, which did nothing useful in 1v1). `ONEVONE_CAM`.
- `hoops.highCamHeightM` **6.8 m** — the eye's height. `HIGH_CAM_HEIGHT_M`.
- `hoops.highCamDistM` **11.2 m** — the eye's ground distance back from its aim point. `HIGH_CAM_DIST_M`.
- `hoops.highCamSideDeg` **32°** — the swing off the court's long axis toward the sideline (0 behind the play, 90 side on; past 45
  up on the stick stops being toward the rim). `HIGH_CAM_SIDE_DEG`.
- `hoops.highCamFocusM` **3.8 m** — the resting aim point, out from the rim on the long axis. `HIGH_CAM_FOCUS_M`.
- `hoops.highCamPanShare` **0.3** — the share of the play's offset it slides after. `HIGH_CAM_PAN_SHARE`.
- `hoops.highCamPanSec` **0.55 s** — the slide's time constant (critically damped: no overshoot). `HIGH_CAM_PAN_SEC`.
- `hoops.highCamMargin` **0.14** — the share of half the screen kept clear at the left and right edges. `HIGH_CAM_MARGIN`.
- `hoops.highCamPullMax` **1.6×** — the most it backs away to fit. `HIGH_CAM_PULL_MAX`.
- `hoops.highCamPortraitLift` **0.34** — on a phone held upright, the share of the screen's height at the bottom (the touch buttons) the
  players' feet are kept above (0.1 on a wide screen, `HIGH_CAM_BAND_WIDE`; blended by the screen's shape). `HIGH_CAM_PORTRAIT_LIFT`.

Not knobs (same file): `HIGH_CAM_PUNCH` 0.25 (the share of a camera punch this view takes), `HIGH_CAM_TARGET_Y` 1.0 m (the aim
height), `HIGH_CAM_DEPTH_IN_M` / `HIGH_CAM_DEPTH_OUT_M` 1.5 / 4.5 m (how far the slide may go toward and away from the rim),
`HIGH_CAM_BAND_WIDE` 0.1, and the clear-view guard: `HIGH_CAM_PULL_MIN` 0.45 (the closest the eye comes in along its look when scenery
stands in the way: a palm's crown, a tree) and `HIGH_CAM_CLEAR_M` 0.8 m (room kept in front of it).
How it stays on the play without chasing it: a possession reset glides when the new spots are already on screen and cuts when they
are not (the check-up, deep past the arc); while a player or the rim is off its spot the slide runs at `HIGH_CAM_CATCHUP` 0.4 of its
time constant; and the EDGE PUSH slides the truck with the hero (as fast as he runs) whenever he reaches `HIGH_CAM_EDGE` 0.92 of the
half-screen (at most `HIGH_CAM_PUSH_MPS` 9 m/s, so it is a slide, never a jump), so a sprint across an upright phone never leaves the
frame. The venue's box is one of the fit's own limits (the side slide and the back-away stay inside it, and it may come in along its
look, down to `HIGH_CAM_PULL_MIN`, when only that fits); the eye stays out of any prop's box (`HIGH_PROP_BOX_M` 25 m across at most,
`HIGH_BOX_ROOM_M` 0.3 m of room). None of these turns the view.
3v3, the dunk and 3-Point keep their cameras. **assumption:** the bounds are safe, not tuned.

## hoops-play, 2026-11-21 (owner: "Gameplay could still be improved greatly"; docs/HOOPS-PLAY-AUDIT.md; the owner has not felt these yet)

Three NEW switches, each **1 = on, 0 = today's game exactly** (tests pin both ends). No existing tuned number moved. Measured on the
hoops-gap rig (natural games, the scripted player on both ends, PRO, five seeds a side, pooled — the rig is not bit-exact between runs,
HOOPS-PLAY-AUDIT §1).

- `hoops.myStripHandOn` **1** (group "Hoops · defense"; `hoops/steals.ts` `MY_STRIP_HAND_ON`): **one rule for the strip, both ways.** My
  poke on a 1v1 / 3v3 handler must also pass the AI's own hand-on-the-ball test (`aiStripLands`: within `hoops.stripReachM` of the ball,
  his body not between my hand and a ball in his far hand, the ball off the palm), and a body bump opens my 0.4 s strip window only when
  HE ran into ME (the AI's bump strip already opened only when I ran into him). The exposure read (when the ball is in play) is
  unchanged. 1v1, steal rule alone (the other two on): steals a rival possession 0.92 → 0.58, steals a poke 0.34 → 0.11, the rival's
  shots a minute 0.86 → 2.14 (made 0 → 4), the score margin a minute 14 → 6.7. 3v3: steals a rival possession 0.82 → 0.61, steals on
  the read or the bump 10 → 1, the rivals' shots a minute 0.24 → 0.72 (the kinetic drive-by steal and parry-vault are not covered: 10 of
  the 11 steals left). **Flag:** reach-in fouls a poke 0.28 → 0.37 (1v1), 0.13 → 0.24 (3v3) — a poke that misses while running into him
  is whistled, as before; more pokes miss now. Feel-check: 1v1 PRO on defence,
  reach at his dribble from the side he holds it and from his far side.
- `hoops.rivalChaseBoardOn` **1** (group "Hoops · flow and pace"; `hoops/boardChase.ts` `RIVAL_CHASE_BOARD_ON`): **the 1v1 rival goes and
  gets a loose ball** — 3v3's rule (`DefenderBrain.chaseBall`, the chase outranks the seal) on his brain, on your miss and on his. Before:
  he held his box-out seal while the ball rolled away (or crashed at a walk after his own miss), and the mode's 4 s stall guard teleported
  both players to the check. 1v1, all three off → on: boards that stalled 5 of 11 → 0 of 8, miss → board median 3.3 → 0.8 s.
  Feel-check: 1v1, miss long off the rim and watch him run it down.
- `hoops.introPressPlaysOn` **1** (group "Hoops · flow and pace"; `court/mount/hoopsBroadcast.ts` `INTRO_PRESS_PLAYS_ON`): **the press
  that skips the opening intro starts play on the next frame.** Before, play waited out the camera's whole 0.35 s hand-over, so the
  first stick press of every 1v1 / 3v3 game moved you after 383 ms (later presses 33 ms). The camera is untouched: a test runs the real
  CameraDirector and its path is the same frame for frame with the switch on and off. Feel-check: start a 1v1 and push the stick the
  moment the crane shot appears.

## online-play, 2026-11-21 (owner: "Make sure the story and online play is finished"; the owner has not felt these yet)

Group "Online play". All NEW numbers, chosen on this lane (`docs/ONLINE-FINISH-PLAN.md`); none changes an existing tuned
number. The panel's session gate keeps overrides OFF in online and party runs (`lib/feel-panel/sessionGate.ts`), so in a
real online game these are what ships; each is the record of the number and the switch back.

| Knob | Default | Restores the old behaviour at | What it does |
|---|---|---|---|
| `net.mirrorOn` | 1 | 0 | One shared game (one page runs it, the others draw it). 0: each page runs its own game, the old one-seat wiring. |
| `net.renderDelayMs` | 0 (adaptive) | — | How far behind the newest world another page draws. 0 = two ticks + 1.2 × jitter, 66–250 ms. |
| `net.poseHz` | 15 | — | Body pose updates a second (roots and the ball always 30). |
| `net.possessionSwap` | 1 | — | 1v1: the page whose player has the ball runs the game. 0: the host runs every possession. |
| `net.karateTogether` | 0 | 1 | "Start together" offers Karate co-op (not shared yet: two fights). |

## improve-world, 2026-11-22 (the 10-phase pass, lane C: the story and the zones; docs/IMPROVE-10-PHASE-AUDIT.md phases 5, 7, 9)

All NEW switches and numbers, chosen on this lane; none moves an existing tuned number. Each switch's 0 restores the behaviour before
this pass exactly (a test pins both ends).

- `story.sfxOn` 1 (group "Story · flow"; `lib/babylon/adventure/audio/storySfx.ts` `STORY_SFX_ON`, phase 5): the story's sound effects,
  driven by the host's own events: your footsteps, jump, landing, strike swing, homing dash; the rail's clank, grind hiss, switch,
  trick and hop-off; every hit by its outcome (hit, block, parry, guard break, dodge); a foe going down; a monster's and the boss's
  wind-up; spells pitched by element; the partner's steps, spells, revive and fusion; a camp's drum, the boss's sting and phase change,
  a cleared camp or boss, a chapter's end, a gate's warp, a soft tick on each new line of a scene; birds and a gust over the wind bed.
  SoundKit's synths plus three sounds made in code (`lib/babylon/audio/natureSfx.ts`: a bird, a gull, a wave); no new files. Mute and
  volume apply. New [TUNE] numbers in the file: `STEP` (0.8 m a step; ground 1.25 pitch / 0.11 volume), `HEAR` (full within 6 m,
  nothing past 60 m), `GRIND_EVERY` 0.12 s, `AMBIENT` (a bird every 3–9 s, a gust every 10–20 s). 0 = the wind bed and the spoken
  lines only, as before. Measured (lane C rig, phone tier, 3 runs a side interleaved, the Venice hub as control): sound starts in 8 s of
  the opening scene 0 / 0 / 0 → 8 / 11 / 7, in 8 s of play in control 0 / 0 / 0 → 5 / 27 / 7; load and frame times inside the control's
  spread. Ships ON. Feel-check: play the rail run and the first camp with the sound up.
- `coast.oceanBed` 1 (group "Coast · zone"; `lib/adventure/coast/zoneSound.ts` `COAST_OCEAN_BED`, phase 5): the zone asks for the
  ocean bed in its load (as Venice does), so the harness no longer starts its stadium crowd on the first press; with it, a wave on the
  nearest shore every 3.5–6.5 s (louder within 10 m, nothing past 90 m), a gull every 6–14 s, and footsteps by surface (sand: Venice's
  sand step; the dock's and bridge's boards 1.45 / 0.15; the shallows a splash). 0 = no bed asked for: the stadium crowd, as before.
  Measured (same runs): the bed built 900 Hz (the stadium crowd) in 3 of 3 → 500 Hz (the ocean) in 3 of 3; Venice unchanged (500 Hz both
  sides). Ships ON.

## hoops-gap, 2026-11-23 (owner: "close the gap and pass them"; docs/HOOPS-GAP-PLAN.md; the owner has not felt these yet)

NEW switches, each **1 = on, 0 = today's game exactly** (tests pin both ends). No existing tuned number moved.

- `hoops.aiShotIqOn` **0** (group "Hoops · rival offense"; `hoops/teamOffense3v3.ts` `AI_SHOT_IQ_ON`, with its new numbers
  `SWING_OPEN_M` 1.5 m, `STEPBACK_SEC` 0.38 s, `STEPBACK_MPS` 3.2 m/s, `SMOTHER_M` 1.6 m, `STEPBACK_RANGE_EXTRA_M` 1.0 m, `HELP_FACE_M`
  1.4 m): **the 3v3 rivals' shot IQ.** Held in front, their handler swings it to a team-mate whose man must close out on him before he
  pulls up into the defender; with nobody to swing to he steps back once for room, then pulls up; at the rim with a body in his face he
  kicks it to the open man (drive and kick). Before: 80 % of their shots were pull-ups held in front, every one contested 0.5 or more.
  Headless (rival-sim 3v3, PRO, a defender who sees the ball 220 ms late, three seeds × 300 possessions): points a shot 0.627 → 0.666,
  points a possession 0.507 → 0.530, passes a possession 0.28 → 0.44, catch-and-shoots 70 → 149. Feel-check: 3v3 PRO on defence — do
  they move the ball and find the open man, and are they harder to stop?
- `hoops.pnrCoverageOn` **0** (group "Hoops · defense"; `hoops/pnrCoverage.ts` `PNR_COVERAGE_ON`, wired in `core/BasketballCore.ts`
  DefenderBrain and `hoops/teamDefense.ts`; new numbers `PNR_OVER_MAX_M` 7.5 m, `PNR_SCREEN_M` 1.4 m, `PNR_SCREEN_BALL_M` 2.8 m,
  `PNR_PLANTED_MPS` 0.6 m/s, `PNR_SHOW_SEC` 0.6 s, `PNR_SHOW_M` 1.1 m, `PNR_TAG_RIM_M` 5 m, `PNR_ROLL_MPS` 1.5 m/s, `PNR_TAG_FREE_M` 1.6 m,
  `PNR_BEATEN_M` 1.9 m, `PNR_UNDER_LEVER` 0.45, `PNR_DROP_LEVER` 0.45, `PNR_TAG_LEVER` 0.35, `PNR_SPOT_DEAD_M` 0.4 m): **the AI's
  pick-and-roll coverage** (3v3 only; a 1v1 brain has no screens). The man on the ball plays the screen — over the top on a handler inside
  7.5 m of the rim, under past it (he used to run into the screener: the navigate read skipped any body near the ball); the screener's
  man shows into the handler's corner (over) or drops (under); the low man tags a free roll man; the team defence switches only when the
  screened man is beaten (it switched whenever the geometry allowed). Headless (`scripts/probes/hoops-close/pnr-sim.mts`, three AI
  defenders against the 3v3 team offence, PRO, seeds 7 / 11 / 23 × 300): points a pick-and-roll possession 0.597 / 0.604 / 0.579 →
  0.655 / 0.635 / 0.592 — **the defence gets a little worse, not better** (today's switch-on-every-screen keeps a man in front); the
  roll man got an open look 0 % both ways (the screener pops nearly every time: the low man at the rim keeps his roll lane shut). OFF for the owner to
  feel. Feel-check: 3v3 PRO, call a screen and come off it at the arc.
- `hoops.screenerRollOn` **0** (group "Hoops · rival offense"; `hoops/screenerRoll.ts` `SCREENER_ROLL_ON`, wired in `core/BasketballCore.ts`
  TeammateBrain and `hoops/teamOffense3v3.ts`; new numbers `ROLL_NEAR_M` 2.5 m, `ROLL_NEAR_LANE_M` 1.1 m, `ROLL_MAN_AHEAD_M` 0.3 m,
  `SLIP_MIN_SEC` 0.25 s): **a real roll man.** The screener rolls (or slips early) when his own man has stepped up to the ball or nobody
  stands on the first 2.5 m of his line to the rim — before, only when no defender was within 1.6 m of his whole line, so the low man at
  the rim kept him popping (one roll in 631 screens) — and the PRO and ELITE handler looks for the open roll man through the use and the
  attack. Headless (pnr-sim, PRO, seeds 7 / 11 / 23 × 300): the screener rolls on 25–30 % of pick-and-rolls (was 0–1 %); points a
  pick-and-roll possession against today's defence 0.593 → 0.644; with `hoops.pnrCoverageOn` too, 0.576. The roll man's best
  separation inside 5 m was about 1.0 m (his man stays with him), so he was never open enough for the pass (0 catches). OFF.
- `hoops.rollScoreOn` **0** (group "Hoops · rival offense"; `hoops/screenerRoll.ts` `ROLL_SCORE_ON`; needs `hoops.screenerRollOn`; new
  numbers `GHOST_RANGE_M` 1.5 m, `ROLL_LEAD_OPEN_M` 1.6 m, `ROLL_PASS_MPS` 14 m/s (the chest pass's speed, for the lead), `ROLL_CATCH_RIM_M`
  3 m): **the roll man scores** — the early slip, the ghost screen, the leading pass to where he will be, a catch at the rim goes up at
  once. pnr-sim with the game's reaction delay (`LENS=1`, PRO, three seeds): roll-man catches 0 → 8–13 % of pick-and-rolls, the offence
  0.659 → 0.680 points a possession; open looks for the roll man still 0 % (his man stays about 1.1 m off him). OFF.
- `hoops.pnrFightFullOn` **0** (group "Hoops · defense"; `hoops/pnrCoverage.ts` `PNR_FIGHT_FULL_ON`; needs `hoops.pnrCoverageOn`): fighting
  over a screen at full pace instead of `FIGHT_SLOW` 0.7 (the number itself unchanged). Measured no help: against the roll 0.715 → 0.732
  points a pick-and-roll possession. OFF. **Correction to `hoops.pnrCoverageOn` above:** with the game's reaction delay in the sim the
  coverage is worse than today's switch-every-screen against the roll too (0.693 → 0.715); keep it off.
  Round 3 (the same switch): the roll goes to the block with the most room (`ROLL_BLOCK_SIDE_M` 2.0 m either side of the rim,
  `ROLL_BLOCK_OUT_M` 1.2 m out) instead of straight down his line into the man guarding him; numbers in docs/HOOPS-GAP-PLAN.md §5.6.
- `hoops.steppingDefenceOn` **0** (group "Hoops · transitions"; `anim/basketballTree.ts` `STEPPING_DEFENCE_ON`, with `STEP_CLIPS`, the
  turn-and-run's `STEP_RETREAT_*` numbers: stride 4.0 m/s, travel 135°, the diagonal 100–160° off the chest, in above 2.6 m/s and out under
  2.2): **the owner's stepping-defence clips drop in by name** (HOOPS-GAP-PLAN §6b: `defend_slide_left_v2`, `defend_slide_right_v2`,
  `defend_slide_hard_left_v2`, `defend_slide_hard_right_v2`, `def_retreat_run_left`, `def_retreat_run_right`, each as `bball_mc_<name>` from
  the capture pipeline or `bball_<name>` authored). Each plays forward at the stride the list asks for; a clip the rig does not own plays
  today's clip exactly (slide bench with the knob on and no new clips: the same 4.5 / 10.4 / 2.7 / 5.6 cm). OFF until the clips exist.
- `hoops.contactVoiceOn` **0** (group "Hoops · sound"; `audio/hoopsSfx.ts` `CONTACT_VOICE_ON`, with `CONTACT_HAND_PITCH` 1.2,
  `CONTACT_HAND_GAIN` 1.0, `CONTACT_KNOCK_GAIN` 0.35, `CONTACT_BODY_GAIN` 0.9, `CONTACT_MIN_GAP_SEC` 0.06 s): **contacts sound like hands on
  the ball and bodies.** On the court (the hoops sample bank), an `impact` at a hand-on-ball pitch (strips, pokes, parries, blocks) plays the
  recorded palm slap over a short knock, a body contact the low thud, instead of the arcade boop; the call's volume is kept; two contacts
  within 60 ms are one; the mute silences it (tested). Levels in docs/HOOPS-GAP-PLAN.md §5.7. A feel item: OFF for the owner's ear.

