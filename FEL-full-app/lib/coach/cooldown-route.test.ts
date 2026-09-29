// POST /api/coach/me/cooldown, run for real over the in-memory Today store (MIRROR-COACH P6, 2026-09-29). Only the
// session and the database are stand-ins (lib/coach/todayMemoryDb.ts refuses a ClientSession column the schema does
// not have, the way Prisma would). The lane's database is offline and :3131 was down, so this is the proof the done
// tap lands where P9 will read it.
//
// The trips: cool down before pressing Done (the open session is stamped; Done keeps the stamp); press Done first and
// cool down after (the session just completed is stamped — no second row); tap twice (the first time stands); and the
// refusals — someone else's program, a paused program, a session not in it, a session whose coach wrote a Cool-down,
// an off day, and a standing intake red flag (checked first, nothing written).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const h = vi.hoisted(() => ({ user: 'client-1' as string | null, store: null as unknown as import('./todayMemoryDb').TodayStore }));

vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', async () => {
  const { todayMemoryDb } = await import('./todayMemoryDb');
  return { prisma: new Proxy({}, { get: (_t, k) => (todayMemoryDb(h.store) as Record<string | symbol, unknown>)[k] }) };
});

import { NextRequest } from 'next/server';
import { POST as cooldownPOST } from '@/app/api/coach/me/cooldown/route';
import { GET as todayGET } from '@/app/api/coach/me/today/route';
import { POST as logPOST } from '@/app/api/coach/me/log/route';
import { CLIENT_SESSION_WRITABLE, catalogueRow, newTodayStore, seedProgram } from './todayMemoryDb';
import { COOLDOWN_TAP_WINDOW_MS, needsAutoCooldown } from './cooldown';
import { COOLDOWN_DONE_WHERE } from './offDay';
import { showsNextCooldown } from '@/app/coach/_components/today-view';
import type { TodayPayload } from './todayServer';

type Row = Record<string, any>;
let PID = '', S1 = '', S2 = '', S3 = '';

