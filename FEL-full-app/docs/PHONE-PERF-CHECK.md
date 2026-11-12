# The 5-minute phone perf check

Owner, 2026-11-12: "a real-phone perf readout the owner can open on the live site." Our test machine draws with a software
GPU, so it cannot tell us a phone's frame rate. Your phone can. This page is what to do, and what to send back.

## One-time setup

The readout uses the same switch as the feel panel. If the **FEEL** tab already shows for you in a game, skip this: the
**PERF** tab is right below it.

Otherwise, follow "Turning it on" in `docs/FEEL-PANEL.md` (two server settings, then a deploy):
`FEEL_PANEL_ENABLED=1` and `FEEL_PANEL_USERS=<your user id>`. An account with the `admin` role also sees it.

Nobody else ever sees the PERF tab. It never opens by itself. It changes nothing in the game and sends nothing anywhere:
it only shows numbers on your screen and copies them when you tap **Copy report**.

## The check (about 5 minutes)

Use your everyday phone, signed in, on Wi-Fi, with battery saver **off**. Close other apps first.

1. **1v1.** Open `https://go.finalevolutiongroup.com/play/onevone?playtest=1`. Tap the small **PERF** tab on the left
   edge (just below **FEEL**). A dark box opens at the top right; **Move** sends it to the bottom if it covers the score.
   Start the game and play normally for about **one minute**. Then tap **Copy report** and paste it into your message.
2. **3v3.** Open `https://go.finalevolutiongroup.com/play/threevthree?playtest=1`. The box stays open. Play about one
   minute, then **Copy report** and paste.
3. **Dunk.** Open `https://go.finalevolutiongroup.com/play/dunk?playtest=1`. Play about one minute, then **Copy report**
   and paste.
4. **WebGPU try (1v1 again).** Back in 1v1, tap **Reload: WebGPU** in the box. The game reloads. Read the line that
   starts with `engine`:
   - `engine WebGPU (WebGPU running (trial))`: play one minute, **Copy report**, paste. Tell us if anything looked wrong
     (see "What WebGPU does not draw yet" below).
   - `engine WebGL2 (WebGPU asked, but ...)`: your phone's browser cannot run it. Paste that report anyway: it says why.
   Tap **Reload: WebGL** to go back. WebGPU is never on unless you ask for it like this, and it is only honoured for you.

**Send back:** the four reports, your phone's model and its iOS or Android version, and one line on whether the phone got
warm or the game felt slow anywhere.

## What the box shows

| Line | What it means |
|---|---|
| `onevone · playing` | the game and what it is doing (loading, ready, countdown, playing, paused) |
| `engine WebGL2` | which graphics engine is running, and why, if it is not the normal one |
| `fps 59.6 · frame p50 16.7 p95 18.4 ms` | frames per second now; the typical frame time and the slow-end frame time over the last ~5 seconds of this phase. 60 fps = 16.7 ms; 30 fps = 33.3 ms |
| `worst 41 ms · stalls>1s 2 · cpu p50 4.1 p95 7.9 ms` | the slowest single frame (a visible stutter is over ~50 ms); freezes longer than a second (shown only when there were any); the phone's JavaScript work per frame |
| `draws 212 (max 240) · meshes 180/640` | draw calls (how many separate things the graphics chip is asked to draw each frame) and meshes drawn / meshes in the scene |
| `textures 74 · ≈96 MB · heap 82 MB` | images loaded on the graphics chip and an estimate of their memory; the JavaScript memory (Android only — iPhones do not report it: `n/a`) |
| `READY 3.4 s (mode) · 9.1 s (page)` | how long until the READY card, from the game starting to load and from the page opening. Your budget (2026-10-20): **playable in 8 s** on a mid-range phone. The report says when it is over |
| `mobile · dpr 3 · 780x1688 · cap 60 L0` | quality tier, screen density, the drawing size, and the perf guard's frame cap and step-down level (0 = full quality) |

"(page)" is only meaningful when you opened the link fresh; after moving between games inside the app it counts
from when the app was first opened.

## The anonymous stats (already running)

Decided 2026-10-20 ("anonymous perf stats: fps + load time per mode to game_diag"), built by the perf-lag lane on
2026-10-24 (`lib/babylon/core/perfStats.ts`). Every player's game sends, per game played: the time to READY and to first play
once, and the frame rate twice at most (the first 30 seconds of play and 90–120 seconds in). Each carries the mode and the
device class only (iPhone / Android / other, WebGL version, tier, screen density, drawing size, GPU class). The server stores
these rows with no user, no guest id and no session key (`lib/analyticsAnon.ts`, `app/api/analytics/route.ts`). The PERF box
above is separate: it sends nothing.

## The WebGPU trial

`?engine=webgpu` asks for Babylon's WebGPU engine instead of WebGL. It is honoured only for you (the same gate as the feel
panel) and only where the phone's browser offers WebGPU; anything else runs WebGL exactly as before. Under WebGPU we never
load Babylon's shader translator from its CDN (that would be a third-party script on the page), so a shader written only in
the older GLSL language is not drawn under WebGPU.

What the test machine found is recorded below (`scripts/probes/device-perf/readout-run.mts`).

### What WebGPU does not draw yet

(filled in from the rig run)
