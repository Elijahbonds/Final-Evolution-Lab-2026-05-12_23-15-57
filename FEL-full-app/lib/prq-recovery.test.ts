// lib/prq-recovery.ts + lib/profile-service.ts getOrCreateProfile — PRQ RECOVERY'S SERVER HALF (MIRROR-COACH P9, 2026-09-30).
//
// The lane's database is offline on purpose, so the filters (lib/coach/recoverySources.ts — P6's two plus P9's two) run
// here over an in-memory relational store with a small Prisma-where evaluator: scalars (equals / not / in / gt / gte),
// AND / OR, to-one relations and to-many `some`. It throws on a field the model does not have, the way Prisma refuses
// one, so a filter that names a wrong column fails here instead of matching nothing. What it proves:
//   · what counts: an off day with work logged, a cool-down whose session is Done (tapped before or after), a coach-written
//     cool-down that was logged, timed easy locomotion (Idle / Cruise) in a completed session;
//   · what does not: an off day marked Done with nothing logged, a tap on a session nobody finished, an untouched coach
//     cool-down, a sprint at Surge, an item with no band, an unfinished session, someone else's work;
//   · the settle writes recovery + updatedAt together, conditionally, never throws, and reads nothing but these tables;
//   · getOrCreateProfile: the other seven attributes decay exactly as before (the old formula, number for number),
//     recovery follows the new rule — and now falls for a player who is in every day.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
interface Store {
  clientSession: Row[]; session: Row[]; exerciseLog: Row[]; setLog: Row[]; sessionExercise: Row[]; programExercise: Row[]; playerProfile: Row[];
}
const h = vi.hoisted(() => ({ store: null as unknown as Store, fail: null as string | null }));

// ── a tiny Prisma: where, select, update ─────────────────────────────────────────────────────────────────────────────
const REL: Record<string, Record<string, { model: keyof Store; many: boolean; local: string; foreign: string }>> = {
  clientSession: {
    session: { model: 'session', many: false, local: 'sessionId', foreign: 'id' },
    exerciseLogs: { model: 'exerciseLog', many: true, local: 'id', foreign: 'clientSessionId' },
  },
  exerciseLog: {
    clientSession: { model: 'clientSession', many: false, local: 'clientSessionId', foreign: 'id' },
    sessionExercise: { model: 'sessionExercise', many: false, local: 'sessionExerciseId', foreign: 'id' },
    setLogs: { model: 'setLog', many: true, local: 'id', foreign: 'exerciseLogId' },
  },
  setLog: { exerciseLog: { model: 'exerciseLog', many: false, local: 'exerciseLogId', foreign: 'id' } },
  sessionExercise: { exercise: { model: 'programExercise', many: false, local: 'exerciseId', foreign: 'id' } },
};
const val = (v: unknown) => (v instanceof Date ? v.getTime() : v);
const eq = (a: unknown, b: unknown) => (a == null && b == null) || val(a) === val(b);
function scalar(v: unknown, cond: unknown): boolean {
  if (cond === null || typeof cond !== 'object' || cond instanceof Date) return eq(v, cond);
  for (const [op, x] of Object.entries(cond as Row)) {
    if (op === 'not') { if (x !== null && typeof x === 'object' && !(x instanceof Date) ? scalar(v, x) : eq(v, x)) return false; }
    else if (op === 'equals') { if (!eq(v, x)) return false; }
    else if (op === 'in') { if (!(x as unknown[]).some((y) => eq(v, y))) return false; }
    else if (op === 'gt') { if (v == null || !((val(v) as number) > (val(x) as number))) return false; }
    else if (op === 'gte') { if (v == null || !((val(v) as number) >= (val(x) as number))) return false; }
    else throw new Error(`the test Prisma does not know the operator ${op}`);
  }
  return true;
}
function related(s: Store, model: string, row: Row, rel: string) {
  const r = REL[model][rel];
  const rows = s[r.model].filter((x) => x[r.foreign] === row[r.local]);
  return r.many ? rows : rows[0] ?? null;
}
function match(s: Store, model: string, row: Row, where: Row): boolean {
  for (const [k, cond] of Object.entries(where ?? {})) {
    if (k === 'AND') { if (!(Array.isArray(cond) ? cond : [cond]).every((w) => match(s, model, row, w))) return false; continue; }
    if (k === 'OR') { if (!(cond as Row[]).some((w) => match(s, model, row, w))) return false; continue; }
    const rel = REL[model]?.[k];
    if (rel?.many) {
      const rows = related(s, model, row, k) as Row[];
      if ('some' in cond) { if (!rows.some((r) => match(s, rel.model, r, cond.some))) return false; }
      else if ('none' in cond) { if (rows.some((r) => match(s, rel.model, r, cond.none))) return false; }
      else throw new Error(`the test Prisma does not know that list filter on ${model}.${k}`);
      continue;
    }
    if (rel) { const t = related(s, model, row, k) as Row | null; if (!t || !match(s, rel.model, t, cond)) return false; continue; }
    if (!(k in row)) throw new Error(`Unknown argument \`${k}\` on ${model} (the test Prisma refuses it, like Prisma)`);
    if (!scalar(row[k], cond)) return false;
  }
  return true;
}
function project(s: Store, model: string, row: Row, select?: Row): Row {
  if (!select) return { ...row };
  const out: Row = {};
  for (const [k, v] of Object.entries(select)) {
    if (!v) continue;
    const rel = REL[model]?.[k];
    if (rel) {
      const sub = v === true ? undefined : v.select;
      const r = related(s, model, row, k);
      out[k] = Array.isArray(r) ? r.map((x) => project(s, rel.model, x, sub)) : r ? project(s, rel.model, r, sub) : null;
    } else {
      if (!(k in row)) throw new Error(`Unknown field \`${k}\` in select on ${model}`);
      out[k] = row[k];
    }
  }
  return out;
}
function fakeDb(s: Store, seen?: string[]) {
  const model = (name: keyof Store) => ({
    findFirst: async ({ where, select }: Row = {}) => { if (h.fail === `${name}.findFirst`) throw Object.assign(new Error('boom'), { code: 'P1001' }); const r = s[name].find((x) => match(s, name, x, where)); return r ? project(s, name, r, select) : null; },
    findUnique: async ({ where, select }: Row) => { const r = s[name].find((x) => match(s, name, x, where)); return r ? project(s, name, r, select) : null; },
    findMany: async ({ where, select }: Row = {}) => s[name].filter((x) => match(s, name, x, where)).map((r) => project(s, name, r, select)),
    update: async ({ where, data }: Row) => {
      const r = s[name].find((x) => match(s, name, x, where));
      if (!r) throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
      Object.assign(r, data, { updatedAt: data.updatedAt ?? new Date() });
      return { ...r };
    },
    updateMany: async ({ where, data }: Row) => {
      const rows = s[name].filter((x) => match(s, name, x, where));
      for (const r of rows) Object.assign(r, data, { updatedAt: data.updatedAt ?? new Date() });
      return { count: rows.length };
    },
    create: async ({ data }: Row) => { const r = { id: `pp-${s[name].length + 1}`, updatedAt: new Date(), lastActiveAt: new Date(), lastDecayAt: new Date(), ...data }; s[name].push(r); return { ...r }; },
  });
  return new Proxy({} as Row, {
    get: (_t, k) => {
      if (typeof k !== 'string') return undefined;
      seen?.push(k);
      if (!(k in s)) throw new Error(`the recovery path touched a table it has no business reading: ${k}`);
      return model(k as keyof Store);
    },
  });
}

vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, k) => (fakeDb(h.store) as Row)[k as string] }) }));
vi.mock('@/lib/wallet/wallet-service', () => ({ applyLc: vi.fn(async () => ({ balanceAfter: 500 })) }));

import { RECOVERY_DEDUPE, readRecoveryRows, recoveryAsOf, recoveryEventsFromRows, settleRecoveryFor, settledRecovery, utcWeekStart, type RecoveryDb } from './prq-recovery';
import { getOrCreateProfile } from './profile-service';
import {
  COACH_COOLDOWN_DONE_WHERE, COMPLETED_OFF_DAY_WHERE, COOLDOWN_DONE_WHERE, EASY_CARDIO_BANDS, EASY_CARDIO_SET_WHERE,
} from './coach/recoverySources';
import * as offDay from './coach/offDay';
import { EFFORT_BANDS } from './coach/taxonomy';
import { PRQ_ATTRS } from './prq';
import { RECOVERY_RULE_SINCE_MS, easyCardioCredit } from './prq-engine';

const H = 60 * 60 * 1000;
const DAY = 24 * H;
const T0 = Date.UTC(2026, 9, 5);            // 2026-10-05T00:00Z
const at = (ms: number) => new Date(ms);

function newStore(): Store {
  const s: Store = { clientSession: [], session: [], exerciseLog: [], setLog: [], sessionExercise: [], programExercise: [], playerProfile: [] };
  s.programExercise.push(
    { id: 'pe-walk', pattern: 'locomotion' }, { id: 'pe-bike', pattern: 'locomotion' }, { id: 'pe-sprint', pattern: 'locomotion' },
    { id: 'pe-squat', pattern: 'squat' }, { id: 'pe-breath', pattern: 'breath' }, { id: 'pe-rock', pattern: 'mobility' },
  );
  s.session.push({ id: 'S-train', kind: 'training' }, { id: 'S-off', kind: 'recovery' }, { id: 'S-coachcool', kind: 'training' }, { id: 'S-cardio', kind: 'training' });
  s.sessionExercise.push(
    { id: 'se-squat', sessionId: 'S-train', exerciseId: 'pe-squat', section: 'key', effortBand: 'drive' },
    { id: 'se-walk', sessionId: 'S-off', exerciseId: 'pe-walk', section: 'key', effortBand: 'idle' },
    { id: 'se-offrock', sessionId: 'S-off', exerciseId: 'pe-rock', section: 'cooldown', effortBand: 'idle' },
    { id: 'se-cc-squat', sessionId: 'S-coachcool', exerciseId: 'pe-squat', section: 'key', effortBand: 'drive' },
    { id: 'se-cc-breath', sessionId: 'S-coachcool', exerciseId: 'pe-breath', section: 'cooldown', effortBand: 'idle' },
    { id: 'se-sprint', sessionId: 'S-cardio', exerciseId: 'pe-sprint', section: 'key', effortBand: 'surge' },
    { id: 'se-bike', sessionId: 'S-cardio', exerciseId: 'pe-bike', section: 'finish', effortBand: 'cruise' },
    { id: 'se-jog-noband', sessionId: 'S-cardio', exerciseId: 'pe-walk', section: 'finish', effortBand: null },
  );
  return s;
}

