// The fixture behind /dev/coach-prescribe and scripts/probes/_mirror-p3-coach-prescribe-proof.ts (MIRROR-COACH P3,
// 2026-09-26). Pure. A coach's tagged catalogue (the knowledge-base items as the P2 bridge tags them, lib/coach/kbTags.ts,
// plus three lifts), a one-week program, and a client's stored screens made the way POST /api/mirror/screen makes them:
// grader summary numbers → decideScreenPost (the server's re-check) → storedScreen. Nothing here is a second
// implementation of a rule; it only chooses the numbers.
import { decideScreenPost } from '@/lib/mirror/screenClaims';
import { storedScreen } from '@/lib/mirror/screenStore';
import { regradeFromSummary, type StationGrade } from '@/lib/mirror/stationGraders';
import type { ScreenId } from '@/lib/mirror/screen';

export const DEV_CASES = ['flags', 'clear', 'retest', 'newer-ungraded'] as const;
export type DevCase = (typeof DEV_CASES)[number];
export const isDevCase = (x: unknown): x is DevCase => typeof x === 'string' && (DEV_CASES as readonly string[]).includes(x);

export const COACH = 'dev-coach';
export const CLIENT = 'dev-client';

/** The coach's catalogue: tagged rows, one untagged row, and a lift whose NAME says hip but whose tags say hinge. */
export const FIXTURE_CATALOGUE = [
  { id: 'pe-tripod', name: 'Tripod Foot', category: 'mobility', pattern: 'other', skillLayer: 'tripod', braceMode: 'none', defaultTempo: '0-0-0-0' },
  { id: 'pe-ankle', name: 'Ankle Circles', category: 'mobility', pattern: 'mobility', skillLayer: 'joints', braceMode: 'none', defaultTempo: '0-0-0-0' },
  { id: 'pe-hip9090', name: 'Hip Circles (90/90)', category: 'mobility', pattern: 'mobility', skillLayer: 'joints', braceMode: 'none', defaultTempo: '0-0-0-0' },
  { id: 'pe-d360', name: '360 Diaphragm Breathing', category: 'breath', pattern: 'breath', skillLayer: 'cylinder', braceMode: 'none', defaultTempo: '0-0-0-0' },
  { id: 'pe-split', name: 'Split squat', category: 'lower-body', pattern: 'lunge', skillLayer: 'strength', braceMode: 'set', defaultTempo: '3-1-1-0' },
  { id: 'pe-goblet', name: 'Goblet squat', category: 'lower-body', pattern: 'squat', skillLayer: 'strength', braceMode: 'set', defaultTempo: '3-1-1-0' },
  { id: 'pe-thrust', name: 'Hip thrust', category: 'lower-body', pattern: 'hinge', skillLayer: 'strength', braceMode: 'set', defaultTempo: '2-1-1-0' },
  { id: 'pe-clam', name: 'Banded clamshell', category: 'hip', pattern: null, skillLayer: null, braceMode: null, defaultTempo: '3-1-1-0' },
] as const;

/** Grader summaries the real grader reads as a pass, one per camera slot. */
const PASS = {
  heelLine: { checkId: 'heelLine', value: 2, bySide: { left: 2, right: 1 }, unit: 'deg', frames: 360, readableFrames: 360, uncertainty: 0.5, spread: 4, stationId: 'heels' },
  kneeWindow: { checkId: 'kneeWindow', value: 0.05, bySide: { left: 0.05, right: 0.02 }, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.01, spread: 0.1, stationId: 'frontStack' },
  hipLevel: { checkId: 'hipLevel', value: 0.01, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.005, spread: 0.02, stationId: 'frontStack' },
  shoulderLevel: { checkId: 'shoulderLevel', value: -0.01, unit: 'ratio', frames: 420, readableFrames: 420, uncertainty: 0.005, spread: 0.02, stationId: 'frontStack' },
  headFloat: { checkId: 'headFloat', value: 0.02, unit: 'ratio', frames: 300, readableFrames: 300, uncertainty: 0.005, spread: 0.02, stationId: 'profile' },
  singleLegL: { checkId: 'singleLeg', value: 0.03, unit: 'px-norm', frames: 900, readableFrames: 900, uncertainty: 0.01, spread: null, touchDowns: 0, stanceSec: 28, side: 'left', stationId: 'wobbleL' },
  singleLegR: { checkId: 'singleLeg', value: 0.04, unit: 'px-norm', frames: 900, readableFrames: 900, uncertainty: 0.01, spread: null, touchDowns: 0, stanceSec: 28, side: 'right', stationId: 'wobbleR' },
} as const;
type Key = keyof typeof PASS;
const UNREAD = { readableFrames: 4, value: null, uncertainty: null, spread: null, bySide: undefined };

