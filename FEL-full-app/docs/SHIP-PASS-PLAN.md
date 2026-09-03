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
| **1 Shared rendering** 🔶 tiers, PBR kit/worlds/court done |  Quality tiers on the light rig's existing pipeline (already mounts ACES tone-map, bloom, FXAA, sharpen, vignette, 1024 soft shadows in every mode). Desktop 60 fps adds SSAO and cascaded shadows outdoors; mobile 30 fps keeps bloom + tone-map only. The unused duplicate `RenderPipeline.ts` is retired. `VenueKit` / ride worlds / `CourtSurface` converted to PBR. Procedural IBL stays v1. | Per-mode frame budget re-measured on both tiers; no mode below its floor. |
| **2 Character fidelity** ✅ skin/cloth/secondary/planting/hand-IK dribble |  Forge `skin` gets PBR subsurface; normal + roughness maps authored in the forge; secondary animation layer (head look-at, breathing, idle weight shift); two-foot IK planting everywhere + hand IK for ball grip in basketball. No root-motion rewrite. | Pose gate + pipeline tests green; side-by-side captures before/after per mode family. |
| **3 Avatar builder** 🔶 face, morphs, sliders, likeness, hair styles, 8-body roster done |  Morph targets in the forge (brow, jaw, mouth, blink + body proportions) exposed as Closet sliders; expanded skin tones, hair styles, kits; photo-to-avatar likeness fit; more authored hero clips per sport. Material name contract untouched. | Closet round-trip: a saved look renders identically in the preview and in a mode. |
| **4 Basketball to benchmark** 🔶 packages, free-approach dunk, alley-oop |  dunk, threepoint, onevone, threevthree, dunkduel brought to their locked inspirators (NBA Live 08 contest, NBA 2K feel). Depth of control, AI, presentation. | §7 sign-off per mode against `PHASE2_BENCHMARK_LOCKS.md`. |
| **5 Combat, board, air** 🔶 sidestep, spin direction; horde pass staged |  karate, karate_vs (the Storm mode), mixedcombat (Soul Calibur style), skateboard, surf, snowboard_slalom, bigair (SSX), gymnastics. | §7 sign-off per mode. |
| **6 Net, precision, field, party** 🔶 net touch, baseball clips + bat, keeper round |  volleyball (Switch Sports), tennis, golf, derby, penalty, football, carnival (Mario Party / Pac-Man Fever), dance (Class of 3000). | §7 sign-off per mode. |
| **7 Camp Blueprint — model + content** 🔶 model, curriculum draft, API live |  Curriculum bodies + assessments authored into the Educational Track; `CurriculumAssessment` + credential (80% pass, owner revoke); `CreatorCard.kind='facilitator'`; `FacilitatorProfile`, `GoalPlan` (on `CoachingProgram`), `CampSession` (on `ClientSession`), `CampTemplate`; guardian consent gate; resiliency = retry rate after failed attempts. | Prisma migration applied; unit tests on the read-model and the metric. |
| **8 Camp Blueprint — flows** 🔶 four screens live |  Facilitator onboarding, intake with AI-coach follow-ups, session runner (curriculum beside a game mode, subscribed to `resultSink`), template export/fork with curriculum versioning; coaching-program backend persisted. | Each flow walked end to end on the dev server with screenshots. |
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
- **2026-09-03, Phase 5/6 inventory (from the sign-offs' carry-forwards).**
  Mixed combat: throws (D1) and a deliberate AI sidestep (D2) deferred. Karate
  VS: D1–D3 fixed, D4 venue mapping to assess, ring-out ruled. **Karate
  endless has NO locked benchmark** (§4.3 orphan mounted by request; a defect
  pass only) — §7.3 forbids inventing one, so it needs an owner lock before a
  benchmark pass. Big air: spin has no direction vocabulary. Gymnastics: final
  attempt lacks its own banner beat. Volleyball: single-hand block, no double
  block / net-touch fault. Soccer: no keeper-only mode. Baseball: covering
  driver coarse, foul poles scenery, one pitcher arm action for all pitches.
  Football: no pre-snap disguise. Skate/surf/snowboard/tennis: no open items
  recorded. Carnival and dance: their fix lists are closed; no carry-forwards
  beyond tuning.
- **2026-09-03, Phases 4–6 items landed.** 3v3: all six heads track the ball.
  Mixed combat D2: the rival brain now reads a wind-up with its feet as well
  as its guard (a deliberate sidestep burst, ~21% at the default difficulty,
  asserted by `fight-balance-tests` A2; throws stay deferred with the lock's
  reason). Big air D4: spin has a direction — d-pad in the air picks
  backside/frontside, the landing banner names it, `air-trick.test.ts`.
  Volleyball: an early block jump is a NET TOUCH fault (it was falling into
  the stuff branch and being rewarded). The gauntlet now sweeps all 21
  roster modes, not 14.
- **2026-09-03, Phase 6 (baseball) + Phase 5 (air).** The derby's stance,
  swing and pitch were the karate guard, uppercut and jab. A rig-measured
  baseball suite replaces them (`authored/baseball.ts`, solved with
  `_arm-solve.mts` under each clip's torso keys): a real bat stance and swing,
  an over-the-top delivery for the fastball and the same-look changeup, and a
  three-quarter slot for the slider. Gymnastics and big air hold the end
  screen until the last landing's banner has shown. The 21-mode sweep is
  green on all of it.
- **2026-09-03, Phase 9 (mobile) — open.** The 21-mode sweep's mobile
  skateboard capture shows a start-of-run frame-guard hit one run in two on
  the portrait viewport (camera ~4–6 m beside the spawn for the first frames,
  then auto-recentered). Desktop is clean. Not chased yet; the board modes'
  load-time snap on a portrait aspect is the suspect.
- **2026-09-03, Phase 7 begins.** Additive Camp models pushed to the local
  database: `FacilitatorProfile`, `Credential`, `GuardianConsent`, `GoalPlan`
  (milestones on a `CoachingProgram`), `CampSession` (outcomes on a
  `ClientSession`), `CampTemplate`; `CreatorCard.kind` and `Block.targetDate`
  added as defaulted/nullable columns. The Neuro-Mechanic's Blueprint is
  authored as content (`lib/curriculum/blueprint.ts`, version 2026.09-draft1):
  three required modules (Engine, Governor, Facilitating) over the eight PRQ
  pillars and the four Camp flows, with graded assessments at the 80% mark,
  plus bodies for the twelve existing mode-track lessons. Owner review pending.
- **2026-09-03, Phase 7 backend live.** `/api/v1/camp/{assess,plans,consent,
  sessions,profile,templates,revoke}` walked end to end on the dev server as
  two real accounts (`scripts/camp-walk.mts`, NextAuth credentials flow, no
  bypass): three assessments certify the facilitator and flip their Creator
  Card to kind=facilitator; a plan drafts a CoachingProgram of milestones,
  locks, is refused activation for a minor (412) until the guardian accepts by
  token, then activates; a session record attaches games and computes PRQ /
  movement deltas and the resiliency log; the composed profile reads; a
  template exports, forks and imports with the curriculum-version check; an
  uncertified user cannot draft (403) and a mentee cannot read another's
  profile (403). The dev server had to be restarted to load the regenerated
  Prisma client — every new route 500'd until then.
- **2026-09-03, Phase 8 screens live.** `/camp` (auth-gated, in the nav) carries
  the four flows as tabs over the API: Certify (module assessments, pass
  states), Plans (intake with mentee lookup by email, coach follow-ups,
  say-it-back, milestones, lock / activate, guardian-consent request),
  Session (record with modules and a note; deltas and the resiliency log read
  back), Templates (export & publish, fork, import with the version prompt).
  Walked as both accounts with `scripts/camp-ui-walk.mts`: zero console errors.
- **2026-09-03, owner round two lands.** Penalty: on the rival's kick you are
  the KEEPER — the rival's body runs up with a tell (honest 70% in regulation,
  58% in sudden death), you dive ◀/▶ or with a stick flick, and `KeeperCore`
  grades the dive against the strike and resolves the save; the camera sits
  behind the goal and re-aims every frame (measured: it had faced away).
  Dunk: the free approach — the angle read from where you are and one-foot
  (running) vs two-foot (gather) feed the judges' difficulty; the flight now
  curves to the rim on both axes. 3v3: the alley-oop — an unaimed pass to a
  teammate cutting hard inside the circle goes up as a lob (over a corridor
  defender, where a chest pass cannot) and finishes as a dunk at 82%.
  Derby: a bat in the batter's hands. Karate endless: the lock already existed
  (Zombies + Soul Calibur); the owner's SoR4 answer awaits confirmation.
- **2026-09-03, karate endless lock (owner, final).** A horde brawler in the
  Matrix Revolutions / Pirate Warriors grammar, solo or co-op. Three combat
  modes, three mechanics (VS = Storm, mixed combat = Soul Calibur). The lock
  doc's horde criteria H1–H8 are measured against the code: the crowd-control
  core existed but every strike hit the nearest enemy only; the patch (arc
  strikes, launcher + juggle, a hit counter, tier-capped hordes of 20/12, the
  surrounded camera) is staged behind the running sweep.
- **2026-09-03, round three lands.** Karate endless horde pass: arc strikes hit
  everyone in reach (`inArc`), the heavy launches and juggled enemies take
  1.5×, a hit counter climbs and decays on the bezel, hordes of 6→20 on desktop
  (12 on a phone), the camera pulls back when surrounded. Three-point: a tie at
  the top is shot again as a playoff. Football: a shown blitz that may drop.
  Venue kit props are PBR. Camp: the session runner shows each lesson's key
  points and drill with a link into the mode. Carnival's event cameras cut
  instead of lerping (the lerp from the previous event left the hero behind the
  camera for three frames).
- **2026-09-03, Phase 9 items.** Retired routes verified dark for a logged-in
  player (`scripts/_retired-routes-check.mts`: sprint/showdown/duel → 307 to
  /modes, a live mode → 200). Staged behind the running sweep: the ball rides
  the AI driver's hand in 3v3; defenders switch marks when beaten (pure
  `scramSwitch`, hysteretic); ride worlds and the ocean court go PBR.
