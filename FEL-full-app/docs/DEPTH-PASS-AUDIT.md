# The depth and detail pass: the audit and the 10-phase plan (lane/depth-audit, 2026-11-25)

**Owner, 2026-11-25 (verbatim):** "Let's do a 10 phase pass improving how things look. Adding depth, detail."
**Owner's clarification (relayed by the coordinator, 2026-11-25):** "depth, detail" means *visually*: lighting, shadows,
materials, surface detail, atmosphere, set dressing, character shading and layered UI. No gameplay or content depth.

This file is the audit and the plan only. Nothing in the app was changed by this lane; build lanes carry out the phases. It
follows `docs/LOOK-PASS-AUDIT.md` (2026-11-24, the layout and overlap pass) and does not redo it: the knobs that pass built and left
OFF for the owner are listed once, in §8, and are not proposed again as new work. Base: `lane/finish-release` at `d42217a2`.
Every finding names the picture it comes from; the pictures are in the session scratch folder (§10).

---

## 0. The answer in one paragraph

The desktop already draws most of the depth tricks the game owns (soft ambient occlusion, four-band sharp shadows, real
anti-aliasing, lamp lights, a moving sky, a mirror floor on the Dunk), and at play distance on a desktop the hoops courts look
solid. **What looks flat is mostly what every phone player sees, and the places the last passes never reached.** On a phone the
players do not sit on the court: there is no readable shadow under them, and where one shows it is a black four-pointed star
under the shoes rather than a soft pool. On every size the bodies themselves read flat: shirts and skin are lit almost evenly from
all sides, so a torso has no light side and dark side, and faces at play distance are a blank oval. Around the courts, the Venice
set's palms, lamp posts, fences and stalls stand on the paving without any shadow or contact darkening; the Blossom court floats
in the sky with no ground under it, and the Canopy court is a plain blue sheet with no grain, wear or edge. The Physics Arena is
still a court in a box with nothing past its wall. The menus are flat dark cards on black. **Most of this is code with the art
the repo already ships** (the decal pool, the detail-map generator, the shipped kits and backdrops, the existing lights); the
short art list (§7) is faces that read at distance, cloth folds, and the arena's own look. The plan is 10 phases in 4 lanes: the
light and shadow rig (4 phases), the hoops sets (2), the arena and the zones (2), and the screens (2).

---

## 1. How it was measured

**The rig** (the same as LOOK-PASS-AUDIT §1, its own port and build). One production `next build` (`NEXT_DIST_DIR=.next-depth`)
served by `next start` on this lane's port **3959**, against a throwaway Postgres (127.0.0.1:55571), signed in as the rig's
players through the real routes. Chromium with SwiftShader (software GL). Every browser run held the shared gate lock
(`/home/user/wt/gate-run.sh`), one hold at a time; **each hold built, walked and deleted its own build** (two holds, at 05:36 and
06:02, ~9.5 min of build each; the sideways size was walked for the main places only — 1v1, Dunk, the arena's 1v1 and soccer,
the hub, the Coast, the story — because a build and three full sizes do not fit one 30-minute hold).

