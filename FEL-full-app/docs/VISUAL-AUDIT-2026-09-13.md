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
