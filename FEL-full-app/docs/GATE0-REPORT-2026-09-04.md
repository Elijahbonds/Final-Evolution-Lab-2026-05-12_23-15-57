# Gate 0 report — 2026-09-04 (verify lane, ship pass 4)

Contract 5 (`docs/CONTRACTS-PASS4-RUN.md`): Gate 0 is the Mixamo 65-bone standard —
`scripts/gate0-rig-tests.ts`, `mixamorig` prefix, clean T-pose at load. This lane reports
PASS/FAIL; no rig migration this run.

Worktree `../lane-verify`, branch `lane/verify`, base `476cfc2`. Every number below was printed by
the command next to it, run today on this checkout. Nothing is estimated.

## Verdict: **PASS** (with two measured caveats, below)

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `npx tsx scripts/gate0-rig-tests.ts` | 0 | `gate0-rig-tests: 58 checks green — GATE 0 PASSES on the default rig` |
| 2 | `npx tsx scripts/avatar/check-bind.mts public/models/candidates/fel-kit-male.glb` | 0 | `check-bind: quantized file — checked at its source; run the rig tests on this one` (skipped) |
| 3 | `npx tsx scripts/avatar/check-bind.mts public/models/candidates/fel-kit-female.glb` | 0 | same skip — quantized |
| 4 | `npx tsx scripts/avatar/check-bind.mts public/models/fel-hero.glb` | 0 | same skip — the shipped hero is quantized (`KHR_mesh_quantization`), check-bind cannot read it |
| 5 | `npx tsx scripts/avatar/validate-pose.mts` (defaults to `public/models/fel-hero.glb`) | 0 | `✔ POSE GATE GREEN — public/models/fel-hero.glb animates anatomically.` |
| 6 | `npx vitest run lib/babylon/anim` | 0 | Test Files 14 passed (14) · Tests 78 passed (78) |
| 7 | `FEL_HERO_GLB=public/models/candidates/fel-kit-male.glb npx vitest run lib/babylon/anim` | 0 | 14 files / 78 tests passed (the substitute check-bind asks for, row 2) |
| 8 | `FEL_HERO_GLB=public/models/candidates/fel-kit-female.glb npx vitest run lib/babylon/anim` | 0 | 14 files / 78 tests passed (substitute for row 3) |
| 9 | `npx vitest run lib/babylon/modes/Gate0FullValidation.test.ts` | 0 | Test Files 1 passed (1) · Tests 4 passed (4) — `Babylon 3D modes needing CharacterLibrary integration: 0/14`; `Canvas 2D Hard Gate: All 8 modes correctly FAIL (as expected)` |
| 10 | `npx tsx scripts/anim-rebind-tests.ts` | 0 | `✅ anim-rebind-tests: 14 checks passed` |

Rig test files found by `grep -rl 'mixamorig' --include='*.test.ts' --include='*-tests.ts' lib scripts`:
`lib/babylon/modes/Gate0FullValidation.test.ts`, `scripts/gate0-rig-tests.ts`, `scripts/anim-rebind-tests.ts` — all three ran above.

### What row 5 measured on the shipped hero

```
bind pose (from the joint nodes at rest — no baked clips):
  hand y 1.393 x 0.658 · foot y 0.068 · head y 1.512
  ✓ bind is a T-pose (hands out at shoulder height, feet on the floor, head in range)
load state (runtime rest pose applied): hand y 0.943 (must be < 1.30 — arms down, not T-posed)
  ✓ load state is arms-down (hand y 0.94)
```

## Caveats (measured, not opinions)

**1. The 65-bone / `mixamorig:` standard is proven on the procedural default rig only.** Row 1 asserts
`Gate0Validator.validateSkeleton` against `buildRig()` (`lib/babylon/characters/proceduralRig.ts`). Every GLB body
on disk carries a 22-joint, unprefixed skeleton. Probe (gltf-transform, `npx tsx -e`, one line per skin — the
kit bodies carry 13 skins each, all sharing the same joint list):

| file | joints | `mixamorig`-prefixed | required extensions |
|---|---|---|---|
| `public/models/fel-hero.glb` (shipped) | 22 | 0 | `EXT_texture_webp, KHR_mesh_quantization` |
| `public/models/candidates/fel-kit-male.glb` | 22 | 0 | `EXT_texture_webp, KHR_mesh_quantization` |
| `public/models/candidates/fel-kit-female.glb` | 22 | 0 | `EXT_texture_webp, KHR_mesh_quantization` |
| `public/models/candidates/fel-hero-mpfb.glb` | 22 | 0 | `EXT_texture_webp` |
| `public/models/_forge/fel-hero.glb` | 22 | 0 | none |

