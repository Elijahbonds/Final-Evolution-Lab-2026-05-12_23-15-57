# The Physics Arena — audit, design, plan and the first slice

The owner, 2026-11-23, verbatim: **"Make there be a live physics play arena for the sport modes.- all the modes can be played
physics based. And POV-"** (recorded in `docs/OWNER-DECISIONS.md` with the lane's `assumption:` readings). Lane
`lane/physics-arena`.

The owner added (2026-11-23, verbatim): **"The inspiration for the physics based sport arena was Dunk- made by katapult."** That game
is a **quality and feel reference only**, as every benchmark game here is: nothing is copied from it (no name, title, characters,
art, levels, mode names, UI or sounds), and the arena keeps its own name ("Physics Arena") and its own look (a lab court). The feel
goal taken from it: **physics-first play, no scripted outcomes** — the ball and the bodies are physics-driven, dunks, blocks and
collisions emerge from the simulation, and it is fun and readable to watch. The lane does not guess at that game's mechanics; the
design choices that need the owner are questions in §6.

How this lane read it (each is an `assumption:` in OWNER-DECISIONS, reversible):

- **An arena:** one play space where the sport modes run on real physics — a rigid-body ball, a hoop the ball really hits (rim,
  glass, net), player bodies that collide, and later goals and nets for the other sports — instead of an outcome decided at the
  release and a ball flown to agree with it.
- **"All the modes can be played physics based":** every sport mode gets a physics version you can switch to, one at a time in
  the order of §5, each behind its own switch. The shipped modes do not change until their own switch is on.
- **"POV":** a first-person camera, on the camera button.
- **The message stops at "POV-".** What came next is not known. Question for the owner in §6.

---

## 1. The audit: what is physics today, and what is scripted

Read from the code at `48a7b244` (`lane/finish-release`). "Physics" below means the outcome comes out of a simulation of the
ball and the bodies; "scripted" means it is decided first (a roll, a timing grade, a table) and the ball is then flown to agree.

### Basketball

