# A+ 3D missions — the prompt pack reconciled with this repo (2026-09-06)

The owner's "FEL — A+ 3D Conversion Prompt Pack" (roster #12–20 DOM → 3D, plus 3PT Shootout and Brain Brawl, one mode
per mission) was written against a different build than the one on disk. This page pins the differences so a mission
starts from facts, then holds each mission's Phase 0 audit.

## Reconciliation — what the pack assumes vs what is here

| Pack says | Here | Consequence |
|---|---|---|
| `REPO: /tmp/fel3 (Vite, Babylon.js 9 + Havok, 22-bone unprefixed rig)` | The app is the **Next.js** worktree `…/finalevolutionus-automatic-carnival/FEL-full-app` on `babylon9-aaa-rendering` (Babylon 9.23, Havok present — `@babylonjs/havok`, `ContactSystem`, — 22-bone unprefixed rig with `rigNormalize` stripping every `mixamorig` variant). `/tmp/fel3` is not on disk (see memory: design-bible gap). | Missions run here. "Vite bundle / React.lazy" reads as Next dynamic imports (`next/dynamic`, `ssr:false`), which every play route already uses. |
| "DOM mockups → real 3D" for #12–20 | Every listed mode is **already a registered Babylon mode** in `lib/babylon/modes/registry.ts`: dance, who_scene_it (live since today, W1), carnival, threepoint, golf, tennis, derby (baseball), penalty (soccer), football, gymnastics, bigair. Brain Brawl is the one 2D deck left. | The missions are **A+ spec fill-ins** (Phase 3) on Babylon modes, not conversions. Phases 0–2 are audits and gap closures, not rebuilds. |
| "All textures through the KTX2 pipeline" | No KTX2 pipeline exists; textures are procedural `DynamicTexture`s (runtime canvases — cannot be KTX2), baked JPG/PNG backdrops and Meshy GLB textures. | Owner decision 2026-09-06: **add a KTX2 pipeline as its own mission** (after Dance). Scope = GLB textures + baked backdrops; the encoder is a new dependency and gets its own ask. |
| "Deploy to Vercel … return the live URL" (Phase 6) | Standing rules: **no push, never claim ship/live until AM verifies**, RC tags local only, `npm run build` never while the dev server runs. | Phase 6 = a local production build (dev server stopped for it) + local verification on `next start`. Deployment stays the owner's / AM's act. |
| "60fps at 1080p on integrated graphics" | Measured by the gauntlet on this Mac (desktop tier) and the mobile tier rows; no integrated-graphics machine is attached. | Report the gauntlet numbers honestly as the proxy; never claim the pack's exact bar. |
| Benchmarks locked for Dance / Carnival / Who Scene It: Wii Sports Resort floor + Mario Party readability | Adopted as written. | Unlocked modes (tennis, golf, soccer, baseball, football, 3PT) are not run until the owner confirms their proposed benchmark. Gymnastics (as FreeRun) and Brain Brawl were unblocked by the owner on 2026-09-06 with their own mission prompts (below). |

Standing rules that also bind every mission: Gate 0 before animation work; tests green + count per commit; risk level per
change; sign-off on physics/rig/shared Profile; no new dependency without asking; one writer; SHIP firewall on Nexus/Cell.

## Recommended order (pack's) against this branch

| # | Mode | Registry key / route | State on this branch |
|---|---|---|---|
| 1 | Dance Rhythm | `dance` · `/play/dance` (Babylon-only) | live; Phase 0 below |
| 2 | Who Scene It | `who_scene_it` · `/play/who-scene-it` (flag `whoSceneIt`) | live since 2026-09-06 (lane 3 W1/W2): venue per question, sweep, A/B/X/Y, community packs |
| 3 | Court Carnival | `carnival` · `/play/court-carnival` | live hub of four minigames |
| 4 | 3PT Shootout | `threepoint` · `/play/three-point` | live (Babylon port of the R3F shootout); roster rivals |
| 5 | Golf | `golf` · `/play/golf` | live (aimSwingCore, meter, wind, clubs, 3 holes) |
| 6 | Tennis | `tennis` · `/play/tennis` | live (RallyCore); four shot verbs |
| 7 | Baseball | `derby` · `/play/baseball` | live (derby) |
| 8 | Soccer | `penalty` · `/play/soccer` | live (penalty shootout, keeper round) |
| 9 | Football | `football` · `/play/football` | live (rush) |
| 10 | **FreeRun** (replaces Gymnastics) | today `gymnastics` (AirSessionCore) · `/play/gymnastics` | **unblocked 2026-09-06** — owner's FreeRunMode mission; benchmark Skate 3 scoring + Mirror's Edge traversal; reuses Skate's trick scoring (import/extract, never rewrite SkateMode) |
| 11 | Brain Brawl | 2D deck (`components/games/brain-brawl-game.tsx`) | **unblocked 2026-09-06** — owner's BrainBrawlMode mission; benchmark Trivia Crack wheel × Big Brain Academy graded minigames; content GENERIC (no Blueprint, no spaced repetition / ghost duels / feed mechanics — those are the Knowledge Feed) |

---

## Mission #1 — Dance Rhythm — PHASE 0 AUDIT (no code changes)

**Benchmark (locked):** Wii Sports Resort floor + Mario Party readability.

