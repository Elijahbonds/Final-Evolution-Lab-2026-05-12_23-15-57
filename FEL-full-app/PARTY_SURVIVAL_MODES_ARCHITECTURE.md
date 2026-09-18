# Party Survival Modes — FEL Feature Spec & Architecture

**Date**: 2026-08-27  
**Status**: Pre-Implementation Architecture  
**Scope**: TWO NEW asymmetric party modes for FEL; does not block FEL v1 ship  
**IP Constraint**: 100% original antagonist designs (no franchise characters/elements)

---

## PART 1: MODE OVERVIEW & CREATIVE DIRECTION

### A. Design Philosophy

**Core Principle**: Asymmetric multiplayer games have natural conflict—one player or team has extreme power, others must cooperate to survive. This creates emergent gameplay without stat-balancing complexity.

**Reference for Mechanics, NOT Content**:
- *Infection Tag* draws from infection-game structure (asymmetric power scaling as hunters multiply)
- *The Stalker* draws from asymmetric horror-game pacing (limited senses vs. extreme close-range power)

**IP Constraint (MANDATORY)**:
- No Michael Myers, no Freddy Krueger, no Jason, no existing horror franchises
- Create **original** stalker antagonist: own silhouette, own name, own minimal lore
- Use FEL's creature-design language (if tying to creature-tamer game) or invent new character type

---

## PART 2: MODE 1 — INFECTION TAG

### A. Mechanical Overview

**Role Distribution**:
- **Alpha Player** (1): Overpowered creature/being; goal is to tag & convert all runners
- **Runner Players** (3-7): Humans using parkour & strategy; goal is to survive timer (5-10 minutes)

**Win Conditions**:
- Alpha wins: All runners converted to secondary infected before timer expires
- Runners win: At least 1 runner remains unconverted when timer ends

**Progression During Match**:
- At 0:00 → 1 Alpha + 7 runners
- At 2:00 → 2-3 infected (first tag conversions)
- At 4:00 → 4-5 infected (exponential growth)
- At 5:00 → Race to finish (Alpha tries to convert last runners; runners try to hold out)

---

### B. Original "Alpha" Design: **Surge Warden**

**IP Compliance**: Entirely original; no franchise reference.

**Character Profile**:

