# FEL Future Feature Roadmap — Architecture Lock & Decision Matrix

**Date**: 2026-08-27  
**Status**: Four feature proposals, all pre-implementation, awaiting stakeholder approval  
**Sequencing**: All gated behind FEL v1.0 ship; may run in parallel post-v1

---

## EXECUTIVE SUMMARY

| Feature | Scope | Effort | Risk | Status | Dependencies |
|---------|-------|--------|------|--------|--------------|
| **Homebrew ROM Creator** | Emulator + co-op + Creator Card tie-in | 8-10 wks | 🟡 Medium | Arch ✅ | Firebase, WebSocket |
| **Creature-Taming Game** | Open-world, 12-15 creatures, multiplayer choice | 29-52 wks | 🟠 Med-High | Arch ✅ | Babylon.js, new netcode |
| **Knowledge Feed** | Swipe-feed learning, spaced repetition, 50+ concepts | 16-24 wks | 🟡 Medium | Arch ✅ | Brain Brawl, Mirror |
| **Party Survival** | 2 asymmetric modes, original antagonists, 250m arena | 16-24 wks | 🟡 Medium | Arch ✅ | FEL movement tech |

**Total Effort If All Approved**: 69-110 weeks (≈ 17-27 months), but can run in parallel (4 independent tracks)

**Recommended Parallel Tracks**:
```
FEL v1.0 (Core)
  ├─ Phase 5-10 (Multiplayer + Polish) — 16-20 weeks [CRITICAL PATH]
  │
  ├─ Track A: Homebrew ROM Creator — 8-10 weeks
  │           Start: Week 8 (parallel to Phase 8-9)
  │           Ready: Week 18 (v1.2 release candidate)
  │
  ├─ Track B: Knowledge Feed — 16-24 weeks
  │           Start: Week 1 (day-1 parallel)
  │           Ready: Week 24 (v1.3 release)
  │
  ├─ Track C: Party Survival Modes — 16-24 weeks
  │           Start: Week 1 (day-1 parallel)
  │           Ready: Week 24 (v1.3 release)
  │
  └─ Track D: Creature-Taming Game — 29-52 weeks
              Start: Week 12 (after core networking proven)
              Ready: Week 41-64 (v1.5-v1.6 release)
```

---

## FEATURE 1: HOMEBREW ROM CREATOR PLATFORM

### Overview
Browser-based platform for original homebrew ROMs (NES/SNES/GBA). Co-op multiplayer (client-predicted sync). Creator Card integration (Games Created credential).

### Key Decisions (14 open)
1. **Emulator core**: EmulatorJS (Recommended) vs libretro WASM
2. **Platform support**: NES/SNES/GBA vs expanded
3. **Creator Card placement**: New block vs integrate
4. **Co-op player limit**: 2-4 players
5. **ROM file size limit**: 50MB per file
6. **Attestation review**: Automated + manual queue
7. **Revenue model**: Free vs cosmetics shop
8. **Timeline**: Q4 2026 or sooner
9. **Competitive netcode demand**: Explicitly deferred to v2.0
10. **Offline mode**: v1 vs v1.5+
11. **Stats granularity**: Per-session or aggregated
12. **Save-state sync frequency**: Every 30sec
13. **WASM isolation**: Web Worker (safer) vs main thread (faster)
14. **Community moderation**: Auto-flag + human review vs automated-only

### Architecture Highlights
- **Tech Stack**: EmulatorJS + WebSocket + Firebase Storage + Firestore
- **Netcode**: Client-predicted, server-authoritative, frame-level sync
- **Storage**: Firebase Storage (ROMs) + Firestore (metadata), ~$5-10/mo at 6-month horizon
- **Legal**: DMCA safe harbor, no commercial ROM ingestion, user attestation

