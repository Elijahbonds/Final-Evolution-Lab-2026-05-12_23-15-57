// COACH-AI-DRAFT (2026-10-24): the rules engine on realistic clients — progression, regression, pain, low compliance,
// asymmetry, a teen, no data — and the safety line it must never cross (a pain flag never drafts "progress").
import { describe, expect, it } from 'vitest';
import { draftForClient } from './rules';
import type { DraftChange, DraftOp } from './types';
import { DAY, NOW, adult, exposure, hipPrescription, program } from '@/tests/helpers/weeklyDraftFixtures';

const PROGRESS = ['progress_load', 'progress_volume', 'swap_harder'];
const upd = (c: DraftChange) => c.ops.filter((o): o is Extract<DraftOp, { action: 'update' }> => o.action === 'update');
const byKind = (cs: DraftChange[], k: string) => cs.filter((c) => c.kind === k);

describe('progression: double progression, technique before load', () => {
  it('two sessions at the top of the range with reps left → the load goes up one plate, for review', () => {
    const d = draftForClient(adult({ exposures: [exposure('pe-tbdl', 3, [10, 10, 10], 7, { load: '60 kg' }), exposure('pe-tbdl', 10, [10, 10, 10], [6, 7, 7], { load: '60 kg' })] }));
    const [c] = byKind(d.changes, 'progress_load');
    expect(c).toBeDefined();
    expect(c.exerciseName).toBe('Trap-bar deadlift');
    expect(upd(c)).toHaveLength(1);
    expect(upd(c)[0]).toMatchObject({ sessionExerciseId: 'A2-pe-tbdl', before: { load: '60 kg' }, after: { load: '62.5 kg', sets: 3 } });
    expect(c.safety).toBe('review');
    expect(c.confidence).toBe('high');
    expect(c.reason).toMatch(/top of 8-10 on every set in the last 2 sessions at effort 7 or less/);
    expect(c.evidence.some((e) => /3 sets \(10, 10, 10\) @ 60 kg, top effort 7/.test(e))).toBe(true);
    expect(c.method).toMatch(/Playbook ch\. 8, Strength Without Strain/);
    expect(c.clientLine).toMatch(/Trap-bar deadlift moves up: 60 kg → 62\.5 kg/);
  });

  it('the top of the range at a grind (effort 9) is not progress: it holds', () => {
    const d = draftForClient(adult({ exposures: [exposure('pe-tbdl', 3, [10, 10, 10], 9, { load: '60 kg' }), exposure('pe-tbdl', 10, [10, 10, 10], 9, { load: '60 kg' })] }));
    expect(d.changes.filter((c) => PROGRESS.includes(c.kind))).toEqual([]);
  });

  it('one good session is a day, not a trend', () => {
    const d = draftForClient(adult({ exposures: [exposure('pe-tbdl', 3, [10, 10, 10], 6, { load: '60 kg' })] }));
    expect(d.changes).toEqual([]);
  });

  it('an RPE-written load moves its RPE; a bodyweight row with nothing left to add steps to the harder link', () => {
    const tree = program();
    const push = tree.tree.blocks[1].sessions[1].exercises[0];
    push.sets = 5; // already at the adult ceiling
    const d = draftForClient(adult({
      program: tree,
      exposures: [
        exposure('pe-goblet', 2, [10, 10, 10], 7), exposure('pe-goblet', 9, [10, 10, 10], 7),
        exposure('pe-push', 4, [12, 12, 12, 12, 12], 7, { sets: 5, reps: '8-12', load: '' }), exposure('pe-push', 11, [12, 12, 12, 12, 12], 8, { sets: 5, reps: '8-12', load: '' }),
      ],
    }));
    const goblet = d.changes.find((c) => c.exerciseName === 'Goblet squat')!;
    expect(upd(goblet)[0].after.load).toBe('RPE8');
    const swap = byKind(d.changes, 'swap_harder')[0];
    expect(upd(swap)[0].after).toMatchObject({ exerciseId: 'pe-deficit', exerciseName: 'Deficit push-up' });
    expect(swap.safety).toBe('review');
  });

  it('a summary-only log (no per-set rows, no effort) still counts, at medium confidence', () => {
    const e = (daysAgo: number) => ({ ...exposure('pe-split', daysAgo, [], null, { reps: '10', load: '16 kg' }), summary: { actualSets: 3, actualReps: '10,10,10', actualLoad: '16 kg', rpe: null } });
    const d = draftForClient(adult({ exposures: [e(3), e(10)] }));
    const c = d.changes.find((x) => x.exerciseName === 'Split squat')!;
    expect(c.kind).toBe('progress_load');
    expect(c.confidence).toBe('medium');
    expect(upd(c)[0].after.load).toBe('18.5 kg');
  });
});