Babylon says the same at load (rows 5–8): `Skeleton "Human.rig": 22 bones`. This matches the owner's 2026-09-03
reconciliation recorded in `docs/AGENT-OPERATING-RULES.md` (line 9: "Gate 0 normalizes to the 22-bone unprefixed
FEL spec … Keep the 22-bone spec. Mixamo is an import format, normalized at load"; line 17: "fel-hero passes as 22
unprefixed bones" via `gateContainerRig` on load). That document and contract 5 therefore describe two different
Gate 0s, and `Gate0Validator.validateSkeleton` is never run against a GLB skeleton anywhere in the
suite — if it were, it would report `boneCount 22` and `hasMixamoRigPrefix false`. Contract 5 says "no rig migration
this run", so this lane changes nothing; the orchestrator should decide whether Gate 0 means "the default procedural
rig" (PASS today) or "every skeleton the app renders" (would be FAIL today on all five GLBs).

**2. "Clean T-pose at load" is two different checks.** `Gate0Validator`'s `hasTPose` only tests root XZ displacement
(< 0.5 m). The pose gate (row 5) measures the shipped hero's BIND as a T-pose (hand y 1.393 at x 0.658) and its
LOAD state as arms-down (hand y 0.943) — the runtime rest pose is applied on purpose (`lib/babylon/anim/restPose*.ts`,
`restPose solved for 4 bone(s): LeftArm, RightArm, LeftForeArm, RightForeArm`). The bind is clean; what the player
sees at load is deliberately not a T-pose.

## Failing tests first (task 2)

### `scripts/perf-budget-tests.ts` — texture budget gate (contract 3)

Rules implemented: `measuredAt` must be a date; the mobile tier lists at least as many modes as desktop; every
mobile mode's `totalMB` ≤ 2 × the mobile median (standard median computed from the rows; even count = mean of the
two middle values); the recorded `median` must agree with the computed one within 0.1 MB; the desktop column is
printed, not gated. Takes an optional table path so fixtures can be run without touching the shipped JSON.

Against the current stub — **fails, as required**:

```
$ npx tsx scripts/perf-budget-tests.ts
perf-budget-tests: .../lib/babylon/config/textureBudget.json
  measuredAt=null probe=scripts/probes/_vram-diag.mts rule="mobile: no mode above 2x tierMedian"

  desktop (recorded, not gated)
    (no modes)

  mobile (gated: totalMB <= 2x median)
    (no modes)

  mobile: 0 modes · median n/a · ceiling n/a · heaviest n/a · desktop: 0 modes
perf-budget-tests: 2 FAILED of 4
  ✗ measuredAt is a YYYY-MM-DD date (got null) — an unmeasured table cannot pass the gate
  ✗ mobile tier has at least one measured mode — the median of nothing gates nothing
EXIT=1
```

Fixture A — today's two measured numbers only (mobile dunk 168.1, threevthree 40.2; kept in the scratchpad, not
committed). **Finding: with exactly two rows the 2×median rule cannot flag dunk** — the median of {168.1, 40.2}
is 104.15, the ceiling 208.3, and 168.1 sits under it:

```
$ npx tsx scripts/perf-budget-tests.ts <scratch>/budget-today.json
  mobile (gated: totalMB <= 2x median)
    ✓ dunk               168.1 MB    0 tex  top:
    ✓ threevthree         40.2 MB    0 tex  top:

  mobile: 2 modes · median 104.2 MB · ceiling 208.3 MB · heaviest 168.1 MB · desktop: 0 modes
perf-budget-tests: 9 checks green — every mobile mode sits within 2x the tier median
EXIT=0
```

Fixture B — the same two numbers plus ONE synthetic row that copies the threevthree figure (labelled SYNTHETIC in the
table; it is a mechanism demonstration, not a measurement). The moment a third mode lands near 40 MB the median drops
to 40.2 and dunk fails, which is the outcome the perf lane's full table is expected to produce:

```
$ npx tsx scripts/perf-budget-tests.ts <scratch>/budget-today-plus-synthetic.json
  mobile (gated: totalMB <= 2x median)
    ✓ _synthetic_a        40.2 MB    0 tex  top: SYNTHETIC copy of the threevthree figure
    ✗ dunk               168.1 MB    0 tex  top:
    ✓ threevthree         40.2 MB    0 tex  top:

  mobile: 3 modes · median 40.2 MB · ceiling 80.4 MB · heaviest 168.1 MB · desktop: 0 modes
perf-budget-tests: 1 FAILED of 11
  ✗ mobile/dunk: 168.1 MB exceeds 2x the tier median (40.2 MB → ceiling 80.4 MB)
EXIT=1
```

Implication for the perf lane: the gate only bites once the mobile column holds the whole enabled roster (18 keys in
`ENABLED_BABYLON_MODES`). A two-row table passes the median rule by construction.

### `lib/babylon/core/playerIdentity.test.ts` — `skinMapUrl(url, tier)` (contract addendum)

Six vitest cases, pure function, no engine: unchanged on desktop; trailing `.jpg` → `-1024.jpg` on mobile; only the
extension is rewritten; non-`.jpg` urls untouched on mobile; idempotent on an already-`-1024` url; every
`SKIN_LIBRARY` albedo plus `SKIN_DETAIL_NORMAL` maps onto the mobile set. Written before the perf lane exports the
function, so today it fails at runtime (`TypeError: skinMapUrl is not a function` — esbuild strips the types, so it
is a runtime failure, not a compile failure):

```
$ npx vitest run lib/babylon/core/playerIdentity.test.ts
 Test Files  1 failed (1)
      Tests  6 failed (6)
```

## Full suite before commit

```
$ npx vitest run
 Test Files  1 failed | 39 passed (40)
      Tests  6 failed | 253 passed (259)
   Duration  102.72s
```

Baseline 39 files / 253 tests all still pass; the only failures are the 6 new `skinMapUrl` cases above, which pass
once `lane/perf` lands the export.
