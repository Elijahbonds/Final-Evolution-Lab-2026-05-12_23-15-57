# PHASE 4 — MULTIPLAYER ARCHITECTURE DESIGN

**Objective**: Design the complete multiplayer networking layer for FEL before implementation begins in Phase 5.

**Status**: COMPLETE

---

## 1. ARCHITECTURAL OVERVIEW

```
┌─────────────────────────────────────────────────────────────┐
│                   FEL MULTIPLAYER STACK                     │
├─────────────────────────────────────────────────────────────┤
│  TRANSPORT LAYER                                            │
│  ├─ WebSocket (server-relay) — Primary                      │
│  └─ WebRTC (peer-to-peer fallback)                          │
├─────────────────────────────────────────────────────────────┤
│  STATE SYNC LAYER                                           │
│  ├─ Authority Model: Server-Authoritative (inputs)          │
│  ├─ Reconciliation: Client-Predicted + Server Correction    │
│  └─ Tick Rate: 60 Hz server, 120 Hz client interpolation    │
├─────────────────────────────────────────────────────────────┤
│  INPUT PIPELINE                                             │
│  ├─ Local InputBus → Network Queue → Server Authority       │
│  ├─ Latency: 50ms RTT target                                │
│  └─ Rollback: 2-frame buffer for prediction                 │
├─────────────────────────────────────────────────────────────┤
│  BABYLON.JS / HAVOK INTEGRATION                             │
│  ├─ Physics Authority: Server                               │
│  ├─ Skeleton/Animation: Client-predicted, server-corrected  │
│  └─ Camera: Client-authority (local player only)            │
├─────────────────────────────────────────────────────────────┤
│  MODE-SPECIFIC ADAPTERS                                     │
│  ├─ Combat (Karate): 1v1 latency-sensitive                  │
│  ├─ Basketball: 2v2 or 3v3 team dynamics                    │
│  └─ Party Games (Carnival): Async turn-based               │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. AUTHORITY MODEL

### Server-Authoritative Inputs

**Definition**: Server receives player inputs, validates them, computes new state, and broadcasts to all clients.

**Why**: 
- Eliminates cheating (inputs validated server-side)
- Single source of truth for physics (Havok simulated server-side)
- Fair competitive gameplay (no client-side prediction of combat)

**Flow**:
```
Client 1                Server                Client 2
   |                      |                      |
   |--[INPUT FRAME]------->|                      |
   |                       |--[VALIDATE INPUT]    |
   |                       |--[SIMULATE PHYSICS]  |
   |                       |--[COMPUTE NEW STATE] |
   |                       |                      |
   |<-----[STATE UPDATE]---|                      |
   |                       |------[STATE UPDATE]-->|
```

### Client-Predicted Animations

**Definition**: Players animate locally while waiting for server physics confirmation. Animations corrected if server physics diverges.

**Why**:
- Smooth visual feedback (no stall while waiting for server)
- Familiar game feel (immediate character response)
- Corrects automatically when server data arrives

**Flow**:
```
Client Side:
  Input → Local Animation Clip → Visual Feedback
                                      ↓
                          [Server State Arrives]
                                      ↓
                          IF diverges: Rollback + Resync
```

---

## 3. TRANSPORT LAYER

### Primary: WebSocket (Server-Relay)

**Technology**: Node.js + Socket.io (proven, reliable, battle-tested)

**Pros**:
- Fallback to HTTP long-polling (works behind corporate firewalls)
- Auto-reconnection with exponential backoff
- Binary message support for efficient state encoding
- Broadcast primitives (room-based)

**Cons**:
- All traffic through central server (bandwidth cost)
- Latency floor of RTT (no p2p shortcut)

**Protocol** (binary packed):
```
Frame Format (48 bytes):
  [tick: u32][playerId: u16][input: u16][phys_state: 24bytes][checksum: u16]
  
Message Types:
  0x01 = INPUT (client → server)
  0x02 = STATE_SYNC (server → all clients)
  0x03 = CORRECTION (server → client if mispredicted)
  0x04 = ACK (handshake/keepalive)