**The instrument** (in the repo, `scripts/probes/depth-audit/`):
- `depth-walk.mts <out> --tier=portrait|landscape|desktop [--only=..] [--tag=..] [--feel=knob:v]` — the places players see most at
  **390x844 upright phone** (touch, DPR 2), **844x390 sideways phone** (touch, DPR 2) and **1280x720 desktop**, every 3D route with
  **`?perf=off`** so the speed guard cannot drop the render scale on SwiftShader (LOOK-PASS-AUDIT §1's caveat: with the guard on the
  rig's pictures are drawn at 0.6–0.75 scale). Moments: loading (3.5 s), READY, 3 s into play, 6 s later after the stick and a
  button. Routes: `/`, `/try`, `/play`; 1v1 on **Venice, Canopy and Blossom** (`?location=`), 3v3, 3-Point, Dunk, tennis (the
  control); the Physics Arena's **four** sports (hoops, threes, 3-point, soccer); the Venice hub, the Coast, the story. It also
  records each run's `[FEL-TIER]` / `[FEL-AIR]` lines (the tier and edge settings the page actually got).
- **The phone-vs-high A/B**: the same upright phone with `&tier=high` (`onevone-high`, `dunk-high`, `arena-hoops-high`), so a
  finding can say which of the desktop's depth the phone tier lacks.
- `sheets.mjs <shots> <out> [tag] [prefix]` — the contact sheets, one per area and size, the same tiles in the same order (a
  phase's after sheet lines up tile for tile with these); `crop-pair.mjs` — one crop of two pictures side by side, enlarged.
- `run-hold.sh <out> "<walk args>" ...` — one gate hold: the build, the walks, the build deleted (trap on exit).

**What was read in the code** (to name what each tier draws, not to judge the picture): `scene/QualityTier.ts` (the tiers),
`scene/LightRig.ts` (lights, shadows, the post chain, the caster rules), `scene/ShadowCache.ts`, `scene/{SkyDome,Atmosphere,
GlossyFloor,VenueReflection,KickerLight,FixtureLights}.ts`, `visual/{contactShadow,AnimeInk,CourtSurface,groundTextures}.ts`,
`core/{skinShading,fabric}.ts`, `nexus/{courtLocations,veniceBoardwalk}.ts`, `arena/arenaSet.ts`, `app/theme.css`.

**What each tier draws today** (from the code, confirmed by the runs' `[FEL-TIER]` lines):

| | phone (`mobile`) | desktop | high |
|---|---|---|---|
| Shadows | one 512 px map, blurred (ESM), fitted to every caster in the venue, static part cached | 4096 px, 4 cascades on outdoor moods, soft filtering (PCF medium) | as desktop |
| Ambient occlusion | none | SSAO (half resolution, 16 samples) | as desktop |
| Edges | none above DPR 1.5 (`look.phoneAA` built, OFF) | 4x MSAA + sharpen | as desktop |
| Lamp and LED glow / lamp light on the set | bloom only | glow layer + clustered fixture lights | as desktop, larger glow |
| Sky | the photograph on the dome | + softened photo, drifting clouds, sun glow, horizon haze band | as desktop |
| Reflections | the mood's procedural cube | + mirror floor on the Dunk / 3-Point court | + one captured cube of the venue |
| Players' rim light, contact discs, bloom, mood grade | yes | yes | yes |

**What the rig can and cannot say.** Pictures: what a player sees at three sizes, at real moments, at full render scale.
**Frame time: the rig cannot give a phone's frame rate**; a phase reads frame p95 and load time only against the tennis control in
the same hold (LOOK-PASS-AUDIT §1, §4). Texture filtering does not show on SwiftShader. Not measured here: a real phone, the
production deploy, colour on a calibrated screen, the replay and intro cameras (close-ups), Night Rooftop and Orbit courts.

---

## 2. What the pictures show

| Area | Contact sheets (scratch, §10) | In a sentence |
|---|---|---|
| Hoops at Venice | `depth-before-1-hoops-venice-{portrait,landscape,desktop}.jpg` | Desktop and sideways: solid. Upright phone: the players have no shadow; nothing on the paving is grounded. |
| Hoops on the other courts | `depth-before-2-hoops-courts-{portrait,desktop}.jpg` | Canopy is a plain blue sheet on brown dirt; **Blossom's court floats in the sky**. |
| Physics Arena | `depth-before-3-physics-arena-*.jpg` | A court in a glass box on a gradient; opaque pale backboard; the soccer goal is a pale box; nothing past the wall. |
| Zones and story | `depth-before-4-zones-story-*.jpg` | Venice hub: an empty paved square; the Coast: a flat cyan sea; the story: pale blocks (all three have a built-but-OFF fix, §8). |
| Screens | `depth-before-5-screens-*.jpg` | Home is a photo and holds up; /play is flat dark rows on black; the loading card is a flat panel; /try is a bare form (§8). The 3-Point end card is LOOK-PASS-AUDIT's picture (this walk's end-card frame missed it). |
| Phone vs high tier | `depth-ab-phone-vs-high-tier.jpg`, `depth-crop-1v1-players-phone-vs-high.jpg`, `depth-crop-dunk-player-phone-vs-high.jpg` | The high tier grounds the onlookers (SSAO) and sharpens edges; **the bodies read just as flat on both**. |

---

## 3. The findings, ranked by need

**Need = visibility (5 = every phone player in every 3D game … 1 = rarely) × flatness (5 = looks unfinished or floating … 1 =
polish) ÷ cost (S = 1, M = 2, L = 3).** "Art" says whether the fix needs the owner's art (GATE 0: Grok / Meshy / in-house Blender)
or whether code can do it with what the repo ships. "Phone risk" is the frame-time risk of the fix (none = DOM / CSS; low = no new
full-screen pass and no new per-vertex work; medium = a new pass, a texture in a tight budget row, or more draws in a row near its
ceiling). Skinned bodies already dominate frame cost on the rig, so **no phase adds per-vertex work to bodies**.

| # | What is flat or thin (picture) | Technique that adds depth | Seen by | Flat | Size | Need | Art? | Phone risk · tier |
|---|---|---|---|---|---|---|---|---|
| 1 | **Players do not sit on the court on a phone.** Upright 1v1: the rival's shadow is a hard black four-pointed star under the shoes, the hero has none (`d0-portrait-onevone-d-play.jpg`, crop `depth-crop-1v1-players-phone-vs-high.jpg` left); the high tier puts a soft dark pool under every pair of feet (same crop, right). Dunk, 3v3, the hub: no pool under the feet on the phone. Why (code): the phone's single 512 px blurred map is fitted to **every caster in the venue** (`ShadowCache.ts` freezes the frustum on all casters), so a player covers a few texels of it; the contact disc (`contactShadow.ts`) is too faint to read on a bright court. | (a) a phone **feet pool**: the contact disc darker under the feet and stretched along the sun (a soft directional drop shadow), instances already drawn; (b) **fit the phone map to the play area**: far scenery out of the phone's caster list so the same 512 map spends its texels on the players; (c) cure the star (the ESM depth scale and bias on the phone map). | every 3D game on a phone (5) | 4 | M | **10** | no | low (fewer casters is cheaper; the discs are drawn already) · phones |
| 2 | **Props on the Venice set float.** Lamp posts, palm trunks, fence posts, stalls and benches meet the paving with no shadow and no contact darkening on any tier, while the players and onlookers beside them do cast (`d0-desktop-onevone-c-play.jpg`, `d0-portrait-threevthree-c-play.jpg`). Why (code): the boardwalk set is named `vb_*`, which `LightRig.ts` keeps out of the shadow map (`NEVER_CAST`), and the hero palms cast only on the Dunk. Venice is the default court of every hoops mode. | (a) **baked footprints**: at load, one soft dark ellipse decal per static prop base (sized from its bounding box) through the shared ground-decal pool (`GroundDecals.ts`, one instanced draw), every tier; (b) on desktop/high, the near trunks and lamp posts back in the caster list (the cascades can pay for it). | every Venice hoops game (4) | 3 | S–M | **8** | no | low (one instanced draw) · footprints all tiers; casting desktop/high |
| 3 | **Bodies read flat on every tier.** Shirts and skin are lit almost evenly from all sides: a torso has no light side and dark side, the jersey has no folds, and a face at play distance is a blank brown oval (`depth-crop-dunk-player-phone-vs-high.jpg`: phone and high alike; `d0-desktop-arena-threes-d-play.jpg`; the clearest is the 1v1's front view of the hero held sideways, `d0-landscape-onevone-d-play.jpg`: the face's features are there but lit flat, the shirt and the shorts are one flat colour each; on the Coast's close camera the shirt is a single lilac with no shading at all, `d0-desktop-coast-d-play.jpg`). The rim light (`KickerLight.ts`) does not show from the Dunk's behind-the-player camera. Why (code): the mood's hemisphere fill plus the image light plus the black-material floor lift add up to a strong ambient on bodies; the sun does the shaping and is mostly behind the camera. | a **body-only light balance**: less hemisphere fill on skinned meshes only (a body copy of the hemi at a lower intensity, the scene's hemi excluding bodies — the kicker's pattern), the kicker's strength following the camera so the rim shows from behind; per-pixel only, no per-vertex cost. Faces: art (§7). | every 3D game (5) | 3 | M | **7.5** | partly (faces, cloth folds: §7) | low (one light on a handful of body materials) · all tiers, measured per tier |
| 4 | **The other hoops courts float or are blank.** Blossom: the court's edges drop straight into the sky and the trees stand on nothing (`d0-desktop-onevone-blossom-c-play.jpg`, `d0-portrait-onevone-blossom-d-play.jpg`). Canopy: the court is one flat blue with plain lines, no grain, no wear, no edge, laid on flat brown dirt (`d0-desktop-onevone-canopy-d-play.jpg`). Both are on every hoops loading card's picker. | a **ground under every location** (a large disc in the location's ground colour with the shipped ground detail map, its edge lost in the location's own fog); the court as a **slab with a curb** (thickness, a bevel, a darker edge band); the court surface given the shipped grain and line-wear detail (`groundTextures.ts`, procedural, no file). Orbit keeps its floating court (it is space: that is art direction). | players who pick a court (3) | 5 | M | **7.5** | no | low (+2 draws, one shared 512 detail texture) · all tiers |
| 5 | **The Physics Arena has nothing past its wall** (all four sports): a gradient sky meets a grey band; the backboard is an opaque pale slab with an X, the soccer goal an opaque pale box, the pitch flat green stripes; a phone does not even get the desktop's clouds (`depth-before-3-physics-arena-*.jpg`, `d0-desktop-arena-threes-d-play.jpg`, `d0-portrait-arena-soccer-d-play.jpg`). `arena.setV1` (built, OFF: the cage, lamps, benches, an apron) is the first half, §8. | (a) a **horizon**: the shipped baked city or beach backdrop ring (`Backdrops.ts`, `public/backdrops/baked/*.jpg`) beyond the glass, with the aerial haze (`Atmosphere.ts`); (b) **glass and nets**: a see-through backboard with a painted frame, the soccer goal's net from the shipped net lattice (`court/NetKit.ts`); (c) the pitch's grass from the ground detail map. | arena players; on Play by default (3) | 5 | M | **7.5** | no for these; yes for the arena's own look (§7) | low–medium (a ring + 2 materials; the arena's budget rows hold 95 / 114 draws) · all tiers |
| 6 | **The menus are flat cards on black.** /play: dark rows with a plain shaded ball for an icon and no art, a flat black top bar, the hero photo stopping hard above the list (`d0-portrait-play.jpg`, `d0-desktop-play.jpg`); the hoops loading card is a flat teal panel over black (`d0-portrait-onevone-a-loading.jpg`). | **CSS depth**: the hero photo continuing behind the list as a dimmed, blurred layer with a slow scroll parallax; cards lifted with the shipped `--fel-shadow-lift` / `--fel-highlight` tokens (a soft drop and a 1 px top light); the procedural venue thumbnails (`ui/venueThumbs.ts`) on the hoops rows; the loading card as glass over the venue picture in 2–3 layers. | every signed-in session (5) | 3 | M | **7.5** | no (real key art would be, §7) | none–low (CSS; a blur behind a scrolling list is measured) · all |
| 7 | **Reflections are the mood's cube on most tiers.** The rim, backboard frame, ball and glossy court reflect a procedural sky everywhere but the high tier (the one-shot venue capture, `VenueReflection.ts`, is high-only); the mirror floor is on the Dunk and 3-Point only — the Venice 1v1 / 3v3 court is glossy (roughness 0.22) with no players in it on a desktop (`d0-desktop-onevone-c-play.jpg` against `ab-portrait-dunk-high-c-play.jpg`). | the venue capture on the **desktop** tier too, and a 128 px capture once at load on phones (its load cost measured); the mirror floor for **1v1 and 3v3** on desktop/high (`GLOSSY_FLOOR_MESH`). | hoops players (4 phone / 3 desktop) | 2 | S | **6–8** | no | low (a one-time capture, ~0.4 MB at 128 px; the mirror is desktop/high only) |
| 8 | **The phone's sky is the raw photograph.** At Blossom it is a smeared blob behind the trees (`d0-portrait-onevone-blossom-d-play.jpg`); held sideways the 1v1's sky behind the hero is a flat purple gradient (`d0-landscape-onevone-d-play.jpg`); on a desktop the same dome is softened, clouded and hazed at the horizon (`d0-desktop-onevone-blossom-c-play.jpg`, `d0-desktop-arena-threes-d-play.jpg`). | the cheap half of `SkyDome.ts` on phones: the soften and the horizon haze band, no noise clouds (the fill a phone cannot spare). | upright sky views: Dunk, 3-Point, Blossom, the arena (3) | 2 | S | **6** | no (higher-resolution domes are art, §7) | medium-low (a few hundred sky pixels with an 8-tap blur) · phones, measured |
| 9 | **The Venice hub and the Coast have no middle distance.** The hub camera sees one tile repeated across an empty square with the palms far off (`d0-portrait-venice-d-play.jpg`, `d0-desktop-venice-d-play.jpg`); the Coast's far island is as crisp and saturated as the pier (`d0-portrait-coast-d-play.jpg`). `venue.veniceGroundV2` and `coast.oceanSurface` (built, OFF, §8) fix the ground and the sea, not the emptiness or the distance. | **mid-ground dressing** at the hub camera's distance from shipped kits (benches, bins, bikes, small palms: `public/models/props/{venice,city-suburban,nature}`), instanced, phone-culled by distance; **aerial haze** on the hub and the Coast where nothing fogs them (`Atmosphere.ts`' rule, per zone). | hub and Coast visits (3) | 3 | M | **4.5** | no | low–medium (Venice hub's budget row is tight: 46 / 56 draws — instanced only) · all tiers |
| 10 | **Desktop shadows are evenly soft.** The cascades use medium soft filtering: a shadow is as soft at the shoe as a metre away, so a jumper's shadow on the court does not tighten as they land (`d0-desktop-onevone-c-play.jpg`). | **contact-hardening shadows** (Babylon's `useContactHardeningShadow`, PCSS) on the cascades, desktop/high only. | desktop players (2) | 2 | S | **4** | no | none on phones (desktop/high only) |

**The top ten by need: 1 to 10 above.** Not findings (checked and fine at play distance): the Venice court's own surface (the
painted swell reads well, every tier), the Dunk's stalls, palms and sunset behind the rim, the home page's photo hero, tennis.
`assumption:` flatness and visibility are this lane's judgement from the pictures; what can be counted (casters, tiers, draws,
budget rows) is stated with each finding.

**Noted in passing, not a depth finding:** with `?location=canopy` or `blossom`, the game header still reads "Venice Beach Court"
(`d0-portrait-onevone-canopy-c-play.jpg`). Routed to whoever owns the header (`game-shell.tsx`); not in this plan.

---

## 4. The bar for a depth change to ship ON

LOOK-PASS-AUDIT §4, unchanged, with the tier rule made explicit:

1. **Clearly better pictures.** Before and after from `depth-walk.mts`: the same route, size and moment, `?perf=off` on both
   sides, in the same gate hold, **3 runs a side** (`--tag=pN-before-1..3`, `--tag=pN-after-1..3`), sheeted with `sheets.mjs`
   (same tiles, same order) and, for a close look, `crop-pair.mjs`. "Clear" = a person shown the two sheets unlabelled picks the
   after. Where a number exists it must move: e.g. phase 1's feet-pool contrast (court luminance under the feet ÷ beside them).
2. **Phone cost within the control's noise.** Phone tier (390x844, DPR 3, touch, 4x CPU): frame p95 and JS per frame from the PERF
   readout (`scripts/probes/look-audit/look-walk.mts perf`), **3 runs a side plus tennis in the same hold**, the change's p95 inside
   tennis's own run-to-run spread; the mode's `mobileBudget.json` row held (draws, meshes, texture MB, skinned bodies); **load**
   (READY on the phone tier, 3 runs a side) within 10 %, always measured when a texture, a model or a capture is added.
3. **Desktop/high-only effects** are measured on that tier (the same two checks with `--tier=desktop`, or `&tier=high`), **and
   must leave phone frames identical**: a pure test that the mobile tier resolves the feature off, the run's `[FEL-TIER]` lines,
   and the phone pictures of the before and after holds compared tile for tile.

Otherwise the phase ships **OFF** behind its knob, **whose off value restores today exactly** (a test pins the off value).
**Palette, mood and art-direction changes are the owner's call and ship OFF** with the A/B sheet — in this plan that covers
the body light balance's colour (phase 2 changes intensities, not colours; if the pictures differ but neither is plainly better it
is the owner's call), the arena's horizon picture (phase 7), and every colour or glow in the menus (phase 9). No tuned feel number
moves (camera distances, heights and FOV, speeds, timings): a phase that wants one adds a new knob at today's value, OFF. **The
existing look numbers in `moods.ts` and `KickerLight.ts` (`//TUNE` / "look numbers") are not edited**: a phase adds a new knob on
top whose off value is today.

---

## 5. The phases: 10, in 4 build lanes

Sizes: S ≤ 1 day, M 2–4 days. Every knob goes in `lib/feel-panel/knobs.ts` + `docs/FEEL-PANEL.md` (labels without
`' " & < >`), its off value = today, with a test of both ends. Every phase: before/after sheets on its own tag and the phone check
of §4. Pictures from `scripts/probes/depth-audit/depth-walk.mts`; phone readouts from `scripts/probes/look-audit/look-walk.mts perf`.

### Lane L — light and shadow (the shared rig; phone risk low; desktop-only effects gated)

**Phase 1 — Players stand on the court on a phone (M). Finding 1.**
- **Do:** (a) the feet pool: on the mobile tier the contact disc is darker under the feet and stretched along the sun's ground
  direction (a soft drop shadow), fading as now when the body rises; (b) the phone shadow map fitted to the play area: casters
  farther than a set distance from the play area stay out of the phone map (they keep receiving), so the frozen frustum covers the
  court, not the venue; (c) the star under the shoes: the phone map's ESM depth scale / bias measured and set so a shoe casts a
  pool, not wedges. Each half on its own knob; desktop and high untouched (they draw cascades).
- **Files:** `lib/babylon/visual/contactShadow.ts` (+ test), `lib/babylon/scene/ShadowCache.ts` (the frustum fit), `lib/babylon/scene/
  phoneCasters.ts` (+ test: the distance rule), `lib/babylon/scene/LightRig.ts` (the mobile generator's settings only).
- **Knobs:** `look.phoneFeetPool` (0 = today's disc), `look.phoneShadowFit` (0 = every caster, today).
- **Measure:** `depth-walk.mts --tier=portrait --only=onevone,threevthree,dunk,threepoint,arena-hoops` and `--tier=landscape
  --only=onevone,dunk`, 3 runs a side; the feet-pool contrast in a fixed crop (`crop-pair.mjs`); the phone check of §4 with the
  shadow-map casters counted (the PERF readout) and the shadow cache's re-bake count unchanged.
- **Bar:** §4; the star gone in all 3 after runs; a pool under every player in every upright frame.
- **Tier:** phones only (pure test: desktop/high resolve both knobs off).

**Phase 2 — Bodies with a light side and a dark side (M). Finding 3.**
- **Do:** a body-only light balance: the scene's hemisphere excludes skinned meshes and a body copy of it lights them at a lower
  intensity (a new per-mood multiplier on top of `moods.ts`, never editing it), so the sun and the kicker shape the torso; the
  kicker's strength follows how much of the subject's back the camera sees, so the rim shows from the Dunk's behind-the-player
  camera. No per-vertex work; no new material on bodies (the lights' include / exclude lists only).
- **Files:** `lib/babylon/scene/KickerLight.ts` (+ test), new `lib/babylon/scene/bodyFill.ts` (+ test), `lib/babylon/scene/LightRig.ts`
  (mount the body fill beside the kicker).
- **Knob:** `look.bodyFormLight` (0 = today; the body fill's share of the hemisphere, e.g. 0.6, set by the pictures).
- **Measure:** `depth-walk.mts` 1v1, 3v3, Dunk, the arena and the Venice hub at three sizes, 3 runs a side; a close crop of the
  hero (`crop-pair.mjs`) on the Dunk and 1v1; the phone check of §4 in 1v1 and the Dunk (the modes with the most bodies).
- **Bar:** §4. Lighting balance is near mood: if the bodies look different but neither plainly better, it is the owner's call and
  ships OFF with the sheet.
- **Tier:** all; measured on phone and desktop separately.

**Phase 3 — Reflections of the real place (S). Finding 7.**
- **Do:** the one-shot venue capture (`VenueReflection.ts`, today high only) on the desktop tier, and a 128 px capture on phones
  once at load (or skipped if load slips); the glossy-floor mirror for the Venice 1v1 and 3v3 court on desktop/high.
- **Files:** `lib/babylon/scene/QualityTier.ts` (`venueProbe` per tier, + test), `lib/babylon/scene/VenueReflection.ts` (the size per
  tier), `lib/babylon/scene/GlossyFloor.ts` (+ test: the two modes added).
- **Knobs:** `look.venueProbeTiers` (0 = high only, today; 1 = + desktop; 2 = + phones at 128 px), `look.glossyCourtOnes`
  (0 = today).
- **Measure:** desktop and upright pictures of 1v1, 3v3, Dunk, 3 runs a side, with a crop of the rim and the ball; **phone load
  time** (the capture is six renders at load) and texture MB against the rows; the phone check.
- **Bar:** §4; the phone half ships only if load holds within 10 %.
- **Tier:** the mirror desktop/high only (phone frames identical); the capture per its knob value.

**Phase 4 — The sky and the shadow edge, by tier (S). Findings 8 and 10.**
- **Do:** (a) phones get the sky dome's soften and horizon-haze band (no noise clouds) — the plugin's cheap half; (b) desktop/high
  cascades get contact-hardening (PCSS): sharp at the shoe, soft a metre away.
- **Files:** `lib/babylon/scene/SkyDome.ts` (+ test: a mobile path without clouds), `lib/babylon/scene/LightRig.ts` (the cascade's
  filtering only).
- **Knobs:** `look.phoneSkySoft` (0 = today's photograph), `look.desktopPcss` (0 = today's PCF medium).
- **Measure:** (a) upright Dunk, Blossom, the arena, 3 runs a side + the phone check; (b) desktop 1v1 and the Dunk during a jump, 3
  runs a side, the desktop frame check, and the phone pictures identical.
- **Bar:** §4 each half on its own.
- **Tier:** (a) phones; (b) desktop/high only.

### Lane V — the hoops sets (scene dressing; phone risk low)

**Phase 5 — Everything on the Venice set stands on the ground (S–M). Finding 2.**
- **Do:** (a) at load, a soft dark footprint decal under the base of every static prop on the hoops set (lamp posts, palm trunks,
  fence posts, stalls, benches, the hoop's pole), sized from its bounding box, through the shared ground-decal pool (one instanced
  draw), every tier; (b) on desktop/high, the near palm trunks and lamp posts registered as casters (the boardwalk's own caster
  hook in `veniceBoardwalk.ts`, not the rig's rule).
- **Files:** `lib/babylon/nexus/veniceBoardwalk.ts` (the dressing, + test), `lib/babylon/visual/GroundDecals.ts` (a footprint stamp,
  + test), `lib/babylon/visual/venuePropSets.ts` (which props get a footprint).
- **Knobs:** `venue.propFootprints` (0 = today), `venue.veniceTrunkShadows` (0 = today).
- **Measure:** 1v1, 3v3, Dunk, 3-Point at three sizes, 3 runs a side; draws and active meshes against the four rows (1v1 168 / 202,
  3v3 173 / 208, 3-Point 220 / 264, Dunk 144 / 173); the phone check; (b) on desktop only, phone frames identical.
- **Bar:** §4.
- **Tier:** (a) all; (b) desktop/high.

**Phase 6 — The other courts stand somewhere (M). Finding 4.**
- **Do:** under Canopy, Blossom and Night Rooftop (not Orbit): a ground disc in the location's ground colour with the shipped
  ground detail map, its edge in the location's fog; the court as a slab with a curb and a darker edge band; the court surface
  with grain and line wear from the shipped procedural detail map. The Venice court untouched.
- **Files:** `lib/babylon/nexus/courtLocations.ts` (the locations' `decorate`, + test), `lib/babylon/visual/groundTextures.ts`
  (read; a court preset only if needed, flagged).
- **Knob:** `venue.locationGroundV1` (0 = today).
- **Measure:** `depth-walk.mts --only=onevone-canopy,onevone-blossom` (+ a rooftop route added) at three sizes, 3 runs a side; the
  phone check in 1v1 on each court; texture MB against the 1v1 row (214 / 256 MB: the detail map is shared, 512 px).
- **Bar:** §4. The ground's colour comes from each location's own palette (no new palette).
- **Tier:** all.

### Lane W — the arena and the zones (phone risk low–medium)

**Phase 7 — The Physics Arena stands in a place (M). Finding 5.** *(Files of lane physics-arena: §5's routing note.)*
- **Do:** with `arena.setV1`'s set as the base: (a) a horizon ring from a shipped baked backdrop beyond the glass and the aerial haze
  over it; (b) a see-through glass backboard with a painted frame and square; the soccer goal's net from the shipped net lattice;
  (c) the pitch's grass and the court's floor from the shipped ground detail map.
- **Files:** `lib/babylon/arena/arenaSet.ts`, `lib/babylon/arena/arenaCourt.ts` (the board's material), `lib/babylon/arena/
  soccerPitch.ts` (the net and the grass), + tests.
- **Knobs:** `arena.horizonV1`, `arena.materialsV1` (0 = today).
- **Measure:** `depth-walk.mts --only=arena-hoops,arena-threes,arena-threepoint,arena-soccer` at three sizes, 3 runs a side; the
  phone check against the four `physics_arena*` rows (e.g. 95 / 114 draws, 54 / 65 MB).
- **Bar:** §4. Which backdrop (city, beach, stadium) is a look call: built with the default the pictures favour, **the choice
  shown to the owner**, ships OFF if the owner has not picked.
- **Tier:** all.

**Phase 8 — A middle distance for the Venice hub and the Coast (M). Finding 9.**
- **Do:** (a) the hub: instanced mid-ground dressing from the shipped kits along the paths at the hub camera's distance (benches,
  bins, bikes, small palms), distance-culled on phones, with phase 5's footprints under them; (b) the hub and the Coast: aerial
  haze where nothing else fogs them, from `Atmosphere.ts`' per-mood haze colour.
- **Files:** `lib/babylon/modes/VeniceHubMode.ts` (the dressing's mount line), new `lib/adventure/venice/midground.ts` (+ test),
  `lib/babylon/modes/CoastZoneMode.ts` (the haze line), `lib/babylon/scene/Atmosphere.ts` is lane L's: **read only** (the zones
  call `mountAtmosphere` with their own id).
- **Knobs:** `venue.hubMidgroundV1`, `look.zoneHaze` (0 = today).
- **Measure:** `depth-walk.mts --only=venice,coast` at three sizes, 3 runs a side; the phone check against `venice_hub` (46 / 56
  draws, 58 / 65 meshes) and `coast_zone` (136 / 164); load time (models added).
- **Bar:** §4.
- **Tier:** all; the dressing's count per tier.

### Lane S — the screens (CSS; phone risk none to low)

**Phase 9 — /play and the menus in layers (M). Finding 6.**
- **Do:** the /play hero continues behind the list as a dimmed, blurred layer with a slow scroll parallax; the family and game rows
  lifted with the shipped elevation tokens (`--fel-shadow-lift`, `--fel-highlight`); the hoops rows carry the procedural venue
  thumbnails; the app top bar as glass over the page (`--fel-glass`). No new colour, no new copy.
- **Files:** `app/play/page.tsx` (the layout), the play list's components under `components/play/**` (as found), `app/theme.css` (new
  elevation tokens only, additive), `components/shell/**` (the top bar).
- **Knob:** `ui.menuDepthV1` (0 = today).
- **Measure:** `depth-walk.mts --only=play,home` at three sizes (+ a scrolled frame), 3 runs a side; scroll frame time and INP on the
  phone tier (a blur behind a scrolling list is the one cost), CLS (budget 0.02), FCP within 10 %.
- **Bar:** §4; any new glow or colour is the owner's call (OFF).
- **Tier:** all; the blur dropped under `prefers-reduced-transparency` and on the low graphics choice.

**Phase 10 — The loading and end cards in depth (S). Finding 6.**
- **Do:** the hoops loading card and the place loading card as glass over the venue's picture in layers (picture, vignette, panel),
  a slow tilt-parallax on the picture (off under reduced motion); the end card's panel lifted the same way.
- **Files:** `components/games/boot-splash.tsx` (a caution file, LANES §3: the card's layers only), `components/games/
  place-loading-card.tsx`, `components/games/end-screen/end-screen.tsx` (the panel's layers only).
- **Knob:** `ui.cardDepthV1` (0 = today).
- **Measure:** the loading and end-card frames at three sizes, 3 runs a side; time to READY on the phone tier unchanged (3 runs a
  side + tennis); CLS.
- **Bar:** §4.
- **Tier:** all.

### Who holds what

| Lane | Phases, in order | Files it holds | Why this order |
|---|---|---|---|
| **L — light and shadow** | 1, 2, 3, 4 | `lib/babylon/scene/{LightRig,ShadowCache,phoneCasters,KickerLight,VenueReflection,GlossyFloor,SkyDome,QualityTier}.ts` (+ tests), new `scene/bodyFill.ts`, `lib/babylon/visual/contactShadow.ts` (+ test), `scripts/probes/depth-light/**` | 1 touches every phone frame and is the biggest need; 2 next (every frame, every tier); 3 and 4 are S |
| **V — hoops sets** | 5, 6 | `lib/babylon/nexus/{veniceBoardwalk,courtLocations}.ts` (+ tests), `lib/babylon/visual/{GroundDecals,venuePropSets}.ts` (+ tests), `scripts/probes/depth-venues/**` | 5 is the default court of every hoops mode |
| **W — arena and zones** | 7, 8 | `lib/babylon/arena/{arenaSet,arenaCourt,soccerPitch}.ts` (routed, below), `lib/babylon/modes/{VeniceHubMode,CoastZoneMode}.ts` (the two mount lines), new `lib/adventure/venice/midground.ts`, `scripts/probes/depth-world/**` | 7 is on Play by default and looks the most unfinished |
| **S — screens** | 9, 10 | `app/play/page.tsx` (layout), `components/play/**`, `components/shell/**`, `app/theme.css` (additive tokens), `components/games/{boot-splash,place-loading-card}.tsx`, `components/games/end-screen/end-screen.tsx` (panel layers), `scripts/probes/depth-screens/**` | 9 is every session |

**No file is held by two lanes.** Shared, additive, keep both sides on merge: `lib/feel-panel/knobs.ts` (+ `knobs.test.ts`),
`docs/FEEL-PANEL.md`, `docs/LANES.md`. **Read, never edited, across lanes:** lane V reads `scene/**` (lane L); lane W reads
`scene/Atmosphere.ts` and `visual/GroundDecals.ts` (it calls them); lane S reads `ui/venueThumbs.ts`. **Routing:**
- `lib/babylon/arena/**` belongs to lane **physics-arena** (LANES.md registry). The coordinator says that lane is idle; phase 7 runs
  only with the coordinator's go-ahead and that lane told, or is handed to lane physics-arena as its own phase.
- `VeniceHubMode.ts` and `CoastZoneMode.ts`: the Venice / Coast lanes' files (`lane/venice-hub` in `wt/plat-next`, the coast lanes);
  phase 8 touches one mount line in each — check they are idle first, else route the line.
- `boot-splash.tsx` and `game-shell.tsx` are caution files (LANES §3); phase 10 touches the card's layers only.
- Lanes L and W both need long gate holds for frame checks: not at the same time. Lane S's checks are short.

---

## 6. What waits on the owner (look calls, recommendation first)

- **The A/B sheets of every phase that ships OFF.** *Recommend:* phase 1 (players on the ground) and phase 2 (bodies in light and
  shade) first — the change every player sees.
- **Phase 2's body light balance**, if the pictures differ but neither is plainly better (it is close to mood).
- **Phase 7's horizon picture** (which shipped backdrop stands behind the arena) — a look call.
- **Phase 9's menu depth**, wherever it adds a glow or a colour.
- **The switch-ons already built** (§8) — independent of this plan; the depth pass measures against today's defaults, whatever the
  owner switches on meanwhile is re-measured as the new "before".

---

## 7. What needs the owner's art (GATE 0), apart from what code can do

**Needs art (Grok / Meshy / in-house Blender; the owner's, with a licence line):**
1. **Faces that read at play distance** — the athletes' face textures (eye sockets, brows, a mouth line) or a small face normal
   map; today a face at 1v1 distance is a blank oval on every tier (finding 3).
2. **Cloth folds** — a baked fold normal map for the jersey and shorts (the code's weave normal gives texture, not folds).
3. **The Physics Arena's own look** — its own set and horizon (phase 7 builds from shipped kits; a distinctive arena is art).
   *Already on LOOK-PASS-AUDIT §7.*
4. **Key art for /play's game rows** — today a procedural venue thumbnail at best (phase 9); a picture per game is art.
5. *Already known, not new:* crowd variety and skinned arms, higher-resolution sky domes, the story's creatures and bosses, the tee's
   shoulder shape (LOOK-PASS-AUDIT §7).

**Code can do, with what ships (the phases):** the phones' ground contact and shadow fit (1); the body light balance (2); the
venue reflections and the 1v1 / 3v3 mirror floor (3); the phone sky and desktop contact-hardening shadows (4); prop footprints and
Venice trunk shadows (5); a ground, a curb and surface detail for the other courts (6); the arena's horizon, glass, nets and grass
from shipped backdrops and kits (7); the hub's mid-ground and the zones' haze (8); layered menus and cards (9, 10).

---

## 8. Already built, waiting for the owner to switch on

Built by the 2026-11-24 look pass (or earlier) and OFF by default; **not proposed again here**. Each has its A/B in
`docs/FEEL-PANEL.md` or LOOK-PASS-AUDIT; this pass's pictures were taken with every one of them at its shipped default (OFF).

| Knob | What it adds to depth and detail |
|---|---|
| `look.phoneAA` | phone edge smoothing (FXAA always, or 2x MSAA) — edges stop stair-stepping |
| `story.gradeV2` | the story's colours stop being brightened twice (painted, not pale) |
| `story.worldDressed` | the story's textured ground and stone, trims, rails and the nature kit |
| `coast.oceanSurface` | a living sea with shore foam instead of the flat cyan sheet |
| `venue.veniceGroundV2` | the Venice hub's weathered slab and sand instead of flat tiled planes |
| `venue.courtDetailV2` | court lines and ground grain sharp into the distance (16x filtering; does not show on the rig) |
| `crowd.varietyV2` | each fan and crowd card its own height and shade (the black cut-outs behind the Dunk's rim) |
| `venue.iblEnvV1` | a real-sky image light — **no `.env` files exist in `public/env/`**, so on it still uses the procedural cube |
| `arena.setV1` | the arena's cage, lamps, benches and asphalt apron |
| `arena.soccerApron` | the soccer floor past the boards |
| `arena.teamRings` | team-colour rings at the arena 3v3's feet |
| `ui.firstRunCard` | /try's birth-date step on the sign-up card (crest, panel, glow) |
| older: `venue.stageLmV1`, `venue.freezeV1` | AO-baked mini-arena stage pieces (combat stages); freezing static venue meshes (a speed lever) |

---

## 9. Not measured, and assumptions

- Not measured: a real phone; the production deploy; colour on a calibrated screen; TVs; the replay and intro cameras (where bodies
  fill the frame: phase 2 should add them); Night Rooftop and Orbit; Combat, Boards, Racing, Party and Craft (the owner's "players
  see most" put the hoops, the arena, the zones and the menus first).
- Frame cost was not measured by this audit (no phase built); each phase measures its own against tennis (§4). The previous
  audit's phone readouts (LOOK-PASS-AUDIT §2.1) are the levels the phases start from.
- `assumption:` the black four-pointed star under the rival's shoes on the phone is the phone shadow map's ESM at a low texel
  density, not the contact disc: it does not appear on the high tier (cascades) and the disc is a soft round shape by construction.
  Phase 1 confirms it with the phone shadow map on and off (`?shadowcache=0`, the casters list).
- `assumption:` the bodies' flatness is mostly ambient balance (the hemisphere fill, the image light and the material floor lift add
  up), read from the code and the pictures; phase 2's first step is a three-way A/B (hemi on bodies at 1, 0.6, 0.3) before any
  change ships.
- `assumption:` Blossom's floating court is the location swap dropping the Venice scan's ground (`courtLocations.ts` keeps only the
  court props) with nothing put in its place; it was seen at both sizes and on both runs.
- `assumption:` the hub camera, the courts' play cameras and the arena's camera stay as tuned; nothing here moves a camera.

## 10. The pictures, and how to re-run

Scratch folder (the session's): `/tmp/claude-0/-home-user-Final-Evolution-Lab-2026-05-12-23-15-57/e156aa0c-5ac6-5a64-b2e0-57cb533692fe/scratchpad/depth-audit/`
- contact sheets: `depth-before-<area>-<portrait|landscape|desktop>.jpg` (areas 1 to 5, §2); `depth-ab-phone-vs-high-tier.jpg`;
  the crops `depth-crop-1v1-players-phone-vs-high.jpg`, `depth-crop-dunk-player-phone-vs-high.jpg`;
- every frame: `shots/d0-<size>-<route>[-a-loading|-b-ready|-c-play|-d-play].jpg`, the A/Bs `shots/ab-portrait-<route>-high-*.jpg`,
  with each run's JSON beside it (READY time, the tier and edge lines, errors).

```
# one gate hold = a build, the walks, the build deleted (≤ 30 min: the build is ~9.5 min, a 3D route ~35–110 s)
cd FEL-full-app
/home/user/wt/gate-run.sh 1790 scripts/probes/depth-audit/run-hold.sh <out> "--tier=portrait" "--tier=portrait --only=onevone-high,dunk-high,arena-hoops-high --tag=ab"
/home/user/wt/gate-run.sh 1790 scripts/probes/depth-audit/run-hold.sh <out> "--tier=desktop --only=<ids>" "--tier=landscape --only=<ids>"
node scripts/probes/depth-audit/sheets.mjs <out>/shots <out>                         # a phase: its own tag and prefix
node scripts/probes/depth-audit/crop-pair.mjs <out.jpg> x y w h scale <before.jpg> <after.jpg>
```
