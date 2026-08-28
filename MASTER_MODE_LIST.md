# FEL — MASTER MODE LIST (CORRECTED)
**Version**: Phase 1 Corrected Inventory  
**Date**: 2026-08-27  
**Authority**: Single source of truth for all subsequent phases

---

## TOTAL MODES: 18 Active Modes + 3 Orphaned (not in codebase)

### ✅ TIER A — BABYLON.JS 3D MODES (10 modes)

| # | Mode Name | File | Status | Implementation | MP | Benchmark |
|---|---|---|---|---|---|---|
| 1 | Dunk Contest | `lib/babylon/modes/DunkMode.ts` | SHIPPED | Babylon 3D + CharacterLibrary | ❌ | NBA Live 08 |
| 2 | Basketball 3v3 | `lib/babylon/modes/ThreeVThreeMode.ts` | SHIPPED | Babylon 3D | ❌ | NBA 2K |
| 3 | Streetball 1v1 | `lib/babylon/modes/OneVOneMode.ts` | SHIPPED | Babylon 3D | ❌ | NBA 2K |
| 4 | Karate VS | `lib/babylon/modes/KarateVSMode.ts` | SHIPPED | Babylon 3D | ❌ | Soul Calibur |
| 5 | Karate Endless (Waves) | `lib/babylon/modes/KarateEndlessMode.ts` | SHIPPED | Babylon 3D + AI co-op | ❌ | Soul Calibur + Waves |
| 6 | Duel (Generic 1v1) | `lib/babylon/modes/DuelMode.ts` | SHIPPED | Babylon 3D | ❌ | Generic |
| 7 | Dunk Duel | `lib/babylon/modes/DunkDuelMode.ts` | SHIPPED | Babylon 3D | ❌ | NBA Live Dunk Challenge |
| 8 | Showdown | `lib/babylon/modes/ShowdownMode.ts` | SHIPPED | Babylon 3D | ❌ | Tournament Mode |
| 9 | Mixed Combat | `lib/babylon/modes/MixedCombatMode.ts` | SHIPPED | Babylon 3D | ❌ | MMA |
| 10 | Court Carnival | `lib/babylon/modes/CourtCarnivalMode.ts` | SHIPPED | Babylon 3D | ❌ | Wii Sports Resort |

### ⚠️ TIER B — CANVAS 2D MODES (Need 3D Migration) (8 modes)

| # | Mode Name | File | Status | Implementation | MP | Benchmark |
|---|---|---|---|---|---|---|
| 11 | Tennis | `components/games/tennis-game.tsx` | MOCKUP | Canvas 2D | ❌ | TBD (PHASE 2) |
| 12 | Golf | `components/games/golf-game.tsx` + `golf-3d.tsx` | HYBRID | Canvas 2D + partial 3D | ❌ | TBD (PHASE 2) |
| 13 | Soccer | `components/games/soccer-game.tsx` | MOCKUP | Canvas 2D | ❌ | TBD (PHASE 2) |
| 14 | Baseball | `components/games/baseball-game.tsx` | MOCKUP | Canvas 2D | ❌ | TBD (PHASE 2) |
| 15 | Football | `lib/babylon/modes/FootballMode.ts` | MOCKUP | Canvas 2D (via game loop) | ❌ | TBD (PHASE 2) |
| 16 | Skateboard | `lib/babylon/modes/SkateRunMode.ts` | MOCKUP | Canvas 2D | ❌ | Skate 3 |
| 17 | Surf | `lib/babylon/modes/SurfBreakMode.ts` | MOCKUP | Canvas 2D | ❌ | SSX |
| 18 | Snowboard | `lib/babylon/modes/SnowboardSlalomMode.ts` | MOCKUP | Canvas 2D | ❌ | SSX |

### ⚠️ TIER C — UNIMPLEMENTED STUBS (2 modes)

| # | Mode Name | File | Status | Implementation | MP | Benchmark |
|---|---|---|---|---|---|---|
| 19 | Gymnastics | NOT FOUND | STUB | Unimplemented | ❌ | TBD (PHASE 2) |
| 20 | Dance Rhythm | `lib/babylon/modes/DanceMode.ts` (partial) | STUB | Partial Babylon 3D | ❌ | TBD (PHASE 2) |

### ❌ TIER D — ORPHANED / NOT IN CODEBASE (3 modes)

| # | Mode Name | Status | Decision | Benchmark |
|---|---|---|---|---|
| 21 | Unreal Arena | NOT FOUND | TBD (PHASE 7) | TBD |
| 22 | Velocity Kart Grand Prix | NOT FOUND | TBD (PHASE 7) | TBD |
| 23 | Aero Aces Flyer | NOT FOUND | TBD (PHASE 7) | TBD |

### ❌ TIER E — EXCLUDED (1 mode)

| # | Mode Name | File | Reason | Status |
|---|---|---|---|---|
| — | Brain Brawl | TBD | Non-3D (React/DOM) — exempt from 3D compliance | Documented Exception |

---

## PHASE 1 COMPLETION CRITERIA

- [x] Verified 5 mislabeled modes (Canvas 2D listed as 3D)
- [x] Verified 3 orphaned modes (not in codebase)
- [x] Discovered Golf uses hybrid Canvas/Babylon implementation
- [x] Identified Gymnastics as truly unimplemented stub
- [x] Created authoritative MASTER_MODE_LIST.md

**RESULT**: 18 active modes identified + 3 orphaned + 2 unimplemented + 1 exempt = 24 total modes in project scope

---

## IMMEDIATE OBSERVATIONS

1. **Canvas 2D to Babylon 3D**: 8 modes need full migration (Tennis, Golf, Soccer, Baseball, Football, Skateboard, Surf, Snowboard)
2. **Unimplemented**: Gymnastics + Dance Rhythm need real implementation
3. **Orphaned**: 3 modes (Unreal Arena, Velocity Kart, Aero Aces) must be retired or explicitly added back
4. **MP Status**: 0 of 18 active modes have networking implemented
5. **Benchmark Status**: 6 of 20 modes still need benchmarks locked (PHASE 2 work)

