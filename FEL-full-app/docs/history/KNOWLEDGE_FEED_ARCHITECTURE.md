# The Knowledge Feed (Micro-Learning Idle Loop) — FEL Feature Spec & Architecture

**Date**: 2026-08-27  
**Status**: Pre-Implementation Architecture  
**Scope**: NEW experience mode for FEL; extends Brain Brawl + Creator Card; does not block FEL v1 ship  
**Integration**: Reuses Neuro-Mechanic Mirror, Brain Brawl logic, and Creator Card credential system

---

## PART 1: PRODUCT VISION

### A. The Problem & Opportunity

**Current State**:
- FEL has rich biomechanics knowledge (Neuro-Mechanic Mirror) but it's passive (view-only)
- Brain Brawl exists as discrete duel mode (event-based, not continuous)
- Creator Card tracks sports performance but not learning/mastery progression

**Opportunity**:
A social-media-paced feed where users:
1. Swipe through bite-sized biomechanics challenges (10-30 seconds per item)
2. Build learning streaks without committing to long sessions
3. Compete async against friends via ghost-scores on challenges
4. See mastery progress feed into their Creator Card as "Educational Credentials"

**Target Use**: Evening idle time, commute, quick breaks between sport modes. Not a replacement for sport mode gameplay, but a complementary learning layer.

---

### B. Core Experience Loop

```
User opens "Knowledge Feed"
       ↓
Swipe down → Micro-Challenge appears
       ↓
Read prompt (2-3 seconds), input answer (5-10 seconds)
       ↓
Feedback (correct/incorrect) + streak counter increments
       ↓
Swipe down → Next challenge (or "Brain Brawl ghost match" or "Skill Drop video")
       ↓
Every 5th correct → Creator Card XP awarded
       ↓
At 10-challenge streak → Daily bonus unlocked (double XP next session)
```

**Friction Points Eliminated**:
- No menus; pure swipe-driven UX (like TikTok)
- No turn-based timers (player-paced)
- No punishment for incorrect answers (streak resets, but no "loss")
- Can exit anytime; progress is autosaved

---

## PART 2: CONTENT TYPES & DATA MODEL

### A. Three Content Types

#### 1. **Micro-Challenges** (~60% of feed)

**Format**: Single concept, 10-30 second completion time

**Example Challenge**:
```
┌─────────────────────────────────┐
│  CHALLENGE: Knee Drive Timing    │
│  ─────────────────────────────── │
│                                  │
│  [3D animation of sprinter's     │
│   leg drive at 3 stages]         │
│                                  │
│  Q: At which point does the knee │
│  reach peak height above hip?    │
│                                  │
│  [Three video frames to tap]     │
│  A) Early stance                 │
│  B) Mid-drive ← CORRECT         │
│  C) Late toe-off                 │
│                                  │
│  ✓ Correct! +1 streak            │
└─────────────────────────────────┘
```

**Data Schema**:

```typescript
interface MicroChallenge {
  id: string;                              // "mcc_knee_drive_001"
  title: string;                           // "Knee Drive Timing"
  category: "biomechanics" | "neuroscience" | "training_logic";
  subcategory: string;                     // "sprinting", "agility", "pattern_recognition"
  difficulty: 1-5;                         // 1 = novice, 5 = elite
  
  // Content
  prompt: string;                          // Question text
  media: {
    type: "video" | "animation" | "image";
    src: string;                           // CDN URL
    duration?: number;                     // seconds
  }[];
  
  // Answer structure
  answerType: "multiple_choice" | "sequence" | "slider" | "text_input";
  choices?: { id: string; text: string; media?: string }[];  // for multiple choice
  correctAnswer: string | number[] | { min: number; max: number };
  
  // Metadata
  masteryKey: string;                      // Links to Creator Card credential
  prerequisiteMastery?: string[];           // Must solve X before Y (concept dependency)
  keywordTags: string[];                   // ["knee_drive", "sprinting", "biomechanics"]
  
  // Spaced repetition scoring
  difficulty_factor: number;               // 1.2 (easy) to 2.5 (hard) for decay calculation
  
  // Author metadata
  author: string;                          // "team:biomechanics" or "creator:jane_doe"
  source: string;                          // "neuro_mirror_study_001" or "dunk_contest_analysis"
  created_at: timestamp;
}
```

