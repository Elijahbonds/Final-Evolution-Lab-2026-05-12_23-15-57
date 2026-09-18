# FEL Program Builder - Implementation Plan

**Date**: 2026-08-27  
**Status**: Phase 1 - Coach Programming System  
**Scope**: Exercise library CRUD + Program builder + Client session view + Persistence

---

## ARCHITECTURE OVERVIEW

### Data Model (Prisma)
- `Exercise`: Reusable exercises with cues, faults, progression links
- `CoachingProgram`: Top-level program (client+coach+dates)
- `Block`: Weekly/mesocycle container (order within program)
- `Session`: Workout session within block (e.g. "Day 1 - Lower Push")
- `SessionExercise`: Exercise instance in session (sets/reps/load/tempo/rest)
- `ClientSession`: Client's execution record for a session
- `ExerciseLog`: Per-exercise log (actual sets/reps/load/RPE/notes)

### Component Structure

```
App/
├─ CoachDashboard (coach-facing)
│  ├─ ExerciseLibrary (CRUD exercises)
│  ├─ ProgramBuilder (assemble programs)
│  └─ ClientList (view all active programs)
│
├─ ClientTrainingView (client-facing)
│  ├─ TodaySession (today's workout)
│  ├─ SessionDetail (one exercise at a time)
│  └─ LogExercise (record actuals)
│
└─ Hooks
   ├─ useExerciseLibrary (fetch/create exercises)
   ├─ useProgramBuilder (manage program structure)
   └─ useClientSession (log workout)
```

### UI/UX Patterns
- **Coach Dashboard**: Tabs (Exercises | Programs | Clients)
- **Exercise Editor**: Form with cues array, faults array, video URL
- **Program Builder**: Tree view (Program → Blocks → Sessions → Exercises)
- **Drag-to-reorder**: React DnD for session/exercise ordering
- **Session Executor**: One exercise card at a time, swipe/next to progress
- **Quick-log**: Sets/Reps/Load/RPE input, visual feedback

---

## IMPLEMENTATION PHASES

### Phase 1: Core CRUD + Builder (This Session)
✅ Prisma models defined
⏳ API routes (exercises, programs, sessions)
⏳ React hooks (useExerciseLibrary, useProgramBuilder)
⏳ UI Components (ExerciseForm, ProgramBuilder, ClientSession)
⏳ Integration into Train tab

### Phase 2 (Future): Live Form Feedback
⏳ MediaPipe pose detection
⏳ Real-time deviation flags
⏳ Avatar animation playback (gated on Gate 0 fix)

### Phase 3 (Future): Analytics & Auto-progression
⏳ Session history + trends
⏳ Progression/regression logic
⏳ Client adherence tracking

---

## KEY DESIGN DECISIONS

1. **Stateless Exercise Library**: Exercises are reusable; coaches can share same exercise library
2. **Immutable Session Records**: Once ClientSession created, it's logged; no edit of past sessions
3. **JSON Flexibility**: commonFaults, primaryCues, etc. as JSON for extensibility
4. **No Real-Time Sync**: This is a "fill out after workout" tool, not live tracking
5. **Coach-Owned Data**: Exercises created by coach; programs assigned to specific clients

---

## API ENDPOINTS (to implement)

```
# Exercises
GET    /api/coach/exercises              # List my exercises
POST   /api/coach/exercises              # Create new exercise
GET    /api/coach/exercises/:id          # Get one
PUT    /api/coach/exercises/:id          # Update
DELETE /api/coach/exercises/:id          # Delete (if unused)

# Programs
GET    /api/coach/programs               # List my active programs
POST   /api/coach/programs               # Create new program
GET    /api/coach/programs/:id           # Get one with blocks/sessions/exercises
PUT    /api/coach/programs/:id           # Update metadata
DELETE /api/coach/programs/:id           # Archive

# Program Structure (Blocks/Sessions/Exercises)
POST   /api/coach/programs/:programId/blocks
PUT    /api/coach/programs/:programId/blocks/:blockId
POST   /api/coach/programs/:programId/blocks/:blockId/sessions
PUT    /api/coach/programs/:programId/blocks/:blockId/sessions/:sessionId
POST   /api/coach/programs/:programId/blocks/:blockId/sessions/:sessionId/exercises
PUT    /api/coach/programs/:programId/blocks/:blockId/sessions/:sessionId/exercises/:sessionExerciseId

# Client Session Execution
GET    /api/client/programs/:clientId    # My assigned programs
GET    /api/client/sessions/today        # Today's session
POST   /api/client/sessions/:sessionId/start     # Begin session
POST   /api/client/sessions/:sessionId/log       # Log exercise
POST   /api/client/sessions/:sessionId/complete # Mark complete
```

---

## VALIDATION RULES

- Exercise name must be unique per coach
- Program must have 1+ blocks
- Block must have 1+ sessions
- Session must have 1+ exercises
- Sets/Reps must be numeric or pattern (e.g., "8-10", "3x5")
- Load must be parseable (e.g., "225 lbs", "85% 1RM", "RPE 7")
- Tempo must be "X-X-X-X" format

---

## DUMMY DATA (for development)

```typescript
const dummyExercises = [
  { name: "Back Squat", category: "lower-body", tempo: "3-1-1-0" },
  { name: "Bench Press", category: "upper-push", tempo: "3-1-1-0" },
  { name: "Deadlift", category: "lower-body", tempo: "2-0-1-0" },
  { name: "Pull-ups", category: "upper-pull", tempo: "3-0-1-0" },
];

const dummyProgram = {
  name: "12-Week Strength Block",
  startDate: new Date(),
  durationWeeks: 12,
  blocks: [
    {
      label: "Week 1-4: Accumulation",
      sessions: [
        {
          label: "Day 1 - Lower Power",
          exercises: [
            { exerciseId: "squat", sets: 4, reps: "6-8", load: "80% 1RM", tempo: "3-1-1-0" },
            { exerciseId: "lunge", sets: 3, reps: "10", load: "35 lbs", tempo: "2-0-1-0" },
          ],
        },
      ],
    },
  ],
};
```

---

## NOTES FOR DEVELOPER

1. **Progression Links**: progressionOfId / regressionOfId allow coaches to mark "this is the easier version" for auto-swap logic (Phase 3)
2. **Coach Note Override**: Each SessionExercise can have a coachNote that overrides the default primaryCues for that specific client
3. **Client Session Immutability**: Once a ClientSession is logged, treat it as read-only for audit trail
4. **Empty Tempo Default**: If coach doesn't specify, use "3-1-1-0" (3s eccentric, 0s pause, 1s concentric, 0s pause)
5. **Phase 2 Gate**: MediaPipe integration is blocked on Gate 0 (Mixamo rig validation). Don't build pose feedback yet.

---

**Status**: Ready for implementation. Start with ExerciseLibrary component, then ProgramBuilder, then ClientSessionView.

