# FEL Ship Pass — ten phases to a shippable product

Owner decisions taken 2026-09-02 (recorded in `PHASE2_BENCHMARK_LOCKS.md`,
"ship pass") drive this plan. Each phase is gated by the gauntlet
(`scripts/gauntlet.sh`: tsc, vitest, every mode's play capture, the mobile
trio) staying green, and every mode still runs its own 10-Phase Convergence
Protocol with a §7 sign-off inside the phase that touches it. One mode at a
time. Honest reporting: a phase is not done until its evidence is in the
concept-lock docs.

| Phase | Deliverable | Gate |
|---|---|---|
| **0 Character path** ✅ 2026-09-02 | Forge GLB is the default spawn in every mode (`PROCEDURAL_CHARACTERS` now opt-in). Gauntlet green on the GLB path: 14 desktop modes 0/0/0 at 60 fps, mobile trio 0 errors; four empty-URL spawns fixed; 1v1 corner camera fixed. | Gauntlet diff vs the procedural baseline shows no new frame-guard hits, no missing clips, no errors. |
| **1 Shared rendering** 🔶 tiers done |  Quality tiers on the light rig's existing pipeline (already mounts ACES tone-map, bloom, FXAA, sharpen, vignette, 1024 soft shadows in every mode). Desktop 60 fps adds SSAO and cascaded shadows outdoors; mobile 30 fps keeps bloom + tone-map only. The unused duplicate `RenderPipeline.ts` is retired. `VenueKit` / ride worlds / `CourtSurface` converted to PBR. Procedural IBL stays v1. | Per-mode frame budget re-measured on both tiers; no mode below its floor. |
| **2 Character fidelity** 🔶 skin/cloth/secondary/planting done |  Forge `skin` gets PBR subsurface; normal + roughness maps authored in the forge; secondary animation layer (head look-at, breathing, idle weight shift); two-foot IK planting everywhere + hand IK for ball grip in basketball. No root-motion rewrite. | Pose gate + pipeline tests green; side-by-side captures before/after per mode family. |
| **3 Avatar builder** 🔶 face+morphs+sliders+likeness done |  Morph targets in the forge (brow, jaw, mouth, blink + body proportions) exposed as Closet sliders; expanded skin tones, hair styles, kits; photo-to-avatar likeness fit; more authored hero clips per sport. Material name contract untouched. | Closet round-trip: a saved look renders identically in the preview and in a mode. |
| **4 Basketball to benchmark** | dunk, threepoint, onevone, threevthree, dunkduel brought to their locked inspirators (NBA Live 08 contest, NBA 2K feel). Depth of control, AI, presentation. | §7 sign-off per mode against `PHASE2_BENCHMARK_LOCKS.md`. |
| **5 Combat, board, air** | karate, karate_vs (the Storm mode), mixedcombat (Soul Calibur style), skateboard, surf, snowboard_slalom, bigair (SSX), gymnastics. | §7 sign-off per mode. |
| **6 Net, precision, field, party** | volleyball (Switch Sports), tennis, golf, derby, penalty, football, carnival (Mario Party / Pac-Man Fever), dance (Class of 3000). | §7 sign-off per mode. |
| **7 Camp Blueprint — model + content** | Curriculum bodies + assessments authored into the Educational Track; `CurriculumAssessment` + credential (80% pass, owner revoke); `CreatorCard.kind='facilitator'`; `FacilitatorProfile`, `GoalPlan` (on `CoachingProgram`), `CampSession` (on `ClientSession`), `CampTemplate`; guardian consent gate; resiliency = retry rate after failed attempts. | Prisma migration applied; unit tests on the read-model and the metric. |
| **8 Camp Blueprint — flows** | Facilitator onboarding, intake with AI-coach follow-ups, session runner (curriculum beside a game mode, subscribed to `resultSink`), template export/fork with curriculum versioning; coaching-program backend persisted. | Each flow walked end to end on the dev server with screenshots. |
| **9 Ship hardening** | Mobile tier verified on the mobile capture for every mode; `build:check` clean; auth/prod config reviewed; retired routes confirmed dark; docs and handoff current; final gauntlet green on all 21 modes. | Ship sign-off. |

## Standing rules

- Fidelity → modes to benchmark → Camp, in that order (owner decision).
- SHIP firewall: nothing under CELL × NEXUS Studio is read or changed.
- Never invent a benchmark (§7.3); never bleed §6 scope (§7.8).
- The material name contract `skin / jersey / shorts / shoes / hair` is not renamed.
- `elijah-hero.glb` stays retired; the forge is the only hero source.
- Ports :3001 and :3002 belong to another session; this worktree uses :3000.
- The regression loop keeps running throughout; only regressions are reported.

## Findings log (things a later phase must pick up)

- **2026-09-02, Phase 0/1.** Four modes passed an empty or bare hero URL to
  the spawn (threepoint, gymnastics, bigair, carnival); harmless on the
  procedural path, a 404 that took the mode down on the GLB path. Fixed by
  `normalizeHeroUrl` in the character library plus explicit call sites.
- **2026-09-02, Phase 1.** SSAO2 on the default prepass floods the console with
  `glDrawElements: missing fragment shader outputs` (ink outline, decal and
  plugin shaders do not write every MRT output). It runs on its own geometry
  buffer now. Venue-spec scenes (`NexusWebScene`) still build a second sun and
  a second 1024 shadow pass beside the rig's — a duplicate to fold into the
  tier when that file is in scope.
- **2026-09-02, for Phase 5 (karate).** The forge hero's `guard` plays with
  both arms straight out sideways; the procedural body held a fists-up guard.
  Author a real karate guard/strike set for the forge before the karate
  benchmark pass. The baked dojo map's timber renders as a black jagged mass
  on both character paths (predates the tier work) — a venue item, not SSAO.
- **2026-09-02, for Phase 2.** Shoes were a near-white albedo under the IBL
  and read as glowing blocks; the skin-shading pass darkens and glosses them.
- **2026-09-03, Phase 3/5 (forge clips).** `chain(a, b)` in the forge applies
  `b` first, and a rotation about a limb's own bind axis is an invisible twist —
  so the guard, jab, hook and uppercut had never actually moved the way their
  comments said. Rewritten with `aimBone` (point a bone at a world direction
  under the pose's own parent chain) and measured with `_pose-dump.mts`: guard
  fists at chin height, jab reaches 0.6 m, hook crosses the midline, uppercut
  ends high. Pose gate green.
- **2026-09-03, Phase 4 (basketball packages).** Every basketball state used to
  alias onto run / guard / jumpshot. A new authored suite (dribble idle,
  crossover L/R, hesi, layup gather, defend slide L/R, block reach, steal
  reach) is proven on the real forge rig by `authored/basketball.test.ts`
  (hand / knee / hip world positions at the key frame). Remaining from the
  locks: teammate alley-oops, defensive switching, ball-in-hand on AI drives,
  3PT tiebreak playoff, free-approach dunk flight.