const post = (url: string, body: unknown) => new NextRequest(`http://fel.test${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
async function cooldown(body: Row, as = 'client-1') {
  h.user = as;
  const res = await cooldownPOST(post('/api/coach/me/cooldown', body));
  return { status: res.status, json: await res.json() as Row };
}
async function today(as = 'client-1') {
  h.user = as;
  const res = await todayGET();
  return await res.json() as TodayPayload;
}
async function log(body: Row, as = 'client-1') {
  h.user = as;
  const res = await logPOST(post('/api/coach/me/log', body));
  return { status: res.status, json: await res.json() as Row };
}
const rowsFor = (sessionId: string) => h.store.cs.filter((c) => c.sessionId === sessionId);

beforeEach(() => {
  h.store = newTodayStore();
  h.store.user.push({ id: 'coach-1', name: 'Coach One', email: 'c1@x.test' }, { id: 'client-1', name: 'Sam', email: 'sam@x.test', dobYear: 1995 }, { id: 'client-2', name: 'Ria', email: 'ria@x.test' });
  h.store.pe.push(
    catalogueRow({ id: 'pe-goblet', coachId: 'coach-1', name: 'Goblet Squat', pattern: 'squat' }),
    catalogueRow({ id: 'pe-row', coachId: 'coach-1', name: 'Half-kneeling Row', pattern: 'pull' }),
    catalogueRow({ id: 'pe-croc', coachId: 'coach-1', name: 'Crocodile Breathing', pattern: 'breath' }),
  );
  const ids = seedProgram(h.store, {
    coachId: 'coach-1', clientId: 'client-1', name: 'Base block', blockLabel: 'Week 1',
    sessions: [
      { order: 1, label: 'Day 1', exercises: [{ exerciseId: 'pe-goblet', section: 'key', isKeySet: true }, { exerciseId: 'pe-row', section: 'assist' }] },
      // the coach wrote this one's cool-down
      { order: 2, label: 'Day 2', exercises: [{ exerciseId: 'pe-goblet', section: 'key' }, { exerciseId: 'pe-croc', section: 'cooldown', workSeconds: 90, reps: '90 s' }] },
      { order: 3, label: 'Off day · recovery', kind: 'recovery', exercises: [{ exerciseId: 'pe-croc', section: 'cooldown', workSeconds: 180, reps: '180 s' }] },
    ],
  });
  PID = ids.programId; [S1, S2, S3] = ids.sessionIds;
});

describe('the done tap stamps the coached session it followed', () => {
  it('before Done: the open session is stamped (made if there is none), Today says so, and Done keeps the stamp', async () => {
    const t0 = await today();
    expect(t0.today!.session.id).toBe(S1);
    expect(t0.open).toBeNull();
    const r = await cooldown({ programId: PID, sessionId: S1 });
    expect(r.status).toBe(200);
    expect(r.json.already).toBe(false);
    expect(rowsFor(S1)).toHaveLength(1);
    const cs = rowsFor(S1)[0];
    expect(cs.completedAt).toBeNull();
    expect(cs.cooldownDoneAt).toBeInstanceOf(Date);
    expect(r.json.clientSessionId).toBe(cs.id);
    expect((await today()).open).toMatchObject({ id: cs.id, cooldownDone: true });
    // Done: the same row completes, the stamp stays
    expect((await log({ programId: PID, sessionId: S1, logs: [], complete: true })).status).toBe(200);
    expect(rowsFor(S1)).toHaveLength(1);
    expect(rowsFor(S1)[0].completedAt).toBeInstanceOf(Date);
    expect(rowsFor(S1)[0].cooldownDoneAt).toEqual(cs.cooldownDoneAt);
  });

  it('after Done: the session just completed is stamped — no second row — and a second tap keeps the first time', async () => {
    expect((await log({ programId: PID, sessionId: S1, logs: [], complete: true })).status).toBe(200);
    expect(rowsFor(S1)).toHaveLength(1);
    const first = await cooldown({ programId: PID, sessionId: S1 });
    expect(first.status).toBe(200);
    expect(rowsFor(S1)).toHaveLength(1);
    expect(rowsFor(S1)[0].cooldownDoneAt).toBeInstanceOf(Date);
    const again = await cooldown({ programId: PID, sessionId: S1 });
    expect(again.status).toBe(200);
    expect(again.json.already).toBe(true);
    expect(again.json.cooldownDoneAt).toBe(first.json.cooldownDoneAt);
    expect(rowsFor(S1)).toHaveLength(1);
  });

  // MIRROR-COACH P6 FIX (2026-09-29, code review): this pinned the opposite — a tap on a session completed longer ago
  // than the window opened a NEW open row "for today's go at the session". Today never serves a completed session again
  // (nextSession skips it), so the only such tap is the finished card left open past the window, and the new row was a
  // second, never-completed row on a done session, stamped as a cool-down. Refused now; nothing written.
  it('a completion from long ago is not this cool-down: 409 cooldown_window_passed, and no second row on a done session', async () => {
    const long = new Date(Date.now() - COOLDOWN_TAP_WINDOW_MS - 60_000);
    h.store.cs.push({ id: 'cs-old', programId: PID, sessionId: S1, clientId: 'client-1', completedAt: long, cooldownDoneAt: null, createdAt: long, updatedAt: long });
    const r = await cooldown({ programId: PID, sessionId: S1 });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe('cooldown_window_passed');
    expect(rowsFor(S1).map((c) => c.id)).toEqual(['cs-old']);
    expect(h.store.cs.find((c) => c.id === 'cs-old')!.cooldownDoneAt).toBeNull();
  });
});

// MIRROR-COACH P6 FIX (2026-09-29, code review — "after Done, the cool-down card by the Done button belongs to the next
// session"). Today's view has no DOM runner here (node environment), so the flow is proven in its three parts: the
// server (which row each tap lands on), the P9 filter (what counts), and the view's rule for which card it renders
// (showsNextCooldown, read from the component's own source).
describe('Done on X, then the cool-down tap the screen shows: X is the one stamped', () => {
  let X = '', Y = '';
  beforeEach(() => {
    h.store = newTodayStore();
    h.store.user.push({ id: 'coach-1', name: 'Coach One', email: 'c1@x.test' }, { id: 'client-1', name: 'Sam', email: 'sam@x.test', dobYear: 1995 });
    h.store.pe.push(catalogueRow({ id: 'pe-goblet', coachId: 'coach-1', name: 'Goblet Squat', pattern: 'squat' }));
    const ids = seedProgram(h.store, {
      coachId: 'coach-1', clientId: 'client-1', name: 'Two days', blockLabel: 'Week 1',
      sessions: [
        { order: 1, label: 'Day 1', exercises: [{ exerciseId: 'pe-goblet', section: 'key', isKeySet: true }] },
        { order: 2, label: 'Day 2', exercises: [{ exerciseId: 'pe-goblet', section: 'key', isKeySet: true }] },
      ],
    });
    PID = ids.programId; [X, Y] = ids.sessionIds;
  });
  /** P9's predicate, run over the in-memory rows the way Postgres would. */
  const countedCooldowns = () => h.store.cs.filter((c) => (COOLDOWN_DONE_WHERE.cooldownDoneAt.not === null ? c.cooldownDoneAt != null : true)
    && (COOLDOWN_DONE_WHERE.completedAt.not === null ? c.completedAt != null : true));

  it('after Done, Today moves to Y — and the view renders no Y card while X\'s finished card is up', async () => {
    expect((await today()).today!.session.id).toBe(X);
    const x = (await today()).today!.session;
    expect(needsAutoCooldown(x.exercises, x.kind)).toBe(true);
    expect((await log({ programId: PID, sessionId: X, logs: [], complete: true })).status).toBe(200);
    expect((await today()).today!.session.id).toBe(Y);
    // the view's rule: with X's finished card up, Y's card is not rendered — the only done tap on screen is X's
    expect(showsNextCooldown({ sessionId: X })).toBe(false);
    expect(showsNextCooldown(null)).toBe(true);
    const src = readFileSync('app/coach/_components/today-view.tsx', 'utf8');
    expect(src).toMatch(/\{!showsNextCooldown\(finished\) \? null : \(\s*<CooldownCard key=\{`cooldown-\$\{today\.session\.id\}`\}/);
    expect(src).toContain('sessionId={finished.sessionId}');
    // the tap on screen is the finished card's: it lands on X, the row Done just completed
    const r = await cooldown({ programId: PID, sessionId: X });
    expect(r.status).toBe(200);
    expect(rowsFor(X)).toHaveLength(1);
    expect(rowsFor(X)[0].cooldownDoneAt).toBeInstanceOf(Date);
    expect(rowsFor(Y)).toHaveLength(0);
    // and Y opens clean: nothing reads "done" before any work
    expect((await today()).open).toBeNull();
    expect(countedCooldowns().map((c) => c.sessionId)).toEqual([X]);
  });

  it('the old misattribution, measured: a tap on Y\'s card opened a row for Y stamped done — P9 no longer counts it', async () => {
    expect((await log({ programId: PID, sessionId: X, logs: [], complete: true })).status).toBe(200);
    // what the bottom card used to send (Y's id)
    expect((await cooldown({ programId: PID, sessionId: Y })).status).toBe(200);
    expect(rowsFor(Y)).toHaveLength(1);
    expect(rowsFor(Y)[0]).toMatchObject({ completedAt: null });
    expect((await today()).open).toMatchObject({ cooldownDone: true });   // Y read "done" before any work
    // the count P9 reads needs the session completed: a cool-down after no work is not counted
    expect(countedCooldowns()).toEqual([]);
    expect(COOLDOWN_DONE_WHERE).toEqual({ cooldownDoneAt: { not: null }, completedAt: { not: null } });
  });
});

describe('refusals, and nothing written on any of them', () => {
  const nothingWritten = () => expect(h.store.cs).toHaveLength(0);
  it("someone else's program → 403", async () => {
    expect((await cooldown({ programId: PID, sessionId: S1 }, 'client-2')).json.error).toBe('forbidden');
    nothingWritten();
  });
  it('a paused program → 409; a session not in the program → 404', async () => {
    h.store.program[0].isActive = false;
    expect((await cooldown({ programId: PID, sessionId: S1 })).status).toBe(409);
    h.store.program[0].isActive = true;
    const r = await cooldown({ programId: PID, sessionId: 'nope' });
    expect([r.status, r.json.error]).toEqual([404, 'session_not_found']);
    nothingWritten();
  });
  it("a session whose coach wrote a Cool-down → 409 coach_cooldown (theirs is logged like any exercise)", async () => {
    const r = await cooldown({ programId: PID, sessionId: S2 });
    expect([r.status, r.json.error]).toEqual([409, 'coach_cooldown']);
    nothingWritten();
  });
  it('an off day → 409 recovery_session (its Cool-down section is the session itself)', async () => {
    const r = await cooldown({ programId: PID, sessionId: S3 });
    expect([r.status, r.json.error]).toEqual([409, 'recovery_session']);
    nothingWritten();
  });
  it('a standing intake red flag → 403 health_hard_stopped, checked before anything else', async () => {
    h.store.healthIntake.push({ id: 'hi-1', userId: 'client-1', redFlags: ['chest_pain'], clearedAt: null, createdAt: new Date() });
    const r = await cooldown({ programId: PID, sessionId: S1 });
    expect([r.status, r.json.error]).toEqual([403, 'health_hard_stopped']);
    nothingWritten();
  });
  it('no session → 401', async () => {
    h.user = null;
    expect((await cooldownPOST(post('/api/coach/me/cooldown', { programId: PID, sessionId: S1 }))).status).toBe(401);
  });
});

describe('the store is held to the schema', () => {
  it('CLIENT_SESSION_WRITABLE is exactly ClientSession\'s writable columns in prisma/schema.prisma', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8');
    const body = /model ClientSession \{([\s\S]*?)\n\}/.exec(schema)![1];
    const cols = [...body.matchAll(/^\s+(\w+)\s+(\w+)(\?|\[\])?/gm)]
      .filter((m) => !['id', 'createdAt', 'updatedAt'].includes(m[1]) && /^(String|Int|Boolean|DateTime|Float|Json)$/.test(m[2]))
      .map((m) => m[1]);
    expect([...CLIENT_SESSION_WRITABLE].sort()).toEqual(cols.sort());
    expect(cols).toContain('cooldownDoneAt');
  });
});
