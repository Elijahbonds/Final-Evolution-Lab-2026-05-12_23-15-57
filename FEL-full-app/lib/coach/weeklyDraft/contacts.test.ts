// YOUTH-CONTACT-CAP (2026-10-26): jump contacts per session under youth rules, more reps as an increase, no added sets
// on a max-effort isometric for a teen, and the dunk program's isometric cue in the youth cue filter.
// Spec: fel-specs/YOUTH-RULE-CHECK-26c1b4ab-2026-10-24.md items 1 and 2. The DRAFT path (the real rules engine) and the
// pure COACH-EDIT path (approve.ts withEdits → classify) are both here; approve.youthContacts.test.ts runs the edit
// through decideChange end to end.
import { describe, expect, it } from 'vitest';
import { MAX_EFFORT_CUE, youthSafeCues } from '../taxonomy';
import { withEdits } from './approve';
import { contactProblem, contactsPerSet, isMaxEffortIsometric, repsUp, sessionContacts } from './contacts';
import { draftForClient } from './rules';
import { classify, type SafetyContext } from './safety';
import { MAX_TEEN_SESSION_CONTACTS } from './thresholds';
import type { DraftCatalogueRow, DraftChange, DraftOp, OpFields } from './types';
import { CATALOGUE, adult, exposure, program } from '@/tests/helpers/weeklyDraftFixtures';

const EXTRA: DraftCatalogueRow[] = [
  { id: 'pe-line', name: 'Line hops', category: 'plyometric', pattern: 'locomotion', skillLayer: 'jump-land', regressionOfId: null, progressionOfId: null },
  { id: 'pe-iso', name: 'Overcoming isometric split squat', category: 'lower-body', pattern: 'lunge', skillLayer: 'strength', regressionOfId: null, progressionOfId: null },
  { id: 'pe-isomax', name: 'Max isometric mid-thigh pull', category: 'lower-body', pattern: 'hinge', skillLayer: 'strength', regressionOfId: null, progressionOfId: null },
];
const CAT = [...CATALOGUE, ...EXTRA];
const catMap = new Map(CAT.map((r) => [r.id, r]));
const upd = (c: DraftChange) => c.ops.filter((o): o is Extract<DraftOp, { action: 'update' }> => o.action === 'update');
const ctx = (o: Partial<SafetyContext> = {}): SafetyContext => ({
  youth: true, painOpen: false, availability: null, lowCompliance: false, easierWeek: false, formDropPatterns: new Set(), catalogue: catMap, ...o,
});
const f = (exerciseId: string, o: Partial<OpFields> = {}): OpFields => ({ exerciseId, exerciseName: catMap.get(exerciseId)!.name, sets: 3, reps: '10 contacts', load: '', effortBand: null, ...o });
const op = (before: OpFields, after: OpFields, sessionId = 'A2'): DraftOp => ({ action: 'update', sessionExerciseId: `${sessionId}-${before.exerciseId}`, sessionId, sessionLabel: 'Day 1 — Lower', before, after });
const pogoTop = [exposure('pe-pogo', 2, [10, 10, 10], 6, { reps: '8-10', load: '' }), exposure('pe-pogo', 9, [10, 10, 10], 6, { reps: '8-10', load: '' })];

/** Week 2's Day 1 with Pogo hops moved to Key at 3 × 8-10 (the probe's setup), and anything else the test adds. */
function teenTree(extra: { exerciseId: string; o: Record<string, unknown> }[] = []) {
  const tree = program();
  const a2 = tree.tree.blocks[1].sessions[0];
  const pogo = a2.exercises[1];
  pogo.section = 'key'; pogo.reps = '8-10';
  for (const x of extra) a2.exercises.push({ ...a2.exercises[0], id: `A2-${x.exerciseId}`, exerciseId: x.exerciseId, name: catMap.get(x.exerciseId)!.name, ...x.o });
  return tree;
}

describe('counting contacts', () => {
  it('reads the top of the range, a plain count, "3x10", and doubles each side; timed and distance work is not counted', () => {
    expect(contactsPerSet('8-10')).toBe(10);
    expect(contactsPerSet('10 contacts')).toBe(10);
    expect(contactsPerSet('25 contacts')).toBe(25);
    expect(contactsPerSet('3x10')).toBe(10);
    expect(contactsPerSet('5 each leg')).toBe(10);
    expect(contactsPerSet('30 s')).toBeNull();
    expect(contactsPerSet('20 m')).toBeNull();
    expect(contactsPerSet('AMRAP')).toBeNull();
  });

  it('a session counts only protocol-gated rows, sets × contacts per set', () => {
    expect(sessionContacts([f('pe-pogo', { sets: 3, reps: '10 contacts' }), f('pe-line', { sets: 3, reps: '8' }), { exerciseId: 'pe-tbdl', sets: 3, reps: '8-10' }], catMap)).toBe(54);
    expect(MAX_TEEN_SESSION_CONTACTS).toBe(55);
  });
});

