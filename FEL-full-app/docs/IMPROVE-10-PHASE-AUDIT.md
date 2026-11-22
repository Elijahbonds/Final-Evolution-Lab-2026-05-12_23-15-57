# The 10-phase improvement pass: the measured audit and the plan (lane/improve-audit, 2026-11-22)

**Owner, 2026-11-22 (verbatim):** "Do a 10 phase pass improving the areas that need it most. Audit and assess what needs to be
improved by need."

This file is the audit and the plan only. Nothing in the app was changed by this lane; other lanes build the phases. Every claim
below has a number, a picture, or both, and says where it came from. Base: `lane/finish-release` = `main` = `48a7b244` (the
measurements ran on `ee65f1eb`; the four PRs merged since, #682–#685, touch none of the screens measured here except the 1v1 / 3v3
hint lines, which no finding depends on). Those four are not re-proposed.

---

## 0. The answer in one paragraph

Nothing crashed: **0 page errors and 0 failed requests on 24 screens, phone and desktop, over 50 page loads**, and every Venice court
round-trips (4 of 4). What hurts players most is not bugs but **the phone and the wait**. On a phone held upright, **every game's
stage is sized for a one-row header while the header wraps to two or three rows, so the bottom of the game is off the screen: 129 px
in 1v1 and 3v3 (the move stick is cut in half), 20 px in Dunk and 3-Point**. The **hoops modes take 2.5–3.5× as long to load as a
light 3D mode on the same rig** (1v1 53 s, 3v3 73 s, 3-Point 67–71 s against tennis 21 s on the phone tier), and almost all of it is
before the shader pre-warm even starts (1v1 42 s, 3v3 63 s, tennis 11 s). A **first-time visitor waits 41 s after the birth date for
the guest dunk**. The **story (Adventure Chapter 1) makes no sound in play** (0 sound starts in 8 s, two runs, against 3–10 in every
other place) and **its world is flat untextured blocks**; **the Coast zone plays the stadium crowd** instead of the sea. The hoops
gameplay items the last audit left open (the 3v3 drive-by steal, the mid-spin shot, the "ghost" shot after a make, the 3v3 camera,
the Canopy Court rim on an upright phone, the 3v3 online offence) are each scoped as a phase or a part of one.

---

## 1. How it was measured

