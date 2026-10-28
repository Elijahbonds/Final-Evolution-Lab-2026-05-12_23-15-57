// PLAT-P06 (2026-10-28): the coached athlete's loop, through the REAL routes over one in-memory store
// (tests/helpers/athleteLoopDb.ts): the athlete finishes a session (POST /api/coach/me/log), the coach replies in the
// thread (POST /api/coach/messages — what "Needs you today"'s reply, cue and nudge buttons write), and the athlete's next
// GET /api/coach/me/today carries the reply on top. Once they complete the session after it, it steps down: it stays in
// the thread, where it always was.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ user: 'client-1' as string | null, store: null as unknown as import('@/tests/helpers/athleteLoopDb').LoopStore }));

vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', async () => {
  const { athleteLoopDb } = await import('@/tests/helpers/athleteLoopDb');
  return { prisma: new Proxy({}, { get: (_t, k) => (athleteLoopDb(h.store) as Record<string | symbol, unknown>)[k] }) };
});

import { NextRequest } from 'next/server';
import { GET as todayGET } from '@/app/api/coach/me/today/route';
import { POST as logPOST } from '@/app/api/coach/me/log/route';
import { POST as messagePOST } from '@/app/api/coach/messages/route';
import { catalogueRow, newTodayStore, seedProgram } from '@/lib/coach/todayMemoryDb';
import { REPLY_FRESH_DAYS, pickCoachReply, type TodayPayloadPlus } from '@/lib/coach/coachReply';

type Row = Record<string, unknown>;
let PID = '', S: string[] = [];
const tick = () => new Promise((r) => setTimeout(r, 3));

async function today(as = 'client-1'): Promise<TodayPayloadPlus> {
  h.user = as;
  const res = await todayGET();
  expect(res.status).toBe(200);
  return res.json();
}
async function post(handler: (r: NextRequest) => Promise<Response>, url: string, body: Row, as: string) {
  h.user = as;
  const res = await handler(new NextRequest(`http://fel.test${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
  return { status: res.status, json: await res.json() as Row };
}
const done = async (sessionId: string) => {
  const r = await post(logPOST, '/api/coach/me/log', { programId: PID, sessionId, logs: [], complete: true }, 'client-1');
  expect(r.status).toBe(200);
  await tick();
};
const say = async (body: string, as = 'coach-1') => {
  const r = await post(messagePOST, '/api/coach/messages', { programId: PID, body }, as);
  expect(r.status).toBe(200);
  await tick();
};

beforeEach(() => {
  h.store = { ...newTodayStore(), messages: [] };
  h.store.user.push({ id: 'coach-1', name: 'Dee', email: 'dee@x.test' }, { id: 'client-1', name: 'Sam', email: 'sam@x.test', dobYear: 1990 });
  h.store.pe.push(catalogueRow({ id: 'pe-goblet', coachId: 'coach-1', name: 'Goblet Squat', pattern: 'squat' }));
  const ids = seedProgram(h.store, {
    coachId: 'coach-1', clientId: 'client-1', name: 'Base block', blockLabel: 'Week 1',
    sessions: [1, 2, 3].map((n) => ({ order: n, label: `Day ${n}`, exercises: [{ exerciseId: 'pe-goblet', section: 'key', isKeySet: true }] })),
  });
  PID = ids.programId; S = ids.sessionIds;
});

describe('the coach replies, and the next session opens with it', () => {
  it('session → coach reply → the next GET of Today has the reply on top; after the next session it steps down', async () => {
    await done(S[0]);
    const before = await today();
    expect(before.today!.session.id).toBe(S[1]);
    expect(before.reply).toBeUndefined();                       // nothing said since the session: no card at all

    await say('Nice depth on Monday. Add 2.5 kg to the goblet squat today.');
    const next = await today();
    expect(next.today!.session.id).toBe(S[1]);                  // the NEXT session…
    expect(next.reply).toMatchObject({ from: 'Dee', kind: 'message', exercise: null, body: 'Nice depth on Monday. Add 2.5 kg to the goblet squat today.' });

    // the athlete's own message is not the coach's reply; the coach's newest word wins
    await say('Will do!', 'client-1');
    await say('And film your second set for me.');
    expect((await today()).reply?.body).toBe('And film your second set for me.');

    await done(S[1]);
    const after = await today();
    expect(after.today!.session.id).toBe(S[2]);
    expect(after.reply).toBeUndefined();                         // answered by training: it stays in the thread only
    expect(h.store.messages.map((m) => m.body)).toEqual(['Nice depth on Monday. Add 2.5 kg to the goblet squat today.', 'Will do!', 'And film your second set for me.']);
  });

  it('a reply before the athlete has finished any session still opens their first one', async () => {
    await say('Welcome! Start easy this week.');
    expect((await today()).reply?.body).toBe('Welcome! Start easy this week.');
  });

  it('another athlete never reads it, and a stranger cannot write into the thread', async () => {
    h.store.user.push({ id: 'client-2', name: 'Alex', email: 'alex@x.test', dobYear: 1991 });
    await say('Only for Sam.');
    expect((await today('client-2')).reply).toBeUndefined();
    const r = await post(messagePOST, '/api/coach/messages', { programId: PID, body: 'hi' }, 'client-2');
    expect(r.status).toBe(403);
  });
});

describe('pickCoachReply, the rule', () => {
  const now = new Date('2026-10-28T12:00:00Z');
  const at = (h: number) => new Date(now.getTime() - h * 3_600_000);
  it('the newest of messages and log comments since the last session, within the freshness window', () => {
    const r = pickCoachReply({
      coachName: 'Dee', since: at(48), now,
      messages: [{ id: 'm1', body: 'Good week.', createdAt: at(10) }],
      comments: [{ exercise: 'Goblet Squat', comment: 'Knees out on rep 4.', at: at(2) }, { exercise: 'Row', comment: 'old', at: at(60) }],
    });
    expect(r).toMatchObject({ kind: 'comment', exercise: 'Goblet Squat', body: 'Knees out on rep 4.' });
  });
  it(`nothing older than ${REPLY_FRESH_DAYS} days, nothing blank, nothing from before the last session`, () => {
    expect(pickCoachReply({ coachName: 'Dee', since: null, now, messages: [{ id: 'm', body: 'old', createdAt: at(24 * (REPLY_FRESH_DAYS + 1)) }], comments: [] })).toBeNull();
    expect(pickCoachReply({ coachName: 'Dee', since: null, now, messages: [{ id: 'm', body: '   ', createdAt: at(1) }], comments: [] })).toBeNull();
    expect(pickCoachReply({ coachName: 'Dee', since: at(1), now, messages: [{ id: 'm', body: 'before', createdAt: at(2) }], comments: [] })).toBeNull();
  });
});