describe('regression', () => {
  it('short of the range twice → a step back, safe to approve', () => {
    const d = draftForClient(adult({ exposures: [exposure('pe-goblet', 2, [8, 7, 6], 9), exposure('pe-goblet', 9, [8, 7, 7], 9)] }));
    const c = d.changes.find((x) => x.exerciseName === 'Goblet squat')!;
    expect(c.kind).toBe('regress_load');
    expect(upd(c)[0]).toMatchObject({ before: { load: 'RPE7' }, after: { load: 'RPE6' } });
    expect(c.safety).toBe('safe');
    expect(c.reason).toMatch(/Fell short of 8-10 in the last 2 sessions \(lowest set 6 reps, top effort 9\)/);
  });

  it('a weight comes down about 10% to a plate', () => {
    const d = draftForClient(adult({ exposures: [exposure('pe-tbdl', 3, [6, 5, 5], 10, { load: '60 kg' }), exposure('pe-tbdl', 10, [7, 6, 6], 9, { load: '60 kg' })] }));
    const c = d.changes.find((x) => x.exerciseName === 'Trap-bar deadlift')!;
    expect(upd(c)[0].after.load).toBe('52.5 kg');
  });

  it('far under the range twice, with an easier link → the easier version', () => {
    const d = draftForClient(adult({ exposures: [exposure('pe-tbdl', 3, [3, 2, 2], 10, { load: '60 kg' }), exposure('pe-tbdl', 10, [3, 3, 2], 10, { load: '60 kg' })] }));
    const c = byKind(d.changes, 'swap_easier')[0];
    expect(upd(c)[0].after).toMatchObject({ exerciseId: 'pe-rdl', exerciseName: 'Dumbbell RDL', sets: 3, load: '60 kg' });
    expect(c.safety).toBe('safe');
  });
});

describe('pain: ease off, never progress', () => {
  const ready = [exposure('pe-tbdl', 3, [10, 10, 10], 6, { load: '60 kg' }), exposure('pe-tbdl', 10, [10, 10, 10], 6, { load: '60 kg' })];

  it('a paused exercise (no consent to the details) → ease off with "see a professional"; the ready progression is HELD', () => {
    const d = draftForClient(adult({ exposures: ready, pain: { present: true, detailed: false, items: [] } }));
    expect(d.changes.filter((c) => PROGRESS.includes(c.kind))).toEqual([]);
    const ease = byKind(d.changes, 'ease_off')[0];
    expect(ease.reason).toMatch(/paused an exercise in the last two weeks \(the details are shared only with their consent\)/);
    expect(ease.reason).toMatch(/should see a professional/);
    expect(ease.reason).not.toMatch(/pain/i);   // no more than the board's generic flag says
    expect(ease.sensitive).toBe(true);
    expect(ease.safety).toBe('safe');
    expect(upd(ease).map((o) => o.sessionExerciseId).sort()).toEqual(['A2-pe-split', 'A2-pe-tbdl', 'B2-pe-push', 'B2-pe-row', 'C2-pe-goblet', 'C2-pe-row']);
    expect(upd(ease).find((o) => o.sessionExerciseId === 'A2-pe-tbdl')!.after).toMatchObject({ sets: 2, load: '52.5 kg' });
    expect(d.held.some((h) => /pain flag is open/.test(h.why))).toBe(true);
    expect(ease.clientLine).toMatch(/check with a clinician/);
  });

  it('a stop-and-see-a-clinician check-in, shared with this coach → named, and the exercise steps down its ladder', () => {
    const d = draftForClient(adult({
      exposures: ready,
      pain: { present: true, detailed: true, items: [{ exerciseName: 'Goblet squat', bodyArea: 'knee', decision: 'stop_see_clinician', atMs: NOW - 2 * DAY }] },
    }));
    const ease = byKind(d.changes, 'ease_off')[0];
    expect(ease.reason).toMatch(/reported pain on Goblet squat \(knee\)/);
    expect(ease.reason).toMatch(/stop that exercise and check with a clinician/);
    const swap = byKind(d.changes, 'swap_easier')[0];
    expect(upd(swap)[0]).toMatchObject({ sessionExerciseId: 'C2-pe-goblet', after: { exerciseId: 'pe-box' } });
    // the swap took the goblet row; the ease-off keeps the rest
    expect(upd(ease).map((o) => o.sessionExerciseId)).not.toContain('C2-pe-goblet');
    expect(d.changes.filter((c) => PROGRESS.includes(c.kind))).toEqual([]);
  });
});

