# The look pass: the audit and the plan (lane/look-audit, 2026-11-24)

**Owner, 2026-11-24 (verbatim):** "Let's do a pass where we improve how things look."

This file is the audit and the plan only. Nothing in the app was changed by this lane; three build lanes build the phases. Every
finding names the picture it comes from. Base: `lane/finish-release` at `c905f074` (#696). The pictures are in the session scratch
folder (§9); the contact sheets are named `look-before-<area>-<size>.jpg`.

---

## 0. The answer in one paragraph

The game's best moments already look good — the hoops courts held sideways on a phone or on a desktop (a sunset over the Venice
boardwalk, the lit court, the sharp TV-style HUD), the home page and sign-in, the 3-Point results card. **What hurts most is what
sits on top of the game on a phone held upright, and the places the pass has never reached.** On an upright phone, **a fifth of the
screen is a three-row header of tools** (PRQ "— · NOT MEASURED", a graphics drop-down, full screen, BODY, pause), and **the action
buttons, hints and toasts sit right on top of the players** — in 1v1 the two players are hidden behind SHOOT / TURBO / CHARGE, and
the Dunk stacks **eleven HUD pieces** over the court with a two-line commentary caption across the hoop. Phones draw **with no
anti-aliasing at all** (FXAA is skipped above 1.5 device pixels per CSS pixel and multisampling is desktop-only), so bodies, palms
and court lines stair-step. **The story's world is still washed-out flat blocks** (its dressed version exists but ships off), **the
Physics Arena is a court in an empty void**, and **Venice, the Coast, the story and the arena all load on a black screen with one
line of small text**, straight after the branded hoops loading cards. Most of this is code, CSS and layout with the art the repo
already has; the list of what really needs the owner's art (§7) is short: creature and boss bodies, crowd variety, the garment
shapes at the shoulders, and the arena's own set.

---

## 1. How it was measured

**The rig.** The real app: one production `next build` (`NEXT_DIST_DIR=.next-look`) served by `next start` on this lane's port
3911, against a local throwaway Postgres (127.0.0.1:55531) — the every-screen rig (`scripts/every-screen/rig.mts`) — signed in as the
rig's players through the real routes. Chromium 1243 (`/opt/pw-browsers`), 3D drawn by SwiftShader. Every browser run held the
shared gate lock (`/home/user/wt/gate-run.sh`), one hold at a time; the build was deleted after.

**The instrument** (in the repo, `scripts/probes/look-audit/`):
- `look-walk.mts shots --tier=portrait|landscape|desktop` — the screens players see most, at **390×844 upright phone** (touch,
  DPR 2), **844×390 sideways phone** (touch, DPR 2) and **1280×720 desktop**, no CPU throttle (the pictures are what is judged here).
  A page: the screen at rest and its full length. A game: its loading card (3.5 s after opening), its READY screen, 3 s into play,
  and 6 s later after the stick and an action button were pressed. 3-Point is played on to its end card (the results screen every
  mode shares). Venice, the Coast, the story (partner picker → READY → play) and the Physics Arena (all three sports) the same way.
- `look-walk.mts perf` — the owner's own PERF readout (`lib/babylon/core/perfReadout.ts`, opened through its PERF tab as the rig's
  admin, `FEEL_PANEL_ENABLED=1` on the rig only) on the phone tier (390×844, DPR 3, touch, CPU slowed 4×): draw calls, active meshes,
  texture MB, frame p50 / p95, JS work per frame.
- `look-walk.mts shots --only=<id>-ibl | <id>-perfoff | … --feel=<knob>:<value>` — A/B pictures of look lifts that already exist
  but ship off (the prefiltered sky light `?vq=ibl`, the dressed story `story.worldDressed`), and of the scene at full render scale.
- `sheets.mjs` — the contact sheets, one per area and size, the same tiles in the same order, so an "after" sheet lines up with this
  one.
- `run-all.sh` — every job above, each in its own gate hold.

**What the rig can and cannot say.**
- *Pictures:* what a player sees, at the three sizes, at real moments of play. **One caveat that matters:** on SwiftShader the
  game's own perf guard (`lib/babylon/core/perfGuard.ts`) steps every 3D place down to a render scale of **0.6–0.75** within the
  first seconds (its `[FEL-PERF]` lines, read on every run), and the control (tennis) too. A phone that keeps up stays at 1. So the
  rig's pictures are **softer than a phone's**; the `-perfoff` A/B (`?perf=off`, full scale) is the fair picture for edges and
  texture detail. Every phase takes its before/after with `?perf=off` (§4) so the guard cannot make one side look worse.
