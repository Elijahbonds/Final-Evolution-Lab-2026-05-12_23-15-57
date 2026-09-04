# Human models, real skin and cloth, world and camera — research (2026-09-03)

Owner directives, verbatim intent: *upgrade the models to be more human-like,
clothes more real, anatomically sensible; research how to build them. The
app will teach anatomy and physics, so the model must be like the hardware you
own IRL.* And: *upgrade the boundaries, map, movement, camera.*

## Where we are

The forged hero (`scripts/avatar/forge.mts`) is a stylised low-poly body: 431
skin vertices, seven head morphs, flat kit materials, procedural pore normals,
PBR subsurface translucency. It is honest about being a game piece; it is not a
human. Nothing in it can teach anatomy, and the movement model treats the body
as a point with a facing.

## What exists that we can build on (licences checked)

| Need | Source | Licence | Why it fits |
|---|---|---|---|
| Anatomically based parametric body | **MPFB2** (MakeHuman for Blender): 15,128-vertex base mesh built for subdivision, 1,000+ morph sliders (age, sex, ethnicity, proportions), automatic rigging incl. game rigs and Rigify, skins, eyes, hair, clothes library | code GPLv3 (tooling only), **assets CC0**, output CC0 — commercial closed-source use explicitly allowed | The only open, anatomically grounded, slider-driven human whose output we may ship without terms. Our Closet's likeness sliders map onto its targets. |
| Interpretable body model, all ages | **Anny** (Naver, v0.6 Aug 2026): PyTorch body model on MakeHuman/MPFB2 CC0 assets, facial actions, SOMA compatibility | model assets CC0; check code licence in the spike | Numbers behind the shape: a body the physics layer can reason about, children included (the Camp has minors). |
| Anatomy content: skeleton, muscles, vessels, organs, labelled | **Z-Anatomy** (Blender atlas from **BodyParts3D**), retopologised and labelled | **CC BY-SA 4.0** | The teaching layer under the skin. Share-alike applies to derived anatomy assets — an owner/legal decision before it ships (see below). |
| Skin surfaces | MPFB2's own skin textures (UV-mapped to its mesh, CC0); seamless CC0 skin tiles (PolyScan, FreePBR) for detail | CC0 | UV-mapped skins first; tiles only as micro-detail. Our subsurface + pore layer stays. |
| Real-time skin rendering | Babylon PBR: translucency (cheap, ours today), **subsurface scattering post-process** (WebGL2 only, GPU-heavy) | — | SSS on the desktop tier only; translucency + detail normals on mobile. |
| Clothes | MPFB2 clothes library (CC0, fitted with "delete helpers"), PBR fabric sets (CC0: ambientCG / Poly Haven) | CC0 | Skinned garments with real fabric response; full cloth simulation (Babylon particle cloth) only for free-hanging pieces. |
| Body physics | **de Leva (1996)** body-segment inertial parameters (mass fraction, centre of mass, radii of gyration per segment, by sex), adjusted from Zatsiorsky-Seluyanov | published tables | Gives every segment a mass, a centre and an inertia: the "hardware you own" the physics lessons need. |
| Likeness from a photo | MetaPerson (Avatar SDK), Avaturn — selfie → GLB, commercial licences. **Ready Player Me shut down 31 Jan 2026**; exported GLBs still work, nothing new | commercial | Optional add-on for photo likeness; do not build on RPM. |
| Boundaries | **recast-navigation-js** (WebAssembly Recast/Detour), Babylon's `RecastJSPlugin`; navmesh built offline per baked venue, loaded at runtime | MIT / zlib | Replaces ad-hoc court clamps with a real walkable surface: players go only where the venue allows. |
| Camera | Whisker raycasts (Journey, GDC "50 camera mistakes"), asymmetric damping (fast in, slow out), pitch clamps, context presets, occlusion fade/pull-in | design refs | Our `CameraDirector` has presets and a boxed-in fallback; it lacks whiskers, occlusion handling and damping asymmetry. |

## Recommendation

Build on **MPFB2**. It is the one path that gives an anatomically grounded,
slider-parametric human whose output we own outright, with skins, hair and a
clothes library under the same terms, exportable to glTF with baked morph
targets and a game rig. Everything else is either not ours (MetaHuman, Daz,
SMPL) or not a human (what we have).

Keep the pipeline shape we already have: **Blender authors, the forge
finishes.** MPFB2 exports a GLB; `forge.mts` (gltf-transform) renames the rig
to the FEL 22-bone spec, applies the material name contract (`skin / jersey /
shorts / shoes / hair` plus `eyes / iris / lips`), bakes the head and body
morphs we expose, registers hair-style nodes, and writes `fel-hero.glb`. The
identity pass, the Closet, the clip suite and the gauntlet then work unchanged
— that contract is the whole reason the swap is tractable.

Teach anatomy with **layers under the skin**: a skeleton and muscle set that
share the rig, toggled and labelled from a lesson. Z-Anatomy is the ready
source; its share-alike terms are the one licence question in this plan.
Teach physics with **numbers on the body**: de Leva segment masses and
inertias attached to the rig, driving the movement model (acceleration, turn
inertia, jump impulse, landing load) and readable in the Camp's lessons.

