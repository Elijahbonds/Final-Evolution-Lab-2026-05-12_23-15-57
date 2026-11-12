# Hoops — how it LOOKS, SOUNDS and RUNS, against the AAA bar (hoops-audit-show, 2026-11-12)

Owner, 2026-11-12: *"Audit and assess the gap, look for quality sinkers. Better basketball game than 2K."*

This is the **show** half of that audit: how the hoops modes look, sound and run, and the screens around them. How the game
PLAYS (controls, handling, shooting, defence, AI, contact, flow, animation in play) is the sister lane's (`hoops-audit-play`).
The bar is a modern AAA basketball game — the class the owner named — judged as a class of quality, never copied: no name, art,
mode or screen of anyone else's is proposed here.

**An audit, not a fix pass.** Nothing in the app changed. New: this file, the probe set in `scripts/probes/hoops-audit/show/`,
this lane's row in `docs/LANES.md`. Release measured: `fbf197fb` (lane/finish-release with #581 kit-glitch).

Modes: 1v1 (`onevone`), 3v3 (`threevthree`), 3-Point (`threepoint`), Flight Night (`dunk`), the dunk duel (`dunkduel`), the
carnival (its hoops event is Slam Rush, `carnival`) and the screens around them (start card, pause, results).

## 0. The verdict in one paragraph

Flight Night's court at golden hour is the closest thing here to the bar: the venue, the sky, the palms and the boardwalk read as a
place. Everywhere else the game is **well engineered and visibly cheap**. The three things a first-time player notices inside a
minute are not engine problems — they are **content and finishing**: (1) it **sounds synthetic** (every effect is a synthesiser
tone or filtered noise; the ball makes **no sound when it is dribbled**; the crowd is noise; the MC is a text-to-speech voice);
(2) the **people look like placeholders next to a AAA court** (no faces that move, no fingers, a 22-bone body, flat skin, black
cardboard cut-out spectators right behind the rim, a dunk crowd of five bodies cloned a hundred times); (3) the **screen is
crowded and collides with itself** (on a phone the MC's subtitle box covers the player; the shell's buttons sit on top of the
score in both top corners; control hints in pad and keyboard words sit on the court; a 16-line control sheet; a trivia card about
computers while a basketball game loads). The camera,
the replay director, the mix engineering and the HUD system are real foundations to build on. Overall: **about 4 / 10 against
the AAA bar** — strongest in venue and camera plumbing, weakest in audio, faces and the net.

## 1. How this was measured

- **[S] the player-eye rig** (`scripts/probes/hoops-audit/show/`). `build.mts` bundles the **real hoops screens** — `GameShell`
  around each mode's own Babylon host, exactly as `app/play/<mode>/_components/loader.tsx` mounts it — with the app's CSS and
  fonts (`scripts/a11y/rig.mts`), production React, on a bare page with no server (`host-entry.tsx` answers `/api/profile` and
  `/api/sessions/start` in the page). `show.mts` loads it in Chromium on SwiftShader, on a **virtual clock** (1/60 s of game per
  drawn frame), `Math.random` seeded (7), plays a scripted player through the real input bus, and records every frame: the camera
  (position, look, FOV), the hero's feet and head projected to the screen, every skinned body in or out of frame, the draw count, the
  cinematic flag (a replay or cut), the GL programs linked (by phase), every sound cue the game asked for, the bytes fetched, and
  JPG shots at full resolution (start card, tip-off, play every few seconds, a make, a replay, pause, results). `analyze.mjs` prints
  the numbers. `run.sh` runs a job under the shared gate with its own server. Two profiles: **desktop 1920×1080** (the 'desktop'
  tier — SwiftShader is not a discrete GPU, so a gaming PC's 'high' tier is not shown) and **phone landscape 844×390** (touch,
  DPR 2, the 'mobile' tier).