describe('more reps is an increase (safety.ts readOp)', () => {
  it('an adult edit that only raises reps is a progression ("review"), not "safe"', () => {
    const c = { exerciseName: 'Trap-bar deadlift', ops: [op(f('pe-tbdl', { reps: '8-10', load: '60 kg' }), f('pe-tbdl', { reps: '10-12', load: '60 kg' }))] };
    expect(classify(c, ctx({ youth: false })).safety).toBe('review');
    expect(repsUp('8-10', '10-12')).toBe(true);
    expect(repsUp('30 s', '40 s')).toBe(true);
    expect(repsUp('10-12', '8-10')).toBe(false);
  });

  it('more reps is held in a lighter week, as more sets is', () => {
    const c = { exerciseName: 'Trap-bar deadlift', ops: [op(f('pe-tbdl', { reps: '8-10', load: '60 kg' }), f('pe-tbdl', { reps: '12', load: '60 kg' }))] };
    expect(classify(c, ctx({ youth: false, easierWeek: true })).safety).toBe('unsafe');
  });
});

describe('DRAFT path: a teen session never goes past the contact cap', () => {
  it('Pogo hops 3 → 4 sets of 8-10 (30 → 40 contacts, under the cap) is HELD: no teen jump increase is ever drafted (PM ruling)', () => {
    const d = draftForClient(adult({ band: 'teen', pain: null, program: teenTree(), exposures: pogoTop }));
    expect(d.changes.find((x) => x.exerciseName === 'Pogo hops')).toBeUndefined();
    expect(d.held.find((x) => /Pogo hops/.test(x.title))?.why).toBe('Under 18: a draft never adds jump sets or reps. More jumps are your call: add them by hand if you want them.');
  });

  it('the same 3 → 4 sets for an adult is offered for review', () => {
    const c = draftForClient(adult({ program: teenTree(), exposures: pogoTop })).changes.find((x) => x.exerciseName === 'Pogo hops')!;
    expect(c).toMatchObject({ kind: 'progress_volume', safety: 'review' });
    expect(upd(c)[0].after).toMatchObject({ sets: 4, reps: '8-10' });
  });

  it('Pogo hops 3 → 4 sets when the session already holds 54 contacts (→ 64) is HELD, with the count and the cap', () => {
    const d = draftForClient(adult({
      band: 'teen', pain: null, catalogue: CAT, exposures: pogoTop,
      program: teenTree([{ exerciseId: 'pe-line', o: { section: 'prime', sets: 3, reps: '8 contacts', load: '' } }]),
    }));
    expect(d.changes.find((x) => x.exerciseName === 'Pogo hops')).toBeUndefined();
    const h = d.held.find((x) => /Pogo hops/.test(x.title))!;
    expect(h.why).toMatch(/Under 18: Day 1 — Lower would come to 64 jump contacts/);
    expect(h.why).toMatch(/55 or fewer/);
  });

  it('the same session for an adult is not capped', () => {
    const d = draftForClient(adult({
      catalogue: CAT, exposures: pogoTop,
      program: teenTree([{ exerciseId: 'pe-line', o: { section: 'prime', sets: 3, reps: '8 contacts', load: '' } }]),
    }));
    expect(d.held.find((x) => /Pogo hops/.test(x.title))).toBeUndefined();
  });

  it('a change that lowers a teen session over the cap is never blocked by it', () => {
    const c = { exerciseName: 'Pogo hops', ops: [op(f('pe-pogo', { sets: 4, reps: '20 contacts' }), f('pe-pogo', { sets: 3, reps: '20 contacts' }))] };
    expect(classify(c, ctx({ sessionContacts: { A2: 80 } })).safety).toBe('safe');
  });
});

