// mirrorToProgram — the screen writes the corrective work.
//
// THIS IS THE TIE THE WHOLE PLATFORM WAS MISSING, and it is the one thing in the competitive audit that the field
// cannot answer quickly. ATG's flagship is form coaching — a human watching uploaded video, on a delay. THP's is an
// assessment — a questionnaire, filled once, routed by hand into a pre-built cycle. Both are the same idea done by
// people: look at how the athlete moves, then program for what you saw.
//
// Here the looking is already automated (lib/mirror/screen scores a movement screen from the athlete's own camera)
// and the programming already exists (CoachingProgram → Block → Session → exercises). Nothing joined them. A coach
// could read a screen result on one page and type the corrective work into another, from memory, which is exactly
// the manual step the competition charges for.
//
// So: findings in, prescribed work out, ordered by the finding that cost the most.
//
// TWO RULES IT WILL NOT BREAK:
//
//   1. IT PRESCRIBES FROM THE COACH'S OWN CATALOGUE. No invented exercise names, no hard-coded library — the caller
//      passes what the coach actually has, and a finding with nothing to match against returns the finding with no
//      exercise rather than a made-up one. A coach who opens their program and sees a movement they have never
//      heard of stops trusting the tool.
//   2. IT IS A DRAFT, NOT A COMMIT. Every prescription carries the finding it came from so the coach can see why it
//      is there and throw it out. The Mirror suggests; the coach still writes the program.
//
// Pure: no database, no session, no fetch.
import type { CheckId } from '@/lib/mirror/assessment';
import type { ScreenResultSummary } from '@/lib/mirror/screen';

export interface CatalogueExercise { id: string; name: string; category?: string | null }

export interface Prescription {
  /** The screen check this answers. */
  findingId: string;
  /** Why it is in the program, in the coach's language. */
  because: string;
  /** The exercise from the coach's own catalogue, or null when they have nothing that matches. */
  exercise: CatalogueExercise | null;
  sets: number;
  reps: string;
  /**
   * Seconds per set when the dose is timed, else null (MIRROR-COACH P2, 2026-09-25). The single-leg dose was the
   * string "30 seconds each side" in `reps`, because a prescription had nowhere else to put a time; SessionExercise
   * has workSeconds now, so the builder can run a timer on it.
   */
  workSeconds: number | null;
  /** What to search for if there is no match — so an empty slot is actionable, not a shrug. */
  wanted: string[];
}

/** What each finding is looking for in a catalogue, most specific term first. */
const WANTED: Record<string, string[]> = {
  heelLine: ['ankle', 'calf', 'foot', 'tibialis', 'dorsiflex'],
  kneeWindow: ['glute med', 'hip abduction', 'band walk', 'clamshell', 'hip'],
  kneeTrackingL: ['glute med', 'hip abduction', 'band walk', 'clamshell', 'hip'],
  kneeTrackingR: ['glute med', 'hip abduction', 'band walk', 'clamshell', 'hip'],
  hipLevel: ['single leg', 'split squat', 'step up', 'hip hike', 'hip'],
  symmetry: ['single leg', 'split squat', 'step up', 'hip'],
  shoulderLevel: ['thoracic', 'rotation', 'rib', 'breath'],
  ribAngle: ['breath', 'exhale', 'dead bug', 'core'],
  headFloat: ['thoracic', 'chin', 'neck', 'extension', 'row'],
  trunk: ['core', 'dead bug', 'plank', 'anti-extension'],
  depth: ['ankle', 'hip mobility', 'goblet squat', 'squat'],
  singleLeg: ['single leg', 'balance', 'step down', 'hip'],
  pelvicTilt: ['hip flexor', 'pelvic', 'dead bug', 'core'],
  thoracicRotation: ['thoracic', 'rotation', 'open book'],
};