interface LogSpec { se: string; sets?: number[]; actualSets?: number | null; actualReps?: string | null }
/** A coached session as saveClientLog / recordCooldown leave it: the ClientSession, its ExerciseLogs, their timed SetLogs. */
function logged(s: Store, o: { id: string; sessionId: string; completedAt: number | null; cooldownDoneAt?: number | null; clientId?: string; logs?: LogSpec[] }) {
  s.clientSession.push({
    id: o.id, clientId: o.clientId ?? 'u1', programId: 'P1', sessionId: o.sessionId,
    completedAt: o.completedAt == null ? null : at(o.completedAt), cooldownDoneAt: o.cooldownDoneAt == null ? null : at(o.cooldownDoneAt),
    createdAt: at(T0),
  });
  for (const [i, l] of (o.logs ?? []).entries()) {
    const id = `${o.id}-log${i}`;
    s.exerciseLog.push({ id, clientSessionId: o.id, sessionExerciseId: l.se, actualSets: l.actualSets ?? null, actualReps: l.actualReps ?? null, actualLoad: null, rpe: null, completedAt: o.completedAt == null ? null : at(o.completedAt) });
    for (const [k, sec] of (l.sets ?? []).entries()) s.setLog.push({ id: `${id}-set${k}`, exerciseLogId: id, setIndex: k, workSeconds: sec, reps: null, weightKg: null, effort: null });
  }
}
function profile(s: Store, o: Partial<Row> = {}) {
  const row = {
    id: 'pp-u1', userId: 'u1', strength: 60, speed: 60, endurance: 60, agility: 60, power: 60, flexibility: 60, recovery: 50, mental: 60,
    labCredits: 500, xp: 0, shards: 0, streakDays: 0, lastStreakAt: at(T0), lastActiveAt: at(T0), lastDecayAt: at(T0), updatedAt: at(T0), ...o,
  };
  s.playerProfile.push(row);
  return row;
}
const events = async (s: Store, fromMs = T0, userId = 'u1') => recoveryEventsFromRows(await readRecoveryRows(fakeDb(s) as unknown as RecoveryDb, userId, fromMs));

beforeEach(() => { h.store = newStore(); h.fail = null; });
afterEach(() => { vi.useRealTimers(); });

describe('the filters (lib/coach/recoverySources.ts) are P6\'s, moved, and offDay.ts still exports the same objects', () => {
  it('offDay.ts re-exports the very same filters and kind (one definition)', () => {
    expect(offDay.COMPLETED_OFF_DAY_WHERE).toBe(COMPLETED_OFF_DAY_WHERE);
    expect(offDay.COOLDOWN_DONE_WHERE).toBe(COOLDOWN_DONE_WHERE);
    expect(offDay.OFF_DAY_KIND).toBe('recovery');
    expect(COOLDOWN_DONE_WHERE).toEqual({ cooldownDoneAt: { not: null }, completedAt: { not: null } });
    expect(COMPLETED_OFF_DAY_WHERE.session).toEqual({ kind: 'recovery' });
  });
  it('the easy bands are real band ids, the two easiest, and both youth-allowed', () => {
    const ids = EFFORT_BANDS.map((b) => b.id);
    expect(EASY_CARDIO_BANDS).toEqual(ids.slice(0, 2));
    for (const b of EASY_CARDIO_BANDS) expect(EFFORT_BANDS.find((x) => x.id === b)!.rpe[1]).toBeLessThanOrEqual(5);
    expect(EASY_CARDIO_SET_WHERE.exerciseLog.sessionExercise.exercise).toEqual({ pattern: 'locomotion' });
    expect(COACH_COOLDOWN_DONE_WHERE.session).toEqual({ kind: 'training' });
  });
  it('the test Prisma refuses a column the model does not have (so a filter typo cannot quietly match nothing)', async () => {
    logged(h.store, { id: 'cs1', sessionId: 'S-train', completedAt: T0 + H });
    await expect(fakeDb(h.store).clientSession.findMany({ where: { finishedAt: { not: null } } })).rejects.toThrow(/Unknown argument/);
  });
});