**Authoring Format** (Content teams create challenges in YAML):

```yaml
challenges:
  - id: mcc_knee_drive_001
    title: "Knee Drive Timing"
    category: biomechanics
    subcategory: sprinting
    difficulty: 2
    prompt: "At which point does the knee reach peak height above hip?"
    media:
      - type: animation
        src: "/assets/sprint_knee_drive.webm"
        duration: 8
    answerType: multiple_choice
    choices:
      - id: a
        text: "Early stance"
      - id: b
        text: "Mid-drive"
        is_correct: true
      - id: c
        text: "Late toe-off"
    masteryKey: "biomechanics:sprinting:knee_timing"
    keywordTags: ["knee_drive", "sprinting", "biomechanics"]
    author: "team:biomechanics"
    source: "dunk_contest_slow_mo_analysis"
```

---

#### 2. **Brain Brawl Ghost Matches** (~20% of feed)

**Format**: Async replay of a friend's past challenge attempt; player competes against their ghost score

**Example**:
```
┌──────────────────────────────────┐
│  Brain Brawl: Ghost Match         │
│  ─────────────────────────────── │
│                                   │
│  Competing against:               │
│  @alex_trainer — Nov 15, 6:32 PM │
│  Score: 8/10                      │
│                                   │
│  [Same 10-challenge sequence]     │
│                                   │
│  Your score: 9/10 ✓               │
│  +45 XP                           │
│  @alex_trainer has been notified  │
│  of your victory!                 │
└──────────────────────────────────┘
```

**Data Schema**:

```typescript
interface BrainBrawlGhostMatch {
  id: string;                          // "bbgm_alex_20261115_001"
  challenger_id: string;               // Ghost opponent (not real-time)
  challenger_score: number;            // Their recorded score
  
  // Challenge sequence (10-15 challenges)
  challenge_sequence: string[];        // Array of challenge IDs
  difficulty_target: number;           // "Easy" (1-2), "Medium" (2-3), "Hard" (3-5)
  
  // Scoring
  time_limit?: number;                 // seconds to complete all 10
  
  // Results storage
  player_score?: number;               // After player completes
  player_accuracy?: number;            // % correct
  timestamp_completed?: timestamp;
  
  // Metadata
  matchup_theme?: string;              // "Sprinting Showdown", "Agility Test", etc.
  notification_sent: boolean;          // Alert challenger of result
}
```

**Async Mechanics**:
1. Alex completes a 10-challenge sequence; her score (8/10) + challenge list is saved as a "ghost"
2. The ghost is offered to her friends in their feeds
3. You attempt the same 10 challenges; your score (9/10) triggers a notification to Alex
4. Option: Head-to-head monthly leaderboard (who beat whose ghosts most)

---

#### 3. **Skill Drops** (~20% of feed)

**Format**: Short video (20-60 seconds) + interactive comprehension check, gated by quick diagnostic

**Example Skill Drop**:
```
┌─────────────────────────────────┐
│  Skill Drop: Ankle Mobility      │
│  ─────────────────────────────── │
│                                  │
│  [60-second video: ankle joint   │
│   anatomy, dorsi-flexion demo]   │
│                                  │
│  Quick Diagnostic:               │
│  Which joint motion is restricted │
│  in high heels? [image slider]   │
│                                  │
│  ✓ Correct!                      │
│                                  │
│  Mastery Unlocked:               │
│  "Ankle Health" (+15 Creator XP) │
│  Share this with your trainer?   │
└─────────────────────────────────┘
```

**Data Schema**:

```typescript
interface SkillDrop {
  id: string;                          // "sd_ankle_mobility_001"
  title: string;
  category: "biomechanics" | "neuroscience" | "training_concepts";
  
  // Video content
  video: {
    src: string;                        // CDN URL
    duration: number;                   // 20-60 seconds
    captions: string;                   // Optional closed captions
  };
  
  // Pre-check (gates the learning)
  prerequisiteMastery?: string[];       // Must have solved these concepts first
  
  // Post-video comprehension check
  diagnosticChallenge: {
    prompt: string;
    answerType: "slider" | "multiple_choice" | "sequence";
    // ... (similar to MicroChallenge)
  };
  
  // Unlock metadata
  masteryKey: string;                  // "health:ankle_mobility"
  xp_reward: number;                   // 10-20 Creator XP on correct diagnostic
  
  // Author
  author: string;                      // "team:biomechanics" or creator
  source: string;                      // "neuro_mirror_episode_3"
  created_at: timestamp;
}
```