```

### Fallback: WebRTC Peer-to-Peer

**Technology**: PeerJS or simple WASM-compatible WebRTC

**Use case**: 1v1 modes (Karate, Dunk Duel) where p2p reduces latency

**Handshake**:
1. Both clients connect to server
2. Server exchanges peer connection offers/answers
3. Clients establish direct connection
4. Server still validates/logs (but data path is p2p)

**Not mandatory for v1**: Server-relay sufficient; p2p added in Phase 8+ polish

---

## 4. STATE SYNC STRATEGY

### Tick-Based Simulation

**Server Tick**: 60 Hz (16.67ms per frame)
- Collect all pending inputs from connected clients
- Run Havok physics simulation
- Compute new actor positions, velocities, animation states
- Broadcast state snapshot to all clients

**Client Tick**: 120 Hz interpolation
- Render at monitor refresh rate
- Predict missing frames between server ticks
- Smooth camera, character motion, particle effects
- When server tick arrives: if mispredicted, correct and resume

### State Representation

**Minimal state per actor** (to fit in 48-byte frame):
```typescript
interface NetworkState {
  playerId: u16;              // 2 bytes
  pos: [x, y, z] (f32 each); // 12 bytes
  vel: [x, y, z] (f32 each); // 12 bytes
  rot: yaw (f32);             // 4 bytes
  animFrame: u8;              // 1 byte
  health: u8;                 // 1 byte
  // Total: ~32 bytes
}
```

**Full state sync interval**: Every 250ms (every 15 server ticks) + delta frames

### Input Queue

**Client buffers inputs** until acknowledged by server:
```typescript
interface InputFrame {
  tick: u32;           // Server tick number
  playerId: u16;       // Which player
  input: InputEvent;   // Direction, action, etc.
  timestamp: u32;      // Client timestamp (for latency measurement)
}
```

**Max queue**: 60 frames (1 second at 60 Hz). Overflow = input loss (acceptable lag compensation).

---

## 5. LATENCY COMPENSATION

### Round-Trip Time (RTT) Measurement

**Ping mechanism**:
1. Client sends PING with client timestamp
2. Server echoes back immediately
3. Client computes RTT = now - timestamp
4. Exponential moving average: RTT = 0.9 * RTT + 0.1 * new_rtt

**Target**: <50ms RTT for good feel
- Skateboard/Surf (reaction-less) tolerates 100ms+
- Karate/Combat (twitch) needs <80ms

### Rollback & Resync

**Scenario**: Server says player was NOT at predicted position

**Client response**:
1. Roll back player mesh to server position
2. Resume from server state
3. Replay pending inputs to catch up visually
4. Smooth transition (Babylon.js Animatable lerp)

**Implementation**:
```typescript
// If divergence > threshold (e.g., > 0.5m):
const correction = new BABYLON.Animatable(
  scene,
  () => { updatePlayerMesh(serverPos, serverRot); },
  0,         // start
  200,       // duration (ms) — smooth correction
  false,     // loop
);
```

---

## 6. BABYLON.JS INTEGRATION

### Scene Architecture

**Per player spawned in scene**:
```typescript
interface NetworkActor {
  playerId: string;
  character: SpawnedCharacter;    // Mixamo rig (from CharacterLibrary)
  inputSource: NetworkInputSource; // Receives server input
  physics: BABYLON.PhysicsBody;    // Havok body (child of character)
  predictor: ClientPredictor;      // Local prediction between ticks
  corrector: ServerCorrector;      // Rollback on divergence
}
```

### Physics Authority

**Server side** (Node.js server, not Babylon):
- Havok.js physics engine runs on server
- Each actor has a physics body
- Collision detection + resolution server-side
- State synced to clients (positions only)

**Client side** (Babylon + Havok.js in browser):
- Local physics bodies mirror server state
- Predicted movement between server ticks
- Physics callbacks (e.g., footstep) remain local

### Animation Blending

**Server**: Sends animation frame index + current clip name
**Client**: 
```typescript
character.playAnim(clipName, false, () => {
  character.setAnimFrame(frameIdx); // Sync to server
});
```

**Correction**: If anim clip name differs, blend to new clip:
```typescript
currentClip.stop();
newClip.play(true, newFrame);
// Babylon.js Animatable handles smooth blend
```

---

## 7. MODE-SPECIFIC ADAPTATIONS

### Combat Modes (Karate VS, Karate Endless)

**Needs**:
- Low-latency input (sub-80ms)
- Accurate hit detection
- Critical: Server validates hit before applying damage

**Architecture**:
- WebSocket primary, WebRTC fallback
- Input → Server validation → Hit confirmed → Broadcast
- Client predicts animation only, NOT damage
- Damage applied only on server ACK

### Basketball Modes (3v3, 1v1)

**Needs**:
- Team coordination (pass/shoot)
- Physics accuracy (ball trajectory, collisions)
- Asynchronous joins (late joins mid-game)

**Architecture**:
- Server simulates ball physics (Havok)
- Player inputs drive character, not ball directly
- Ball possession/pass logic server-side
- Client predicts character animation, not ball

### Party Modes (Court Carnival, Who Scene It)

**Needs**:
- Turns are mostly independent
- Mini-game score aggregation
- Async timing OK (one player takes 3sec, another 5sec)

**Architecture**:
- Server orchestrates mini-game event sequence
- Each player's input/score sent independently
- No tight sync required
- Fallback: JSON-RPC polling (if WebSocket unavailable)

---

## 8. SESSION MANAGEMENT

### Lobby → Join → Play → Results

```
1. LOBBY
   - Player creates/joins room on server
   - Server assigns playerId (u16)
   - Client receives: roomId, playerId, opponent info

2. JOIN
   - Client connects WebSocket
   - Server acknowledges, sends initial state
   - Client syncs clock with server (time = server_time + client_offset)

