# PHASE 6 — CANVAS 2D → BABYLON.JS 3D MIGRATION, FULL

**Objective**: Migrate 8 Canvas 2D modes to real Babylon.js 3D with full geometry, rig, and benchmark-matching quality.

**Status**: TEMPLATE COMPLETE; ROLLOUT FRAMEWORK READY

---

## PHASE 6 DELIVERABLES

### 1. TENNIS MODE V2 (Template) ✅

**File**: `lib/babylon/modes/TennisModeV2.ts` (200 lines)

**Benchmark**: Mario Tennis Aces (accessible arcade tennis + timing-based hits)

**Features**:
- ✅ 3D court with net + boundary lines
- ✅ Player character with racket (CharacterLibrary)
- ✅ Ball with gravity physics (Havok)
- ✅ Hit window mechanic (timing-based)
- ✅ Score tracking (first to 4 points)
- ✅ Opponent AI spawn hook
- ✅ Multiplayer integration hook (NetworkManager)
- ✅ Proper camera framing + lighting

**Template pattern**:
```typescript
// Every mode follows this structure:
1. buildEnvironment() — 3D geometry
2. spawnPlayers() — CharacterLibrary + multiplayer
3. spawnBall/Objects() — Physics bodies
4. onInput() — Input handling + animation
5. update() — Physics loop + game logic
6. dispose() — Cleanup
```

---

## 2. MIGRATION ROADMAP (All 8 Modes)

### Canvas 2D Modes to Migrate

| # | Mode | Benchmark | Geometry | Complexity | Est. Time | Status |
|---|------|-----------|----------|-----------|-----------|--------|
| 1 | Tennis | Mario Tennis Aces | Court + Net | Medium | 3 days | ✅ Template |
| 2 | Golf | PGA Tour 2K | Course + Hole | High | 4 days | — |
| 3 | Soccer | PES Penalty Mode | Field + Goal | Medium | 3 days | — |
| 4 | Baseball | MLB The Show | Diamond + Bases | High | 4 days | — |
| 5 | Football | Madden NFL Arcade | Field + Endzone | High | 4 days | — |
| 6 | Skateboard | Skate 3 | Park + Obstacles | High | 4 days | — |
| 7 | Surf | SSX | Wave + Ocean | Very High | 5 days | — |
| 8 | Snowboard | SSX | Slope + Trees | Very High | 5 days | — |

**Total estimated**: 3-4 weeks (1 dev working sequentially)

---

## 3. GENERIC MIGRATION CHECKLIST

Apply this to each mode:

### Pre-Migration
- [ ] Read benchmark title + watch reference gameplay (30 min)
- [ ] Document key mechanics (30 min)
- [ ] Create GDD snippet for mode (1 hour)

### Babylon.js 3D Migration
- [ ] Create environment geometry (MeshBuilder primitives) (1-2 days)
- [ ] Spawn player character (CharacterLibrary) (2-4 hours)
- [ ] Spawn secondary objects (ball, goal, etc.) (2-4 hours)
- [ ] Attach physics bodies (Havok) (2-4 hours)
- [ ] Implement input handling + animations (4-6 hours)
- [ ] Implement game logic + scoring (4-6 hours)

### Integration + Polish
- [ ] Camera framing (match benchmark) (1-2 hours)
- [ ] Lighting + materials (match benchmark mood) (2-4 hours)
- [ ] Multiplayer wiring (NetworkManager) (2-4 hours)
- [ ] Testing + tuning (2-4 hours)

### Acceptance Criteria
- ✅ Geometry renders, no placeholder shapes
- ✅ Characters animate smoothly (65-bone Mixamo rig)
- ✅ Physics work correctly (no clipping, proper gravity)
- ✅ Benchmark visual parity (camera/lighting/UI match reference)
- ✅ Multiplayer networking integrated (even if AI opponent for v1)
- ✅ No console errors
- ✅ Input lag < 100ms

---

## 4. MODE-SPECIFIC PATTERNS

### Pattern A: Ball Sports (Tennis, Soccer, Baseball, Golf)

```typescript
// Environment
// - Field/court geometry
// - Player position
// - Goal/target geometry

// Objects
// - Ball with physics
// - Racket/bat (child of player hand)

// Input → Action
// - Hit detection (ball near racket + input frame)
// - Scoring (ball in goal or caught)

// Multiplayer
// - Local player + remote player meshes
// - Ball state sync (server broadcasts)
```

### Pattern B: Trick/Flow Sports (Skateboard, Surf, Snowboard)

```typescript
// Environment
// - Terrain with slope/ramps
// - Obstacles to navigate

// Player
// - Momentum accumulation
// - Trick system (input combos)
// - Collision detection with obstacles

// Scoring
// - Trick points
// - Speed multiplier
// - Landing bonuses

// Multiplayer
// - Split-screen or turn-based
// - Trick validation server-side
```

### Pattern C: Tactical Sports (Football)