### Phase A Deliverables (Upon Approval)
1. Creator Workspace (upload, metadata, publish)
2. Emulator View (EmulatorJS integration)
3. Co-op Session Server (sync logic)
4. Discovery UI (browse, search, trending)
5. Creator Card integration
6. Legal/ToS (homebrew attestation, DMCA process)

### Timeline
- **Phase A**: 8-10 weeks (v1.0)
- **Phase B**: 4-6 weeks later (persistent leaderboards, competitive netcode flagged for v2.0)

### Files
- `HOMEBREW_ROM_CREATOR_PLATFORM_ARCHITECTURE.md` (21.8 KB)
- `HOMEBREW_ROM_CREATOR_TECHNICAL_RISKS.md` (19 KB)

---

## FEATURE 2: ORIGINAL 3D OPEN-WORLD CREATURE-TAMING GAME

### Overview
Original creature-taming game with harmonic-resonance capture mechanic, open-world exploration (5-6 biomes), 12-15 creature roster (original bestiary), multiplayer raids + trading.

### World & Lore
- **Title**: *Etheria: The Symbiote Wilds*
- **Setting**: Bioluminescent archipelago with intelligent life-forms (Symbionts)
- **Player Role**: Field Naturalist (negotiates pacts, not ownership)
- **Lore Tie**: Creatures seeded by ancient bio-engineering civilization; pattern-matching mirrors Neuro-Mechanic Mirror's principles

### Creature Phylae (Original Roster)
1. **Leapers** (Pursuit line): Springcoil → Velocitaur
2. **Tanks** (Guardian line): Bedrock → Fortessa
3. **Gliders** (Utility line): Veilwing → Aether Sentinel
4. **Tier 2 Wild/Rare**: 6-9 additional creatures (Coreshard, Mistweaver, Depthsinger, etc.)

**Total**: 12-15 creatures (unique models, animations, lore)

### Capture Mechanic: Harmonic Resonance
- Player approaches creature → enters rhythm-pattern matching
- 10-second window; 3-5 button presses in tempo
- Success triggers dialogue; creature joins player's "Symbiont Circle" (not party)
- Creature loyalty affects co-op + behavior

### Multiplayer Architecture (KEY DECISION)

#### **Option A: Persistent Shared World**
- Single shared instance per zone
- Players see each other; can trade in-field
- Raid bosses require 2-4 players
- PvP zones (opt-in)
- **Cost**: $500-1500/mo
- **Effort**: 37-52 weeks (critical path)
- **Risk**: Higher (server state complexity)

#### **Option B: Instanced Raids** (Recommended for Phase A)
- Solo exploration; invited co-op raids
- Trading in shared sanctuary hubs
- Simpler netcode (extends ROM co-op model)
- **Cost**: $200-500/mo
- **Effort**: 29-40 weeks (critical path)
- **Risk**: Lower (proven pattern)

### Key Decisions (9 open)
1. **Netcode model**: Option A (persistent) vs Option B (instanced)
2. **Creature roster**: 12-15 (Phase A) or 20+
3. **Launch timing**: v1.2-v1.3 or concurrent with FEL v1.1 multiplayer
4. **PvP scope**: Excluded (v1) or allow player-vs-player raids
5. **Breeding/evolution**: Simple (stat-boost) or full genetics system
6. **Cosmetics monetization**: Free or cosmetic shop
7. **Arena size**: 5-6 zones or expand to 8-10
8. **Raid difficulty scaling**: 2-4 players fixed or dynamic
9. **Story depth**: Main campaign (40+ hours) or side-content only

### Phase A Deliverables
1. 3 starter creatures + 3 evolved forms fully rigged/animated
2. 6-9 wild/rare creatures (lower fidelity for Phase A)
3. Open-world core: 5-6 zone geometry, traversal mechanics
4. Capture/pact system + loyalty mechanics
5. Multiplayer Option B (instanced raids + trading)
6. Progression system (evolution, discovery, leaderboards)
7. Creator Card integration (Symbiont Naturalist credential)

