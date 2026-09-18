# Homebrew ROM Creator Platform — Technical Risk Assessment & Emulator Evaluation

**Date**: 2026-08-28  
**Status**: Pre-Implementation Analysis  
**Purpose**: Identify technical risks and validate emulator choice before committing to code

---

## PART 1: EMULATOR CORE TECHNICAL EVALUATION

### A. EmulatorJS vs. libretro WASM: Detailed Comparison

#### EmulatorJS (Primary Recommendation)

**Profile**:
- A JavaScript wrapper around pre-compiled emulator cores (Emulicious, FCEUX, etc.)
- WASM-compiled binaries; JavaScript API for I/O
- Active maintenance (GitHub: linuxserver/emulatorjs)

**Technical Details**:

| Aspect | Details |
|--------|---------|
| **Supported Cores** | NES, SNES, GB, GBA, Genesis, Atari, N64, PSX (partial), more |
| **WASM Bundle Size** | ~15-25MB (single platform), ~80MB (all cores) — lazy-loadable |
| **API Surface** | Simple: `EJS_player(rom, canvas)` + gamepad input |
| **Accuracy** | Cycle-accurate for NES/SNES (Blargg test ROMs pass) |
| **License** | MIT / GPL-compatible (no commercial ROMs bundled) |
| **Performance** | 60fps on modern browsers (Chrome, Firefox, Safari) |
| **Maintenance** | Actively maintained (last update 2026-08); community responsive |

**Pros**:
1. **Fast integration**: Drop-in HTML + JS, no build complexity
2. **Proven on homebrew**: Used by itch.io, homebrew archives
3. **Simple API**: Single function call to boot ROM; zero emulation logic needed
4. **Legal clarity**: Open-source only; no commercial ROM risk
5. **Customizable UI**: JavaScript overlay can wrap emulator canvas
6. **Gamepad support**: Built-in; maps controller inputs directly

**Cons**:
1. **Limited customization**: Cannot hook into emulation internals (frame-level state impossible without reverse-engineering WASM)
2. **Maintenance risk**: If linuxserver/emulatorjs discontinued, community forks exist but may lag
3. **Rewind/TAS**: Not easily supported (would need custom WASM fork)
4. **Save state format**: Per-core, no unified format (mitigation: store binary snapshots)
5. **Module bloat**: All cores ship with bundle; must lazy-load or tree-shake

**Integration Approach for Co-op**:
```javascript
// Host (Player A)
const emulator = new EJS.GameClient({
  gameUrl: "/api/roms/fetch/{romId}",
  canvas: "#gameCanvas",
  gamePadIndex: 0
});

// Capture input from EJS internal state
setInterval(() => {
  const inputState = captureGamepadState(); // Hook GamepadAPI
  socket.emit("input", { frame: emulator._currentFrame, input: inputState });
}, 16); // ~60 FPS

// Apply remote input
socket.on("remote_input", (data) => {
  injectGamepadState(data.input); // Synthetic event or WASM memory write
});
```

**Risk**: Injecting remote input requires either:
1. GamepadAPI event simulation (works for keyboard, not native gamepad)
2. WASM memory injection (possible but fragile; core-dependent)
→ Mitigation: Use software controller (on-screen buttons) for co-op guests; native gamepad for host only

---

#### libretro WASM (Secondary Option for v1.5+)

**Profile**:
- The Libretro project provides pluggable emulator cores via a unified API
- Multiple WASM-compiled cores available (RetroArch-style)
- More complex but more flexible

**Technical Details**:

| Aspect | Details |
|--------|---------|
| **Supported Cores** | 100+ cores (every platform imaginable) |
| **WASM Bundle Size** | ~5-15MB per core (more granular than EmulatorJS) |
| **API Surface** | Libretro C ABI, JavaScript bindings (more complex) |
| **Accuracy** | Varies by core; many are accurate |
| **License** | GPL 2.0 (stricter than MIT) |
| **Performance** | 60fps + (optimized cores) |
| **Maintenance** | Active community (retroachievements, arcade-serious users) |

