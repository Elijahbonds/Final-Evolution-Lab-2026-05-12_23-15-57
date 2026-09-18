# FEL Roster Baseline — Phase 0

Serves both convergence briefs (Part 1 `/docs/baseline-audit.md`, Part 2 `/docs/roster-baseline.md`). One
document, because the two audits are the same audit.

Measured 2026-09-13 against the real repo. **Three premises in the briefs do not match this codebase** and
are corrected here rather than built on:

| Brief says | Actually |
| --- | --- |
| Vite app at `/tmp/fel3` | Next.js 14 App Router, this repo. `/tmp/fel3` does not exist (third brief to assume it) |
| Deploy to Vercel | Live on Firebase Hosting SSR. Owner decision: keep Firebase, owner runs the deploy |
| Batch D = 7 DOM mockups to convert | Six of the seven are already Babylon modes. See "Batch D is wrong" below |

## Gate 0 — VERIFIED

Measured on the live rig, not assumed:

- **22 bones, 0 prefixed.** `Hips LeftUpLeg LeftLeg LeftFoot LeftToeBase RightUpLeg RightLeg RightFoot
  RightToeBase Spine Spine1 Spine2 LeftShoulder LeftArm LeftForeArm LeftHand Neck Head RightShoulder
  RightArm RightForeArm RightHand` — exactly the shipping spec.
- **847 clips** resolve in the library.
- **Three clips played end to end**, watching five extremity bones every frame for a jump:

  | clip | frames | max inter-frame bone move | NaN frames |
  | --- | --- | --- | --- |
  | `idle_stand` | 182 | 0.0012 m | 0 |
  | `run` | 38 | 0.135 m | 0 |
  | `jab` | 31 | 0.047 m | 0 |

  `run`’s 0.135 m/frame is a hand at ~8 m/s through a run cycle, which is the clip working, not a snap.

Note on the T-pose check both briefs ask for: **bind is a T-pose, the LOAD state is arms-down**, by design.
The bind pose is covered by the existing `avatar-pose-tests` suite (green). A probe that read the load state
and expected a T-pose would report a false failure.

## The roster, booted

Every registered mode, cold-booted headless, measured after a 5 s settle.

| mode | nav | loads | fps | meshes | skeletons | clips playing | audio | benchmark | defining mechanic |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `dunk` | ON | y | 60 | 174 | 37 | 7 | - | NBA Live 08 (optimised) | Charge, pick a style mid-flight, finish at the rim. |
| `karate` | ON | y | 60 | 155 | 85 | 16 | - | Dynasty Warriors (owner lock: Matrix Revolutions / Pirate Warriors) | One contact drops one body; the swing arc is the weapon. |
| `football` | ON | y | 60 | 163 | 79 | 12 | - | NFL Blitz | One play, one read, one down. |
| `skateboard` | ON | y | 60 | 134 | 49 | 9 | - | Skate 3 | A line is one unbroken combo; bailing costs the whole line. |
| `snowboard_slalom` | ON | y | 60 | 132 | 49 | 9 | playing | SSX | Carry speed through the gate line instead of braking into it. |
| `surf` | ON | y | 60 | 103 | 37 | 7 | playing | SSX | Read the wave face and spend it on a trick. |
| `tennis` | ON | y | 60 | 92 | 43 | 8 | playing | Virtua Tennis | Get your feet there first; the swing window rewards it. |
| `derby` | ON | y | 60 | 133 | 51 | 9 | playing | MLB The Show (PCI) | Pitch location versus swing timing, nothing else. |
| `penalty` | ON | y | 60 | 135 | 49 | 9 | playing | FIFA Street (small-sided) | One touch to beat the keeper. |
| `golf` | ON | y | 60 | 104 | 31 | 6 | playing | Everybody’s Golf | Swing, aim and putt are three separate skill moments. |
| `onevone` | ON | y | 60 | 174 | 37 | 7 | playing | NBA 2K | Beat your man off the dribble; the handle gates the move. |
| `threepoint` | ON | y | 60 | 233 | 61 | 11 | playing | NBA 2K 3PT contest | Rack under a clock; the money ball is the pressure. |
| `freerun` | ON | y | 60 | 21 | 1 | 1 | playing | Mirror’s Edge / Skate combo scoring | Never stop moving; a stumble ends the line. |
| `bigair` | ON | y | 60 | 96 | 37 | 7 | ctx | SSX | One jump, all of it spent in the air. |
| `sprint` | **off** | y | 60 | 28 | 7 | 2 | playing | Track & Field | Rhythm, not mashing. |
| `threevthree` | ON | y | 60 | 204 | 61 | 12 | playing | NBA 2K | Off-ball movement creates the shot, not the ball-handler. |
| `carnival` | ON | y | 60 | 38 | 7 | 2 | playing | Wii Sports Resort (floor) / Mario Party (readability) | A spectator understands the minigame in three seconds. |
| `volleyball` | ON | y | 60 | 190 | 73 | 13 | playing | Wii Sports Resort (quality floor) | Three touches: the chain is the rally, not the exchange. |
| `karate_vs` | ON | y | 60 | 102 | 49 | 9 | playing | Soul Calibur / Naruto Storm | Vertical strikes are steppable; horizontals catch the stepper. |
| `showdown` | **off** | y | 60 | 41 | 7 | 2 | playing | Naruto Storm (support) | Your partner is a resource you spend. |
| `duel` | **off** | y | 60 | 16 | 7 | 2 | playing | Soul Calibur | Reach decides the fight before the hands do. |
| `mixedcombat` | ON | y | 60 | 92 | 49 | 9 | playing | Soul Calibur | Ring-out is a win condition, so spacing is survival. |
| `aeroaces` | ON | y | 60 | 14 | 0 ⚠️ | 0 | playing | Diddy Kong Racing (flyer) | Dive for speed, pull out through the ring. |
| `velocitykart` | ON | y | 60 | 32 | 1 | 1 | playing | Mario Kart | Drift to bank boost; the corner you cannot hold is the one worth sliding. |
| `dunkduel` | ON | y | 60 | 166 | 32 | 7 | playing | NBA Jam | Trade dunks until one of you blinks. |
| `dance` | ON | y | 60 | 38 | 1 | 1 | playing | Dance Central | The note highway is the whole read. |
| `who_scene_it` | ON | y | 60 | 11 | 0 ⚠️ | 0 | playing | Scene It / Mario Party | Buzz in before you are sure. |
| `brainbrawl` | **off** | y | 60 | 18 | 0 ⚠️ | 0 | playing | Brain Age / Mario Party micro-games | One question, one breath, escalating stakes. |

