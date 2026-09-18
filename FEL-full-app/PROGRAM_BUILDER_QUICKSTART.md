# Program Builder — Quick Start Integration Guide

**Estimated Time**: 30 minutes

---

## STEP 1: Database Migration

```bash
# Run Prisma migration to create all Program Builder tables
npx prisma migrate dev --name add_program_builder

# Seed dummy data (optional)
npx prisma db seed
```

**What it creates**:
- `Exercise` table (coach exercises library)
- `CoachingProgram` table (programs assigned to clients)
- `Block` table (weekly groupings)
- `Session` table (workout sessions)
- `SessionExercise` table (exercise instances)
- `ClientSession` table (execution records)
- `ExerciseLog` table (logged actuals)

---

## STEP 2: Replace Training Tab Component

**File**: `app/play/training/_components/loader.tsx` (or equivalent)

**Current**:
```typescript
import { TrainingGame } from '@/components/games/training-game';

export function TrainingLoader() {
  return <TrainingGame />;
}
```

**Replace with**:
```typescript
import { TrainingTab } from '@/components/training/TrainingDashboard';

export function TrainingLoader() {
  return <TrainingTab />;
}
```

---

## STEP 3: Verify Auth Context

**File**: `app/api/coach/exercises/route.ts` (or your auth check)

The API expects `next-auth` to be available. Verify your setup:

```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const session = await getServerSession(authOptions);
if (!session?.user?.id) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

If you're using a different auth system, update the hook:

```typescript
// lib/hooks/useExerciseLibrary.ts
const session = useMyAuthContext(); // or useUser() if using different provider
```

---

## STEP 4: Test Locally

```bash
# Start dev server
npm run dev

# Navigate to Training tab in FEL shell
# Should see: Exercise Library | Build Program | My Clients tabs

# Try creating an exercise:
1. Click "Add Exercise"
2. Fill form: name="Back Squat", category="lower-body"
3. Click "Save Exercise"
4. Verify it appears in list
```

---

## STEP 5: Check for Missing Dependencies

**If you see component errors**, ensure Shadcn/UI is installed:

```bash
# Add missing UI components if needed
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add input
npx shadcn-ui@latest add tabs
npx shadcn-ui@latest add badge
```

---

## STEP 6: Verify API Integration

**Test endpoint connectivity**:

```bash
# In browser console or Postman
fetch('/api/coach/exercises', { method: 'GET' })
  .then(r => r.json())
  .then(console.log)
  .catch(console.error);

# Should return: [ { id, name, category, ... }, ... ]
```

---

## STEP 7: Quick Feature Test

**Exercise Library**:
- [ ] Add exercise (fills form, saves)
- [ ] Delete exercise (shows in list, delete removes it)
- [ ] List filters by category (visual grouping)

**Program Editor** (stub):
- [ ] Create program form appears
- [ ] Fields save (no data persistence yet)

**Client Session**:
- [ ] "Start Workout" shows today's session
- [ ] Navigate exercises with Previous/Next
- [ ] Log actuals form captures inputs

---

## TROUBLESHOOTING

### "Unauthorized" Error
→ Check that `getServerSession(authOptions)` is available  
→ Verify user is logged in to FEL  
→ Check `.env.local` has `NEXTAUTH_SECRET` set  

### "Cannot find module" Errors
→ Run `npm install` to ensure all dependencies installed  
→ Restart dev server after adding Shadcn components  

### Styling Looks Broken
→ Verify Tailwind CSS is configured  
→ Check `tailwind.config.ts` includes `components/` and `lib/` paths  

### API Calls 404
→ Verify routes exist: `app/api/coach/exercises/route.ts`  
→ Check route file has `GET` and `POST` functions exported  

---

## NEXT STEPS (Phase 2)

Once integration is complete:

1. **Run Tests**
   ```bash
   npm test -- useExerciseLibrary
   npm test -- ExerciseLibrary.tsx
   ```

2. **Build Full Program Tree**
   - Implement `ProgramEditor` with blocks/sessions/exercises
   - Add drag-and-drop reordering
   - Wire program creation to API

3. **Add Session Execution**
   - Wire `ClientSessionView` to real session data
   - Implement logging to `ExerciseLog` table
   - Add session completion notifications

4. **LiveFeedback** (after Gate 0 verified)
   - Integrate MediaPipe pose detection
   - Use Neuro-Mechanic Mirror for form cues
   - Add deviation flagging to logs

---

## FILES TO REFERENCE

- Implementation Plan: `PROGRAM_BUILDER_IMPLEMENTATION_PLAN.md`
- Phase 1 Summary: `PROGRAM_BUILDER_PHASE1_COMPLETE.md`
- Prisma Schema: `prisma/schema.prisma` (Exercise model onward)
- API Routes: `app/api/coach/exercises/*`

---

**Status**: Ready for integration. Follow steps 1-4 for a working MVP.