**Pros**:
1. **Modular**: Cherry-pick only cores you need (smaller bundle)
2. **GGPO-Ready**: Some cores built for competitive rollback (later phase)
3. **Better tooling**: Save state/rewind built into Libretro standard
4. **Community**: Large, active, well-documented

**Cons**:
1. **Complexity**: Requires understanding Libretro ABI; steeper integration curve
2. **GPL strict**: Requires open-source all derived work (vs MIT)
3. **Maturity**: WASM bindings newer than EmulatorJS; fewer production examples
4. **Build overhead**: May need to compile cores from source if pre-built WASM not available
5. **Timeline**: 4-6 weeks to fully integrate vs 2 weeks for EmulatorJS

**Recommendation for v1.5+**: After EmulatorJS ships and proves concept, migrate to libretro WASM for better rollback netcode support (Phase C).

---

### B. Why NOT Build Custom Emulator

**Scenario**: "We should build a lightweight NES emulator in Rust/WebAssembly"

**Reality Check**:
- **Development Time**: 8-12 months for cycle-accurate, multiplayer-safe emulator
- **Expertise Required**: Deep x86/6502 assembly knowledge; cycle counting; pin-perfect timing
- **Testing**: Tens of thousands of public test ROMs (Blargg suite, etc.)
- **Maintenance**: Community contributions, bug fixes, new platform support
- **Opportunity Cost**: Entire Platform feature blocked for a year

**Verdict**: ❌ **Not viable for this scope.** Use proven emulator (EmulatorJS) instead.

---

## PART 2: NETWORKING & SYNC TECHNICAL RISKS

### A. Co-op Synchronization Challenges

#### Challenge 1: Frame Drift

**Problem**: Two players loading the same ROM will begin at frame 0, but:
1. Network latency (100-500ms) causes input to arrive out-of-order
2. Browser frame timing varies (vsync not guaranteed)
3. Different devices have different CPU speeds (old laptop vs gaming PC)

**Result**: Player A is at frame 1200, Player B at frame 1180 → desynchronized gameplay

**Mitigation Strategy**:
```
Player A (Host)
  frame 1200: inputs = [joypad 0x05] ← captured at frame 1200
  sends: { frame: 1200, input: 0x05 }
         
Server (logs in order)
  received @ 1200.150s: { frame: 1200, input: 0x05, playerId: "A" }
  received @ 1200.200s: { frame: 1199, input: 0x03, playerId: "B" }
  
Broadcasts to both (with priority to "future"):
  { frame: 1200, playerId: "A", input: 0x05 }
  { frame: 1199, playerId: "B", input: 0x03 }

Client B (Guest)
  Currently at frame 1198; already predicted frame 1199
  Receive frame 1199 input from "B" (self) → matches prediction ✓
  Receive frame 1200 input from "A" → buffer for next iteration
  Advance to frame 1200 with A's input applied
```

**Risk**: If network drops for >1 second, one player will "get ahead." 
**Solution**: Heartbeat sync every 1s with full emulator state hash; if hashes don't match, Server sends canonical state to catch-up player.

---

#### Challenge 2: Input Reordering

**Problem**: Inputs can arrive out-of-order due to network jitter.

```
Frame 100: A sends input → delayed 200ms
Frame 101: B sends input → arrives immediately

Server receives:
  @ t=1ms: input from B (frame 101)
  @ t=202ms: input from A (frame 100)

Player B already processed frame 100 with their own prediction.
Now gets corrected input for frame 100 → must rollback or ignore.
```

**Mitigation**:
1. **Sequence numbers**: Each input tagged with frame # (not wall-clock time)
2. **Input buffer**: Hold inputs for ~200ms, then apply in frame order
3. **Predictive replay**: Client predicts own input; Server applies corrections

**Implementation**:
```typescript
interface FramedInput {
  frame: number;         // Emulator frame counter
  playerId: string;
  input: GamepadState;
  timestamp: number;     // Server-side arrival time (for logging only)
}

// Server-side buffer:
inputBuffer[frame][playerId] = input;

// Client-side consumption:
for (let f = lastAppliedFrame + 1; f <= currentFrame; f++) {
  const inputA = inputBuffer[f]["A"] || lastKnownInput["A"];
  const inputB = inputBuffer[f]["B"] || lastKnownInput["B"];
  emulator.setInput(inputA, inputB);
  emulator.advance(1); // 1 frame
}
```

