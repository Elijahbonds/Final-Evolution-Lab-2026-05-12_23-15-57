// protocol — the jump screen's test battery, T1–T7, and which of them each mode runs (spec §2, §4; owner default Q2).
//
// OWNER DEFAULT Q2 (lane brief, 2026-09-28): the seven-test lineup IS the protocol. All seven are defined here so a
// stored result, the docs and a later Full screen all name the same tests the same way. The Quick Screen runs T1, T2,
// T3 and T5 and grades them in this lane; T4, T6 and T7 are listed but `notBuilt` — the UI shows "Full screen: coming
// later" rather than a grader that does not exist.
//
// Pure data.
import { PROTOCOL_VERSION, th } from './thresholds';

export type TestId = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7';
export type AssessMode = 'quick' | 'full';
export type Side = 'left' | 'right';
/** Which way the athlete faces the camera. 'front+side' = T1: front reps, then side reps. */
export type TestView = 'front' | 'side' | 'front+side';

export interface ProtocolTest {
  id: TestId;
  name: string;
  /** Short name for chips and mini-results. */
  short: string;
  view: TestView;
  /** Run once per side, left then right. */
  sided: boolean;
  /** Reps (or jumps) asked for, per view or per side. */
  reps: number;
  modes: readonly AssessMode[];
  /** Listed, not graded in this lane. */
  notBuilt: boolean;
  /** Setup instruction, said once before the countdown. Position only: scoring reps are never coached (spec §8). */
  setup: string;
  specSection: string;
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** "three", for a setup line that says how many reps (the count is the register's, so the words follow it). */
export const countWord = (n: number): string => WORDS[n] ?? String(n);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const PROTOCOL: readonly ProtocolTest[] = [
  {
    id: 'T1', name: 'Overhead squat', short: 'Overhead squat', view: 'front+side', sided: false, reps: th('t1.reps'),
    modes: ['quick', 'full'], notBuilt: false, specSection: '§4 T1',
    setup: `Feet about shoulder-width, arms straight overhead. Squat as deep as you can, ${countWord(th('t1.reps'))} times, at your own pace.`,
  },
  {
    id: 'T2', name: 'Ankle dorsiflexion (knee to wall)', short: 'Ankle range', view: 'side', sided: true, reps: th('t2.reps'),
    modes: ['quick', 'full'], notBuilt: false, specSection: '§4 T2',
    setup: `Step one foot forward, heel flat. Drive that knee forward as far as it goes with the heel down, then back. ${cap(countWord(th('t2.reps')))} times.`,
  },
  {
    id: 'T3', name: 'Single-leg squat', short: 'Single-leg squat', view: 'front', sided: true, reps: th('t3.reps'),
    modes: ['quick', 'full'], notBuilt: false, specSection: '§4 T3',
    setup: `Stand on one leg, the other foot just off the floor, hands on your hips. Squat down about a third of the way, ${countWord(th('t3.reps'))} times.`,
  },
  {
    id: 'T4', name: 'Hip hinge', short: 'Hip hinge', view: 'side', sided: false, reps: 5,
    modes: ['full'], notBuilt: true, specSection: '§4 T4',
    setup: 'Hinge at the hips, soft knees, five times.',
  },
  {
    id: 'T5', name: 'Countermovement jump', short: 'Jump', view: 'front', sided: false, reps: th('t5.reps'),
    modes: ['quick', 'full'], notBuilt: false, specSection: '§4 T5',
    // OWNER DEFAULT Q3: hands on hips, the standard; the arm-swing variant is not built
    setup: `Hands on your hips the whole time. Dip and jump as high as you can, land, and stand still. ${cap(countWord(th('t5.reps')))} jumps.`,
  },
  {
    id: 'T6', name: 'Drop landing → drop jump', short: 'Drop landing', view: 'front', sided: false, reps: 3,
    modes: ['full'], notBuilt: true, specSection: '§4 T6',
    setup: 'Step off a 30 cm box and stick the landing.',
  },
  {
    id: 'T7', name: 'Single-leg hop & stick', short: 'Hop & stick', view: 'front', sided: true, reps: 3,
    modes: ['full'], notBuilt: true, specSection: '§4 T7',
    setup: 'Hop on one leg and stick the landing for two seconds.',
  },
];

export const QUICK_TESTS: readonly TestId[] = ['T1', 'T2', 'T3', 'T5'];
export const FULL_TESTS: readonly TestId[] = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const BY_ID = new Map(PROTOCOL.map((t) => [t.id, t]));

export function testDef(id: TestId): ProtocolTest {
  const t = BY_ID.get(id);
  if (!t) throw new Error(`[assess] no test ${id}`);
  return t;
}

/** The tests a mode lists, in protocol order. */
export function testsFor(mode: AssessMode): ProtocolTest[] {
  return PROTOCOL.filter((t) => t.modes.includes(mode));
}

/** The tests a mode can actually run and grade today. */
export function runnableTests(mode: AssessMode): ProtocolTest[] {
  return testsFor(mode).filter((t) => !t.notBuilt);
}

/** What a listed-but-unbuilt test says on screen. */
export const NOT_BUILT_LINE = 'Full screen: coming later';

export const SIDES: readonly Side[] = ['left', 'right'];
export const sideLabel = (s: Side): string => (s === 'left' ? 'Left' : 'Right');

/** The cue for which way to face (screen.ts TURN_CUE's wording, with the side a sided side-view test needs). */
export function facingCue(view: 'front' | 'side', side?: Side): string {
  if (view === 'front') return 'Face the camera.';
  return side === 'right' ? 'Turn side-on, right side to the camera.' : 'Turn side-on, left side to the camera.';
}

export { PROTOCOL_VERSION };
