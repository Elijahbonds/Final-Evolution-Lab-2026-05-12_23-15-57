# Handoff — Babylon 9 + AAA rendering

Branch: `babylon9-aaa-rendering` · **local only, not pushed** · 3 commits on top of `20967de`.

```
dcd9fb7  Add opt-in IBL contact shadows, guarded off on WebGPU where they render black
163ffab  Make ZoneTintPlugin emit WGSL as well as GLSL, unblocking the WebGPU backend
d074ef0  Upgrade Babylon 6.49 -> 9.23 and add the IBL environment the renderer never had
```

## State: everything below is done and verified

| Item | Status |
|---|---|
| Babylon 6.49 → 9.23 | Done. Type-clean and build-clean with **zero** code changes. |
| Procedural IBL environment | Done. The big win — see below. |
| `TintMaterialPlugin` WGSL | Done. Emits both shader languages. |
| WebGPU backend | Works, verified on Apple Metal-3. **Opt-in.** |
| IBL contact shadows | Works on WebGL2. **Opt-in.** Hard-blocked on WebGPU. |
| Crossfade orphan bug | Found and fixed (pre-existing, unrelated to the upgrade). |

**Tests:** 56 headless checks green — `environment-ibl-tests` (36), `crossfade-orphan-tests` (7), `dunk-system-tests` (13).

```bash
npx tsx scripts/environment-ibl-tests.ts && npx tsx scripts/crossfade-orphan-tests.ts && npx tsx scripts/dunk-system-tests.ts
```

## The headline fix

`scene.environmentTexture` was **never set anywhere in this codebase**, so every
PBR material reflected nothing and metals rendered near-black. `lib/babylon/scene/EnvironmentIBL.ts`
now generates the cube procedurally from each venue's own mood palette — linear
space, real HDR sun energy, no asset shipped.

Watch out: `liftBlackMaterials` used to clamp metalness to 0.25 to *hide* the
missing environment. That rescue is now conditional on there being no environment.
Making it unconditional again silently cancels the entire fix.

## Feature flags (both default OFF, set in `.env.local` which is gitignored)

```
NEXT_PUBLIC_WEBGPU=true        # WebGPU backend, falls back to WebGL2 automatically
NEXT_PUBLIC_IBL_SHADOWS=true   # soft contact shadows; WebGL2 only
```

They are mutually exclusive in practice — IBL shadows refuse to mount on WebGPU.

## Verifying visually

`/dev/render-check` — dev-only (hard 404 in production), **not auth-gated** on
purpose so the renderer can be inspected without a database. Metal/roughness
sphere grid + a live animated athlete, with toggles for the environment, IBL
shadows, and venue mood. Toggling IBL off is the A/B that shows what this work
bought: the metallic column collapses to black.

## Open decisions (yours, not blockers)

1. **Should WebGPU be the default?** It works here, and `createEngine` falls back
   automatically on unsupported devices. The risk is devices that *support*
   WebGPU but render it badly — those fall through the fallback. I only tested
   one machine, so I left it opt-in.
2. **Delete the stale twin app at the repo root?** The root has its own `lib/`,
   `scripts/`, `package.json`, `next.config.js` — a Babylon 6 near-copy of this
   app, including 5 imports from a legacy `babylonjs` UMD package that isn't even
   in its dependencies (so those files cannot resolve). `FEL-full-app` is the live
   one. The root copy also has uncommitted edits that predate this work.
3. **KTX2 textures** are asset-blocked, not code-blocked: 0 `.ktx2` files and 0
   `metallicTexture` call sites exist. Wiring the loader today would be dead code
   plus a CDN dependency. It needs a texture-transcode pipeline first.

## Environment gotchas

- Postgres (`localhost:55432`) is **down**, and every `/play/*` route is auth-gated,
  so the actual game modes could not be reached live. That is why `/dev/render-check`
  exists. Start the DB to verify Streetball directly.
- Running `next build` clobbers a running dev server's `.next`. Restart the dev
  server afterwards or pages hang on a spinner.

---

# 20-Phase Babylon-coverage pass (2026-08-30)

Branch `babylon9-aaa-rendering`. Babylon-backed `/play` routes: **20 → 24**.

| Phase | Outcome |
|---|---|
| 1 | **Showdown routed** — the only genuinely unrouted Babylon mode |
| 2–3 | **Gymnastics + Big Air ported** to Babylon 9 on one shared `AirSessionCore` |
| 4 | **Sprint** written and logic-verified, but **ships OFF** (renders black) |
| 5, 12–13 | tiebreak / training / brain-brawl / who-scene-it — **not renderer swaps**, reported |
| 14 | **Collapsed on inspection** — the teardown bug is not codebase-wide |
| 15–19 | Controller Link schemas, menu entries, green build |
| 20 | This audit |

## Still not Babylon (7 routes)

| Route | Why |
|---|---|
| `acting`, `irl` | MediaPipe device modes — Babylon is the wrong tool |
| `music` | DAW-lite tool, not a 3D sport |
| `tiebreak`, `training` | bespoke 2D canvas, **no shared core** — a new build, not a port |
| `brain-brawl`, `who-scene-it` | `QuizCore` text games; bible §4.2 wants a 3D *presentation* layer |

None of the last four has a locked benchmark, and §7.3 says to flag rather than invent one.

## Sprint: the one thing that does not work

`SprintMode.ts` logic is verified (READY→SET gate, real false starts, d-pad
cadence into the core, live HUD, rival pacing). The frame renders **black**.
Three real camera causes were found and fixed and it still renders black, so
`sprint` is commented out of `BABYLON_MODES` — `/play/sprint` serves the proven
2D game. **Do not flip that flag without re-verifying the frame.**

The last cause found is worth knowing generally: `FrameGuard`'s auto-recenter
calls `camDirector.snapTo(hero, objectiveRef)`. Point `objectiveRef` at
something far away and every recenter re-frames that whole span — the camera
parks where the preset's pitch cap cannot tilt down to the hero, FrameGuard
declares it off-screen, and it recentres to the identical wrong place forever.
A byte-identical camera position in the `[FEL-FRAME]` log is the tell.

## Verification note

`/dev/mode/[key]` is unreliable: React mounts effects twice in dev, and two
`runMode()` calls on one canvas means two Babylon engines sharing one WebGL
context. **Verify through a mode's real host component** (BootSplash path) —
that is how 3PT, gymnastics and big air were confirmed.

Suite: **188 headless checks** (28 air-session, 21 3PT contest, 57 Gate 0,
26 controller-link, 7 crossfade, 36 IBL, 13 dunk).