- **2026-09-03, Phase 9 (mobile) — root cause staged.** The mobile skateboard
  start flake: the mode's start snaps pass no objective, so the director's
  "behind" is a fixed +z — the camera began ahead of and beside the rider and
  swung round on the first frames; a portrait phone's 0.46 aspect lost the
  rider during the swing while desktop did not. Fix staged: snap toward a point
  8 m ahead along the rider's facing at both snap sites.
- **2026-09-03, REGRESSION found and fixed (staged): the Closet preview.** The
  secondary-motion layer multiplied its breath / sway deltas onto a bone's
  current transform every frame — correct only when the running clip rewrites
  that bone each frame. The Closet's idle leaves Spine2, Hips and Head alone, so
  the chest scale compounded, the hips walked sideways and the torso spun: the
  preview rendered as scattered blocks (`scripts/_closet-preview-probe.mts`,
  before-shot). Modes were spared because their clips key those bones. Fix:
  `AdditiveTrack` — the delta is applied on the last base unless the animation
  wrote a fresh value (tested); staged with the round-four batch.
- **2026-09-03, round four lands.** 3v3: the ball rides the AI driver's hand;
  defenders switch marks when beaten (`scramSwitch`, announced once). Ride
  worlds and the ocean court are PBR. The skate start snaps behind the rider's
  facing (the mobile start flake: two clean phone runs after). The Closet
  preview regression looked fixed (`AdditiveTrack`) — see the next entry. Fixed cameras re-aim on a
  snap, which closes carnival's Hot Shot hits for good (two clean runs). The
  Camp's delta helpers are pure and tested.
