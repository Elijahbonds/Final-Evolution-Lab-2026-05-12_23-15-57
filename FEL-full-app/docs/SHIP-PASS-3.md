# Ship Pass 3 — A Real Body in a Real Place (opened 2026-09-03)

Owner directives (verbatim intent): human-like, anatomically sensible models
with real skin and cloth — the app will teach anatomy and physics, so the model
must be like the hardware you own IRL; upgrade boundaries, map, movement,
camera; improve the animations from the owner's motion capture and identify
the movements in it. Research, sources and licences: `HUMAN-MODEL-RESEARCH.md`.
Owner decisions (2026-09-03, `PHASE2_BENCHMARK_LOCKS.md`): fitted body by
default, AI generator only as a later premium option, face + full-body
proportions, on-device, free at runtime.

Plan page: https://claude.ai/code/artifact/88460d0b-8775-4206-a872-81951f4ddeb0

| Phase | Deliverable | Gate |
|---|---|---|
| 1 Body spike | One MPFB2 human → `fel-hero.glb` through the forge: FEL bones, material contract, head + proportion morphs, skins. | 21/21 green on the new hero; Closet round-trips. |
| 2 Skin | UV-mapped CC0 skins across the tone range; detail normals; SSS desktop / translucency mobile. | Per-tone captures; mobile ≥ 30 fps. |
| 3 Clothes | Kit library on the new mesh from fitted garments with PBR fabrics; Closet wearables map to them. | Every wearable renders; no poke-through in the clip suite. |
| 4 Mocap → clips | Inventory, segment, retarget, register the owner's captures under the modes' clip names. Hair, eyes, wider face set ride along. | Every sport with a capture plays it; rig suite proves each segment. |
| 5 Anatomy layer | Skeleton + muscles under the skin, rig-shared, labelled, lesson-toggled. | A Camp module walks one movement's anatomy. |
| 6 Body physics | de Leva segments on the rig drive acceleration, turning inertia, jump impulse, landing load. | Physics lesson reads live numbers; gauntlets green. |
| 7 Boundaries | Offline navmesh per venue; players and AI constrained; court clamps retire. | No out-of-bounds in a 21-mode sweep. |
| 8 Movement feel | Per-sport acceleration, turn radius, stop distance from the mass model. | Owner feel review; gauntlet green. |
| 9 Camera | Whiskers, occlusion fade/pull-in, asymmetric damping, per-mode context. | FEL-CAM fallbacks ≈ 0 across a sweep. |
| 10 Maps | Venue upgrade on the optimized maps: props, lighting per mood, navmesh-authored bounds. | Load budget met; every venue re-shot. |

## Findings log
- **3 Sep, opened.** Blender 5.1.2 is installed on this machine; MPFB2 is not.
  The spike starts with a headless install and an API probe.
- **3 Sep, rung 4 first measure.** Five takes segmented by motion energy
  (golf 5.4 s, tennis serve 3.5 s, baseball pitch 2.6 s, volleyball spike
  3.3 s, football catch 8.2 s; each take is one movement after a static
  lead-in). `buildMocapClip` plays a take on the hero from the JSON. Golf on
  the rig: hand rises 0.98→1.62 m and crosses 1.0 m — a swing — but the hands
  open to 0.71 m at extension (**D-M1**: the owner's limb lengths vs the
  hero's). Fix planned: grip IK to a shared club target. Gate 0 held: the hero
  is the 22-bone unprefixed rig; the takes' Mixamo names map 1:1 after the
  prefix strip, toes dropped, root motion dropped.