### Timeline
- **Phase A**: 29-40 weeks (v1.0, Option B recommended)
- **Phase B**: 8-12 weeks later (persistent world upgrade to Option A, if demand justifies)

### Integration with FEL Core
- Reuses: Movement tech (vault/slide/wall-kick), Havok physics, Babylon.js rendering, WebSocket server, Firestore DB
- New: Creature models/animations, bioluminescent shader, creature AI logic
- Ties to: Brain Brawl (Dialect Challenges as capture mechanic), Neuro-Mechanic Mirror (creature evolution biomechanics), Creator Card (Naturalist credential)

### Files
- `CREATURE_TAMING_GAME_ARCHITECTURE.md` (22.1 KB)

---

## FEATURE 3: THE KNOWLEDGE FEED (MICRO-LEARNING IDLE LOOP)

### Overview
Vertical-swipe feed (social-media pacing) with bite-sized biomechanics/neuroscience challenges. Spaced-repetition mastery tracking. Async Brain Brawl ghost battles. Skill Drops (short videos + diagnostic checks). Creator Card Educational Credentials.

### Content Types (60/20/20 split in feed)
1. **Micro-Challenges** (60%): 10-30 second challenges (multiple choice, sequence, slider, text input)
2. **Brain Brawl Ghosts** (20%): Async duels against friends' recorded challenge sequences
3. **Skill Drops** (20%): 20-60 second educational videos + comprehension checks

### Spaced Repetition Model
- **Decay Formula**: interval_days = interval_days × (1 + difficultyFactor)
- **Scheduling**: Due challenges, new material, trending content mixed in daily feed
- **Prerequisite Graph**: Novice → Intermediate → Advanced progression
- **Concept Taxonomy**: Biomechanics / Neuroscience / Training Logic (15+ subcategories)

### Content Mastery & Credentials
- **Thresholds**: Novice (1) → Intermediate (5) → Advanced (15) concepts mastered
- **Badges**: Curious Learner, Dedicated Student, Biomechanics Expert, Nomad Scholar (90-day streak)
- **Creator Card**: Educational Mastery block shows concepts mastered, streak, accuracy %

### Neuro-Mechanic Mirror Integration
- Reuse: Anatomy diagrams, joint motion overlays, motion capture annotations
- New: Video-in-feed, interactive sliders, diagnostic checks
- Seamless: Challenge answers use Mirror's interactive components

### Brain Brawl Integration
- Same challenge database
- Async ghost matches recorded automatically
- Monthly leaderboard: Ghost match wins, highest accuracy
- Top performers can challenge via live Brain Brawl mode

### Key Decisions (8 open)
1. **Content launch set**: 20 challenges (v1.0) or wait for 100+
2. **Brain Brawl scope**: Async-only (v1) or add live mode in v1.1
3. **Leaderboard scope**: Personal progress or peer leaderboards
4. **Monetization**: Free for all or paywall Expert tier
5. **Reuse depth**: Mirror-only or full component library
6. **Domain experts**: In-house hiring or external consultants
7. **Content refresh cycle**: Weekly, bi-weekly, or monthly
8. **Mobile-first design**: Responsive or native app track

### Phase A Deliverables
1. Feed UX (swipe, gesture handling, pagination)
2. Micro-challenge engine (answer validation, XP calculation)
3. Skill Drop video player + diagnostic
4. Brain Brawl ghost system (replay, scoring, leaderboard)
5. Spaced-repetition algorithm + daily feed generation
6. Content authoring framework (YAML template, validation)
7. Creator Card Educational Credentials block
8. Beta: 50+ concepts, internal testing, A/B testing on content

### Timeline
- **Phase A**: 16-24 weeks (v1.0)
- **Phase B**: 4-6 weeks later (competitive Brain Brawl mode, expanded content library)

