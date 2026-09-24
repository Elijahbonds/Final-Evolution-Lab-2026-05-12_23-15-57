# Movement play: the pass plan (2026-09-24)

Owner: *"what about gesturing inputs and gameplay, like beatsaber x nintendo wii … like all the games able to be played with
movement."*

Owner decisions (five AskUserQuestion rounds, 2026-09-23/24):
- **Input:** the device camera, full body, through the MediaPipe pose pipeline already in the app.
- **Realism:** real athlete motion. A real jump makes the jump; you swing through to dunk; punches are real punches; your real shot form shoots. No shortcut gestures.
- **First modes:** the dunk contest, hoops shooting (3PT, 1v1, 3v3), combat, and boards and racing.
- **Cues:** drills and warm-ups get timed Beat Saber-style targets. The games stay free play, read from the body.
- **Form read after each attempt,** in the language of the owner's book (*The Art of Dunking*: penultimate, arm swing timing, knee drive, jump height). It feeds PRQ.
- **Space:** a living room with about 2 m of floor, jumping in place. Approaches become steps or running in place. A space check comes before play.
- **Dunk timing:** the body's own. The slam is graded by the arm's strike against the top of the player's own jump, so camera lag cancels out. The game plays the dunk back after the landing, and NOW! is hidden for body players.
- **Safety:** flips, handsprings and cartwheels stay pad-only. A spin starts with a real quarter-turn and the game finishes it. The space check warns about ceiling and clearance.
- **PRQ:** the measured jump height feeds PRQ power as a camera estimate, never the verified shield. Every form read is saved to history.
- **Tuning:** the owner's own moves are recorded (landmark numbers only, no video, kept on the Mac) to tune the detectors.
- **Switching it on:** each mode's READY screen offers "Play with your body" (it runs the space check), remembered per mode. The header Body button becomes a shortcut to it.
- **Body and pad together:** the body drives the motion; a pad or touch still does menus and the moves the body can't do safely or readably.
- **Self-view:** a small mirrored corner self-view in body mode, local only. Drills draw their targets over it.
- **Devices:** both a laptop/webcam with a TV and a propped phone or tablet. The full pose model where the device can afford it, the lite one elsewhere.
- **The form read's voice:** a new original Coach, pre-rendered like the MC, one cue at a time.
- **Two players:** one body at a time. Dunk Duel hands the camera over.
- **Warm-up:** offered after the space check, skippable, and always on Train → Drills.
- **Model files:** the MediaPipe model and wasm are served from our own hosting.
- **Privacy:** the camera feed never leaves the browser.

The map (every file:line behind this plan): `~/Claude/outbox/finish-release/movementplay/MAP.md`.

## Baseline: what the Body button does today

It maps gestures to buttons through one table for every mode (`lib/input/poseControl.ts`), and in the first modes that plays against the player:

| Mode | A real movement | What the game gets |
|---|---|---|
| Dunk | the dip, then standing up, then the jump | the run, then a launch while the feet are still down, then A in the air = a slam **pressed too early**. **Every body dunk misses.** |
| Hoops | a real jump / a shot dip / a set point | pass / turbo / X released at the set point (and in 3PT, whichever of A/B/X came first fires against a random bar) |
| Combat | a jump / a punch / a duck | a jab / R1 (jump, chi burst or substitution) / Matrix Focus |
| Boards and racing | standing still | full back-stick: the skater brakes forever, the plane climbs forever, the free runner sprints at the camera |

**Also broken:**
- Calibration is one frame, with no floor line and no stillness check.
- The landmarker leaks on every toggle.
- Full-bleed mounts two cameras.
- Nothing reads MediaPipe's metric world landmarks.
- A body-only run that scores 0 is recorded as NO PLAY.
- There is no body-driven pause or start.

## The phases

Each phase ships only when green: tsc clean, the full vitest suite with its count, and the live frames or recordings checked. Each is committed and pushed on `lane/finish-release`, with one deploy at the end.