describe('low compliance', () => {
  it('two planned sessions missed this week → check in, trim the support work, hold the progression', () => {
    const d = draftForClient(adult({
      exposures: [exposure('pe-tbdl', 5, [10, 10, 10], 6, { load: '60 kg' }), exposure('pe-tbdl', 12, [10, 10, 10], 6, { load: '60 kg' })],
      compliance: { state: 'steady', note: '2 coached sessions in the last two weeks.', daysSince: 5, planned: 3, doneLast7: 1, missed: 2 },
    }));
    expect(byKind(d.changes, 'check_in')).toHaveLength(1);
    const trim = byKind(d.changes, 'regress_volume')[0];
    expect(trim.evidence).toContain('1 of 3 planned sessions in the last 7 days.');
    expect(upd(trim).every((o) => !o.sessionExerciseId.includes('tbdl') && !o.sessionExerciseId.includes('goblet'))).toBe(true); // the key lifts stay
    expect(upd(trim).find((o) => o.sessionExerciseId === 'A2-pe-split')!.after.sets).toBe(2);
    expect(d.changes.filter((c) => PROGRESS.includes(c.kind))).toEqual([]);
    expect(d.held.some((h) => /missed sessions/.test(h.why))).toBe(true);
  });

  it('a client who has never trained: check in only, nothing trimmed', () => {
    const d = draftForClient(adult({ exposures: [], completedSessionIds: [], compliance: { state: 'stalled', note: 'Has never completed a coached session.', daysSince: null, planned: 3, doneLast7: 0, missed: 3 } }));
    expect(d.changes.map((c) => c.kind)).toEqual(['check_in']);
    expect(d.changes[0].confidence).toBe('high');
  });
});

describe('asymmetry: the Mirror screen corrects before it loads', () => {
  it('a matched corrective goes into the next open session’s Prep, as the builder’s add body', () => {
    const d = draftForClient(adult({ screen: { prescriptions: [hipPrescription(true)], atIso: '2026-10-18T10:00:00.000Z' } }));
    const c = byKind(d.changes, 'add_corrective')[0];
    expect(c.title).toBe('Add Side-lying clamshell to Prep (Day 1 — Lower)');
    expect(c.reason).toMatch(/^From the screen: hip level, right side/);
    expect(c.ops).toEqual([{ action: 'add', sessionId: 'A2', sessionLabel: 'Day 1 — Lower', exerciseId: 'pe-clam', exerciseName: 'Side-lying clamshell', body: expect.objectContaining({ sessionId: 'A2', exerciseId: 'pe-clam', section: 'prep', load: '', tempo: '2-1-1-0' }) }]);
    expect(c.safety).toBe('safe');
    expect(c.confidence).toBe('high');
    expect(c.method).toMatch(/Assess, Correct, Load, Perform/);
  });

  it('no match in the catalogue → said as held, with what to look for; nothing invented', () => {
    const d = draftForClient(adult({ screen: { prescriptions: [hipPrescription(false)], atIso: null } }));
    expect(byKind(d.changes, 'add_corrective')).toEqual([]);
    expect(d.held).toContainEqual({ title: 'Hip level, right side', why: 'Nothing in your catalogue matches this one. Look for: a Joints exercise.' });
  });

  it('already in this week → not added twice', () => {
    const tree = program();
    tree.tree.blocks[1].sessions[0].exercises.push({ ...tree.tree.blocks[1].sessions[0].exercises[0], id: 'A2-clam', exerciseId: 'pe-clam', name: 'Side-lying clamshell' });
    const d = draftForClient(adult({ program: tree, screen: { prescriptions: [hipPrescription(true)], atIso: null } }));
    expect(byKind(d.changes, 'add_corrective')).toEqual([]);
  });
});

