# Homebrew ROM Creator Platform — Architecture Specification

**Feature Scope**: Browser-based creation, emulation, and co-op multiplayer for original homebrew ROMs  
**Status**: Architecture Phase (No implementation code yet)  
**Date**: 2026-08-28  
**Sequencing**: Gated behind FEL v1 launch; does NOT block Gate 0 / core modes  

---

## 1. EXECUTIVE SUMMARY

A new top-level platform surface (alongside 18 FEL sport modes) where users can:
1. **Create** original homebrew games/ROMs using in-browser tools or import their own creations
2. **Play** ROMs in-browser via WASM emulator core
3. **Share** ROMs with multiplayer co-op sessions via shareable links
4. **Earn** "Games Created" credentials on their Creator Card

**Core Constraint**: Original creations ONLY — no commercial ROM ingestion at any point in the pipeline.

**Multiplayer Scope v1**: Co-operative (shared session state, ~100ms sync tolerance). Competitive rollback netcode deferred to Phase 2.

---

## 2. ARCHITECTURE LAYERS

```
┌─────────────────────────────────────────────────────────────┐
│  Browser UI Layer                                           │
│  ├─ Creator Workspace (ROM editor / uploader)              │
│  ├─ Emulator Player (WASM core + UI overlay)              │
│  ├─ ROM Library (browse, search, trending)                │
│  └─ Creator Card Integration (display "Games Created")     │
├─────────────────────────────────────────────────────────────┤
│  Emulation Layer (WASM)                                     │
│  ├─ EmulatorJS / libretro WASM core                        │
│  ├─ Input mapping (gamepad → emulator)                     │
│  └─ Frame output (canvas → display)                        │
├─────────────────────────────────────────────────────────────┤
│  Networking Layer                                           │
│  ├─ WebSocket server (co-op session sync)                 │
│  ├─ State sync protocol (input sharing + state reconcile)  │
│  └─ Room/lobby management (join codes, invite links)      │
├─────────────────────────────────────────────────────────────┤
│  Data Layer                                                 │
│  ├─ ROM storage (S3 / Firebase Storage for user uploads)  │
│  ├─ Metadata DB (ROM info, creator ID, tags, stats)       │
│  ├─ Creator Card DB (new "Games Created" credential)       │
│  └─ Session logs (co-op playthrough records)              │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. EMULATOR CORE CHOICE

### Evaluated Options

| Option | Pros | Cons | Recommendation |
|--------|------|------|-----------------|
| **EmulatorJS** | Pre-built, many formats, WASM-compiled, liberal license | Limited customization, maintenance status? | ✅ **RECOMMENDED** for v1 |
| **libretro WASM** | Battle-tested, modular cores, active community | Higher complexity, larger WASM bundle | Later phase (v1.5) |
| **Custom WASM** | Full control, minimal bundle size | 6-12 month dev cycle, requires deep emulation knowledge | ❌ Not viable |

### Selection: **EmulatorJS**

**Why**:
- Zero to playable in ~2 weeks (vs 6+ months for custom)
- Supports NES, SNES, GBA, Genesis — standard for homebrew dev
- Pre-compiled WASM cores available
- Legal: Open-source (MIT/GPL-compatible), no bundled commercial ROMs
- Bundle size: ~15-30MB (acceptable for browser)

**Integration Point**:
```
emulator.js → loads user-uploaded ROM (validated as homebrew) 
           → renders to canvas element
           → gamepad input captured
           → frame output synced to WebSocket for co-op