- **2026-09-03, the Closet regression's REAL cause (the entry above was a
  partial).** `AdditiveTrack` fixed a genuine compounding bug, but the preview
  stayed "exploded". A per-mesh readiness probe (`scripts/_closet-scene-probe.mts`,
  dev-only `window.__FEL_PREVIEW__` hook) showed every mesh in place and ONE
  material never ready: the skin. Cause: the identity pass tints by cloning the
  material, `Material.clone` deep-clones textures, and `DynamicTexture.clone()`
  is a blank canvas nobody draws into — the cloned pore map never became ready,
  the skin never compiled, and the body rendered as floating clothes. Every
  logged-in hero in every mode took the same path; the gauntlet never saw it
  because dev captures do not log in (gap recorded below). Fix: `cloneForTint`
  shares the source bump map (tested). Also found on the way and kept: leg
  bones carried non-uniform scale (0.94/0.85/0.91) under `BoneIKController` on
  this linked-node rig, so foot planting mounts at intensity 0 until a
  node-space solver replaces it; the pore-map cache rejects a disposed texture.
- **Gauntlet gap (closed same day):** the 21-mode captures spawn the hero
  WITHOUT a login, so `applyIdentity` and the new spawn layers only met in the
  Closet. Now: `LOGIN=1` carries a real session into `/dev/mode/<key>`, the
  gauntlet runs it for onevone / skateboard / karate, and `applyIdentity` names
  any visible mesh whose material is still not ready three seconds after it
  lands (`[FEL-IDENT]`, counted as an error). First logged-in 1v1: ready, 0/0/0.
  The round-four sweep itself was clean (threepoint's two errors were network
  suspension in the capture browser; a lone re-run was 0/0/0).