| Mode | File | The ball's flight | Who decides make or miss | Bodies |
|---|---|---|---|---|
| **1v1** | `modes/OneVOneMode.ts` | **Scripted.** `ShotArc` (`core/BasketballCore.ts` l. 1167) flies a parabola or a Bézier to the ring, then plays a planned rim "dwell" (`core/RimPlay.ts`) | **At the release.** `hoops.skillShotOn` 1 (shipped): the meter's green decides (`core/SharedShot.ts` `heroSkillVerdict`), then `rimFromRelease` draws an error that agrees. Off: `core/RimDecides.ts` draws one error so P(made) = pct (Weibull). Either way the verdict exists before the ball leaves | **Havok** capsules (`core/ContactSystem.ts`, `core/Physics.ts`): real collisions and momentum, fouls by closing speed |
| | | Loose ball: `core/BallPhysics.ts` `BallSim` — its own integrator (gravity, a floor bounce), **not Havok**; body hits swept analytically (`core/LooseBall.ts`) | Rebounds: `hoops/rebound.ts` (the bounce decides the board race since hoops-p06), `LooseBall.resolvePickup` | |
| **3v3** | `modes/ThreeVThreeMode.ts` | Scripted, as 1v1 (`ShotArc`, `rimFromRelease`) | At the release, as 1v1 (`heroSkillVerdict`, l. 2707) | **Not Havok**: circles pushed apart with momentum exchange (`resolveBodyContact`, imports only `ContactSystem`'s thresholds). The owner's 2026-10-20 "3v3: same Havok physics as 1v1" is not built |
| **3-Point Contest** | `modes/ThreePointMode.ts` | Scripted (`ShotArc`) | At the release: `rimDecides(RIM, …, pct3, q01)` (l. 784), pct from the meter's grade | One shooter |
| **Dunk / Dunk Duel** | `modes/DunkMode.ts`, `modes/DunkDuelMode.ts` | Scripted flight and flush (`core/RimFlush.ts`); a miss off the iron through `BallSim` | Judges and the press timing (`judgeDunk`); `core/RimForAll.ts` `dunkVerdict` for the game dunks | One body |
| **Court Carnival** | `modes/CourtCarnivalMode.ts` | Scripted minigames | Timing grades | — |

### The other sports

| Mode | File | What is physics | What is scripted |
|---|---|---|---|
| **Penalty (the soccer route)** | `modes/precisionModes.ts` `PenaltyMode`, `core/PenaltyKick.ts` | **The ball flies on `core/SoccerBall.ts`** (analytic: drag, Magnus curl, bounce) and can hit the post and bar (`frameHit`) | The keeper's save is a rule (`core/KeeperCore.ts`: the read, the dive window) |
| **Golf** | `precisionModes.ts` `GolfMode`, `core/GolfBall.ts` | **Analytic physics**: drag, Magnus, wind, bounce, roll, terrain, the cup | The swing's quality is a timing grade |
| **Derby (home runs)** | `precisionModes.ts` `DerbyMode` | The pitch breaks on `SoccerBall`'s Magnus (`core/Pitching.ts`) | The hit is a timing grade; the batted ball flies `aimSwingCore.Flight` (a parabola that stops at the ground) |
| **Baseball** | `modes/BaseballInningsMode.ts`, `baseballGame.ts` | — | The swing is graded on the clock; the outcome follows the grade |
| **Tennis / Volleyball** | `modes/NetSportMode.ts`, `core/RallyCore.ts`, `core/TennisAim.ts` | — | A timing window per contact; the ball flies to a chosen landing (`landingFor`). `core/TennisShots.ts` (spin physics on `SoccerBall`) exists and is **not wired** into the live mode |
| **Football Rush** | `modes/FootballRushMode.ts` | — | Catches and tackles are rules and windows (`catchGrade`, the truck window) |
| **Free Run** | `modes/FreeRunMode.ts` | **Havok** character controller and static course | — |
| **Soccer (`SoccerMode.ts`)** | 96-line stub; `/play/soccer` serves the penalty | `core/FirstTouch.ts`, `core/PassShoot.ts` (passing, first touch on `SoccerBall`) are built and **not in a live mode** | — |

**So:** Havok is in the app and runs bodies (1v1, Free Run). No ball anywhere is a Havok body. The two analytic ball cores
(`SoccerBall`, `GolfBall`) are real physics and already decide golf and the penalty's flight. Every basketball make or miss is
decided at the release.

---

## 2. The design

### The place

- **`/play/arena`** — its own page (unlisted, noindex), reached from a **Physics Arena** chip on Play (`arena.on`, ships ON). A
  practice place: it records no session, pays nothing, and starts again at 11 (`resultSink` is empty). No existing mode's page,
  default or number changes.
- The arena runs one sport at a time (`?sport=`, today `hoops`). A shipped mode is never loaded "in physics mode" by a flag on
  its own file: each sport gets a physics mode file that reuses the shared core below, so the owner-tuned modes stay untouched
  and the arena can grow without a merge fight with the hoops lanes.

### The shared physics core (`lib/babylon/arena/`)

| File | What |
|---|---|
| `arenaPhysics.ts` | `ArenaPhysics`: one Havok world per arena scene on the app's single bootstrap (`core/Physics.ts` `initPhysics`); **a fixed step** (`arena.stepHz` 120, at most 4 a frame) run from the mode's `update()`, so a pause, a replay hold or a hit-stop holds the simulation (the scene's per-render step is switched off); the **ball** (a 0.62 kg hollow sphere, real spin); the **hoop** (the ring as 20 capsules round the circle, the glass, the bracket, the pole; the net as a drag field and a cone wall); **player capsules** driven by velocity with an acceleration cap; **collision filters** (a handler's own body never fights the ball he dribbles; the other body always can); contacts drained for sound and rules |
| `hoopGeometry.ts` | The hoop's numbers, regulation (an 18 in ring 10 ft up, 6 in off the glass), feeding both the colliders and the drawing, so the iron you see is the iron the ball hits |
| `shotModel.ts` | A shot is an impulse: the throw that passes through the ring at `arena.shotArcDeg`, **plus part of the body's own vertical speed at the release** (`arena.bodyCarry`: let go rising and it goes long, falling and it goes short — the top of the jump flies true), plus the drift the hand did not cancel (`arena.runCompensate`), plus a seeded hand tremor (`arena.releaseNoise`). Backspin (`arena.backspinRps`). A pass is a throw to a chest |
| `dribble.ts` | The dribble is pushes: down hard enough to come back to the hand after one bounce, aimed where the hand will be, spinning as if rolling. A hard cut, a body in the path, or a poke and the handle is lost |
| `hoopSensor.ts` | The basket is the ball through the hoop: the ring's plane crossed downward inside the ring, then a plane under the net crossed close under it, both swept between positions. An in-and-out crosses the first and not the second |
| `arenaShot.ts` | The one release every shooter uses (the player, the rival, the tests) |
| `povCamera.ts` | POV (§3) |
| `arenaCourt.ts` | The drawn court: a lab court of its own (dark floor, bright lines, glass walls), the hoop from `hoopGeometry` |

Later sports add their own pieces to the same core: a goal frame and a net (soccer: posts and bar as capsules, the net as a drag
volume, exactly the hoop's pattern), a tennis net and court lines, a bat. `SoccerBall`'s Magnus and drag can be applied to a
Havok ball as a force each step (the analytic model stays the reference its tests already prove).

### Online (determinism)

The netd mirror is **host-authoritative** (`docs/ONLINE-FINISH-PLAN.md`, `net.mirrorOn` 1): one page runs the game, the others
draw it. So the arena does not need bit-exact simulation across devices: **the host simulates, the others mirror** the ball and
the bodies at 30 Hz (the mirror's rate) with its render delay. What the fixed step gives anyway: the same inputs in the same order
give the same world on the same build (`scripts/physics-arena-tests.ts` B, measured bit for bit), which makes a replay or a server
check possible later. Not built in this slice: the arena is not on the mirror yet (phase 6 of §5).

---

## 3. POV

- **On the camera button.** SELECT on a pad, C on a keyboard, and a **POV** button on the arena's screen. `cam.pov` 1 (ships ON in
  the arena only; 0 = the camera director's own toggle, as in every other mode). The button is the harness's (it calls
  `CameraDirector.toggle()`); the arena watches the director's mode and turns that press into POV, so no shared camera file is
  edited (`CameraDirector.ts` is lane/improve-camera's).
- **The eye:** the head bone's height (+8 cm), else `cam.povEyeM` 1.72 m; 14 cm in front of the body's axis. Your own body is
  hidden while you look out of it.
- **Head-bob:** `cam.povBobM` **0 = off** by default (a bouncing horizon is what makes first person sickening); the owner can feel
  it on the panel.
- **Field of view:** `cam.povFovDeg` 82° across the screen; the vertical one follows the screen's shape (50–90°), so a phone held
  upright still sees the ring.
- **Aiming and shooting:** the right stick turns the view (`cam.povLookDegS` 150°/s); the left stick moves you where you look; the
  shot is the same hold-and-let-go; it flies where you look, less `arena.aimAssist` 0.8 of the look's error (1 = always at the
  ring). A dot marks the centre of the screen.
- **What it costs:** nothing per frame beyond the follow camera (one pose, one setTarget).

---

## 4. The risks

1. **Phone frame time.** Havok's WASM step costs time on a phone, and the arena runs two steps a 60 Hz frame. Measured in §7: the
   physics step's own time per frame, and the frame against today's 1v1 on the same phone rig. Lever: `arena.stepHz` (90 halves
   none of the safety at shooting speeds; the tunnelling test in §7 is the guard).
2. **Online determinism.** Covered by host authority (§2). The risk is the mirror's bandwidth for a ball at 30 Hz (it already sends
   the ball) and the guest's input delay on their own shot: a guest's release is the host's to simulate, so a guest's timing
   arrives one round trip late. Plan: the guest sends the release with its own body-vy (what decided it), the host applies it.
3. **The owner's tuned feel.** None of the shipped hoops numbers is read or changed. The arena's numbers are new, on the panel
   (group "Physics arena"), and its 1v1 will not feel like the shipped 1v1 (different shot model, no meter): that is the point,
   and it is why it is a separate place and not a switch on the shipped mode.
4. **Animation over physics.** The bodies are capsules; the characters play the hoops clips over them. The hand is not where the
   ball is on every frame of a dribble (the ball is the physics', the hand is the clip's). A hand IK to the ball is phase 2b.
5. **Load.** The arena loads two characters and a light court; measured in §7.

---

## 5. The build order

Each phase: a physics mode file on the shared core, its own switch (0 = the shipped mode exactly), measured on the phone rig
against the shipped mode, pushed on `lane/physics-arena`.

| Phase | Mode | What becomes physics | The bar (measured) |
|---|---|---|---|
| **1 (this slice)** | Basketball 1v1 | Ball, rim, glass, net, two bodies, the dribble, the shot, the check pass, pokes, rebounds; the make by the sensor; POV | Good release makes ≥ 55 %, bad ≤ 25 %, gap ≥ 40 points; sensor ≥ 98 % against the path label; no tunnelling at the glass (30 m/s), the iron (25 m/s), the floor, a body; phone frame p95 within 10 % of 1v1's; the physics step ≤ 2 ms a frame on the phone rig |
| 2 (**built**, `PhysicsArena3ptMode.ts`, `/play/arena?sport=threepoint`) | 3-Point Contest | Five racks of five (the fifth worth 2), sixty seconds from the first release, a pool of four Havok balls so the next shot leaves while the last is on the iron, the same release and sensor | From the racks (7.05–7.15 m): good release ≥ 50 %, bad ≤ 20 %; a whole contest runs headless (measured: 40/60 = 67 % vs 4/60 = 7 %; a perfect-timing contest 18 of 25, 22 points) |
| 3 (**built in the arena's 1v1**, `arena.dunks`) | Dunk and layup | A run at the ring with the ball (inside 2.1 m, faster than 2.5 m/s) is a dunk: the run carries through the gather, a higher jump (`arena.dunkJumpVy` 4.3), both hands reach toward the ring, and the hand jams the ball toward a point under the ring's centre — on the button's release, or by itself once the ball is over the ring; whether it goes through is the iron's call. A close shot is a layup on a 66° arc. The shipped Dunk contest is untouched (its judged show is the next step: §6 question a) | Jammed over the ring ≥ 5 of 7 approach angles; let go under the ring ≤ 2 of 7 (measured: 7/7 vs 0/7) |
| 4 | 3v3 | Six capsules on Havok (the owner's 2026-10-20 ask), passes as throws to chests, interceptions by contact | Six bodies + ball ≤ 3 ms physics a frame on the phone rig |
| 5 | Soccer (penalty, then the open-play pieces), tennis, volleyball, baseball and derby, football | A Havok ball with `SoccerBall`'s drag and Magnus as forces; goal frames and nets; rackets and bats as kinematic bodies; tackles as body contact | Per mode, in its own row when it starts |
| 6 | Online | The arena on the mirror: the host simulates, the guest draws | A two-device game, the guest's release delay measured |

---

### Bodies more physical than capsules (knob `arena.ragdollLimbs`, ships OFF; not built in slice 1)

The feel goal says dunks, blocks and collisions should look physical. Slice 1's bodies are upright capsules with the hoops clips
played over them. The next step toward that goal is **physics-driven limbs**: per athlete, a few Havok bodies (forearms and hands,
then the upper arms) driven toward the animation's pose by joint motors (an active ragdoll), so a hand that meets the ball, the iron
or another body is stopped by it and the arm gives. Plan: hands first (they are what touches the ball: blocks, pokes, the dunk's
contact with the ring), measured on the phone rig against the capsule-only arena; then arms; whole-body ragdoll only for falls.
Behind its own knob, **OFF** until measured and felt. Cost to watch: each limb is a body and a constraint the solver steps twice a
frame.

## 6. For the owner

1. **"POV-" — what was the rest of the message?** The lane built POV as a camera choice in the arena. If you meant POV for the
   shipped modes too, or a POV-only arena, or something else, say so.
2. **The arena records no session and pays nothing.** Should it count for XP and progress later (it would then need its own score
   rules on the server)?
3. **Design choices toward the physics-first feel** (the lane will not guess at the reference game's mechanics):
   a. **How do you control a jump and a dunk?** Today: hold to gather, let go to release (the timing is your body's rise or fall).
      Options: the same for a dunk (the hand pushes the ball through the ring when you let go near the iron), or a dunk on its own
      button, or the arms on the sticks (each stick moves an arm).
   b. **Limbs:** hands-only physics first (recommended), or arms too, or a full active ragdoll?
   c. **Fouls and falls:** when two physical bodies collide hard, should a body be knocked over (a ragdoll fall, a get-up), and does
      the game whistle it (today's 1v1 calls fouls by closing speed), or is everything play-on in the arena?
   d. **Players per side in the arena:** 1v1 now; 2v2 and 3v3 next (§5) — which first?
4. **Feel-check** the arena's 1v1 on your phone: the release timing (`arena.bodyCarry`), the bounce off the rim
   (`arena.rimBounce`), POV's field of view and aim help.

---

## 7. Measured (lane/physics-arena, 2026-11-23)

**Headless, the real Havok WASM** (`scripts/physics-arena-tests.ts`, a ci-suite; 21 checks, all green):

| What | Bar | Measured |
|---|---|---|
| Ball bounce: dropped from 1.80 m (its bottom), its top comes back to | 1.20–1.40 m (rule book) | 1.32 m |
| Same inputs, same world (ten shots, two fresh worlds) | bit for bit | bit for bit |
| 1v1 spots (2.5–7 m, corner to corner, 3 seeds × 20): good release (within 25 ms of the top of the jump) | ≥ 55 % | 48/60 = **80 %** |
| … bad release (100–160 ms early or late) | ≤ 25 % | 4/60 = **7 %** |
| The basket sensor read at 60 Hz against an independent label from the whole path | ≥ 98 % | **120/120** (and per step 120/120) |
| Tunnelling: 60 throws at the glass up to 30 m/s | 0 through | **0** |
| … 80 throws at the iron up to 25 m/s, deepest overlap | ≤ 3 cm | **0.2 cm** |
| … a 30 m/s slam into the floor; a 25 m/s ball at a body's chest | never in | lowest centre 0.120 m (= the radius); overlap 0.0 cm, and it came back off |
| The live mode's own loop, 3 minutes (rival vs a scripted player) | runs; check → live → scored; both score | yes; rival 16/31 |
| 3-point racks (7.05–7.15 m, 3 seeds × 20): good / bad | ≥ 50 % / ≤ 20 % | **40/60 = 67 %** / **4/60 = 7 %** |
| A whole 3-point contest headless (perfect timing) | finishes, some in, some out | 18 of 25, 22 points |
| Dunks, 7 approach angles: jammed over the ring / let go 0.2 s after the press | ≥ 5 / ≤ 2 | **7/7** / **0/7** |

Mutation checks: `arena.bodyCarry` 0 → good 100 % / bad 90 % (the timing check fails, as it must); a sensor loosened by 15 cm fails
its unit test.

**In the live page** (`scripts/probes/physics-arena/inmode.mjs`: the real harness, scripted releases through the probe seam, the
rival kept still, waits on the game's clock), 3 runs × 4 shots a side: good release **4/4, 2/4, 2/4 = 8/12**; bad release **0/4,
0/4, 0/4 = 0/12**. (The first browser run found the game timers on frame time while the physics is capped at 4 steps a frame: on a
slow frame the "top of the jump" release read 216–283 ms early. Fixed: everything runs on the physics clock. The runs above are after
the fix.)

**The phone rig** (`scripts/probes/hoops-gap/perf.mjs`: 390×844, DPR 3, 4× CPU throttle, SwiftShader, the same scripted stick and
button for both, 10 s of play; 3 runs each, interleaved):

| | First playable frame (load) | Frame p50 | Frame p95 | Update p50 (game + physics) | Draws |
|---|---|---|---|---|---|
| **Physics Arena 1v1** | 28.1 / 33.6 / 26.9 s | 19.5 / 18.0 / 19.5 ms | 43.7 / 41.1 / 44.5 ms | 2.9 / 3.0 / 3.0 ms | 73 |
| Shipped 1v1 (control) | 53.6 / 55.0 / 48.7 s | 40.9 / 42.3 / 43.4 ms | 115.1 / 85.6 / 101.6 ms | 3.1 / 3.3 / 3.2 ms | 87 |

Read it honestly: the arena's court is far lighter than the shipped 1v1's venue (no crowd, no venue models), so most of the frame and
load difference is the scene, not the physics. The like-for-like number is the update (the game's logic plus, in the arena, two Havok
steps a frame): **3.0 ms against 3.2 ms** — the physics costs no more than the shipped 1v1's own logic. The physics step's own time
cannot be read on this rig (its virtual clock stands still inside a frame); headless in node it is 0.05 ms a frame on average.
Not measured: a real phone.

**The look:** `arena-contact-sheet.jpg` (the lane's scratch folder): the court camera and POV, desktop and an upright phone, the 1v1
and the 3-point contest.