```

**Homebrew Validation Gate**:
Before a ROM is playable:
1. File magic number checked (NES: 0x4E 0x45 0x53, GBA: 0x24 0xFD, etc.)
2. Size within expected range for homebrew (NES <512KB, GBA <32MB typical)
3. User attestation: "This ROM is my original creation or legally authorized"
4. Optional: human review queue (flagged by community) for disputes

---

## 4. DATA MODEL

### 4.1 ROM Metadata

```typescript
interface ROMMetadata {
  id: string;                          // UUID
  title: string;                       // "Zelda: The Lost Dungeon"
  creatorId: string;                   // User ID (from FEL auth)
  creatorName: string;                 // Display name
  platform: "nes" | "snes" | "gba" | "genesis" | "gameboy";
  genre: string[];                     // ["Action", "Adventure"]
  description: string;                 // Markdown
  tags: string[];                      // ["puzzle", "retro", "shortgame"]
  fileHash: string;                    // SHA256 of ROM file (dedup)
  fileSize: number;                    // bytes
  storagePath: string;                 // "s3://roms/{creatorId}/{id}.nes"
  createdAt: Date;
  updatedAt: Date;
  isPublished: boolean;
  downloads: number;
  plays: number;
  coopPlays: number;                   // Multiplayer sessions
  avgRating: number;                   // 1-5 stars
  creatorAttestation: {                // Legal: original work
    attestedAt: Date;
    text: string;
    ipAddress: string;                 // logged for dispute resolution
  };
  visibility: "private" | "friends" | "public";
}
```

### 4.2 Creator Card Credential

```typescript
interface GameCreatedCredential {
  credentialType: "game_created";
  platform: string;                    // NES, GBA, etc.
  romId: string;
  romTitle: string;
  createdDate: Date;
  description: string;
  stats: {
    totalPlays: number;
    totalCoopSessions: number;
    avgPlayDuration: number;           // seconds
    communityRating: number;            // 1-5
  };
}

// Extends existing Creator Card data model:
interface CreatorCardUpdates {
  gamesCreated: GameCreatedCredential[];  // New credential block
  // (existing: prqCompletions, movementSignature, educationalCreds, etc.)
}
```

### 4.3 Co-op Session State

```typescript
interface ROMSession {
  id: string;                           // Room ID
  romId: string;
  creatorId: string;                    // ROM creator
  hostPlayerId: string;
  players: {
    [playerId: string]: {
      name: string;
      isConnected: boolean;
      inputState: GamepadState;         // Latest gamepad input
      joinedAt: Date;
    };
  };
  emulatorState: {
    currentFrame: number;               // Synchronized frame counter
    lastSyncTime: number;               // ms since last full sync
    inputLog: {                          // For replay / dispute resolution
      frame: number;
      playerId: string;
      input: GamepadState;
    }[];
  };
  sharedLink: string;                   // "fel.games/coop/abc123def"
  inviteCode: string;                   // "ABC123" (6-char human-readable)
  createdAt: Date;
  expiresAt: Date;                      // 24 hours default
  status: "waiting" | "active" | "completed";
}
```

---

## 5. NETWORKING PROTOCOL (Co-op v1)

### 5.1 Architecture: Client-Predicted, Server-Authoritative

```
Host (Player A)                Server                Guest (Player B)
     |                           |                          |
     |--- ROM load request ----→ |                          |
     |                           |--- ROM validated ----→   |
     |                           | ← Sync ack              |
     |                           |                          |
     |--- input @ frame 100 ---→ | ← Store input           |
     |                           |--- broadcast ---→ replay |
     |                           |                          |
     | ← input @ frame 100 --- │ (other player)           |
     |                           |                          |
     | [both advance to frame 101 independently]           |
     |                           |                          |
     | --- state @ frame 200 → | (every Nth frame)        |
     | ← state reconcile       │ (detect drift)           |
     |                           |                          |
```

### 5.2 Sync Protocol

**Frame-Level Sync**:
- Each player sends their gamepad input as it occurs
- Server timestamps, validates, broadcasts to other players
- Each client can predict own frame ahead; server validates once per second

**Heartbeat** (every 1 second):
- Each player sends their current emulator frame counter + input log hash
- Server compares hashes across players; if >2% drift, triggers state reconciliation

**State Reconciliation** (when drift detected):
- Server sends "canonical frame state" (CPU/RAM snapshot from one trusted player)
- Other players fast-forward or rewind to match (Lua save state format)
- Continue from canonical state

**Latency Tolerance**: ~100-300ms acceptable for turn-based / puzzle games. Not suitable for frame-perfect platformers in v1.

### 5.3 WebSocket Messages

```typescript
// Client → Server
type ClientMessage = 
  | { type: "join_session"; sessionId: string; playerId: string }
  | { type: "input"; frame: number; gamepadState: GamepadState }
  | { type: "sync_request"; currentFrame: number; stateHash: string }
  | { type: "leave_session" };

// Server → Client
type ServerMessage =
  | { type: "session_joined"; players: Player[] }
  | { type: "remote_input"; playerId: string; frame: number; input: GamepadState }
  | { type: "sync_required"; canonicalFrame: number; saveState: string }
  | { type: "session_ended"; reason: string };