/** How the corrective is dosed. Low and daily beats heavy and occasional for this work. */
const DOSE: Record<string, { sets: number; reps: string; workSeconds?: number }> = {
  heelLine: { sets: 3, reps: '12 slow' },
  kneeWindow: { sets: 3, reps: '12 each side' },
  kneeTrackingL: { sets: 3, reps: '12 left' },
  kneeTrackingR: { sets: 3, reps: '12 right' },
  hipLevel: { sets: 3, reps: '8 each side' },
  symmetry: { sets: 3, reps: '8 each side' },
  shoulderLevel: { sets: 2, reps: '10 each way' },
  ribAngle: { sets: 3, reps: '5 long exhales' },
  headFloat: { sets: 2, reps: '10' },
  trunk: { sets: 3, reps: '8' },
  depth: { sets: 3, reps: '10' },
  singleLeg: { sets: 3, reps: '30 s each side', workSeconds: 30 },
  pelvicTilt: { sets: 2, reps: '10' },
  thoracicRotation: { sets: 2, reps: '8 each side' },
};

const DEFAULT_DOSE = { sets: 3, reps: '10' };

/** Pick the best match for a finding out of the coach's catalogue. Name first, then category, then nothing. */
export function matchExercise(wanted: readonly string[], catalogue: readonly CatalogueExercise[]): CatalogueExercise | null {
  for (const term of wanted) {
    const t = term.toLowerCase();
    const byName = catalogue.find((e) => e.name.toLowerCase().includes(t));
    if (byName) return byName;
  }
  for (const term of wanted) {
    const t = term.toLowerCase();
    const byCat = catalogue.find((e) => (e.category ?? '').toLowerCase().includes(t));
    if (byCat) return byCat;
  }
  return null;
}

/**
 * Turn a scored screen into a draft of corrective work.
 *
 * Order is the screen's own: the worst finding first, because a coach reading this should see the thing that matters
 * at the top of the block. `max` bounds it — three correctives an athlete does beats nine they skip.
 */
export function prescribeFromScreen(
  summary: Pick<ScreenResultSummary, 'meaning' | 'suggestions'> & { findings: readonly { checkId: string; grade: string; side?: 'left' | 'right' }[] },
  catalogue: readonly CatalogueExercise[],
  max = 3,
): Prescription[] {
  const ranked = [...summary.findings]
    .filter((f) => f.grade === 'fail' || f.grade === 'borderline')
    .sort((a, b) => {
      if (a.grade !== b.grade) return a.grade === 'fail' ? -1 : 1;   // fails before borderlines
      return (b.side ? 1 : 0) - (a.side ? 1 : 0);                    // one-sided before bilateral
    });

  const out: Prescription[] = [];
  const used = new Set<string>();
  for (const f of ranked) {
    if (out.length >= max) break;
    const wanted = WANTED[f.checkId] ?? [];
    const match = matchExercise(wanted, catalogue.filter((e) => !used.has(e.id)));
    if (match) used.add(match.id);
    const dose = DOSE[f.checkId] ?? DEFAULT_DOSE;
    out.push({
      findingId: f.checkId,
      because: f.side
        ? `From the screen: ${label(f.checkId)} failed on the ${f.side} side.`
        : `From the screen: ${label(f.checkId)} came back ${f.grade}.`,
      exercise: match,
      sets: dose.sets,
      reps: dose.reps,
      workSeconds: dose.workSeconds ?? null,
      wanted,
    });
  }
  return out;
}

function label(checkId: string): string {
  const named: Record<string, string> = {
    heelLine: 'the heel line', kneeWindow: 'knee tracking', kneeTrackingL: 'left knee tracking',
    kneeTrackingR: 'right knee tracking', hipLevel: 'hip level', shoulderLevel: 'shoulder level',
    ribAngle: 'the rib angle', headFloat: 'head float', singleLeg: 'the single-leg test',
    symmetry: 'side-to-side symmetry', trunk: 'trunk position', depth: 'squat depth',
    pelvicTilt: 'pelvic tilt', thoracicRotation: 'thoracic rotation',
  };
  return named[checkId] ?? checkId;
}

export type { CheckId };