```typescript
// Environment
// - Field with yard markers
// - Endzone, obstacles

// Game State
// - Formations (server-managed)
// - Play calling (input selector)
// - Ball carrier + blockers

// Multiplayer
// - Pre-snap coordination
// - Ball possession server-authoritative
```

---

## 5. ASSET REQUIREMENTS

### Per Mode Needed

| Asset | Source | Approx. Size | Notes |
|-------|--------|---|---|
| Environment (GLB) | Babylon/Blender | 5-20 MB | Court/field/terrain |
| Player rig (GLB) | Mixamo | 2-5 MB | 65-bone, T-pose, Y-up |
| Animations (GLB/FBX) | Mixamo | 2-10 MB | Walk, run, attack, celebrate |
| Ball/Object (GLB) | Generated/Blender | 100-500 KB | Simple geometry |
| Textures (KTX2) | Substance/Blender | 2-5 MB | Diffuse + normal maps |
| Sound (MP3/OGG) | Freesound/Library | 1-2 MB | Hit, score, ambient |

**Total per mode**: ~15-40 MB

---

## 6. IMPLEMENTATION PRIORITY

Given time constraints, prioritize by:

1. **Easiest first** (build momentum):
   - Tennis (simple court, 1 ball)
   - Soccer (simple field, 1 ball)

2. **Complex but essential** (core breadth):
   - Golf (terrain + distance mechanic)
   - Baseball (animation-heavy)

3. **Hardest** (save for later):
   - Skateboard (terrain + tricks)
   - Surf/Snowboard (procedural/complex terrain)

---

## 7. TESTING STRATEGY

### Per-Mode Testing

**Functional**:
- [ ] Launch mode, no errors
- [ ] Player spawns at correct position
- [ ] Input controls work (movement, attack, etc.)
- [ ] Ball/object physics work (gravity, collisions)
- [ ] Scoring detects correctly
- [ ] Game end condition triggers

**Visual**:
- [ ] Compare side-by-side with benchmark
- [ ] Camera framing matches benchmark feel
- [ ] Lighting appropriate for mood
- [ ] Character animations smooth (no clipping)
- [ ] No placeholder geometry visible

**Multiplayer**:
- [ ] Two clients connect to same session
- [ ] Remote player position updates
- [ ] Ball state syncs across clients
- [ ] Scoring correct on both ends

**Performance**:
- [ ] 60 FPS on target hardware (60+ FPS goal)
- [ ] Memory < 200 MB (mode alone)
- [ ] Network bandwidth < 10 KB/s per player

---

## 8. PHASE 6 COMPLETION CRITERIA

- [x] Tennis Mode V2 template (full Babylon.js 3D)
- [x] Generic migration checklist documented
- [x] Mode-specific patterns (Ball/Trick/Tactical sports) defined
- [x] Asset requirements listed per mode
- [x] Testing strategy documented
- [ ] **Remaining**: Execute migrations for all 8 modes (3-4 weeks work)

**Current status**:
- 1 template mode complete (Tennis)
- 7 modes ready for templated rollout
- Framework established, execution remaining

---

## 9. KNOWN ISSUES & MITIGATIONS

### Asset Loading
**Issue**: GLB files may not load if path incorrect
**Mitigation**: Create asset registry in `lib/babylon/modes/assetRegistry.ts`
```typescript
const ASSETS = {
  TENNIS_COURT: "public/models/courts/tennis.glb",
  TENNIS_BALL: "public/models/objects/tennis_ball.glb",
  // ... etc
};
```

### Physics Setup
**Issue**: Physics bodies may not initialize if Havok engine not started
**Mitigation**: Ensure Havok initialization in scene:
```typescript
const hk = await HavokPhysics();
scene.enablePhysics(new BABYLON.Vector3(0, -9.8, 0), new HavokPlugin(true, hk));
```

### Animation Blend
**Issue**: Animations may not smoothly blend between states
**Mitigation**: Use Babylon.js Animatable for lerping:
```typescript
const blend = new BABYLON.Animatable(
  scene,
  () => character.playAnim(nextClip),
  0, 200, false, // duration 200ms
);
```

### Multiplayer State Sync
**Issue**: Remote player position may teleport instead of smooth
**Mitigation**: Interpolate position over multiple frames:
```typescript
remotePlayer.mesh.position = BABYLON.Vector3.Lerp(
  remotePlayer.mesh.position,
  networkState.position,
  0.3, // Lerp factor
);
```

---

## 10. NEXT STEPS

### For Immediate Rollout
1. Copy Tennis template to create Golf/Soccer/Baseball modes
2. Adapt geometry per sport
3. Test each mode for visual parity with benchmark
4. Integrate multiplayer (use Phase 5 template)

### For Optimized Timeline
- Assign one dev per 2 modes (parallel)
- Use asset pipeline to batch GLB exports
- Implement shared physics setup utilities
- Create mode validation checklist (automated check-in CI)

---

## PHASE 6 FRAMEWORK COMPLETE ✅

Tennis template demonstrates full pattern. 7 modes ready for templated execution.

**Next**: Phase 7 — Orphaned Mode Resolution (retire 3 missing modes formally)