**Risk**: Still vulnerable to >1s network delays.
**Solution**: Cap buffer to 30 frames (~500ms at 60fps); beyond that, trigger full state sync.

---

#### Challenge 3: State Divergence After Long Session

**Problem**: After 10-30 minutes of play, subtle differences accumulate:
- Floating-point rounding errors
- RNG seeds diverging (if not synchronized)
- Save-state format differences between players

**Mitigation**:
1. **Frame-Perfect Sync** (every 30 seconds):
   - Host sends full emulator state (CPU registers, RAM, vRAM)
   - Size: ~64KB for NES, ~256KB for GBA
   - Compress as ZIP or brotli → ~10-50KB
   - Guest receives, validates hash, applies if different

2. **RNG Synchronization**:
   - If ROM uses RNG (Pokémon, etc.), seed it deterministically from frame counter
   - Inject seed at ROM load: `srand(romHash XOR frameCounter)`
   - Both players derive same random numbers from same frame

3. **Save-State Format**:
   - Use EmulatorJS native save format (core-specific)
   - On sync, both players receive binary state blob, apply directly

**Risk**: ~10-50KB sync messages every 30s = ~2-8KB/s overhead (acceptable).
**Solution**: Implement monitoring; if desync occurs frequently, flag ROM as "not co-op safe."

---

### B. Fallback & Failure Modes

#### Scenario 1: Guest loses connection mid-game

**Current State**:
- Host still playing
- Guest disconnected

**Options**:
1. **Pause**: Both players see "waiting for player" message; resume if reconnect within 5min
2. **Continue Solo**: Guest's session ends; host continues solo (no co-op stats recorded)
3. **Auto-Join**: If guest reconnects within 5min to same session, re-sync state and resume

**Recommendation**: Option 1 (pause + 5-min rejoin window)
- Better UX for accidental disconnects
- Sessions resume naturally on network recovery

---

#### Scenario 2: Server crashes or is restarted

**Current State**:
- Players in active session
- Server goes down

**Mitigation**:
1. **Session Persistence**: Periodically save session state (input log, current frame) to database
2. **Resume on Reboot**: Players reconnect within 30s → server sends last known state, they resume
3. **Graceful Degradation**: If server unavailable >30s, client shows "Session ended" + option to save replay

**Implementation**:
```
Every 10 seconds, server writes:
  sessions/{sessionId}/checkpoint
    - currentFrame
    - playerStates
    - inputLog (last 100 frames for recovery)

On reboot:
  If sessionId exists in DB with recentCheckpoint:
    Send to reconnecting players: "Resuming from frame 2150"
  Else:
    Clean session, players start over
```

---

## PART 3: STORAGE & SCALING RISKS

### A. ROM File Storage Explosion

**Scenario**: 100 active users, 10 ROMs each, 5MB average
```
100 × 10 × 5MB = 5TB total storage
Cloud cost: ~$100-150/month (Firebase), ~$50-75 (S3)
```

**Risk**: Unbounded growth; users upload test versions, duplicates, etc.

**Mitigations**:

1. **Upload Limits** (hard cap):
   - Per-user: 100MB total quota initially (10 × 10MB games)
   - Single file: 50MB max (reasonable for GBA, excludes PSX)
   - Enforce client-side + server-side validation

2. **Deduplication** (file-level):
   - Compute SHA256 hash of every upload
   - Store only one copy if hash matches existing ROM
   - Metadata points to same file (soft link in database)
   - Reduces bloat by ~20% (duplicate test ROMs)

3. **Expiry Policy**:
   - Unpublished ROMs: delete after 30 days
   - Published ROMs: keep indefinitely (user creation)
   - Failed uploads (incomplete): delete after 7 days

4. **Compression**:
   - Store ROMs as ZIP (5-10% savings)
   - Decompress on-the-fly in browser (adds <100ms)
   - Trade: CPU for storage