describe('what counts as recovery work (read through the real filters)', () => {
  it('an off day with the walk logged: +off day, and its 12 minutes as easy cardio', async () => {
    logged(h.store, { id: 'off1', sessionId: 'S-off', completedAt: T0 + 10 * H, logs: [{ se: 'se-walk', sets: [720] }, { se: 'se-offrock' }] });
    expect(await events(h.store)).toEqual([
      { source: 'offDay', at: T0 + 10 * H, ref: 'off1' },
      { source: 'easyCardio', at: T0 + 10 * H, minutes: 12, ref: 'off1' },
    ]);
  });
  it('an off day marked Done with nothing logged earns nothing (P6\'s review fix still holds)', async () => {
    logged(h.store, { id: 'off2', sessionId: 'S-off', completedAt: T0 + 10 * H, logs: [{ se: 'se-walk' }, { se: 'se-offrock' }] });
    expect(await events(h.store)).toEqual([]);
  });
  it('Today\'s cool-down: tapped after Done counts at the tap, tapped before Done counts at Done, on a row never finished — nothing', async () => {
    logged(h.store, { id: 'a', sessionId: 'S-train', completedAt: T0 + 9 * H, cooldownDoneAt: T0 + 9.2 * H, logs: [{ se: 'se-squat', sets: [0], actualSets: 3 }] });
    logged(h.store, { id: 'b', sessionId: 'S-train', completedAt: T0 + 30 * H, cooldownDoneAt: T0 + 29.9 * H, logs: [{ se: 'se-squat', actualSets: 3 }] });
    logged(h.store, { id: 'c', sessionId: 'S-train', completedAt: null, cooldownDoneAt: T0 + 50 * H });
    expect(await events(h.store)).toEqual([
      { source: 'cooldown', at: T0 + 9.2 * H, ref: 'a' },
      { source: 'cooldown', at: T0 + 30 * H, ref: 'b' },
    ]);
  });
  it('a coach-written Cool-down section counts once it is logged; untouched it does not', async () => {
    logged(h.store, { id: 'cc1', sessionId: 'S-coachcool', completedAt: T0 + 8 * H, logs: [{ se: 'se-cc-squat', actualSets: 3 }, { se: 'se-cc-breath', sets: [120] }] });
    logged(h.store, { id: 'cc2', sessionId: 'S-coachcool', completedAt: T0 + 32 * H, logs: [{ se: 'se-cc-squat', actualSets: 3 }, { se: 'se-cc-breath' }] });
    expect(await events(h.store)).toEqual([{ source: 'cooldown', at: T0 + 8 * H, ref: 'cc1' }]);
  });
  it('a session with BOTH Today\'s tap and a logged coach cool-down is one cool-down', async () => {
    logged(h.store, { id: 'both', sessionId: 'S-coachcool', completedAt: T0 + 8 * H, cooldownDoneAt: T0 + 8.1 * H, logs: [{ se: 'se-cc-breath', sets: [120] }] });
    expect((await events(h.store)).filter((e) => e.source === 'cooldown')).toEqual([{ source: 'cooldown', at: T0 + 8.1 * H, ref: 'both' }]);
  });
  it('easy cardio: a Cruise bike counts (sets summed); a Surge sprint, a band-less jog and an unfinished session do not', async () => {
    logged(h.store, { id: 'k1', sessionId: 'S-cardio', completedAt: T0 + 18 * H, logs: [{ se: 'se-sprint', sets: [300] }, { se: 'se-bike', sets: [600, 600] }, { se: 'se-jog-noband', sets: [900] }] });
    logged(h.store, { id: 'k2', sessionId: 'S-cardio', completedAt: null, logs: [{ se: 'se-bike', sets: [1800] }] });
    expect(await events(h.store)).toEqual([{ source: 'easyCardio', at: T0 + 18 * H, minutes: 20, ref: 'k1' }]);
  });
  it('someone else\'s work, and work finished before the window, are not read', async () => {
    logged(h.store, { id: 'x', sessionId: 'S-off', clientId: 'u2', completedAt: T0 + 10 * H, logs: [{ se: 'se-walk', sets: [720] }] });
    logged(h.store, { id: 'old', sessionId: 'S-off', completedAt: T0 - 2 * DAY, logs: [{ se: 'se-walk', sets: [720] }] });
    expect(await events(h.store)).toEqual([]);
    // …but a cool-down TAPPED inside the window on a session Done just before it is read (its time is the tap)
    logged(h.store, { id: 'late', sessionId: 'S-train', completedAt: T0 - 0.5 * H, cooldownDoneAt: T0 + 0.5 * H, logs: [{ se: 'se-squat', actualSets: 2 }] });
    expect(await events(h.store)).toEqual([{ source: 'cooldown', at: T0 + 0.5 * H, ref: 'late' }]);
  });
  it('a player with no coached work costs one query and reads nothing else', async () => {
    const seen: string[] = [];
    const rows = await readRecoveryRows(fakeDb(h.store, seen) as unknown as RecoveryDb, 'u1', T0);
    expect(rows).toEqual({ offDays: [], cooldowns: [], cardioSets: [] });
    expect(seen).toEqual(['clientSession']);
  });
});

