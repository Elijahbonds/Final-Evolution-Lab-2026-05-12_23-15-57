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

StudioCharacter { id, name, lookCode?: string }   // track 3: a Closet share code (lib/creator/look/shareCode)
StudioScript    { id, name, nodes: [], edges: [] } // track 4: the graph, empty until phase 4
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
mode renders" needs, and `stage.order.test.ts` reads `ModeHarness.ts` and fails if the harness's order or calls change, so
the two cannot drift silently. **Proposal (routed to movement-play, who holds ModeHarness):** extract
`mountLookStack(def, canvas)` from `mountMode` so both call one function.

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

- `lib/babylon/scene/GlossyFloor.ts` (vis-hoops-dunk, 14 h): in `mountGlossyFloor`, read
  `(scene.metadata as { felStudioGround?: string } | null)?.felStudioGround` before `readPlaceLook(modeId)?.ground?.kind`.
- `lib/babylon/visual/GroundDecals.ts` (vis-race/vis-board, 16 h): a `persist?: boolean` stamp option (born = a sentinel
  that `decalAlpha` reads as 1), so a placed mark needs no refresh.
- `lib/babylon/core/ModeHarness.ts` (movement-play): extract `mountLookStack` (§4.1).

## 9. Status

Phase 0 (this doc), phase 1 (shell, flag, viewport) and phase 2 (track 1) are on `lane/nexus-studio`; the status of
each piece is in the lane's closing report and the commits.