| Attribute | Details |
|-----------|---------|
| **Name** | Surge Warden |
| **Origin Lore** | Bio-engineered sentinel created by the ancient civilization in *Etheria* (creature-tamer world). Programmed to contain chaos, it evolves in response to threat levels. |
| **Silhouette** | Humanoid, ~8ft tall, geometric crystalline plating on limbs, bioluminescent core visible through translucent chest cavity. Limbs are articulated like insectoid exoskeleton (4 main limbs + 2 sensory appendages). |
| **Visual Language** | Sharp, angular, angular (NOT cuddly or cute). Inspired by biomechanical design (think Giger's aesthetic, but sci-fi instead of horror). Glowing circuit patterns pulse across its surface. |
| **Movement Style** | Jerky, precise (not fluid); quad-like gait that can rear up to bipedal sprint. Long reaching arm limbs. |
| **Color Palette** | Deep teal core, silver/chrome plating, bright cyan circuitry glow. Aura of bioluminescent "infection" spreads from core. |

**Narrative Justification** (no spoilers for creature-tamer game):
- Surge Wardens are experimental AIs tied to Etheria's ecosystem control
- In this mode, a "rogue" Warden has escaped its containment protocol
- When it touches runners, it attempts to "assimilate" them (game mechanic; thematically consistent with the creature-tamer lore)

---

### C. Surge Warden Abilities & Stats

**Alpha Abilities** (Surge Warden):

| Ability | Cooldown | Effect | Balance |
|---------|----------|--------|---------|
| **Sprint Surge** | 0s | 2x movement speed for 4 seconds | Active stamina cost (can't spam) |
| **Reach Slash** | 6s | Extends arm limbs to tag runners in radius; doesn't require contact | 8-meter range; 0.5s wind-up (telegraphed) |
| **Conversion Aura** | 15s | All runners within 5m take damage; at 0 HP they're "converted" (respawn as secondary infected) | Area denial; runners must keep distance |
| **Resonance Pulse** | 20s | Temporary stun (0.5s) to all runners in view; forces them to crouch | Long cooldown; can't guarantee conversion |

**Surge Warden Stats**:
- **HP**: 200 (can absorb runner attacks, but not invincible)
- **Movement Speed**: 6 m/s (baseline, faster than runners 5 m/s)
- **Melee Range**: 2m (arm reach)
- **Ability Range**: 5-15m (per ability)
- **Conversion Time**: 2 seconds (must hold contact; runners can break free with parkour)

---

### D. Runner Abilities (Reuse FEL Movement Tech)

**Movement Mechanics** (all runners have):
- **Slide-jump**: Low-profile movement, faster traversal, avoids overhead attacks
- **Wall-kick**: Climb vertical surfaces, escape Alpha cornering
- **Vault**: Rapid obstacle clearance, parkour chain combinations
- **Sprint burst**: 1.5x speed for 3 seconds; 10-second cooldown (strategic use)

**Defensive Items** (picked up in arena):
- **Shield Generator** (1-minute pickup): Absorbs 1 Conversion Aura tick; recharges over 15 seconds
- **Resonance Dampener** (rare): Blocks 1 Resonance Pulse stun (removes effect before it hits)
- **Decoy Beacon** (1-minute pickup): Emits noise/visual to distract Alpha for 5 seconds

**Interactive Arena Features**:
- Collapsible platforms (runners can vault over; Surge Warden's weight causes collapse)
- Electrified water zones (both Alpha and runners take damage; runners can swim through on momentum)
- Biolume crystals (activate to illuminate or blind Alpha for 3 seconds)
- Pressure vents (launch runners into air for escape; also hazard to Alpha)

---

### E. Surge Warden Secondary Infected

**When runners are converted**:
- They become **Echo Sentinels** (secondary infected)
- Lose all items
- **Echo Sentinel Stats**:
  - Movement speed: 5.5 m/s (slightly faster than base runners, slower than Alpha)
  - Abilities: Basic tag + slow (not as powerful as Surge Warden)
  - HP: 100 (still mortal; runners can defeat them to "purify")
- **Purification**: If runners deal 100 damage to an Echo Sentinel within 5 seconds, they're converted back (limits runaway snowball)

**Psychological Asymmetry**:
- Converted players are now "enemies" but can still communicate (team chat becomes restricted; they see only Alpha's objective)
- Creates social pressure: teammates sacrificing themselves to buy time

---

## PART 3: MODE 2 — THE STALKER

### A. Mechanical Overview

**Role Distribution**:
- **Stalker Player** (1): Limited FOV (~120°), enhanced melee, goal is to trap & eliminate all runners
- **Runner Players** (3-7): No combat ability, parkour-only evasion, goal is to survive timer (5-10 minutes)

**Win Conditions**:
- Stalker wins: All runners eliminated before timer expires
- Runners win: At least 1 runner survives until timer ends

**Key Difference from Infection Tag**:
- No conversion mechanic; runners stay runners
- Runners must use **stealth, distraction, and item usage** rather than mutual combat
- Stalker has extreme close-range power but limited awareness

---

### B. Original "Stalker" Design: **The Hollow**

**IP Compliance**: Entirely original; no franchise reference (not Michael Myers, not a generic slasher).

**Character Profile**:

| Attribute | Details |
|-----------|---------|
| **Name** | The Hollow (or "Obsidian") |
| **Origin Lore** | An old FEL lore: The Hollow is a "void entity" that seeps in when athletes overexert beyond human limits (neuroscience angle—cognitive breakdown manifested physically). It hunts those who've lost their "integrity." Thematically tied to FEL's learning system (matching the Neuro-Mechanic Mirror's interest in mind-body connection). |
| **Silhouette** | Vaguely humanoid but distorted: elongated limbs, asymmetrical posture, hunched gait. NOT a man in a mask. Think Slenderman's distant cousin, but biomechanical (corroded metal, tattered fabric, void-like darkness). No face; instead, an empty space (like a negative silhouette). |
| **Visual Language** | Low-poly angular shapes; sharp edges; trailing dark particles/distortion effects. Monochromatic (blacks, grays, void-purple). Sounds: stuttering, glitching, whispers (not speech—corrupted audio). |
| **Movement Style** | Twitchy, unpredictable; sometimes glides, sometimes limps, sometimes sprints. Unnaturally fast for its hunched posture. Limb joints bend wrong. |
| **Color Palette** | Deep black with corroded silver/copper accents. Trailing distortion/chromatic aberration effects. Aura of void-purple corruption. |

**Narrative Justification** (integrated with FEL lore):
- The Hollow is the "cost" of pushing beyond limits without proper recovery
- In this mode, The Hollow hunts runners who cannot evade through skill + strategy
- Thematically: "integrity challenges" (do you have the mindset to survive?")

---

### C. The Stalker (The Hollow) Abilities & Stats

**Stalker Abilities**:

| Ability | Cooldown | Effect | Balance |
|----------|----------|--------|---------|
| **Void Strike** | 1s | Melee attack; eliminates runner instantly if contact made (short range ~1.5m) | Melee-only; runners must maintain distance |
| **Limited Sight** | 0s | FOV capped at 120° (can't see behind or far above); must turn to look | Asymmetric: runners can hide off-screen |
| **Lurking Stride** | 8s | Movement speed increases to 7 m/s for 5 seconds (faster than runners' normal 5 m/s) | Cooldown encourages tactical timing, not spam |
| **Dread Wail** | 20s | Screech that reveals all runner positions within 30m for 3 seconds (radar burst) | Powerful but limited; runners know they've been revealed |

**The Hollow Stats**:
- **HP**: 150 (can take damage; runners can hypothetically hurt it if they cooperate)
- **Movement Speed**: 5.5 m/s (baseline; less than Alpha Surge Warden)
- **Melee Range**: 1.5m (extremely short; requires close approach)
- **FOV**: 120° (missing rear quadrant + upward coverage)
- **Melee Damage**: Instant elimination (one-hit on tagged runner)

**Vulnerability**:
- Cannot see through obstacles (runners can hide in tall grass, behind structures)
- Cannot hear runners who are moving slowly (loud sprints are detectable via sound)
- Can be temporarily blinded by arena hazards (biolume flashes, smoke vents)

---

### D. Runner Survival Mechanics (The Stalker)

**Movement & Stealth** (NO combat ability):
- Parkour same as Infection Tag (slide-jump, wall-kick, vault)
- **Crouching**: Slower movement (~2 m/s) but silent; Stalker can't hear footsteps
- **Breath Hold** (toggle): Eliminates all sound for 10 seconds (stamina drains quickly, can't move during hold)

**Defensive Items** (scattered in arena):
- **Decoy Beacon** (2-minute pickup): Emits loud noise for 5 seconds; lures Stalker away
- **Blackout Grenade** (rare): Temporary visual static; blinds The Hollow for 3 seconds
- **Distraction Flare** (1-minute): Visual/audio distraction at distance; Stalker is drawn to it
- **Silent Footsteps** (very rare, 30s): Eliminates sound on next 3 sprints

**Interactive Arena Features** (defensive, not combat):
- **Tall grass** (dense vegetation): runners can hide; obstructs Stalker's sightlines
- **Sound-dampening fog zones**: movement is silent, but FOV reduced for both
- **Mirror/glass surfaces**: Create false sightlines; confuse Stalker
- **Wind tunnels**: Create audio noise to mask footsteps
- **Safe zones** (glowing circles, 1-2 per arena): Stalker cannot enter; runners get 10-second refuge (used strategically for regrouping)

**Teamwork Mechanic**:
- Runners can coordinate: one distracts Stalker, others hide/escape
- Communication is restricted (Stalker can hear if runners are too loud nearby)

---

## PART 4: ARENA DESIGN (BOTH MODES)

### A. Arena Structure

**Size**: 250m × 250m (10x larger than a sport mode arena)

**Biome**: Bioluminescent ruins (Etheria setting)

**Zones**:
1. **Central Nexus** (120m radius): Open space; high visibility, few hiding spots
2. **Crystalline Caverns** (4 sections, edges): Dense vertical structures; parkour-heavy
3. **Biolume Gardens** (interleaved): Tall flora; good for hiding (Stalker mode), items spawn here
4. **Void Rifts** (2-3 locations): Hazard zones; neither Alpha/Stalker nor runners want to stay long

**Vertical Design**:
- 3 main "levels": ground, mid-level (10-15m), high (20-30m)
- Runners can escape vertically via parkour; Stalker/Alpha must pursue or find alternative routes
- Some paths only available via wall-kick or slide-jump (mobility advantage for runners)

---

### B. Interactive Hazards (Both Modes)

| Hazard | Effect | Mechanic |
|--------|--------|----------|
| **Collapsing Bridge** | Falls if weight >200kg (Surge Warden triggers; runners safe) | Asymmetric; creates barriers |
| **Electrified Water** | Damage to both; runners can swim through on velocity | Resource management (timing risky moves) |
| **Pressure Vents** | Launches players upward (unpredictable direction) | Skill test; risk/reward for escape |
| **Biolume Crystals** | Activate to illuminate (3s) or create brief blindness | Runners use for vision advantage; Stalker disadvantage |
| **Void Rifts** | Damage zone (both lose HP gradually); limited resources | Core hazard; keeps arena dynamic |
| **Safe Zones** (Stalker only) | Stalker cannot enter; 10-second refuge for runners | Strategic, not camping spot (runners must leave) |

---

## PART 5: TECHNICAL ARCHITECTURE

### A. Game Flow & State Management

**Pregame**:
1. Host selects mode (Infection Tag or Stalker)
2. Players join; first joiner becomes Alpha/Stalker
3. 10-second countdown
4. Roles assigned; everyone spawn in safe starting locations

**During Match** (5-10 minute timer):
- Server tracks positions (client predicts, server validates)
- Tag detection: server-side collision check every frame
- Item pickups: server validates (no double-pickup)
- Hazard triggers: server-authoritative
- Conversions/eliminations: server records, broadcasts to all

**End State**:
- Server validates win condition
- XP awarded (participation + role-specific)
- Leaderboard updated (per-match stats)
- Players returned to lobby

**Netcode Model**: Server-authoritative (similar to FEL's existing multiplayer modes)
- Client sends: position, velocity, ability presses
- Server validates: tag detection, item pickup, ability cooldowns
- Server broadcasts: player positions (replicated to all clients), ability effects, conversions
- Latency tolerance: ~150-200ms (asymmetric games more forgiving than competitive sync)

---

### B. Asset Requirements

**Surge Warden (Alpha)**:
- 1 unique rig (8ft tall, 4 limbs + 2 sensory appendages)
- Animation set: walk, run, idle, reach-slash (wind-up + strike), sprint-surge, conversion-aura (looping particle effect)
- VFX: bioluminescent aura, conversion pulse, ability telegraphs

**The Hollow (Stalker)**:
- 1 unique rig (asymmetrical, hunched posture)
- Animation set: idle (twitching), crouch-walk, sprint, lurk-stride (ability), void-strike, dread-wail (ability)
- VFX: void distortion, chromatic aberration, dread-wail shockwave

**Arena**:
- 250m × 250m heightmap + geometry (modular tile-based, reuse FEL's asset pipeline)
- Vegetation assets (tall grass, crystalline plants)
- Structures (ruins, platforms, bridges)
- Hazard VFX (electrified water shader, pressure-vent particle effects)

**Reuse from FEL Core**:
- Player avatar rig (use same as sport modes)
- Parkour animation library (slide-jump, wall-kick, vault)
- Physics system (Havok; collision detection)
- UI framework (health bar, ability cooldowns, timer)
- Particle system (for hazards, abilities, items)

---

### C. Multiplayer Server Stack

**Extends FEL's existing WebSocket server**:

```
Game Server Namespace: /socket.io/?namespace=party-survival

Rooms:
  party-survival/{sessionId}/
    ├─ Player positions (replicated every 100ms)
    ├─ Alpha/Stalker state (position, ability cooldowns, FOV direction)
    ├─ Item state (pickup locations, who's carrying)
    ├─ Hazard state (active/inactive, countdown timers)
    ├─ Conversions/eliminations (broadcast to all)
    └─ Timer (countdown, synced)

Messages:

  Client → Server:
    player:move { position, velocity, direction }
    player:ability { ability_id, target_position? }
    item:pickup { itemId }
    game:action { action_type } (e.g., "crouch", "sprint", "breathHold")

  Server → All Clients:
    player:moved { playerId, position, velocity }
    ability:triggered { playerId, ability_id, vfx_location }
    item:picked_up { playerId, itemId }
    player:converted { playerId } (Infection Tag)
    player:eliminated { playerId } (Stalker)
    game:time_remaining { seconds }
    game:end { winner: "alpha" | "runners", stats: {} }
```

**Performance Requirements**:
- 8 concurrent players per session
- 60 FPS (server-side simulation)
- Position updates every 100ms (adequate for non-competitive gameplay)
- Latency compensation: client prediction + server reconciliation (accept up to 200ms variance)

---

## PART 6: PROGRESSION & REWARDS

### A. Match Rewards

**Per-Match XP** (all modes):
- **Base**: 100 XP
- **Role bonus**: Alpha/Stalker gets +50 XP if win; +25 if lose
- **Runner bonus**: +75 XP if survive; +25 if caught early
- **Performance bonus**: +10 XP per 30 seconds survived (rewards efficiency)
- **Item usage bonus**: +5 XP per item used (encourages engagement with mechanics)

**Leaderboard** (weekly reset):
- Most eliminations (Alpha players)
- Longest survival time (Runner players)
- Most matches played
- Win rate (per role)

---

### B. Creator Card Integration

**New Credential Block**: "Party Survival Mastery"

```
Data:
  matches_played: number
  wins_as_alpha: number
  wins_as_runner: number
  total_eliminations: number
  longest_survival_streak: number (consecutive matches won as runner)
  average_survival_time: seconds
  favorite_mode: "infection_tag" | "stalker"
  
Badges:
  "Predator" (100 Alpha eliminations)
  "Survivor" (50 matches won as runner)
  "Asylum Break" (win both modes at least 5x)
  "Apex of Time" (survive full 10-minute round on Stalker mode)
```

**Creator Card Display**:
```
┌──────────────────────────────┐
│ Party Survival Mastery       │
│ ✓ Predator badge (143 elim.) │
│ ✓ Survivor badge (52 wins)   │
│                              │
│ Longest Streak: 7 matches    │
│ Avg Survival: 4m 32s         │
│ Mode: Stalker (prefer hunter)│
└──────────────────────────────┘
```

---

## PART 7: RISK ASSESSMENT

### A. Gameplay Balance Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Infection Tag becomes snowball** | High | Purification mechanic (runners can convert back Echo Sentinels) limits exponential growth |
| **Stalker feels overpowered/underpowered** | High | A/B test with closed beta; FOV restriction + short melee range balances one-hit power |
| **Runners have no counterplay** | Medium | Items (decoys, flares) + safe zones + hazard usage empower runners |
| **Arena too large/too small** | Medium | Start with 250m × 250m; adjust based on match telemetry (average match length, chase effectiveness) |
| **Abilities feel unfun to play against** | Medium | Long cooldowns + telegraphing reduce frustration; clear audio/visual feedback |

---

### B. Technical Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Desync in tag detection** | High | Server-authoritative; all collisions validated server-side with 150ms grace period for latency |
| **Lag advantage (latency-exploitable abilities)** | Medium | Latency compensation; abilities locked to server frame time (no client-prediction for abilities) |
| **FOV calculation expensive on Stalker** | Low | Pre-compute FOV cone; update every 100ms (acceptable refresh rate) |
| **Eight concurrent players exceeds WebSocket capacity** | Low | Extend existing FEL server (already handles 100+ concurrent); dedicated party-survival namespace |

---

### C. Content & IP Risks

| Risk | Impact | Mitigation |
|-------|--------|-----------|
| **Surge Warden accidentally resembles existing character** | Medium | Hire external art director; validate silhouettes against franchise character databases; iterate if needed |
| **The Hollow feels derivative of horror franchises** | Medium | Original design brief (void entity, corrupted athlete, not humanoid serial killer); get community feedback in beta |
| **Dark horror tone doesn't match FEL's athletic vibe** | Medium | Emphasize lore tie-in (Etheria setting, Neuro-Mechanic Mirror's "integrity" themes); reframe as "challenging your limits" rather than pure horror |

---

## PART 8: OPEN DECISIONS

**Stakeholder approval needed on:**

1. **Match duration**: 5 minutes (quick, arcade-style) or 10 minutes (strategic, marathon)?
   - Affects pacing, ability design, server load

2. **Player count**: 1v3 (minimal, balanced) or 1v7 (chaotic, emergent)?
   - Affects server load, coordination complexity

3. **PvP in Stalker mode**: Can runners cooperatively attack The Hollow (group damage), or is it purely evasion?
   - Affects win condition; PvP adds complexity but reduces runner agency

4. **Cosmetics/skins**: Surge Warden/Hollow cosmetic skins (different "variants"), or locked designs?
   - Affects monetization and visual consistency

5. **Progression unlocks**: Cosmetics + XP, or gameplay variants (e.g., different Stalker types)?
   - Affects long-term engagement; gameplay variants add scope

6. **Cross-mode progression**: Separate progression for Infection Tag vs. Stalker, or unified?
   - Affects Creator Card design; unified is simpler

7. **Launch timing**: With FEL v1, or post-v1 (v1.1+)?
   - Affects development roadmap; post-v1 reduces shipping burden

---

## CONCLUSION

**Overall Scope**: Medium (4-6 months from greenlight to v1.0)

**Overall Risk**: 🟡 **MEDIUM**

**High-Confidence Areas**:
- ✅ Asymmetric game design (well-established pattern)
- ✅ Reuse of FEL movement tech (direct copy from existing modes)
- ✅ Server architecture (extends existing multiplayer stack)

**Moderate-Risk Areas**:
- ⚠️ Balance (Alpha/Stalker may be too strong/weak; requires closed beta + telemetry)
- ⚠️ Original character design (IP compliance; must validate Surge Warden + The Hollow)
- ⚠️ Engagement (asymmetric games can feel unfair to one role if imbalanced)

**Recommendation**: Proceed to Phase A (v1.0 design + prototype) with both modes locked, closed beta with 10-20 players for 2 weeks, then iterate on balance. Launch post-FEL v1 (v1.1 or v1.2) to avoid shipping overload. Original character designs require external art validation before implementation starts.

---

**Approved by**: [Awaiting stakeholder confirmation]  
**Date**: 2026-08-27