## Decisions for the owner (defaults in bold; the pass proceeds on them)

1. Anatomy layer source: **Z-Anatomy (CC BY-SA, attribution shown in the
   lesson UI)** · or commission/own the anatomy meshes · or MPFB2 skeleton only.
2. Realism target: **stylised-real** (true proportions, real skin response,
   readable at game scale) · or photoreal (SSS everywhere, 4K skins; mobile
   suffers).
3. Photo likeness: **keep the in-house scan → sliders path** · or add
   MetaPerson/Avaturn (commercial licence, per-avatar cost).
4. Cloth: **skinned garments + additive motion** · or simulated cloth on
   desktop for select pieces.

## Pass 3 — "A real body in a real place" (proposed ladder)

| Phase | Deliverable | Gate |
|---|---|---|
| 1 Body spike | One MPFB2 human exported and forged into `fel-hero.glb`: FEL bones, material contract, seven head morphs + proportion morphs, skins. Gauntlet unchanged. | 21/21 green on the new hero; Closet round-trips. |
| 2 Skin | UV-mapped CC0 skins across the tone range, pore/detail normals, SSS on desktop, translucency on mobile. | Side-by-side captures per tone; mobile ≥ 30 fps. |
| 3 Clothes | Kit library on the new mesh from MPFB2 garments with PBR fabrics; the Closet's wearables map to them. | Every wearable renders; no skin poke-through in the clip suite. |
| 4 Hair, eyes, face | Hair library, eye shader, facial morph set widened; the scan maps to the new targets. | Closet likeness gate. |
| 5 Anatomy layer | Skeleton + muscles under the skin, rig-shared, labelled; a lesson can toggle systems and highlight a structure. | A Camp module walks through one movement's anatomy. |
| 6 Body physics | de Leva segments on the rig; movement model derives acceleration, turning inertia, jump impulse and landing load from them. | Physics lesson reads live numbers; modes feel weightier but pass their gauntlets. |
| 7 Boundaries | Offline navmesh per baked venue; players and AI constrained to it; court clamps removed. | No out-of-bounds in a 21-mode sweep. |
| 8 Movement feel | Acceleration curves, turn radius, stop distance tuned per sport from the mass model; planting and hand IK carry over. | Owner feel review; gauntlet green. |
| 9 Camera | Whiskers, occlusion fade/pull-in, asymmetric damping, per-mode context presets; the boxed-in fallback becomes rare. | FEL-CAM fallbacks ≈ 0 across a sweep. |
| 10 Maps | Venue upgrade: optimized baked maps (Phase 3 of pass 2), detail props, lighting per mood, navmesh-authored bounds. | Load budget met; every venue re-shot. |

## Sources
- MPFB2 licence and features: https://github.com/makehumancommunity/mpfb2/blob/master/LICENSE.md · https://static.makehumancommunity.org/mpfb/faq/is_it_really_free.html · https://extensions.blender.org/add-ons/mpfb/ · https://www.cgchannel.com/2025/03/check-out-open-source-blender-character-generation-plugin-mpfb-2/
- Anny: https://github.com/naver/anny
- Z-Anatomy / BodyParts3D: https://github.com/Z-Anatomy/Models-of-human-anatomy · https://www.cgchannel.com/2022/05/check-out-amazing-free-3d-anatomy-reference-z-anatomy/ · https://github.com/Kevin-Mattheus-Moerman/BodyParts3D
- Babylon skin/SSS: https://doc.babylonjs.com/typedoc/classes/babylon.pbrmaterial · https://forum.babylonjs.com/t/subsurface-scattering-in-babylonjs/425 · https://www.babylonjs-playground.com/#W7DYG2#2
- Skin textures: https://polyscann.com/ · https://freepbr.com/product/human-skin1/ · https://cc0-textures.com/tag/human-skin-texture
- Cloth: https://babylonjs.com/Demos/Cloth/ · https://medium.com/@pablobandinopla/simple-cloth-simulation-with-three-js-and-compute-shaders-on-skeletal-animated-meshes-acb679a70d9f
- Body segment parameters: https://link.springer.com/rwe/10.1007/978-3-319-14418-4_147 · https://has-motion.com/wiki/doku.php?id=visual3d%3Adocumentation%3Adefinitions%3Aadjusted_zatsiorsky-seluyanov_s_segment_inertia_parameters
- Blender → glTF morph targets: https://github.com/funwithtriangles/blender-to-threejs-export-guide · https://github.com/makehumancommunity/mpfb2/issues/303
- Navmesh: https://github.com/isaac-mason/recast-navigation-js · https://doc.babylonjs.com/typedoc/classes/BABYLON.RecastJSPlugin
- Camera: https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter47_Tips_and_Tricks_for_a_Robust_Third-Person_Camera_System.pdf · https://www.unrealengine.com/en-US/tech-blog/six-ingredients-for-a-dynamic-third-person-camera
- Avatar SDKs: https://avatarsdk.com/blog/2026/08/31/avatar-platforms-2026-whos-alive-whos-gone/
