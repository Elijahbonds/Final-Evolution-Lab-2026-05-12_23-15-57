# §7 Completion Checklist — Surf Break

Phase 10 of the convergence pass. Benchmark: **SSX**, locked in
`PHASE2_BENCHMARK_LOCKS.md` (repo root, commit `d441f29`).

| § | Item | Result |
|---|---|---|
| 7.1 | Gate 0 verified for this mode's animation set | ✅ 58 checks + `board-stance-tests` 19 |
| 7.2 | 10-Phase Convergence Protocol run in full | ✅ all ten, each with a proof |
| 7.3 | Benchmark parity against the locked reference | ✅ D1–D4 fixed, D5 accepted, D6–D7 ruled out of scope |
| 7.4 | World-Population Protocol applied | ✅ L1–L5 below |
| 7.5 | Five-tab shell conventions intact | ✅ untouched |
| 7.6 | vitest suite still green | ✅ `npx vitest run` — 4 files, 60 tests |
| 7.7 | No orphaned-mode work smuggled in | ✅ |
| 7.8 | No scope bleed into §6 features | ✅ |

## Verdict: **SIGNED OFF — 8 of 8.**

Seventh mode through the checklist.

**The benchmark pairing is recorded, not papered over.** SSX is a snowboarding
game and this is a surf mode. §7.3 forbids inventing a benchmark, and quietly
substituting a surf-native one is the same act, so the lock reads SSX as a
*systems* model — a timed run down a hazard-strewn line, trick scoring with bail
risk, a flow/boost economy, wipeout-and-recover as rhythm — and marks criteria
with no surf analogue `N/A — benchmark subject mismatch` rather than faking
them. Changing that pairing is a lock change and Elijah's call.

**Standing caveat, project-wide:** no FEL mode has run on real hardware. Phase 9
here is a desktop pass and a 390×844 touch pass, both through `/play/surf`.

---

## Phase-by-phase

| Phase | Proof |
|---|---|
| 0 Platform preconditions | `gate0-rig-tests` 58 green |
| 1 Concept Lock | `docs/concept-lock/surf.md` — 18 criteria, 7 deviations |
| 2 Core mechanics | `surf-run-tests` 14 green — the flow meter is a resource with a real trade |
| 3 Camera & framing | **0 `[FEL-FRAME]`** across runs, desktop and mobile |
| 4 Reachability | registry `surf` · `ENABLED_BABYLON_MODES` · `/play/surf` · `board-babylon.tsx` · `MODE_VERBS` · Controller Link |
| 5 Input & control schema | all four verbs on the overlay (was two), phone schema added, alignment guard extended |
| 6 World population | L1–L5 below |
| 7 Audio | ocean bed, per-action cues, and the barrel is its own sample **and** the camera's tightest framing |
| 8 Polish | FLOW meter on the bezel, SURGE / IN THE BARREL / BARRELED banners, camera hood-in |
| 9 Playtest | `/play/surf` desktop **0/0/0**; mobile touch **0 errors**, all four verbs reachable, FLOW visible |
| 10 This document | — |

---

## World-Population Protocol — Surf Break

```
L1 ground plane .......... PASS   90x220 painted water, gradient + swell lines
L2 play-critical props ... PASS   lip, breathing tube, buoys, and THE POCKET
                                  is now drawn on the water
L3 boundary .............. PASS   the rider clamps AT the water's edge
L4 crowd and life ........ PASS   9 beachgoers on the shore; they cheer a barrel
L5 ambience .............. PASS   sky, far swell, palms, city, ocean audio bed
budget ................... draws 28  meshes 28  frame 16.6ms (60fps)
legibility ............... the pocket band is alpha 0.16 and sits under the lip
                           and tube in contrast order, so it is findable without
                           competing with what the player actually reads
```

**L2 was the gap.** The pocket — ride 2–9m ahead of the lip and you gain flow
and score, drift out and you bleed both — is the single piece of state the whole
mode turns on, and it was visible **only as a number climbing in the HUD**. That
is precisely the failure the protocol cites for 3PT shipping without ball racks.
It is drawn now, and the venue draws exactly the band the mode scores:
`buildSurfBreak(scene, POCKET)` takes it as a parameter rather than duplicating
the numbers, so the drawn pocket and the scored pocket cannot drift apart.

**L3** was the same invisible-wall shape skate had: the rider clamped at ±40
while the ocean visibly continued to ±45. Both now derive from
`SURF_HALF_WIDTH`.

---

## What the pass found

- **Half the control scheme was missing on touch.** `modeVerbs` offered A and Y;
  the mode also reads B (cutback) and X (grab), and the cutback is one of only
  two scoring actions a player can actively take. An absent slot renders as an
  inert button rather than failing.
- **The guard that should have caught it only checked half the problem.**
  `verb-key-alignment-tests` asserted every modeId *resolves*; it never asked
  whether the verbs a mode *reads* are offered. Extended, and proved by
  reverting surf's verbs and watching it fail on exactly B and X.
- **The flow meter could not be spent.** It filled by riding the pocket and
  gated a passive score trickle, and nothing consumed it — a readout, not a
  decision, and the missing half of the benchmark's economy. SURGE now burns it
  for drive above the normal ceiling.
- **The cutback snapped 90° in a single frame**, which whipped the chase camera
  hard enough to lose the rider and caused wipeouts the player did not commit.
- **The rider rode chest-first into the wind**, like someone standing on a plank.
- **The barrel camera treatment was written down and never wired.** The `surf`
  preset's own note reads "barrel treatment = tightest (set via pulse when in
  the tube)". It is wired now.

Score over a scripted run: **200 → 1560**.
