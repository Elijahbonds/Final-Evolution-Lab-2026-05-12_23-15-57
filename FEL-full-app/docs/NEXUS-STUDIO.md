# Nexus Studio — the editor inside FEL (`/studio`)

**Owner decision, 2026-10-14:** "make sure my engine Nexus is the best editor/game developer in the world and creates my
app with it." The Nexus editor is built **inside FEL, at `/studio`**. That decision **lifts the SHIP FIREWALL** ("no
Nexus/Cell orchestration code in this repo") **for `/studio` only** — recorded in `docs/AGENT-OPERATING-RULES.md`.
First scope: all four tracks, phased — (1) venue/level editor, (2) AI game builder, (3) character/look editor,
(4) visual scripting. `/studio` stays **unlinked and flag-gated** until the owner says ship
(`lib/nav/reachability.test.ts` keeps `'/studio': 'HOLD — not shipped, deliberately unlinked'`).

Lane: `lane/nexus-studio`. This file is the architecture; the code lives in `lib/nexus-studio/**`,
`components/nexus-studio/**`, `app/studio/**`.

---

## 1. What exists (surveyed 2026-10-14 on `566beb28`) and what we reuse

| Where | What it is | Reuse |
|---|---|---|
| `app/studio/page.tsx`, `app/studio/layout.tsx` | The held `/studio` route: the layout redirects a guest to login, the page renders `StudioShell`. | The route and the login gate stay; the layout gains the flag gate (§6). The page becomes the Nexus Studio. |
| `components/studio/studio-shell.tsx` (1,581 lines) | **CELL**, the AI build studio: chat → BuildPlan → parallel "lanes" that write HTML/JS game files, a preview iframe, per-build costs, BYO provider keys. Talks to `/api/cell/*`. Hidden while `useAiStatus('studio')` is not `available` (the ABACUS kill switch). | **Track 2.** Mounted unchanged as the Studio's "AI builder" track. Its file is not edited (abacus-kill holds its guard lines). |
| `app/api/studio/{cartridges,credits,entitlement,partner-keys}` | Studio **Creator monetization** (M3 Track C): marketplace cartridge listings, overage credits, tier entitlement, partner API keys. All behind `STUDIO_CREATOR_ENABLED`. | Nothing in track 1. **None of them stores a project** — cartridges are marketplace listings with money attached — so there is no server save path to reuse (§3.3). Publishing a Studio venue as a cartridge is a later, owner-gated step. |
| `lib/studio-plan.ts`, `lib/studio-service.ts`, `lib/studio-credits.ts` | The monetization's tiers, metering and the STUDIO_CREDIT ledger. | Not touched. |
| `lib/nexus-client.ts` | Server-side client for the external NEXUS gateway (`NEXUS_GATEWAY_URL`, `NEXT_PUBLIC_NEXUS_ENABLED`). | Not used by the editor (no external calls). Track 2 may route AI builds through it later. |
| `components/creator/editor/**`, `lib/creator/editor/**` | The athlete **Creator** editor: one generic screen (tab strip, row stepper, preview) over the rated/trait/slot rows, and its `previewBinding`. | **Track 3** (character stats/traits) is this screen; the Studio links to it rather than rebuilding it. |
| `components/closet/studio/**`, `lib/creator/look/**` (incl. `look/studio/**`), `lib/babylon/creator/studio/**`, `app/dev/studio` | The **Closet Studio** (CREATOR-PLAN 4a–4f): the look document (`look/doc.ts`, versioned, sanitized, share codes), undo history (`look/history.ts`, coalescing groups), on-model handles, the stage rig, photo mode. | **Track 3** (character/look editor). Its document is what a Studio character references (§2). Its undo model (`History<T>` with coalescing groups) informed the command stack (§3.2). |
| `lib/babylon/core/ModeHarness.ts` | Every mode's mount: `createEngine` → `applyCanvasFit` → `detectRenderTier` → `mountLightRig` → SSAO → `mountBackdrop` → `autoInk` → `CameraDirector` → `def.load()` → `liftBlackMaterials` → `lights.adoptRest()` → `lights.captureVenue()`. | **The editor viewport runs this exact look stack, in this order** (§4). |
| `lib/babylon/core/NexusVenue.ts` + `nexus/NexusWebScene.ts` + `nexus/venueSpecs.ts` | `mountVenue(ctx, specId, { look })`: a typed venue spec (environment, ground, props, actors), a **PlaceLook** laid over it (sky, ground colours, backdrop, added props, CC0 prop set), the surround, the camera bounds. | **The venue is a PlaceLook over a spec** — the same seam every place pick already uses (§2.2). |
| `visual/VenueProps.ts` + `visual/venuePropSets.ts` | The Kenney CC0 kits, placed by named sets, thin-instanced. | Studio kit props become a registered set mounted by `mountVenueProps` — the production path. |
| `visual/meshyProps.ts` | The Meshy scans (`spawnMeshyProp`): hoop bus, sedan, store, stadium, goal… | Placeable. |
| `scene/LightRig.ts` (`captureVenue`) | Wave 1–3 systems mounted after load: **FixtureLights**, **SkyDome**, **Atmosphere**, **GlossyFloor**, **GroundDecals**, HeatHaze, SunShafts. | The Studio exposes them as components (§5); the rig still mounts them. |
| `visual/crowd/**` | The baked crowd: `StandSpec`, `CrowdVenue`, `mountCrowd`. | Crowd stands are placeable `StandSpec`s. |
| `premium/WeatherFx.ts`, `core/WeatherKit.ts` | Weather looks from a pick. | A venue setting. |
| `core/CameraDirector.establish`, `scene/broadcastShots.ts` | The broadcast intro and the replay angles. | Previewed in the editor; exported as the venue's intro / angles. |
| `config/mobileBudget.json`, `core/PerfMonitor.ts` | The phone ceiling (600 draws / 400 meshes / 256 MB) and the desktop one (1600 / 900 / 512). | The budget meter (§4.4). |
| `components/games/tv-hud/tokens.ts`, `app/theme.css` | The TV-HUD palette (`HUD_RGB`, `HUD_PLATE`) and the `--fel-*` theme. | The Studio shell's palette. |