---

### B. Content Taxonomy & Prerequisite Graph

**Categories**:
```
biomechanics/
  ├─ sprinting (knee_drive, ground_contact, stride_length)
  ├─ agility (cutting, acceleration, deceleration)
  ├─ jumping (takeoff, flight, landing)
  ├─ upper_body (shoulder_rotation, hip_involvement)
  └─ specifics (ankle_mobility, core_stability)

neuroscience/
  ├─ motor_control (feedforward, feedback, proprioception)
  ├─ skill_acquisition (deliberate_practice, chunking, interference)
  ├─ decision_making (pattern_recognition, risk_assessment)
  └─ fatigue (mental_fatigue, decision_lag)

training_logic/
  ├─ periodization (macrocycles, mesocycles, tapers)
  ├─ adaptation (sarcoplasmic_vs_myofibrillar, CNS_gains)
  ├─ recovery (sleep, nutrition, active_recovery)
  └─ injury_prevention (risk_factors, screening)
```

**Prerequisite Graph Example**:
```
Novice Path (Difficulty 1-2):
  ├─ "What is a muscle fiber?" (neuroscience:motor_control:basics)
  ├─ "Types of muscle contraction" (prerequisite: above)
  ├─ "Knee drive timing" (biomechanics:sprinting:knee_drive)
  └─ [unlock → "Sprinting Efficiency" Skill Drop]

Intermediate Path (Difficulty 2-3):
  ├─ [mastered Novice]
  ├─ "Ground contact phase optimization" (prerequisite: knee_drive)
  ├─ "Stride length vs. frequency trade-offs" (prerequisite: knee_drive)
  └─ [unlock → "Sprint Form Analysis" advanced challenge]

Advanced Path (Difficulty 3-5):
  ├─ [mastered Intermediate]
  ├─ "CNS adaptation to speed work" (training_logic:adaptation)
  ├─ "Periodized sprint peaking" (prerequisite: CNS_adaptation)
  └─ [unlock → "Elite Sprint Coaching" Skill Drop + leaderboard]
```

**Dependency Resolution**: If player attempts intermediate challenge but hasn't mastered prerequisite, feed shows prerequisite first ("You're almost ready! Solve this first...").

---

## PART 3: SPACED REPETITION & MASTERY SCORING

### A. Mastery Decay Model

**Problem**: User solves challenge once, doesn't see it again for 6 months, forgets.

**Solution**: Spaced-repetition scheduling (adapted from Anki/Supermemo algorithms)

**Model**:

```typescript
interface MasteryScore {
  conceptId: string;                   // e.g., "biomechanics:sprinting:knee_timing"
  userId: string;
  
  // Core scores
  correctCount: number;                // Times solved correctly
  attemptCount: number;                // Total attempts
  accuracy: number;                    // %
  
  // Decay calculation
  lastReviewedAt: timestamp;
  nextReviewDueAt: timestamp;          // When to resurface this challenge
  
  // Difficulty factor (from challenge metadata)
  difficultyFactor: number;            // 1.2 (easy) to 2.5 (hard)
  
  // Interval & stability
  interval_days: number;               // 1, 3, 7, 14, 30, 60, 180, 365
  stability: number;                   // Decay rate (0.5-1.5)
}
```

**Scheduling Logic**:

```
When user solves a challenge correctly:
  interval_days = interval_days × (1 + difficultyFactor)
  Example:
    Correct on Day 1 (easy challenge, difficulty 1.2)
      → interval_days = 1 × 1.2 = 1.2 → next review in ~1 day
    Correct on Day 2 (hard challenge, difficulty 2.5)
      → interval_days = 1.2 × 2.5 = 3 → next review in ~3 days

When user solves incorrectly:
  interval_days = interval_days × 0.5  (forgetting is faster than learning)
  stability = stability × 0.9  (confidence reduced)

Decay over time (if not reviewed):
  mastery_score = current_score × e^(-time_elapsed_days / stability)
  After 30 days without review: ~50% retention
  After 90 days without review: ~20% retention
```

**Feed Insertion Strategy**:

User logs in; feed algorithm pulls:
1. **Today's due** (30% of feed): Challenges due for review today
2. **New material** (40% of feed): Challenges not yet attempted, prerequisites met
3. **Trending/social** (30% of feed): Ghost matches from friends, community picks

---

### B. Mastery Thresholds & Credential Unlock

**Thresholds**:

```
Novice (1 mastered concept)
  → "Curious Learner" badge
  → +5 Creator Card XP

Intermediate (5 mastered concepts)
  → "Dedicated Student" credential
  → +50 Creator Card XP
  → Unlock "Training Theory" Skill Drop series

Advanced (15 mastered concepts)
  → "Biomechanics Expert" credential
  → +250 Creator Card XP
  → Access to elite coach feedback

Mastery Streaks:
  7-day streak: "Consistent" badge (+10 XP/day)
  30-day streak: "Obsessed" credential (+50 XP/day)
  90-day streak: "Nomad Scholar" epic credential (+200 XP)
```

**Creator Card Integration**:

```
User's Creator Card shows:
  ┌─────────────────────────────┐
  │ Educational Credentials     │
  ├─────────────────────────────┤
  │ ✓ Curious Learner (5 XP)   │
  │ ✓ Dedicated Student (50 XP)│
  │ ✓ Biomechanics Expert      │
  │   (250 XP)                  │
  │                             │
  │ Current Streak: 27 days     │
  │ Concepts Mastered: 23       │
  │ Accuracy: 87%               │
  └─────────────────────────────┘
```

---

## PART 4: INTEGRATION WITH EXISTING FEL SYSTEMS

### A. Neuro-Mechanic Mirror Reuse

