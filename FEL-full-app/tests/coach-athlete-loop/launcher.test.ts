// PLAT-P06 (2026-10-28): Today as the coached athlete's launcher, mounted with the hooks rig on the REAL route's payload
// (the coach replied after the last session): the reply is the first card, then the session and its ONE primary, Start
// today's session; Start opens the phase-1 player with the coach's session, the reply on top of its first exercise; the
// full session (every card, its logging, Save and Done) is still there, behind "Full session". And /training sends
// everyone to Today.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importOriginal) => (await import('@/tests/helpers/hookRuntime')).hookedReact(await importOriginal()));
const h = vi.hoisted(() => ({ user: 'client-1' as string | null, store: null as unknown as import('@/tests/helpers/athleteLoopDb').LoopStore, session: null as unknown }));
vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', async () => {
  const { athleteLoopDb } = await import('@/tests/helpers/athleteLoopDb');
  return { prisma: new Proxy({}, { get: (_t, k) => (athleteLoopDb(h.store) as Record<string | symbol, unknown>)[k] }) };
});
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); } }));

import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import type { ReactNode } from 'react';
import { GET as todayGET } from '@/app/api/coach/me/today/route';
import { POST as logPOST } from '@/app/api/coach/me/log/route';
import { POST as messagePOST } from '@/app/api/coach/messages/route';
import { catalogueRow, newTodayStore, seedProgram } from '@/lib/coach/todayMemoryDb';
import { TodayView } from '@/app/coach/_components/today-view';
import TrainingPage from '@/app/training/page';
import { CoachSessionPlayer } from '@/components/session-player/coach-player';
import { CoachReplyCard } from '@/components/session-player/coach-reply';
import { SessionPlayer } from '@/components/session-player/session-player';
import { PrimaryCta } from '@/components/ui/fel/primary-cta';
import { COACH_PLAYER_COPY as C } from '@/components/session-player/coach-copy';
import { mount } from '@/tests/helpers/hookRuntime';
import { findAll } from '@/tests/helpers/driveRender';
import type { TodayPayloadPlus } from '@/lib/coach/coachReply';