## 2. The Studio document model (`lib/nexus-studio/doc.ts`)

One typed, versioned, serialisable **project**. JSON in, JSON out; `tsc` is the first validator and `sanitizeProject`
the second (anything imported is untrusted: unknown kinds are dropped, numbers clamped, strings capped, ids re-minted on
collision). `STUDIO_DOC_VERSION = 1`; `migrateProject` is the one place a v2 reads a v1.

```
StudioProject { kind: 'nexus-studio-project', version: 1, id, name, createdAt, updatedAt,
                venues: StudioVenue[], activeVenueId, characters: StudioCharacter[], scripts: StudioScript[] }

StudioVenue   { id, name,
                base:   { spec: VenueSpecId, target: PlaytestTarget }   // the spec it is laid over; the mode that plays it
                mood:   VenueMood                                       // LightRig + SkyDome + Atmosphere + fixture gain
                sky?:   { top, bottom, fog, sun, ambient?, fogDensity? } // PlaceLook.sky (the atmosphere's haze rides fog)
                backdrop?, paintedSky?, ground?: { color?, line?, kind? }
                baseDressing: 'keep' | 'none'                           // the spec's own CC0 set
                weather: WeatherPick, intro: 'none' | 'establish' | 'walkIn', replayAngles: ReplayAngle[],
                glossyFloor: boolean, crowdView?: { focus, eye, camera }   // CrowdVenue's look line
                objects: StudioObject[] }

StudioObject  { id, name, locked?, hidden?, t: { p: [x,y,z], ry, s } } & one of
  { type: 'specProp',  kind: PropKind, color? }        // NexusWebScene props (lamp, banner, podium, crowdTier, palm…)
  { type: 'kitProp',   kit, model, tint? }              // VenueProps CC0 kits
  { type: 'meshyProp', key: MeshyPropKey }              // the Meshy scans
  { type: 'fixture',   role: 'flood'|'lamp'|'bulb', color, height }   // FixtureLights' named fixtures
  { type: 'crowdStand', width, rows, step, posture, benches, gaps }    // visual/crowd StandSpec
  { type: 'decal',     kind: DecalKind, tint? }         // GroundDecals marks, kept alive
  { type: 'cameraMark', role: 'subject' }               // where the intro / replay previews frame the play

StudioCharacter { id, name, lookCode?: string }   // track 3: a Closet share code (lib/creator/look/shareCode), §10.2
StudioVenue.cast?: { player?: characterId }        // track 3: who the venue's hero is
StudioScript    { id, name, enabled, nodes: ScriptNode[], edges: ScriptEdge[] }   // track 4: an event → condition → action graph, §10.3
```

**Why a PlaceLook over a spec.** Every spec-mounted mode already accepts a `PlaceLook` (`mountVenue(ctx, spec, { look })`):
sky, ground colours, backdrop, added props and a CC0 set. The playing surface (size, markings) and the spec's gameplay
props (nets, goals, hoops) stay the spec's, because they are the game — so **a Studio venue cannot move a net or a rim**.
The export (`exportVenue`) turns a `StudioVenue` into a `StudioVenueExport` (versioned, `kind: 'nexus-studio-venue'`):
`{ spec, target, mood, intro, look: PlaceLook, kit: PropPlacement[], meshy, fixtures, crowd: CrowdVenue | null, decals,
weather, replayAngles, glossyFloor }`.

### 2.1 Save / load

- **Browser-local** (`lib/nexus-studio/storage.ts`): `localStorage['fel.nexusStudio.v1']` holds the project; autosave
  1.5 s after the last change, plus on `beforeunload`; the title bar shows the dirty state. Storage can throw (private
  mode, quota): the editor keeps working and says "not saved on this device".
- **Export / import JSON**: a `.nexus.json` download of the whole project; import runs `parseProject` (parse →
  migrate → sanitize) and replaces the project as one undoable command.
- **Play-test hand-off**: the venue export is written to `localStorage['fel.nexusStudio.playtest.<venueId>']` and the
  mode opens with `?venue=<venueId>`; `?venue=b64:<base64url JSON>` carries a small export inline.
- **No server persistence.** No existing `/api/studio` route stores a project (§1), and the brief forbids schema
  changes. Server save is an owner decision for later (a Cell project file, or a new table).

### 2.2 The command stack (`lib/nexus-studio/commands.ts`)

