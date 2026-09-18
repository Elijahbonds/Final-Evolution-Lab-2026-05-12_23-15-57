# Dunk parity audit — what the other modes are missing

**2026-09-14.** Owner ask: *"upgrade all the other games to be as good as the dunk one."*

This is the measured gap, not a wish list. Every row was grepped against the enabled registry before it
was written down — five "X is missing" claims earlier in this session turned out to be wrong, so the rule
here is **grep the consumer before calling a producer unused**, and the withdrawn claims stay in the doc.

## The bar

`DunkMode` is 2352 lines and 49 imports. The things it has that the roster mostly does not:

| capability | what it buys | who else had it, before this pass |
|---|---|---|
| `ContinuousNight` | GO AGAIN inside the running mode instead of a modal that tears the scene down | **nobody** |
| `RivalNerve` | the opponent feels the scoreboard | **nobody** |
| `MomentumBus` + a response | the crowd hears a run | 7 modes reported; **1** subscribed |
| `CrowdEnergy` | a venue voice tied to the mode's own beats | nobody (and it should stay dunk's) |
| `DunkReplayCam` | a camera for the signature moment | nobody |
| posture layer | the body reacts, not just the clips | most modes ✓ |
| one anim owner | no stranded fades | most modes ✓ |

## Closed in this pass

| # | gap | what shipped |
|---|---|---|
| 1 | the floor ignored a hard stop | `ScuffFx` — deceleration-thresholded dust + squeak, wired into 1v1 and 3v3 |
| 2 | the render pipeline never responded to gameplay | `ImpactFrame` in `ModeHarness` — **21 modes** that already call `ctx.feel.impact` gained a vignette punch and exposure dip with no per-mode code |
| 3 | the lens did not know how fast you were going | `SpeedFov` — kart, aero, skate, snow, surf; FreeRun's unclamped hand-roll moved onto it |
| 4 | going ON FIRE was inaudible | `MomentumFx` + the bus on `ModeContext` — crowd bed and tier sting in every mode |
| 5 | 17 modes reported nothing into the meter | six discipline-neutral event kinds; combat, net sports, racing, 3PT and dunk duel wired |
| 6 | every opponent but one was a constant | `Nerve` — wired into tennis, volleyball, karate_vs, mixedcombat, 1v1 |
| 7 | `Coyote` was exported and unused | wired into FreeRun's ledge jump and the skate ollie |

### Findings worth keeping

- **`onTierChange` had one subscriber in the entire game** (OneVOneMode:566), and `multiplier()` one caller.
  The bus worked perfectly and was inaudible. A producer with no consumer is not a feature.
- **`momentum:` in `setHud` mostly does not draw.** There are 21 separate Babylon host components and most
  never render it. Any response that needs a host is a response most modes will not get — which is why the
  crowd bed and the sting live in the world instead.
- **`rig.pipeline` had no reader outside `LightRig`**, and `rig.flashBeat()` had exactly one caller
  (ThreePointMode, on a made three).
- **`Coyote` in `gameFeel` was a dead export** — closed; see #7. In skate it was worse than losing the
  pop: the branch order meant a late ollie press was spent as an unintended *trick*.
- **`NerveShift.edge` was my own trap, and it shipped for one commit.** Every opponent exposes skill as
  ONE number bundling pressure and accuracy, so nudging it up for a trailing AI is a straight buff. `edge`
  and `nervedSkill` were deleted; the module now offers two dials that must be hung on two *different*
  mechanisms. If a mode cannot name both, it is not ready to be nerved.
- **Putting the bus in the harness created two conflicts**, both closed: four modes cooled the meter
  themselves (double decay), and DunkMode's `CrowdEnergy` would have been overwritten every frame
  (`ModeDefinition.ownsCrowd`).

### Withdrawn before they became work

- *"tennis and volleyball have no juice at all"* — both are ~30-line configs over `NetSportMode`, which has
  `feel.impact`, `CameraDirector`, `Onlookers` and `SoundKit`.
- *"KarateEndlessMode never calls feel.impact"* — it calls `ctx.feel?.impact?.()` six times. The grep was
  wrong, not the mode.
- *"`gameFeel` reaches only 2 modes"* — `ModeHarness` builds `ctx.feel` for **every** mode, and
  `StrikeSystem` carries it into the combat family.

## Still open, in priority order


### 1. GO AGAIN — CLOSED AS A NON-GOAL (owner, 2026-09-14)

Asked and answered: **modes should end.** `ctx.end()` stays the roster's session flow, and `ContinuousNight`
stays dunk's, where it was built for the logged-out funnel (TRY-ONBOARD G1).

Recorded because the engineering case was real and someone will re-derive it: `ctx.continuous` and
`ctx.card()` are already on `ModeContext`, and only `DunkMode` uses them. Also recorded because the
*implementation* was not the blocker — `continuous` is passed by exactly one component in the app
(`guest-dunk-shell.tsx`, to `DunkBabylon`), so the mode-side half alone would have been dead code, and
which modes should refuse to finish is a product call rather than an engineering one. If it is ever
revisited: the card should be drawn by `ModeHarness` on the overlay `JuiceKit` already owns, not by the
twenty-one host components (owner's call, same day).

### 2. Nerve for the remaining opponents

3v3, duel and showdown. **Racing is withdrawn** — this doc previously listed the racing rivals as a target
on the strength of `stepRival` taking `topSpeed`/`cornerBite`. `RaceField` already has a documented,
bounded, symmetric rubber band (`RUBBER_BAND` 0.12 / `BAND_LIMIT` 0.14): that *is* its adaptive layer, and
nerve on top would double-dip. Duel and showdown also need checking first — neither appears to have an AI
difficulty knob at all, so they may need one built before they can be nerved.

### 3. Modes with no posture layer

duel, showdown, sprint, velocitykart, aeroaces, who_scene_it, brainbrawl.

### 4. Modes with no single anim owner

3PT, AirSession, sprint, precisionModes, kart, aero, carnival, dance, quiz.

## How any of this gets verified

The Browser pane **backgrounds its tab**, so `rAF` is suspended, `scene.getFrameId()` never advances, and
every value read there is the same value forever — which reads exactly like "the effect does not work".
Use `scripts/probes/`, which run a visible Playwright page with a real 60 fps loop and print the frame
count first so a zero is unmissable.

- `_speedfov-impact-probe.mts` — measured fov 0.800 → 0.863 at 94 km/h and back to exactly 0.800.
- `_momentum-reach-probe.mts` — reads `__FEL_DEV__.momentum()`. **Its driver is a key masher and cannot
  play these games**: it landed roughly one strike in twenty seconds of karate. A zero peak from it is
  evidence about the driver, not about the wiring.
