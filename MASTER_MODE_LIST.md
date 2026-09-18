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
| 11 | Tennis | `components/games/tennis-game.tsx` | MOCKUP | Canvas 2D | ❌ | Mario Tennis Aces |
| 12 | Golf | `components/games/golf-game.tsx` + `golf-3d.tsx` | HYBRID | Canvas 2D + partial 3D | ❌ | PGA Tour 2K |
| 13 | Soccer | `components/games/soccer-game.tsx` | MOCKUP | Canvas 2D | ❌ | PES Penalty Mode |
| 14 | Baseball | `components/games/baseball-game.tsx` | MOCKUP | Canvas 2D | ❌ | MLB The Show (Hitting) |
| 15 | Football | `lib/babylon/modes/FootballMode.ts` | MOCKUP | Canvas 2D (via game loop) | ❌ | Madden NFL Arcade |
| 16 | Skateboard | `lib/babylon/modes/SkateRunMode.ts` | MOCKUP | Canvas 2D | ❌ | Skate 3 |
| 17 | Surf | `lib/babylon/modes/SurfBreakMode.ts` | MOCKUP | Canvas 2D | ❌ | SSX |
| 18 | Snowboard | `lib/babylon/modes/SnowboardSlalomMode.ts` | MOCKUP | Canvas 2D | ❌ | SSX |

### ⚠️ TIER C — UNIMPLEMENTED STUBS (2 modes)

| # | Mode Name | File | Status | Implementation | MP | Benchmark |
|---|---|---|---|---|---|---|
| 19 | Gymnastics | NOT FOUND | STUB | Unimplemented | ❌ | Wii Sports Bowling (Adapted) |
| 20 | Dance Rhythm | `lib/babylon/modes/DanceMode.ts` (partial) | STUB | Partial Babylon 3D | ❌ | Just Dance |

### ❌ TIER D — ORPHANED / NOT IN CODEBASE (3 modes)

| # | Mode Name | Status | Decision | Benchmark |
|---|---|---|---|---|
| — | Unreal Arena | NOT IN CODEBASE | **RETIRED** | — |
| — | Velocity Kart Grand Prix | NOT IN CODEBASE | **RETIRED** | — |
| — | Aero Aces Flyer | NOT IN CODEBASE | **RETIRED** | — |

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


---

## PHASE 2 COMPLETION STATUS ✅

**All 18 active modes now have locked benchmarks:**

| Count | Category | Modes |
|-------|----------|-------|
| 10 | Babylon 3D (Shipped) | All have benchmarks locked |
| 8 | Canvas 2D (Migration pending) | Now have benchmarks locked (Tennis→Mario Tennis, Golf→PGA 2K, Soccer→PES, Baseball→MLB, Football→Madden, Skate→Skate 3, Surf→SSX, Snow→SSX) |
| 2 | Stubs (Unimplemented) | Gymnastics→Wii Bowling, Dance→Just Dance |
| 3 | Orphaned | **RETIRED** (not in codebase; bandwidth to implement in v1 rejected) |

**Result**: 18 of 18 active modes have locked AAA benchmarks. 0 modes remain TBD.

---

