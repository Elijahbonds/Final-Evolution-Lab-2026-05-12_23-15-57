# Original 3D Open-World Creature-Taming Game — FEL Feature Spec & Architecture

**Date**: 2026-08-27  
**Status**: Pre-Implementation Architecture  
**Scope**: NEW game mode for FEL; does not block FEL v1 ship  
**IP Constraint**: 100% original bestiary, world, and lore (no franchise references)

---

## PART 1: CREATIVE DIRECTION

### A. World & Lore Foundation

**Title**: *Etheria: The Symbiote Wilds*

**Setting**: A bioluminescent archipelago where sentient life-forms ("Symbionts") evolve through adaptive mutation in response to environmental pressure. Unlike traditional creature-taming franchises, Symbionts are not trainer property—they're intelligent beings with their own territorial drives, social hierarchies, and evolution paths independent of capture. The player's role is a **Field Naturalist** who negotiates coexistence and forms temporary pacts (not ownership) with Symbionts.

**Lore Hooks** (for FEL integration):
- Symbionts were seeded by an ancient bio-engineering civilization; the player discovers their pattern-matching nature mirrors the Neuro-Mechanic Mirror's principles
- The archipelago's ecosystem mirrors FEL's multimodal training philosophy: creatures adapt through movement repetition, risk-assessment, and learning cascades
- Brain Brawl logic puzzles are reframed as "Symbiont Dialect Challenges"—communication with creatures happens through pattern recognition, not combat

**Visual Tone**:
- *Reference for feel, NOT content*: Pokémon Sword/Shield's Galar region (open-zone pacing, seamless biome transitions), but with a biomechanical aesthetic: creature designs should reflect adaptations (limb morphologies driven by movement needs, sensory appendages for specific terrain), not cute/collectible appeal.
- Color palette: Bioluminescent teals, purples, and silvers against weathered stone and moss-covered ruins
- Creature silhouettes: Asymmetrical, alien (not mammalian-cute), with clear functional design (claws for climbing, fins for water, jet-like propulsion for gliding)

---

### B. Original Symbiont Roster (Tier 1: Starter Ecosystem)