5. **Tiered Storage**:
   - Hot: recently played ROMs (Firebase Storage, CDN)
   - Warm: published but not played in 30 days (S3 Standard)
   - Cold: archived ROMs (S3 Glacier, requires manual restore)

**Cost Projection** (6-month horizon):
```
Month 1:   100 users × 50MB avg = 5GB → $0.50
Month 3:   500 users × 50MB avg = 25GB → $2.50
Month 6:   2000 users × 50MB avg = 100GB → $10/mo (Firebase)
                                        → $5/mo (S3 + lifecycle)
```

**Decision**: Launch with Firebase (built-in), migrate to S3 + lifecycle rules if >100GB.

---

### B. Database Scaling

**Queries per second** (projected 6 months):
- 200 users online
- Browse library: ~10 users/sec (search + list operations)
- ROM metadata fetch: ~50/sec (metadata + player count)
- Session state updates: ~20/sec (co-op heartbeats)
- Creator Card updates: ~1/sec (async stats job)

**Firestore Limits**:
- Free tier: 50k reads/day (breakeven ~0.6 RPS)
- Paid: $0.06 per 100k reads

**Scaling Strategy**:
1. **Caching**: Use Redis/Memcache for:
   - ROM list + trending (update every 1hr)
   - Creator Card stats (update every 15min)
   - Session state (cache 10min, write-back to DB)

2. **Indexing**: Create composite indexes for:
   - `(platform, createdAt)` → ROM discovery
   - `(creatorId, publishedAt)` → User's ROMs
   - `(rating, downloads)` → Trending

3. **Denormalization**:
   - Store `playCount` in ROM metadata (update incrementally)
   - Store `gamesCreated` count on User profile

**Risk**: Hot ROMs (1000+ plays) cause write contention.
**Solution**: Use separate "stats" collection, batch update every 5sec (eventual consistency OK).

---

## PART 4: SECURITY RISKS

### A. ROM Ingestion Security

**Attack**: User uploads EXE disguised as `.nes` file

**Defense Layers**:
1. **File Type Validation**:
   ```typescript
   const header = file.slice(0, 16);
   if (!isValidNESHeader(header)) throw new Error("Invalid NES file");
   ```

2. **Size Checks**:
   - NES: exactly 16-byte header + (16KB-1MB) size
   - GBA: must be 2^n MB (2/4/8/16/32)
   - Flag edge cases for manual review

3. **Sandboxing**:
   - Run emulator in Web Worker (separate JS context)
   - ROM never touches main thread
   - Restrict Worker API (no fetch, no DOM access)

4. **Content Security Policy (CSP)**:
   ```
   default-src 'self';
   script-src 'self' 'wasm-unsafe-eval';  // EmulatorJS needs WASM eval
   style-src 'self' 'unsafe-inline';
   ```

**Residual Risk**: ✅ Low (file format validation + sandboxing is standard practice).

---

### B. Save-State Injection

**Attack**: Attacker crafts malicious save-state file, distributes as "cheat code"

**Defense**:
1. **Source verification**: Only accept save-states from authorized source (host, not guest)
2. **Size bounds**: Reject save-state >2× expected emulator RAM
3. **Integrity check**: SHA256 hash save-state, verify before applying
4. **Rollback**: If crash after load, revert to previous known-good state

**Residual Risk**: ✅ Very Low (save-states are binary data, not code).

---

### C. DMCA Abuse (False Claims)

**Attack**: Attacker mass-reports legitimate homebrew ROMs as infringing, causing false takedowns

**Defense**:
1. **Attestation Permanence**: ROMs can only be removed by creator or verified DMCA claimant
2. **Appeal Process**: Creator can provide proof of original work (source code, creation date, development logs)
3. **Repeat Offender Tracking**: Track false claims per reporting account; after 3 false claims, require manual review
4. **Community Rating**: Legitimate homebrew tends to have high rating; flag low-rating takedown requests as suspicious

**Residual Risk**: ✅ Medium (legal/procedural, not technical).

---

## PART 5: EMULATOR-SPECIFIC RISKS

### A. EmulatorJS Browser Compatibility