// ── MIRROR-COACH P9 FIX (2026-09-30, code review): no credit for no work, and one credit per prescribed session ──────
describe('P9 fix: Today\'s cool-down needs logged work in its session', () => {
  it('Done with nothing logged, then the tap: nothing (it was 0.6, four times a day to the cap)', async () => {
    logged(h.store, { id: 'empty', sessionId: 'S-train', completedAt: T0 + 9 * H, cooldownDoneAt: T0 + 9.1 * H, logs: [{ se: 'se-squat' }] });
    logged(h.store, { id: 'bare', sessionId: 'S-coachcool', completedAt: T0 + 10 * H, cooldownDoneAt: T0 + 10.1 * H });
    expect(await events(h.store)).toEqual([]);
  });
  it('Done with one logged set, then the tap: 0.6', async () => {
    logged(h.store, { id: 'one', sessionId: 'S-train', completedAt: T0 + 9 * H, cooldownDoneAt: T0 + 9.1 * H, logs: [{ se: 'se-squat', sets: [0] }] });
    expect(await events(h.store)).toEqual([{ source: 'cooldown', at: T0 + 9.1 * H, ref: 'one' }]);
    profile(h.store, { recovery: 50, updatedAt: at(T0) });
    await settleRecoveryFor(fakeDb(h.store) as unknown as RecoveryDb, 'u1', at(T0 + 10 * H));
    expect(h.store.playerProfile[0].recovery).toBeCloseTo(50.6, 2);   // 0.6, less 54 minutes of the half-life
  });
  it('four empty Done + tap cycles in a day earn nothing at all', async () => {
    for (let i = 0; i < 4; i++) logged(h.store, { id: `e${i}`, sessionId: `S-train`, completedAt: T0 + (8 + i) * H, cooldownDoneAt: T0 + (8 + i) * H + 60_000 });
    profile(h.store, { recovery: 50, updatedAt: at(T0) });
    await settleRecoveryFor(fakeDb(h.store) as unknown as RecoveryDb, 'u1', at(T0 + 14 * H));
    expect(h.store.playerProfile[0].recovery).toBe(50);
  });
});