describe('a teen (13–17, guardian-consented coach training): conservative rules only', () => {
  it('the top of the range twice → one more set, never more load', () => {
    const d = draftForClient(adult({ band: 'teen', pain: null, exposures: [exposure('pe-tbdl', 3, [10, 10, 10], 6, { load: '60 kg' }), exposure('pe-tbdl', 10, [10, 10, 10], 6, { load: '60 kg' })] }));
    const c = d.changes.find((x) => x.exerciseName === 'Trap-bar deadlift')!;
    expect(c.kind).toBe('progress_volume');
    expect(upd(c)[0].after).toMatchObject({ sets: 4, load: '60 kg' });
    expect(d.context.join(' ')).toMatch(/Under 18/);
    expect(d.context.join(' ')).not.toMatch(/Pain check-ins|Readiness|Mirror form/);
  });

  it('at the youth set ceiling, the harder swap is HELD (intensity), and no band climbs', () => {
    const tree = program();
    const row = tree.tree.blocks[1].sessions[1].exercises[1]; // B2 half-kneeling row, band drive
    row.sets = 4;
    tree.tree.blocks[1].sessions[1].exercises[0].sets = 4; // B2 push-up at 4
    const d = draftForClient(adult({
      band: 'teen', pain: null, program: tree,
      exposures: [exposure('pe-push', 2, [12, 12, 12, 12], 6, { sets: 4, reps: '8-12', load: '' }), exposure('pe-push', 9, [12, 12, 12, 12], 6, { sets: 4, reps: '8-12', load: '' })],
    }));
    expect(byKind(d.changes, 'swap_harder')).toEqual([]);
    expect(d.held.find((h) => /Push-up → Deficit push-up/.test(h.title))?.why).toMatch(/Under 18: the draft moves volume only/);
    for (const c of d.changes) for (const o of upd(c)) expect(o.after.effortBand === 'full' || o.after.effortBand === 'surge').toBe(false);
  });
});

describe('a lighter week', () => {
  it('effort averaging Surge across the lookback → deload, and the ready progression is held for a week', () => {
    const d = draftForClient(adult({
      exposures: [
        exposure('pe-tbdl', 3, [10, 10, 10], 8, { load: '60 kg' }), exposure('pe-tbdl', 10, [10, 10, 10], 8, { load: '60 kg' }),
        exposure('pe-goblet', 4, [9, 9, 9], 9), exposure('pe-goblet', 11, [9, 9, 9], 9), exposure('pe-split', 4, [10, 10, 10], 9, { reps: '10' }),
      ],
    }));
    const dl = byKind(d.changes, 'deload')[0];
    expect(dl.reason).toMatch(/top-set effort has averaged 8\.6 over 5 logged exercises/);
    expect(dl.method).toMatch(/The Reset Button/);
    expect(d.changes.filter((c) => PROGRESS.includes(c.kind))).toEqual([]);
    expect(d.held.some((h) => /lighter week/.test(h.why))).toBe(true);
  });

  it('low readiness (shared with the coach) drafts it too, and marks it sensitive', () => {
    const d = draftForClient(adult({ readiness: { lowDays: 4, days: 6 } }));
    const dl = byKind(d.changes, 'deload')[0];
    expect(dl.reason).toMatch(/Readiness was low on 4 of their last 6 check-ins/);
    expect(dl.sensitive).toBe(true);
  });
});

