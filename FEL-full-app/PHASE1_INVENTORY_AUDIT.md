# PHASE 1 — INVENTORY CORRECTION

**Objective**: Correct 5 mislabeled modes + resolve 3 missing modes → produce ONE authoritative master list

**Status**: IN PROGRESS

## Audit: 5 Mislabeled Modes (Canvas 2D but labeled as "shipped 3D")

From audit findings, these are miscategorized:

### 1. Streetball 1v1 — Listed as "Babylon 3D shipped" but is Canvas 2D
**File**: Need to find

### 2. Skateboard (SkateRunMode) — Listed as "Babylon 3D shipped" but is Canvas 2D
**File**: `lib/babylon/modes/SkateRunMode.ts`

### 3. Surf (SurfBreakMode) — Listed as "Babylon 3D shipped" but is Canvas 2D
**File**: `lib/babylon/modes/SurfBreakMode.ts`

### 4. Snowboard (SnowboardSlalomMode) — Listed as "Babylon 3D shipped" but is Canvas 2D
**File**: `lib/babylon/modes/SnowboardSlalomMode.ts`

### 5. Golf — Listed as "Babylon 3D" but is dual/hybrid Canvas implementation
**File**: `lib/babylon/modes/GolfMode.ts` or similar

## Audit: 3 Missing Modes

From audit findings, these modes are NOT found in codebase:

1. **UnrealArenaMode** — Not in `lib/babylon/modes/`
2. **VelocityKartGrandPrixMode** — Not in `lib/babylon/modes/`
3. **AeroAcesFlyerMode** — Not in `lib/babylon/modes/`

## PHASE 1 WORK:

### Step 1.1: Verify all 5 mislabeled modes exist & confirm Canvas 2D
### Step 1.2: Verify 3 missing modes do not exist in codebase
### Step 1.3: Create corrected MASTER_MODE_LIST.md (authoritative source of truth)

