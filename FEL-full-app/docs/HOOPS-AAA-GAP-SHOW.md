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
crowded and collides with itself** (the shell's buttons sit on top of the score in both top corners, the MC's subtitles and a
control hint sit on the court, a 16-line control sheet, a trivia card about computers while a basketball game loads). The camera,
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

<!-- MEASURED -->