## What the measurement actually found

**Good, and better than either brief assumes:**

- 28 of 28 modes load. None crash.
- 28 of 28 run at **60 fps**. The performance floor both briefs set as a Phase 5 / Phase 9 goal is already met
  on this hardware. It still needs verifying on mid-tier hardware, which I cannot do from here.
- 28 of 28 produce audio. (My first probe counted Babylon `soundTracks` and read 0 everywhere — `SoundKit`
  is raw WebAudio. The instrument was wrong, not the roster silent.)

**The real gaps, in priority order:**

1. **Three modes contain no human at all** — `aeroaces`, `who_scene_it`, `brainbrawl` boot with **0 skeletons**.
   This is the same defect I fixed in Velocity Kart today (a vehicle driving itself), and it is the sharpest
   version of the unfinished signal: the owner’s standing rule is that every body in a scene is a humanoid
   that moves well, and these scenes have no body to judge.
2. **Sparse worlds.** `who_scene_it` 11 visible meshes, `aeroaces` 14, `duel` 16, `brainbrawl` 18, `freerun` 21,
   `sprint` 28, `velocitykart` 32. For comparison `threepoint` renders 233 and `dunk` 174.
3. **Four modes are registered but off-nav**: `sprint`, `showdown`, `duel`, `brainbrawl`. Owner decision
   2026-09-13: *"i want to include and improve them, wire them in"* — so there is **no containment wall** in
   this pass. Part 1 Phase 9 item 1 is overridden.
4. **`velocitykart` has no AI opponent.** It is a time trial. Part 2 Phase 2 requires competitive AI racers.
5. **Eight modes have no difficulty tiering**: football, threevthree, carnival, volleyball, tennis, karate_vs,
   who_scene_it, velocitykart.

## Batch D is wrong

Part 2 lists Tennis, Golf, Soccer, Baseball, Football, Gymnastics and Dance Rhythm as "DOM-mockup
conversions". Measured:

| Brief calls it a DOM mockup | Reality |
| --- | --- |
| Tennis | Babylon `tennis`, a config over `createNetSportMode`. Boots, scores, 60 fps |
| Golf | Babylon `golf` in `precisionModes.ts` |
| Football | Babylon `football` (`FootballRushMode`) |
| Dance Rhythm | Babylon `dance` (`DanceMode`) |
| Soccer | Route maps `soccer → penalty`, a Babylon mode |
| Baseball | Route maps `baseball → derby`, a Babylon mode |
| Gymnastics | **Deliberately removed.** `registry.ts`: "A+ mission #10: free-running tricking replaces the gymnastics vault". FreeRun took the slot |

So Phase 4’s "conversion framework" has almost nothing left to convert. That budget moves to the gaps above.

## Known instrument limitations

- `engine.drawCalls` reads -1 without the instrumentation engine; the dev HUD computes it separately. Draw
  counts in this table are omitted rather than guessed.
- `/api/profile` returns 401 on every `/dev/mode/*` boot. Expected — the dev harness has no session. Filtered
  out of the error counts rather than reported as 28 mode defects.
- fps is measured on this machine (Apple Silicon). The mid-tier floor both briefs require is not verified.