let PID = '', S: string[] = [];
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
async function post(handler: (r: NextRequest) => Promise<Response>, url: string, body: Record<string, unknown>, as: string) {
  h.user = as;
  return handler(new NextRequest(`http://fel.test${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
}

beforeEach(async () => {
  h.store = { ...newTodayStore(), messages: [] };
  h.store.user.push({ id: 'coach-1', name: 'Dee', email: 'dee@x.test' }, { id: 'client-1', name: 'Sam', email: 'sam@x.test', dobYear: 1990 });
  h.store.pe.push(catalogueRow({ id: 'pe-goblet', coachId: 'coach-1', name: 'Goblet Squat', pattern: 'squat' }));
  ({ programId: PID, sessionIds: S } = seedProgram(h.store, {
    coachId: 'coach-1', clientId: 'client-1', name: 'Base block', blockLabel: 'Week 1',
    sessions: [1, 2].map((n) => ({ order: n, label: `Day ${n}`, exercises: [{ exerciseId: 'pe-goblet', section: 'key', isKeySet: true, sets: 3, reps: '5' }] })),
  }));
  expect((await post(logPOST, '/api/coach/me/log', { programId: PID, sessionId: S[0], logs: [], complete: true }, 'client-1')).status).toBe(200);
  await new Promise((r) => setTimeout(r, 3));
  expect((await post(messagePOST, '/api/coach/messages', { programId: PID, body: 'Great depth. Same weight today.' }, 'coach-1')).status).toBe(200);
});
afterEach(() => { vi.unstubAllGlobals(); });

async function mountToday() {
  h.user = 'client-1';
  const payload = await (await todayGET()).json() as TodayPayloadPlus;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => (String(url).startsWith('/today') ? payload : {}) })));
  const api = { today: '/today', log: '/log', messages: null };
  const seen: boolean[] = [];
  const onSession = (b: boolean) => { seen.push(b); };
  const m = mount(() => TodayView({ api, onSession }));
  await settle();
  return { m, payload, seen };
}

describe("Today, the coached athlete's launcher", () => {
  it('the coach\'s reply is the first card, then the session with ONE primary: Start today\'s session', async () => {
    const { m, payload, seen } = await mountToday();
    expect(payload.reply?.body).toBe('Great depth. Same weight today.');
    const root = m.tree as { props: { children: ReactNode[] } };
    const order = findAll(root as unknown as ReactNode, (el) => el.type === CoachReplyCard || (el.props as Record<string, unknown>)['data-today-launcher'] !== undefined);
    expect(order[0].type).toBe(CoachReplyCard);
    expect((order[0].props as { reply: { body: string } }).reply.body).toBe('Great depth. Same weight today.');
    const primaries = findAll(root as unknown as ReactNode, (el) => el.type === PrimaryCta);
    expect(primaries).toHaveLength(1);
    expect(primaries[0].props.children).toBe(C.start);
    expect(seen.at(-1)).toBe(true);                               // coach-view steps Court session down
    m.unmount();
  });

  it('Start opens the phase-1 player with the coach\'s session; its first screen carries the reply', async () => {
    const { m } = await mountToday();
    const start = findAll(m.tree as ReactNode, (el) => el.type === PrimaryCta)[0];
    (start.props.onClick as () => void)();
    await settle();
    const player = findAll(m.tree as ReactNode, (el) => el.type === CoachSessionPlayer)[0];
    expect(player).toBeTruthy();
    const props = player.props as unknown as Parameters<typeof CoachSessionPlayer>[0];
    expect(props.coach.session.steps.map((s) => s.name)).toContain('Goblet Squat');
    expect(props.coach.session.title).toBe('Week 1 · Day 2');
    // FEL's warm-up first (the coach wrote no Prep), its cool-down last
    expect(props.coach.refs[0].kind).toBe('warmup');
    expect(props.coach.refs.at(-1)!.kind).toBe('cooldown');
    const inner = mount(() => CoachSessionPlayer(props));
    const sp = inner.tree as { type: unknown; props: { lead: { type: unknown }; mode: string } };
    expect(sp.type).toBe(SessionPlayer);
    expect(sp.props.mode).toBe('save');
    expect(sp.props.lead.type).toBe(CoachReplyCard);
    inner.unmount(); m.unmount();
  });

  it('nothing was taken away: every card, its logging, Save and Done sit behind "Full session"', () => {
    const src = readFileSync('app/coach/_components/today-view.tsx', 'utf8');
    const at = src.indexOf('<LauncherSheet id="plan"');
    const plan = src.slice(at, src.indexOf('</LauncherSheet>', at));
    for (const piece of ['<NextMorningFollowUps />', '<ReadinessCheckInCard ', '<WarmupPrep ', 'card(b.item, b.label)', '<CooldownCard ', 'submit(false)', 'submit(true)', '<GateHeldList ']) expect(plan).toContain(piece);
    expect(src).toContain('<LauncherSheet id="thread"');
    expect(src).toContain('<ThreadMessages thread={thread} />');
  });
});

describe('/training: one home', () => {
  it('a signed-in athlete goes to Today; signed out, to sign in first (and back through /training)', async () => {
    h.session = { user: { id: 'client-1' } };
    await expect(TrainingPage()).rejects.toMatchObject({ to: '/coach' });
    h.session = null;
    await expect(TrainingPage()).rejects.toMatchObject({ to: expect.stringContaining('/login') });
  });
  it('TrainingDashboard stays in the tree, unmounted, and says why', () => {
    expect(readFileSync('components/training/TrainingDashboard.tsx', 'utf8')).toMatch(/PLAT-P06 \(2026-10-28\): UNMOUNTED, kept on purpose/);
    expect(readFileSync('app/training/page.tsx', 'utf8')).not.toMatch(/from '@\/components\/training/);
  });
});