- **[P] the phone profile** (`scripts/probes/_perf-sweep.mts`, the repo's instrument, on the bare-mode bundle `site/mode.html`):
  844×390, DPR 3, mobile tier, 4× CPU throttle, virtual time: JS per frame, draws, meshes, bodies, texture MB, heap.
- **[C] code**, `file:line` at `fbf197fb`. **[D]** earlier measured docs, cited where used (`HOOPS-GOAL-GAP.md`,
  `VISUAL-PASS-PLAN.md`, `EVERY-SCREEN-*.md`, `config/mobileBudget.json`).
- **Limits, said plainly.** SwiftShader draws on the CPU, so frame *times* are not a phone's or a PC's; draw counts, compile counts,
  bytes, framing and camera motion are exact. The results card is the shell's real card fed a **sample** result (`window.__END`):
  a whole game cannot be played to its end on this box. The shared box ran 4 cores at load 12–19 during this audit and the browser
  gate was queued by six lanes, so the runs are short (see section 9 for what was not measured).

## 2. The scorecard

Scores are against the AAA class, 10 = that class at its best. "Now" is today's release on the rig and in the code.

| # | Dimension | Now | What a 10 looks like (plain words) | Evidence (details in section 3) |
|---|---|---|---|---|
| 1 | Camera | **5** | A camera you never notice: it glides with the play, leads where the ball is going, never jumps, keeps your player and the rim readable, and changes angle only on purpose — a lower shot on a dunk, a quick broadcast angle at dead balls, a choice of a high sideline view | Damped follow + look-ahead presets (`CameraDirector.ts:132,142`), FrameGuard, punch on makes; but a hard snap at every possession reset (`OneVOneMode.ts:1180,2052`; `ThreeVThreeMode.ts:970,1188`), no shot or dunk camera in 1v1/3v3 (`OneVOneMode.ts:3385`), one behind-the-player view; [S] phone: live snaps 1 / 0 (1v1 / 3v3), turn p99 139 / 69 °/s, hero in frame 100 %; skipping the intro = a 15 m swoop in 0.33 s then a 35° one-frame turn |
| 2 | Court and venue | **5** | A court that feels lived in: real people round the court who react, light that falls on the players, a floor that shows wear and catches light, every location as finished as the best one | Flight Night's Venice is good ([S] dunk shot); 1v1/3v3 have an 8-body rail and **black cardboard cut-out people right behind the rim** (`venice_crowd_cards.glb`, placed by `veniceBoardwalk.ts:507,561`); no crowd in 1v1/3v3 (`mountModeCrowd` only in 3PT/dunk/duel); a mirrored sign (`veniceBoardwalk.ts:191,196`) |
| 3 | Bodies and faces | **2** | Faces that look like people up close and move (eyes, mouth, effort), hands with fingers round the ball, skin with pores and sweat, hair with strands, kits that fold and stretch, shoes you could name, every opponent a different, finished person | A 22-bone body with no finger and no face joints and **no face shapes** on any body (glb read); the guest hero's kit body 42 k triangles, rivals 30–33 k with a 1024² skin and a 512² buzz-cut hair map; dark streaks on the hero's shirt and two bodies inside each other in the [S] 1v1 shot |
| 4 | Ball, rim and net | **3** | A net that swishes, snaps and tangles; a rim that shakes and rings; a ball with grain, spin you can see and a contact shadow | The hoop is **one mesh** — pole, board, rim and net — so the **net can never move** (`HoopJuice.ts:3-4`); on a make a glowing orange ring and a **12-sided wireframe cone** pop over it for 0.9 s (`HoopJuice.ts:5-13,44-60`); backspin exists (`BasketballCore.ts:1197-1203`) |
| 5 | HUD and readability | **4** | Everything you need in two glances and nothing else: a clean score bug with both sides' names and colours, the clock, a shot meter at the player, a player marker; nothing covers it; no instructions on the court | A shared TV-HUD system with tokens (`tv-hud/tokens.ts`); but the shell's buttons **cover the score** top-left and the chips top-right (every [S] shot, phone and desktop), on a phone **the MC's subtitle box covers the hero** (four of four phone play shots), control text on the court ("TAP THE STICK TO JAB · SQUARE (L) SHOOT · L2 (F) POST UP"), a keyboard letter on touch and pad ("J · <pass>", `three-v-three-babylon.tsx:158-162`), 12 px plates (EVERY-SCREEN-JOBS.md:212) |
| 6 | Moments and juice | **5** | Every big play gets its moment: the crowd erupts, the camera finds it, a short replay from a better angle, the scorer reacts; the end of a game is an event — a final-play replay, a box score, the player's best moments — then "play again" in one press | Replays exist and are well built (letterbox, depth of field, half speed; dunk's triple cut + orbit + poster); but 1v1/3v3 replay only posters, ankle-breakers, blocks, dunks and steals, every second possession at most, never the final basket (`hoopsMoments.ts:23-37`); no slow-mo on a 1v1/3v3 dunk (`OneVOneMode.ts:3385`); the results card's box score is one text line (`proofLine.ts:31-42`); Play again is first and focused (`end-screen.tsx:353,630`) |
| 7 | Audio | **2** | Recorded sound: the ball's thump on concrete and wood, the net's swish and the chain's rattle, rim clangs that differ, sneakers that squeak by the cut, a crowd that breathes, groans and erupts, two commentators who know the game, music that fits the court, a mix you never think about | **Every effect is synthesised** (`SoundKit.ts:1-8`): the swish is 0.22 s of filtered noise (`:328-341`), the crowd's cheer and groan are filtered brown noise (`:490-505`), the crowd bed is a noise loop (`:512-535`); **no dribble sound at all** (no cue on the ball's floor contact anywhere in `lib/babylon`); the MC and crowd voices are Kokoro text-to-speech at 24 kHz (`scripts/mic/build-mic.mts:7`); no music in 1v1/3v3/3-Point/carnival. The mix plumbing (buses, ducking, limiter, output presets) is good |
| 8 | Menus and flow round play | **4** | From the menu to tip-off in seconds, with a loading screen that builds the matchup (who you face, where, the stakes); pick the court, rival and difficulty on one clean card; a pause with resume, restart, settings and quit; nothing to read before you play | A start card with location, ball, opponent tier (`boot-splash.tsx:429-474,818`); but the loading card is trivia about computers ("Computers count in binary", `learn-while-you-wait.tsx` on `boot-splash.tsx:429`), the 1v1 offence sheet is one 16-line string (`onevoneRules.ts:96`) that names a rival product in its own copy ("RIGHT STICK (2K, …)"), the pause is the controls sheet only (`paused-layer.tsx:33`), Play → playing is 2 taps and **35 s** on the throttled phone (EVERY-SCREEN-JOBS.md:197) |
| 9 | Performance | **5** | A locked 60 on a recent phone (or an even 30 on an old one) with no hitch on the first dunk or replay, loading in a few seconds, small downloads | See 3.9: phone shaders pre-warmed (1 GL link in play, [S]); 1v1 and 3v3 fetch **19.5 / 20.6 MB** before READY against Flight Night's 4.6 MB ([S]); 3v3 on the phone tier drew a median **311** draws in play in the full page (row: 208) — see 3.9 for the instrument's own row; no anti-aliasing on a phone |
| 10 | Polish and consistency | **4** | Nothing glitches: no clipping, no flicker, no jagged edges, no shimmer, signs read the right way, every court as finished as the best | Bodies inside each other on the check ([S] 1v1), dark streaks on the hero's shirt, jagged palm fronds on desktop ([S] dunk), a mirrored "VENICE BEACH COURTS" sign seen from the court, the "FLIGHT NIGHT" billboard over a 1v1 game, a flat untextured blue block beside the dunk rim |

## 3. The evidence, dimension by dimension

Shots are named `<mode>-<profile>/<nn>-<what>.jpg` under the lane's scratch folder `hoops-audit-show/out/`; the worst are on the
contact sheet (section 8). "[S] phone" = 844×390 landscape, mobile tier; "[S] desktop" = 1920×1080, desktop tier.

### 3.1 Camera — 5

| [S] phone, live play after the intro | 1v1 | 3v3 | Flight Night |
|---|---|---|---|
| live camera snaps (> 0.5 m or > 10° in one frame) | 1 (an 11° turn after a 9-frame hold) | 0 | 6 — all the dunk's own cuts (runway reset, rim cut) |
| turn rate p50 / p99 (°/s) — phase 8 bar p99 ≤ 120 | 32 / 139 | 41 / 69 | 0 / 74 |
| hero whole (feet and head) in frame | 100 % | 100 % | 80 % (the rim camera leaves his feet below the frame in the flight, by design) |
| the intro's hand-over when the player presses | a 15 m swoop in 0.33 s (up to 1.35 m a frame), then a **35° one-frame turn** onto the play camera | the same: up to 1.46 m a frame, then the turn | — |

- **Good:** the follow is damped and leads the play (`CameraDirector.ts:132` hoops, `:142` team); the hero never left the frame in
  live play; the 3v3 'team' camera turned at a p99 of 69 °/s; replays have letterbox, depth of field and half speed
  (`scene/ReplayDirector.ts:253,319`); Flight Night has the triple cut, a fourth orbit angle and a poster (`core/DunkCuts.ts:21-35`).
- **Gap:** skipping the walk-in intro ends in a whip and a snap (above); every possession reset is a hard cut (`snapTo`:
  `OneVOneMode.ts:1180,2052,2421`, `ThreeVThreeMode.ts:970,1188`); a 1v1/3v3 dunk has no camera of its own, no hang slow-mo and no
  FOV gather ("No hang slowMo (1v1 has no hang latch), no FOV gather, no land settle", `OneVOneMode.ts:3385`; 3v3 `:3977`); a jump
  shot has no camera beat at all; there is one view (behind the player) and no high sideline option. The 1v1 p99 of 139 °/s is
  over phase 8's own bar (120).
- **A 10:** the same follow, plus a dead-ball broadcast angle instead of the snap, a low angle and a breath of slow motion on a
  dunk, a camera that eases (never whips) out of an intro, and a choice of view for players who want the court side-on.

### 3.2 Court and venue — 5

- **Flight Night is the benchmark here** ([S] `dunk-desktop/01-tipoff.jpg`): golden-hour sky, a painted Venice boardwalk row,
  palms, a 3D crowd either side of the rim's line, a judges' table — it reads as a place.
- **The half-court modes are empty and their backdrop is cardboard.** 1v1 and 3v3 share that venue but get only the boardwalk
  rail (`veniceBoardwalk.ts:242-249`: 9 spots, at most 8 bodies) and **twelve dark cut-out figures standing right behind the
  rim** — the boardwalk row's crowd strip, `venice_crowd_cards.glb` (`veniceBoardwalk.ts:507,561-562`; `venuePropSets.ts:103-108`)
  ([S] `onevone-desktop` shot: the cyclist, the dog walker, the skater, all flat and dark, framed by the backboard). The 3D crowd
  (A9.9, `visual/crowd/`) is mounted in 3-Point, the dunk and the duel only (`ThreePointMode.ts:1568`, `DunkMode.ts:1630`,
  `DunkDuelMode.ts:921`). The owner removed the baseline stands from basketball courts on 2026-09-05 (they read as a black bar
  behind the hoop, `venueSpecs.ts` basketball_h2h) — a stand is not proposed back; people round the court are.
- On a phone the dunk crowd is painted cards (by design: `mobileBudget.json` holds the phone to cards) and reads as rows of
  identical figures ([S] `dunk-phone/02-play-g6.0.jpg`).
- Lighting: a dusk progression across the game (`court/mount/hoopsDusk.ts`), lamp glow on desktop; the phone gets one 512 px
  shadow map, no cascades, no ambient occlusion (`QualityTier.ts:134`). The street court is not glossy, correctly
  (vis-hoops-court). Five court locations exist (`nexus/courtLocations.ts:46-80`); only Venice was shot (section 9).
- **A 10:** people all round the court who react to the play, light that falls on the players (rim lights on desktop), a floor
  with wear and scuffs that catch the low sun, and every location as finished as Flight Night's.

### 3.3 Bodies and faces — 2

| body | triangles | joints | face shapes | maps |
|---|---|---|---|---|
| the hero a guest gets (`candidates/fel-kit-male.glb`, the kit body) | 42,299 | 22 | 1 shape key (body) | 11 webp, 15 materials |
| the owner's scan (`elijah-meshy.glb`) | 97,219 | 22 | 0 | one 2048² |
| the forge rivals (`rivals/ace…umber.glb`, the 1v1 and 3v3 casts) | 30–33 k | 22 | 0 | skin 1024², hair 512² (a buzz cut), eyes 256², kit 256–512² |
| the crowd (`crowd/*.glb`) | — | 22 | 0 | one shared 1024² texture for all five |

- The 22-bone spec is the owner's (AGENT-OPERATING-RULES.md: "Keep the 22-bone spec"): it has **no finger joints and no face
  joints**, and no body here has face shapes, so no face can blink, look, grimace or shout, and no hand can wrap the ball.
- [S] `onevone-desktop` crop: the back of the hero's head is a flat skin-coloured shape; skin has no pores, sheen or shading
  detail; dark vertical streaks run down the shirt's back (shadow acne or the kit stripe — assumption: not traced; #581 fixed the
  stripes it found); the defender's head and arm are inside the hero's on the check (contact is the sister lane's).
- Rivals are all distinct people (the forge cast, `athleteRoster.ts:98-125`), which is good; they share one art pipeline that
  differs from the owner's scan.
- **A 10:** faces that hold up in a replay close-up and move (eyes, brows, mouth, effort), hands with fingers round the ball,
  skin with detail and sweat, hair with volume, kits that fold, shoes with detail, and every rival a finished individual.

### 3.4 Ball, rim and net — 3

- `public/models/meshy/hoop.glb`: **one mesh**, 97,233 triangles, pole + board + rim + net under one material
  (`HoopJuice.ts:3-4`). The net cannot move.
- On a make, `HoopJuice` shows two overlays for ~0.9 s: an emissive orange torus at the rim (`juice_rim`, alpha 0.7,
  lighting off) and a **12-sided wireframe cylinder** for a net (`juice_net`) that squashes and sways (`HoopJuice.ts:5-13,44-60`).
  The dunk's rim dips and springs (3.5 cm at 7 Hz) — on the overlay ring, not on the iron.
- 3-Point, the dunk and the duel add `RimFx` (a light ring, sparks, the net's glow); 1v1 and 3v3 do not (VISUAL-PASS-PLAN wave 2).
- The ball turns with backspin in flight (`BasketballCore.ts:1197-1203`, `visual/BallSpin`); it is `meshy/ball-basketball.glb`
  (274 KB) with six skins on the start card.
- **A 10:** a net that swishes, kicks up on a rim-in, wraps the ball, and yanks with the rim on a dunk; a rim and backboard that
  shiver; a ball with pebbled grain and seams and a contact shadow on every bounce.

### 3.5 HUD and readability — 4

- **The shell sits on the HUD.** [S] every hoops shot, phone and desktop: the "⋯" capture menu covers the player's score
  ("0 – 0" / "0 vs 0") top-left; pause / back / body / full-screen cover the mode's chips top-right ("TO 11", "90s", "NO PROP",
  "POWER", the "HYPE" label). Every-screen pass saw the same (EVERY-SCREEN-JOBS.md:212-215).
- **Words over the play on a phone.** The MC's subtitle box (two lines of 20-plus px capitals) sits over the bottom-centre of the
  frame — exactly where the hero stands in the behind-the-player camera — in [S] `onevone-phone/01,02`, `dunk-phone/01`,
  `threevthree-phone/02`. In 3v3 three layers of text stack there at once: the subtitle, the pass chip ("J · CHEST PASS") and the
  control hint ("TAP THE STICK … CIRCLE (K) SCREEN").
- **Device words.** The phone's hint and pause sheet use pad and keyboard words ("SQUARE (L)", "L2 (F)", "R2 (SHIFT)", "J ·");
  the dunk's hint on a phone is "X — NEXT PROP FAMILY · D-PAD picks inside: RIGHT oops, LEFT lobs, DOWN the rest, UP none".
- The score bug is two numbers and a dash at the 'stat' size (18 px on a phone, `tokens.ts:162`), no names or colours
  (`basketball-babylon.tsx:117-123`); chips are 12 px on a phone (`tokens.ts:154`).
- **Good:** one shared TV-HUD system (tokens, scorebug, meter, banner, lower third) on every hoops host; the shot meter has the
  green window and the perfect band (`hoops-shot-meter.tsx`); the 3D meter beside the shooter.
- **A 10:** a slim score bug with both sides' names and colours and the clock, a shot meter at the player, a player marker,
  nothing covering any of it, and no instructions on the court once the first possessions are played.

### 3.6 Moments and juice — 5

- Replays are well built but rare in the court modes: 1v1/3v3 replay only a poster, an ankle-breaker, a block, a dunk or a steal,
  at the next dead ball, at most every second possession and four a game, **never the final basket**
  (`court/hoopsMoments.ts:23-37`, `court/mount/hoopsBroadcast.ts:56-74`). None was triggered in the short [S] runs.
- Makes in 1v1/3v3: a camera punch (`OneVOneMode.ts:1348`), a crowd-cheer synth, the net overlay. No slow-mo, no dunk camera.
- The results card ([S] `*-phone/…-results.jpg`): a big GAME WON / score, Play again **first and focused** (197 × 59 px, the `A`
  hint on it) — one tap, as the owner asked (`end-screen.tsx:353,630`); but the hoops box score is one text line
  (`lib/proofLine.ts:31-42`; the card's highlight tiles have no hoops keys, `end-screen/highlights.ts:12-29`), no replay or
  picture of the game's best moment, and a "learn while you wait" trivia card beside it. (The rig's card says "NOT SAVED YET":
  there is no server in the rig; not a finding.)
- **A 10:** the crowd, the camera and the commentary all answer a big play; a short replay of the game-winner; an end screen with
  a box score and the best play behind it, then Play again in one press.

### 3.7 Audio — 2

What the game asked SoundKit to play in the [S] phone runs (the synthesised cues; voice clips are separate):

| run | game seconds | cues | by name |
|---|---|---|---|
| 1v1 | 11.6 | 18 | impact 7, squeak 5, uiTick 4, whoosh 2 |
| 3v3 | 7.2 | 8 | uiTick 4, squeak 2, impact 2 |
| Flight Night | 16.6 | 29 | uiTick 17, crowdGroan 6, whoosh 4, impact 2 |

- **No cue fires when the ball hits the floor.** The hero dribbled for the whole 1v1 and 3v3 runs; no cue in the log is a bounce,
  and no code plays one (`anim/Dribble.ts`, `anim/ballCarry.ts`, `core/BasketballCore.ts` contain no SoundKit call;
  `handleFx.ts:121` describes "the dribble's pound" that does not exist).
- A 3v3 **pass plays `uiTick`** — the menu click (`ThreeVThreeMode.ts:2262`).
- Every cue is synthesised (`SoundKit.ts:1-8`): swish = 0.22 s of band-passed white noise (`:328-341`), rim rattle = three
  triangle-wave pings (`:310-326`), squeak = noise through a Q-12 band-pass chirp (`:360-372`), cheer and groan = 1.4 s of band-passed
  brown noise (`:490-505`), the crowd bed = a looping brown-noise band with a 0.15 Hz swell (`:512-535`), the "ooh" = twelve
  sawtooth oscillators through two formant filters (`handleFx.ts:150-190`).
- Voices: an MC per court, a sidekick, six crowd voices and three hoopers, all **Kokoro text-to-speech** at 24 kHz
  (`scripts/mic/build-mic.mts:7`, `VoiceKit.ts`), 116 game lines per MC. The lines are colour, not play-by-play: in the [S] 1v1 run the MC
  said "Venice, say hello! …" at tip-off and "Seagull got your fries!" mid-possession.
- Music: none in 1v1, 3v3, 3-Point or the carnival; the dunk plays a walk-out song (`DunkMode.ts:27-31,954-964`).
- **Good:** the mix plumbing is console-class — voice, music, SFX and crowd buses, ducking under every voice, a glue compressor and a
  limiter, output presets for phone / TV / headphones (`SoundKit.ts:50-120`).
- **A 10:** recorded sound for everything the ball, the rim, the net, the shoes and the crowd do, by surface and by force; two
  commentators who call the play; music that fits the court; the same mix.

### 3.8 Menus and flow round play — 4

- Start card ([S] `*-desktop/00-start-card.jpg`): a flat gradient with the title, TAP TO START, PLAY WITH YOUR BODY, the controls
  sheet, LOCATION (five courts), BALL (six skins), OPPONENT (ROOKIE / PRO / ELITE). Clean, but no matchup (who you face, where,
  for what), no 3D, and the "⋯" menu over the MOTION chip.
- The **loading card** on every hoops splash is the knowledge feed ("LEARN WHILE YOU WAIT · TECH & AI · Computers count in
  binary", `boot-splash.tsx:18,429`); the results card carries another ("The Body's Control Panel", "The scientific method in one
  breath").
- The 1v1 controls sheet is one string of 16 bullets (`onevoneRules.ts:96`) and names a rival product in our own copy
  ("RIGHT STICK (2K, relative to the ball hand)"); the 3v3 sheet does not.
- The pause is "PAUSED — TAP TO RESUME" over the controls sheet (`paused-layer.tsx:33`): no Resume / Restart / Settings / Quit
  of its own (the shell's corner buttons do some of it).
- **Load:** wall seconds to READY on this box (software GL, load 12–19): 1v1 46 s, 3v3 44 s, Flight Night 26 s (not a phone's
  number); the every-screen rig's throttled phone: 2 taps and 35 s from Play to playing (EVERY-SCREEN-JOBS.md:197). Bytes fetched
  before READY (JS excluded — the rig's bundle is not production's): **1v1 19.5 MB, 3v3 20.6 MB, Flight Night 4.6 MB**. The
  largest 1v1/3v3 files are a parked sedan (2.8 MB, `meshy/sedan.glb`), the hero's kit body (2.2 MB), the physics engine (2.0 MB,
  1v1), two voice banks (1.3 + 0.9 MB) and the hoop (0.9 MB). Flight Night streams its dressing behind its intro (its own
  FIRST-DUNK work) — the court modes do not.
- **A 10:** tip-off within a few seconds of the tap, a loading screen that builds the matchup, one clean pre-game card, a real pause
  menu, nothing to read before playing.

<!-- PERF -->

### 3.10 Polish and consistency — 4

- The **"VENICE BEACH COURTS" gate sign reads mirrored** whenever the camera sees it from the court (every 1v1/3v3 intro, [S]
  `*-phone/01-tipoff.jpg`): it is one plane with `backFaceCulling = false` and the text on one side (`veniceBoardwalk.ts:188-196`).
- The **FLIGHT NIGHT billboard** stands over every 1v1 and 3v3 game ([S] shots): the half-court venue uses the dunk's boardwalk
  kit (rig log: `[NEXUS] basketball_h2h: "venice-dunk" kit on`), so the dunk's rooftop billboard goes up over the row
  (`veniceBoardwalk.ts:198-205`).
- **Jagged palm fronds** on desktop ([S] `dunk-desktop` crop): alpha-tested leaves with MSAA but no alpha-to-coverage.
- The phone has **no anti-aliasing at all** at DPR ≥ 1.5 (MSAA 1, FXAA off — [S] scene read `samples [1]`, `fxaa false`;
  `LightRig.ts:232-235`): the chain-link cage, the lines and the rim shimmer on a phone.
- Bodies inside each other on the check and streaks on the shirt (3.3); the judges' table is three plain boxes with nobody behind
  it (`JudgesTable.ts:56-67`).
- **A 10:** none of the above visible in an hour of play.


## 4. The quality sinkers — what a first-time player sees or hears inside 60 seconds

Ranked by severity × reach. **Reach**: the modes it is in and how often it is in front of the player. **Size**: S (a day or
less), M (a few days), L (a lane or more). **Needs**: *owner* (a look or product call), *art* (new models, textures, sound or
animation that cannot be written in code), *GATE 0* (the rig), or *code* (none of those).

| Rank | Sinker | Evidence | Reach | Severity | Likely cause | Size | Needs |
|---|---|---|---|---|---|---|---|
| 1 | **It sounds synthetic, and the ball is silent when dribbled.** Every effect is a synthesiser tone or filtered noise; the most-heard sound in basketball — the ball on the floor — is not there | SFX log [S] (table 3.7): no floor-contact cue in any mode; `SoundKit.ts:1-8` ("entirely SYNTHESIZED … zero external assets"); swish `:328-341`, crowd `:490-505`; `handleFx.ts:121` refers to "the dribble's pound", which no code plays | every mode, every second of play | High | No recorded sound library; no cue on the dribble's floor contact (`anim/Dribble.ts`, `anim/ballCarry.ts`, `BasketballCore.ts` call no sound) | M (a sample player in SoundKit + the cue) + the sounds | **art** (a recorded or licensed CC0 foley set: ball on concrete/wood, rim, chain and nylon net, sneakers, crowd); the cue itself is code |
| 2 | **Words on the court — on a phone they cover the player.** The MC's subtitle box (two lines of yellow capitals) sits bottom-centre, where the hero stands; in 3v3 the subtitle, the pass chip ("J · CHEST PASS", a keyboard letter on touch) and a control hint ("TAP THE STICK … CIRCLE (K) SCREEN") stack on top of each other there | [S] phone: the hero hidden behind the subtitle in 4 of 4 play shots (1v1 ×2, Flight Night, 3v3); desktop 1v1 and dunk shots; `basketball-babylon.tsx:151-155,165`; `three-v-three-babylon.tsx:158-162`; phase 9's own gate is "0 static control text on the court" (PLAN-HOOPS-1V1-3V3-10PHASE.md) | every mode, most of the game; worst on a phone | High | Captions on whenever the MC talks (`mic-caption.tsx`); the hint line every possession | S | **owner** (captions off by default when the voice is on — an accessibility setting stays) |
| 3 | **The shell's buttons sit on top of the score.** Top-left the "⋯" capture menu covers the player's score; top-right pause / back / body / full-screen cover the mode's chips (POWER, HYPE, TO 11) | [S] crops: dunk desktop top-left and top-right, 1v1 desktop; EVERY-SCREEN-JOBS.md:215 ("the menu owns the stage's corner in every mode") | every hoops mode, the whole game, phone and desktop | High | `components/games/game-shell.tsx` corner chrome over `HudFrame`'s top bezel (`tv-hud/hud-frame.tsx`), each host's bezel at `top-0 px-4 py-3` (`basketball-babylon.tsx:117`) | S | **owner** (where the capture menu lives: recommendation — into the pause, and HudFrame keeps a safe inset under the shell's buttons) |
| 4 | **Black cardboard people stand right behind the rim** in 1v1 and 3v3 (and at Venice in 3-Point): twelve flat dark figures — a cyclist, a dog walker, a skater — in the frame of every shot | [S] 1v1 desktop crop (behind the hoop, every possession); the cards file `public/models/props/venice/env2/venice_crowd_cards.glb` (12 `crowd_card_*` nodes) | 1v1, 3v3, Venice 3-Point; every shot at the rim | High | The boardwalk row's crowd strip (`veniceBoardwalk.ts:507,561-562`; `venuePropSets.ts:103-108` `crowdAt`), drawn dark against the lit stalls | S (hide the strip on the half-court modes) / M (the baked 3D crowd, A9.9, in its place) | code (the 3D crowd exists: `visual/crowd/`) |
| 5 | **The net never moves; a glowing ring and a wireframe cone pop over the hoop on a make** | `HoopJuice.ts:3-13` (the Meshy hoop is ONE mesh: pole, board, rim and net) and `:44-60` (a 12-sided wireframe cylinder `juice_net` and an emissive torus `juice_rim`, alpha 0.7, shown ~0.9 s); [S] make shots | every make, every mode on `hoop.glb` (1v1, 3v3, 3-Point, dunk, duel, carnival) | High | One-mesh hoop asset; the "net" is an overlay | M | **art** (a hoop with the net as its own skinned or vertex-animated mesh) + code (the swish / rattle / dunk response, ball contact) |
| 6 | **Faces and hands are placeholder-grade next to the court** — faces never move, no fingers round the ball, flat skin, buzz-cut hair maps | glb read: every body 22 joints, **0 face shapes**; hero scan 97 k triangles on one 2048² map; rivals 30–33 k triangles, skin 1024², hair 512² (`public/models/rivals/*.glb`); [S] 1v1 crop (flat back of head, plastic skin) | every mode; worst in the walk-in intro, replays, celebrations and the dunk's poster | High | The 22-bone spec (AGENT-OPERATING-RULES.md: "Keep the 22-bone spec"), scan/MakeHuman assets without face rigs | L | **GATE 0 + owner** (extend the spec with finger and face joints or face shapes — a rig decision) + **art** |
| 7 | **The 1v1 / 3v3 court is empty and the crowd is noise.** An 8-body rail on the boardwalk (no stands — owner call), no 3D crowd; the cheer and groan are 1.4 s of filtered brown noise; the "ooh" is twelve sawtooth oscillators | `veniceBoardwalk.ts:242-249`; `mountModeCrowd` only in `ThreePointMode.ts:1568`, `DunkMode.ts:1630`, `DunkDuelMode.ts:921`; `SoundKit.ts:490-505`; `handleFx.ts:150-190` | 1v1, 3v3; constant | Med-High | The crowd roll-out (w3-crowds) skipped the two court modes; synthesised crowd | M | code (mount the baked crowd round the court, off the camera line) + **art** (a recorded crowd bed and reactions) |
| 8 | **35 seconds to play, and the loading card is about computers** | EVERY-SCREEN-JOBS.md:197 (2 taps, 35 s on the throttled phone); [S] start card; 1v1 and 3v3 fetch 19.5 / 20.6 MB of models, voice banks and engine files before READY against Flight Night's 4.6 MB (3.8); `boot-splash.tsx:18,429` (`LearnWhileYouWait`, "TECH & AI · Computers count in binary") | every launch of every hoops mode | Med-High | Everything loads before READY (voices, the dressing's bus and sedan, six rivals); the knowledge feed card on the hoops splash | M | **owner** (the knowledge card on game splashes was a product decision: recommendation — a matchup card on hoops splashes) |
| 9 | **The camera jumps at every dead ball and has no dunk shot in 1v1 / 3v3** | `snapTo` at possession resets (`OneVOneMode.ts:1180,2052,2421`; `ThreeVThreeMode.ts:970,1188`); "No hang slowMo … no FOV gather" (`OneVOneMode.ts:3385`, `ThreeVThreeMode.ts:3977`); [S] camera table 3.1 | 1v1, 3v3; every made basket | Med | Resets teleport the bodies and the camera cuts to them | S–M | code (a broadcast dead-ball angle or a quick dip between possessions; a dunk angle like Flight Night's) — feel: camera numbers are pinned, new behaviour only |
| 10 | **A crowd of clones at Flight Night** — about a hundred fans from five bodies sharing one texture, the same hoodie side by side, nobody raises an arm | [S] dunk tip-off crop; `crowdBake.ts:3,31` (five bodies, one texture); VISUAL-PASS-PLAN w3-crowds ("the bodies' arms are skinned to the TORSO … no fan can raise an arm") | dunk, dunk duel, 3-Point; constant | Med | Five crowd bodies; arms skinned to the torso | M | **art** (more crowd bodies, a re-skin for arms) + code (tint and outfit variation per instance) |
| 11 | **The end of a game is not an event** — no replay of the winning basket (replays never play the final moment), the box score is one text line, no highlights | `hoopsMoments.ts:23-37` (`final` excluded), `proofLine.ts:31-42`, `end-screen/highlights.ts:12-29` (no hoops keys); [S] results shot | every game end, 1v1 / 3v3 | Med | Replays only at dead balls inside the game; the shared end card | M | code + **owner** (whether the final basket replays before the card) |
| 12 | **Polish slips**: two bodies inside each other on the check, dark streaks on the hero's shirt, a mirrored "VENICE BEACH COURTS" sign from the court side, the FLIGHT NIGHT billboard over a 1v1 game, jagged palm fronds, the judges' table three plain boxes with nobody at it | [S] crops; `veniceBoardwalk.ts:188-196` (one-sided sign plane with `backFaceCulling = false`), `:198-208` (the billboard); `JudgesTable.ts:56-67` | intermittent, all Venice modes | Low-Med | Contact separation (play lane), shadow / kit seams, single-sided signage, alpha-tested foliage without alpha-to-coverage | S each | code; the body overlap is the sister lane's |
| 13 | **The 1v1 controls sheet is a 16-line wall and names a rival product** ("RIGHT STICK (2K, relative to the ball hand)") | [S] start card and pause; `onevoneRules.ts:96` | 1v1 start card and pause | Low-Med | One string with every control | S | **owner** (copy: recommendation — drop the product name, split into a first-play card of five lines and a full list behind "More") |


## 5. The fix plan, in phases

The existing presentation phases of `docs/PLAN-HOOPS-1V1-3V3-10PHASE.md` (8 camera and court, 9 HUD and menus, 10 phone budget)
take most of the code work; three new phases take what needs new sound, a new hoop and the rig. **Owner items are marked ⚑**;
everything else is reversible code a lane can do and flag. Feel numbers that are tuned today (camera distances, heights, FOV,
lags; timing windows) stay as they are: every item below is new behaviour behind a switch whose off value is today's.

### First three moves (recommended)

1. **Clear the screen** (phase 9a, S, code + three ⚑ one-tap calls). The shell's buttons off the score; the MC's subtitles off by
   default while the voice is on (an accessibility setting keeps them); the hint line only in the first possessions; the 3v3 pass
   chip in the device's own button name; the cut-out people behind the rim hidden on the half-court modes; the mirrored sign and the
   FLIGHT NIGHT billboard fixed on 1v1/3v3. Every frame of every hoops mode gets cleaner in about a day.
2. **The sound of the court, part one** (phase 11a, M, needs sounds). A sample player in SoundKit beside the synths, a recorded
   foley set (ball on concrete and on wood, nylon and chain nets, rim hits, sneaker squeaks), and **the dribble's floor contact as a
   cue**. This is the single biggest "feels cheap" fix: it is heard every second.
3. **The net** (phase 12a, M, needs a small art job). The hoop with its net as its own mesh, a vertex-animated net that swishes,
   jumps on a rim-in and yanks on a dunk; the wireframe cone and the glowing ring go.

### Mapped onto the existing phases

| Phase | Adds (sinker #) | Gate (measured by this lane's rig unless said) | ⚑ |
|---|---|---|---|
| **8 — Broadcast camera and a live court** (existing) | the dead-ball cut: a short broadcast angle or dip instead of the snap at every reset (9); a dunk angle and a brief hang slow-mo in 1v1/3v3 like Flight Night's (9); the baked 3D crowd round the 1v1/3v3 court, off the camera line, reacting to the momentum bus (7); the cut-out cards gone from the half-court modes (4); the final basket replayed before the results card (11) | `show.mts`: live camera snaps outside cuts 0 and turn p99 ≤ 120 °/s (today: 3.1), the intro's hand-over eased (no one-frame turn), hero whole in frame 100 %, all six 3v3 bodies in frame ≥ 90 %; a replay on the final basket; the crowd visible in the tip-off shot | ⚑ the final-basket replay (it delays the card ~2.5 s) |
| **9 — Premium HUD and menus** (existing) | 9a "clear the screen" (2, 3, 13 and the 3v3 J chip); a matchup loading card (who, where, the tier) in place of the trivia card on hoops splashes (8); a pause with Resume / Restart / Settings / Quit beside the controls; the controls sheet as five first-play lines with "All controls" behind it; a results card with a real box score (FG, 3PT, steals, blocks, assists — the modes already send them) and the best play's replay as its backdrop (11) | `show.mts` results and pause shots at 844×390 and 1920×1080; no element over the scorebug (an overlap check on the HUD's own boxes); 0 control text on the court after the first two possessions | ⚑ the capture menu's home; ⚑ captions default; ⚑ the knowledge card on game splashes; ⚑ copy (the 1v1 sheet's product name) |
| **10 — Phone budget, re-measure, reel** (existing) | READY sooner: voice banks, the venue's parked cars and bus, and far props streamed after READY (8); desktop shader pre-warm, or a first-dunk / first-replay compile check on desktop (3.9); alpha-to-coverage or MSAA on alpha-tested foliage on desktop (12); this file's tables as the baseline | `_perf-sweep.mts` rows inside `mobileBudget.json`; GL links during play ≤ 3 on the phone and on desktop; bytes before READY (3.8) halved for 1v1/3v3; wall to READY on the every-screen rig ≤ 20 s | — |

### New phases

| Phase | What | Size | Needs |
|---|---|---|---|
| **11 — The sound of the court** | 11a the sample player, the foley set and the dribble cue (1); 11b sound by surface (concrete, wood, the rooftop's rubber), rim hits by speed, the chain net on the streetball courts, sneaker squeaks by the cut's strength (they exist as synths — `handleFx.ts`, `OneVOneMode.ts:2440`); 11c a recorded crowd bed and reactions (murmur, rising "ooh", eruption, groan) driven by the momentum bus that already exists (7); 11d music: a court bed under menus and dead balls in 1v1/3v3/3-Point (none today), ducked by the mix that already exists; 11e the MC: a second booth voice and fewer, better-timed lines (today one TTS voice on a PA) | L | ⚑ the sound set (buy, license CC0, or record); ⚑ music source; ⚑ voices (the voiceover lane's TTS or recorded people) |
| **12 — The hoop and the ball** | 12a the net as its own mesh with cloth-like motion (5); 12b the rim shake from the dunk's spring on every hoop (it exists for the dunk: `HoopJuice` rim dip) and the backboard shiver; 12c a ball with a grain normal map, seams and a soft contact shadow at every bounce; 12d a chain-net option for the streetball courts | M | art (the hoop re-export; a ball texture) |
| **13 — People up close** | 13a ⚑ GATE 0: extend the 22-bone spec with finger joints and face joints or face shapes (eyes, brows, jaw) — every clip, test and planting is built on 22 today; 13b faces that blink, look and show effort; hands that wrap the ball (6); 13c skin, hair and kit materials at a close-up's resolution on desktop (the phone keeps today's caps); 13d crowd variety: more bodies, arms that cheer (today five bodies, arms skinned to the torso) (10) | L | ⚑ GATE 0 (the rig), art (faces, hands, hair, crowd bodies), animation |


## 6. Owner items, with the recommendation first

| ⚑ | The call | Recommendation | Why it is the owner's |
|---|---|---|---|
| 1 | Where the shell's "⋯" capture menu lives during play | Move it into the pause; keep the corner buttons out of the HUD's top bezel (a safe inset in `HudFrame`) | It is on every game screen of the app, not only hoops (EVERY-SCREEN-JOBS.md:215 called it "a gameplay-lane or owner call") |
| 2 | The MC's subtitles during play | Off by default while the voice is on; on when the voice is off, in reduced motion, or by a setting | Accessibility default |
| 3 | The knowledge card on game splashes and results | On hoops: a matchup card (rival, court, tier, the stakes) while loading; the knowledge card stays elsewhere | The knowledge feed on every loading screen was a product decision (KNOWLEDGE-FEED v1) |
| 4 | The product name in the 1v1 controls sheet | Drop it ("RIGHT STICK, relative to the ball hand") | Player-facing copy |
| 5 | The sound set and music | License or buy a recorded foley set (CC0 where it exists); a court music bed from the owner's own music or a licensed library | Money / licensing |
| 6 | The final basket replayed before the results card | Yes, ≤ 2.5 s, skippable | It changes the end of every game's pace |
| 7 | GATE 0: finger and face joints (or face shapes) on the 22-bone spec | Plan it as its own lane after phases 11 and 12 land; faces are the slowest, largest item | The rig is the owner's rule |

## 7. How to re-run

```
# build the site (the real hoops screens + the bare mode bundle), through the CPU wrapper
/home/user/wt/cpu-run.sh npx tsx scripts/probes/hoops-audit/show/build.mts <site>
# one job inside the browser gate, with its own static server (port 3356), e.g. three modes on the phone profile
scripts/probes/hoops-audit/show/run.sh <site> 3356 1800 show MODES=onevone,dunk,threevthree PROFILE=phone SECONDS=24 \
  WALL_CAP_S=300 OUT=<out>
# the phone budget row (the repo's own instrument)
scripts/probes/hoops-audit/show/run.sh <site> 3356 1800 perf MODES=onevone,threevthree PROFILES=landscape SECONDS=6 RASTER=4 \
  SEED=7 OUT=<perf>
node scripts/probes/hoops-audit/show/analyze.mjs <out>      # the numbers in sections 3.1, 3.7, 3.8
scripts/probes/hoops-audit/show/sheet.sh <out.jpg> 3 620 "<shot>[@WxH+X+Y]|<caption>" ...
```

The rig plays on a virtual clock (one game frame per drawn frame), so a slow box plays the same game seconds, only slower: on this
shared 4-core box the phone profile ran ~1.5 game seconds a minute and the desktop profile (4096 cascaded shadows, SSAO, MSAA on
software GL) far less. `LOCATION=rooftop` (or blossom, orbit, canopy) shoots another court.

