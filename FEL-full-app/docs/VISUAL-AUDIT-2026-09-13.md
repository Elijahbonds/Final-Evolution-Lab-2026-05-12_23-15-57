# Step 0 — visual defect list (2026-09-13)

Captured live at 1920×1080 through `/dev/mode/<key>` (dev-only, no auth, so the DB outage does not
block it). The in-app browser pane **does** render Babylon modes — an earlier note said it could not,
which was about DRIVING them, not about rendering. Static venue capture works and is the cheap path.

Ranked by how much of the frame is wrong, worst first. Every row names a cause, not a symptom.

| # | Mode | Defect | Named cause |
|---|---|---|---|
| 1 | **Aero Aces** | Frame is ~95% empty gradient. No terrain, no water, no visible rings, one pale vertical shape. | The course is authored as gate positions only. `venueForCourse` mounts a mood and a backdrop; nothing builds a WORLD under the rings, so an aerial course has nothing to judge height or speed against — which is also a mechanics problem, not only a visual one. |
| 2 | **Velocity Kart** | Tarmac + centre line + sky. Absolutely nothing either side of the track. | Same cause: the track ribbon is generated from gates; there is no trackside layer at all. No barriers, no kerbs, no crowd, no props. |
| 3 | **Surf Break** | Flat teal water plane, one white wave band, empty horizon. "A pier down the line" is in the copy and not in the scene. | `buildSurfBreak` builds water + wave + rider. No mid-ground objects exist for surf at all. |
| 4 | **Skate Run** | Ramps sit on a flat untextured tan plane; bare horizon; no crowd despite `crowd: 8`. | Ground is a single unlit-looking plane with no detail map. The venue's `crowd` field is authored and read by nothing. |
| 5 | ~~All five~~ | ~~Flat lighting, no post.~~ **WITHDRAWN — I was wrong.** | `lib/babylon/scene/LightRig.ts` already builds a `DefaultRenderingPipeline` with ACES tone mapping, FXAA, bloom, sharpen, a mood-tinted vignette and cascaded shadow maps, on a Low/Med/High tier — and `ModeHarness` mounts it for EVERY mode. I nearly built a duplicate. The flat look in the captures is not the grade; it is that there is nothing in the frame for the light to fall on, which is defect #1–4. |
| 6 | Snowboard | The best of the five — real ridge backdrop, treeline, gates. Pines are flat green cones. | Kenney kit palette (known); acceptable at distance, weak in the near field. |

## What is NOT broken (leave alone)

- **Snowboard's backdrop and treeline** are genuinely good and should be the reference the others reach.
- **Board venue data** (palette / mood / sky / crowd / trees / bound) is authored and correct across nine
  venues. The gap was that it was cosmetic, closed 2026-09-13 (`RideCharacter`).
- **Racing course data** — 8 courses, gate facings derived from the path, per-course venue/mood/tint.

## The one systemic cause

After withdrawing #5 there is exactly one, and it wants ONE module rather than per-mode work:

**No trackside / mid-ground layer.** Four of five modes render their playable surface against nothing.
The lighting and post are already good; they are falling on an empty world.

This also corrects the visual-fidelity brief's step 2 ("build the render pipeline"): it exists, it is
shared, it is tiered, and it should be left alone.

## Aero floor — measured, built, and still not on screen (unresolved)

Recorded rather than hand-waved, because everything cheap has been ruled out and the next person should not
repeat it. On `bay-circuit`, after adding the floor:

| Checked | Value |
|---|---|
| Mesh exists / enabled / visible | yes / yes / yes |
| `camera.isInFrustum(floor)` | **true** |
| Floor Y vs camera Y | 64 vs 201 (137 m below) |
| Camera forward Y | −0.21 (pitched **down**, toward it) |
| Floor span | 2400 m, centred 184 m from the camera |
| `camera.maxZ` / fog | 10000 / fog mode 0 (off) |
| Material | PBR via `VenueKit.paint` (was StandardMaterial — that WAS a real bug, fixed) |
| Trackside buoys placed | 202 |

### Second pass (same day) — further ruled out, and one earlier claim corrected

- Far-plane clipping: **out** (`maxZ` 10000, fog off).
- StandardMaterial blow-out: **out**. Switching to `VenueKit.paint` was correct on its own merits and
  changed nothing here.
- Not drawn at all: **out**. The floor is in `getActiveMeshes()`, material `isReady`, alpha 1, visibility 1.
- Not in front of the camera: **out**. With picking temporarily enabled, a centre-screen pick hits
  `aero_floor` at **318 m** and a low-frame pick at **181 m**. It occupies most of the view.
- Reflecting the sky: **out**. PBR, `metallic 0`, `roughness 0.95`.
- Too bright to separate from the sunset: **tested, not the cause.** Albedo was pushed from mid-value to
  near-black (0.012, 0.045, 0.055) and the frame did not change.

**CORRECTION to the first pass: aero DOES mount a backdrop dome.** I wrote that it did not. There is a
`bk_dome`, radius **682**, `backFaceCulling: true`, rendering group 0, depth-write on — and the camera sits
inside it at y 201 while the floor (radius 1697) extends well outside it.

That is now the strongest remaining hypothesis and the place to start: the dome encloses the camera, and
the interaction between an inside-out opaque dome and a ground plane that crosses its shell is the only
thing left that both objects participate in. It is a MODE-level concern (who mounts the dome, at what
radius, relative to a world that is bigger than it), not a trackside-layer one.

The trackside layer itself is proven on Velocity Kart, where the same code visibly places verges either
side of the road.
