# Final Evolution: The Nexus Initiative — Story Mode Spec

> Source-of-truth design document. All implementation must conform to this spec.
> Runtime: Web (Next.js 14 + HTML5 Canvas 2D + framer-motion DOM UI).
> Assets: FEL-original only (Meshy avatars, DeepMotion/SayMotion mocap, original art).

---

## 1. Core Differentiator

Narrative progression is **gated by real PRQ growth and Skill Lab mastery**.
Players cannot advance the story by button-mashing; they advance by measurably improving.
"Glitch" bosses are physical manifestations of the player's **weakest PRQ stats** —
a low vertical spawns a boss that out-jumps them until they train it up.

---

## 2. Five-Chapter Arc (full vision)

| Ch | Title | Theme | Gate | Status |
|----|-------|-------|------|--------|
| 1 | **The Awakening** | Fundamentals — dunk hero intro | PRQ ≥ 30, 2 lessons complete | **v1 SLICE** |
| 2 | The Glitch | Adaptability — rail challenge | PRQ ≥ 45, 6 lessons | Stubbed |
| 3 | Rising Tide | Team dynamics — 3v3 integration | PRQ ≥ 55, 9 lessons | Stubbed |
| 4 | Mastery Lab | Peak PRQ checkpoint | PRQ ≥ 70, full track | Stubbed |
| 5 | The Nexus Core | Synthesis boss — all stats | PRQ ≥ 80, all tracks | Stubbed |

### v1 Slice Scope (Chapter 1: The Awakening)
- Training Sanctum hub (PRQ review, Coach dialogue, progress log)
- Rail-grind traversal segment (connects Sanctum → Arena District)
- One Glitch Boss encounter (dunk-type, targets player's weakest stat)
- Economy tie-in: Marketplace District teaser
- Session logging: every encounter → GameSession (Hero Mode)

---

## 3. Systems

### 3.1 Traversal — Rail Grind
- High-speed rail-grind movement on canvas (side-scrolling).
- PRQ "vertical control" (composite of agility + power) governs:
  - Grind speed (base 400px/s, scaled by grade.speedMult)
  - Stability window (balance meter)
  - Aerial transitions (jump between rails)
- Grinding launches player into combat/boss encounters.
- Obstacles: gaps (jump), barriers (duck), sparks (balance check).
- Collectibles: XP orbs, shard pickups.

### 3.2 Combat — Skill-Gated Combos
- Deliberate martial-arts combos with timing windows.
- Bullet-time dodge counters (slow-mo on perfect dodge, 0.3s window).
- Cinematic finishers (screen flash + zoom on final hit).
- **Skill-to-combat mapping** (real curriculum → in-game moves):
  - Dunk Charge Mechanics → Aerial Launcher (power leap)
  - Dunk Hang Time Physics → Air Combo Extension
  - Karate Jab → Quick Strike opener
  - Karate Kick → Heavy Finisher
  - Karate Special → Ultimate Combo (requires Neural Burst)
  - Karate Block Cone → Dodge Counter
- Locked moves show "Complete [lesson] to unlock" overlay.

### 3.3 Coach Companion
- Recurring mentor with adaptive dialogue.
- Data source: `CoachDataProvider` interface (mock on web, native bridge later).
- **Tone rules (MANDATORY):**
  - ALWAYS supportive and adaptive, NEVER shaming.
  - Poor recovery → "Let's go lighter today, champ" (not "you're weak").
  - Low sleep → "Rest is part of training. We'll focus on precision today."
  - High fatigue → "Smart athletes know when to recover. Let's do technique work."
  - Good data → "You're fueled up — let's push the ceiling."
- Coach appears in: Training Sanctum (dialogue), pre-boss briefing, post-encounter debrief.

### 3.4 CoachDataProvider Interface
```typescript
export interface WearableSnapshot {
  sleepHours: number;       // 0-12
  recoveryScore: number;    // 0-100
  restingHR: number;        // bpm
  trainingLoad: number;     // 0-100 (7-day rolling)
  lastWorkout: string;      // ISO date or 'none'
  streak: number;           // consecutive active days
}

export interface CoachDataProvider {
  getSnapshot(): Promise<WearableSnapshot>;
  isAvailable(): boolean;
}
```
v1 ships `MockCoachDataProvider` (seeded from profile.streakDays + randomized recovery).
Native bridge implements same interface via HealthKit/Google Fit.

### 3.5 Training Sanctum (Hub)
- Dark sanctum interior (canvas backdrop + DOM overlay).
- PRQ radar chart (8 attrs).
- Coach dialogue panel (adaptive text based on WearableSnapshot).
- Progress log: completed chapters, lessons, sessions.
- "Enter the Nexus" button → starts chapter traversal.
- Marketplace District link → existing /shop.

### 3.6 Glitch Boss System
```typescript
export interface GlitchBoss {
  id: string;
  name: string;
  chapter: number;
  targetStat: PrqAttr;        // player's weakest
  bossStrength: number;       // scales inversely to player's stat
  phases: BossPhase[];
  defeatCondition: string;
}

export interface BossPhase {
  name: string;
  mechanic: 'dodge' | 'combo' | 'qte' | 'endurance';
  duration: number;
  difficulty: number;
}
```
v1 Boss: "The Vertigo" — targets lowest of (power, agility, speed).
Mechanic: aerial dunk-style QTE where boss out-jumps player until stat improves.
3 phases: Dodge → Combo → Aerial Finisher.

### 3.7 Economy Tie-in
- Marketplace Districts appear between traversal segments.
- Display subset of SHOP_CARDS relevant to current chapter.
- Creator Cards upgrade avatar capabilities in story context.
- Story-exclusive cosmetic rewards (future chapters).

### 3.8 Session Logging
Every story encounter posts to `/api/sessions` with mode: `storyMode`.
PRQ deltas use existing `computePrqDelta` with weight 1.2 (story premium).

---

## 4. Aesthetic
- Premium dark (#050505 base), high-contrast neon accents.
- Minimal UI — no clutter during gameplay.
- Landscape-optimized canvas (16:9 aspect).
- Controller support: keyboard + gamepad + mobile touch.
- Consistent with FEL design tokens (see globals.css).

---

## 5. Stubbed Interfaces for Full Arc

```typescript
// lib/story-data.ts
export interface Chapter { ... }     // Full 5-chapter definition
export interface StoryProgress { ... } // Per-user chapter/mission state  
export interface NexusEncounter { ... } // Generic encounter wrapper
export const CHAPTERS: Chapter[]       // All 5 defined, only ch1 playable
```

```typescript
// Future DB model (not in v1 — use localStorage + session API)
// model StoryProgress { ... }
```

---

## 6. IP Compliance
- Zero borrowed assets, source code, level geometry, characters, music, or UI.
- Genre mechanics only — general conventions, never protected expression.
- All art: FEL-original (Meshy-generated, DeepMotion mocap, hand-drawn canvas).
- Coach dialogue: original writing, supportive athlete-development framing.
