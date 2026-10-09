// MIRROR-COACH P5 (2026-09-29): the pain check-in loop — validation, trend, decide() wiring against a fake Prisma
// client (vitest does not collect app/, same pattern as lib/health/intake.test.ts), the next-morning selection, and
// the coach's own consent-gated view of a flag.

import { describe, it, expect } from 'vitest';
import {
  PainValidationError,
  coachPainFlag,
  pendingNextMorningFollowUps,
  submitPainCheckIn,
  trendFrom,
  validatePainCheckIn,
  type PainCheckInHistoryRow,
} from './pain';

// ---------------------------------------------------------------------------------------------------------------
// validatePainCheckIn
// ---------------------------------------------------------------------------------------------------------------

describe('validatePainCheckIn', () => {
  const valid = { exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 3, kind: 'after' as const };

  it('accepts a minimal valid payload', () => {
    const v = validatePainCheckIn(valid);
    expect(v).toEqual({ programExerciseId: null, exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 3, kind: 'after', acute: [], note: null });
  });

  it('accepts every field filled in', () => {
    const v = validatePainCheckIn({ ...valid, programExerciseId: 'pe1', acute: ['pop'], note: '  hurt on the way down  ' });
    expect(v.programExerciseId).toBe('pe1');
    expect(v.acute).toEqual(['pop']);
    expect(v.note).toBe('hurt on the way down');
  });

  it('trims exerciseName and rejects a blank one', () => {
    expect(validatePainCheckIn({ ...valid, exerciseName: '  Back Squat  ' }).exerciseName).toBe('Back Squat');
    expect(() => validatePainCheckIn({ ...valid, exerciseName: '   ' })).toThrow(PainValidationError);
  });

  it('rejects an unknown bodyArea id', () => {
    expect(() => validatePainCheckIn({ ...valid, bodyArea: 'left_pinky' })).toThrow(PainValidationError);
  });

  it.each([-1, 11, 3.5, NaN, '5', null, undefined])('rejects an out-of-range or non-integer score: %p', (score) => {
    expect(() => validatePainCheckIn({ ...valid, score })).toThrow(PainValidationError);
  });
  it.each([0, 5, 10])('accepts the boundary and middle scores: %p', (score) => {
    expect(validatePainCheckIn({ ...valid, score }).score).toBe(score);
  });

  it('rejects an unknown kind', () => {
    expect(() => validatePainCheckIn({ ...valid, kind: 'whenever' })).toThrow(PainValidationError);
  });

  it('drops nothing and errors on an unknown acute-event id rather than silently filtering it out', () => {
    expect(() => validatePainCheckIn({ ...valid, acute: ['pop', 'made_up'] })).toThrow(PainValidationError);
  });

  it('a non-array acute is treated as empty, not an error', () => {
    expect(validatePainCheckIn({ ...valid, acute: 'pop' }).acute).toEqual([]);
  });

  it('a blank note reads as null, not an empty string', () => {
    expect(validatePainCheckIn({ ...valid, note: '   ' }).note).toBeNull();
  });

  it('a note over 500 chars is truncated, not rejected', () => {
    const long = 'x'.repeat(600);
    expect(validatePainCheckIn({ ...valid, note: long }).note).toHaveLength(500);
  });

  it('collects every error at once, not just the first', () => {
    try {
      validatePainCheckIn({ exerciseName: '', bodyArea: 'nope', score: -1, kind: 'nope' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(PainValidationError);
      const e = err as PainValidationError;
      expect(e.code).toBe('invalid_check_in');
      expect(e.details.length).toBe(4);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// trendFrom
// ---------------------------------------------------------------------------------------------------------------

describe('trendFrom', () => {
  it('no prior check-in -> unknown', () => expect(trendFrom(5, null)).toBe('unknown'));
  it('a higher score than the prior -> up', () => expect(trendFrom(6, { score: 4, createdAt: new Date() })).toBe('up'));
  it('a lower score than the prior -> down', () => expect(trendFrom(2, { score: 4, createdAt: new Date() })).toBe('down'));
  it('the same score as the prior -> flat', () => expect(trendFrom(4, { score: 4, createdAt: new Date() })).toBe('flat'));
});

// ---------------------------------------------------------------------------------------------------------------
// Fake Prisma client for submitPainCheckIn — painCheckIn / healthIntake / user only.
// ---------------------------------------------------------------------------------------------------------------

interface FakeCheckInRow {
  id: string;
  userId: string;
  programExerciseId: string | null;
  exerciseName: string;
  bodyArea: string;
  score: number;
  kind: string;
  acute: string[];
  note: string | null;
  decision: string;
  createdAt: Date;
}
interface FakeIntakeRow {
  userId: string;
  redFlags: string[];
  clearedAt: Date | null;
  createdAt: Date;
}

function fakeDb(opts: { intakes?: FakeIntakeRow[]; users?: Record<string, { dobYear: number | null }>; seed?: FakeCheckInRow[] } = {}) {
  let nextId = 1;
  const checkIns: FakeCheckInRow[] = [...(opts.seed ?? [])];
  const intakes = opts.intakes ?? [];
  const users = opts.users ?? {};

  const painCheckIn = {
    findFirst: async ({ where, orderBy }: { where: { userId: string; exerciseName: string; bodyArea: string }; orderBy?: { createdAt: 'desc' } }) => {
      const rows = checkIns.filter((r) => r.userId === where.userId && r.exerciseName === where.exerciseName && r.bodyArea === where.bodyArea);
      if (!rows.length) return null;
      const sorted = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return orderBy?.createdAt === 'desc' ? sorted[0] : sorted[sorted.length - 1];
    },
    create: async ({ data }: { data: Omit<FakeCheckInRow, 'id'> }) => {
      const row: FakeCheckInRow = { id: `pc${nextId++}`, ...data };
      checkIns.push(row);
      return row;
    },
  };
  const healthIntake = {
    findFirst: async ({ where }: { where: { userId: string } }) => {
      const rows = intakes.filter((r) => r.userId === where.userId);
      if (!rows.length) return null;
      return [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    },
  };
  const user = {
    findUnique: async ({ where }: { where: { id: string } }) => (users[where.id] ? { dobYear: users[where.id].dobYear } : null),
  };

  return { painCheckIn, healthIntake, user, _rows: checkIns } as const;
}

const NOW = new Date('2026-09-29T12:00:00.000Z');

describe('submitPainCheckIn', () => {
  it('no pain (score 0) -> continue, and the row still saves', async () => {
    const db = fakeDb({ users: { u1: { dobYear: 1990 } } });
    const r = await submitPainCheckIn(db, { userId: 'u1', raw: { exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 0, kind: 'after' }, now: NOW });
    expect(r.decision).toBe('continue');
    expect(r.stop).toBe(false);
    expect(r.hardStop).toBe(false);
    expect(db._rows).toHaveLength(1);
    expect(db._rows[0].decision).toBe('continue');
  });

  it('a tolerable during/after reading -> continue', async () => {
    const db = fakeDb({ users: { u1: { dobYear: 1990 } } });
    const r = await submitPainCheckIn(db, { userId: 'u1', raw: { exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 2, kind: 'during' }, now: NOW });
    expect(r.decision).toBe('continue');
  });

  it('an intolerable during/after reading -> step_down_flag_coach today, no waiting for morning', async () => {
    const db = fakeDb({ users: { u1: { dobYear: 1990 } } });
    const r = await submitPainCheckIn(db, { userId: 'u1', raw: { exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 6, kind: 'after' }, now: NOW });
    expect(r.decision).toBe('step_down_flag_coach');
    expect(r.stop).toBe(true);
    expect(r.hardStop).toBe(false);
  });

  it('a next-morning reading that settled and is not trending up -> easier_variation', async () => {
    const db = fakeDb({
      users: { u1: { dobYear: 1990 } },
      seed: [{ id: 'seed1', userId: 'u1', programExerciseId: null, exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 6, kind: 'after', acute: [], note: null, decision: 'step_down_flag_coach', createdAt: new Date('2026-09-28T18:00:00.000Z') }],
    });
    const r = await submitPainCheckIn(db, { userId: 'u1', raw: { exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 2, kind: 'next_morning' }, now: NOW });
    expect(r.decision).toBe('easier_variation');
  });

  it('a next-morning reading that is trending up -> step_down_flag_coach even though the raw score is tolerable', async () => {
    const db = fakeDb({
      users: { u1: { dobYear: 1990 } },
      seed: [{ id: 'seed1', userId: 'u1', programExerciseId: null, exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 1, kind: 'after', acute: [], note: null, decision: 'continue', createdAt: new Date('2026-09-28T18:00:00.000Z') }],
    });
    const r = await submitPainCheckIn(db, { userId: 'u1', raw: { exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 3, kind: 'next_morning' }, now: NOW });
    expect(r.decision).toBe('step_down_flag_coach');
  });

  it('an acute event always stops for a clinician, whatever the score', async () => {
    const db = fakeDb({ users: { u1: { dobYear: 1990 } } });
    const r = await submitPainCheckIn(db, { userId: 'u1', raw: { exerciseName: 'Box Jump', bodyArea: 'ankle_foot', score: 1, kind: 'after', acute: ['giving_way'] }, now: NOW });
    expect(r.decision).toBe('stop_see_clinician');
    expect(r.hardStop).toBe(true);
  });

  it('a standing, UNCLEARED intake red flag forces stop_see_clinician even on an otherwise-tolerable reading (defense in depth)', async () => {
    const db = fakeDb({
      users: { u1: { dobYear: 1990 } },
      intakes: [{ userId: 'u1', redFlags: ['heart_or_bp_condition'], clearedAt: null, createdAt: new Date('2026-09-01T00:00:00.000Z') }],
    });
    const r = await submitPainCheckIn(db, { userId: 'u1', raw: { exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 1, kind: 'after' }, now: NOW });
    expect(r.decision).toBe('stop_see_clinician');
  });

  it('a CLEARED intake red flag no longer forces a stop — clearedAt is respected, not re-litigated on every check-in', async () => {
    const db = fakeDb({
      users: { u1: { dobYear: 1990 } },
      intakes: [{ userId: 'u1', redFlags: ['heart_or_bp_condition'], clearedAt: new Date('2026-09-15T00:00:00.000Z'), createdAt: new Date('2026-09-01T00:00:00.000Z') }],
    });
    const r = await submitPainCheckIn(db, { userId: 'u1', raw: { exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 1, kind: 'after' }, now: NOW });
    expect(r.decision).toBe('continue');
  });

  it('ANY pain for a minor stops and tells an adult — never stop_see_clinician, even with an acute event too', async () => {
    const db = fakeDb({ users: { u1: { dobYear: 2015 } } });
    const r = await submitPainCheckIn(db, { userId: 'u1', raw: { exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 1, kind: 'after', acute: ['pop'] }, now: NOW });
    expect(r.decision).toBe('stop_tell_adult');
  });

  it('no birth year on file reads as a minor (decision #20) — same stop_tell_adult path', async () => {
    const db = fakeDb({ users: { u1: { dobYear: null } } });
    const r = await submitPainCheckIn(db, { userId: 'u1', raw: { exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 1, kind: 'after' }, now: NOW });
    expect(r.decision).toBe('stop_tell_adult');
  });

  it('a minor with NO pain and no acute event -> continue, not stop_tell_adult (only a pain EVENT stops)', async () => {
    const db = fakeDb({ users: { u1: { dobYear: 2015 } } });
    const r = await submitPainCheckIn(db, { userId: 'u1', raw: { exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 0, kind: 'after' }, now: NOW });
    expect(r.decision).toBe('continue');
  });

  it('rejects an invalid payload and writes nothing', async () => {
    const db = fakeDb({ users: { u1: { dobYear: 1990 } } });
    await expect(submitPainCheckIn(db, { userId: 'u1', raw: { exerciseName: '', bodyArea: 'knee', score: 3, kind: 'after' }, now: NOW })).rejects.toBeInstanceOf(PainValidationError);
    expect(db._rows).toHaveLength(0);
  });

  it('trend is scoped to the SAME exercise + body area — a different exercise never contaminates it', async () => {
    const db = fakeDb({
      users: { u1: { dobYear: 1990 } },
      seed: [{ id: 'seed1', userId: 'u1', programExerciseId: null, exerciseName: 'Back Squat', bodyArea: 'low_back', score: 8, kind: 'after', acute: [], note: null, decision: 'step_down_flag_coach', createdAt: new Date('2026-09-28T18:00:00.000Z') }],
    });
    // A DIFFERENT exercise's next-morning reading has no prior of its own -> trend unknown -> settles fine.
    const r = await submitPainCheckIn(db, { userId: 'u1', raw: { exerciseName: 'Goblet Squat', bodyArea: 'knee', score: 2, kind: 'next_morning' }, now: NOW });
    expect(r.decision).toBe('easier_variation');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// pendingNextMorningFollowUps
// ---------------------------------------------------------------------------------------------------------------

const row = (over: Partial<PainCheckInHistoryRow>): PainCheckInHistoryRow => ({
  id: 'x', exerciseName: 'Goblet Squat', bodyArea: 'knee', programExerciseId: null, score: 5, kind: 'after', decision: 'step_down_flag_coach', createdAt: new Date('2026-09-28T18:00:00.000Z'), ...over,
});

describe('pendingNextMorningFollowUps', () => {
  const TODAY = new Date('2026-09-29T09:00:00.000Z');

  it('a flagged reading from yesterday with no follow-up yet -> pending', () => {
    const out = pendingNextMorningFollowUps([row({})], TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].exerciseName).toBe('Goblet Squat');
  });

  it('a tolerable "continue" reading from yesterday is STILL pending — its real read is the morning after', () => {
    const out = pendingNextMorningFollowUps([row({ score: 2, decision: 'continue' })], TODAY);
    expect(out).toHaveLength(1);
  });

  it('a reading logged TODAY is not pending yet', () => {
    const out = pendingNextMorningFollowUps([row({ createdAt: TODAY })], TODAY);
    expect(out).toEqual([]);
  });

  it('a zero-pain reading is never pending — nothing to follow up on', () => {
    const out = pendingNextMorningFollowUps([row({ score: 0, decision: 'continue' })], TODAY);
    expect(out).toEqual([]);
  });

  it('already answered by a later next_morning check-in -> no longer pending', () => {
    const out = pendingNextMorningFollowUps(
      [row({ id: 'a' }), row({ id: 'b', kind: 'next_morning', createdAt: new Date('2026-09-29T08:00:00.000Z'), decision: 'easier_variation' })],
      TODAY,
    );
    expect(out).toEqual([]);
  });

  it('a stop_see_clinician or stop_tell_adult reading is never asked about again in-app', () => {
    const out = pendingNextMorningFollowUps(
      [row({ id: 'a', decision: 'stop_see_clinician' }), row({ id: 'b', exerciseName: 'Box Jump', decision: 'stop_tell_adult' })],
      TODAY,
    );
    expect(out).toEqual([]);
  });

  it('two different exercise/body-area groups each surface their own most recent flagged reading', () => {
    const out = pendingNextMorningFollowUps(
      [row({ id: 'a', exerciseName: 'Goblet Squat', bodyArea: 'knee' }), row({ id: 'b', exerciseName: 'Back Squat', bodyArea: 'low_back' })],
      TODAY,
    );
    expect(out.map((o) => o.exerciseName).sort()).toEqual(['Back Squat', 'Goblet Squat']);
  });

  it('within one group, only the MOST RECENT unfollowed reading is surfaced, not every past day', () => {
    const out = pendingNextMorningFollowUps(
      [row({ id: 'a', createdAt: new Date('2026-09-26T18:00:00.000Z') }), row({ id: 'b', createdAt: new Date('2026-09-27T18:00:00.000Z') })],
      TODAY,
    );
    expect(out).toHaveLength(1);
    expect(out[0].createdAt).toEqual(new Date('2026-09-27T18:00:00.000Z'));
  });

  it('a next_morning reading with no matching during/after in the window is never itself surfaced as pending', () => {
    const out = pendingNextMorningFollowUps([row({ kind: 'next_morning', createdAt: new Date('2026-09-28T08:00:00.000Z') })], TODAY);
    expect(out).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// coachPainFlag
// ---------------------------------------------------------------------------------------------------------------

describe('coachPainFlag', () => {
  it('no flagged rows -> not present, whatever consent says', () => {
    expect(coachPainFlag([row({ decision: 'continue' })], true)).toEqual({ present: false, detailed: false, label: '' });
    expect(coachPainFlag([], true)).toEqual({ present: false, detailed: false, label: '' });
  });

  it('flagged rows, no coach_view consent -> present but generic, no exercise name, no score, no decision', () => {
    const view = coachPainFlag([row({ decision: 'step_down_flag_coach' })], false);
    expect(view.present).toBe(true);
    expect(view.detailed).toBe(false);
    expect(view.label).toBe('Client paused an exercise');
    expect(view.items).toBeUndefined();
    expect(JSON.stringify(view)).not.toMatch(/Goblet Squat|knee/);
  });

  it('flagged rows WITH coach_view consent -> full detail, newest first, capped at 10', () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row({ id: `r${i}`, decision: 'step_down_flag_coach', createdAt: new Date(2026, 8, 1 + i) }),
    );
    const view = coachPainFlag(rows, true);
    expect(view.present).toBe(true);
    expect(view.detailed).toBe(true);
    expect(view.items).toHaveLength(10);
    expect(view.label).toBe('12 pain flags');
    expect(view.items![0].createdAt).toBe(new Date(2026, 8, 12).toISOString());
  });

  it('singular label for exactly one flag', () => {
    expect(coachPainFlag([row({ decision: 'stop_see_clinician' })], true).label).toBe('1 pain flag');
  });

  it('a "continue" or "easier_variation" row is never counted as a flag — only isStopOutcome rows are', () => {
    const view = coachPainFlag([row({ decision: 'continue' }), row({ id: 'y', decision: 'easier_variation' })], true);
    expect(view.present).toBe(false);
  });
});