**Design Philosophy**: Each Symbiont has a clear mechanical identity tied to a movement archetype (FEL's slide-jump, wall-kick, vault system maps to creature evolution).

**Tier 1 Starters** (3 core phylae):

#### Phylae 1: **Leapers** (Pursuit line)
- **Juvenile**: *Springcoil* — compact quadruped, rapid sprint jumps, ambush predator
  - Design: Coiled springs for legs, sensory frills along spine, iridescent carapace
  - Signature move: "Cascade Bound" (multi-hit leap chain)
  - Weakness: Low endurance; requires rest between sprints
  - Evolution condition: Achieve 50 successful chases; player must execute 5+ consecutive jump-based parkour moves without rest

- **Evolved**: *Velocitaur* — bipedal sprinter, wall-climbing capacity, herd coordinated
  - Design: Lean frame, clawed feet for grip, pack-hunting markings
  - Signature move: "Pack Surge" (summons 2 AI allies for coordinated charge)
  - Weakness: Fragile at range; vulnerable to traps
  
#### Phylae 2: **Tanks** (Guardian line)
- **Juvenile**: *Bedrock* — armored hexapod, slow tanky movement, territorial defense
  - Design: Layered crystalline armor, stubby legs, sensory pit organs
  - Signature move: "Anchored Stance" (creates barrier, immune to knockback for 10s)
  - Weakness: Immobile when defending; slow in open terrain
  - Evolution condition: Block 100+ incoming attacks; defend an ally 20+ times

- **Evolved**: *Fortessa* — massive quadruped fortress, aura-based field control
  - Design: Towering crystalline formation, bioluminescent circulatory patterns
  - Signature move: "Resonant Field" (creates damaging aura, pushes enemies back)
  - Weakness: Cannot move while aura is active

#### Phylae 3: **Gliders** (Utility line)
- **Juvenile**: *Veilwing* — insectoid flyer, scouting role, elemental affinity
  - Design: Translucent wings, hovering posture, trailing particle effects
  - Signature move: "Biolume Trail" (illuminates hidden resources, brief stealth)
  - Weakness: Low HP; grounded in heavy weather
  - Evolution condition: Discover 50+ resource nodes; reveal 10+ hidden areas

- **Evolved**: *Aether Sentinel* — crystalline flyer, persistent world markers, long-range sensing
  - Design: Geometric wings, crown-like sensory array, glowing core
  - Signature move: "Constellation Map" (marks wild creature spawns for 1 hour)
  - Weakness: Attracts aggro creatures; can't hide

**Tier 2 Ecosystem** (6-8 wild-exclusive creatures, encountered in endgame zones):
- *Coreshard* (mineral symbiont, mineral-deposit guardian)
- *Mistweaver* (gas-phase entity, weather-related hazards)
- *Depthsinger* (aquatic apex, sonar-based communication)
- *Erosion* (entropy symbiont, time-decay mechanic, final-raid guardian)
- *Luminarch* (legendary rare encounter, sanctuary guardian)
- *Void Scout* (post-game hunter, PvP threat)

**Total Target Roster**: 12-15 creatures (3 starters + 3 evolved + 6-9 wild/legendary)

---

## PART 2: CAPTURE & PACT MECHANICS

### A. Real-Time Capture System

**Core Mechanic**: "Symbiont Resonance"

Unlike traditional capture devices, the player uses **harmonic negotiation**:
1. **Approach & Stalk**: Player must move unseen through terrain (use rocks, water, vegetation cover)
2. **Signal Sync**: When close, player inputs a timed rhythm-pattern matching the creature's own bioluminescent pulse (10-second sequence, 3-5 button presses in tempo)
3. **Pact Pledge**: Success opens dialogue where creature assesses player; outcomes vary by player's prior actions:
   - **Peaceful relation** (previous creature of same phylae allied): +30% success rate
   - **Territorial conflict** (player damaged this creature's allies): -40% success rate, creature may flee or attack
   - **Unknown stranger** (first encounter): baseline 50% success
4. **Mutual Commitment**: On success, creature joins player's **Symbiont Circle** (not "party"—mechanics distinct; creatures have agency)

**Failure States**:
- Creature attacks (real-time evasion required; use FEL's vault/slide mechanics)
- Creature flees (can re-attempt by re-stalking)
- Player's resonance pattern breaks (return to stalk phase)

**Resonance Pattern UX**:
```
Creature pulses in specific rhythm (visual + audio cues):
  ▁▂▃▄▅ [pause] ▄▅▄▃▂ [pause] ▁▂▃

Player inputs on rhythm points using gamepad (Y button for high beat, X for low):
  If player hits 5/5 rhythm points → Success check
  If player misses >1 point → Resonance broken, restart stalk
```

---

### B. Symbiont Circle Mechanics (Team/Party)

**Pact System** (replacing traditional "party"):
- Max 3 active Symbionts in player's circle at once
- Creatures have **Loyalty** meter (0-100):
  - Increases when player wins battles, uses creature in exploration, feeds it rare items
  - Decreases when player neglects creature or forces it into unfair fights
  - Below 30% loyalty: Symbiont may leave circle voluntarily or refuse commands
- **Symbiont Agency**: If player orders a creature into combat where it's at type disadvantage AND loyalty <50%, creature has a 30% chance to disobey and exit combat

**Rotation Mechanic**:
- Benched Symbionts gradually restore HP/stamina
- At rest zones (sanctuaries), player can switch active circle freely
- In-field switches cost 3 seconds (real-time, not turn-based), making swap strategy important

---

## PART 3: WORLD & EXPLORATION

### A. Open-World Structure

**Map Zones** (5-6 interconnected biomes):

| Zone | Phylae Emphasis | Hazards | Progression Gate |
|------|-----------------|---------|------------------|
| **Luminous Strand** (entry zone) | Gliders | Weather (rain reduces visibility) | Capture 1 starter |
| **Cascading Cliffs** | Leapers | Falling platforms, wind gusts | Achieve loyalty 50+ with starter |
| **Earthwork Catacombs** | Tanks | Collapsed sections, tremors | Solve 5 "Dialect Challenges" |
| **Biolume Abyss** | Mixed (high difficulty) | Pressure zones, biolume corruption | Defeat regional raid boss |
| **Void Reaches** (endgame) | Rare/legendary | Entropy creatures, time-decay hazards | Full circle + all skills maxed |
| **The Hollow** (post-game) | Luminarch (legendary) | Permadeath/hardcore modifiers | 80+ hrs gameplay |

**Seamless Traversal** (uses FEL's movement vocabulary):
- Wall-kicks to climb vertical cliff faces
- Slide-jumps to cross chasms
- Vault over barriers into creature territory
- Mount Symbionts for fast traversal (specific creatures offer ride-mode)

**Interactive Hazards** (encourages emergent gameplay):
- Collapsing bridges → use Tank creature's weight-anchoring to stabilize
- Electrified water zones → use insulating creature types, or vault overhead
- Obscuring fog → summon Glider's biolume trail to reveal paths
- Territorial creature nests → avoid, stealth through, or negotiate pact first

---

### B. Discovery & Progression

**Resource Types** (all non-combat, used for growth):
1. **Essence Shards** — Dropped by wild Symbionts when defeated/negotiated with; feed to allied creatures to boost stats
2. **Knowledge Patterns** — Found in ancient ruins; unlock new dialogue options, creature lore, evolution paths
3. **Resonance Tuners** — Rare items that increase capture success rate for specific phylae
4. **Sanctuary Stones** — Place in hub areas to create rest zones where Symbionts heal

**Progression Milestones** (mimics trainer-challenge structure without franchise mimicry):
- **Sanctuary Seal 1-5**: Negotiate with 5 Symbiont species across all zones (milestone: unlock new starting phylae option in New Game+)
- **Evolutionary Ascension**: Trigger evolution on all 3 starter Symbionts
- **Apex Challenge**: Raid encounter with Luminarch (legendary); requires full circle + maxed skills
- **Symbiont Census**: Encounter all 12-15 Symbionts (allows post-game side quests, cosmetics)

---

## PART 4: MULTIPLAYER ARCHITECTURE

### A. Persistent World vs. Instanced Raids

**DECISION POINT**: Two feasible approaches; flagged for stakeholder decision.

#### **OPTION A: Persistent Shared Zones** (higher scope, more server load)

**Model**: Single shared world instance per region; multiple players in same map simultaneously

**Features**:
- Players see each other as avatars; can trade Symbionts/items in-field
- High-level wild creatures spawn as **Raid Bosses** requiring 2-4 players to defeat
- PvP zones (opt-in, flagged): player vs player Symbiont duels for rare drops
- Emergent cooperation: players help each other stalk creatures, share discovered sanctuaries

**Server Architecture**:
```
Player A joins Luminous Strand → connected to shard 1
Player B joins Luminous Strand → connected to shard 1
Both see each other; can trade or team up for raid

Server maintains:
  - Creature spawn state (shared)
  - Player positions (replicated)
  - Raid HP pool (shared; both players' damage counts)
  - Loot distribution (both get drops if contributing >20% damage)
```

**Netcode**: Server-authoritative; client predicts movement, server validates attacks/trades. Raids use frame-level sync (shared emulator-style state, every 1 second reconcile). Latency tolerance: ~200ms (acceptable for turn-based tactics).

**Cost**: ~$500-1500/month for persistent world servers (100 concurrent players); scales with player count.

#### **OPTION B: Instanced Co-op Raids** (lower scope, lower server cost)

**Model**: Player enters raid solo or with invited friends; creates temporary 1-4 player instance

**Features**:
- Raids are matchmade or friend-invite only
- Trading happens in sanctuary hubs (social zones, single shared instance per hub)
- No persistent PvP; optional guild vs guild raid competitions (leaderboard-based)
- Simpler netcode: pseudo-real-time co-op (similar to ROM Creator Platform co-op model)

**Server Architecture**:
```
Player A + Player B queue for Raid: Erosion Guardian
  → Server spawns temporary raid instance
  → Creatures, hazards, loot are local to this instance
  → After 20-30 min raid, instance destroyed; loot distributed
  → Both return to persistent hub for trading

Trading happens in shared hub:
  Player A offers: Springcoil (evolved)
  Player B offers: Resonance Tuner
  Validated on server; both receive items
```

**Netcode**: Instanced raids use client-predicted input sync (frame sequencing) similar to ROM co-op. Hubs use simple HTTP APIs for trading (no real-time sync needed). Latency tolerance: ~300ms.

**Cost**: ~$200-500/month (trading servers minimal; raid servers spin up on-demand).

---

### B. Trade System (Both Models)

**In-Field Trading** (Option A) or **Hub Trading** (Option B):

**Mechanics**:
1. Player A initiates trade with Player B
2. Both players place items in escrow (cannot retract once confirmed)
3. Symbiont loyalty of traded creatures does NOT reset (maintains AI-personality context)
4. Trade completes; both players notified

**Restrictions** (prevent farming):
- Cannot trade same player more than 3x per day
- Cannot trade starter-phylae Symbionts with <50 loyalty (forces player investment)
- Cannot trade legendary creatures (bind-on-capture)

**Leaderboard** (Option A or B):
- Trades completed, Symbionts evolved, raid boss defeats, collection %, playtime
- Monthly reset; rewards cosmetics (skins, particle trails, sanctuary decorations)

---

## PART 5: TECHNICAL ARCHITECTURE

### A. Client-Side Stack (Reuses FEL Infrastructure)

**Engine**: Babylon.js + Havok (existing FEL stack)

**Asset Requirements**:
- Creature models: 12-15 unique rigs (6 unique skeletons for 3 starters × 2 evolutions; simplified rigging compared to humanoid athletes—4-8 bones per limb vs. 3-4 for human arms)
- Animation library: 40-50 animations per creature (idle, walk, run, jump, attack, capture-response, rest, evolution)
- World geometry: 5-6 zone meshes (scaled 3-4x larger than sport mode arenas)
- Texture atlases: Bioluminescent materials (unique to this mode; uses custom shader for glow/pulse)

**Performance Target**: 60 FPS on PS5/high-end PC; 30 FPS on mid-range mobile

**Memory Budget**: ~2GB (creatures + environment streaming as player moves between zones)

---

### B. Server-Side Stack

**Option A (Persistent World)**:

```
Game Server (Node.js + WebSocket)
  ├─ Zone State Manager
  │   ├─ Creature spawn/despawn state
  │   ├─ Resource node availability
  │   └─ Hazard timers (rain duration, tremor cycles)
  ├─ Player State Manager
  │   ├─ Position replication
  │   ├─ Symbiont circle status
  │   └─ Loyalty metrics
  ├─ Raid Orchestrator
  │   ├─ Boss HP pool
  │   ├─ Phase transitions
  │   └─ Loot drops
  └─ Trade Validator
      └─ Escrow management

Database (Firestore)
  ├─ Player profiles (level, XP, unlocks)
  ├─ Symbiont records (stats, evolution stage, loyalty)
  ├─ Zone state snapshots (hourly)
  └─ Trade history (30-day retention for dispute resolution)
```

**Option B (Instanced Raids)**:

```
Hub Server (simple HTTP API)
  ├─ Trading endpoint
  ├─ Matchmaking for raids
  └─ Leaderboard aggregation

Raid Servers (ephemeral, spawn on-demand)
  ├─ Raid instance state (creatures, hazards, loot)
  └─ Cleanup after session ends (30-60s grace period for disconnect)
```

---

### C. Netcode Decision

**For Option A (Persistent World)**:
- Server-authoritative; client sends inputs (movement, commands)
- Server validates creature attacks, capture attempts, trades
- Client predicts player movement; server corrects every 500ms
- Raid bosses synchronized via shared HP pool + phase state (state sent every 1 second)

**For Option B (Instanced Raids)**:
- Client-predicted input sequencing (same as ROM co-op model)
- Frame-level sync every 1 second during raid
- No real-time verification needed for exploration (single-player feels)
- Trading validated post-session

---

## PART 6: INTEGRATION WITH FEL CORE

### A. Reuse of Existing Systems

**FEL Sport Modes** → Creature-Taming Game:
1. **Movement mechanics** (slide-jump, wall-kick, vault) carry directly into exploration/evasion
2. **Havok physics** (gravity, collision) used for creature pathfinding
3. **Babylon.js 3D rendering** (lighting, materials, skeletal animation) applied to creatures

**Brain Brawl Integration**:
- "Symbiont Dialect Challenges" replace traditional Brain Brawl duels
- Creatures have personality-based trivia (solving phylae-specific logic puzzles improves capture success)
- XP from Brain Brawl feeds into creature growth XP (10% cross-mode bonus)

**Creator Card Integration**:
- New credential block: "Symbiont Naturalist" — tracks collection %, raid completions, trade history
- Cosmetics unlock on leaderboard: creature skins, sanctuary decorations, avatar accessories

**Neuro-Mechanic Mirror**:
- Creature evolution is framed as a biomechanical study; mirror shows the creature's limb-adaptation patterns
- Learning about phylae-specific movements unlocks evolution paths (e.g., "unlock Velocitaur by mastering wall-kick timing")

---

### B. Asset Sharing

| Asset | Origin | Reuse Strategy |
|-------|--------|-----------------|
| Player avatar (base body) | FEL sport modes | Use same rig; add seasonal creature-trainer cosmetics |
| Movement animations | FEL sport modes | Reuse vault/slide/wall-kick directly |
| UI framework | FEL (all modes) | Extend for inventory, Symbiont circle, diary |
| Havok physics engine | FEL (all modes) | Reuse; add creature-specific collision shapes |
| Babylon.js renderer | FEL (all modes) | Extend with bioluminescent shader |
| WebSocket server | FEL core | Extend with creature/raid state channels |
| Database (Firestore) | FEL core | Add creature/trade/leaderboard collections |

---

## PART 7: SCOPE & RISK ASSESSMENT

### A. Effort Estimation

| Component | Estimate | Risk |
|-----------|----------|------|
| Creature design + modeling (12-15 rigs) | 8-10 weeks | High (unique silhouettes, complex animations) |
| World geometry (5-6 zones) | 6-8 weeks | Medium (reuse asset pipeline) |
| Capture/pact mechanics (prototype → polish) | 4-6 weeks | Medium (rhythm gameplay + AI negotiation logic) |
| Option A (persistent world netcode) | 8-12 weeks | High (server state management, raid orchestration) |
| Option B (instanced raid netcode) | 4-6 weeks | Low (extends ROM co-op model) |
| Progression/evolution system | 3-4 weeks | Low (database-driven, formula-based) |
| Testing/balance (raids, trades, spawning) | 4-6 weeks | High (emergent gameplay bugs) |

**Total (Option A)**: 37-52 weeks (9-13 months, critical path)
**Total (Option B)**: 29-40 weeks (7-10 months, critical path)

**Recommendation**: Option B for Phase A (instanced raids, lower risk); migrate to Option A as Phase B (persistent world expansion) in v1.1+ if player demand justifies server cost.

---

### B. Technical Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Creature AI pathfinding in complex terrain** | High | Pre-compute navigation meshes; fallback to grid-based steering |
| **Raid boss sync desync in Option A** | High | Hourly state checkpoints; boss phase locked to server authority |
| **Capture rhythm UX (is it fun?)** | High | Prototype with focus group; use FEL's existing input latency tuning |
| **Server cost at 10k concurrent (Option A)** | Medium | Implement zone sharding (multiple instances per region); lazy-load assets |
| **Creatures feel AI-like, not scripted** | Medium | Invest in behavior trees; use procedural animation blending |
| **Balance: raids too easy/hard** | Medium | Beta test with guild groups; telemetry-driven adjustments |

---

### C. Scope Risks

**Risk 1: Feature Creep** — "Can we add PvP? Breeding? Co-op dungeons?"
- **Mitigation**: Lock Phase A scope to listed 12-15 creatures + 5 zones + raids + trading. Any new mode/system is Phase B or later.

**Risk 2: IP Compliance** — Creature designs accidentally resemble Pokémon
- **Mitigation**: Have external art director validate silhouettes and names against franchise databases. Require original movement-driven design language (creatures defined by locomotion first, aesthetics second).

**Risk 3: Server Cost Explosion** — If Option A chosen, costs scale $500-5000/mo depending on player concurrency
- **Mitigation**: Start with Option B; only upgrade to Option A if concurrent players >1000 AND revenue covers infrastructure.

---

## PART 8: OPEN ARCHITECTURAL DECISIONS

**Stakeholder approval needed on:**

1. **Netcode model**: Option A (persistent shared world) or Option B (instanced raids)?
   - Option A: More immersive, higher server cost ($500-1500/mo), more emergent gameplay
   - Option B: Lower risk/cost ($200-500/mo), simpler implementation

2. **Creature roster scope**: 12-15 creatures (recommended for Phase A) or expand to 20+?
   - Affects animation + balancing work by 25-40%

3. **Launch timing**: Phase A (v1.2-v1.3, post-FEL v1 ship), or v1.1 concurrent with FEL multiplayer?
   - Affects resource allocation vs. FEL Phase 5-10

4. **PvP scope**: Excluded from Phase A; flag for v1.5+ or allow player-vs-player raids?
   - Changes netcode requirements if competitive sync needed

5. **Breeding/evolution**: Simple stat-boost progression (recommended), or full genetics system?
   - Affects progression design + database schema

6. **Cosmetics monetization**: Free cosmetics (Creator Card credentialed), or cosmetic shop?
   - Affects UI scope + backend for cosmetic catalog

---

## CONCLUSION

**Overall Scope**: Large (7-13 months depending on netcode model)

**Overall Risk**: 🟠 **MEDIUM-HIGH**

**High-Confidence Areas**:
- ✅ Creature animation pipeline (extends FEL's Mixamo rig)
- ✅ World exploration (reuses FEL movement tech)
- ✅ Trading system (straightforward HTTP API)

**Moderate-Risk Areas**:
- ⚠️ Capture rhythm mechanic (novelty; untested fun factor)
- ⚠️ Raid orchestration (Option A: complex server state; Option B: simpler)
- ⚠️ Creature AI personality (not just stat-based, emergent behavior expected)

**Recommendation**: Proceed to implementation (Phase A) with Option B (instanced raids) selected, deferring persistent-world upgrade to v1.5+ based on player demand and revenue.

---

**Approved by**: [Awaiting stakeholder confirmation]  
**Date**: 2026-08-27