- *Frame time:* **the rig cannot give a phone's frame rate** (IMPROVE-10-PHASE-AUDIT §1: every 3D place drew 1–5 fps here, the
  control included). Frame times are read only against the control in the same hold. Draw calls, meshes and texture MB are the same
  numbers a phone pays, and `lib/babylon/config/mobileBudget.json` (the repo's measured phone budget, `_perf-sweep.mts`) holds each
  mode's row with 20 % headroom; that and the owner's PERF readout on a real phone are the judges.
- *Not measured:* a real phone; the production deploy; colour on a calibrated screen; TVs.

---

## 2. What the pictures show (the areas)

| Area | Contact sheets (scratch, §9) | In a sentence |
|---|---|---|
| First run | `look-before-1-first-run-{portrait,landscape,desktop}.jpg` | Home and sign-in look finished; **/try is a bare form on black** between them and the game; /play's top is two header rows and six wrapped chips before a game. |
| Menus | `look-before-2-menus-*.jpg` | One dark card language, consistent; the header is two rows on a phone with **an empty level ring and a dash**; /store and /groups are text on black; the Closet's shirt edges look torn. |
| Hoops 1v1 / 3v3 | `look-before-3-hoops-1v1-3v3-*.jpg` | **Sideways and desktop: good.** Upright: a three-row header, the buttons over the players, hints over the hoop, a ghost d-pad. |
| Hoops 3-Point / Dunk | `look-before-4-hoops-3pt-dunk-*.jpg` | The results card is the best screen in the game; **the Dunk's HUD is eleven pieces** over the court; the "USB controller?" chip sits on the loading card's venue line. |
| Physics Arena | `look-before-5-physics-arena-*.jpg` | A court in a void: a pink gradient, a grey band for a horizon, nothing else; its "3-Point" tab wraps on an upright phone. |
| Story and zones | `look-before-6-story-zones-*.jpg` | **The story is pale flat blocks**, its creatures are coloured dots, its READY screen is a wall of control tables; Venice and the Coast load on black. |

---

## 3. The findings, ranked by need

**Need = how many players see it (5 = every phone player in every game … 1 = rarely) × how bad it looks (5 = looks broken or
unfinished … 1 = polish) ÷ cost (S = 1, M = 2, L = 3).** "Art" says whether the owner's art (GATE 0, Grok / Meshy / in-house Blender)
is needed, or whether code, CSS, lighting, materials or post-processing can do it with what ships. "Phone risk" is the frame-time
risk of the fix (none = DOM / CSS only; low = no new per-frame GPU work; medium = a new pass or more draws; high = new geometry or
textures in a budget row near its ceiling).

| # | What it looks like (picture) | Why it hurts | Seen by (visibility) | Bad | Size | Need = vis × bad ÷ cost | Art? | Phone risk |
|---|---|---|---|---|---|---|---|---|
| 1 | **The Dunk's HUD covers the court.** Upright: score, round, dunk count, a 4-line leaderboard, NO PROP, SPECIALS · SEASON PASS, POWER / HYPE meter, MIX / MC / CC, a 3-line italic commentary caption across the hoop, HOLD, four action buttons, the d-pad, two sticks — eleven pieces, the hoop boxed in between the leaderboard and the caption (`b1-portrait-dunk-c-play.jpg`, `-d-play.jpg`). Sideways it fits (`b1-landscape-dunk-d-play.jpg`). | Clutter; the hoop and the jumper — the whole point of the mode — are the least visible things on screen. The Dunk is the guest's first game. | every Dunk on a phone, every first visit (4) | 4 | S | 4 × 4 ÷ 1 = **16** | no | none |
| 2 | **The game header eats a fifth of an upright phone.** Three rows: Home · title; pause · BODY · PRQ "— · NOT MEASURED"; the graphics drop-down "Auto" · full screen — 165 of 844 px, before the stage's own padding (`b1-portrait-onevone-d-play.jpg`, every upright game). Sideways and in full screen it is already gone. | Developer tools on the first screen; the court starts a third of the way down; "NOT MEASURED" reads as an error. | every game on an upright phone (5) | 3 | S | 5 × 3 ÷ 1 = **15** | no | none |
| 3 | **The touch deck and the hints sit on the players (1v1 / 3v3 upright).** SHOOT / TURBO / CHARGE / BLOCK and their HOLD labels are drawn over the two players; "TAP THE STICK TO JAB · SHOOT" and "NO TEAMMATE TO SCREEN" sit across them, the toast half under the buttons; HOLD collides with BLOCK's ring; a dashed ghost d-pad is drawn for 1v1, which reads no d-pad; the "⋯" menu overlaps the score (`b1-portrait-onevone-d-play.jpg`, `b1-portrait-threevthree-d-play.jpg`). | You cannot see your own player; overlapping text looks broken. | every 1v1 / 3v3 on an upright phone (5) | 5 | M | 5 × 5 ÷ 2 = **12.5** | no | none (DOM) / low (camera) |
| 4 | **The hubs, the story and the arena load on black.** "Heading to the courts…", "Sailing to the coast…", "Building the arena…" in one line of small grey text on black for 9–19 s on the rig (`b1-portrait-venice-a-loading.jpg`, `-coast-a-`, `-arena-hoops-a-loading.jpg`, `-adventure-a-`), while every hoops game has the branded card (`b1-portrait-onevone-a-loading.jpg`). | A jarring drop in finish at the moment a player is deciding whether to wait. | every Venice / Coast / story / arena visit (4) | 3 | S | 4 × 3 ÷ 1 = **12** | no | none |
| 5 | **/try, the first-run's dip.** After the photo home page, the guest's birth-date step is a bare form on black with 60 % of the screen empty and a two-line "GUEST · NO ACCOUNT NEEDED" badge (`b1-portrait-try.jpg`); the same question on /signup gets the card, the logo and the glow (`b1-portrait-signup.jpg`). Sideways, the home page's headline fills the screen and PLAY NOW is below the fold (`b1-landscape-home.jpg`). | Inconsistent style on the most-seen first-run screen. | every first visit from the home page (4) | 3 | S | 4 × 3 ÷ 1 = **12** | no | none |
| 6 | **Phones draw with no anti-aliasing.** The mobile tier skips FXAA above 1.5 device px per CSS px (`QualityTier.ts` `fxaaMaxDpr: 1.5`) and multisampling is desktop-only (`msaaSamples: 1`), so on every DPR-2/3 phone the bodies' outlines, the palm fronds, the rim and the court lines stair-step and crawl as the camera moves (`b1-portrait-onevone-d-play.jpg`, `ab-portrait-onevone-perfoff-d-play.jpg` at full scale). When the phone's perf guard drops the render scale it gets worse. | Aliasing on every edge, in every 3D mode on a phone. | every 3D mode on a phone (5) | 3 | S–M | 5 × 3 ÷ 1.5 = **10** | no | **medium** (one full-screen pass, or 2× MSAA on the HDR target) |
| 7 | **/play on a phone opens on chrome, not games.** "FEL" alone on one row, then the wallet chips and **an empty level ring with a dash** on a second; a "+100 coins" toast over the header; six wrapped chips (PROVE IT DUNK DUEL · VENICE BEACH · PHYSICS ARENA · COUCH MULTIPLAYER · VERSUS · MEASURE · SCREEN) with ragged rows; the first game family starts at 1,330 of 1,688 px; the family icons are plain shaded balls (`b1-portrait-play.jpg`, `-full.jpg`). Sideways only the hero photo shows (`b1-landscape-play.jpg`). The same two-row header and empty ring are on every menu page (`look-before-2-menus-portrait.jpg`). | Empty-looking placeholder ring; the picker is below the fold. | every signed-in session (5) | 2 | S | 5 × 2 ÷ 1 = **10** | no | none |
| 8 | **The story's first screens.** The partner picker shows each creature as a coloured dot; the READY screen is a dense monospace table of every control (`b1-portrait-adventure-b-first.jpg`, `-b-ready.jpg`). | Placeholder art; a wall of text where a title card should be. | every story start (3) | 3 | S | 3 × 3 ÷ 1 = **9** | creature art (§7) | none |
| 9 | **The "USB controller? Plug it in…" chip is drawn over the loading card's venue line** (Dunk, 3-Point; `b1-portrait-dunk-a-loading.jpg`, `b1-portrait-threepoint-b-ready.jpg`). Found by IMPROVE-10-PHASE-AUDIT #23; improve-screens phase 6 left it (it lives in `components/controller-link/host-lobby.tsx`, anchored by `dunk-babylon.tsx`). | Overlapping text on the first card a guest sees. | every Dunk / 3-Point load on a phone (4) | 2 | S | 4 × 2 ÷ 1 = **8** | no | none |
| 10 | **The end card's title wraps with an orphan.** "SHOOTOUT COMPLETE · 6 PTS VS / 19" on an upright phone (`b1-portrait-threepoint-e-end.jpg`). | Misaligned headline on the most rewarding screen. | every results screen on a phone (4) | 2 | S | 4 × 2 ÷ 1 = **8** | no | none |
| 11 | **The prefiltered sky light is built and off.** `venue.iblEnvV1` (CC0 Poly Haven HDRIs, `lib/babylon/scene/venueQualityV1.ts`) lights the hoops sets from a real sky instead of the procedural cube; `?vq=ibl` shows it (`ab-desktop-onevone-ibl-d-play.jpg` against `b1-desktop-onevone-d-play.jpg`). | Flatter, less grounded light on skin and the ball than it could have, with the files already shipped. | every hoops game (4) | 2 | S | 4 × 2 ÷ 1 = **8** | no | low (one 128 px cube, replaces the procedural one) |
| 12 | **The story's world is pale flat blocks.** A near-white floor plane, a blurred sand wall, single-colour blocks, a tiny dark HP bar; on desktop a pale plane and an orange capsule creature (`b1-portrait-adventure-d-play.jpg`, `b1-landscape-adventure-d-play.jpg`). The dressed world (`story.worldDressed`, textures, trims, Kenney nature kit) is built but **ships at 0**: lane C measured World 1's frame p95 250 → 317 ms then 150 → 217 ms on the rig (FEEL-PANEL.md). A/B: `ab-dressed-desktop-adventure-d-play.jpg`. | Looks unfinished; the story is on the Play door and in Venice. | every story player (3) | 5 | M | 3 × 5 ÷ 2 = **7.5** | partly (creatures, §7) | **medium** (that is why it is off) |
| 13 | **The Physics Arena is a court in a void.** A pink-to-orange gradient, a flat grey band for a horizon, no stands, no props, no fence; the hoop's pole runs up through the middle of a pale backboard; the "3-Point" tab wraps to two lines on an upright phone (`b1-portrait-arena-hoops-d-play.jpg`, `b1-landscape-arena-threes-d-play.jpg`). | Looks like a test scene; it is on Play by default (`arena.on`). | arena players (3) | 4 | M | 3 × 4 ÷ 2 = **6** | no for a first set (shipped kits), yes for its own look (§7) | medium (props, shadows); **no phone budget row yet** |
| 14 | **The Closet held sideways shows almost no athlete**: the tutorial card and the header cover the 3D preview (`b1-landscape-closet.jpg`). | Looks broken in that orientation. | sideways Closet visits (2) | 3 | S | 2 × 3 ÷ 1 = **6** | no | none |
| 15 | **Clothes look torn at the edges in the Closet.** The tee's shoulders and sleeve hems are ragged with light specks along the seams; the shirt colour reads flat (`b1-portrait-closet.jpg`). In play at distance the shirts' edges shimmer (#6 makes it worse). The owner's top visual priority (2026-11-18). KIT-FIT-PLAN §10–§14: every runtime pull-in so far failed its bar; `kit.layerGap` waits on the owner's eye. | The athlete is the thing a player looks at most in the Closet. | every Closet visit; every game up close (4) | 4 | L | 4 × 4 ÷ 3 = **5.3** | **yes** (the garment's shape at the shoulder: an in-house Blender job, KIT-FIT-PLAN §12.3) | low |
| 16 | **The Coast's sea is a flat cyan sheet and Venice's paving is bare from a high camera** (`b1-landscape-coast-d-play.jpg`, `b1-landscape-venice-d-play.jpg`): no glints, no shore foam, no shading change with distance; the hero is small in a big empty square. | Empty, unlit-looking water; a park that reads as unfinished. | every Coast / Venice visit (3) | 2 | M | 3 × 2 ÷ 2 = **3** | no (`OceanSurface.ts` ships; Venice props ship) | low–medium |
| 17 | **The sign-in venue card's glow is cut flat** at the carousel's bottom edge (`b1-portrait-login.jpg`). | Clipped UI. | every sign-in on a phone (3) | 1 | S | 3 × 1 ÷ 1 = **3** | no | none |
| 18 | **The crowd behind the rim is flat, blocky cut-outs** in matching colours (Dunk, 3-Point; `b1-landscape-dunk-d-play.jpg`, `b1-landscape-threepoint-d-play.jpg`). | Low-detail crowd next to detailed players. | every Dunk / 3-Point (4) | 2 | L | 4 × 2 ÷ 3 = **2.7** | **yes** for variety and arm motion (VISUAL-PASS-PLAN, w3-crowds) | high (skinned bodies at their row's ceiling) |

**The top ten by need: 1 to 10 above** (the Dunk HUD, the upright header, the deck over the players, the black loading screens, /try,
phone anti-aliasing, /play's top, the story's first screens, the USB chip, the end card's title). The story's world (12) and the arena (13)
look the most unfinished but fewer players see them and they cost more; they are still phases (C1, routed).

Not findings (checked and fine): the hoops courts sideways and on desktop; the 3-Point results card's layout; the TV-style score bugs;
the sign-in and sign-up pages; /modes, /account, /train (the photo hero) — one consistent card language with the `--fel-*` tokens;
no horizontal scroll on any page at any size; 0 page errors in every run.

---

## 4. The bar for a look change to ship ON

A look change ships ON only when **both** hold:
1. **A clear before/after improvement in the pictures**: the same route, the same size, the same moment, `?perf=off` on both sides
   (§1's caveat), taken by `look-walk.mts` in the same gate hold, at least 3 runs a side. "Clear" means a person shown the two sheets
   side by side without labels picks the after; for the measurable ones (overlap, clipping, text over a body) the number goes to 0.
2. **Phone cost within noise of the control**: the phone tier (390×844, DPR 3, touch, 4× CPU) — frame p95 and JS work per frame from
   the PERF readout (`look-walk.mts perf`, or `_perf-sweep.mts` / the hoops-gap static rig for a mode), **3 runs a side plus the
   control (tennis) in the same hold**, the change's p95 inside the control's own run-to-run spread; the mode's `mobileBudget.json`
   row held (draws, meshes, texture MB under budget, the guard test green); and **load time** (READY on the phone tier, 3 runs a side)
   within 10 % when assets or textures change.

Otherwise it ships **OFF** behind its knob, whose **off value restores today's look exactly** (a test pins the off value). **Purely
subjective style** — a colour palette, the art direction, a mood, a typeface — is the owner's call and ships OFF with the A/B sheet for
the owner, whatever the numbers say. No tuned feel number moves: camera distances, heights and FOV are tuned (OWNER-DECISIONS
2026-10-08: "every camera number changed = TUNED"); a phase that wants a camera change adds a new knob at today's value and ships it
OFF.

---

## 5. The phases: 10, in 3 build lanes

Sizes: S ≤ 1 day, M 2–4 days, L a week or more. Every knob goes in `lib/feel-panel/knobs.ts` + `docs/FEEL-PANEL.md` (labels without
`' " & < >`), its off value = today, with a test of both ends. Every phase: before/after sheets with `sheets.mjs` on the phase's own
shots tag, plus the frame-time check of §4.

### Lane A — screens and HUD (DOM, CSS and layout; phone risk: none)

**Phase A1 — The upright game header folds into the stage (S). Finding 2.**
- **Do:** on a phone held upright, the header keeps one row (back · title); pause, BODY, the PRQ badge, the graphics choice and full
  screen move into the stage's existing "⋯" menu (`GameCaptureHud`), so the stage takes the rest of the screen. Sideways, full screen,
  desktop and the stream view unchanged. Never show "PRQ — · NOT MEASURED" as a badge (the menu says "Not measured yet").
- **Files:** `components/games/game-shell.tsx` (a caution file, LANES §3: the header block only), `components/games/graphics-toggle.tsx`,
  the "⋯" menu's component (`GameCaptureHud`'s file), `lib/ui/stageFit.ts` (it already reads the header's real height).
- **Knob:** `ui.compactGameHeader` (1 on; 0 = today's wrapping header).
- **Measure:** header height on 390×844 and 375×667 upright, every hoops mode + tennis (165 px → one row, ≤ 64 px); CLS on the game
  screens (budget 0.02); the stage's top; before/after sheets `look-before-3-*-portrait`; sideways and desktop pixel-identical.
- **Bar:** the header ≤ 64 px in every mode, 3 runs; sideways / desktop unchanged; CLS held; every control still reachable (a test).

**Phase A2 — One HUD layout for the hoops on an upright phone (M). Findings 1 and 3.**
- **Do:** HUD zones for the upright phone: the score bug and round info in one top strip; the leaderboard, SPECIALS and meters folded
  into it or into the "⋯" menu; the commentary caption moved to the top strip (never across the rim), one line, the full text in CC;
  hints and toasts in one slot above the touch deck, never over a body (a placement check against the players' projected boxes);
  HOLD labels laid out so they never touch a ring; no ghost d-pad where the mode reads no d-pad (`HollowDPad` hidden, the column kept,
  so TURBO and the stick keep their places); the action cluster drawn at lower opacity while a body is behind it.
- **Files:** `lib/babylon/ui/TouchOverlay.tsx`, `lib/babylon/ui/dpadTap.ts`, `lib/babylon/ui/hudHints.ts`, `components/games/tv-hud/**`,
  `components/games/hoops-bottom-stack.tsx`, `components/games/mic-caption.tsx`, `components/games/dunk-babylon.tsx` (the Dunk stack's
  layout only), `components/games/dunk-field-board.tsx`, `components/games/use-hoops-hint.ts`.
- **Knobs:** `ui.hudZonesUpright` (1 on; 0 = today), `ui.deckFadeOverBody` (0.5 opacity; 1 = today's solid deck).
- **Measure:** a new overlap probe in `look-walk.mts`: pixels of HUD text over the players' and the rim's screen boxes (from the
  modes' agent seams), and HUD element count over the court, upright, in 1v1, 3v3, Dunk, 3-Point; before/after sheets.
- **Bar:** text over a player or the rim → 0 px in all four modes, 3 runs; the Dunk's pieces over the court 11 → ≤ 6; nothing a player
  needs to read is lost (each is in the strip, the menu or CC: a test lists them); tap targets stay ≥ 44 px (`ui.touchTargets44`).

**Phase A3 — Loading and first-run screens in one finish (S). Findings 4, 5, 7, 9, 10, 17.**
- **Do:** (a) a shared loading card for Venice, the Coast, the story and the arena — the boot splash's look (title, place, a short
  line, a progress bar), no new art (the venue photos and gradients that ship); (b) /try's birth-date step in the sign-up card (logo,
  card, glow) — the same words; (c) the "USB controller?" chip below the venue line; (d) the end card's title kept from orphaning (a
  balanced wrap); (e) the sign-in card's glow not clipped; (f) /play and the menu header on a phone: the wallet chips on the logo's row,
  the level ring hidden until it has a number (never a dash), the chips in a tidy two-column grid.
- **Files:** new `components/games/place-loading-card.tsx` (+ test); the loading line of `app/play/venice/stage.tsx`,
  `app/play/coast/stage.tsx`, `app/play/adventure/stage.tsx` (one line each; story and Venice are other lanes' areas — route if they
  are active); `app/try/page.tsx`, `components/age-step.tsx` (layout only, never the age rule), `components/controller-link/host-lobby.tsx`,
  `components/games/end-screen/end-screen.tsx` (the title's wrap only), the sign-in carousel component under `components/auth/`,
  `components/shell/**` (the header and the chips), `app/play/page.tsx` (the chip row's layout). The arena's line is routed (lane
  physics-arena owns `app/play/arena/**`).
- **Knob:** `ui.placeLoadingCard`, `ui.firstRunCard`, `ui.compactAppHeader` (each 1 on; 0 = today).
- **Measure:** the loading and page pictures at three sizes (before/after sheets `look-before-1-*`, `-6-*`); CLS on /try, /play and the
  hubs; first contentful paint on /try (phone tier, 3 runs a side: within 10 %).
- **Bar:** the pictures, plus no CLS above 0.02 and no FCP slip beyond 10 %. The copy is untouched (a test pins the words).

### Lane B — hoops venues, lighting and materials (scene, post-processing; phone risk: low to medium)

**Phase B1 — Anti-aliasing on phones (S–M). Finding 6.**
- **Do:** give the mobile tier an edge AA it can pay for: first try FXAA at every density (`fxaaMaxDpr` Infinity, the pass that already
  runs below 1.5); if that misses the frame bar, 2× MSAA on the HDR pipeline's first target; if both miss, FXAA only while the guard
  is at full scale. Each as a value of one knob.
- **Files:** `lib/babylon/scene/QualityTier.ts` (`tierRigSettings` mobile row), `lib/babylon/scene/LightRig.ts` (where FXAA / MSAA are
  applied), `lib/babylon/scene/QualityTier.test.ts`.
- **Knob:** `look.phoneAA` (0 = today: FXAA below DPR 1.5 only; 1 = FXAA always; 2 = 2× MSAA).
- **Measure:** `?perf=off` pictures upright and sideways in 1v1, 3v3, Dunk (a crop of the players and the palms); an edge-stair count
  on the court lines in the crop; frame p95 / JS per frame (PERF readout), tennis as the control, 3 runs a side.
- **Bar:** visibly smoother edges, **and** p95 within the control's spread; otherwise OFF. This is the one phase most likely to fail
  the frame bar; it is first in lane B because it is S and touches every mode.

**Phase B2 — Real sky light on the hoops sets (S). Finding 11.**
- **Do:** measure `venue.iblEnvV1` (built 2026-10-31, never measured to a bar) on 1v1, 3v3, 3-Point and the Dunk; turn it on per mood
  where it wins; fix what it shows (the intensity per mood is a NEW number, flagged).
- **Files:** `lib/babylon/scene/venueQualityV1.ts`, `lib/babylon/scene/EnvironmentIBL.ts` (the fallback, read only).
- **Knob:** `venue.iblEnvV1` exists (0 today); per-mood intensities as new knobs only if changed.
- **Measure:** `ab-desktop-*-ibl` against `b1-desktop-*` (and the same on the phone tier), 3 runs; load time (each `.env` is 0.3–0.5 MB):
  READY within 10 %; texture MB against the mode's row (the cube replaces the procedural one).
- **Bar:** §4. Colour and mood are part of the look: if the pictures differ but neither is plainly better, it is the owner's call and
  ships OFF.

**Phase B3 — The set at a distance: the courts' surfaces, then the crowd (M–L).** Part 1, the surfaces: finding 16 (the Venice set) and the court and sand detail seen in findings 3 and 6.
- **Do:** the Venice set's sand and paving at a texel density that holds at play distance (the shipped textures with tiling and a
  detail map, no new files), a contact-shadow ring under each player on the phone tier where there is no shadow map texel to spare,
  the palm fronds' alpha-to-coverage (with B1) so they stop crawling.
- **Files:** `lib/babylon/visual/CourtSurface.ts`, `lib/babylon/visual/contactShadow.ts`, `lib/babylon/visual/venuePropSets.ts`,
  `lib/babylon/nexus/veniceBoardwalk.ts` (the hoops set's dressing; not the Venice hub's walkable park, lane C).
- **Knobs:** `venue.courtDetailV2`, `venue.phoneContactShadow` (0 = today).
- **Measure:** `?perf=off` before/after sheets of 1v1 / 3v3 / Dunk at three sizes; phone p95 3 runs a side + control; texture MB.
- **Bar:** §4.

**Phase B3, part 2 — The crowd behind the rim reads as people (partly art). Finding 18.** Its own knob, measured and shipped on its own:
- **Do (code):** with the shipped crowd bodies and cards: more tint and height variety, a depth-of-field-like soft fall-off (a cheaper
  fog band behind the rim, not a blur pass), a staggered idle so the rows do not move as one.
- **Files:** `lib/babylon/visual/crowd/**`, `lib/babylon/visual/CrowdLod.ts`.
- **Knob:** `crowd.varietyV2` (0 = today).
- **Measure:** before/after sheets of Dunk and 3-Point at three sizes; skinned bodies and draws against those rows' budgets (Dunk
  12/15 skinned, 144/173 draws; 3-Point 16/16 skinned — **at its ceiling**, so no added bodies there); phone p95.
- **Bar:** §4. Real variety (new bodies, arm motion) is owner art (§7).

### Lane C — characters, the story and the zones (phone risk: low to medium)

**Phase C1 — The story looks finished, on a phone's budget (M). Finding 12.**
- **Do:** make `story.worldDressed` pay for itself: the cut lane C started (filtering 8 → 1, frozen matte materials, no shadow lookups
  on props) carried on — the dressing merged per material (one draw per material per chunk), props culled by distance on the phone
  tier, the ground's procedural textures baked once at load to a small atlas; and a grade for the story's mood (exposure and fog so the
  floor is not near-white: the mood's tone mapping, not new art).
- **Files:** `lib/babylon/adventure/world/dress.ts` (+ test), `lib/babylon/adventure/world/view.ts`, `lib/babylon/modes/AdventureMode.ts`
  (the mood and grade lines), the story's row in `lib/babylon/config/mobileBudget.json` (only if measured and flagged).
- **Knobs:** `story.worldDressed` (exists, 0), new `story.gradeV2` (0 = today).
- **Measure:** the story rig (`scripts/probes/story/story-rig.mts`, its 16 beats and the resume sweep) and `look-walk.mts --only=adventure`
  with and without the knob; World 1's frame p95 on the phone tier (250–317 ms in lane C's run), 3 runs a side + control; load time.
- **Bar:** §4, and the playthrough still finishes (16 beats, 128 of 128 resumes).

**Phase C2 — The story's first screens and the zones' loading (S). Finding 8 and the story half of 4.**
- **Do:** the partner picker shows each partner as its 3D body on a turntable or its card art if the owner provides it (today the
  three creatures are placeholder shapes: until then a silhouette card, never a dot); the READY screen is a title card (chapter, place,
  START) with the control table one tap away; the story's loading uses lane A's `place-loading-card`.
- **Files:** `app/play/adventure/stage.tsx`, `components/adventure/**` (the picker and the READY card), `lib/babylon/adventure/story/uiBridge.ts`.
- **Knob:** `story.titleCard` (1 on; 0 = today).
- **Measure:** before/after sheets (`look-before-6-*`); first frame to READY on the phone tier unchanged (3 runs).
- **Bar:** §4 (pictures; no frame cost).

**Phase C3 — The athlete up close: clothes and skin (L, partly art). Findings 15 and 14.**
- **Do (code):** the Closet's 3D preview fits a sideways phone (the tutorial card moves beside it); the owner's pending kit switch
  (`kit.layerGap`, KIT-FIT-PLAN §14) gets its A/B sheet in the Closet and in play for the owner's eye; the garment edges' light specks
  are checked for what they are (back faces or skin through the seam: the kit-glitch rig's counters) and fixed in the renderer if they
  are not the garment's shape.
- **Do (art, owner):** the shoulder and sleeve shape of the tee (KIT-FIT-PLAN §12.3: "weights cannot fix it; the shape must").
- **Files:** `components/closet/**` and `components/closet-view.tsx` (layout), the kit runtime files KIT-FIT-PLAN names
  (`lib/babylon/core/fitTight*`, `bodyMerge.ts` read only), `docs/KIT-FIT-PLAN.md` (a new section).
- **Knobs:** `ui.closetSideways` (1 on; 0 = today); `kit.layerGap` exists (owner's call).
- **Measure:** the kit-glitch / kit-fit rig's counters (skin through cloth, torn edges, flicker) 3 runs a side with `rival-halo` as the
  control (KIT-FIT-PLAN §10.1a's bar); before/after sheets of the Closet at three sizes.
- **Bar:** KIT-FIT-PLAN §10.1a for anything on the body; §4 for the layout.

**Phase C4 — The Coast's sea and the Venice park (M). Finding 16.**
- **Do:** the Coast's water uses the shipped `OceanSurface.ts` (the surf breaks' moving normal and fresnel) instead of the flat sheet,
  with shore foam where it meets sand; Venice's paving gets the court set's detail approach (B3) and its far courts' lights; no camera
  number changes (the high camera is tuned; a closer framing would be a new knob shipped OFF).
- **Files:** `lib/babylon/modes/CoastZoneMode.ts` (the water), `lib/adventure/coast/**`, `lib/babylon/modes/VeniceHubMode.ts` (the
  paving's material) — the Venice lane's file: route if it is active.
- **Knobs:** `coast.oceanSurface`, `venue.veniceGroundV2` (0 = today).
- **Measure:** before/after sheets (`look-before-6-*`), the Coast and Venice rows of `mobileBudget.json` (coast_zone 136/164 draws,
  63/76 MB; venice_hub 46/56 draws), phone p95 3 runs + control.
- **Bar:** §4.

### Routed — the Physics Arena's look (finding 13)

`lib/babylon/arena/**`, `lib/babylon/modes/PhysicsArena*` and `app/play/arena/**` belong to lane physics-arena, which is active. **No
build lane here touches them.** The plan for that lane, in its own order: (a) a set from the shipped kits (the 3v3 streetball cage and
walls, `streetballDressing.ts`; the court surfaces; a sky dome from `SkyDome.ts`) behind `arena.setV1`; (b) the arena's loading on lane
A's place card; (c) the sport tabs that do not wrap on an upright phone; (d) **a `mobileBudget.json` row for the arena** — it has none,
so no look change there can be held to a budget until it does. Same bar (§4).

### The order, and who holds what

| Lane | Phases, in order | Files it holds | Why this order |
|---|---|---|---|
| **A — screens and HUD** | A1, A2, A3 | `game-shell.tsx` (header block), `graphics-toggle.tsx`, the "⋯" menu, `lib/ui/stageFit.ts`, `lib/babylon/ui/{TouchOverlay.tsx,dpadTap.ts,hudHints.ts}`, `components/games/{tv-hud/**,hoops-bottom-stack.tsx,mic-caption.tsx,dunk-babylon.tsx,dunk-field-board.tsx,use-hoops-hint.ts,end-screen/end-screen.tsx}`, new `place-loading-card.tsx`, `app/try/page.tsx`, `components/age-step.tsx` (layout), `components/controller-link/host-lobby.tsx`, `components/shell/**`, `app/play/page.tsx` (layout), the sign-in carousel | A1 first: every upright game, S, and A2 measures against A1's stage |
| **B — hoops venues, light, materials** | B1, B2, B3 (surfaces, then the crowd) | `lib/babylon/scene/{QualityTier,LightRig,venueQualityV1}.ts` (+ tests), `lib/babylon/visual/{CourtSurface,contactShadow,venuePropSets,CrowdLod}.ts`, `lib/babylon/visual/crowd/**`, `lib/babylon/nexus/veniceBoardwalk.ts` | B1 touches every mode and is the cheapest; B2 is a measured switch-on; B3's crowd part is the one nearest a budget ceiling |
| **C — characters, story, zones** | C1, C2, C3, C4 | `lib/babylon/adventure/world/{dress,view}.ts`, `AdventureMode.ts` (mood lines), `app/play/adventure/stage.tsx`, `components/adventure/**`, `components/closet/**`, `closet-view.tsx`, the kit runtime files, `CoastZoneMode.ts`, `lib/adventure/coast/**`, `VeniceHubMode.ts` (paving only) | C1 is the biggest "looks unfinished"; C3 waits on the owner for its art half |

**Shared, additive, keep both sides on merge:** `lib/feel-panel/knobs.ts` (+ `knobs.test.ts`), `docs/FEEL-PANEL.md`, `docs/LANES.md`.
**One-line touches across lanes:** A3's loading line in `app/play/adventure/stage.tsx` (lane C's file) and in `app/play/venice/stage.tsx`
/ `app/play/coast/stage.tsx` — lane A makes the component, lane C adds the line in its files. `game-shell.tsx` and `boot-splash.tsx` are
caution files (LANES §3). `ModeHarness.ts` is touched by no phase. **Lanes B and C both need long gate holds for their frame checks:**
they should not run them at the same time; lane A's checks are short.

---

## 6. What waits on the owner (look calls, recommendation first)

- **The pictures of every phase that ships OFF** (the A/B sheets): the owner's eye decides. *Recommend:* look at A2 (the HUD) and C1
  (the story) first — the biggest change on screen.
- **Colour and mood** (palette, the arena's look, the story's grade, the sky light where it changes the colour of a set): style calls;
  built OFF with sheets.
- **`kit.layerGap`** (KIT-FIT-PLAN §14) — built, OFF, waiting for the owner's eye since 2026-11-19.
- **A phone check with the PERF readout** in 1v1, the Dunk, the story and Venice after lane B's B1, because the rig cannot give a phone's
  frame rate (§1).
- **Any camera framing change** (the players drawn above the touch deck on an upright phone is the cleanest fix for finding 3, and it is
  a tuned camera number): built only as a new knob at today's value, OFF.

---

## 7. What needs the owner's art (GATE 0), apart from what code can do

**Needs art (Grok / Meshy / in-house Blender; the owner's, with a licence line):**
1. **The story's creatures and bosses** — the three partner creatures, the foes, the bosses (today placeholder shapes; the picker shows
   dots). STORY-FINISH-PLAN #14 already lists them as waiting.
2. **The tee's shoulder and sleeve shape** (KIT-FIT-PLAN §12.3: the fray is the garment's shape, not its weights).
3. **Crowd variety**: more bodies, and arms skinned to the arms (today to the torso: VISUAL-PASS-PLAN w3-crowds), for cheers and claps.
4. **The Physics Arena's own set**, if it is to look like its own place rather than a shipped court (the arena keeps its own name and
   look: no copy of the benchmark game).
5. **Partner and creature card art** for the story's picker (a 2D card is enough; until then C2 shows silhouettes).
6. *Already known, not new:* higher-resolution photographic sky domes (VISUAL-PASS-PLAN A9: the 1024×512 baked domes), and the hoop
   with a moving net (approved 2026-11-12).

**Code can do, with what ships (the phases):** the header, the HUD and the touch deck (A1, A2); every loading card, /try, /play, the end
card, the USB chip (A3); anti-aliasing (B1); the sky light (B2, files ship); court and sand detail, contact shadows, palm edges (B3);
crowd tint, height, idle and fall-off (B3, part 2); the story's dressing and grade (C1, the Kenney kit and procedural textures ship); the story's
title card and silhouettes (C2); the Closet's sideways layout and the kit renderer checks (C3); the Coast's water and Venice's paving
(C4); the arena's first set from shipped kits (routed).

---

## 8. Not measured, and assumptions

- Not measured: a real phone's frame rate and colour; the production deploy; TVs; the online and party screens; Studio; every Combat,
  Board, Racing, Party and Craft mode (the owner's "players see most" put the hoops, the first run, the story and zones first; the next
  look pass can take them).
- `assumption:` the upright phone is the size that matters most (a phone held upright is how the first run and the menus are used; the
  hoops are good held sideways). The landscape findings are fewer because there is less wrong there.
- `assumption:` DPR 2 for the picture runs (the perf run uses DPR 3, as the repo's phone profile does); the mobile tier is picked by
  touch and a coarse pointer either way.
- `assumption:` "how bad it looks" is this lane's judgement from the pictures; the numbers that can be counted (overlap, header height,
  HUD pieces, aliasing settings) are stated with each finding.
- `assumption:` the frame-time bar uses the PERF readout's p95 and JS per frame on SwiftShader against the control: a relative bar, not a
  phone's frame rate.

## 9. The pictures, and how to re-run

Scratch folder (the session's): `/tmp/claude-0/-home-user-Final-Evolution-Lab-2026-05-12-23-15-57/e156aa0c-5ac6-5a64-b2e0-57cb533692fe/scratchpad/look-audit/`
- contact sheets: `look-before-<area>-<portrait|landscape|desktop>.jpg` (areas 1 to 6, §2);
- every frame: `shots/b1-<size>-<screen>[-a-loading|-b-ready|-c-play|-d-play|-e-end].jpg`, the A/Bs `shots/ab-*`, `shots/ab-dressed-*`;
- the per-run JSON beside each picture (READY time, the guard's scale steps, errors); the perf readouts `shots/p1-phoneperf-*.json`.

```
# one production build (inside a gate hold), the walks (each job its own hold), the sheets, then delete the build
export ES_PG_DIR=/var/lib/postgresql/look-audit-pg ES_PG_PORT=55531 ES_PORT=3911 ES_DIST=.next-look
env -u DATABASE_URL -u DIRECT_URL /home/user/wt/gate-run.sh 1800 npx tsx scripts/every-screen/rig.mts build
git checkout -- tsconfig.json                                        # next build adds its types folder to it
CHROMIUM_EXE=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome scripts/probes/look-audit/run-all.sh <out> portrait landscape desktop perf ab
node scripts/probes/look-audit/sheets.mjs <out>/shots <out> b1       # a phase: its own --tag, then the same command with that tag
npx tsx scripts/every-screen/rig.mts db-down; rm -rf .next-look
```
