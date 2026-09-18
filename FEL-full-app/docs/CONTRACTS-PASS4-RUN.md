# Contract freeze — ship pass 4, orchestrated run (2026-09-04)

Target: finish pass 4 — phase 9 performance, phase 10 release candidate. Lanes may READ these; none may EDIT them.
Contract changes route to the orchestrator.

## Frozen contracts

1. **Quality tier** — `lib/babylon/scene/QualityTier.ts`: `type QualityTier = 'desktop' | 'mobile'`; `detectQualityTier()`;
   the harness stores the result at `scene.metadata.felTier` (ModeHarness.ts:117). Readers: CharacterLibrary (spawn),
   playerIdentity (skin maps, perf lane), PerfMonitor.
2. **Skin-map size convention** — `public/models/skins/<key>.jpg` is the 2048² shipped set; `<key>-1024.jpg` and
   `detail-normal-1024.jpg` are the mobile set (`scripts/avatar/skins/export-skins.mts --size 1024 --suffix -1024`).
   `lib/babylon/core/skinLibrary.ts` describes the base set only.
3. **Texture budget table** — `lib/babylon/config/textureBudget.json` (schema below). Written by the perf lane's
   probe (`scripts/probes/_vram-diag.mts`), read by the verify lane's test. Gate: on the mobile tier no enabled mode
   exceeds 2× the tier's median texture MB; the desktop column is recorded, not gated.
4. **Headless suite row** — `scripts/headless-checks.suite.test.ts` gains ONE row, added by the orchestrator at
   integration: `{ script: 'perf-budget-tests.ts', guards: 'mobile-tier texture memory stays within 2× the median' }`.
   The verify lane writes `scripts/perf-budget-tests.ts`; it does not edit the suite file.
5. **Gate 0** — the Mixamo 65-bone standard (`scripts/gate0-rig-tests.ts`, `mixamorig` prefix, clean T-pose at load).
   The verify lane reports PASS/FAIL; no rig migration this run.
6. **Ports** — the orchestrator's dev server is :3000; :3001/:3002 belong to another session and are never touched.
   Lane servers: perf :3005, rc :3006 (production serve), verify :3007.
7. **Material name contract** — `skin / jersey / shorts / shoes / hair` are never renamed. `elijah-hero.glb` stays retired.

## Texture budget schema

```json
{ "measuredAt": "YYYY-MM-DD", "probe": "scripts/probes/_vram-diag.mts",
  "budgetRule": "mobile: no mode above 2x tierMedian",
  "tiers": { "desktop": { "median": 0, "modes": { "<registryKey>": { "totalMB": 0, "textures": 0, "top": ["..."] } } },
             "mobile":  { "median": 0, "modes": { "<registryKey>": { "totalMB": 0, "textures": 0, "top": ["..."] } } } } }
```

## Lane map (disjoint file ownership)

| lane | branch / worktree | owns | acceptance |
|---|---|---|---|
| verify | `lane/verify` · `../lane-verify` | `docs/GATE0-REPORT-2026-09-04.md`, `scripts/perf-budget-tests.ts`, `lib/babylon/core/playerIdentity.test.ts` (new) | Gate 0 PASS/FAIL reported; budget test fails on today's numbers (dunk mobile 168 MB vs 40 MB), passes on the perf lane's table; skin-tier test written first |
| perf | `lane/perf` · `../lane-perf` | `lib/babylon/core/playerIdentity.ts`, `lib/babylon/core/CharacterLibrary.ts`, `lib/babylon/core/PerfMonitor.ts`, `lib/babylon/config/textureBudget.json` (new), `scripts/probes/_vram-diag.mts`, `scripts/avatar/skins/export-skins.mts`, `public/models/skins/`, `public/models/fel-hero.mobile.glb` (new, if chosen) + `scripts/avatar/import-mpfb.mts` | mobile-tier table with no mode above 2× median; throttle rows at ≥ 30 fps; gauntlet 0/0/0 |
| rc | `lane/rc` · `../lane-rc` | `docs/CHANGELOG.md`, `docs/RC-2026-09-04.md`, `scripts/prod-serve.sh`, `scripts/rc-checklist.mts` (new) | production build passes; production sweep on :3006 clean; changelog covers passes 3–4; checklist script prints the gate table |
| ledger | `lane/ledger` · `../lane-ledger` | `docs/NEXUS_EXTRACTION_LEDGER.md`, `docs/BACKLOG.md` | no code; patterns appended with name, files, why it generalises; scope drift logged |

Shared files no lane edits: `scripts/headless-checks.suite.test.ts`, `scripts/gauntlet.sh`, `docs/SHIP-PASS-4.md`,
`lib/babylon/scene/QualityTier.ts`, `lib/babylon/core/ModeHarness.ts`, everything under `lib/babylon/nexus/`.