```

### 5.4 Fallback (Single-Player)

If WebSocket drops / co-op unavailable:
1. Session pauses
2. Player prompted: "Resume solo" or "Wait for reconnect"
3. If resumed solo, co-op stats not counted (flags session as single-player fallback)

---

## 6. CREATOR CARD INTEGRATION

### 6.1 Data Flow

```
User uploads ROM
   ↓
[Homebrew validation]
   ↓
ROM published (creatorId = User ID)
   ↓
Creator Card DB: INSERT GameCreatedCredential
   ↓
Creator Card UI: "Games Created" credential block visible
   ↓
Real-time stats: plays, co-op sessions, avg rating updated daily
```

### 6.2 Credential Display (on Creator Card)

```
┌─────────────────────────────────────┐
│ GAMES CREATED (5 total)             │
├─────────────────────────────────────┤
│ 🎮 Zelda: The Lost Dungeon          │
│    Platform: NES | 342 plays        │
│    Co-op Sessions: 18               │
│    Community Rating: 4.2/5.0        │
│    Created: 2026-08-15              │
│                                     │
│ 🎮 Pong Plus (GBA Demake)           │
│    Platform: GBA | 156 plays        │
│    Co-op Sessions: 32               │
│    Community Rating: 4.6/5.0        │
│    Created: 2026-07-22              │
│ ... (3 more)                        │
└─────────────────────────────────────┘
```

### 6.3 Credential Fields

Per-ROM:
- **Platform**: NES, SNES, GBA, Genesis, etc.
- **Play Stats**: Total plays, avg session duration, player count distribution
- **Co-op Activity**: # of multiplayer sessions, avg players per session
- **Community Feedback**: Average rating, top review excerpts
- **Peer Recognition**: Featured badge (if trending or highly rated)

---

## 7. STORAGE & INFRASTRUCTURE

### 7.1 ROM File Storage

**Option A: Firebase Storage (Recommended for v1)**
```
gs://fel-roms-{env}/
├── {creatorId}/
│   ├── {romId}.nes
│   ├── {romId}.gba
│   └── metadata.json
```
- Pros: Integrated with existing FEL Firebase, easy access control, CDN built-in
- Cons: Potential cost at scale (pay per download)
- Mitigation: Implement file expiry (delete unpublished/stale ROMs after 30 days)

**Option B: S3 (if scaling beyond Firebase limits later)**
- Consistent API, CloudFront CDN, cheaper per GB
- Deferred to Phase 2

### 7.2 Metadata Storage

**Database**: Extend existing Firestore/PostgreSQL
```
Collection: romMetadata
  Document: {romId}
    - creatorId, title, platform, tags, fileHash, createdAt, etc.

Collection: creatorCards (or extend existing)
  Document: {userId}
    - gamesCreated: [{romId, platform, stats, ...}, ...]
```

### 7.3 Session Logs & Analytics

**Firestore**: Record every co-op session
```
Collection: sessionLogs
  Document: {sessionId}
    - romId, players, duration, inputLog (full for replay), result, createdAt