### Integration with FEL Core
- Reuses: Brain Brawl logic & database, Neuro-Mechanic Mirror rendering, Creator Card system, WebSocket/Firestore infrastructure
- New: Spaced-repetition algorithm, content authoring pipeline, feed algorithm
- Ties to: Brain Brawl (ghost matches), Neuro-Mechanic Mirror (anatomy content), Creator Card (Educational Credentials)

### Files
- `KNOWLEDGE_FEED_ARCHITECTURE.md` (24.5 KB)

---

## FEATURE 4: PARTY SURVIVAL MODES

### Overview
Two asymmetric multiplayer party modes reusing FEL's movement tech. Original antagonist designs. Server-authoritative netcode. 250m × 250m bioluminescent ruins arena.

### Mode 1: Infection Tag
- **Role 1**: Alpha player (Surge Warden, overpowered creature)
- **Role 2**: Runners (3-7 humans with parkour)
- **Objective**: Alpha converts all runners to secondary infected (Echo Sentinels) before timer expires; runners win if 1+ survive
- **Mechanic**: Exponential growth (converts spawn new infected); purification allows runners to convert enemies back
- **Duration**: 5-10 minutes per match

### Mode 2: The Stalker
- **Role 1**: Stalker player (The Hollow, void entity)
- **Role 2**: Runners (3-7 humans)
- **Objective**: Stalker eliminates all runners via melee before timer; runners win if 1+ survive
- **Mechanic**: Limited FOV (120°), one-hit melee, dread-wail (position reveal); runners use stealth, items, hazards
- **Duration**: 5-10 minutes per match

### Original Antagonist Designs (IP-Compliant)

#### **Surge Warden** (Infection Tag Alpha)
- 8ft tall, crystalline plating, bioluminescent core
- 4 limbs + 2 sensory appendages
- Jerky movement, geometric silhouette (NOT humanoid)
- Lore: Bio-engineered AI from Etheria civilization
- Abilities: Sprint Surge (speed), Reach Slash (range attack), Conversion Aura (area denial), Resonance Pulse (stun)

#### **The Hollow** (Stalker)
- Distorted humanoid, elongated limbs, asymmetrical posture
- Empty void-space instead of face (negative silhouette)
- Twitchy unpredictable movement
- Lore: Void entity born from pushing beyond human limits (Neuro-Mechanic Mirror integration)
- Abilities: Void Strike (instant melee), Limited Sight (120° FOV), Lurking Stride (ability speed burst), Dread Wail (position reveal)

### Arena Design
- **Size**: 250m × 250m
- **Biome**: Bioluminescent ruins (Etheria setting)
- **Zones**: Central Nexus (open), Crystalline Caverns (vertical), Biolume Gardens (hiding), Void Rifts (hazard)
- **Levels**: 3-tier vertical (ground, mid 10-15m, high 20-30m)
- **Hazards**: Collapsing bridges, electrified water, pressure vents, crystals (activate for light/blindness), safe zones (Stalker-only)

### Movement & Mechanics
- Reuse: Slide-jump, wall-kick, vault (all runners)
- Asymmetry: Alpha/Stalker have unique move sets
- Items: Decoys, flares, dampeners, distraction beacons (runners only)
- Teamwork: Coordination to distract antagonist while others hide/escape

### Netcode
- **Model**: Server-authoritative (extends existing FEL multiplayer)
- **Update Rate**: 60 FPS server-side, position updates every 100ms
- **Latency Tolerance**: ~150-200ms (asymmetric gameplay forgiving)
- **Validation**: Tag detection server-side; collision checks every frame

### Progression & Rewards
- **Per-Match XP**: Base 100 + role bonus + performance bonus + item bonus
- **Creator Card Block**: Party Survival Mastery (wins, eliminations, streaks, badges)
- **Leaderboard**: Weekly (most eliminations, longest survival, win rate)
- **Badges**: Predator (100 elims), Survivor (50 runner wins), Apex of Time (full 10-min round)