describe('COACH-EDIT path: an edit is judged by the contacts it writes', () => {
  const drafted: DraftChange = {
    id: 'progress_volume-x', kind: 'progress_volume', exerciseName: 'Pogo hops', title: 'Pogo hops: 3 → 4 sets', reason: '', evidence: [], confidence: 'high',
    safety: 'review', method: null, ops: [op(f('pe-pogo'), f('pe-pogo', { sets: 4 }))], clientLine: null, sensitive: false, priority: 20,
  };

  it('the probe case: a teen edit to 4 × "25 contacts" (100 contacts) is unsafe, where it was "review"', () => {
    const edited = withEdits(drafted, [{ sets: 4, reps: '25 contacts' }]);
    expect(classify(edited, ctx())).toEqual({ safety: 'unsafe', why: expect.stringMatching(/Under 18: Day 1 — Lower would come to 100 jump contacts/) });
    // under the cap (48) a teen jump increase is still held; over it (with the session read fresh) the count is said
    expect(classify(withEdits(drafted, [{ sets: 4, reps: '12' }]), ctx({ sessionContacts: { A2: 30 } })).why).toMatch(/never adds jump sets or reps/);
    expect(classify(withEdits(drafted, [{ sets: 4, reps: '12' }]), ctx({ sessionContacts: { A2: 54 } })).why).toMatch(/would come to 72 jump contacts/);
  });

  it('raising only the reps on a teen jump row past the cap is unsafe too', () => {
    expect(classify(withEdits(drafted, [{ sets: 3, reps: '20 contacts' }]), ctx()).safety).toBe('unsafe'); // 60
  });

  it('an edit to reps FEL cannot count on teen jump work is refused, with how to write it', () => {
    expect(classify(withEdits(drafted, [{ sets: 4, reps: 'AMRAP' }]), ctx()).why).toMatch(/can't count the jump contacts/);
    expect(contactProblem(withEdits(drafted, [{ sets: 4, reps: 'AMRAP' }]).ops, catMap)).not.toBeNull();
  });
});

describe('teen guard: no added sets on a max-effort isometric', () => {
  const isoTop = (id: string, load: string) => [exposure(id, 2, [3, 3, 3], 6, { reps: '3', load }), exposure(id, 9, [3, 3, 3], 6, { reps: '3', load })];
  const isoTree = (id: string, load: string) => teenTree([{ exerciseId: id, o: { section: 'key', sets: 3, reps: '3', load } }]);

  it('a coach-written max-effort isometric (RPE 10, or "max" in its name) gets no draft set for a teen: held', () => {
    for (const [id, load] of [['pe-iso', 'RPE10'], ['pe-isomax', '']] as const) {
      const d = draftForClient(adult({ band: 'teen', pain: null, catalogue: CAT, program: isoTree(id, load), exposures: isoTop(id, load) }));
      expect(d.changes.find((x) => x.exerciseName === catMap.get(id)!.name)).toBeUndefined();
      expect(d.held.find((x) => x.title.startsWith(catMap.get(id)!.name))?.why).toMatch(/max-effort isometric\. Under 18 it gets no more sets/);
    }
  });

  it('a moderate isometric still gets its set for a teen, and an adult’s max-effort isometric is not held by this rule', () => {
    const teen = draftForClient(adult({ band: 'teen', pain: null, catalogue: CAT, program: isoTree('pe-iso', 'RPE6'), exposures: isoTop('pe-iso', 'RPE6') }));
    expect(teen.changes.find((x) => x.exerciseName === 'Overcoming isometric split squat')).toMatchObject({ kind: 'progress_volume', safety: 'review' });
    const grown = classify({ exerciseName: 'Max isometric mid-thigh pull', ops: [op(f('pe-isomax', { reps: '3' }), f('pe-isomax', { reps: '3', sets: 4 }))] }, ctx({ youth: false }));
    expect(grown.safety).toBe('review');
  });

  it('reads a max-effort isometric from its band, its RPE or its words', () => {
    expect(isMaxEffortIsometric(f('pe-iso', { effortBand: 'full' }), catMap.get('pe-iso'))).toBe(true);
    expect(isMaxEffortIsometric(f('pe-iso', { load: 'RPE 10' }), catMap.get('pe-iso'))).toBe(true);
    expect(isMaxEffortIsometric(f('pe-iso', { load: 'all-out' }), catMap.get('pe-iso'))).toBe(true);
    expect(isMaxEffortIsometric(f('pe-iso', { load: 'RPE6' }), catMap.get('pe-iso'))).toBe(false);
    expect(isMaxEffortIsometric(f('pe-tbdl', { load: 'RPE10' }), catMap.get('pe-tbdl'))).toBe(false); // not an isometric
  });
});

describe('isometric and max-effort words match in any case', () => {
  it('ISOMETRIC, Overcoming Iso, MAX', () => {
    const row = (name: string, category = 'lower-body'): DraftCatalogueRow => ({ id: 'x', name, category, pattern: null, skillLayer: 'strength', regressionOfId: null, progressionOfId: null });
    const at = (name: string, load: string) => f('pe-iso', { exerciseName: name, load });
    expect(isMaxEffortIsometric(at('ISOMETRIC WALL PUSH', 'MAX'), row('ISOMETRIC WALL PUSH'))).toBe(true);
    expect(isMaxEffortIsometric(at('Overcoming Iso', 'RPE 10'), row('Overcoming Iso'))).toBe(true);
    expect(isMaxEffortIsometric(at('overcoming iso', 'ALL-OUT'), row('overcoming iso'))).toBe(true);
    expect(isMaxEffortIsometric(at('Wall push', 'MAX'), row('Wall push', 'ISOMETRICS'))).toBe(true);
    expect(isMaxEffortIsometric(at('Wall push', 'MAX'), row('Wall push'))).toBe(false); // not an isometric
    expect(isMaxEffortIsometric(at('Overcoming Iso', 'RPE6'), row('Overcoming Iso'))).toBe(false); // not max effort
    expect(MAX_EFFORT_CUE.test('PUSH AS FAST AND HARD AS YOU CAN')).toBe(true);
  });
});

describe('the teen cue filter', () => {
  it('drops the dunk program’s adult isometric cue, "push as fast and hard as you can"', () => {
    expect(MAX_EFFORT_CUE.test('Push as fast and hard as you can against the strap.')).toBe(true);
    expect(youthSafeCues(['Push as fast and hard as you can', 'Land quiet: as little sound as you can.'])).toEqual(['Land quiet: as little sound as you can.']);
  });
});
