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
  shell). Bundle re-measured after the commit (below).
- P5: 10 new tests (`danceTracks.test.ts`: three tracks/difficulties/tempos, seeded repeatability and difficulty ceiling,
  cycle/fallback/deep link, pick banner, grade↔star bands, body speed, lane windowing + order, lane off a live
  performance, kit pattern bounds/density). Suite 370 / 370, tsc clean.
- Verified on the real route: desktop 1440×900 `/play/dance?track=battle` mid-routine (lane above the pad, spin marker in
  the ring, shoulder bop approaching, "NOW — SPIN"), phone 430×932 pick screen (banner, d-pad, short instruction line).
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
