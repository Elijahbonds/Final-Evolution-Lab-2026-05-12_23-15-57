# Changelog

All notable changes to Final Evolution Lab. Dates are 2026.

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

