# FEL Game Modes - 10-Phase Architectural Audit Report

## TIER 1 - CRITICAL (4 modes)

### 1. DunkMode (635 lines) - Status: AUDITING

**Architecture Overview:**
- Phase machine: approach → charge → cinematic → resolve → judging → rivalTurn → contestOver
- Triple-judge scoring system (JudgePanel shared module)
- Style taps + variety memory system
- Trick flight input system (mid-air combo detection)
- Replay recording on rim-cam
- Momentum bus for Game-Breaker tracking

**Critical Issues Identified (Phase 1-3: Blockers):**
1. ❌ No try-catch around CharacterLibrary.spawn() - can leave dangling refs if spawn fails
2. ❌ DunkReplayRecorder.play() not validated for success (line 532 race condition)
3. ❌ Phase watchdog only logs warning, doesn't hard-reset state (line 366)
4. ❌ No validation that STYLE_CLIP music exists before play (line 412)
5. ❌ Ball attachment fails silently if skeleton missing (line 151)

**Issues (Phase 4-6: Gameplay Logic):**
6. ❌ Variety memory not cleared when reset fails mid-contest
7. ❌ Judge reveal timing race with watchdog advancement (line 542)
8. ❌ Flight trick input can queue after phase end
9. ❌ Rim hang scoring (+1) not capped in extreme cases
10. ❌ Rival scoring uses Math.random() directly (no RNG isolation)

---

### 2. OneVOneMode (556 lines) - Status: AUDITING

**Architecture Overview:**
- Two-way possession system (mine/defense)
- Real ball physics with ShotArc flight
- Drive dunk system with posterize detection
- Turbo meter (sprint resource)
- Real defense: block timing + steal + body collision
- Make-it-take-it + ankle-breaker stuns

**Critical Issues (Phase 1-3: Blockers):**
1. ❌ No try-catch around character spawn (line 59)
2. ❌ ContactSystem?.isReady checked but null path has no fallback validation (line 89)
3. ❌ LocalInputSource not validated on load
4. ❌ AgentControlSource (line 32) used without null check
5. ❌ BallSim state not verified before physics step

**Issues (Phase 4-6: Gameplay):**
6. ❌ Possession flip logic doesn't validate prior shot result
7. ❌ Defense phase timing can desync if update() called after phase end
8. ❌ Block window validation doesn't account for animation speed
9. ❌ Turbo regen breaks if character stopped mid-sprint
10. ❌ Ankle-breaker stun doesn't clear if rival dies

---

### 3. ThreeVThreeMode (478 lines) - Status: AUDITING

**Architecture Overview:**
- 3v3 team gameplay (you + 2 AI teammates vs 3 AI defenders)
- Possession-based 90-second timer
- Pass system (chest/bounce/lob) with flight
- TeammateBrain (spacing/cuts/assists)
- DefenderBrain (coverage/closeout)
- Block/steal during opponent possessions

**Critical Issues (Phase 1-3: Blockers):**
1. ❌ No spawn error handling for 6 characters (line 100)
2. ❌ Teammate/defender brains not validated before AI update
3. ❌ Pass target body can be null without check (line 72-76)
4. ❌ Ball attachment to null-returned carrierBody() (line 82)
5. ❌ resetPossession() called without checking scene ready

**Issues (Phase 4-6: Gameplay):**
6. ❌ Possession timer doesn't reset on made baskets
7. ❌ Assist tracking doesn't validate passer was active
8. ❌ Pass interception has no collision validation
9. ❌ Shot quality calculation doesn't account for defensive positioning
10. ❌ Body array mutation can cause stun timing issues

---

### 4. ShowdownMode (472 lines) - Status: AUDITING

**Architecture Overview:**
- Combat arena 1v1 with support assist system
- Strike system with frame-data (light/medium/heavy/finisher)
- Defense: parry/guard/SUBSTITUTION chi-cost counter
- Chakra resource meter (fills on hits/parries, spent on dashes)
- Ultimate with cinematic cut (fixed camera, wall shatter)
- Momentum bus tracks substitution/ultimate plays

**Critical Issues (Phase 1-3: Blockers):**
1. ❌ No spawn validation for player, rival, support (line 53)
2. ❌ FighterState objects not initialized before use
3. ❌ StrikeController/DefenseController not validated on init
4. ❌ Support character spawning can fail without cleanup
5. ❌ CombatAnimTree state not validated before play (line 89+)

**Issues (Phase 4-6: Gameplay):**
6. ❌ Strike active window can trigger after phase end
7. ❌ Substitution teleport doesn't validate destination clear
8. ❌ Ultimate damage doesn't cap in extreme chi scenarios
9. ❌ Support assist cooldown doesn't persist across rounds
10. ❌ Wall destruction mesh not validated for destruction state

---

## TIER 2 - HIGH (5 modes)

### 5. DuelMode (16KB) - Status: PENDING
### 6. DunkDuelMode (13KB) - Status: PENDING
### 7. KarateEndlessMode (24KB) - Status: PENDING
### 8. MixedCombatMode (21KB) - Status: PENDING
### 9. KarateVSMode - Status: PENDING

## TIER 3 - MEDIUM (5 modes)

### 10. FootballRushMode (14KB) - Status: PENDING
### 11. SkateRunMode - Status: PENDING
### 12. SnowboardSlalomMode - Status: PENDING
### 13. SurfBreakMode - Status: PENDING
### 14. BoardRunMode (6KB) - Status: PENDING

## TIER 4 - SUPPORTING (3 modes)

### 15. DanceMode (8.9KB) - Status: PENDING
### 16. precisionModes.ts - Status: PENDING
### 17. NetSportMode (12KB) - Status: PENDING

---

## Summary

- **Total Modes:** 17
- **TIER 1 Issues Found:** 40 (10 per mode)
- **TIER 2-4 Issues Found:** TBD (estimated 60)
- **Total Est. Issues:** ~100
- **Fix Phases Per Mode:** 10 (structure, init, input, gameplay, validation, polish, recovery, perf, telemetry, config)
- **Est. New Code:** 70-170KB total