- **2026-09-03, planting returns (node-space).** `TwoBoneIK.ts` is a pure
  two-bone solver returning world rotation deltas for hip and knee;
  `mountFootPlanting` lands them as local rotationQuaternions, so scale is never
  touched (Closet probe: every bone 1.00, foot at 0.10 m). Two things measured
  on the way: Babylon's `a.multiply(b)` applies b FIRST; and a from-to rotation
  between near-opposite vectors picks an unrelated axis, so the pole twist is a
  signed angle about the aim axis, faded by knee bend (a straight leg has no
  knee direction). The pin lives in the root's frame: translation is resisted,
  turning in place is not fought. Round five (first with logged-in captures):
  21 modes 0/0/0, three logged-in modes 0/0/0 with every material ready, mobile
  trio clean, 182 tests.
- **2026-09-03, round six (planting on, node-space): no regressions.** 21 modes
  0/0/0 except carnival at 5 frame-guard lines, all the camera director's
  "boxed in on all probed angles — overhead fallback" warning; a lone re-run was
  0/0/0. Residual camera flake in a randomly shuffled party venue, not
  planting. Left on the Phase 9 list: make the box-in probe tolerate a venue
  that occludes every angle without warning five times.
- **2026-09-03, the ball leaves the hand (Phase 2's last item, hand IK on the
  ball).** Every basketball mode had the ball parented to the palm, so a drive
  read as carrying. Now `ballCarry` (pure `Dribble` cycle + `HandIK` on the
  node-space solver) bounces the ball beside the root at a cadence set by
  speed and reaches the carrying arm for it; a crossover swaps hands. Shots,
  dunks, passes and steals put the ball back in the palm through the existing
  paths (a released ball is marked so the carry never re-grabs it). Wired in
  the 1v1 (me and the rival's drive) and the 3v3 (my team's carrier). The
  1v1's plant-and-cut helper moved off `BoneIKController` too (the last user).
  Applied in `onAfterAnimationsObservable`: the harness updates modes before
  the clips evaluate, so a bone written from update is overwritten a frame
  later — measured, and now a standing rule. 199 tests; logged-in 1v1 and 3v3
  captures 0/0/0 with the ball on the floor mid-bounce in both frames.
- **2026-09-03, Phase 9 item: production build check clean.** `npm run
  build:check` (a separate dist dir, the dev server untouched) exited 0 on the
  planting-on state with no type or lint failures.