/** What each case changes from an all-pass screen. */
const CASES: Record<Exclude<DevCase, 'newer-ungraded'>, { screen: ScreenId; over: Partial<Record<Key, Record<string, unknown>>>; answers: { questionId: string; answer: string }[] }> = {
  // the right hip reads higher, the left shoulder reads higher, the right leg swayed, and the head was not read
  flags: {
    screen: 'full',
    over: { hipLevel: { value: -0.12 }, shoulderLevel: { value: 0.1 }, singleLegR: { value: 0.2 }, headFloat: UNREAD },
    answers: [{ questionId: 'lowerRibsWiden', answer: 'notSure' }],
  },
  clear: { screen: 'modified', over: {}, answers: [] },
  retest: { screen: 'modified', over: { headFloat: UNREAD, heelLine: UNREAD }, answers: [{ questionId: 'neckShouldersLift', answer: 'no' }] },
};

function summaries(over: Partial<Record<Key, Record<string, unknown>>>) {
  return (Object.keys(PASS) as Key[]).map((k) => {
    const body = { ...PASS[k], ...(over[k] ?? {}) };
    return { ...body, status: regradeFromSummary(body)!.status };
  });
}

/** One stored screen, exactly as the screen route stores it. */
function storedRow(screenId: string, screen: ScreenId, checks: unknown[], answers: unknown[]) {
  const d = decideScreenPost({ screenId, screen, checks, answers }, CLIENT);
  if (!d.ok) throw new Error(`fixture screen refused: ${JSON.stringify(d.body)}`);
  return JSON.parse(JSON.stringify(storedScreen(d.screenId, d.screen, d.outcome.results, d.summary, {
    camera: d.outcome.camera, provisional: d.outcome.provisional, selfReport: d.answers,
  })));
}

/**
 * The case's stored screens (newest first, the way the route reads them) and the phone's own grades for the athlete's
 * view. 'newer-ungraded' is the 'flags' screen with a newer run on top that the camera read nothing of.
 */
export function fixtureScreens(c: DevCase): { rows: { metrics: unknown; createdAt: string }[]; grades: StationGrade[]; screen: ScreenId } {
  const base = CASES[c === 'newer-ungraded' ? 'flags' : c];
  const checks = summaries(base.over);
  const grades = checks.map((x) => regradeFromSummary(x)!);
  const rows = [{ metrics: storedRow(`dev-${c}`, base.screen, checks, base.answers), createdAt: '2026-09-26T09:00:00.000Z' }];
  if (c === 'newer-ungraded') {
    const nothing = summaries(Object.fromEntries((Object.keys(PASS) as Key[]).map((k) => [k, UNREAD])));
    rows.unshift({ metrics: storedRow('dev-newer', base.screen, nothing, []), createdAt: '2026-09-26T11:30:00.000Z' });
  }
  return { rows, grades, screen: base.screen };
}

/** The program the coach adds into: one week, two sessions, a key lift on day 1. */
export const FIXTURE_PROGRAM = {
  coachId: COACH, clientId: CLIENT, name: 'Base block', startDate: new Date('2026-09-28T00:00:00.000Z'),
  blocks: { create: [{ order: 1, label: 'Week 1', sessions: { create: [
    { order: 1, label: 'Day 1', exercises: { create: [{ exerciseId: 'pe-goblet', order: 1, section: 'key', isKeySet: true, sets: 4, reps: '6', load: 'RPE7' }] } },
    { order: 2, label: 'Day 2' },
  ] } }] },
};