3. PLAY
   - Server sends start signal
   - Both clients receive count-down + mode config
   - Mode boots, game loop begins

4. RESULTS
   - Mode calls ctx.end(verdict, score, details)
   - Client sends END_GAME message
   - Server confirms, stores result
   - Lobby shows winner/stats

5. DISCONNECT HANDLING
   - If client disconnects mid-game:
     - Server waits 10 seconds for reconnect
     - If reconnects: resume from server state + catch up
     - If timeout: end game, declare opponent winner
```

---

## 9. SECURITY & VALIDATION

### Server-Side Input Validation

**Every input frame checked**:
```typescript
function validateInput(input: InputFrame, actor: Actor): bool {
  // Sanity checks:
  // - playerId matches authenticated session
  // - Action is valid for current game mode
  // - Cooldown not violated (e.g., can't punch 2x in 50ms)
  // - Position not teleported (distance traveled < max speed * dt)
  // - Return true (valid) or false (rejected)
}
```

### Rate Limiting

**Per-client**: Max 120 input frames/sec (overrides capped at 60 Hz anyway)
**Per-game**: Max 10 concurrent matches per server instance

### Cheat Detection

**Server logs**:
- Inputs, positions, velocities per tick
- Replays stored for disputed matches
- Admin interface to review suspicious games

---

## 10. ERROR RECOVERY

### Network Outage

**Client side**:
- Input queue persists locally
- When connection re-established: send queued inputs
- Server re-simulates and syncs state

**Server side**:
- Client marked "offline" after 5 seconds
- State snapshot preserved
- On reconnect: merge diverged state

### Desync Detection

**Server**:
- Keeps previous 10 ticks in memory
- Client can request rollback to tick N
- Server resends state + correction frames

**Trigger**: 
- Position divergence > 1.0m
- Velocity divergence > 2.0 m/s
- Animation state mismatch

---

## 11. PERFORMANCE TARGETS

| Metric | Target | Acceptable | Critical |
|--------|--------|-----------|----------|
| RTT latency | <50ms | <100ms | >150ms ❌ |
| Server tick rate | 60 Hz | 30 Hz min | <30 Hz ❌ |
| Input-to-display | <150ms | <250ms | >300ms ❌ |
| Concurrent players | 1000s | 100s | <50 ❌ |
| Bandwidth/player | 10 KB/s | 25 KB/s | >50 KB/s ❌ |

---

## 12. IMPLEMENTATION ROADMAP (Phase 5)

### Week 1: Transport Layer
- [ ] Socket.io server + client integration
- [ ] Binary protocol encoding/decoding
- [ ] Connection handshake & keepalive

### Week 2: State Sync
- [ ] Server-side physics simulation (Havok.js)
- [ ] Tick-based input collection
- [ ] State broadcast to clients

### Week 3: Babylon.js Integration
- [ ] NetworkActor class + scene spawning
- [ ] Input → Animation binding
- [ ] Prediction + correction logic

### Week 4: Mode-Specific Wiring
- [ ] Karate 1v1 multiplayer (hit detection server-side)
- [ ] Basketball 3v3 (team spawning, ball sync)
- [ ] Court Carnival (async turn-based)

### Testing (Concurrent)
- [ ] Unit tests: Input validation
- [ ] Integration tests: Full round-trip
- [ ] Load tests: 100+ concurrent sessions
- [ ] Latency tests: 50/100/150ms simulated RTT

---

## 13. KNOWN LIMITATIONS & FUTURE WORK

### v1 Scope
- Server-relay only (no p2p in v1)
- Simple prediction model (linear extrapolation)
- Fixed 60 Hz server tick (no dynamic adjustment)
- Single server region (no geo-replication)

### v2+ Roadmap
- WebRTC p2p for 1v1 modes (latency reduction)
- Advanced prediction (Kalman filter)
- Adaptive tick rate (client network quality detection)
- Multi-region servers + latency-aware routing
- Spectator mode (read-only client)

---

## 14. DECISION LOG

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Authority | Server-authoritative inputs | Eliminates cheating; enables replays/rewind |
| Transport | WebSocket (Socket.io) | Proven, widely supported, fallback HTTP long-poll |
| Tick rate | 60 Hz server | Matches monitor refresh, industry standard |
| State sync | Minimal (pos, vel, rot, anim) | Fits in 32-byte payload; larger = bandwidth waste |
| Physics | Server-side (Havok.js) | Single source of truth; prevents collision exploits |
| Animation | Client-predicted, server-corrected | Smooth visuals; trust server for final state |
| Lobby | Room-based | Simpler than matchmaking; works for v1 |

---

## ARCHITECTURE COMPLETE ✅

This design is ready for Phase 5 implementation. All major decisions documented, trade-offs justified, and roadmap defined.

**Next**: Phase 5 — Implement this architecture end-to-end across shipped 3D modes.