### Key Decisions (7 open)
1. **Match duration**: 5 minutes (arcade) or 10 minutes (strategic)
2. **Player count**: 1v3 (minimal) or 1v7 (chaotic)
3. **PvP in Stalker**: Pure evasion or cooperative attacks on Stalker
4. **Cosmetics**: Surge Warden/Hollow skins or locked designs
5. **Progression unlocks**: Cosmetics only or gameplay variants
6. **Cross-mode progression**: Separate per-mode or unified
7. **Launch timing**: v1.1 or post-v1 (v1.2+)

### Phase A Deliverables
1. Surge Warden rig + animations (idle, run, attacks, abilities)
2. The Hollow rig + animations (same)
3. Arena geometry (250m × 250m, 3 levels, interactive hazards)
4. Capture mechanics (tag detection, item pickup, hazard triggers)
5. Progression system (leaderboard, Creator Card integration)
6. Balance testing (closed beta, 10-20 players, 2 weeks)
7. VFX (ability telegraphs, conversions, eliminations)

### Timeline
- **Phase A**: 16-24 weeks (v1.0 design + beta balance)
- **Phase B**: Launch post-FEL v1 (v1.2 or later)

### Integration with FEL Core
- Reuses: Movement animations (vault/slide/wall-kick), Havok physics, Babylon.js rendering, WebSocket multiplayer server, Firestore leaderboards
- New: Antagonist rigs/animations, arena geometry, asymmetric ability logic
- Standalone: No cross-game integration (works as independent mode)

### Files
- `PARTY_SURVIVAL_MODES_ARCHITECTURE.md` (22.4 KB)

---

## CONSOLIDATED STAKEHOLDER DECISION MATRIX

### High-Priority Decisions (Unblock Phase A)

| Decision | Feature | Options | Impact | Recommendation |
|----------|---------|---------|--------|-----------------|
| Emulator core | ROM Creator | EmulatorJS, libretro | Integration approach | **EmulatorJS** (proven, simpler) |
| Netcode model | Creature-Taming | Option A (persistent), Option B (instanced) | Server cost $500-1500 vs $200-500 | **Option B** (Phase A; upgrade Phase B) |
| Content launch set | Knowledge Feed | 20 challenges, 100+ | Week 1-2 launch readiness | **50+ concepts** (reduce churn) |
| Match duration | Party Survival | 5 min (arcade), 10 min (strategic) | Pacing, server load | **5-10 min toggle** (player choice) |

### Medium-Priority Decisions (Shape v1.1-v1.3)

| Decision | Feature | Impact | Timeline |
|----------|---------|--------|----------|
| PvP scope (Creature-Taming) | Raids only vs player-vs-player | Balancing complexity | Phase B (v1.5+) |
| Brain Brawl live mode (Knowledge Feed) | Async-only vs add real-time | Social engagement | Phase B (v1.1) |
| Cosmetics monetization (Creature-Taming) | Free vs shop | Revenue model | Launch or Phase B |
| Stalker PvP attacks (Party Survival) | Pure evasion vs group damage | Win condition balance | Balance testing decides |

### Low-Priority Decisions (Post-v1.0)

| Decision | Feature | Impact | Timeline |
|----------|---------|--------|----------|
| Offline mode (ROM Creator) | v1 vs v1.5+ | Feature parity | v1.5+ |
| Breeding/genetics (Creature-Taming) | Simple vs full system | Long-term progression | v1.5+ |
| Leaderboards (Knowledge Feed) | Personal only vs peer rankings | Engagement/anxiety trade-off | v1.0 or v1.1 |

---

## RECOMMENDED EXECUTION PLAN

### Phase 0: Approval & Kickoff (Week 1)
- Stakeholder review of all four architecture specs
- Decisions made on high-priority items (table above)
- Resource allocation (teams assigned to each track)
- Kick off Tracks B, C in parallel immediately
- Schedule Tracks A, D kickoffs (after decisions finalized)

### Phase 1: Parallel Development (Weeks 1-24)