**Overlap Areas**:
- Muscle anatomy diagrams (reuse from Mirror)
- Joint movement overlays (reuse from Mirror's 3D anatomical model)
- Motion capture annotations (from Mirror's athlete analysis)

**New Content**:
- Skill Drops that embed Mirror clips (seamless video-in-video)
- Challenge answers that use Mirror's interactive sliders (passive viewing → active adjustment)

**Example Integration**:
```
User sees Skill Drop: "Ankle Dorsiflexion Range"
  ↓
Video shows ankle joint with bioluminescent motion overlay
  ↓
Diagnostic: "Adjust this slider to match the dorsiflexion angle shown"
  ↓
Slider is same interactive component from Neuro-Mechanic Mirror
  ↓
User adjusts; system validates against reference range
  ↓
Mastery unlocked; credential added to Creator Card
```

**Technical Reuse**:
- 3D anatomy component library (from Mirror) → imported into Knowledge Feed
- Motion capture data (from Mirror) → keyframed challenges
- Shader/material system (bioluminescent highlighting) → consistent visual language

---

### B. Brain Brawl Async Integration

**Current Brain Brawl**: Real-time duel mode (turn-based, live opponent)

**Knowledge Feed Brain Brawl**: Async ghost match

**Shared Infrastructure**:
- Challenge database (same pool of micro-challenges)
- Scoring algorithm (same XP calculation)
- Leaderboard backend (extended for ghost match rankings)

**Bridge Mechanism**:
```
User completes 10-challenge sequence in Knowledge Feed
  ↓
Sequence is automatically recorded as a "ghost"
  ↓
Friends see: "Beat @alex_trainer's score of 8/10"
  ↓
Friend attempts ghost; if they win, Alex is notified
  ↓
Monthly leaderboard: "Most Ghost Matches Won", "Highest Accuracy", etc.
  ↓
Top players from Knowledge Feed can challenge each other in live Brain Brawl mode
```

---

### C. Creator Card Credential System

**New Credential Block**: "Educational Mastery"

```
Schema:
  credential_type: "educational"
  category: "knowledge_feed_mastery"
  
  data: {
    total_concepts_mastered: number;
    current_streak_days: number;
    accuracy_percentage: number;
    categories_completed: ["biomechanics", "neuroscience", "training_logic"];
    expert_badges: ["Biomechanics Expert", "Nomad Scholar"];
  }
  
  visibility: "public" | "private"
  updated_at: timestamp
```

**Creator Card Display**:
```
┌─────────────────────────────────────┐
│ [User Avatar] @jordan_elite         │
├─────────────────────────────────────┤
│ Sports Achievements                 │
│ - Dunk Contest Champion (1st place) │
│ - 3v3 Basketball MVP                │
│                                     │
│ Educational Credentials             │
│ - Biomechanics Expert (23 concepts) │
│ - 47-Day Learning Streak            │
│ - 89% Avg Accuracy                  │
│                                     │
│ Movement Signature                  │
│ - Vertical Jump: 38"                │
│ - Agility Score: 94                 │
└─────────────────────────────────────┘
```

---

## PART 5: TECHNICAL ARCHITECTURE

### A. Frontend (React/Next.js)

```
<KnowledgeFeed>
  ├─ FeedContainer (swipe gesture handler)
  │   ├─ MicroChallenge (animated in/out)
  │   │   ├─ MediaPlayer (video/animation)
  │   │   ├─ QuestionPrompt
  │   │   └─ AnswerInput (choice/slider/text)
  │   │
  │   ├─ SkillDrop (full-screen video + diagnostic)
  │   │   ├─ VideoPlayer (reuses Neuro-Mechanic Mirror player)
  │   │   ├─ DiagnosticChallenge
  │   │   └─ MasteryUnlock (animation)
  │   │
  │   └─ BrainBrawlGhost (challenge sequence viewer)
  │       ├─ OpponentAvatar
  │       ├─ ChallengeSequence
  │       └─ ScoreComparison
  │
  ├─ StreakCounter (persistent top bar)
  ├─ MasteryProgress (sidebar, collapsible)
  └─ NotificationCenter (friend ghost-match results)
```

**Gesture Handling**:
- Swipe down: next content
- Swipe up: previous content (allow review)
- Tap to pause video
- Double-tap to like/bookmark

---

### B. Backend (Node.js + Firestore)

```
API Endpoints:

GET /api/knowledge-feed/today
  → Returns mix: [MicroChallenge, SkillDrop, BrainBrawlGhost, ...]
  → Filtered by spaced-repetition algorithm
  → Sorted by: due_today, then new, then trending

POST /api/challenges/{challengeId}/attempt
  → Input: { user_id, answer, timestamp }
  → Validates answer
  → Returns: { correct: bool, feedback: string, xp_earned: number }
  → Updates mastery score (async)

GET /api/mastery/{conceptId}/progress
  → Returns: { accuracy, lastReviewedAt, nextReviewDueAt, streak_count }

POST /api/brain-brawl/ghost/create
  → Called after 10-challenge sequence completion
  → Records ghost for friends to challenge

GET /api/brain-brawl/ghosts/available
  → Returns list of friends' ghosts user hasn't challenged yet

PUT /api/creator-card/credentials/educational
  → Updates Educational Mastery block on Creator Card
  → Async job runs daily to aggregate mastery data
```

**Database Schema** (Firestore):

```
Collections:

challenges/
  {challengeId}/
    - title, category, difficulty
    - prompt, answerType, correctAnswer
    - masteryKey, prerequisites
    - media (URLs)

user_mastery/
  {userId}/
    {conceptId}/
      - correctCount, attemptCount, accuracy
      - lastReviewedAt, nextReviewDueAt
      - interval_days, stability

brain_brawl_ghosts/
  {ghostId}/
    - challenger_id, challenger_score
    - challenge_sequence (array of challenge IDs)
    - timestamp_created
    - completed_by (array of player IDs who attempted)

creator_card_credentials/
  {userId}/
    educational/
      - total_concepts_mastered
      - current_streak_days
      - accuracy_percentage
      - categories_completed
      - expert_badges
      - updated_at
```

---

### C. Scheduling & Spaced Repetition (Background Job)

```
Daily Job (3 AM UTC):

FOR each user:
  SELECT concepts WHERE nextReviewDueAt <= TODAY
  SELECT new_concepts WHERE prerequisites_mastered = true (limit 3-5)
  
  BUILD feed_array = [
    30% due_today_concepts,
    40% new_concepts,
    30% trending_concepts (most-shared, highest-accuracy across userbase)
  ]
  
  SHUFFLE feed_array
  CACHE in user_feed:{userId}
  PUBLISH via WebSocket (if user online)
```

---

## PART 6: CONTENT AUTHORING & GOVERNANCE

### A. Authoring Workflow

**Authors** (internal team + external subject-matter experts):
1. Biomechanics team (FEL existing domain experts)
2. Neuroscience consultants (educational partnerships)
3. Certified trainers / coaches (community contributions)

**Submission Process**:

```
Author writes challenge in YAML (or web form)
  ↓
Auto-validation: syntax, media URLs exist, mastery key matches taxonomy
  ↓
Peer review: 2x internal reviewers + 1x domain expert
  ↓
A/B test: roll out to 5% of users, track accuracy & skip rate
  ↓
If A/B metrics good (90%+ accuracy, <10% skip rate):
  Full rollout
  Else:
  Revise based on feedback
```

**Quality Metrics**:
- **Accuracy**: % of users who solve correctly (target: 70-90% for difficulty)
- **Skip rate**: % of users who skip (target: <15%)
- **Time-to-answer**: median seconds (target: 10-30s for micro-challenges)
- **Engagement**: % who share to friends (target: >5%)

---

### B. Content Lifecycle

| Stage | Duration | Action |
|-------|----------|--------|
| Draft | 1-2 weeks | Author writes, peer review |
| Staging | 1 week | Internal team tests |
| Beta | 1-2 weeks | 5% user rollout; telemetry collection |
| Live | Ongoing | Full rollout; track metrics |
| Maintenance | As-needed | Updates based on feedback; removal if <60% accuracy |

---

## PART 7: RISK ASSESSMENT

### A. Technical Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Spaced-repetition algorithm miscalibration** | High | Run simulations with test user cohort; adjust decay rates monthly based on telemetry |
| **Content authoring bottleneck** | High | Invest in template/YAML framework; onboard 2-3 domain experts by week 2 |
| **Feed algorithm serves boring mix** | Medium | A/B test feed composition; use ML to tune %new vs %due vs %trending |
| **Server load (millions of challenge attempts)** | Medium | Use read replica for mastery queries; cache feed pre-computed per user daily |
| **Churn if content feels repetitive** | Medium | Maintain 50+ concepts in pipeline; rotate new content weekly |
| **Ghost match desync (player's score vs server's)** | Low | Store complete challenge sequence snapshot at creation time; replay validates |

---

### B. Product Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **Users treat as a game, not learning** | Medium | Tie to Creator Card; emphasize long-term mastery; monthly challenges with real rewards |
| **Engagement cliff after 30 days** | Medium | Implement streaks, badges, and leaderboards; refresh content weekly |
| **Content quality inconsistency** | Medium | Strict peer review; A/B test all new challenges; remove low-accuracy content |
| **Comparison anxiety (seeing friends' streaks)** | Low | Privacy controls; option to hide stats; emphasize personal progress vs. competition |

---

## PART 8: OPEN DECISIONS

**Stakeholder approval needed on:**

1. **Content launch set**: Start with 20 challenges or wait for 100+?
   - Affects weeks 1-4 workload; more content → lower churn risk

2. **Brain Brawl ghost scope**: Async-only (v1), or add live mode in v1.1?
   - Affects social engagement; live mode requires different netcode

3. **Leaderboard scope**: Personal progress only, or peer leaderboards?
   - Affects engagement but may increase comparison anxiety

4. **Monetization**: Free for all, or paywall "Expert" tier?
   - Affects revenue but may reduce adoption

5. **Reuse depth**: Mirror-only (minimal reuse), or full component library?
   - Affects dev speed but changes technical architecture

6. **Domain experts**: Hire in-house or contract external consultants?
   - Affects hiring + content quality

---

## CONCLUSION

**Overall Scope**: Medium (4-6 months to v1.0)

**Overall Risk**: 🟡 **MEDIUM**

**High-Confidence Areas**:
- ✅ Spaced repetition algorithm (proven in Anki/Supermemo)
- ✅ Feed UX (social platform patterns well-established)
- ✅ Creator Card integration (simple data model extension)

**Moderate-Risk Areas**:
- ⚠️ Content authoring pipeline (bottleneck if not structured well)
- ⚠️ Engagement retention (new features have natural 30-day churn)
- ⚠️ Neuro-Mechanic Mirror reuse (integration complexity)

**Recommendation**: Proceed to Phase A (v1.0) with 50+ concepts ready at launch, strict peer review, and A/B testing on content quality. Monthly content refresh to prevent engagement cliff.

---

**Approved by**: [Awaiting stakeholder confirmation]  
**Date**: 2026-08-27

