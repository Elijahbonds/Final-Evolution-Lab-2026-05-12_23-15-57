# SPEC — Weather pass

Owner ask (2026-09-15): "We need to do a weather pass." Status: **spec only. The build starts after the friend-test RC deploys.**

## Owner decisions (one round)

| Question | Decision |
|---|---|
| What weather does | **Looks + light gameplay.** Rain, snow, wind, fog and time of day are mostly visual: particles, wet surfaces, sky, light, sound. The gameplay effects are small and fair: wind pushes balls and planes, a wet court trims grip a little, snow slows boards. |
| Conditions | **All four sets:** rain + wet surfaces · snow / blizzard · wind + dust/leaves/spray · time of day + fog/storm (lightning). |
| Who picks | **A WEATHER chip on the start screen, plus RANDOM.** It sits next to setting / items / card. The default is the venue's natural weather. |
| Scope / timing | **Outdoor modes only, after the RC.** The dojo and indoor venues stay dry. |

## What exists today (audited 2026-09-15)

- **No weather system.** Searching for "rain" only finds `train`/`constrain`. There are no precipitation particles, wet materials or fog states.
- `lib/babylon/scene/moods.ts` has six LightRig moods (`goldenHour · daylight · dojoWarm · nightGame · alpine · overcast`), each with sky, sun, exposure, bloom, grade and vignette, plus `skyWash` over the baked backdrop domes. **Time of day should be built as mood variants, not as a second lighting pipeline.** LightRig already *is* the render pipeline.
- Golf already has per-hole wind, shown before the shot and applied through the flight (docs/concept-lock/golf-signoff.md). **Weather wind must feed that same value, not add a second one.**
- Board modes have a wind sound bed (skate, snow). Surf has a ribbon wave.
- Drift: `GolfMode.ts` uses `mood: 'afternoon'` and `TennisModeV2.ts` uses `'courtside'`, which are not `VenueMood` values (probably dead twins; see pass-4 notes). Confirm before touching.

## Architecture (the shared-channel rule: one system, N modes read it)

1. **`lib/babylon/core/WeatherKit.ts` — pure, no Babylon.**
   - State: `{ condition: 'clear'|'rain'|'storm'|'snow'|'blizzard'|'wind'|'fog', intensity 0..1, wind: {x,z} m/s, wetness 0..1, timeOfDay: 'dawn'|'day'|'dusk'|'night' }`.
   - `rollFor(venue, seed)` rolls RANDOM from the venue's allowlist. `naturalFor(venue)` gives the default.
   - Wetness builds and dries on an exponential in dt, and a storm's gusts are frame-rate independent (the SpeedFov/BoostKit lesson).
   - **Gameplay modifiers, capped here and nowhere else:**
     - `gripMult()` ≥ 0.90
     - `boardDragMult()` ≤ 1.12
     - `ballWindAccel()` ≤ 1.5 m/s²
     - `flightWind()` ≤ 4 m/s
   - A fair mode shows every modifier before you commit, the way golf already shows wind.
2. **`lib/babylon/nexus/weather.ts` — the pick module**, shaped like `boardVenues`/`courtLocations`: `readWeather(modeId)`, `writeWeather`, `readyWeathers(venue)`. Returns `'natural' | 'random' | condition + timeOfDay`.
3. **`lib/babylon/premium/WeatherFx.ts` — what it looks like.** Every effect is tiered by `QualityTier`.
   - **Precipitation:** a camera-riding emitter, the same pattern as BoostFx's speed lines. Rain uses stretched streaks, snow uses soft flakes, and a blizzard adds whiteout (mood, not fog, per the pass-5 note). Splash sprites land on the ground plane.
   - **Wet surfaces:** a lerp on the venue ground and court PBR materials (roughness down, a clearcoat sheen, darker albedo) driven by `wetness`, plus puddle decals on flat ground. **Unlit / PBR only**, because of the StandardMaterial ratchet.
   - **Wind:** leaves, sand and sea spray particles along the wind vector; flag and tree sway through the existing prop system; crowd cloth later.
   - **Fog and storm:** `scene.fogMode` exp2 plus mood exposure, lightning as a LightRig exposure pulse with a delayed thunder cue, and a storm sky wash through `skyWash`.
   - **Time of day:** `dawn/dusk/night` mood variants per base mood. Night turns on venue lights (court floodlights, trackside), which is the existing `nightGame` look generalised.
   - **Sound:** rain, storm and blizzard beds through SoundKit ambient, crossfaded with the venue bed.
4. **BootSplash chip — WEATHER.** Choices: NATURAL · RANDOM · the venue's allowed conditions, plus a time-of-day row. It **reloads the route like a venue pick**, because weather dresses the world at load. It follows the pickerReach rule: a mode listed on the chip must read `readWeather`, checked structurally by extending `lib/babylon/combat/pickerReach.test.ts`.
5. **The harness passes weather in** as `ctx.weather` (a WeatherKit instance), so modes read one object instead of each fetching the pick.

## Venue allowlists (no snow on the beach)

| Venue family | Natural | Allowed |
|---|---|---|
| Venice court / street hoops / skatepark / freerun rooftops | clear · dusk | clear, rain, storm, wind, fog, all times |
| Surf break / aero bay | clear | clear, wind, storm, fog, dawn/dusk (no snow) |
| Mountain slope (snowboard, big air) | alpine clear | clear, snow, blizzard, wind, fog, all times |
| Golf links / ballpark / soccer / football / tennis / volleyball | venue default | clear, rain, wind, fog, all times (+ snow for football) |
| Kart and aero courses | per course venue | from the course's world (`RaceCourse.venue`) |
| **Dojo, arena interiors, dance, quiz, brain brawl** | — | **none — no chip shown** |

## Gameplay hooks (small, fair, visible)

- **Ball flight** (hoops shots, golf, soccer, baseball, tennis, volleyball): wind acceleration through the ball sim, shown on the HUD as a bearing arrow plus m/s. Golf keeps its own wind, and weather sets it.
- **Aero Aces:** a crosswind on FlightModel, plus gust shake at storm intensity.
- **Kart:** wet grip via `gripMult` on KartModel, with drift made a little easier (a rain-drift feel, not a penalty).
- **Boards:** snow drag on BoardMovement for the snow modes; wet skate lowers push grip. The surf swell rises with wind.
- **Courts:** `gripMult` on footwork accel. A cut on a wet court slides a few centimetres more.
- **Never:** random mid-play weather changes that punish a committed action, or visibility dropping below what the camera needs to frame the play (the FrameGuard bar).

## Proof bar

- **Unit tests:** the modifier caps, each venue allowlist (no forbidden condition can roll), frame-rate independence of wetness and gusts, a seeded RANDOM, and pick read/write.
- **Structure:** extend pickerReach so every mode with the chip reads the pick.
- **Gauntlet:** a `weather=random` pass over all outdoor modes: 0 console errors, fps P10 no worse than 10% below clear at the same QualityTier, end card reached.
- **Visual:** eye frames for each venue × condition (clear/rain/snow/storm/night). Wet sheen must be visible and must not blow out under PBR; precipitation must never occlude the hero (FrameGuard).
- **Phone:** on the low tier, particle budgets hold 60 fps.

## Order (after the RC)

1. WeatherKit + tests.
2. Pick module + chip + pickerReach.
3. WeatherFx rain / wet / night on the Venice court family (most modes share it).
4. Snow / blizzard on the slope.
5. Wind / spray / fog / storm.
6. Gameplay hooks mode by mode, each with a HUD readout.
7. Gauntlet `weather=random` + eye frames.