| Browser | Support | Risk |
|---------|---------|------|
| Chrome 90+ | ✅ Full | Low |
| Firefox 88+ | ✅ Full | Low |
| Safari 14+ | ⚠️ Partial WASM | Medium (older Safari buggy) |
| Edge 90+ | ✅ Full | Low |
| Mobile Safari | ❌ Limited | High (WASM performance, battery) |

**Mitigation**:
- Recommend desktop browsers in UI
- Graceful fallback: "Emulator not compatible with your browser"
- Optional: Server-side fallback (cloud gaming) in Phase 2

---

### B. Frame-Perfect Sync Impossible for Some Games

**Games that are risky for co-op**:
- Frame-perfect platformers (Mega Man, Castlevania)
- Fighting games (Street Fighter, Final Fantasy V)
- Rhythm games (Tetris with T-spin mechanics)

**Games that work great for co-op**:
- Turn-based RPGs (Final Fantasy, Pokémon)
- Puzzle games (Puyo Puyo, Dr. Mario)
- Narrative games (text adventures, visual novels)

**Mitigation**:
- Tag ROMs by co-op suitability ("Turn-based RPG" ✅ vs "Mega Man" ⚠️)
- Community feedback: "Sync issues with this ROM" → tag as "experimental co-op"
- Minimum playability threshold: if >50% co-op sessions end before 5min, flag for review

---

## PART 6: INTEGRATION RISKS WITH FEL CORE

### A. WebSocket Namespace Collision

**Risk**: FEL sport modes and ROM co-op sessions compete for same WebSocket server

**Mitigation**:
```
FEL v1 (sport modes): /socket.io/?namespace=sport
ROM co-op:            /socket.io/?namespace=rom

Each namespace has independent rooms/players
Server capacity: 5000 concurrent connections
Projected ROM usage (Phase A): <100 concurrent → safe margin
```

---

### B. Creator Card Data Consistency

**Risk**: ROM stats (plays, rating) updated asynchronously; Creator Card shows stale data

**Mitigation**:
1. **Event-Driven Updates**: 
   - When ROM session ends → emit event "rom:session_ended"
   - Event listener updates Creator Card stats immediately

2. **Batch Updates**: 
   - Nightly job aggregates all stats, writes to Creator Card
   - UI shows "Updated 6 hours ago" disclaimer if >3 hours stale

3. **Cache Invalidation**: 
   - When ROM stats change, clear Creator Card cache for that user
   - Next load fetches fresh data

---

## PART 7: OPEN TECHNICAL QUESTIONS

Before greenlight to implementation phase:

1. **WASM Security**: Should emulator run in Web Worker (isolated) or main thread (faster)?
   - Answer determines co-op input injection complexity

2. **Save-State Frequency**: Every 30sec full state, or every 1s hash + reconcile?
   - Trade bandwidth vs sync accuracy

3. **Offline Mode**: Should ROMs be playable offline (service worker cache)?
   - Deferred to v1.5 if yes

4. **Community Moderation**: Auto-flag suspected ROMs, or human review from start?
   - Risk tolerance determines policy

5. **Statistics Granularity**: Track per-session stats (player, duration, outcome), or just aggregate?
   - Storage/query cost trade-off

---

## CONCLUSION

**Overall Risk Level**: 🟡 **MEDIUM**

**High-Confidence Areas**:
- ✅ EmulatorJS integration (proven technology)
- ✅ Co-op sync for turn-based games (well-understood)
- ✅ Storage/database scaling (standard cloud patterns)

**Moderate-Risk Areas**:
- ⚠️ Frame-level sync for action games (may require v1.5 refinement)
- ⚠️ DMCA/legal compliance (procedural, not technical)
- ⚠️ Browser compatibility (graceful fallback mitigates)

**Low-Risk Areas**:
- ✅ Security (sandboxing + file validation proven)
- ✅ Creator Card integration (straightforward data model)
- ✅ Deployment (extends existing FEL stack)

**Recommendation**: Proceed to implementation (Phase A) with understanding that **competitive rollback netcode is explicitly deferred** and **co-op v1 targets turn-based/puzzle games, not frame-perfect platformers**.

---

**Approved by**: [Awaiting confirmation]  
**Date**: 2026-08-28