describe('P9 fix: one prescribed session, one credit (RECOVERY_DEDUPE)', () => {
  const walk = (id: string, t: number) => logged(h.store, { id, sessionId: 'S-off', completedAt: t, logs: [{ se: 'se-walk', sets: [1800] }] });
  it('the same off day completed twice in a day: one off day and one walk (it was the whole cap)', async () => {
    walk('off-a', T0 + 8 * H);
    walk('off-b', T0 + 9 * H);
    expect(await events(h.store)).toEqual([
      { source: 'offDay', at: T0 + 8 * H, ref: 'off-a' },
      { source: 'easyCardio', at: T0 + 8 * H, minutes: 30, ref: 'off-a' },
    ]);
    profile(h.store, { recovery: 50, updatedAt: at(T0) });
    await settleRecoveryFor(fakeDb(h.store) as unknown as RecoveryDb, 'u1', at(T0 + 10 * H));
    // 1.0 + 0.7 (less two hours of the half-life) — not the 2.0 cap the second completion used to fill
    expect(h.store.playerProfile[0].recovery).toBeCloseTo(51 + easyCardioCredit(30), 1);
    expect(h.store.playerProfile[0].recovery).toBeLessThan(51.71);
  });
  it('the same off day on two days of one week: the off day once, the walk each day; the next week, the off day again', async () => {
    walk('mon', T0 + 8 * H);                 // T0 is Monday 2026-10-05
    walk('wed', T0 + 2 * DAY + 8 * H);
    walk('next-mon', T0 + 7 * DAY + 8 * H);
    const ev = await events(h.store);
    expect(ev.filter((e) => e.source === 'offDay').map((e) => e.ref)).toEqual(['mon', 'next-mon']);
    expect(ev.filter((e) => e.source === 'easyCardio').map((e) => e.ref)).toEqual(['mon', 'wed', 'next-mon']);
  });
  it('a later settle still sees the week\'s earlier off day (the off days are read from the week\'s start)', async () => {
    walk('mon', T0 + 8 * H);
    walk('thu', T0 + 3 * DAY + 8 * H);
    // a settle whose window opens on Thursday: Monday's completion is before the window's day, and still counts as the week's
    const ev = await events(h.store, T0 + 3 * DAY);
    expect(ev.filter((e) => e.source === 'offDay').map((e) => e.ref)).toEqual(['mon']);
    expect(utcWeekStart(T0 + 3 * DAY + 8 * H)).toBe(T0);
    expect(utcWeekStart(T0)).toBe(T0);
    expect(utcWeekStart(T0 - 1)).toBe(T0 - 7 * DAY);
  });
  it('the same training session\'s cool-down twice in a day credits once; on the next day, again', async () => {
    const train = (id: string, t: number) => logged(h.store, { id, sessionId: 'S-train', completedAt: t, cooldownDoneAt: t + 60_000, logs: [{ se: 'se-squat', actualSets: 3 }] });
    train('am', T0 + 8 * H);
    train('pm', T0 + 18 * H);
    train('tue', T0 + DAY + 8 * H);
    expect((await events(h.store)).map((e) => e.ref)).toEqual(['am', 'tue']);
    // two DIFFERENT prescribed sessions on one day are two cool-downs
    logged(h.store, { id: 'other', sessionId: 'S-coachcool', completedAt: T0 + 12 * H, logs: [{ se: 'se-cc-breath', sets: [120] }] });
    expect((await events(h.store)).map((e) => e.ref)).toEqual(['am', 'other', 'tue']);
  });
  it('the first completion counts, whatever order the rows are read in (pure)', () => {
    const rows = {
      offDays: [{ id: 'z', sessionId: 'S', completedAt: at(T0 + 9 * H) }, { id: 'a', sessionId: 'S', completedAt: at(T0 + 8 * H) }],
      cooldowns: [], cardioSets: [],
    };
    expect(recoveryEventsFromRows(rows)).toEqual([{ source: 'offDay', at: T0 + 8 * H, ref: 'a' }]);
    expect(recoveryEventsFromRows({ ...rows, offDays: [...rows.offDays].reverse() })).toEqual([{ source: 'offDay', at: T0 + 8 * H, ref: 'a' }]);
    // a row with no prescribed session id stands for itself (nothing deduplicated across rows)
    expect(recoveryEventsFromRows({ offDays: rows.offDays.map((r) => ({ ...r, sessionId: null })), cooldowns: [], cardioSets: [] })).toHaveLength(2);
    expect(RECOVERY_DEDUPE).toEqual({ offDay: 'utcWeek', cooldown: 'utcDay', easyCardio: 'utcDay' });
  });
});

describe('P9 fix: getOrCreateProfile\'s settle never writes over a credit that landed after it read the row', () => {
  it('end to end through getOrCreateProfile: a row written between its read and its write is left as that writer left it', async () => {
    const NOW = T0 + 10 * H;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    profile(h.store, { recovery: 70, lastActiveAt: at(NOW - H), updatedAt: at(T0) });
    logged(h.store, { id: 'cd', sessionId: 'S-train', completedAt: T0 + 9 * H, cooldownDoneAt: T0 + 9.5 * H, logs: [{ se: 'se-squat', actualSets: 3 }] });
    // the concurrent writer: while getOrCreateProfile's settle reads the log, a coach route's settle credits the
    // cool-down and writes (recovery + a later updatedAt)
    const row = h.store.playerProfile[0];
    const cs = h.store.clientSession;
    let once = false;
    h.store.clientSession = new Proxy(cs, {
      get(t, k, r) {
        if (k === 'find' && !once) {
          once = true;
          Object.assign(row, { recovery: 70.6, updatedAt: at(NOW - 500) });
        }
        return Reflect.get(t, k, r);
      },
    });
    const p = await getOrCreateProfile('u1');
    h.store.clientSession = cs;
    expect(h.store.playerProfile[0].recovery).toBe(70.6);     // the credit stands (before the fix a stale settle wrote over it)
    expect(p.recovery).toBe(70.6);                              // and the caller is handed the row as it is now
  });
  it('no race: the settle is written, as before', async () => {
    const NOW = T0 + 3 * DAY;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    profile(h.store, { recovery: 80, lastActiveAt: at(NOW - H), updatedAt: at(T0) });
    const p = await getOrCreateProfile('u1');
    expect(p.recovery).toBeCloseTo(50 + 30 * 2 ** (-3 / 14), 3);
    expect(h.store.playerProfile[0].recovery).toBe(p.recovery);
    expect(h.store.playerProfile[0].updatedAt.getTime()).toBe(NOW);
  });
});

