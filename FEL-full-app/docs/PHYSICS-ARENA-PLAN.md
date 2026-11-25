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
| 4 (**built**, `PhysicsArena3v3Mode.ts`, `/play/arena?sport=threes`) | 3v3 | Six capsules on Havok, the human plays home player 1; passes are throws to a (led) chest, so a body in the lane intercepts by being there; the ball changes hands after a make; first to 21. The AI: the handler drives to his elbow (round a body in his path), shoots open or passes to the open man (the human first when he calls for it, Y), shoots contested rather than stall; off the ball the offence spaces to the arc; each defender guards his man, jumps at a shot after his reaction time, and reaches only for his own man's exposed dribble | Six bodies + ball ≤ 3 ms physics a frame on the phone rig (not measured yet); headless three minutes: passes caught, both teams score |
| 4b (**built, OFF**: `arena.physicsHands` 0) | Physics hands | Two kinematic hand bodies a player, moved to where the hands are by what the body is doing (`arena/handTargets.ts`); a block or a poke is a contact. Owner 2026-11-24: hands first, OFF until measured; then arms | Phone frame cost against hands off; blocks happen by contact (headless: yes) |
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

**3v3 and physics hands** (2026-11-24, the same phone rig, the arena's 3v3, hands off / on alternating, 2 runs each):

| `arena.physicsHands` | First playable frame | Frame p50 | Frame p95 | Update p50 / p95 (game + physics) | Draws |
|---|---|---|---|---|---|
| 0 (OFF, shipped) | 52.4 / 53.4 s | 30.5 / 30.1 ms | 59.8 / 57.4 ms | 3.5 / 3.5 ms; p95 9.3 / 9.9 ms | 137 |
| 1 (twelve hand bodies) | 48.0 / 46.8 s | 31.2 / 30.8 ms | 53.1 / 67.2 ms | 4.1 / 4.0 ms; p95 11.8 / 10.9 ms | 137 |

The hands cost about **0.5–0.6 ms a frame** of update on this rig (node, headless: 0.14 → 0.20 ms a frame of physics); the frame p50
moves by under 1 ms and the p95 runs overlap. Headless with the hands on, blocks happen by contact (2 in three minutes of 3v3).
Hands stay OFF until the owner feels them (owner 2026-11-24). Not measured on a real phone.

**The look:** `arena-contact-sheet.jpg` (the lane's scratch folder): the court camera and POV, desktop and an upright phone, the 1v1
and the 3-point contest.

**Knockdowns and fouls** (2026-11-24, `arena.knockdowns` / `arena.fouls`, both **OFF**; headless, section K):

| What | Knobs off | Knobs on |
|---|---|---|
| A sprint with the ball into a set (still) rival: the contact Havok reports | 5.99 m/s, a push | 5.99 m/s: he goes down, **CHARGE**, his ball at the check |
| The same at a jog | — | 4.39 m/s: a push, no call (the foul-grade gate) |
| 1v1, three minutes (the scripted player against the rival) | 24 contacts, 0 calls | 28 contacts (hardest 7.5 m/s), 0 knockdowns, 6 calls: 4 loose-ball, 1 charge, 1 blocking; the game ran to 7–11 and restarted |
| 3v3, three minutes | 198 contacts, 0 calls | 205 contacts (hardest 9.6 m/s), 3 knockdowns, 4 calls (2 loose-ball, 2 blocking); 3–9 |

Two fixes came out of the first run with the knobs on, both bringing the arena's calls into line with the shipped hoops. (1) The
ruling called any defence body running into any offence body, and the 3v3 stuck at 1–0 on 43 blocking fouls. The charge and the
blocking foul now need the handler in the hit. (2) The calls skipped the shipped gate (`classifyContact` 'foul': 5.25 m/s closing on
the floor, 4.2 on a shooter in the air), so a jog into a body was whistled. The knockdown now reads the speed of the body running in,
not the two bodies' closing speed: two jogs meeting head-on close at 8.8 m/s, and on that reading the 3v3 put a body down every four
seconds. No new physics bodies, so the phone cost is the contact read only (not measured on the rig: there is no frame-time question
to ask of it). The capsule stays upright when a body is down; only the clips fall. **Both stay OFF** for the owner's feel check:
how often the game stops for a whistle is a feel call, not a number the lane should pick.

**The look pass** (2026-11-24, `docs/LOOK-PASS-AUDIT.md` finding 12, routed to this lane: "a court in a void"; the audit's bar, §4).

- **(d) The phone budget row: done.** `lib/babylon/config/mobileBudget.json` had no arena row; it now has `physics_arena`,
  `physics_arena_3v3` and `physics_arena_3pt` (the sweep's profile through the esbuild static page, `scripts/probes/physics-arena/perf-round.sh`,
  3 rounds, portrait and landscape, the worst of each, the set off as shipped): 1v1 95 draws / 31 meshes / 6 bodies / 54 MB (budget
  114 / 38 / 8 / 65), 3v3 179 / 52 / 10 / 92 MB (215 / 63 / 12 / 111), the contest 161 / 58 / 5 / 44 MB (194 / 70 / 6 / 53).
- **(c) The sport tabs: fixed, ON.** "3-Point" wrapped to two lines on an upright phone and, with the contest's score, ran into it.
  Measured on a replica of the top row in the app's own font (`scripts/probes/physics-arena/tabs-fit.mjs`; the control reproduces the
  audit's wrap): before, every tab 48 px tall (wrapped) and the row over the score at 390 px and over the back chip at 360 px; after
  (no wrap, "3PT" and 10 px padding under 640 px), every tab 44 px, the row clear of both at 360, 390 and 844 px.
- **(a) The set: built, OFF (`arena.setV1`).** The shipped streetball cage (posts, rail, lamp poles, benches; the wire and the graffiti
  walls on desktop) round the arena court and a matte apron to the horizon; the contest gets the apron only (a post stood in the
  shooter's view from the corner rack). The pictures (3 runs a side, the same seed and moment, `?perf=off`) read as a place where the
  court used to stand in the sky, but it turns the arena's own lab-court look into the 3v3's streetball yard: an art-direction call,
  the owner's. It also misses the cost bar: against the control's spread (tennis p95 36.6–45.8 ms, load 16.4–18.7 s) the 1v1's p95
  stays inside (31.7–45.1 → 37.4–44.1 ms) but its load grows about 16 % (13.9–15.0 → 16.3–17.6 s), and the 3v3's p95 moves out of the
  noise (46.5–63.3 → 55.5–74.6 ms). Draws +9 / +5 / +1, no new textures.
- **(b) The loading card:** waits for lane look-screens' shared place card (phase A); the arena's line is ready to take it.

## 8. XP and progress: the proposed score rules (2026-11-24, a design for the owner; no server code written)

The owner (2026-11-24): the arena counts for XP and progress, through server-side score rules (plausibility caps, no
client-trusted totals), following the existing session / XP pattern; **no schema change without asking first**. The coordinator:
report the design before any code that touches a server route.

**How sessions and XP are scored today** (read, not changed):

- `POST /api/sessions/start` starts a run on the server (`SessionRun`: `startedAt`, an expiry, and whether it pays, decided there
  from signals the client cannot turn on: `?agent=1`, a playtest flag, the test-account list; a mode with no rules row starts
  unpaid, `NO_RULES`).
- `POST /api/sessions { runId, mode, score, opponentScore, won, stats, tallies }` finishes it once. The duration is the server's
  (now − `startedAt`). `lib/sessions/modeScoreRules.ts` `checkRunScore` holds the client's `score` against the mode's row
  (`maxScore`, `maxScorePerSecond`, `minDurationMs`, `maxDurationMs`); anything outside is refused (`SCORE_INVALID`), never
  clamped. The hoops rows are `'rules'` rows: the exact maximum from the game's own rules (`lib/arena-score-integrity.ts`
  `firstToCeiling`: first to 11, a bucket of at most 3 → 13). A head-to-head win is judged on the board
  (`session-payout.ts` `judgeHeadToHead`), not on the client's word.
- The payout is `sessionXp` (1.5 × score, +50 on a win, +10 otherwise), profile shards, 15 LC on a win, season XP, a mastery
  sample, the PRQ attributes of the mode (`lib/prq.ts` `MODE_ATTRS`), the streak, all inside the daily economy caps, each grant a
  ledger row keyed by the run.
- So today the score itself is the client's number, bounded. The arena can do better: its games are simple enough that the server
  can rebuild the total from the plays.

**Proposed** (each a reversible code change except where marked):

1. **Three session keys of their own:** `arenaHoops` (1v1 to 11), `arenaThrees` (3v3 to 21), `arenaThreePoint` (the 25-ball
   contest). Recommended over posting as `hoops1v1` / `hoops3v3` / `threePoint`: the staked Arena's rival draw and the cold-start
   median read a mode's past scores, and physics games on another scale should not mix into them. They go in `MODE_INFO` as
   **unlisted** catalogue keys (the Play chip stays the way in; no venue grid, first-game pick or stake offers them).
2. **The client sends the plays, the server computes the totals.** The finish carries `stats.arena`: the game's basket log
   `[{ t, side, pts, fromM }]` (`t` the physics clock, `side` me / foe or home / away, `pts`, the shot's distance) and the shot count;
   for the contest `[{ t, rack, ball, pts }]`. A new pure `lib/sessions/arenaScore.ts` rebuilds `score` and `opponentScore` from it
   and refuses the run (`SCORE_INVALID`, with the rule it broke) when any play is impossible by the game's own rules:
   - a bucket is 1, or 2 only from past the arc (`fromM` > 6.75 m) and inside the court;
   - the game ends where it ends: the winner's total reaches the target (11 / 21) on the last bucket and not before; the loser
     is under it;
   - two buckets are at least the game's own cycle apart on its clock (the scored pause 1.4 s + the check pass + a shot's flight:
     about 2.5 s, from the mode's constants, mirrored with a drift test like `STORY_MIRRORED`);
   - the log's clock is no longer than the server's duration of the run (+ a small slack), and the shots outnumber the makes;
   - the contest: at most 25 balls, a rack's fifth ball is the 2-pointer, the last make inside the 60 s clock;
   - the `score` the client sends must equal the rebuilt one (a mismatch is refused, not corrected).
   The rebuilt totals then go through the existing `checkRunScore` with `'rules'` rows: `arenaHoops` max **12** (10 + a 2),
   `arenaThrees` **22**, `arenaThreePoint` **30**, and the pace / length floors derived from the same constants.
3. **The win is judged on the rebuilt board** (`SERVER_JUDGED_WIN_MODES` gains the two games).
4. **The payout is the existing one**, unchanged: at most 1.5 × 12 + 50 = 68 XP for a won 1v1, 83 for a won 3v3, inside the daily
   caps. PRQ attributes as the shipped mode of each sport; a mastery sample as the shipped hoops metrics.
5. **The arena posts a game when it ends:** today a game simply starts again at 11. The page would start a run when a game starts
   (`/api/sessions/start`) and finish it at the final, the way `GameShell` does; signed-out play stays unpaid practice; an agent
   or playtest run stays unpaid as everywhere.
6. **No schema change.** The log rides in the request body; the run's stored answer (`SessionRun.result`, an existing JSON column)
   can keep the rebuilt totals and the log's length for audit. Storing the whole log anywhere else would be a schema change, so
   it is not proposed.

**What it does not stop, said plainly:** the log is still written by the client. A forger can post a log that obeys every rule (an
11–0 at a believable pace); the rules make that the most it can ever be paid (68 XP, then the daily caps), never more. The stronger
answer is to replay the game on the server: the arena is deterministic (a fixed step, seeded; section B is bit for bit), so the
client could send its inputs and the server re-run the Havok game in node. It costs a few seconds of server CPU per finish and a
Havok load in the function; proposed as a later step, not now.

**Questions for the owner** (the lane's recommendation first):

- a. Own keys `arenaHoops` / `arenaThrees` / `arenaThreePoint` (recommended), or count as the shipped 1v1 / 3v3 / 3-point?
- b. Totals rebuilt from the play log (recommended now), or the server replay first?
- c. The full payout (XP, shards, 15 LC on a win), or XP and progress only (no LC) while the arena is new?
- d. Knockdowns and fouls change nothing in the score rules (a foul is the ball at the check; an and-one is the basket only). Agreed?

**Built** (2026-11-24, after the owner's answers, `docs/OWNER-DECISIONS.md`): own keys (a), the totals rebuilt from the play log (b),
XP and progress only with no LC, coins or shards (c). `lib/sessions/arenaScore.ts` (the rules), its rows as derived bounds in
`modeScoreRules.ts` (12 / 22 / 30), one hook in `app/api/sessions/route.ts` (the rebuild before the rules check; the rebuilt board
decides the win; the XP-only payout), the keys known to `session-payout.isCatalogueMode`, PRQ rows as the shipped mode of each
sport, the games handing each finished game to the page (`ctx.card` with its log), and the page posting it (`lib/babylon/arena/arenaRun.ts`,
the shell's own finish outbox). Behind `arena.xpOn` (server switch `ARENA_XP_ON`), **ON**: tested end to end against a throwaway
Postgres (`lib/sessions/arenaScore.integration.test.ts`, the real routes and Prisma): a legit 11–4 win paid 67 XP (1.5 × 11 + 50)
and 0 LC, 0 coins, 0 shards, the streak untouched; five forged logs refused (`arena_score_mismatch`, `arena_too_fast`,
`arena_clock`, `arena_log_missing`, `arena_after_final`) with nothing paid; the contest paid its rebuilt points; an agent run was
unpaid. Control: the repo's own `sessionRuns.integration.test.ts` on the same database pays LC and coins for a normal mode. Headless,
every finished game the real modes hand the page rebuilds on the server to the score the game showed. Not tested: the page's two calls
in a real browser against a running server (they are unit-tested against the route's body).

## 9. Soccer (owner 2026-11-24: "The next sport after 3v3: SOCCER") — the design, slice 1

Today: `/play/soccer` serves the penalty; the ball already flies on `core/SoccerBall.ts` (drag, Magnus curl, bounce: analytic) and
`core/FirstTouch.ts` / `core/PassShoot.ts` (touch and strike rules) are built and in no live mode. The arena's soccer puts the same
ball on Havok and makes the play physical: the ball is only ever moved by contact and forces.

**Slice 1: arena soccer 1v1** (`PhysicsArenaSoccerMode.ts`, `physics_arena_soccer`, `/play/arena?sport=soccer`), the arena's own
switch `arena.soccer` (0 = no soccer tab; the shipped soccer is untouched).
- `assumption:` 1v1 on a small caged pitch (about 26 × 16 m, the arena's own place: no venue copied) with a small goal at each end
  (3 × 2 m), no keepers (the mouth is small), first to 5, a kick-off from the centre after each goal. 3v3 with keepers is slice 2.
- **The ball:** a Havok sphere with a size-5 ball's numbers (0.43 kg, 0.11 m), its drag and Magnus applied every step as forces
  from `SoccerBall`'s own shipped coefficients (read, never changed), rolling resistance on the ground, spin bleeding off. Posts and
  crossbars are Havok capsules, the net a drag volume and walls (the hoop's pattern), the boards round the pitch static boxes (a
  cage game: the ball stays in play off the boards).
- **The dribble is touches:** within reach and in front, a touch pushes the ball ahead of the run (the hoops dribble's rule: the
  push leads the body by the run's own speed); a hard cut or a body in the way and the ball runs loose. A defender who reaches a
  loose or exposed ball first touches it away. Bodies are the arena's capsules (shoulder to shoulder; the knockdowns and fouls
  knobs apply, OFF).
- **Hold and release (owner: "Yes"):** hold the kick button to wind up (power over about 0.8 s), let go to strike toward the aim
  (the stick, or the view in POV); a ball too far off the foot at the release loses power and direction in proportion (the strike's
  timing, the body-carry idea of the jump shot). The stick's sideways push at the release curls it (Magnus). A short tap is a pass.
- **The goal:** the ball wholly over the line between the posts and under the bar, read on the swept path every physics step (the
  hoop sensor's pattern), against an independent label in the headless test.
- **POV** as in the hoops (the camera button). **XP:** a later step, under the same rules as the hoops (a `arenaSoccer` key and its
  rebuilt-from-the-log rule), not in slice 1.
- **The bar (headless, real Havok):** a struck ball curls with side spin and not without; a clean strike from 12 m beats a mistimed
  one into the goal clearly; posts and bar stop 30 m/s shots (no tunnelling); the goal sensor agrees with the path label; three
  minutes of the live mode run, both sides score. Then the phone rig against the arena's 1v1 row.

**Built and measured (2026-11-24): slice 1 ships ON (`arena.soccer` 1).** Headless on the real Havok WASM (`physics-arena-tests` S):
side spin +45 / −45 rad/s bends a 25 m/s strike 0.70 m right / left over 13 m and no spin 0.000 m; drag takes a 30 m/s strike to
21 m/s over 20 m; a ball rolled at 6 m/s stops after 5.4 m; 40 shots at 30 m/s at the posts and the bar: 0.0 cm deepest overlap,
none through; the goal sensor agrees with the resting-place label on 80/80 (33 goals); in the live mode 12 m strikes at the corners
score 14/14 clean against 7/14 struck 0.55 m off the foot's sweet spot (the bar is the gap: 50 points, ≥ 40); three minutes of the live
1v1 run, both sides score. Phone tier (3 rounds, the esbuild page, against the control and the arena's 1v1): soccer p95 30.6–40.8 ms
against the 1v1's 31.6–47.2 and tennis's 39.3–47.6; load 12.5–13.2 s against the 1v1's 13.9–16.9; its `mobileBudget.json` row 78 draws /
35 meshes / 6 bodies / 50 MB (budget 94 / 42 / 8 / 60). Not done yet: XP (built since: `arenaSoccer`, plan §8), keepers and 3v3 (slice 2, below), the pitch's
surroundings (the dark floor ends a few metres past the boards: slice 2's `arena.soccerApron`, below).

Questions for the owner (recommendation first): (a) 1v1 first, then 3v3 with keepers — or straight to 3v3? (b) keepers as AI bodies
with hands (the physics hands) or no keepers in small goals? (c) the boards keep the ball in play (a cage game) — or out-of-play lines
and throw-ins?

**Slice 2: 3v3 with keepers** (`PhysicsArenaSoccer3v3Mode.ts`, `physics_arena_soccer_3v3`; the Soccer tab plays it with
`arena.soccer3v3` 1, **shipped OFF**), on slice 1's ball, pitch, goals, touches, tackle and strike, unchanged.
- **The keepers:** a body (85 kg) and two gloved physics hands (`ArenaHands`, 13 cm, at most 4 m/s; the basketball hands keep their
  7 cm and 12 m/s). He stands 0.7 m off his line on the line from the ball to his goal's centre; a shot at his goal is read after the
  tier's reaction (`SOCCER_RIVAL`: 420 / 220 / 120 ms) with the tier's misread (its scatter × 1.5, across); his gloves go for where it
  will cross, within 0.9 m of his chest and, τ s after the reaction, within ½·a·τ² (a = 10 m/s²) of where they rested: a dive
  accelerates. A **save is the contact**: the ball goes where the glove sends it. A ball at his gloves under 7.5 m/s (relative) is
  held, then thrown out after 1.2 s to the most open team-mate; a slow loose ball in his area (3 m) with nobody nearer, he comes out for.
- **Passing:** A (J) is a pass (hold for pace) to the team-mate the stick points at, the most open with the stick at rest, led to his
  run. Y (I) calls for the ball; L1 (Q) switches player; the control moves by itself to the team-mate nearest the ball when your side
  loses it.
- **The AI** (both sides off one tier profile): the carrier runs at goal (along the boards when the ball is on them); he passes when
  pressed (only through a clear lane: no opponent within 0.9 m of its line, an open man further forward preferred), clears it lofted
  upfield when pressed in his own half with no lane, and shoots in range at a corner he has a line to (no outfielder within 0.5 m of
  it) with the hardest strike that still crosses under the bar. He sets himself (a soft touch) before he winds up, the wind-up being a
  plant for everyone; under pressure in range he shoots first time. Defenders press the ball (the nearest, goal-side) and mark the
  rest goal-side; they jockey and go in on a heavy touch (the ball 0.55 m out from the carrier's foot) or near their goal. A ball dead
  4 s (pinned in a corner) is dropped back into play 1.5 m inside the boards.
- **Measured (headless, real Havok, `physics-arena-tests` S):** the same 20 strikes from 12 m (power 0.7, inside the posts) score 20/20
  with the keeper stood aside and 10/20 with him in goal — the corners 8/10, half a metre off the centre 2/10 — 13 credited saves, every
  save a glove. Three minutes of AI against AI: 1–2 (shots 5 / 8, on target 3 / 3), 28 of 70 passes reached a team-mate, 1 / 1 saves, 72 tackles, no ball dropped back into play, the ball 80 / 90 s in each attacking half. Over nine minutes and three other seeds the match scores about 0.7 goals a
  minute (1–3 in three minutes), so a game to 5 between level sides runs about 7 minutes; `finding:` that is futsal's rate, slow for an
  arcade game; the owner's feel test decides (options: first to 3, a lower keeper tier than the outfield's, a bigger goal).
- **Phone tier** (3 rounds, the esbuild page, `perf-soccer.sh`): the 3v3 is the arena's heaviest mode: p95 48.9–58.5 ms upright (47.0–58.8 sideways) against the arena hoops 3v3's 33.4–38.4 and the control's (tennis) 25.0–35.2 in the same rounds; load 12.8–15.7 s (the hoops 3v3 16.4–17.1); 201 draws against the hoops 3v3's 124 (eight bodies to six, 40 shadow draws to 30), 108 MB of textures. Its `mobileBudget.json` row: 234 draws / 69 meshes / 12 bodies / 108 MB (budget 281 / 83 / 15 / 130). `finding:` before it ships ON it wants the bodies' draws down (the hoops 3v3 spends about 14 a body, the soccer 3v3 about 22) and one of the eight bodies' shadows off on the phone.
- **The floor past the boards** (`arena.soccerApron`, 1v1 and 3v3): built and **shipped OFF**. Pictures, the same seed and moment, upright and sideways, OFF / ON (`set-look.mjs` with `FEEL_KEY=arena.soccerApron`): sideways it fills the void (the pitch no longer floats over a purple ground disc and the sky), but upright and sideways alike it lays a dark slab over the low sunset up to a hard horizon line: the pitch reads as standing in a dark room, a palette call for the owner. A fogged apron would not soften the edge (the golden hour's haze is EXP2 0.0034: a quarter of the way to the fog colour 160 m out). Cost: +1 draw, +1 mesh; p95 and load inside the control's noise.
- Not done: its XP (its own key and a rebuild from its goal log, the 1v1's pattern; a later step), the loading card.