1. **Current implementation.** `lib/babylon/modes/DanceMode.ts` (276 lines, Babylon, M75): a ModeDefinition on the
   **audio clock** (a local `AudioContext` is the song clock; `update(dt)` only asks what time it is in the song), venue
   `dance` via `mountVenue` (The Cypher: lit deck, four lamps), hero on the 22-bone rig, `assertSpawned` guard. Route
   `app/play/dance` (Babylon-only, `GameShell` + the shared `timing-babylon` host with `swingLabel: 'TAP'`). Logic worth
   keeping: `lib/babylon/core/DanceCore.ts` — `JUDGE_WINDOWS` PERFECT ≤ 40 ms · 300, GREAT ≤ 90 ms · 200, GOOD ≤ 200 ms
   · 100, MISS after 200 ms; `generateRoutine` (seeded), `DancePerformance` (combo, counts, signed delta, `result()` with
   accuracy, maxCombo, stars); `audio/StemBand` (the "band builds as you hit" mix layer). Nothing is DOM.
2. **Registration pattern.** `MODES` in `lib/babylon/modes/registry.ts` (key `dance`) + `ENABLED_BABYLON_MODES`; route
   loader with `next/dynamic` (`ssr: false`) into `GameShell`; pad verbs in `lib/babylon/ui/modeVerbs.ts`; controller
   link config in `lib/controller-link/schemas/registry.ts` when a phone layout is wanted. This is the pattern every
   shipped Babylon mode uses (dunk is the proof gate); the mission must match it.
3. **Reusable assets.** Rig + `CharacterLibrary` (contact shadow, kits), venue spec `dance` + `mountVenue` props, `LightRig`
   (cascaded shadows, ACES grade), `EffectsKit` bursts, `SoundKit` SFX, `JuiceKit` (hit-stop/flash), `StemBand`, the
   timing host's HUD (score, combo, beat pulse, energy bar). No ball physics needed. Camera: `overShoulder` follow.
4. **Gate 0.** `rigNormalize` strips every `mixamorig` variant at load; `Gate0Tests` / `Gate0FullValidation` cover the
   rig; `assertSpawned` runs in DanceMode. Gauntlet row `dance`: 60 fps, 132 draws, **0 FEL-FRAME / 0 MISSING CLIP /
   0 errors** (run-20260906-162209). PASS.
5. **Vitest.** 338 passed / 0 failed (same sweep). Floor for Phase 5.
6. **Bundle size (baseline, `next build` on 6b31d5e with the dev server stopped, owner's window 2026-09-06 17:20).**
   `/play/dance` route 1.56 kB, First Load JS **157 kB**; First Load JS shared by all **89.9 kB** (chunks 31.9 + 53.7 kB);
   `/dev/mode/[key]` (the dev runner that imports every mode) 2.1 MB. Phase 4's +5 % check compares against these.

**Gaps against the Dance spec (Phase 3 scope):**
- Timing windows + visible judgement: **have** (windows, PERFECT/GREAT/GOOD/MISS banner with EARLY/LATE on a miss).
- Note highway / cue readable from couch distance: **partial** — a beat pulse and a banner, no highway or upcoming-cue
  lane. Mario Party readability wants the next hits visible before they land.
- Full-body animation driven by hit accuracy: **gap** — the dance clips are procedural authored loops built per skeleton
  (`registerDanceClips`: toprock, two step, arm wave, six step, freezes, windmill…; `DANCE_ALIASES` onto sport clips is
  only the fallback) and play canned at the step's beat; accuracy drives sparks/SFX, not the body. (Corrected: the first
  draft of this audit called them plain aliases.)
- Combo and multiplier with payoff: **have** (combo, `StemBand` mix builds with clean hits).
- ≥ 3 tracks at different difficulties: **gap** — one routine at fixed `BPM 96 / BARS 16 / DIFFICULTY 2` constants; no
  backing track is wired (the clock runs, the band layer plays).
- Results: accuracy %, max combo, grade: **have** (stars + accuracy banner; `ctx.end` stats carry maxCombo, counts).

**Cut risk (60 fps):** none foreseen — the mode is at 60 fps with headroom; a note highway is HUD, not geometry.

**Owner decisions (2026-09-06, one round):** Dance now, Phase 1–6; Phase 6 = local build + verify only; KTX2 pipeline
approved as its own mission with the toolchain **gltf-transform CLI (npm dev dependency) + KTX-Software `toktx` (Homebrew)**
— still to be installed only when that mission starts; the build window "now" was used for the baseline above; music =
**FEL 808 kit pulse under the band**. Order after Dance: the pack's (Who Scene It, Carnival, 3PT, Golf, Tennis, Baseball,
Soccer, Football), then FreeRun and Brain Brawl at the end.