describe('Mirror form and jump', () => {
  it('form score down 9 over two weeks → the squat and lunge rows step back, and their progression is held', () => {
    const d = draftForClient(adult({ form: { thisWeek: 0.69, lastWeek: 0.78, delta: -0.09 }, exposures: [exposure('pe-goblet', 2, [10, 10, 10], 6), exposure('pe-goblet', 9, [10, 10, 10], 6)] }));
    const c = d.changes.find((x) => x.title === 'Squat and lunge work steps back')!;
    expect(c.reason).toMatch(/Mirror form score down 9 over 2 weeks \(78% → 69% clean reps/);
    expect(upd(c).map((o) => o.sessionExerciseId).sort()).toEqual(['A2-pe-split', 'C2-pe-goblet']);
    expect(d.changes.filter((x) => PROGRESS.includes(x.kind))).toEqual([]);
  });

  it('best jump down 1.4 in → fewer jump contacts this week', () => {
    const d = draftForClient(adult({ jump: { thisWeek: 20.1, lastWeek: 21.5, delta: -1.4 } }));
    const c = d.changes.find((x) => x.title === 'Less jump volume this week')!;
    expect(upd(c).map((o) => [o.sessionExerciseId, o.before.sets, o.after.sets])).toEqual([['A2-pe-pogo', 3, 2]]);
    expect(c.reason).toMatch(/Best jump down 1\.4 in vs last week \(21\.5 → 20\.1 in\)/);
  });
});

describe('no data, no program, marked out', () => {
  it('no logs, no flags → no_data, nothing drafted', () => {
    const d = draftForClient(adult({ exposures: [] }));
    expect(d.status).toBe('no_data');
    expect(d.changes).toEqual([]);
  });
  it('no program → no_program', () => {
    expect(draftForClient(adult({ program: null })).status).toBe('no_program');
  });
  it('a finished program → no_program, said', () => {
    const d = draftForClient(adult({ completedSessionIds: ['A1', 'B1', 'C1', 'A2', 'B2', 'C2'] }));
    expect(d.status).toBe('no_program');
    expect(d.context[0]).toMatch(/every session is done/);
  });
  it('marked Out by the coach → skipped', () => {
    expect(draftForClient(adult({ availability: 'out' }))).toMatchObject({ status: 'skipped', changes: [] });
  });
  it('marked Limited → a ready progression is held', () => {
    const d = draftForClient(adult({ availability: 'limited', exposures: [exposure('pe-tbdl', 3, [10, 10, 10], 6, { load: '60 kg' }), exposure('pe-tbdl', 10, [10, 10, 10], 6, { load: '60 kg' })] }));
    expect(d.changes.filter((c) => PROGRESS.includes(c.kind))).toEqual([]);
    expect(d.held[0].why).toMatch(/Limited/);
  });
});

describe('determinism and the athlete’s own work', () => {
  it('the same facts draft the same changes, ids included (idempotent weekly generation starts here)', () => {
    const f = adult({ exposures: [exposure('pe-goblet', 2, [8, 7, 6], 9), exposure('pe-goblet', 9, [8, 7, 7], 9)], screen: { prescriptions: [hipPrescription(true)], atIso: null } });
    const a = draftForClient(f), b = draftForClient(f);
    expect(a).toEqual(b);
    expect(new Set(a.changes.map((c) => c.id)).size).toBe(a.changes.length);
    expect(a.weekKey).toBe('2026-10-19');
  });

  it('a row with a log on it is never edited', () => {
    const d = draftForClient(adult({ loggedRowIds: ['A2-pe-tbdl'], exposures: [exposure('pe-tbdl', 3, [10, 10, 10], 6, { load: '60 kg' }), exposure('pe-tbdl', 10, [10, 10, 10], 6, { load: '60 kg' })] }));
    expect(d.changes.flatMap(upd).map((o) => o.sessionExerciseId)).not.toContain('A2-pe-tbdl');
  });

  it('logs older than the lookback do not count', () => {
    const d = draftForClient(adult({ exposures: [exposure('pe-tbdl', 30, [10, 10, 10], 6, { load: '60 kg' }), exposure('pe-tbdl', 40, [10, 10, 10], 6, { load: '60 kg' })] }));
    expect(d.status).toBe('no_data');
  });

  it('every change carries a reason, a confidence and a safety class; none is unsafe', () => {
    const d = draftForClient(adult({
      pain: { present: true, detailed: false, items: [] }, form: { thisWeek: 0.6, lastWeek: 0.8, delta: -0.2 },
      exposures: [exposure('pe-goblet', 2, [8, 7, 6], 9), exposure('pe-goblet', 9, [8, 7, 7], 9)], screen: { prescriptions: [hipPrescription(true)], atIso: null },
    }));
    expect(d.changes.length).toBeGreaterThan(1);
    for (const c of d.changes) {
      expect(c.reason.length).toBeGreaterThan(10);
      expect(['high', 'medium', 'low']).toContain(c.confidence);
      expect(['safe', 'review']).toContain(c.safety);
    }
    // one change per row
    const rows = d.changes.flatMap(upd).map((o) => o.sessionExerciseId);
    expect(new Set(rows).size).toBe(rows.length);
  });
});