| # | Theme | What changes | Gate |
|---|---|---|---|
| 1 | Instrument + baseline | **Landmark tooling:**<br>• one 33-landmark table and `PoseFrame` type (`lib/pose/`);<br>• synthetic landmark streams from the owner's DeepMotion captures and the game's own clips (a virtual webcam, noise, fps, visibility and latency models, plus ground truth: toe-off, landing, apex, strike);<br>• the owner's local recorder (`/dev/pose-record`, numbers only).<br>**The baseline:** today's mapper replayed against the streams; this plan. | Today's misfires reproduced in numbers from the streams. |
| 2 | The body core | **`PoseService`:** one camera owner; `requestVideoFrameCallback` capture timestamps; world landmarks kept; `dispose()`; lite or full model by device; model and wasm self-hosted.<br>**`BodyReader`** (pure, tested on the streams): a One Euro filter, then `BodyRead` (per-frame state) and `BodyEvent`s:<br>• takeoff / land with one or two feet and the height;<br>• step / cadence, the penultimate, arm swing and knee drive;<br>• strike, release, lost / found. | Against the streams' ground truth: take-off within ±1 frame, height within ±5 cm, no false jumps from running in place. |
| 3 | The seam | **`InputBus`:** `src:'body'`, `publishBody` / `onBody`.<br>**`ModeDefinition`:** `body` claims plus `onBody`; `ctx.body?()`.<br>**Per-mode body profiles** replace the global table as the floor (verbs, not letters), and fix the neutral-stick, jump-forward and pad-clobbers-trigger bugs.<br>**Session behaviour:** the body pauses the game when it is lost; both hands up = START; body input counts as play. | Every mode that has a profile gets no misfires from standing still, a jump or a dip. |
| 4 | Space check + calibration | **The shared READY surface** (`BodyPlayProvider` + `SpaceCheck` in BootSplash) checks:<br>• the whole body and floor in frame;<br>• jump headroom (arms overhead);<br>• distance / fill, ~2 m side to side, light, and pose rate ≥ 24 Hz;<br>• a stillness calibration with a floor line.<br>It also shows the ceiling and clearance warning, a live self-view thumbnail, and camera and pose on the privacy page. | The check passes and fails where it should on the streams and on the owner's recording. |
| 5 | Dunk by body | **Running in place** sets the approach speed. **The penultimate** and the **arm swing** drive the gather. **The real take-off**, on one foot or two, sets the height, charge and apex.<br>**Trick shapes** (from the arm and leg path): windmill, tomahawk, double clutch, hide & seek, scorpion, the tap, eastbay, between the legs, spins by quarter-turn.<br>**The slam** is the strike against the apex, played back through a `BodyDrive` (the rival's `aiFeed` template); NOW! is hidden.<br>**Poses:** hang, celebrations, skip, go again. Dunk Duel gets the same. | A synthetic windmill dunk and a real recorded jump each produce a made, named, timed dunk. |
| 6 | Hoops by body | **3PT:** bend to the rack, dip, set point, jump, and the release graded against the apex.<br>**1v1 / 3v3** through a `BodyControlSource` (`ControlSource`):<br>• the drive = running in place; handles = low hand swaps;<br>• jumpers, one-foot layups, dunks;<br>• defense: slide, contest, block, steal.<br>The ball hand is whichever wrist releases. | Shots graded on the body's clock; no turbo from a dip, no pass from a jump. |
| 7 | Combat by body | **Real strikes:** straight, hook and uppercut read from the fist's path; kicks; the guard (a raise = parry); slip / duck; step.<br>**Timing:** strikes commit on the motion's onset, with body windows widened for latency (`src:'body'`).<br>Readable for the rival's AI. | A recorded jab / cross / hook lands as a jab / cross / hook inside the string windows. |
| 8 | Boards + racing by body | **Stance calibration** (open 3/4), then:<br>• lean = carve; crouch = tuck; a hop = the ollie / pop; a hand to the edge = the grab; the shoulders' yaw = the spin (assisted).<br>• The kart wheel from the two wrists; aero wings from the arms.<br>• Free Run, Sprint and Big Air run-up from running-in-place cadence. | The skater, the plane and the kart hold still at rest and follow a lean, a hop, a turn. |
| 9 | Drills + warm-ups | **The cue lane** gets body targets (`HudCue` zones plus limb).<br>**`DancePerformance`** gets move kinds, plus a camera-latency offset.<br>**`/play/drills`** on Train runs:<br>• the Playbook's ch. 5 wake-up;<br>• ch. 6 jumping and landing;<br>• ch. 7 SAQ;<br>• approach-rhythm drills.<br>`ScreenRunner` handles pause and resume. | A drill scored on the owner's recording and on the streams. |
| 10 | Form reads → PRQ | **`formRead`:**<br>• the dunk and layups in the book's four reads;<br>• shots: release vs apex, set point, elbow, follow-through;<br>• combat: guard return, hips into the punch;<br>• boards: the absorb.<br>**Surfaces:** `HudFormRead`, the end card's FORM block, `GameResult.form`.<br>**PRQ:** `/api/sessions` writes the measured jump as PRQ power (a camera estimate), and every read goes to history. | Unread lines stay "unread", never 0; PRQ moves only from measured jumps. |
| 11 | The score loop | Re-measure everything against the baseline; the summary; ONE deploy. | Every number against the baseline. |

## What the game still infers

The floor is too small for these, so the game fills them in:
- the J approach and the runway distance, and landing the plant on the line;
- the lob's flight and the catch; clearing props (from jump height);
- the grip, release, flush and net;
- cradle vs windmill and behind-the-back vs its fake (these can't be told apart from the front);
- the 720, double eastbay and three-trick chains;
- the rest of a spin after the real quarter-turn;
- everything past the body on boards: the board, the wave, the rail.