**Phase 1–6 plan (after the owner's go):** P1 no rig work needed (Gate 0 PASS). P2 none (already 3D). P3: a cue lane
(next 4 beats as approaching markers, colour by move family), three tracks (bpm 88 / 96 / 112 with difficulty 1 / 2 / 3
and a seeded routine each, a track picker on the READY overlay), accuracy-driven body (clip blend: a clean hit plays the
step's full clip at speed 1, a GOOD plays it at 0.85 with a settle, a MISS plays a stumble beat — authored only where no
equivalent motion exists), results card (accuracy %, max combo, grade letter from stars). P4: already registered; confirm
dynamic import and no dead ends; bundle check. P5: tests for track selection, grade mapping, cue lane timing, Gate 0 in
dance. P6: local production build + `next start` verification; report, no deploy.

**Landed — Phases 1–5 (2026-09-06, commit after 6b31d5e; risk medium: shared timing host + HUD union touched):**
- P1 Gate 0: PASS unchanged (capture harness on `/dev/mode/dance` and `?track=battle`: FEL-FRAME 0 · MISSING CLIP 0 ·
  errors 0 · 60 fps · 132 draws · 44 meshes).
- P2: nothing to convert.
- P3 spec fill: `lib/babylon/core/danceTracks.ts` — three tracks (WARM UP 88 bpm · 12 bars · d1, THE CYPHER 96 · 16 · d2,
  BATTLE 112 · 16 · d3, fixed seeds so a retry is the same chart), a **pick screen** (d-pad / left stick cycles, A or B
  locks in, six-second auto-start on the default so a controller-less viewer still plays; `?track=<id>` deep link skips
  it), letter **grade** on the same bands as the stars, `bodySpeedFor` (PERFECT full-out, GREAT 0.95, GOOD 0.85, MISS =
  the hit-react clip replaces the move until the next beat), and the **cue lane** (`cueLane`: next six steps as markers
  coloured by move family with a two-letter glyph and the move name, 2.4 s lookahead, 0.2 s linger). `lib/babylon/audio/
  KitPulse.ts` — the FEL 808 kit (kick / clap / hat / open hat from `/audio/kits/808`) on the same audio clock and
  lookahead as the StemBand, one pattern per track (denser with difficulty), four audible count-in clicks. `DanceMode.ts`
  rewritten around a pick → count-in → playing phase machine; the count-in is armed on the first playing tick (on a deep
  link it used to be armed inside `load`, before the harness's own 3-2-1, and was spent before the player saw it).
  `DancePerformance.upcoming(now, n)` feeds the lane. HUD: `HudValue` gains `HudCue[]`; the shared timing host renders
  the lane only when a mode publishes `cues` (every other timing sport unchanged); results add `accuracy` and the proof
  line reads `… PTS · ★★★★☆ · 88% · GRADE A · ×14 COMBO` (grade derived from accuracy — stats stay numeric; widening
  them to strings broke five shipped hosts and was reverted).
- P4: already registered; the route is `next/dynamic`, `ssr: false`; no dead end (pick → count-in → routine → results →
  shell). **Bundle after 97e1641:** `/play/dance` First Load JS 159 kB (baseline 157 kB, **+1.3 %**); shared-by-all 89.9 kB
  (unchanged); the timing sports that share the host moved 158 → 160 kB. Under the +5 % ceiling. PASS.
- P5: 10 new tests (`danceTracks.test.ts`: three tracks/difficulties/tempos, seeded repeatability and difficulty ceiling,
  cycle/fallback/deep link, pick banner, grade↔star bands, body speed, lane windowing + order, lane off a live
  performance, kit pattern bounds/density). Suite 370 / 370, tsc clean.
- Verified on the real route: desktop 1440×900 `/play/dance?track=battle` mid-routine (lane above the pad, spin marker in
  the ring, shoulder bop approaching, "NOW — SPIN"), phone 430×932 pick screen (banner, d-pad, short instruction line).
- **P6 (local build + verify, no deploy — owner's rule):** `next build` on 97e1641 compiled (warnings only); `next start`
  on :3005 served `/play/dance?track=battle` and the same mid-routine frame as dev (cue lane, spin in the ring, shoulder
  bop approaching) with no dev panel; hashed chunks `Cache-Control: public, max-age=31536000, immutable`, pages and
  chunks `Content-Encoding: gzip` (a 10.6 kB chunk shipped as 4.2 kB); public audio (`/audio/kits/808/*.wav`) is Next's
  default `max-age=0` — a CDN rule if this ever deploys. `/dev/mode/<key>` has no canvas in production (dev-only runner),
  so the harness's 0/0/0 line comes from dev. Nothing pushed; nothing claimed live.
- Cut: none for 60 fps. Weak: the venue's pink floor glow washes the lower frame (venue look, not this mission); the
  dev runner prints HUD JSON instead of rendering the host, so the lane is only visible on `/play/dance`.

---

## Owner missions added 2026-09-06 (both unblocked)

**FreeRunMode — replaces GymnasticsMode.** Benchmark: Skate 3 trick-scoring model + Mirror's Edge traversal feel. Owner's
framing: free-running tricking is a Skate reskin at the systems level (trick input, difficulty × execution, combo chain,
bail on a bad landing), so the mission REUSES Skate's scoring engine by import/extract and never rewrites SkateMode; the
mode also builds the parkour movement tech (wall-kicks, slide jumps) that later Party Survival concepts need. Phases:
0 audit (Gymnastics files, registration pattern, Skate scoring internals — what is reusable vs needs a traversal variant,
Gate 0, vitest count, bundle) · 1 Gate 0 · 2 traversal core (momentum run, vault / slide / wall-run / wall-kick / cat leap
/ precision jump / landing roll, Havok on course geometry, momentum camera) · 3 trick + scoring (flips/twists/spins,
tricks off vaults/wall-kicks/drops, difficulty × execution × combo, clean/sloppy/bail, combo banks on a plain touchdown,
bail costs the uncommitted combo) · 4 one authored course, multiple routes, timed run + trick score, 3 tiers or courses ·
5 shell rename Gymnastics → FreeRun with no dangling refs · 6 green + tests (registration, course completion, scoring
math, Gate 0) · 7 local build + verify (deploy stays the owner's, per the standing rule).

**BrainBrawlMode — DOM deck → 3D.** Benchmark: Trivia Crack category wheel × Big Brain Academy graded cognitive minigames;
readability floor = TV at couch distance (Mario Party). Phases: 0 audit (deck files, registration pattern, reusable party
assets from Court Carnival / Who Scene It — stage, lighting, scoreboard, local-multiplayer input —, Gate 0 if a rigged
character stands on stage, vitest, bundle) · 1 spinnable 5-category wheel, claim state per player, all five = win · 2 five
challenge types as timed interactive minigames graded on speed AND accuracy (LOGIC, MEMORY, COMPUTE, ANALYZE, IDENTIFY;
3 tiers each; bank large enough that a match never repeats) · 3 duel (local head-to-head, same challenge, higher score
claims) + solo (composite score, personal best in localStorage only) + between-round scoreboard + results breakdown ·
4 Babylon stage in the shipped visual language, challenge UI legible over it · 5 shell integration by the exact pattern ·
6 green + tests (registration, wheel/claim machine, per-challenge scoring, match completion) · 7 local build + verify.
**Rules that matter most (owner):** content is GENERIC — nothing from The Neuro-Mechanic's Blueprint, no curriculum
integration; no spaced repetition, ghost duels or feed mechanics (Knowledge Feed territory); no backend/auth/db.

---

## Mission #2 — Who Scene It — PHASE 0 AUDIT (no code changes)

**Benchmark (locked):** Wii Sports Resort floor + Mario Party readability. **Spec source:** the pack's Who Scene It block
is not recoverable as raw text after the context compaction; the mission runs on its recorded summary — four scene
categories, local buzz-in for two or more players on one screen, rounds with a scoreboard between them — and says so here.

1. **Current implementation.** `lib/babylon/modes/WhoSceneItMode.ts` (127 lines, factory; live since lane 3 W1 on
   2026-09-06): eight questions in a row from `WHO_SCENE_IT_PACK` (or an approved community Scene Pack via `?pack=`),
   each question mounts its venue live (`mountVenue(sceneVenueId)`) behind the card while a slow orbit sweeps it; A/B/X/Y
   answer; `QuizCore.drawRound` + `scoreAnswer` (14 s clock, 120 base + 120 speed, streak ×1.25 steps to ×2.5). One
   player, no categories, no scoreboard, no rounds. Host `components/games/who-scene-it-babylon.tsx` draws the card and
   four answer buttons (also the pad's faces); results through GameShell (`SCENE MASTER` / `ROUND OVER`).
2. **Registration pattern.** Same as Dance: `MODES.who_scene_it` + `ENABLED_BABYLON_MODES`, route `/play/who-scene-it`
   behind the `whoSceneIt` flag, dynamic import, pad verbs A B C D.
3. **Reusable party assets.** `QuizCore` (scoring, seeded draw), `QuizRound` (the AI-foe duel used by the 2D Brain Brawl —
   not two humans), `HudScoreCard[]` + the bezel pattern the dunk contest and 3PT use for a scoreboard, `mountVenue` for
   every category's scenes, `SoundKit`/`juice.flash`/`feel.impact`. Local multiplayer input: `InputBus` is one keyboard
   map + one gamepad index; a second human can share the keyboard (arrows = d-pad) but there is no second pad.
4. **Gate 0.** No rigged character on stage (the frame guard's subject is an anchor node). N/A, no rig work.
5. **Vitest.** 370 / 370 (+8 with `SceneBuzz.test.ts`, written in Phase 0 as pure code, not imported yet). Bundle baseline
   from mission #1 stands (shared 89.9 kB; `/play/who-scene-it` measured at Phase 4).

**Gaps against the spec (Phase 3 scope):**
- Four categories: **gap** → `lib/babylon/core/SceneBuzz.ts` `SCENE_CATEGORIES` COURTS / COMBAT / OUTDOORS / STAGES keyed
  on `sceneVenueId`; `buildRounds` = one round per category, two questions each, seeded, options shuffled.
- Local 2+ buzz-in: **gap** → `BuzzMatch`: first correct buzz locks, a wrong buzz locks that player out and the other can
  steal, both wrong or the clock = nobody. P1 = face buttons, P2 = d-pad (▲ ▶ ▼ ◀ = A B C D). Two players max (one bus).
- Rounds + scoreboard: **gap** → the round's top scorer claims the category; a scoreboard (`board` HudScoreCard rows)
  between rounds; results carry both scores and the winner.
- Readability: **partial** → bigger prompt and answer cards, a category chip in the category's colour, round label.
- Content: 9 questions cover the four categories thinly (2/2/2/3) → add venues the pack never asked about (tennis,
  volleyball, golf, skatepark, pitch, gridiron, diamond).

**Cut risk (60 fps):** none — HUD and content; the venue mounts are the existing per-question mounts. Weak spot known
from W1: the wide sweep on Venice measures ~933 draws against the 600 budget (venue lane, not this mission).

**Landed — Phases 1–5 (2026-09-06 evening; risk medium: the mode is rewritten around `SceneBuzz`, the host gains the
scoreboard / player-count overlays, `quizPacks` gains four venues, `proofLine` a case):**
- P1 Gate 0: N/A (no rig). P2: nothing to convert.
- P3: `lib/babylon/core/SceneBuzz.ts` (pure, 8 tests) — `SCENE_CATEGORIES` COURTS / COMBAT / OUTDOORS / STAGES, `buildRounds`
  (one round per category with questions, two questions each, seeded, options shuffled), `BuzzMatch` (first correct buzz
  locks, a wrong buzz locks that player out and hands the steal over, everyone wrong or the clock = nobody; the round's top
  scorer claims the category, ties claim nothing; `scoreboard()` rows in HudScoreCard shape; `leader`). `WhoSceneItMode.ts`
  rewritten: a player-count screen (◀ ▶ picks 1 or 2, any face starts, 6 s auto-start, `?players=2` skips it), P1 on the
  faces and P2 on the d-pad (▲ ▶ ▼ ◀ = A B C D), the round's category chip + `ROUND n / 4`, the between-rounds SCOREBOARD
  (3.2 s, names who took which category and what round comes next), results with both scores and the winner; the proof
  line reads `6/8 SCENES · 640 PTS · WON` solo and `300–520 · P2 TAKES IT` in a duel. Host: bigger prompt and answer cards
  (Mario Party size), the d-pad glyph on each card in a duel, P1 / P2 score chips, `P1 OUT` / `P2 OUT` chips, the clock
  only while a question runs. Content: `ws13–ws16` (Center Court, Sovereign Links, Gridiron Sovereign, Pro Diamond).
- P4: registered as before; no dead end (pick → rounds → board → results → shell). **Bundle after cc68ede:**
  `/play/who-scene-it` First Load JS 160 kB (baseline 158 kB, **+1.3 %**); shared-by-all 89.9 kB unchanged. PASS.
- **P6 (local build + verify, no deploy):** `next build` on cc68ede compiled (warnings only); `next start` on :3005 served
  `/play/who-scene-it?players=2` (gzip on the page) and rendered the first two-player card. Nothing pushed, nothing live.
- P5: `SceneBuzz.test.ts` (8) + proof-line cases; suite **379 / 379**, tsc clean.
- Verified: dev runner solo (pick screen → question 8 / 8, 60 fps, 0 / 0 / 0) and `?players=2` (P1 locked out, "P2 can
  steal" banner, into round 2, 57 fps, 0 / 0 / 0); real route 1440×900 first card (COURTS chip, ROUND 1 / 4, P1 / P2 chips,
  four big cards with ▲ ▶ ▼ ◀) and the scoreboard between rounds 1 and 2.
- Cut: none. Weak: two players max (one InputBus, one keyboard); touch players are solo; the board keeps the last
  question's venue behind it (a flat pitch reads plain from the sweep height).


---

## Mission #3 — Court Carnival — PHASE 0 AUDIT (no code changes; written while the mission #2 sweep ran)

**Benchmark (locked):** Wii Sports Resort floor + Mario Party readability. **Spec source:** as for mission #2, the pack's
Carnival block is a recorded summary, not raw text: a party hub of minigames, a rival that plays rather than rolls, a
scoreboard, readable from a couch.

1. **Current implementation.** `lib/babylon/modes/CourtCarnivalMode.ts` (165 lines): a night = a random FOUR of six
   events (`carnivalEvents.ts`, 349 lines: SLAM RUSH, STRIKE STORM, TRICK GAUNTLET, HOT SHOT, COIN STORM, COUNTER STRIKE;
   each 15–20 s of one verb, built from owned systems — VenueKit courts, boardCore, aimSwingCore, CoinField). Reveal card →
   play → result card (`YOU n · RIVAL m`) → finale (`CARNIVAL CHAMPION` / `RIVAL TAKES THE CARNIVAL`), watchdogs on every
   phase. Host `components/games/carnival-babylon.tsx`, route `app/play/carnival`, verbs GO / TRICK / POWER / CHARGE.
2. **Registration pattern.** `MODES.carnival` + ENABLED, flag `carnival`, dynamic import — the standard.
3. **Reusable assets.** Everything the events already use; `HudScoreCard[]` for a scoreboard; `SceneBuzz`'s two-player
   input split (P1 faces / P2 d-pad) from mission #2 for a second human; `mountVenue('court_carnival')` — the venue spec
   exists ("Game Night", Carnival Court) but the mode never mounts it; each event paints its own VenueKit floor instead.
4. **Gate 0.** Rigged bodies on stage: PASS by the sweep (carnival 0 / 0 / 0, 60 fps, 101 draws, 42 meshes).
5. **Vitest / bundle.** 378 / 378 at this audit; bundle baseline stands.

**Faults seen in the sweep frame (STRIKE STORM, 5 s left):** the mode spawns a hero at (−2, 0, 0) and a rival at (2, 0, 0)
at load as party-goers, and the event spawns ITS OWN player — the hero body appears twice in frame. The rival never plays:
its score is `rivalRange` × random. The stage is whatever the event paints; no Carnival Court, no crowd, no scoreboard
between events beyond a banner line.

**Gaps against the spec (Phase 3 scope):** a rival that plays (drive the rival body through a scripted attempt per event
so the number has a body, or a second human on the d-pad taking turns), a between-events scoreboard (HudScoreCard rows),
the Carnival Court mounted as the hub with the events dressing it rather than replacing it, one body per role (the event
reuses the mode's hero instead of spawning another), and readable event cards (title + one-line verb + countdown at couch
size).

**Cut risk (60 fps):** the hub venue plus event props may push the wide shots past the 600-draw budget — measure before
keeping both.

**Landed — Phases 1–5 (2026-09-06 night; risk medium: the mode is rewritten on per-scene state, the host gains
overlays; every event is byte-identical):**
- P1 Gate 0: PASS (rigged bodies on the hub and in every event; captures 0 / 0 / 0). P2: nothing to convert.
- P3: `lib/babylon/core/CarnivalNight.ts` (pure, 3 tests) — seeded `pickNight`, `rollRival`, `rivalProgress` (smoothstep:
  the rival's points tick onto the board through the event, not at the end), `bankEvent` (ties claim nothing),
  `nightChampion` (points, then events won, then the host keeps the crown), `nightBoard` rows. `CourtCarnivalMode.ts`
  v3: a player-count screen (◀ ▶, any face starts, 6 s auto-start, `?players=2` skips it); **pass-and-play** for two —
  P1 plays, `P2 — YOUR TURN` handoff, the same event rebuilds, P2 plays, the result compares; solo keeps the rolled
  rival but shows it **playing live** (`RIVAL 64 +64` ticking); **one body per role** — the party-goers on the hub are
  hidden while an event runs (each event spawns its own player) and come back to react on the result; the **hub** is the
  Carnival Court (Venice location) mounted for reveal / handoff / result / finale and disposed while an event runs, a
  follow camera around the court's centre looking at the two actor spots; a **scoreboard** between events (who took
  which event, what comes next) and readable reveal cards (title + one-line verb). Host: P1 / P2 labels, the live rival
  delta, a turn label with the clock in a duel, the card + blurb + board overlay.
- Three faults found and fixed on the way, each measured on `/play/carnival` frames: (1) an event built inside `load()`
  had its camera reset by the harness's start-of-play step → nothing is built before the first PLAYING tick; (2) the
  hub merely hidden left its late map-load camera snap on the sky → the hub is mounted / disposed per phase; (3) the
  route host mounts twice (strict mode) and the two `load()`s interleave — module-level state let the phantom's hub win
  → all state is per scene (`WeakMap<Scene, St>`), `dispose()` finds the departing instance by `scene.isDisposed` on the
  next tick and keeps the ambient bed while another instance is live. A fixed hub camera also failed (the frame guard
  measured it aimed away) → follow preset around a still anchor.
- The headless source check (`carnival-depth-tests.ts`) still holds: `rivalTookIt` names the reaction's branch.
- P4: registered as before; the lineup page (`/play/carnival`) still starts a night; `?carnival=1` drops into the mode.
  **Bundle after 2679f80:** `/play/carnival` First Load JS 191 kB (baseline 188 kB, **+1.6 %**); shared-by-all 89.9 kB
  unchanged. PASS.
- **P6 (local build + verify, no deploy):** `next build` on 2679f80 compiled (warnings only); `next start` on :3005 served
  `/play/carnival?carnival=1&players=1` with gzip and rendered event one on the production build. Nothing pushed,
  nothing live.
- P5: `CarnivalNight.test.ts` (3); suite **382 / 382**, tsc clean.
- Verified: dev runner solo (pick → event 2 with the rival ticking, 60 fps, 0 / 0 / 0) and `?players=2` (P1 turn → handoff
  → P2 turn → a 32–32 tie banked, 60 fps, 0 / 0 / 0, frame guard silent); route frames: pick screen and reveal card on
  the hub with both party-goers, TRICK GAUNTLET mid-event with `RIVAL 31 +31`, COIN STORM as event 2, COUNTER STRIKE
  scoreboard frame with one body per role.
- Cut: none. Weak: the hub is the Venice map (heavy on load: 35–41 fps during the first seconds on the route, 60 fps in
  play); the second human shares the keyboard; the between-events board holds 3.2 s with no skip.


---

## Owner benchmarks confirmed 2026-09-06 (one round)

| Mission | Mode | Benchmark (owner) |
|---|---|---|
| #4 | 3PT Shootout | **both** the Wii Sports Resort 3-point contest (readability) **and** NBA 2K's three-point contest (structure) |
| #5 | Golf | Everybody's Golf feel + Wii Sports Resort readability |
| #6 | Tennis | Mario Tennis feel + Wii Sports readability |
| #7 | Baseball (derby) | Wii Sports baseball contact + MLB Home Run Derby presentation |
| #8 | Soccer (penalty) | FIFA penalty shootout feel + Wii-style readability |
| #9 | Football (rush) | Tecmo Bowl feel + Madden readability |

## Mission #4 — 3PT Shootout — PHASE 0 AUDIT (no code changes; written while the cd741a5 sweep ran)

1. **Current implementation.** `lib/babylon/modes/ThreePointMode.ts` (629 lines): the 2K structure is already there —
   5 racks × 5 balls on the real arc radii (corner shorter than the top), the money ball last on each rack worth 2 (30 max),
   a 60 s clock, a release bar (period 1.15 s, sweet spot 0.72, PERFECT ±0.06 / GOOD ±0.16 with a 55 % make chance), a
   six-shooter field of fictional rivals (`simulateRival`: qualifying centre 12.5 + skill × 5, final 14 + skill × 5),
   qualifying → top three → final, staged standings reveal (weakest first), tiebreak playoffs, the live `NEED n TO WIN`
   number when the player shoots last. Juice: score pop, impact, crowd on money / streak ≥ 4, groan on a bricked money ball.
   Host `components/games/three-point-babylon.tsx` + Controller Link lobby (phone tilt = wind-up). Verb: A SHOOT.
2. **Registration pattern.** `MODES.threepoint`, route `/play/threepoint` (+ `/dev/threepoint`), dynamic import. Standard.
3. **Reusable assets.** Everything in the file; the roster rivals spawn as real bodies (`rivalBodies`) but **never
   animate** — they stand behind the line while their numbers post; `HudScoreCard[]` standings board; `ctx.juice` /
   `camDirector.pulse`; `proofLine` case `threePoint`.
4. **Gate 0.** PASS (sweep `threepoint`: 60 fps, 589 draws, 200 meshes, 0 / 0 / 0).
5. **Vitest / bundle.** 382 / 382; `/play/threepoint` to be measured at Phase 4 against the baseline build.

**Gaps against the owner's double benchmark:**
- **Wii readability**: the HUD is 10–12 px mono in the top-left corner and the release bar is 176 × 12 px — unreadable from a
  couch. Wanted: a big centre score + clock, a wide release meter under the shooter with the sweet band, rack progress
  pips (five racks × five balls, money ball gold), a MONEY BALL callout, make / miss at banner size.
- **2K rivals**: the field's numbers appear on a board; the bodies never shoot. Wanted: each rival's body plays a
  jumpshot (and the rim nets) as its number posts in the staged reveal, so the contest is watched, not read.
- **Heat**: streak ≥ 4 already pulses the camera; an ON FIRE callout + a hot ball read is the 2K tell.
- Everything else (racks, money ball, rounds, need, tiebreaks) is in place and stays byte-identical.

**Cut risk (60 fps):** none — HUD and clip triggers on existing bodies.

## Mission #5 — Golf — PHASE 0 AUDIT (no code changes)

**Benchmark (owner):** Everybody's Golf feel + Wii Sports Resort readability.

1. **Current implementation.** `GolfMode` in `lib/babylon/modes/precisionModes.ts` (lines ~230–620): the three pillars are
   in — three clubs (driver / iron / wedge: reach, launch, forgiveness) + an automatic putter inside 9 m, a **three-press
   swing** (A starts, A at the top locks power, A in the accuracy band 0.28 ± 0.10 strikes; a stick pull-and-drive
   alternative), per-hole **wind** applied through the flight and shown by the pin flag, three holes with par 3 / 4 / 3,
   strokes against par with a running card (E / +n), out-of-bounds penalty, triple-par pick-up (owner rule 2026-09-05),
   a hole preview flyover, a gallery at the green. Venue `golf_loop` under the kit green.
2. **Registration pattern.** `MODES.golf`, route `/play/golf` via `makeTimingHost({ modeKey: 'golf' })` — the SHARED
   timing host (tennis, derby, penalty, dance). Verbs A SWING · B CLUB.
3. **Reusable assets.** All of the above; `aimSwingCore` (Reticle, PowerMeter, Flight); `HudScoreCard[]`; the host's
   optional-block pattern from mission #1 (a block renders only when a mode publishes its key).
4. **Gate 0.** PASS (sweep `golf`: 0 / 0 / 0 at 60 fps).
5. **Vitest / bundle.** 382 / 382 (+4 shootoutHud pending); `/play/golf` measured at Phase 4.

**The gap — the HUD is published into the void.** The mode publishes `club`, `wind`, `pin`, `power`, `strokes`, `card`
every shot; the shared timing host renders **none of them** (it draws round / score / combo / energy / shotType / contact /
banner / nextStep). On the couch the player sees a score, a banner and a hint line. Everybody's Golf's whole read — which
club, how far, which way the wind, where the power locked, the swing band — is missing, as is any scorecard.

**Phase 3 scope:** additive, key-gated blocks in the shared host (no other sport changes): a lie panel (club · pin
distance · wind speed with a bearing arrow), a drawn three-press swing meter (power lock + accuracy band from the mode's
own constants), a hole chip (HOLE n / 3 · PAR · STROKE · card), and a scorecard board between holes (ACE / EAGLE /
BIRDIE / PAR / BOGEY names). Mode side: publish `windDeg`, `meterT` + `swingPhase`, `hole` + `par`, and `board` rows at
the hole's end. Pure helpers + tests in `core/golfHud.ts`. **Cut risk:** none (HUD only).

## Mission #6 — Tennis — PHASE 0 AUDIT (no code changes)

**Benchmark (owner):** Mario Tennis feel + Wii Sports readability.

1. **Current implementation.** `TennisMode` = `createNetSportMode` in `lib/babylon/modes/NetSportMode.ts` (662 lines, shared
   with volleyball): rally arithmetic in `RallyCore` (Babylon-free, tested); four shots on the faces (A DRIVE · B SLICE ·
   X DROP · Y LOB) graded PERFECT / GOOD / LATE by timing; `TennisScore` games with deuce / advantage, match at 4 games;
   an energy gauge that pays for a ZONE SHOT; three RACKETS as stakes (lose them all and the match ends); a point streak
   with pops at the net; the opponent reacts to points. HUD published: `score`, `foeScore`, `callout` (the umpire call),
   `energy`, `rackets`, `foeRackets`, `shotType` (`DRIVE · PERFECT`), `banner`.
2. **Registration pattern.** `MODES.tennis`, route `/play/tennis` via the shared timing host. Standard.
3. **Reusable assets.** All of the above; `RallyCore.planShot` knows the shot in flight; the host's key-gated blocks.
4. **Gate 0.** PASS (sweep `tennis`: 0 / 0 / 0 at 60 fps, mobile tier too).
5. **Vitest / bundle.** green; `/play/tennis` measured at Phase 4.

**Gaps against the benchmark:**
- **Readability:** the host renders `score` and `energy` / `rackets` / `shotType` but **not** `foeScore` or `callout` —
  the games are one number with no opponent, and the umpire's `40-30 / DEUCE / AD IN` never shows. A couch scoreboard
  (YOU n – n THEM, the call, the streak) is the Wii read.
- **Tells (Mario Tennis):** the incoming ball carries no tell; the four shots are chosen blind. Publish the shot in flight
  (`incomingShot`) and the answer that beats it, so the choice reads as a choice.
- **Rally speed-up:** the rally's pace is flat across a long exchange; Mario Tennis speeds the ball as the rally grows.
  Small, config-side in `RallyCore` (Babylon-free, testable).
- Tiebreak: the match is first to 4 games with win-by-two inside games only; a 3–3 goes to whoever takes the next game.
  Fine for a party match; noted, not built.

**Cut risk:** none (HUD + one pace curve).

## Missions #7–#9 — PHASE 0 AUDITS (no code changes)

### #7 Baseball (Home Run Derby) — Wii Sports baseball contact + MLB Home Run Derby presentation
`DerbyMode` in `precisionModes.ts` (from line ~670): ten pitches; a **PCI** (plate-coverage reticle the stick moves,
contact quality = overlap, PURE / OFF-CENTRE / EDGE), pitch variety with a movement read (fastball, slider breaking late,
changeup taking speed off; the pitch aims at the pre-break spot), a pitcher body with two pitch clips, a ballpark with
foul poles and a distance band that a homer clears, a clutch final pitch. HUD: `round` (`n/10`), `pitch` (label),
`contact`, `score`, `hint`, dev `pci`. The shared host renders `round`, `score`, `contact`, `banner`, `hint`.
**Gaps:** no **outs** structure (a derby is outs, not a fixed count), no **distance readout** per homer, no **rival total**
(the presentation half of the benchmark), the pitch label (`FB` / `SL` / `CH`) is not rendered. **Scope:** outs (a non-homer
swing is an out; ten outs or the pitch cap ends the round), distance in feet on every homer with a longest-shot chip, a
rival round posted alongside (rolled and ticking, the Carnival pattern), the pitch label chip, a homer count board.

### #8 Soccer (Penalty shootout) — FIFA penalty shootout feel + Wii-style readability
`PenaltyMode` in `precisionModes.ts` (last block): aim + two-press power, a keeper who **reads your placement history**,
street **feints** (max 2: the keeper guesses wrong more, the shot wobbles more, style points paid on a goal), alternating
kicks with the **keeper round** (you dive at their run-up tell, `KeeperCore` judges; owner decision 2026-09-03),
regulation kicks then **sudden death** capped at five rounds with STYLE deciding a level tie (owner decision 2026-09-05),
a pressure line (`SCORE OR YOU ARE OUT`). HUD: `round` (`KICK n/5` / `SUDDEN DEATH`), `feints`, `power`, `score`,
shootout numbers (`THEM`, `pressure`, `numbers`, `decidedBy`), `banner`, `hint`. The shared host renders `round`,
`score`, `banner`, `hint` only.
**Gaps:** the **shootout board** (both sides' kicks as ✓ / ✗ pips, the FIFA read) never renders; `feints` and `power`
never render; the keeper round has no on-screen dive prompt beyond the hint. **Scope:** a kicks board (key-gated), a feint
counter chip, the two-press power bar (the golf meter block reused with a different band), a DIVE prompt with the
run-up tell's timing, keep everything else byte-identical.

### #9 Football (Rush) — Tecmo Bowl feel + Madden readability
`FootballRushMode.ts` (421 lines) with its own host `football-babylon.tsx`: three drives, downs and yards to go, a
pre-snap set defense with a **show-blitz disguise**, juke / spin / hurdle / **truck** (a 0.5 s window that knocks the
defender down, 2.5 s cooldown), a **style chain** for stringing different evades, breakaway speed after three evades,
sideline banks. HUD rendered by its host: `down`, `toGo`, `yards`, `evades`, `score`, `truckReady`, `breakaway`, `banner`,
`hint`. **Gaps:** the read is Madden-thin — no **yard-line / field-position** readout (where the ball is on the 40-yard
field), no **drive summary** between drives (yards, evades, result), no **defense read** beyond the blitz banner (which
defender is the one to beat), no **scoring drive loop** feedback (the touchdown celebration and the next drive's start
are a banner). **Scope:** a field-position strip (ball marker on a 0–40 bar with the first-down line), a drive card
between drives, a TARGET chip naming the nearest defender's angle, a touchdown beat; mechanics byte-identical.