**The rig.** The real app: a production `next build` served by `next start` on a local throwaway Postgres (the every-screen rig,
`scripts/every-screen/rig.mts`, with this lane's own port 3871, database 55521 and build folder), signed in through the real sign-up
and sign-in routes (five rig accounts: so sign-up and sign-in work end to end on a local build). Chromium 1243 from `/opt/pw-browsers`,
3D drawn by **SwiftShader** (the GPU emulated on the CPU). Run inside the gate lock; one build, deleted after; disk stayed at 11–13 GB.
The machine was otherwise idle during every run (no other lane was running), so the numbers are cleaner than the earlier audits'.

**Two tiers.** Phone: 390 × 844, touch, DPR 3, CPU slowed 4× over CDP (a 3–4-year-old phone, the repo's rule). Desktop: 1440 × 900,
mouse and keyboard, no throttle.

**The instruments (in the repo, `scripts/probes/improve-audit/`).**
- `walk.mts` — per screen and tier: page errors, console errors, failed requests; TTFB, FCP, LCP, CLS; for a game the time to its
  READY screen, the start tap, the time to live play, then 4 s of warm-up read apart (first-use shader compiles) and an 8 s window
  of live play with the stick / WASD and a button pressed: every frame interval, the long-animation-frame entries, each press's event
  timing, and every sound started (a hook on `AudioScheduledSourceNode.start` and `<audio>.play`, plus which ambient bed's filter was
  built: SoundKit's bed filters are named by their centre, 900 stadium, 500 ocean, 1400 wind); the screen as read by the every-screen
  scorer's own collector (`scripts/every-screen/inpage.ts`: words before scrolling, tap targets under 44 px, unfinished marks, links
  that go nowhere, ways on) and its static accessibility scan (`scripts/a11y/inpage.ts`); the share of the screen the 3D canvas gets;
  the game's own `[FEL-PERF]` load lines; a JPG at rest and in play.
- `firstvisit.mts` — a first-time guest on the phone tier: home → PLAY NOW → `/try`'s birth date → the guest dunk, every tap counted.
- `table.mjs` (the table in §2) and `sheet.mjs` (contact sheets).
- Re-used as they are: `scripts/probes/venice-hub/walkthrough.mts` (the four Venice courts, out and back, on the same build),
  `scripts/probes/online-play/match-room.mts` (the online netcode against a local netd, today's and the pre-party one production runs).

**Runs.** Phone: three samples of 1v1, 3v3, Dunk and tennis; two of 3-Point, Venice, Coast and the Adventure; one of every page.
Desktop: one of everything. Medians are shown with the range.

**Controls, and what the rig can and cannot say.**
- *A known-good 3D control:* `/play/tennis`, which passes all four every-screen checks. Every game number is read against it.
- *The renderer:* an empty WebGL page on the same browser holds 60 fps (16.7 ms p50 and p95) at both sizes, so the slowness in games
  is the games' own draw load on a software GPU, not a broken browser.
- **The rig cannot give a phone's frame rate.** Every 3D place drew 1–5 fps here, the control included (tennis 2.3 fps on the phone
  tier). Those numbers are kept only as a comparison with the control. The owner's phone, with the PERF readout
  (`lib/babylon/core/perfReadout.ts`), is the judge of frame rate; HOOPS-PLAY-AUDIT §5.4's CPU-side number (the 1v1 / 3v3 update,
  3–5 ms a frame on the phone tier) stands.
- *Load times are real on the rig, but long.* SwiftShader overstates a phone (it compiles shaders on the CPU), so the absolute
  seconds are an upper bound. The ratios to the control repeat within 5 % across three samples, and those are what the phases move.
- *The probe's own mistake, caught by the control pictures:* in the first phone run, tapping the middle of the Dunk and 3-Point start
  screens hit their **Play with friends** button and opened the Party Room, so those two runs read a menu at 60 fps. They are set aside
  (not in the table); the probe now taps **TAP TO START**. This is not a product bug: a person taps the button.

---

## 2. The measurements

### 2.1 Every screen, both tiers

"Ready" is the game's READY screen (a hub or the story: the first moment you can move). "fps in play (rig)" is SwiftShader's, a
comparison only (§1). "Sounds" counts sound starts in the 8 s play window. "Bed" is the ambient bed that was built. "Canvas share" is
the part of the screen the game's 3D canvas covers (1 = all of it).

| Screen | Tier | n | Errors (page / console / failed req) | FCP s | LCP s | CLS | Ready s | fps in play (rig) | Sounds in 8 s of play | Bed | Taps < 44 px | Words before scrolling | Ways on (links) | Canvas share |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| / | phone | 1 | 0/0/0 | 1 | 1 | 0 | – | – | – | – | 0 | 39 | 4 | – |
| / | desktop | 1 | 0/0/0 | 1 | 1 | 0 | – | – | – | – | 0 | 39 | 4 | – |
| /try | phone | 1 | 0/0/0 | 0.3 | 0.3 | 0 | – | – | – | – | 0 | 16 | 0 | – |
| /try | desktop | 1 | 0/0/0 | 0.3 | 0.3 | 0 | – | – | – | – | 0 | 16 | 0 | – |
| /signup | phone | 1 | 0/0/0 | 0.5 | 0.6 | 0 | – | – | – | – | 0 | 20 | 1 | – |
| /signup | desktop | 1 | 0/0/0 | 0.6 | 0.6 | 0.003 | – | – | – | – | 0 | 20 | 1 | – |
| /login | phone | 1 | 0/0/0 | 0.5 | 0.5 | 0 | – | – | – | – | 0 | 37 | 5 | – |
| /login | desktop | 1 | 0/0/0 | 0.5 | 0.5 | 0.035 | – | – | – | – | 2 | 50 | 5 | – |
| /play | phone | 1 | 0/0/0 | 0.7 | 0.7 | 0.001 | – | – | – | – | 0 | 47 | 14 | – |
| /play | desktop | 1 | 0/0/0 | 0.7 | 0.7 | 0.028 | – | – | – | – | 0 | 154 | 14 | – |
| /play/onevone | phone | 3 | 0/0/0 | 0.9 (0.4–1) | 0.9 (0.4–1) | 0 | **52.8 (51.2–53)** | 1.3 (1.3–1.5) | 0 (0–0) | stadium | 0 | 25 | 0 | **0.753** |
| /play/onevone | desktop | 1 | 0/0/0 | 0.3 | 2.1 | 0.034 | 32.1 | 0.5 | 0 | stadium | 0 | 19 | 1 | 1 |
| /play/threevthree | phone | 3 | 0/0/0 | 0.4 | 0.4 | 0 | **73 (73–76.4)** | 1.3 (1.1–1.3) | 5 (4–5) | stadium | 0 | 42 (42–52) | 0 | **0.753** |
| /play/threevthree | desktop | 1 | 0/0/0 | 0.3 | 6.3 | 0.024 | 48.8 | 0.5 | 1 | stadium | 0 | 26 | 1 | 1 |
| /play/dunk | phone | 2 | 0/0/0 | 0.3 | 0.3 | 0 | 25.5 (25.5–27.4) | 2 (2–2.1) | 2 (2–2) | stadium | 3 (the MIX / MC / CC chips, 44–49 × 22) | 65 (65–81) | 0 | 0.877 |
| /play/dunk | desktop | 1 | 0/0/0 | 0.3 | 7.2 | 0.049 | 22.2 | 0.8 | 3 | stadium | 3 | 60 | 1 | 1 |
| /play/threepoint | phone | 2 | 0/0/0 | 0.6 | 0.6 | 0 | **66.6–71.4** | 1.3 | 1 | – | 0 | 30 | 0 | 0.877 |
| /play/threepoint | desktop | 1 | 0/0/0 | 0.3 | 1.7 | 0.046 | 35.6 | 0.3 | 0 | – | 0 | 15 | 1 | 1 |
| /play/tennis (control) | phone | 3 | 0/0/0 | 0.3 | 0.4 | 0 | **20.9 (20.3–21.4)** | 2.3 (2.3–2.4) | 6 (4–10) | stadium | 0 | 41 | 0 | 0.799 |
| /play/tennis (control) | desktop | 1 | 0/0/0 | 0.2 | 3.1 | 0.113 | 14.7 | 1.1 | 4 | stadium | 0 | 39 | 1 | 1 |
| /play/venice | phone | 2 | 0/2/0 | 0.2 | 0.2 | 0 | 17 (17–18.2) | 1.8 (1.8–1.9) | 3 (3–6) | ocean | 0 | 39 | 1 | 1 |
| /play/venice | desktop | 1 | 0/5/0 | 0.2 | 2.5 | 0 | 22 | 0.6 | 3 | ocean | 0 | 39 | 1 | 1 |
| /play/coast | phone | 2 | 0/0/0 | 0.2 | 0.2 | 0 | 18 (18–18.9) | 2.3 (2.3–2.5) | 3 (3–3) | **stadium** | 0 | 11 | 1 | 1 |
| /play/coast | desktop | 1 | 0/0/0 | 0.2 | 0.2 | 0 | 17 | 0.6 | 3 | **stadium** | 0 | 7 | 1 | 1 |
| /play/adventure | phone | 2 | 0/0/0 | 0.2 | 0.2 | 0 | 14.5 (14.5–16.7) | 4.1 (4.1–4.8) | **0 (0–0)** | wind | 1 (SKIP 68 × 20) | 50 (50–65) | 0 | 1 |
| /play/adventure | desktop | 1 | 0/0/0 | 0.2 | 1.4 | 0 | 10.7 | 1.1 | **0** | wind | 0 | 24 | 0 | 1 |
| /creator | phone | 1 | 0/0/0 | 0.5 | 0.5 | 0.001 | – | – | – | – | 0 | 85 | 11 | – |
| /creator | desktop | 1 | 0/0/0 | 0.6 | 0.6 | 0.008 | – | – | – | – | 0 | 126 | 11 | – |
| /closet | phone | 1 | 0/0/0 | 0.8 | 3.2 | 0.007 | – | – | – | – | 0 | 81 | 1 | – |
| /closet | desktop | 1 | 0/0/0 | 0.9 | 1.6 | 0.003 | – | – | – | – | 0 | 164 | 1 | 0.664 |
| /train | phone | 1 | 0/0/0 | 0.7 | 0.7 | 0.001 | – | – | – | – | 0 | 65 | 18 | – |
| /train | desktop | 1 | 0/0/0 | 1 | 1 | 0 | – | – | – | – | 0 | 76 | 18 | – |
| /train/today-drill | phone | 1 | 0/0/0 | 0.4 | 0.4 | 0.001 | – | – | – | – | 0 | 61 | 2 | – |
| /train/today-drill | desktop | 1 | 0/0/0 | 0.3 | 0.3 | 0.003 | – | – | – | – | 0 | 62 | 2 | 0.228 |
| /train/library | phone | 1 | 0/0/0 | 0.3 | 2.5 | 0.001 | – | – | – | – | 0 | 44 | 0 | – |
| /train/library | desktop | 1 | 0/0/0 | 0.3 | 0.4 | 0.006 | – | – | – | – | 0 | 62 | 0 | – |
| /train/build | phone | 1 | 0/0/0 | 0.4 | 1.1 | 0.001 | – | – | – | – | 0 | 40 | 0 | – |
| /train/build | desktop | 1 | 0/0/0 | 0.3 | 0.4 | 0.003 | – | – | – | – | 0 | 42 | 0 | – |
| /train/progress | phone | 1 | 0/0/0 | 0.3 | 1.1 | 0.007 | – | – | – | – | 0 | 33 | 2 | – |
| /train/progress | desktop | 1 | 0/0/0 | 0.3 | 0.5 | 0.002 | – | – | – | – | 0 | 35 | 2 | – |
| /train/jumps | phone | 1 | 0/0/0 | 0.4 | 1.1 | 0.001 | – | – | – | – | 0 | 77 | 1 | – |
| /train/jumps | desktop | 1 | 0/0/0 | 0.3 | 0.5 | 0.003 | – | – | – | – | 0 | 85 | 1 | – |
| /workout | phone | 1 | 0/0/0 | 0.3 | 0.3 | 0.001 | – | – | – | – | **2 (tick boxes 13 × 13)** | **183** | 1 | – |
| /workout | desktop | 1 | 0/0/0 | 0.2 | 0.2 | 0.004 | – | – | – | – | 2 | 272 | 1 | – |
| /party | phone | 1 | 0/0/0 | 0.3 | 0.3 | 0.001 | – | – | – | – | 0 | 88 | 2 | – |
| /party | desktop | 1 | 0/0/0 | 0.2 | 0.2 | 0.018 | – | – | – | – | 0 | 90 | 2 | – |
| /studio (admin, `NEXUS_STUDIO_ENABLED`) | phone | 1 | 0/0/0 | 0.7 | **5** | 0.027 | – | – | – | – | 0 | 89 | 0 | – |
| /studio (admin, `NEXUS_STUDIO_ENABLED`) | desktop | 1 | 0/0/0 | 0.5 | 0.5 | 0.01 | – | – | – | – | 25 (its tool buttons) | 198 | 0 | 0.514 |

Accessibility (static scan, serious and critical findings): **0 on every screen**, both tiers. Text under 12 px: one run (the Venice
mini-map's "N", 9 px). Unfinished marks ("coming soon", `[PLACEHOLDER]`, `[DRAFT]`) on screen: **none** on these 24 screens (the story's
tags are hidden by `story.showDraftTags` 0, as the story lane built). "Ways on 0" on a game or `/try` is not a dead end: the game shell's
back link and the `/try` QUIT button sit in the app's chrome (not counted), and the story's exit link shows on its start and pause
screens; every game and hub was checked to have a way out.

### 2.2 Where a hoops load's time goes (phone tier, the game's own `[FEL-PERF]` lines, seconds from navigation)

| Mode | Pre-warm starts (asset load and scene build before it) | READY | So the pre-warm takes |
|---|---|---|---|
| 1v1 | **41.7** | 52.8 | 11.1 |
| 3v3 | **62.7** | 76.4 | 13.7 |
| Dunk | 15.4 | 27.4 | 12.0 |
| tennis (control) | **10.9** | 20.3 | 9.1 ("pre-warm ready in 9057 ms") |

The shader pre-warm (owner 2026-10-16, "longer load, no mid-play stall") costs about the same in every mode. **The hoops modes' extra
time is the load before it: 1v1 3.8×, 3v3 5.8× the control's.** Even so, the first 4 s of play still held one frame of 2.4–2.8 s in 1v1
and 3v3 (1.2 s in tennis): some first-use compiles are not pre-warmed. And within 30–60 s of play the perf guard stepped every mode,
the control included, down to 0.75 render scale and a 30 fps cap: that is the rig, not a finding.

### 2.3 The phone stage (1v1 and 3v3)

| | Dunk | 1v1 | 3v3 | tennis |
|---|---|---|---|---|
| canvas top (px) | 72 | **181** | **181** | 124 |
| canvas height (px) | 792 | 792 | 792 | 707 |
| canvas bottom vs the 844 px screen | **20 px below** | **129 px below** | **129 px below** | 13 px above |

Cause (code): the stage is `h-[calc(100dvh-3.25rem)]` (`components/games/game-shell.tsx`), sized for a one-row header, but on a
390 px phone the header wraps: Home · title · BODY, then the PRQ badge · graphics · full screen (two rows), and 1v1 / 3v3 add the
Pause button, which makes three. The picture (`improve-audit-worst-screens.jpg`, tiles 1–2): the 1v1 move stick is cut in half at the
bottom edge, and a black band sits between the header and the court. The landscape phone and the console view (the same file's
"a phone held sideways gets the whole screen") are not affected.

### 2.4 The first visit (phone tier, a guest, `firstvisit.mts`)

| Step | at |
|---|---|
| Home painted | 0.7 s |
| PLAY NOW tapped → `/try` | 2.6 → 3.6 s |
| Birth date given, CONTINUE tapped (the rig types at once; a person takes longer) | 4.2 s |
| "LOADING ARENA…" | by 12.9 s |
| The dunk's TAP TO START | **45.3 s** (41 s after the birth date) |
| Playing | 56.4 s (includes the rig's 3 s settle) |

6 taps and fields, 0 page errors. Nothing of the dunk loads while the visitor gives the birth date.

### 2.5 Sound (the hook's counts and the bed built)

- **The Adventure: 0 sound starts in 8 s of play, in all three runs** (two phone, one desktop), with the stick and a button pressed.
  The wind bed starts; nothing else. Code: no file under `lib/babylon/adventure/**` uses `SoundKit` (the only sound is the wind bed and
  the spoken lines in `AdventureMode.ts`), so the rail, the wall run, the homing dash, the fights and the bosses are silent.
- **The Coast zone builds the stadium bed** (the 900 Hz crowd filter) in all three runs; Venice builds the ocean bed (500 Hz).
  Code: `CoastZoneMode.ts` asks for no bed in its load (it has no sound code at all), so the harness's first-input fallback
  (`ModeHarness.ts` `firstInput`) starts `stadium` for its `daylight` mood: a crowd murmur over an empty sea.
- 3-Point builds no bed (it has its own crowd); 1v1 started 0 sounds in the play window in all four runs while 3v3 started 4–5 —
  most likely the rig's presses (1v1 opens on the rival's check), not missing sound. **Not a finding until a person checks it.**

### 2.6 The Venice courts, out and back (`walkthrough.mts`, phone 390 × 844, DPR 2, no throttle)

4 of 4 courts round-tripped: hub ready in 4.0–4.4 s; each game to its START in 14.1 s (Dunk), 23.3–23.4 s (1v1, 3-Point), 28.1 s (3v3);
back to the same court with its card up, 11.5–12.5 m from its centre. No dead end. On arrival the camera's own guard logged
"hero off-screen 2x … auto-recentering camera on hero" (`FrameGuard`) in both phone runs; on desktop the hub logged 4× "MISSING CLIP
catch_pass … falling back to guard" (an onlooker's pass catch).

### 2.7 Online (`match-room.mts`, a local netd; no browser)

| Check | Today's netd | The pre-party netd production runs |
|---|---|---|
| A guest opened 1.2 s late reaches the host | PASS, 182 of 183 frames | PASS, 181 of 182 |
| Control: both opened in the same tick | PASS, 119 of 120 | PASS, 121 of 122 |
| Authority moves when the host leaves | PASS | PASS |
| Five guests reach a 3v3 host / a seventh is refused | PASS (151 of 152 each) / PASS | PASS / PASS |
| The shared-game frames cross netd | PASS | PASS |
| The party path | PASS (`p_welcome`) | **"room and peer required"** → the app says "Parties need a server update" |

So the shared 1v1 / 3v3 game works on either netd; **parties do not work in production until the owner's netd redeploy**
(ONLINE-FINISH-PLAN §5). The rig's `/party` says "Online parties aren't switched on here yet" because it has no `NEXT_PUBLIC_NETD_URL`;
whether production has it set is not recorded (ONLINE-FINISH-PLAN §1). The seven-browser e2e was not re-run: the online lane ran it on
2026-11-21 and the code has not changed since; on this rig a 3D page drew about one frame a second, so it proves flow, not feel.

### 2.8 From the pictures (one run each unless said)

- **The Adventure's world is flat untextured blocks**: the player stands on a blank white plane; walls and ledges are single colours
  (both tiers). Code: `lib/babylon/adventure/world/view.ts` builds every piece with a `StandardMaterial` of one hex colour, no texture.
  On desktop, after a short walk, the view showed only a pale plane and a floating dark disc.
- **The Coast camera went inside the boat** after a short walk on desktop, with the "Boat to Venice" label filling a quarter of the
  screen, cut at the edge. The Adventure host's camera (`lib/babylon/adventure/host/camera.ts`) has no clear-view check (the 1v1 high
  camera has one: `HIGH_CAM_PULL_MIN`, `HIGH_CAM_CLEAR_M`).
