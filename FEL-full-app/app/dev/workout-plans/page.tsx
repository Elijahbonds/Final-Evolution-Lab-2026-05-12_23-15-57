import { notFound } from 'next/navigation';
import { SavedPlans, WorkoutView } from '@/components/workout-view';
import { analyzeMovement, defaultMetrics } from '@/lib/workout/movement-screen';
import { generatePlan } from '@/lib/workout/plan-generator';
import { planRevisionNote, revisePlan } from '@/lib/workout/plan-revision';

export const dynamic = 'force-dynamic';

/**
 * /dev/workout-plans — MIRROR-COACH P1 (2026-09-25). Development-only view of /workout with the sale pulled, and of a
 * plan bought before today as a buyer now sees it: revised on read (no depth drop in weeks 1-4) with its note. /workout
 * itself needs a session and this lane's database is offline, so the live page here answers its plans read with an
 * error line; the fixture below is the plan the route would return. Hard 404 outside `next dev`.
 */
export default function DevWorkoutPlansPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  // A 12-week Mobility plan as the route saved it before today: week 1 Friday's second exercise was the depth drop.
  const legacy = JSON.parse(JSON.stringify(generatePlan(analyzeMovement(defaultMetrics()), 'program_12w').weeks));
  legacy[0].days[2].exercises[1] = { name: 'Depth Drop to Vertical', sets: 4, reps: '4', cue: 'Absorb soft, explode tall', targets: 'power' };
  // as an adult reads it (early depth drops swapped, later ones held) and as a youth reads it (no jumps in any week)
  const revised = revisePlan(legacy, 'adult').weeks;
  const youth = revisePlan(JSON.parse(JSON.stringify(legacy)), 'youth').weeks;
  return (
    <div className="min-h-screen bg-[#050505] pb-24">
      <WorkoutView />
      <div className="mx-auto max-w-3xl px-4">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/30">Dev fixture: a plan bought before 2026-09-25, as GET /api/v1/workout/plan returns it</p>
        <SavedPlans saved={[
          { id: 'fixture', tier: 'program_12w', focus: 'Mobility & Range', weeks: revised, revisionNote: planRevisionNote(revised) },
          { id: 'fixture-youth', tier: 'program_12w', focus: 'Mobility & Range (a reader under 18, or of unknown age)', weeks: youth, revisionNote: planRevisionNote(youth) },
        ]} />
      </div>
    </div>
  );
}