describe('P9 fix: recoveryAsOf — a direct read shows recovery as of now (the Profile tab, the coach\'s roster card)', () => {
  it('an idle month: the shown recovery has fallen by the half-life; nothing is read or written', () => {
    const row = { recovery: 80, updatedAt: at(T0), strength: 61 };
    const shown = recoveryAsOf(row, at(T0 + 28 * DAY));
    expect(shown.recovery).toBe(57.5);                    // 50 + 30 / 4 — two half-lives
    expect(shown.strength).toBe(61);
    expect(row.recovery).toBe(80);                         // the row is not touched
  });
  it('the same value the next settle writes (with no work in between)', async () => {
    profile(h.store, { recovery: 74, updatedAt: at(T0) });
    const shown = recoveryAsOf({ recovery: 74, updatedAt: at(T0) }, at(T0 + 9 * DAY));
    await settleRecoveryFor(fakeDb(h.store) as unknown as RecoveryDb, 'u1', at(T0 + 9 * DAY));
    expect(shown.recovery).toBe(h.store.playerProfile[0].recovery);
  });
  it('at or under 50, no anchor, no value, or a clock behind the row: unchanged', () => {
    expect(recoveryAsOf({ recovery: 45, updatedAt: at(T0) }, at(T0 + 30 * DAY)).recovery).toBe(45);
    expect(recoveryAsOf({ recovery: 80, updatedAt: null }, at(T0)).recovery).toBe(80);
    expect(recoveryAsOf({ recovery: null, updatedAt: at(T0) }, at(T0 + DAY)).recovery).toBeNull();
    expect(recoveryAsOf({ recovery: 80, updatedAt: at(T0 + DAY) }, at(T0)).recovery).toBe(80);
  });
});

describe('settleRecoveryFor (the coach routes\' best-effort settle)', () => {
  it('credits the day\'s work and writes recovery and updatedAt together', async () => {
    profile(h.store, { recovery: 50, updatedAt: at(T0) });
    logged(h.store, { id: 'off1', sessionId: 'S-off', completedAt: T0 + 10 * H, logs: [{ se: 'se-walk', sets: [720] }] });
    const now = at(T0 + 10 * H + 1000);
    const r = await settleRecoveryFor(fakeDb(h.store) as unknown as RecoveryDb, 'u1', now);
    expect(r).toMatchObject({ ok: true, written: true });
    const row = h.store.playerProfile[0];
    expect(row.recovery).toBeCloseTo(51 + easyCardioCredit(12), 3);
    expect(row.updatedAt).toEqual(now);
    const first = row.recovery as number;
    // a second settle a minute later credits nothing again (the anchor moved past it) — it only decays a hair
    const again = await settleRecoveryFor(fakeDb(h.store) as unknown as RecoveryDb, 'u1', at(T0 + 10 * H + 61_000));
    expect(again).toMatchObject({ ok: true });
    expect(h.store.playerProfile[0].recovery).toBeCloseTo(51 + easyCardioCredit(12), 3);
    expect(h.store.playerProfile[0].recovery).toBeLessThanOrEqual(first);
  });
  it('writes only if the row has not moved since it was read (a pay that landed in between is never overwritten)', async () => {
    profile(h.store, { recovery: 70, updatedAt: at(T0) });
    const db = fakeDb(h.store) as unknown as RecoveryDb;
    const racing = {
      ...db,
      playerProfile: {
        ...db.playerProfile,
        findUnique: async (a: never) => { const r = await db.playerProfile.findUnique(a); h.store.playerProfile[0].updatedAt = at(T0 + 3 * DAY - 5); h.store.playerProfile[0].recovery = 71; return r; },
      },
      clientSession: db.clientSession, setLog: db.setLog,
    } as unknown as RecoveryDb;
    const r = await settleRecoveryFor(racing, 'u1', at(T0 + 3 * DAY));
    expect(r).toMatchObject({ ok: true, written: false });
    expect(h.store.playerProfile[0].recovery).toBe(71);
  });
  it('no profile yet: nothing is created (a welcome grant is not a coach route\'s to make)', async () => {
    expect(await settleRecoveryFor(fakeDb(h.store) as unknown as RecoveryDb, 'u1', at(T0 + DAY))).toEqual({ ok: false, reason: 'no_profile' });
    expect(h.store.playerProfile).toEqual([]);
  });
  it('a read that fails never throws and changes nothing', async () => {
    profile(h.store, { recovery: 70, updatedAt: at(T0) });
    h.fail = 'clientSession.findFirst';
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await settleRecoveryFor(fakeDb(h.store) as unknown as RecoveryDb, 'u1', at(T0 + DAY))).toEqual({ ok: false, reason: 'error' });
    expect(h.store.playerProfile[0].recovery).toBe(70);
    expect(err.mock.calls[0].join(' ')).not.toContain('u1');     // no ids in the log line
    err.mockRestore();
  });
  it('settledRecovery with no usable anchor or value reads nothing', async () => {
    const seen: string[] = [];
    const db = fakeDb(h.store, seen) as unknown as RecoveryDb;
    expect(await settledRecovery(db, 'u1', { recovery: 70, updatedAt: null }, at(T0))).toEqual({ write: null, settle: null });
    expect(await settledRecovery(db, 'u1', { recovery: null, updatedAt: at(T0) }, at(T0 + DAY))).toEqual({ write: null, settle: null });
    expect(seen).toEqual([]);
  });
});

