# Changelog

All notable changes to Final Evolution Lab. Dates are 2026.

## Unreleased

### Camp
- The owner's Camp Blueprint (eight-week facilitator curriculum, 2026-09-03) is filed at `docs/CAMP-BLUEPRINT.md` and mirrored as `lib/camp/curriculum.ts`.
- `/camp` gains a Curriculum tab: thesis, the two tracks and the Bridge, the eight-week arc with scripts and traps, the Pathway Map Protocol as a fillable worksheet, the Bridge prompts, what is measured and never claimed, facilitator standards, replication package.
- The Session tab shows which week of the arc the plan is in (from its lock date), that week's output and script, and the rotating Bridge prompt; the intake can seed its milestones with the eight-week arc.
- The Pathway Map worksheet saves to the mentee's plan (`GoalPlan.pathwayMap`), per plan, by facilitator or mentee; copy to clipboard stays.

### Animation
- Pose-target clips: authored clips are hand and foot targets fitted by the two-bone solver at build time, so one authoring works on any body. Golf is migrated and proven on the shipped hero and the MPFB2 candidate.
- The shared two-bone solver solves in the rig's own frame; under the glTF root's handedness mirror it used to turn large reaches the wrong way.
- Development only: `?hero=<glb>` on the dev harness and the Closet swaps the hero body behind a flag.
- Every authored clip is portable: a degree key rotates the bone about its parent's bind axes from bind (`bindFrame.ts`), in both builders. Locomotion, karate, football, the dunk suite, finishes and eastbay are pose targets; the jump, launch, tomahawk and eastbay now actually raise the hands (their arm keys were twists).
- The dunk's live clip is rebuilt from the owner's capture as pose keys (`scripts/mocap/dunk-pose.mts`).
- The nine base clips (run, walk, guard, strikes, jumpshot) are built at runtime on the bind frame, so a body without baked animations plays them; the jumpshot's release now goes overhead (the baked keys crossed the arms low).
- Mocap takes play as pose targets from the take's forward kinematics, with a two-hand grip option.

### Body and skin (ship pass 3)
- Six CC0 MakeHuman skins across the tone range (`public/models/skins`, `scripts/avatar/skins/export-skins.mts`); a body whose skin sits on the MakeHuman UV layout wears the family nearest the chosen tone, with the map's mean pulled onto the swatch and a photographed detail normal.
- Clothing-only tint skips skin, hair and eyes by name (a photographed skin is a white albedo the colour heuristic read as clothing).
- The MPFB2 candidate's textures ship as WebP (13 MB → 2.2 MB); its skin material is flagged `felSkinUV: makehuman`.
- Development only: `?tone=<hex>` on the Closet previews a skin tone.
- Two kit bodies (male, female) carry the Closet's tops, shorts and shoes as fitted CC0 garments; the equipped one per slot shows (`lib/babylon/core/kit.ts`). Candidates only, behind the dev flag until the swap.
- The candidate import bakes the A-pose mesh into the rig's rest pose and the avatar scripts gain a mesh-versus-bind joint check.

## 0.9.0-rc.1 — 2026-09-03 · release candidate

### Ship pass 2 — launch readiness
- Shipping-route gauntlet (`scripts/gauntlet-play.sh`): all twenty Babylon `/play` routes, logged in.
- Production-mode gauntlet (`scripts/prod-serve.sh`): the built bundle served on :3004 and swept.
- Character containers cached per scene; a disposed scene's container no longer reaches the next spawn.
- Identity watchdog judges compilability after sixty rendered frames; force-compiles before reporting.
- Game shell: an unreachable-server state with Retry. Harness: WebGL context loss becomes a named error state.
- Game diagnostics leave the browser as `game_diag` analytics events; owners read `/api/admin/diag`.
- Session carries the user's role (every `/api/admin/*` had answered 401). Analytics route logs rejected batches and failures.
- Baked venue maps optimized 36 → 26 MB (dedup, prune, weld, quantize).
- Controller Link entries for ones, karate, karate versus, carnival.
- Capture tooling: mobile quality tier, CPU throttle, time-to-playing, fault injection (missing model, slow asset, offline, context loss).
- Security headers; dev harness routes 404 outside development; CI workflow (type-check, tests, production build).
- Repo: the stale root twin archived under `_archive/root-twin/`; probes under `scripts/probes/`.

### Ship pass 1 — every mode to its benchmark (2026-09-02 → 03)
- Import the fel-app-handoff state: avatar/map/backdrop pipelines and nine more sign-offs
- Gap reports for both directive workstreams, before any implementation
- Gauntlet baseline: fill the frame-budget table, fix the mobile sweep
- Ship-pass plan, owner decisions, and a correction to the fidelity report
- Ship pass, phases 0–3: forge hero by default, quality tiers, alive layer, face
- Ship pass, phases 3–4: hair styles, eight-body roster, real strikes, basketball packages
- Basketball packages: the left arm's forward swing is mirrored
- Phases 4–6: 3v3 heads on the ball, a rival that sidesteps, signed spins, net touch
- Phase 6 baseball packages, the air modes' final banner beat, a stable rival read
- Round-two owner decisions: karate endless lock, keeper round, free-approach dunk, Camp starts
- Phase 7: Camp Blueprint data model and the curriculum draft
- Phase 7: the Camp Blueprint API, walked end to end
- Phase 8: the Camp screens — certify, intake, session, templates
- Locks: karate endless already had a benchmark; owner to confirm the SoR4 answer
- Round two: the keeper round, the free-approach dunk, the alley-oop, a bat
- Locks: karate endless is the horde brawler (Matrix Revolutions / Pirate Warriors)
- Karate endless lock: the horde grammar, measured against the code
- Round three: the horde pass, a playoff, a shown blitz, PBR props, the session runner
- Phase 9: retired routes verified dark when logged in; the scram-switch assigner
- Fidelity report: status of the ranking as of 2026-09-03
- Camp: the delta helpers as a pure module with tests
- Probes: the Closet hair-and-slider round trip; the mobile start sampler
- Round four: switching, the ball in hand, PBR worlds, the skate snap, the Closet fix
- Closet: tinted skin never rendered — tint clones now share the pore map
- Gauntlet: logged-in captures and a material-readiness watchdog
- Pure node-space two-bone IK (tested) and the handoff's Closet lesson
- Foot planting returns on the node-space solver
- Dribble cycle and arm reach: pure modules for hand IK on the ball
- ballCarry: the live dribble helper (ball off the palm, arm reaches), tested on a linked-node rig
- ballCarry applies after animations (the harness updates modes before render)
- ballCarry: hand the ball back only when it is still ours (steals, releases)
- The ball leaves the hand: live dribble with hand IK in 1v1 and 3v3
- Phase 9: gate /dev/anim and /dev/rig outside development; auth and route review recorded
- Authored clips for golf, tennis, volleyball and soccer, proven on the forge rig
- Register the sport clips; safe-play accepts registered clips; camera fallback tagged; security headers
- Rest solve is root-relative: rigs off-centre or facing +z lost every rest-based clip
- Capture: TIER=mobile runs a mode in a phone-shaped touch context (mobile quality tier)
- Gauntlet: seven modes on the mobile quality tier; rounds seven and eight recorded
- FrameGuard: log from the second consecutive miss, as it already acts