**Track B (Knowledge Feed)**: Week 1-24
- W1-2: Content authoring framework + 50 concepts
- W3-4: Feed algorithm + spaced repetition
- W5-8: Micro-challenge engine + Brain Brawl ghosts
- W9-12: Skill Drops + Neuro-Mechanic Mirror integration
- W13-16: Creator Card integration + beta
- W17-24: A/B testing, content refresh, polish

**Track C (Party Survival)**: Week 1-24
- W1-2: Character design validation (Surge Warden, The Hollow)
- W3-4: Rig + animation for both antagonists
- W5-8: Arena geometry + hazard logic
- W9-12: Netcode + multiplayer server
- W13-16: Balance testing (closed beta, 10-20 players)
- W17-24: Polish, telemetry analysis, leaderboards

**Track A (ROM Creator)**: Week 8-18
- W8-10: EmulatorJS integration + WebSocket server
- W11-14: Creator Workspace UI + metadata DB
- W15-16: Co-op session sync + discovery
- W17-18: Legal/ToS + launch prep

**Track D (Creature-Taming)**: Week 12-52 (long-tail, post-core)
- W12-16: Creature design + modeling (starter phylae)
- W17-24: Rigging + animation (3 starters + evolutions)
- W25-32: World geometry (5-6 biomes) + hazards
- W33-40: Capture mechanic + pact system
- W41-48: Multiplayer (Option B instanced raids) + trading
- W49-52: Balance + Creator Card integration

### Releases

**v1.0** (Week 20): FEL Core (multiplayer, polish, QA complete)

**v1.1** (Week 24): Add Tracks B + C
- Knowledge Feed (swipe feed + ghost Brain Brawl)
- Party Survival Modes (asymmetric, full balance)

**v1.2** (Week 28): Add Track A
- Homebrew ROM Creator (emulator + co-op)

**v1.3** (Week 32): Polish pass + seasonal content

**v1.5** (Week 52): Add Track D, Phase A
- Creature-Taming Game (v1.0, open-world + raids)

---

## RISKS & MITIGATIONS (SUMMARY)

### Cross-Feature Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Team overextension** (4 parallel tracks) | High | Hire dedicated teams per track; separate repos; weekly sync |
| **Shared infrastructure bottleneck** (WebSocket, Firestore) | Medium | Namespace isolation; auto-scaling + load testing Week 1 |
| **Content quality inconsistency** | Medium | Establish design guilds (creatures, challenges, arena); code review + peer QA |
| **IP compliance** (original content across 3 features) | Medium | Hire external art director; validate designs pre-implementation; legal review |
| **Engagement cliff** (all new features, no early revenue) | Medium | Launch staggered (v1.1 → v1.2 → v1.5); each feature has retention plan |

---

## SIGN-OFF & NEXT STEPS

### For Stakeholders: Three Actions Needed
1. **Review** all four architecture specs (this doc + linked files)
2. **Decide** on high-priority items (emulator core, netcode model, content launch set, match duration)
3. **Approve** Phase A implementation timeline + resource allocation

### For Implementation Teams: Upon Approval
1. **Track B + C**: Kick off immediately (Weeks 1-24 parallel)
2. **Track A**: Start Week 8 (after decisions finalized)
3. **Track D**: Start Week 12 (after core multiplayer proven stable)

### Timeline to Market
- **v1.0 (FEL Core only)**: Week 20 (January 2027 estimated)
- **v1.1 (+ Knowledge Feed + Party Survival)**: Week 24 (February 2027 estimated)
- **v1.2 (+ Homebrew ROM Creator)**: Week 28 (March 2027 estimated)
- **v1.5 (+ Creature-Taming Game)**: Week 52 (August 2027 estimated)

---

**Comprehensive Architecture Lock**: ✅ Complete  
**Ready for Stakeholder Review**: ✅ Yes  
**Ready for Implementation**: ⏳ Pending Approval

---

**Contact**: Ready for questions, clarification, or approval confirmation.