Every edit is a **command**: a label and a list of ops (`add`, `remove`, `patch`, `venue`, `replace`). Executing a
command records each op's **inverse from the document as it was** (the old value of a patch, the removed object and its
index), so undo is exact and needs no hand-written inverse. Pure and immutable: `execute(stack, cmd)`, `undo(stack)`,
`redo(stack)` each return a new stack. A command with the same `group` as the one before **coalesces** (a gizmo drag,
a slider, a colour drag is one undo step). Cap 200 steps. The stack's `savedAt` marks the clean point, so "dirty" is
"the present is not the saved one", and undoing back to the save makes it clean again.

## 3. The four tracks

| Track | Reuses from FEL | Outputs a mode can load | Phase |
|---|---|---|---|
| **1. Venue / level editor** | ModeHarness look stack, NexusVenue + PlaceLook, VenueProps/Kenney, Meshy props, FixtureLights, SkyDome, Atmosphere, GlossyFloor, GroundDecals, crowd, WeatherFx, CameraDirector intro, broadcastShots, the budgets | `StudioVenueExport` → `mountStudioVenue(ctx, export)`; proven on **Tiebreak** (`?venue=`, dev-only) | **now** (phases 0–2) |
| **2. AI game builder** | CELL (`StudioShell`, `/api/cell/*`), the ABACUS kill switch, `useAiStatus` | Phase 1 of the track: CELL edits a **StudioProject** (it emits commands, not files), so an AI-built venue is the same export as a hand-built one. Later: a mode definition from data (rules + venue + scripts). | next |
| **3. Character / look editor** | The Closet Studio (`lib/creator/look/**`, share codes, the stage rig, on-model handles), the Creator editor (`components/creator/editor`) | `StudioCharacter.lookCode` → `playerIdentity` as the Closet already applies it; NPC casts for a venue (who stands where) | after 2 |
| **4. Visual scripting** | `ModeContext` seams that are already data: `ctx.momentum.report`, `ctx.highlight`, `ctx.juice`, crowd `react`, `camDirector.establish`, `ctx.setHud` | `StudioScript` graphs (event → condition → action nodes) run by a small interpreter inside `mountStudioVenue` — venue triggers first (a zone fires a crowd cheer, a fixture flash, a banner), gameplay rules last | last |

## 4. The editor viewport (`lib/nexus-studio/stage.ts`, `viewport.ts`)

### 4.1 The same engine path as a mode