```
- Retention: 90 days (for replay / dispute resolution)
- Purge after 90 days (unless flagged for review)

---

## 8. BROWSER / DEPLOYMENT CONSIDERATIONS

### 8.1 Client-Side Bundle

| Component | Size | Notes |
|-----------|------|-------|
| EmulatorJS core | ~15-20MB | Cached after first load |
| React/TS UI | ~2-3MB | Existing FEL stack |
| WebSocket client | ~50KB | Part of existing networking |
| **Total** | ~20-25MB | Reasonable for modern browser |

**Deployment**:
- Bundle split: lazy-load emulator only when user navigates to ROM/player
- Use service worker for offline ROM cache (optional, Phase 2)

### 8.2 Backend Requirements

**New Endpoints**:
```
POST   /api/roms/upload             (multipart: ROM file + metadata)
GET    /api/roms/{romId}            (fetch ROM metadata)
GET    /api/roms?creator={id}       (list user's ROMs)
GET    /api/roms?trending           (trending ROMs)
POST   /api/sessions/create         (host a co-op session)
POST   /api/sessions/{id}/join      (join via invite code)
GET    /api/creator/{userId}/card   (fetch Creator Card data)
```

**WebSocket**:
- Extend existing FEL multiplayer server (Phase 5 architecture)
- Namespace: `/socket.io/?type=rom`

---

## 9. FEATURE SURFACE

### 9.1 Top-Level Navigation

Extend FEL app header/nav:
```
FEL App
├─ Sport Modes (18 modes)
├─ Homebrew Creator (NEW)
│  ├─ My ROMs (list + upload)
│  ├─ Browse Library (search, trending, by creator)
│  ├─ Play ROM (emulator + co-op)
│  └─ Creator Card (my credentials)
└─ Account / Settings
```

### 9.2 Creator Workspace (Upload / Edit)

```
┌────────────────────────────────────┐
│ Upload New ROM                     │
├────────────────────────────────────┤
│ File: [Choose ROM] .nes           │
│ Title: [My Game Title]            │
│ Platform: [NES v]                 │
│ Genre: [Action] [Adventure]       │
│ Description: [Markdown editor]    │
│ Tags: [#homebrew] [#puzzle]       │
│ Visibility: [Public v]            │
│                                   │
│ Attestation:                      │
│ ☑ This ROM is my original work    │
│   or I have legal rights to       │
│   distribute it.                  │
│                                   │
│ [Upload]  [Cancel]               │
└────────────────────────────────────┘
```

### 9.3 ROM Player

```
┌─────────────────────────────────────────┐
│ Zelda: The Lost Dungeon (NES)           │
├─────────────────────────────────────────┤
│                                         │
│  [Emulator canvas - 512x480]           │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │ Created by: player_123           │  │
│  │ Rating: ⭐⭐⭐⭐ (4.2/5)          │  │
│  │ Plays: 342 | Co-op: 18           │  │
│  ├──────────────────────────────────┤  │
│  │ [Play Solo] [Play Co-op (inv)]   │  │
│  │ [Join Co-op] [Share] [Save]      │  │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### 9.4 Co-op Lobby

```
┌──────────────────────────────────────┐
│ Co-op Session: Zelda DL              │
├──────────────────────────────────────┤
│ Session Code: ABC123                 │
│ Share Link: fel.games/coop/abc123    │
├──────────────────────────────────────┤
│ Players (1/4):                       │
│  ✓ You (host)                        │
│  ⊙ Waiting for 1+ guests...         │
├──────────────────────────────────────┤
│ Invite Friends:                      │
│ [Copy Link]  [Email]  [Discord]     │
├──────────────────────────────────────┤
│ [Start Game]  [Cancel]              │
└──────────────────────────────────────┘
```

---

## 10. TECHNICAL RISKS & MITIGATIONS

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Homebrew validation bypassed** (user uploads commercial ROM) | Legal liability | 1. File magic + size checks 2. Attestation + IP logging 3. Community flag → human review |
| **Co-op sync drift** (players desync after 5 min) | Broken gameplay | 1. Frame-level input sync 2. Heartbeat + state reconciliation 3. Fallback to single-player if unrecoverable |
| **Storage cost explosion** (10k users × 10 ROMs × 5MB avg) | Operational burden | 1. Implement file cleanup (30-day expiry for unpublished) 2. Compress ROMs (ZIP storage) 3. Set upload limits (100MB per user initially) |
| **Latency spikes** (WebSocket timeouts) | Session failures | 1. Exponential backoff on reconnect 2. Graceful fallback to single-player 3. Server-side session resume (30-min grace window) |
| **Emulator security** (ROM exploit vector) | Browser sandbox escape | 1. Run emulator in Web Worker (isolated context) 2. Limit file system access 3. Regular EmulatorJS security audits |
| **Creator Card credential inflation** (spam ROMs to boost card) | Reputation system damage | 1. Minimum stats gate (must have ≥1 play to show in credential) 2. Community rating threshold (≥2.5/5 for trending) 3. Flag low-engagement ROMs as "experimental" |
| **Competitive netcode pressure** (users demand rollback, not co-op) | Scope creep | 1. Lock v1 as co-op only in requirements 2. Feature-flag rollback netcode as v2 roadmap 3. Emphasize turn-based / puzzle positioning in UX |

---

## 11. SEQUENCING & GATING

### 11.1 Relationship to FEL Core

```
FEL v1 Launch (Gate 0 + Phases 5-10)
   ↓
FEL v1 Stable + Nexus Extraction (post-v1)
   ↓
Homebrew ROM Creator Platform (THIS FEATURE)
   ├─ Does NOT block FEL v1 launch
   ├─ Shares: FEL auth, Firebase, WebSocket multiplayer server
   ├─ Separate: ROM storage, emulator core, session logic
   ↓
Phase 5: Extend Multiplayer to FEL Modes (14 modes)
   ↓
Phase 6-10: Polish / QA / Sign-off
```

### 11.2 Implementation Phases (Future)

**Phase A (v1.0)**: Architecture + browser emulator + ROM upload + co-op
- Duration: 6-8 weeks
- Deliverable: Playable ROMs, shareable links, Creator Card integration

**Phase B (v1.5)**: Analytics + community features
- Leaderboards, featured ROMs, community reviews
- Duration: 4 weeks

**Phase C (v2.0)**: Competitive rollback netcode (separate from v1)
- GGPO-style networking
- Duration: 12-16 weeks
- Flagged as separate project from v1

---

## 12. DEPENDENCIES & TECH STACK

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Emulator** | EmulatorJS (WASM) | Battle-tested, supports NES/SNES/GBA, no commercial ROMs bundled |
| **Backend** | Extend FEL Node.js + Socket.io | Reuse existing multiplayer server |
| **Storage** | Firebase Storage (ROMs) + Firestore (metadata) | Integrated, CDN, access control |
| **Frontend** | Existing FEL Next.js/React/TS | No new framework dependencies |
| **Networking** | WebSocket (co-op sync) | Client-predicted, server-auth reconciliation |
| **Auth** | Extend FEL NextAuth.js | Reuse existing user/session model |

---

## 13. LEGAL & COMPLIANCE

### 13.1 Homebrew-Only Policy

**Enforcement**:
1. **File Validation**: Magic number checks (NES header, GBA header, etc.)
2. **Size Limits**: Homebrew rarely exceeds platform maximums
   - NES: typically <512KB (vs 1MB max cartridge)
   - GBA: typically <16MB (vs 32MB max)
   - Flag oversized as potential copyrighted ROM
3. **User Attestation**: Signed statement that ROM is original or legally authorized
4. **IP Logging**: Store attestation + IP for dispute/DMCA resolution
5. **Community Flags**: Users can report suspected commercial ROMs → review queue

### 13.2 DMCA Safe Harbor

**Compliance**:
- Notice & Takedown process: User reports suspected infringing ROM
- FEL removes ROM within 24 hours
- Attestor notified (opportunity to appeal with proof of original creation)
- Repeat offenders (≥3 takedowns) lose upload privileges

### 13.3 Terms of Service Addendum

```
Homebrew ROM Creator Platform Terms:

1. You may only upload ROMs that you created or have legal rights to distribute.
2. Do NOT upload commercial ROMs, ROM hacks of commercial ROMs, or copyrighted content.
3. FEL reserves the right to remove any ROM suspected of copyright infringement.
4. Repeated violations result in account suspension.
5. You retain copyright to your original work; FEL licenses it for hosting/sharing.
```

---

## 14. OPEN QUESTIONS FOR CONFIRMATION

Before implementation, confirm:

1. **Emulator Choice**: Proceed with EmulatorJS, or evaluate libretro WASM first?
2. **Platform Support**: Launch with NES/SNES/GBA, or expand to Atari/Genesis/GB?
3. **Creator Card Placement**: New credential block, or integrate into existing PRQ/Movement sections?
4. **Co-op Player Limit**: 2-4 players max, or scale higher?
5. **File Upload Limit**: 100MB per user, or higher initially?
6. **Attestation Review**: Automated only (magic + size checks), or manual review queue?
7. **Revenue Model**: Completely free, or Patreon/cosmetics to cover storage costs later?
8. **Timeline**: Begin Phase A in Q4 2026, or earlier?

---

## 15. SUCCESS CRITERIA (for Phase A)

By end of Phase A (v1.0):
- ✅ 50+ published user-created ROMs
- ✅ 100+ co-op sessions played
- ✅ Zero false positives on homebrew validation (no commercial ROMs shipped)
- ✅ Creator Card integration live and populated
- ✅ <500ms sync latency for co-op sessions
- ✅ Zero DMCA complaints (or <2 false positives requiring appeal)

---

## CONCLUSION

The Homebrew ROM Creator Platform is **architecturally sound** and **does not block FEL v1 launch**. Key decisions:

- **Emulator**: EmulatorJS (WASM) — proven, fast to integrate
- **Networking**: Client-predicted, server-auth reconciliation — adequate for co-op v1
- **Storage**: Firebase + Firestore — integrated, scalable
- **Creator Card**: New credential block with live stats
- **Legal**: Mandatory attestation + file validation + community flags + DMCA process

**Proceeding to implementation requires confirmation on open questions (§14) only.**

---

**Prepared by**: Copilot  
**Date**: 2026-08-28  
**Status**: Ready for stakeholder review and confirmation