- **Venice, phone: the first-visit hint ("Drag anywhere to walk…", `bottom-[9.5rem]`, `app/play/venice/wayfinding.tsx`) runs under the
  DASH and JUMP buttons, and its "Got it" button sits under DASH**, so dismissing it is a gamble (both phone runs).
- **The first-visit loading card**: the "USB controller? Plug it in…" chip is drawn over the "VENICE BEACH COURT" line.
- **`/workout`: 183 words before scrolling** on a phone (272 on desktop) — owner copy (§6).

---

## 3. Everything found, ranked by need

Need = how many players meet it × how badly it hurts (crash > blocked > broken control > long wait > looks unfinished > polish).
"Owner?" marks what waits on the owner (§6) or needs the owner's feel call before it can ship ON.

| # | What | Who meets it | How bad | The number | Owner? | Phase |
|---|---|---|---|---|---|---|
| 1 | Every game's bottom is off a phone held upright; 1v1 / 3v3 cut the move stick | every phone player, every game | broken control | 129 px (1v1, 3v3), 20 px (Dunk, 3-Point) below the screen | – | **1** |
| 2 | Hoops modes load 2.5–3.5× the control | every hoops game (the flagship) | long wait | phone 53 / 73 / 67–71 s vs 21 s; desktop 32 / 49 / 36 vs 15 s; pre-warm starts at 42 / 63 s vs 11 s | – | **3** |
| 3 | A new visitor waits 41 s after the birth date for the first dunk | every first visit from the home page | long wait, first impression | 45.3 s to READY, 56 s to playing | – | **2** |
| 4 | The 1v1 "ghost" shot after a make | 1v1 players who press shoot in the make beat | broken rule | 10 of 31 makes (HOOPS-PLAY-AUDIT #6) | – | **4** |
| 5 | The 3v3 drive-by steal takes the ball with no look at it | every 3v3 defence | unfair | 9 of 11 steals left with the strip rule on (HOOPS-PLAY-AUDIT §6.1) | feel call (owner feature) | **4** (OFF) |
| 6 | A shot pressed mid-spin: 1v1 waits it out, 3v3 fires | both modes | inconsistent | 533 ms vs 17 ms (HOOPS-PLAY-AUDIT #5) | feel call | **4** (OFF) |
| 7 | The 1v1 rival's board chase stops at a body in his line | 1v1 long rebounds | stall | 1 of 17 boards still stalled (HOOPS-PLAY-AUDIT §5.2) | – | **4** |
| 8 | The story is silent in play | everyone who plays Chapter 1 (now on the Play door and in Venice) | looks unfinished | 0 sound starts in 8 s, 3 runs; others 3–10 | – | **5** |
| 9 | The Coast plays a stadium crowd | everyone in the Coast zone | wrong | the 900 Hz crowd bed, 3 of 3 runs; Venice ocean | – | **5** |
| 10 | Venice hint under DASH / JUMP; "Got it" under DASH | every first Venice visit on a phone | blocked control | 2 of 2 phone runs (picture) | – | **6** |
| 11 | Small taps in play: the MIX / MC / CC chips (44–49 × 22) on hoops HUDs; the story's SKIP (68 × 20); `/workout`'s tick boxes (13 × 13) | phone players | polish | as measured | – | **6** |
| 12 | Chapter 1's world is flat colour blocks | everyone who plays the story | looks unfinished | every piece one hex colour (`world/view.ts`); pictures | partly (creature and boss bodies, §6) | **7** |
| 13 | The 1v1 high camera loses the rim on an upright phone at Canopy Court | 1v1 phone players at that court | can't see the hoop | the hoops-cam lane's last upright runs: rim in frame 92.7 %, everything in frame 88.3 % (2 of 3 runs) | – | **8** |
| 14 | 3v3 keeps the follow camera the owner found hard in 1v1 | every 3v3 game | harder to play | the owner's 1v1 call (2026-11-21) | feel call | **8** (OFF) |
| 15 | Zone cameras: the Coast camera inside the boat; Venice loses the hero on arrival | Coast and Venice visitors | looks broken | 1 desktop run (picture); 2 of 2 phone runs (FrameGuard) | – | **9** |
| 16 | Online 3v3: the AI chooses remote humans' passes and shots | every online 3v3 with a second human | broken control | ONLINE-FINISH-PLAN §8 | – (six humans need the netd redeploy; two work today) | **10** |
| 17 | First-use compiles still stall the first seconds of hoops play | every hoops game | hitch | one 2.4–2.8 s frame in the first 4 s (control 1.2 s) | – | **3** |
| 18 | Parties do not work in production | everyone who tries a party | blocked | the old netd answers "room and peer required" | **owner: netd redeploy** | §6 |
| 19 | Words before scrolling over the 40-word budget (`/workout` 183, `/creator` 85, `/closet` 81, `/train/jumps` 77…) | readers of those screens | slow to read | as measured | **owner: copy** | §6 |
| 20 | Studio's largest paint 5 s on a phone; its tool buttons under 44 px on desktop | the owner (admin, flag-gated) | polish | LCP 5.0 s; 25 small | Studio is the owner's | – |
| 21 | Phone frame rate of the hoops modes | every phone player | unknown | the rig cannot say (§1); hoops drew 1.1–1.5 fps against the control's 2.3 on the same rig | **owner: a phone check with the PERF readout** | §6 |
| 22 | The Venice onlooker's missing `catch_pass` clip (falls back to guard) | Venice visitors | polish | 4 console lines, 1 desktop run | – | not a phase |
| 23 | The "USB controller?" chip over the dunk loading card's venue line | first visit | polish | 1 picture | – | **6** |
| 24 | The 1v1 rival's offence (PRO makes few shots) | 1v1 players | feel | HOOPS-PLAY-AUDIT #3: his timing hands are the owner's numbers | **owner: tuned numbers** | §6 |

---

## 4. The 10 phases, in order

Every phase: the change goes behind a knob whose off value restores today's behaviour exactly (with a test that pins both ends), it
ships ON only on a measured win — **at least 3 runs per side plus the tennis control, on the same rig, in the same gate hold** — and
otherwise ships OFF behind its knob for the owner. No existing tuned number moves; new numbers are flagged. Sizes: S ≤ 1 day,
M 2–4 days, L a week or more. "Shares" lists another phase that touches the same file (they must run one after the other).

### Phase 1 — The game fits a phone held upright (S)
- **Do:** size the game stage from the header's real height (a flex column that gives the stage the rest of the screen, or the measured
  header height), so no game's bottom leaves the screen; keep the landscape and console views exactly as they are. Optionally fold the
  second header row (PRQ badge, graphics, full screen) into the stage's "⋯" menu on an upright phone, so 1v1 / 3v3 get the 109 px back.
- **Files:** `components/games/game-shell.tsx`; new `components/games/game-shell.fit.test.tsx`. Knob: `ui.stageFitsHeader` (1 on,
  0 = `calc(100dvh-3.25rem)`).
- **Metric:** the canvas's bottom against the screen's, on 390 × 844 and 375 × 667 portrait, in 1v1, 3v3, Dunk, 3-Point, tennis, Venice
  (walk.mts `canvas`): 129 / 129 / 20 / 20 px below → ≤ 0 everywhere; the move stick fully on screen (picture); landscape 844 × 390
  unchanged (control).
- **Bar to ship ON:** 0 px below in all six modes, 3 runs a side; landscape and desktop pixel-identical layout; every-screen's CLS budget
  (0.02) held on the game screens.
- **Shares:** none.

### Phase 2 — The first dunk loads while the visitor gives the birth date (M)
- **Do:** once `/try` shows the birth-date step, start fetching what the guest dunk needs (its code chunk and the court and body files,
  as `fetch`/`<link rel=prefetch>`: nothing runs and nothing is sent about the visitor); then mount as today. A turn-away (under the
  age gate) simply never uses it. If phase 3's measurement shows a cheap first-frame cut in `DunkMode`'s load, take it here too.
- **Files:** `app/try/page.tsx`, `components/games/guest-dunk-shell.tsx`, `components/age-step.tsx` (the birth-date step `/try` renders), new `lib/try/prefetchDunk.ts` (+ test). Knob: `try.prefetchDunk`.
- **Metric:** `firstvisit.mts`: birth date → TAP TO START, 41 s today, with a person's typing modelled (a 10 s pause on the step).
- **Bar to ship ON:** a cut of at least 25 % in birth date → READY, 3 runs a side, the tennis control's load unchanged; no new request
  before the birth date is confirmed carries anything about the visitor (a test on the request list).
- **Shares:** none (DunkMode only if a cut is taken; then sequence after phase 3).

### Phase 3 — Hoops loads: find the 42–63 s, then play sooner (L)
- **Do:** first measure: add load-stage marks (assets, bodies, court and venue, crowd, broadcast, the pre-warm) to the harness's
  existing `[FEL-PERF]` lines, and read them on the phone tier for 1v1, 3v3, 3-Point against tennis. Then cut the two biggest stages in
  the owner's way ("play sooner, stream the rest… court + you first, extras in background", 2026-10-20): defer what the first play frame
  does not need (the crowd, far props, the broadcast's extras) behind a READY that comes when the court and the players are drawn; and
  add the shaders that still compile in the first seconds of play to the pre-warm.
- **Files:** new `lib/babylon/core/loadMarks.ts` (+ test); `lib/babylon/core/ModeHarness.ts` (the marks only); the load functions of
  `lib/babylon/modes/OneVOneMode.ts` (`load`, ~line 1085), `ThreeVThreeMode.ts` (~1054), `ThreePointMode.ts` (~1387);
  `lib/babylon/court/mount/hoopsCourt.ts`; `lib/babylon/core/shaderPrewarm.ts`. Knob: `hoops.loadDeferExtras`.
- **Metric:** phone-tier READY (52.8 / 73 / 66.6–71.4 s) and "pre-warm starts" (41.7 / 62.7 s) against the control (20.9 / 10.9 s); the
  worst frame in the first 4 s of play (2.4–2.8 s against the control's 1.2 s).
- **Bar to ship ON:** READY down by at least 30 % in 1v1 and 3v3, 3 runs a side, the control within 10 % of itself; the first-4-s worst
  frame not worse; HOOPS-PLAY-AUDIT's flow runs (§7 there) show the same game (no seam moved: the deferred pieces are scenery).
- **Shares:** `OneVOneMode.ts` / `ThreeVThreeMode.ts` with phases 4, 8 (one line) and 10; `ModeHarness.ts` is a caution file (LANES §3).
  Run in lane B, first.

### Phase 4 — Hoops rules, one way in both modes (M)
- **Do (ships ON on its bar):** (a) the 1v1 "ghost" shot: no gather or release counts during the make beat (hold the shot press until
  the reset, or reset at once); (b) the 1v1 rival's board chase goes round a body that stands in his line (a side-step when the
  standoff holds him for 0.5 s).
- **Do (ships OFF, the owner's feel calls):** (c) the 3v3 drive-by steal must pass the same hand-on-the-ball test as a poke
  (`aiStripLands`); (d) one rule for a shot pressed mid-spin in both modes (the shot may cut the spin after its first half).
- **Files:** `lib/babylon/modes/OneVOneMode.ts` (the make beat ~1394–1403, the spin's shot buffer ~2052), `ThreeVThreeMode.ts` (the
  drive-by ~1276 and `driveBySteal` ~3877, the shot buffer ~2415), `lib/babylon/core/HoopsKinetic.ts` (`driveByRead`),
  `lib/babylon/hoops/steals.ts`, `lib/babylon/hoops/boardChase.ts`, `lib/feel-panel/knobs.ts`, `docs/FEEL-PANEL.md`. Knobs:
  `hoops.makeBeatHoldsShot`, `hoops.rivalChaseAroundBody`, `hoops.driveByHandOn`, `hoops.spinShotCutsHalf`.
- **Metric:** HOOPS-PLAY-AUDIT's rig (`hoops-gap/drive.mjs` with `hoops-play/flow-ext.mjs`, five seeds a side): (a) gathers in the make
  beat 10 of 31 makes → 0; (b) boards stalled 1 of 17 → 0; (c) drive-by share of 3v3 steals 9 of 11, rival shots a minute; (d) press →
  shot in a spin, 533 ms (1v1) and 17 ms (3v3) → one number in both.
- **Bar:** (a) and (b): their counts to 0 with no change in the other flow numbers (shots, steals, fouls a minute within the seeds'
  spread), 5 seeds a side (≥ 3 runs) plus a knob-off control run. (c) and (d) ship OFF regardless; the owner feels them.
- **Shares:** `OneVOneMode.ts`, `ThreeVThreeMode.ts` with phases 3, 8 and 10. Note #685 (merged) edited the hint lines in both modes
  and in `onevoneRules.ts` / `threevthreeRules.ts`: rebase on `48a7b244`.

### Phase 5 — Sound in the story and on the coast (M)
- **Do:** (a) the Coast zone asks for the ocean bed in its load (as Venice does), with wave and step sounds from Venice's soundscape
  pattern; (b) the Adventure gets its sound effects from the shipped `SoundKit` cues (no new assets: the owner chose free CC0 or
  synthesised, 2026-11-12): footsteps, jump and land, the rail grind, the wall run, the homing dash, hits and a foe's defeat, the bolt,
  the boss's tell, the gate.
- **Files:** `lib/babylon/modes/CoastZoneMode.ts`; new `lib/adventure/coast/zoneSound.ts` (+ test); new
  `lib/babylon/adventure/audio/storySfx.ts` (+ test, driven by the host's existing events, the way the telegraph already feeds "the view
  and the audio"); `lib/babylon/modes/AdventureMode.ts` (the wiring line). Knobs: `coast.oceanBed`, `story.sfxOn`.
- **Metric:** walk.mts sound counts: the Adventure's sound starts in 8 s of play, 0 → at least one per action pressed; the Coast's bed,
  stadium → ocean (the bed filter's centre, 900 → 500 Hz).
- **Bar to ship ON:** 3 runs a side on the phone tier, the Venice hub as the control (its counts unchanged); no frame-time change
  beyond the control's spread; reduced-motion and the sound mix's off switch silence them (tests).
- **Shares:** `AdventureMode.ts` with phase 7 (separate lines; run in the same lane).

### Phase 6 — Touch: nothing under a thumb button, every tap at least 44 px (S)
- **Do:** the Venice first-visit hint sits above the touch deck (not under DASH / JUMP) and its "Got it" is never covered; the hoops
  HUD's MIX / MC / CC chips get a 44 px tap area (the look can stay); the story's SKIP gets 44 px; `/workout`'s two tick boxes are
  checked to be tappable through their labels (if the label is not the target, make it so; no word changes); the "USB controller?" chip
  no longer sits on the loading card's venue line.
- **Files:** `app/play/venice/wayfinding.tsx` (the Venice lane's file: route through it if that lane is active, LANES §3),
  `components/games/mic-caption.tsx`, `components/adventure/DialogueBox.tsx`, `components/workout-view.tsx`, the controller chip's
  component in `components/games/boot-splash.tsx` (a caution file: the layout line only).
- **Metric:** walk.mts small-target count on the phone tier (Dunk 3, the Adventure 1, `/workout` 2 → 0); an overlap check (the hint's
  box against the touch deck's buttons: overlap → none).
- **Bar to ship ON:** 0 small targets on those screens, 3 runs; every-screen's covered-content check clean on `/play/venice`; no layout
  shift added.
- **Shares:** `boot-splash.tsx` is touched by nothing else here.

### Phase 7 — Chapter 1 looks finished (M)
- **Do:** dress the story's hub and World 1 with what ships: the ground textures (`lib/babylon/visual/groundTextures.ts`), the Kenney nature props
  (CC0, already used by the Coast), a sky that is not a blank plane, edge trims on the rail and the wall; keep every piece's collision
  and size exactly (only materials and scenery change). Creature and boss bodies stay as they are (owner / art, §6).
- **Files:** `lib/babylon/adventure/world/view.ts`, new `lib/babylon/adventure/world/dress.ts` (+ test), `lib/babylon/modes/AdventureMode.ts`
  (one line, the sky); budget row `config/mobileBudget.json` only if measured and flagged. Knob: `story.worldDressed`.
- **Metric:** the pictures (before / after, the story rig's 16 beats, `scripts/probes/story/story-rig.mts`); the phone budget row (draws,
  meshes, texture MB) and the load time (14.5–16.7 s on the phone tier).
- **Bar to ship ON:** the playthrough and the resume sweep still finish (16 beats; 128 of 128 resumes); load within 10 % of today's,
  3 runs a side; the budget guard green. The look is the owner's to judge; ships ON only with those numbers held.
- **Shares:** `AdventureMode.ts` with phase 5 (run after it in lane C).

### Phase 8 — The hoops camera: Canopy's rim on an upright phone; the high view for 3v3 behind a switch (M)
- **Do (ships ON on its bar):** keep the rim in frame on an upright phone at every court, Canopy Court included (the fit's vertical limit
  treats the rim as a must-keep point, as it does the two players).
- **Do (ships OFF, the owner's feel call):** the 1v1 high sideline view offered to 3v3 behind its own knob (`hoops.threeVThreeCam` 0),
  the 3v3 court frame like `ONEVONE_CAM_COURT`.
- **Files:** `lib/babylon/core/HighSidelineCam.ts` (+ its test), `lib/babylon/core/CameraDirector.ts`, `lib/babylon/modes/ThreeVThreeMode.ts`
  (the one `setHighView` line, as 1v1 has at ~1253), `lib/feel-panel/knobs.ts`, `docs/FEEL-PANEL.md`.
- **Metric:** `scripts/probes/hoops-cam/possession.mjs` (the hoops-cam lane's rig): rim in frame 92.7 % → 100 %, everything in frame
  88.3 % → ≥ 99 % on the upright phone at Canopy; the other courts (Venice, Blossom) unchanged.
- **Bar to ship ON:** 3 runs a side per court, the look never turning (the lane's own guard), no new cut.
- **Shares:** `ThreeVThreeMode.ts` (one line) with phases 3, 4, 10 — that line lands in lane B's order or after it.

### Phase 9 — The zone cameras: never inside a prop, never losing you on arrival (S–M)
- **Do:** give the Adventure host's follow camera the clear-view check the 1v1 high camera has (come in along its look when a prop's box
  is between it and the player; never stand inside a prop's box), and start Venice's camera framed on the arrival spot, so FrameGuard has
  nothing to rescue.
- **Files:** `lib/babylon/adventure/host/camera.ts` (+ test), `lib/babylon/core/FrameGuard.ts` (read only, for the check),
  `lib/babylon/modes/VeniceHubMode.ts` (the arrival framing; the Venice lane's file — route if active). Knob: `venue.camClearView`.
- **Metric:** FrameGuard's "hero off-screen" lines on Venice arrival (2 of 2 phone runs → 0); a scripted walk onto the Coast dock and boat
  (the eye's distance to the nearest prop box, inside → never), the Venice and story walks as controls.
- **Bar to ship ON:** 3 runs a side per place, 0 guard rescues, the eye never inside a box; no camera number the owner tuned changes
  (distances, heights, FOV).
- **Shares:** `camera.ts` is shared by the Adventure, Venice and the Coast (all three are the test).

### Phase 10 — Online 3v3: remote humans choose their own passes and shots (L)
- **Do:** a remote human's 3v3 body takes its passes and shots from that player's input (the pass button and target, the shot press and
  release), as the hero's do, with the AI still steering empty or dropped seats. Works on today's netd for two humans; six need the
  owner's redeploy.
- **Files:** `lib/babylon/modes/ThreeVThreeMode.ts` (the slot's offence for a seat with a human), `lib/net/attach.ts` (`seatSource`),
  `lib/net/play.ts`, `tests/online-play/**`, `scripts/probes/online-play/match-room.mts` (a new check). Knob: `net.remoteOffence`.
- **Metric:** a headless match-room check (a remote seat presses pass and shoot: the pass leaves and the shot releases on that seat's
  input, 0 → every press); the browser e2e's 3v3 with two pages.
- **Bar to ship ON:** the headless check on both netd builds, 3 runs; the AI-only 3v3 unchanged (HOOPS-PLAY-AUDIT flow numbers within
  the seeds' spread); the owner's two-phone test (ONLINE-FINISH-PLAN §7) before it is called finished.
- **Shares:** `ThreeVThreeMode.ts` with phases 3, 4, 8 — last in lane B.

---

## 5. Batching: four lanes, no file in two lanes at once

| Lane | Phases, in order | Files it holds | Why this order |
|---|---|---|---|
| **A — the shell and the screens** | 1, then 2, then 6 | `game-shell.tsx`; `/try` and the guest dunk shell; the touch-fix files (`wayfinding.tsx`, `mic-caption.tsx`, `DialogueBox.tsx`, `workout-view.tsx`, `boot-splash.tsx`) | All S/M, all page-level; phase 1 first (every phone player) |
| **B — the hoops modes** | 3, then 4, then 10 (and phase 8's one 3v3 line after 4) | `OneVOneMode.ts`, `ThreeVThreeMode.ts`, `ThreePointMode.ts`, `HoopsKinetic.ts`, `hoops/steals.ts`, `hoops/boardChase.ts`, `hoopsCourt.ts`, `shaderPrewarm.ts`, `loadMarks.ts`, `ModeHarness.ts` (marks only), `lib/net/{attach,play}.ts` | The two mode files are 4 300–4 600 lines and every hoops phase edits them: one lane, one at a time |
| **C — the story and the zones** | 5, then 7, then 9 | `CoastZoneMode.ts`, `lib/adventure/coast/zoneSound.ts`, `AdventureMode.ts`, `lib/babylon/adventure/{audio,world}/**`, `adventure/host/camera.ts`, `VeniceHubMode.ts` (arrival only) | 5 and 7 share `AdventureMode.ts`; 9's camera is the same host's |
| **D — the camera** | 8 | `HighSidelineCam.ts`, `CameraDirector.ts` (the 3v3 line goes to lane B) | Independent of B except one line; can start at once |

Shared files to flag in their PRs: `ModeHarness.ts`, `boot-splash.tsx`, `game-shell.tsx` (caution files, LANES §3); `feel-panel/knobs.ts`
and `docs/FEEL-PANEL.md` (every lane adds knobs: additive, keep both sides on merge); `config/mobileBudget.json` (lane C only, if at all).
Lane B and lane D both need the hoops rigs and long gate holds: they should not run their measuring holds at the same time.

---

## 6. Waiting on the owner (not in the phases)

Recommendation first where there is one.

- **The netd redeploy** (ONLINE-FINISH-PLAN §5, numbered copy-paste steps): until then parties answer "Parties need a server update" in
  production, 3v3 seats two humans, winners-stay-on is off. *Recommend:* do it in the next ops session, then the two-phone test (§7 there).
  Also confirm `NEXT_PUBLIC_NETD_URL` is set in the production build's env.
- **A phone check of frame rate** with the PERF readout (owner tools → PERF tab → "Copy report") in 1v1, 3v3, Venice and the story: the
  rig cannot give a phone's frame rate (§1). *Recommend:* one report per mode before lane B's phase 3 ships, so its "before" is real.
- **Story names and words**: every `[PLACEHOLDER]` (the mode, the hub and gates, Chapter 1's title, Guide, Warden, the bosses, Wisp, the
  three partner creatures, the spells, the Venice story gate), Chapter 1's 16 lines and its `[DRAFT]` end card, and the chapters after 1
  (STORY-FINISH-PLAN §4).
- **Kaelor, the Sanctuary, the companions, the rival, keyframes K00–K17** (the 3D Art agent's proposals): not approved, not used.
- **The 3D Art assets that are not in the repo**: the Grok `.glb` models, creature and boss bodies (with a licence line).
- **Money**: account XP and Lab Credits for a story chapter; the `AdventureSave` table (a schema change) for the story across devices.
- **Creator cards** (`/card/[slug]` needs a published card; Creator platform items).
- **Copy over the 40-word first-screen budget** (`/workout` 183, `/creator` 85, `/closet` 81, `/train/jumps` 77, `/party` 88 …): cutting a
  screen's own explanation is new copy (every-screen rule).
- **Policy and legal text**, the age gates, and anything behind `COACH_STORE_ENABLED`, `STORE_HURT_OPTIN_ENABLED` and the other
  money / consent switches (docs/SWITCH-ON.md class B).
- **Tuned numbers**: the 1v1 rival's timing hands (HOOPS-PLAY-AUDIT #3), any camera distance, height or FOV.
- **The feel calls inside the phases** (built, shipped OFF): the 3v3 drive-by hand test and the mid-spin shot rule (phase 4), the 3v3 high
  camera (phase 8).
- **Retiring The Nexus Initiative** (`/story`): a deletion.

---

## 7. Not measured, and assumptions

- Not measured: a real phone (frame rate, touch feel, battery and heat); the production deploy (this is a local production build); a
  signed-in teen's paths; the seven-browser online e2e (re-used from 2026-11-21); the story played to its end in a browser (the story lane
  did it on 2026-11-21, 0 page errors); Studio's own flows beyond its first screen.
- `assumption:` "the Canopy Court upright rim" is the hoops-cam lane's last upright-phone runs in its scratch results (rim in frame
  92.7 %, all in frame 88.3 % in 2 of 3 runs), as the brief named it; the court in those runs was not re-measured here.
- `assumption:` the 1v1 "0 sounds in play" is the rig's presses (the rival has the check), not missing sound — listed, not phased.
- `assumption:` sizes are one agent lane's, on this shared 4-core machine with its gate queue.
- `assumption:` phase 2's prefetch is not data collection (static files, no visitor data, nothing before the birth date is confirmed
  except files every visitor gets). If the owner reads it otherwise, phase 2 waits.

## 8. How to re-run

```
# one production build (CPU slot), then the walks inside the gate lock; ES_* picks this lane's port, database and build folder
export ES_PG_DIR=/var/lib/postgresql/improve-audit-pg ES_PG_PORT=55521 ES_PORT=3871 ES_DIST=.next-verify ES_OUT=<scratch>/es-state
export CHROMIUM_EXE=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome
env -u DATABASE_URL -u DIRECT_URL /home/user/wt/cpu-run.sh npx tsx scripts/every-screen/rig.mts build
env -u DATABASE_URL -u DIRECT_URL NEXUS_STUDIO_ENABLED=1 /home/user/wt/gate-run.sh 3500 \
  npx tsx scripts/probes/improve-audit/walk.mts <out> --tier=phone|desktop|both [--only=onevone,tennis] [--tag=r1]
/home/user/wt/gate-run.sh 900 npx tsx scripts/probes/improve-audit/firstvisit.mts <out> fv1
OUT=<out> /home/user/wt/gate-run.sh 1500 npx tsx scripts/probes/venice-hub/walkthrough.mts
NETD_PORT=3872 /home/user/wt/cpu-short.sh npx tsx scripts/probes/online-play/match-room.mts      # NETD=old for production's netd
node scripts/probes/improve-audit/table.mjs <out-dirs…>                                          # the §2.1 table
npx tsx scripts/every-screen/rig.mts db-down; rm -rf .next-verify                                # after
```
(`server/netd/node_modules` must exist in the worktree for the match-room probe: hard-link it from a worktree that has it.)