The viewport mounts **the harness's look stack in the harness's order**, calling the same functions:
`createEngine` → `applyCanvasFit` → `detectRenderTier` (or the meter's forced tier) → `new Scene` with
`metadata.felTier` and `metadata.felModeId = <target mode>` (so lookPolicy, the fixture/sky/decal gates and kit defaults
behave as in that mode) → `mountLightRig(scene, mood, tier)` → `mountSsao` when the tier asks → `mountBackdrop` →
`autoInk` → `CameraDirector` → **`mountStudioVenue` (the same function the mode's `load()` calls)** →
`liftBlackMaterials` → `lights.adoptRest()` → `lights.captureVenue(at)`.

Why not `runMode` itself: `runMode` is a game session — READY gate, body seam, session store, result sink, a 20 s load
watchdog, `assertSpawned` (a hero is required), the perf guard that pauses rendering outside play. None of that belongs in
an editor, and faking a hero to satisfy it would be a lie in the scene. The look stack is what "what you edit is what a
mode renders" needs. **Done (lane/nexus-studio-2):** the stack is ONE function, `lib/babylon/core/lookStack.ts`
`mountLookStack`, which `ModeHarness.mountMode` and `stage.ts` both call (the harness's perf guard and agent bridge run in
its `onScene` hook, the mood is read once in its `mood` thunk, the editor's cameras are made in `onCamera`), so the two
cannot drift by construction; `stage.order.test.ts` holds the order inside it and that neither caller makes a look-stack
call itself.

### 4.2 Editing

- Cameras: **orbit** (ArcRotate, default), **pan** (the same camera, right/middle drag), **fly** (Universal camera, WASD
  + mouse look). `F` frames the selection.
- Selection: a pick on any mesh walks up to its object's root (`metadata.studioId`); Babylon's `GizmoManager`
  (`@babylonjs/core`, no new dependency) for move / rotate / scale (`W` / `E` / `R`), attached to the object's pick proxy.
  A drag edits a ghost and **commits one coalesced command on release**; the venue then re-realises through the same
  runtime path, so the frame after the release is the frame the mode will draw.
- Grid (a `__studio_grid` line mesh, 1 m, 10 m majors) and snap (0.25 / 0.5 / 1 m, 15° rotation) — snapping is pure
  (`snap.ts`) and applied to the gizmo's drag steps.
- Every editor-only mesh is named `__studio_*`: LightRig never makes a `__` mesh a shadow caster, the glow and the mirror
  skip it, and the export never sees it.

### 4.3 What re-realises when

| Edit | Re-run |
|---|---|
| mood | the whole stage (the rig, the post chain and the IBL are mood-built; the harness mounts them once) |
| sky / ground / backdrop / base dressing / spec props / kit props | `mountVenue` with the new look (the venue is disposed whole: its sky, ground, surround and CC0 set) |
| meshy props, fixtures, decals, crowd, weather | that layer of `mountStudioVenue` |
| anything that adds or moves light fixtures | `lights.captureVenue` (FixtureLights, SkyDome, Atmosphere, GlossyFloor are mounted there) |

### 4.4 The budget meter

Live, from the engine, every half second: draw calls (the engine's per-frame counter, main pass + shadows), active
meshes, texture MB (the engine's texture cache, render targets excluded — the capture rigs' measure) and skinned bodies,
against **the phone ceiling** (`mobileBudget.json` `ceiling`: 600 / 400 / 256 MB / 16 bodies), **the desktop ceiling**
(`PerfMonitor.DESKTOP_BUDGET`: 1600 / 900 / 512 MB), and the target mode's own measured row where it has one (Tiebreak has
none; its venue's spec is tennis, so the `tennis` row is shown as the reference). The numbers are the current tier's;
the meter's **Phone** switch rebuilds the stage on the `mobile` tier so the phone column is measured, not estimated.

## 5. Track 1: the shared systems as components

| System | In the Studio | How the mode gets it |
|---|---|---|
| Fixture lights (FixtureLights, A9.5) | `fixture` objects: a pole and a lit head named for its role (`flood_`, `lhead_`, `lantern_`), the colour picked | `findFixtures` discovers them in `captureVenue` (desktop/high), exactly as it finds a venue's own lamps |
| Sky dome / mood (SkyDome, A9.11) | venue `mood`, `sky`, `backdrop`, `paintedSky` | the mode's mood getter (Tiebreak) and the PlaceLook |
| Atmosphere (A9.11) | `sky.fog` / `sky.fogDensity` | PlaceLook → the venue's fog; the rig's Atmosphere keeps its own gate |
| Glossy floor (A9.7) | venue `glossyFloor` + ground kind `court` | **routed**: `GlossyFloor.mountGlossyFloor` reads the place's ground kind from `readPlaceLook(modeId)`, which knows no Studio look. One line (read `scene.metadata.felStudioGround` first) — `docs/NEXUS-STUDIO.md` §8 |
| Ground decals (A9.14) | `decal` objects (scuff, foot, carve, tyre) | a Studio-owned pool (`mountGroundDecals`) refreshed before a mark would fade, so placed marks stay; **routed**: a `persist` stamp option would make the refresh unnecessary |
| Crowd stands (A9.9) | `crowdStand` objects (a `StandSpec` each) + the venue's `crowdView` | `mountCrowd(scene, { stands, focus, eye, camera })` |
| Weather | venue `weather` (a `WeatherPick`) | `mountWeatherFx(scene, lights, WeatherKit.fromPick(pick, family))` |
| Broadcast intro / replay angles (A9.12) | venue `intro` and `replayAngles`; Preview runs the real `CameraDirector.establish` and `replayShot` | the mode's `intro` getter (Tiebreak); replay angles wait for a mode that replays and reads them |

**Play-test.** "Play-test" writes the export and opens `/dev/mode/tiebreak?venue=<id>` (dev). Tiebreak's three
dev-only lines: `get mood()`, `get intro()` and `look:` read `studioVenueFor('tiebreak')`, and `load()` mounts the
export's extras. With no `?venue=` (and always in production) every line resolves to exactly what Tiebreak shipped with.

## 6. The flag

`NEXUS_STUDIO_ENABLED` (server, read per request in `app/studio/layout.tsx` through `lib/flags.ts`
`isNexusStudioEnabled()`). Off — the default — `/studio` is a 404 for everyone, before the login check. The existing
`STUDIO_CREATOR_ENABLED` is the paid surface (credits, cartridges); reusing it would open the editor and the paid surface
together, so the editor has its own. **assumption:** a server flag (no rebuild to flip) rather than a `NEXT_PUBLIC_` one.

## 7. The firewall change

`docs/AGENT-OPERATING-RULES.md`, SHIP FIREWALL: "lifted for /studio (Nexus Studio) by the owner 2026-10-14; see
docs/NEXUS-STUDIO.md". The line stays; everywhere outside `/studio` (and its `lib/nexus-studio`, `components/nexus-studio`
code) the firewall still holds.

## 8. Routed (files other lanes hold or changed in the last 24 h)

All three landed on `lane/nexus-studio-2` (2026-10-14), each flagged `shared file:`:
- `lib/babylon/scene/GlossyFloor.ts`: `mountGlossyFloor` reads `scene.metadata.felStudioGround` before the place look's
  ground kind — a Studio venue's glossy floor reaches the viewport and the mode.
- `lib/babylon/visual/GroundDecals.ts`: `stamp(…, { persist: true })` — a kept mark never fades and the ring steps over it;
  the Studio decal layer stamps once (the refresh is gone).
- `lib/babylon/core/ModeHarness.ts`: `mountLookStack` extracted (§4.1). A/B on the real harness (seeded, stepped): same
  meshes, materials, lights, cameras and clear colour; frame differences inside the old build's own run-to-run noise.

## 9. Status (2026-10-14, lane/nexus-studio)

**Built and proven on the capture rig** (esbuild bundle + Playwright/SwiftShader, no `next dev`; shots in the session
scratchpad `nexus-studio/`):

- The shell: four tracks (Venues · AI builder · Characters · Scripts), project name, undo / redo with the step's label,
  save state ("Saved on this device"), save, export, import, Play-test. Scene tree (venues, grouped objects, hide, lock),
  asset browser (search; click to place at the view's centre, drag into the view to place there), inspector (every
  object kind; the venue's light, sky, haze, ground, dressing, weather and broadcast camera), toolbar, shortcuts.
- The viewport on the mode's own look stack: a 32-object demo venue (night mood, own sky, city horizon, floor and line
  colours, 4 floods + 6 lamps lit by FixtureLights' 10 clustered lights, two seated bleachers built by the real crowd,
  6 palms + bushes + a banner tower through VenueProps, the hoop bus and a sedan through meshyProps, a banner and flags
  through the PlaceLook, decals) imports, draws and edits; delete → undo restores it in the live UI (32 → 31 → 32).
- Previews: a replay angle (`low`) and the walk-in intro (crane, letterbox) through the real director.
- The meter: the demo venue measures desktop 331 / 1600 draws, 69 / 900 meshes, 59 / 512 MB; on the Phone switch (the stage
  re-mounted on the mobile tier: crowd cards, no fixture lights, one shadow map) 65 / 600 draws, 58 / 400 meshes,
  53 / 256 MB. Tiebreak's reference row is tennis's (115 draws, 141 MB measured on a phone).
- Play-test: the button writes the export and opens `/dev/mode/tiebreak?venue=<id>&place=home`; Tiebreak loads the same
  export through `?venue=` and draws the same venue (night, floods, lamps, palms,
  bleachers with fans, banner), opens on the walk-in intro and hands back its own fixed camera when the intro ends.

**Not done / known gaps** (each is a next step, not a hidden failure):
- ~~Glossy floor and persistent decals wait on the routed one-liners (§8)~~ — landed on `lane/nexus-studio-2` (§8) and wired
  (checked again in round 4, §11.5).
- ~~Replay angles are exported but only a mode that replays reads them~~ — live in Football Rush since round 4 (§11.4).
- The editor shows the drag on a proxy box and re-draws the real prop on release (a kit prop is a thin instance).
- No server save (no route stores a project; §2.1). ~~No multi-select, copy/paste between venues, or prefab groups yet~~ —
  round 4 (§11.1–§11.3).
- Play-test runs in a development build only, by design (the load path is dev-only).

**Next, by track:**
- Track 1 polish: multi-select + group move, prefab stamps (a "lamp row", a "bleacher pair"), a second play-test mode
  (Football Rush: it already replays and runs the intro, so replay angles become live), the routed one-liners.
- Track 2 (AI builder): CELL emits Studio commands (`lib/nexus-studio/edits.ts`) instead of files — "put a night
  crowd on the east side" becomes a reviewed command list on the same undo stack; the ABACUS kill switch still gates it.
- Track 3 (characters): a project character is a Closet share code; casting places it (the rival, the crowd's variety)
  through `playerIdentity`; the Closet Studio stays the editor.
- Track 4 (scripts): event → condition → action graphs over `ctx.momentum`, crowd `react()`, juice, HUD banners, the
  director; venue triggers first, interpreted inside `mountStudioExtras`.

## 10. Tracks 2–4 (2026-10-14, lane/nexus-studio-2)

### 10.1 Track 2: the AI builder — CELL answers with Studio commands

The AI builder track has two halves: **Build the venue with CELL** (new) beside CELL's game-file `StudioShell` (unchanged).
A creator types "a night beach court with floodlights and a packed far stand"; `POST /api/cell/venue` asks CELL (its
existing `builder` role, JSON mode) for **edits in a closed vocabulary** — `venue` (settings), `place` (a catalog item),
`row` (a line of them), `clear` — and the panel shows them as a reviewed list; **Apply** runs them as **one command**
("AI: …") on the same undo stack a hand edit uses.

- **Untrusted, twice.** The route sanitises the answer and the browser sanitises it again (`lib/nexus-studio/aiEdits.ts`):
  only catalog items (no gameplay prop exists there), every number clamped, rows and answers capped, prototype keys never
  read, and every placed object through `doc.ts sanitizeObject` / every setting through `sanitizeVenue` — the import
  path's own sanitisers. Ids are minted by the Studio. Nothing is evaluated; the model's text is never returned.
- **The route** (`app/api/cell/venue/route.ts`): the ABACUS kill switch first (503 coming soon before the session, the body
  or the database), signed in, a rate limit per account (6 a minute, 120 a day), **teens (13–17) and adults** (DB `dobYear`;
  owner 2026-10-14, "Teens too" — was adults only), a capped body. The prompt carries the venue's settings and placements —
  never the account, a character, a look, an age or any health number. No new env or secret.
- **Who (`lib/nexus-studio/aiAccess.ts`).** The lines are the account screen's own (`lib/privacy/ageScreen.ts`
  `ageScreenOutcome`): 'teen' and 'adult' are answered; 'blocked' (a year gap of 13 or less: may still be 12) and an unknown
  age (no year, a bad year) get a neutral 403 `ai_builder_unavailable`. Under 13 stays blocked because nothing in the repo
  lets an under-13 use an AI feature, guardian consent or not: the age screen keeps an under-13 from having an account at all,
  and guardian consent (`lib/consent/guardianGate.ts`) gates health data, never an under-13's access. No guardian step is
  added for a teen (assumption: the builder sends no account or health data, so the health-data gate does not apply).
- **The panel** asks `useAiStatus('studio')` and sends nothing unless the server says the AI is available.

### 10.2 Track 3: characters — a Closet share code, worn through playerIdentity

A project character is a Closet share code. The venue inspector's **Cast · Player** slot picks the player's own look, a
project character, a look **from my Closet** (each saved look encoded as the Closet's Share does; a minor's looks come from
the device copy, as every mode reads them) or a **pasted code** (decoded before it is added). The Characters track lists them.

- **The export carries the decoded look** (`cast.ts`): the mode's side is synchronous and re-sanitises it with the Closet's
  own sanitisers. `mountStudioFor` seats `castIdentity` with `primeIdentity` before the mode's `load()` spawns its hero, so the
  mode's own spawn (`CharacterLibrary.spawn` → `resolveIdentity` → `urlForHeroBody` → `applyIdentity`) dresses it; dispose
  forgets it. TiebreakMode is unchanged.
- **Height and build (owner 2026-10-14, "Own height and build"; was the standard frame):** a cast wears the frame its code
  carries (clamped to `COSMETIC_CLAMP`), visual only, in a mode whose fairness review allows it (`targets.ts castFrame`;
  Tiebreak today) — §10.5. Everywhere else it plays on the standard frame (`proportions: null`).
- **The viewport** stands the cast on the mode's hero spot on the real rig (`castLayer.ts`: the same spawn, identity and idle).
  RIG-ADJACENT; GATE 0 (`scripts/gate0-animation-verification.ts`) passed before it: 39 / 0.

### 10.3 Track 4: visual scripting — event → condition → action, presentation only

Graphs are data in the project (`scripts.ts`), edited in a React + SVG node editor (`script-editor.tsx`, no dependency):
drag nodes, drag from a port to connect (illegal or looping wires refused), Delete, pan, zoom, a node inspector per spec.

| Events (listen) | Conditions | Actions (presentation) |
|---|---|---|
| Point scored (me/them/any: the HUD the mode posts), Momentum report (`onReport`), Momentum tier (`onTierChange`, up/down), Play starts / ends (the phase), Timer (every/once, play clock), Zone enter (the hero's spot) | Compare (myScore, theirScore, lead, momentum, elapsed, fires), Cooldown, Chance | Crowd reaction (`crowd.react`), Effects burst (`EffectsKit.burst`), HUD banner (tv-hud `HudBanner`, the `studioBanner` key), Camera shot (`camDirector.establish`, or the mode's `ctx.highlight` replay), Light pulse (the venue's Studio fixture heads), Sound cue (`SoundKit` SFX bus) |

- **The interpreter** (`interpreter.ts`) walks a graph when the host says an event happened and hands actions to a sink as
  data: acyclic, depth-capped, 8 actions a second at most. It imports only `scripts.ts` and `doc.ts`.
- **The host** (`scriptHost.ts`, mounted by `mountStudioExtras`, so only with a dev-only `?venue=`) listens and does
  presentation; bursts, light pulses and camera shots respect reduced motion. Its HUD tap hands every mode update to the
  harness unchanged first and writes only `studio*` keys; dispose restores the harness's own `setHud`.
- **`interpreter.wiring.test.ts`** proves it: the interpreter's whole value-import graph is `{interpreter, scripts, doc}`;
  the host imports nothing that scores, judges, times, pays or tunes, and never reports, ends, cards, resets or reads the
  multiplier, in any spelling.
- **Proven in the Tiebreak play-test:** the export carries the enabled scripts; "Point won → cheer" (onScore me → cooldown →
  crowd cheer + banner + confetti) fires on a point the bot wins, drawn by the dev runner's HudBanner.

### 10.4 Next

- Track 2: CELL proposing scripts and casts too (the same review-then-apply step); a CELL "explain this venue" pass.
- Track 3: a rival / crowd casting slot (the rival is a roster body: casting it needs the roster's say); the Closet Studio
  opened from a character ("Edit in the Closet").
- Track 4: more events as modes expose them as data (a rally length, a replay ending), per-venue scope for a script, a
  minimap of the graph; a second play-test mode (Football Rush replays: the replay shot becomes live).
- Owner calls, answered 2026-10-14: the AI builder is open to teens 13–17 (§10.1); a cast keeps its own height and build,
  visual only (§10.5).

### 10.5 Cast fairness (owner 2026-10-14: "Own height and build" — needs a scoring-fairness review first)

**Question.** A cast now draws at its character's own height and build. Can that change a score, a judgement or an outcome?
Reviewed on `lane/nexus-studio-3` by measuring, not by reading imports. RIG-ADJACENT; GATE 0 passed first (39 / 0).

**Which modes a cast can play.** `primeIdentity(castIdentity(…))` is called in one place, `runtime.ts mountStudioFor`, and one
mode calls that: **Tiebreak**, and only with a dev-only `?venue=` (`studioLoadAllowed` is false in a production build). The
editor's `castLayer` stands the cast in the viewport (no rules run there). `racing/raceLook`'s `primeIdentity` is the race's own
player look, not a cast. Tiebreak's rival is a tinted spawn — an opponent (`CharacterLibrary.decideRole`) — and never wears the
session identity. So the review is Tiebreak's.

**Where the scale lives.** `applyIdentity` → `applyProportions`: height on the root, build on the root's girth (x, z), clamped to
`COSMETIC_CLAMP` (height 0.96–1.04, build 0.94–1.08); reach frozen at 1; the scale recorded on the root (`playFramePoint`).
`playScales` spawns every body at exactly 1.0 in a ranked session or a `STANDARD_FRAME_MODES` mode (dunk, dunkduel, threepoint,
onevone, threevthree) whatever the identity says. On the real kit body (`fel-kit-female.glb` through the real spawn and identity
pipe, NullEngine): head 1.506 m at 1.04 / 1.08, 1.389 m at 0.96 / 0.94, 1.446 m standard; shoulders 0.404 / 0.320 / 0.352 m; the
forearm-to-hand bone 0.251 / 0.227 / 0.237 m in the world (the arm's joints are frozen, but the root's scale still carries it) —
which is why the review is about what the mode READS. The same cast forced to `'own'` in onevone spawns at 1.0000 / 1.0000.

**Tiebreak, channel by channel** (`TiebreakMode.ts`, `core/TiebreakBlitz.ts`, `core/TiebreakFlight.ts`):

| Channel | What Tiebreak does | Reads the scaled body? |
|---|---|---|
| Hit / reach radius | None exists. A swing is judged by `TiebreakBlitz.swingTiming` (the ball's clock against the window) and the side pressed against `state.incoming`; `commitSwing` takes the state, the side, the RNG, `reactBase`, the feel and `aiNets` — no position, no hand, no racket. `TiebreakBlitz.ts` imports nothing. | no |
| The return's flight | `hitFrom` is the ball's position on `TiebreakFlight`'s fixed path (`NEAR_Z`, `FAR_Z`, `BOUNCE_AT`), never the hand | no |
| The AI's net roll | `aiNets(rally, rng)` | no |
| Jump height | Tiebreak has no jump | n/a |
| Collision capsules | None: no physics, no collider. The roots slide to x = ±1.7 m at a fixed z (a position, not a scale) | no |
| Camera framing that feeds aim | `snapTo(player root, rival root)` once at load; the `court` preset's fixed `targetHeight` 1.35 m; the harness never steps it. The input is left / right timing — there is no aim | no |
| Score and the end | `postedScore(myPts, bestRally)` and `ctx.end` — counts only | no |
| Which arm swings | `sideOfRigHand` reads which side the right shoulder is on in the root's frame — a positive scale cannot flip a sign (shoulders ~0.35 m apart, the threshold 0.02 m). Picks the drawn clip | drawing only |
| Ground lock, player ring, frame guard, sweat, light capture, QA probe | Floors the root and hips; draws the indicator; re-centres a lost camera; effects; diagnostics | drawing only |

**Measured** (`lib/nexus-studio/castFairness.test.ts`, helper `tests/helpers/tiebreakRally.ts`): the real Tiebreak mode on a
NullEngine, loaded through the real Studio path (`?venue=b64:` → `mountStudioFor` → `primeIdentity`), its hero dressed by the real
`resolveIdentity` → `applyIdentity` (CharacterLibrary's own two calls) on a stand-in body with a real skeleton (a GLB cannot load in
vitest), the real `CameraDirector` and `GroundLock`, a fixed seed, and a scripted player that reads what a person sees (the ring and
the ball's side). One whole match — 9–11, best rally 4, 36 presses, 3,933 frames, every judgement (returned, too early, wrong side,
ace, warm-up) — is **bit-identical** for a 1.04 / 1.08 cast, a 0.96 / 0.94 cast and no cast: every score, HUD line, clip, sound,
ball position, ring state, camera position and target, and the end. The drawn body is not: root 1.1232 / 1.04 against 0.9024 / 0.96,
the head 13 cm apart. Mutations the test catches: the reaction window scaled by height; the return leaving from a hand height; the
camera framing the head; the slide spot scaled by build; `castFrameFor` always standard or always own; the export dropping the frame;
`castIdentity` ignoring or defaulting the frame.

**Decision.** Tiebreak: `castFrame: 'own'` — the frame is drawn, never scored. Any other mode: `'standard'` (`castFrameFor` answers
'standard' for a mode with no target row) until its own review says otherwise; a ranked or standard-frame mode spawns at 1.0
regardless. No gameplay value, no tuned number and no TiebreakMode line changed: Tiebreak's rules already read none of the body.

**Not covered here.** A real device look at the play-test (the drawn height difference on screen) — the owner's eye. The real GLB
was measured for the scale, not driven through a match (vitest cannot load it). The Closet's Studio/photo `presentation` size is not
carried (it is the Closet stage's own); reach stays frozen.


## 11. Round 4, track 1: the editor (2026-10-16, lane/studio-4a)

Owner 2026-10-16: "Nexus Studio next round". Five items; each is one undo step wherever it edits, and undo is exact (every op
records its own inverse, §2.2).

### 11.1 Multi-select and group move (`group.ts`, `viewport.ts`, `viewport-panel.tsx`, `scene-tree.tsx`)

- **The selection is a list** (UI state, never the document; the last id is the primary, so `selected` / `setSelected` keep
  their meaning for every older caller). In the view: a click selects one, **Ctrl/⌘-click** toggles (a Ctrl-drag still pans),
  **Shift-click** toggles, **Shift-drag** draws a box that adds what it frames; with the **Select tool (Q)** a drag from empty
  ground draws a box that replaces the selection. **Ctrl/⌘+A** selects every visible object. In the scene tree: click,
  Ctrl/⌘-click to toggle, Shift-click for a range in the tree's own order.
- **The box** is drawn in the DOM; a capture-phase listener takes the pointer before the canvas, so the camera never orbits
  under it. `idsInRect` projects each proxy's centre the way Babylon's own pick un-projects (render pixels × the hardware
  scaling level), and skips anything behind the camera.
- **The group gizmo.** With more than one object the gizmo grabs a pivot at the movable members' centre (the middle of their
  positions' box). While it drags, the members' proxies follow it rigidly (`applyDelta`: p' = pivot + move + R(turn)·(scale·(p −
  pivot)), ry' = ry + turn, s' = s·scale; a crowd stand keeps its own size). On release the GROUP's delta is snapped (the grid
  step, the turn step, the scale step), so the members keep their spacing exactly, and handed up as **one command**
  (`groupTransformCommand`). Locked members stay put.
- **Delete, hide and lock** take the whole selection, one step each (`groupDeleteCommand`, `groupFlagCommand`: if any member is
  off, all go on; else all go off). A tree row's eye / lock acts on the whole selection when the row is in it; **H** / **L** on
  the keyboard. The arrows nudge the group one grid step (consecutive nudges coalesce). The inspector shows the group's panel:
  its make-up, duplicate, copy, delete, hide, lock, turn ±15°, save as stamp.

### 11.2 Copy / paste / duplicate (`clipboard.ts`)

**Ctrl/⌘+C** copies the selection (a deep copy about its centre) into the editor's clipboard — editor state, so it outlives a
venue switch and a track switch. **Ctrl/⌘+V** pastes into the active venue — the same one or **another venue of the project** —
centred on the view's centre; pasting again over the source with the camera unmoved steps one offset (1 m, x and z) further
each time. **Ctrl/⌘+D** is copy + paste-over-itself in one step. Every pasted object gets a **fresh id**, goes through the import
path's own sanitiser (`sanitizeObject`) and arrives unlocked; a paste that would pass the venue's 600-object cap is refused whole.

### 11.3 Prefab stamps (`stamps.ts`, `stamp-shelf.tsx`)

A third left tab, **Stamps**. The built-in shelf is made from catalog items (so every piece is something the asset browser can
place and the export knows): **Lamp row** (5 lamp posts), **Bleacher pair** (two seated bleachers facing across 24 m), **Flood
corner set** (4 floods on a 36 × 24 m box, each tipped at the middle), **Palm avenue** (10 palms), **Lantern string** (6
lanterns). **Save selection as stamp** keeps the selection, re-centred on its own middle, in the project
(`StudioProject.stamps`, optional — **no version bump**: an older reader drops the key, a newer one reads a project without it;
sanitised to 32 stamps × 64 objects). Placing a stamp (click: the view's centre, snapped; or drag it into the view) is **one
command** with fresh ids; renaming coalesces per stamp; deleting a stamp leaves its placed copies. New ops: `addStamp`,
`removeStamp`, `patchStamp` (the last removal drops the key, so undoing the first save is exact).

### 11.4 Football Rush: the second play-test target (`targets.ts`, `runtime.ts`, `stage.ts`, `FootballRushMode.ts`)

- **The row** (`targets.ts football`): spec `football_rush`, the `gridiron` preset, `crowdVenues` FOOTBALL's look line, the
  `football` budget row, `/dev/mode/football?venue=` (dev only). The inspector's **Plays in** switches a venue between Tiebreak
  and Football Rush in one step.
- **The mode's opt-in** (`FootballRushMode.ts`, shared file, Tiebreak's shape): `get mood()` → `studioMood('football',
  'nightGame')`, `get intro()` → `studioIntroOr('football', 'walkIn')` (the venue's choice, 'none' included), the look line
  `studioLookFor('football') ?? readPlaceLook('football')`, `mountStudioFor('football', ctx)` + its dispose, and
  `angles: studioReplayAngles('football')` on the touchdown `ctx.highlight` — **so a venue's replay angles are LIVE** (in the
  order ticked; none ticked = the director's own cut). With no `?venue=`, and always in production (`studioLoadAllowed`), every
  line resolves to exactly what the mode shipped with (`football.test.ts`). No gameplay value, timing window, weather modifier or
  tuned number changed.
- **What the mode keeps.** Football Rush steps its own director (a follow camera), so the Studio adds no intro stepper there
  (`stepsOwnDirector`). Its **weather is gameplay** (rain softens the cut, snow drags the run) and stays the start screen's pick:
  a venue does not set it — the export carries `'natural'` and the inspector says why (`modeWeather`). It lays its own turf over
  the spec, so a glossy floor is not offered or exported for it. A cast plays on the **standard frame** (no fairness review yet,
  §10.5 "any other mode").
- **The editor** stands the mode's own field in the viewport — `VenueKit.buildGridiron` and `mountFootballFx` with the mode's
  own arguments — and hides the spec's ground under it as the mode does (`venue_ground_under`). Editor-side only; the mode
  builds its own.

### 11.5 The routed one-liners (§8), checked again

Both are on this branch and wired: `GlossyFloor.mountGlossyFloor` reads `scene.metadata.felStudioGround` first (the stage and
`mountStudioExtras` set it from the venue's `glossyFloor`; `GlossyFloor.test.ts` holds the read), and the decal layer stamps
once with `GroundDecals`' `persist` (no refresh; `stage.smoke.test.ts` "placed marks stay" runs three pool lives). Nothing left
to route. §9's two "waits on the routed one-liners" lines were stale and are struck.