describe('getOrCreateProfile: the old decay for seven attributes, the new rule for recovery', () => {
  const OTHERS = PRQ_ATTRS.filter((a) => a !== 'recovery');
  /** The pre-P9 formula, verbatim from lib/profile-service.ts at 72b49537. */
  const oldDecay = (cur: number, idleDays: number) => Math.max(0, Math.round((cur - idleDays * 0.5) * 100) / 100);

  it('idle three days: every other attribute takes exactly the old −1.5; recovery halves toward 50 instead of −1.5 toward 0', async () => {
    const NOW = T0 + 3 * DAY + H;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    profile(h.store, { strength: 61.3, speed: 44.4, endurance: 0.7, agility: 99, power: 70.05, flexibility: 50, mental: 58.2, recovery: 80, lastActiveAt: at(T0), lastDecayAt: at(T0), updatedAt: at(T0) });
    const before = { ...h.store.playerProfile[0] };
    const p = await getOrCreateProfile('u1');
    for (const a of OTHERS) expect(p[a], a).toBe(oldDecay(before[a], 3));
    expect(p.recovery).toBeCloseTo(50 + 30 * 2 ** (-(3 * DAY + H) / (14 * DAY)), 3);
    expect(p.recovery).not.toBe(oldDecay(80, 3));
    expect(p.lastDecayAt.getTime()).toBe(NOW);
    expect(p.updatedAt.getTime()).toBe(NOW);
  });
  it('a player in every day (no idle day): the other seven do not move, and recovery now FALLS anyway — the fix', async () => {
    const NOW = T0 + 10 * DAY;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    profile(h.store, { recovery: 78, lastActiveAt: at(NOW - 2 * H), lastDecayAt: at(T0), updatedAt: at(NOW - 2 * H - 1) });
    const p = await getOrCreateProfile('u1');
    for (const a of OTHERS) expect(p[a], a).toBe(60);
    expect(p.recovery).toBeLessThan(78);
    expect(p.recovery).toBeCloseTo(50 + 28 * 2 ** (-(2 * H + 1) / (14 * DAY)), 3);
  });
  it('recovery at or under 50 is left alone by the idle decay now (it used to lose 0.5 a day toward 0)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0 + 3 * DAY + H);
    profile(h.store, { recovery: 45 });
    const p = await getOrCreateProfile('u1');
    expect(p.recovery).toBe(45);
    expect(p.strength).toBe(58.5);
  });
  it('logged recovery work raises it on the next read, capped for the day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0 + 20 * H);
    profile(h.store, { recovery: 50, lastActiveAt: at(T0 + 19 * H), updatedAt: at(T0) });
    logged(h.store, { id: 'off1', sessionId: 'S-off', completedAt: T0 + 8 * H, logs: [{ se: 'se-walk', sets: [1800] }] });   // 1 + 0.7
    logged(h.store, { id: 'a', sessionId: 'S-train', completedAt: T0 + 12 * H, cooldownDoneAt: T0 + 12.1 * H, logs: [{ se: 'se-squat', actualSets: 3 }] }); // 0.6 → 0.3 left
    const p = await getOrCreateProfile('u1');
    expect(p.recovery).toBeGreaterThan(51.9);
    expect(p.recovery).toBeLessThanOrEqual(52);
  });
  it('before the rule\'s start is not charged: a row last written in June falls from 2026-09-30, not from June', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(RECOVERY_RULE_SINCE_MS + 14 * DAY);
    profile(h.store, { recovery: 78, lastActiveAt: at(RECOVERY_RULE_SINCE_MS + 14 * DAY - H), lastDecayAt: at(Date.UTC(2026, 5, 15)), updatedAt: at(Date.UTC(2026, 5, 15)) });
    const p = await getOrCreateProfile('u1');
    expect(p.recovery).toBe(64);
  });
  it('a settle that cannot read changes nothing about recovery and never fails the profile read', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0 + 3 * DAY + H);
    profile(h.store, { recovery: 80 });
    h.fail = 'clientSession.findFirst';
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const p = await getOrCreateProfile('u1');
    expect(p.recovery).toBe(80);
    expect(p.strength).toBe(58.5);
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
  it('a brand-new profile is created as before (dice 40–70 on every axis, recovery too) and nothing else is written', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0 + 5 * DAY);
    const p = await getOrCreateProfile('u1');
    expect(h.store.playerProfile).toHaveLength(1);
    for (const a of PRQ_ATTRS) { expect(p[a]).toBeGreaterThanOrEqual(40); expect(p[a]).toBeLessThanOrEqual(70); }
  });
});
