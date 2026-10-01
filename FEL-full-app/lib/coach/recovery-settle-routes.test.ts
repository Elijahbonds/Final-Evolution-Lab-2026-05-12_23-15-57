// MIRROR-COACH P9 (2026-09-30): the two coach routes that finish recovery work settle PRQ recovery right after it lands.
//
// POST /api/coach/me/log with `complete` (an off day, easy-cardio minutes, a coach-written cool-down — all counted at
// Done) and POST /api/coach/me/cooldown with a NEW stamp (Today's cool-down, counted once its session is Done) call
// lib/prq-recovery.ts settleRecoveryFor after the save succeeds, so the athlete and the coach see the credit at once
// instead of at the player's next visit. It is best-effort: a refused save never settles, a save that does not finish
// anything never settles, a repeat tap never settles, and what the settle says never changes the route's answer.
// (The settle itself — what it reads and writes — is lib/prq-recovery.test.ts.)
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  user: 'client-1' as string | null,
  save: null as unknown,
  cool: null as unknown,
  settle: vi.fn(async () => ({ ok: true, written: true, recovery: 51 })),
}));

vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', () => ({ prisma: { __fake: 'prisma' } }));
vi.mock('@/lib/coach/todayServer', () => ({ saveClientLog: async () => h.save }));
vi.mock('@/lib/coach/cooldownServer', () => ({ recordCooldown: async () => h.cool }));
vi.mock('@/lib/prq-recovery', () => ({ settleRecoveryFor: (...a: unknown[]) => (h.settle as (...x: unknown[]) => unknown)(...a) }));

import { NextRequest } from 'next/server';
import { POST as logPOST } from '@/app/api/coach/me/log/route';
import { POST as cooldownPOST } from '@/app/api/coach/me/cooldown/route';
import { prisma } from '@/lib/db';

const post = (url: string, body: unknown) => new NextRequest(`http://fel.test${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const CS = { id: 'cs1', completedAt: '2026-10-05T10:00:00.000Z', exerciseLogs: [] };

beforeEach(() => {
  h.user = 'client-1';
  h.settle.mockClear();
  h.settle.mockImplementation(async () => ({ ok: true, written: true, recovery: 51 }));
});

describe('POST /api/coach/me/log', () => {
  it('a save that completes the session settles recovery once, for this user, after the save', async () => {
    h.save = { ok: true, clientSession: CS };
    const res = await logPOST(post('/api/coach/me/log', { programId: 'p', sessionId: 's', logs: [], complete: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ clientSession: CS });
    expect(h.settle).toHaveBeenCalledTimes(1);
    expect(h.settle).toHaveBeenCalledWith(prisma, 'client-1');
  });
  it('a save that does not complete anything does not settle (nothing new can count yet)', async () => {
    h.save = { ok: true, clientSession: { ...CS, completedAt: null } };
    await logPOST(post('/api/coach/me/log', { programId: 'p', sessionId: 's', logs: [] }));
    await logPOST(post('/api/coach/me/log', { programId: 'p', sessionId: 's', logs: [], complete: false }));
    expect(h.settle).not.toHaveBeenCalled();
  });
  it('a refused save never settles and answers exactly as before', async () => {
    h.save = { ok: false, status: 403, error: 'health_hard_stopped' };
    const res = await logPOST(post('/api/coach/me/log', { programId: 'p', sessionId: 's', logs: [], complete: true }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'health_hard_stopped' });
    expect(h.settle).not.toHaveBeenCalled();
  });
  it('a settle that fails changes nothing about the answer', async () => {
    h.save = { ok: true, clientSession: CS };
    h.settle.mockImplementation(async () => ({ ok: false, reason: 'error' }) as never);
    const res = await logPOST(post('/api/coach/me/log', { programId: 'p', sessionId: 's', logs: [], complete: true }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ clientSession: CS });
  });
  it('signed out: 401, no settle', async () => {
    h.user = null;
    expect((await logPOST(post('/api/coach/me/log', { complete: true }))).status).toBe(401);
    expect(h.settle).not.toHaveBeenCalled();
  });
});

describe('POST /api/coach/me/cooldown', () => {
  it('a new stamp settles recovery once, and the answer is the stamp', async () => {
    h.cool = { ok: true, clientSessionId: 'cs1', cooldownDoneAt: '2026-10-05T10:05:00.000Z', already: false };
    const res = await cooldownPOST(post('/api/coach/me/cooldown', { programId: 'p', sessionId: 's' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ clientSessionId: 'cs1', cooldownDoneAt: '2026-10-05T10:05:00.000Z', already: false });
    expect(h.settle).toHaveBeenCalledTimes(1);
    expect(h.settle).toHaveBeenCalledWith(prisma, 'client-1');
  });
  it('a repeat tap (already stamped) does not settle again', async () => {
    h.cool = { ok: true, clientSessionId: 'cs1', cooldownDoneAt: '2026-10-05T10:05:00.000Z', already: true };
    await cooldownPOST(post('/api/coach/me/cooldown', { programId: 'p', sessionId: 's' }));
    expect(h.settle).not.toHaveBeenCalled();
  });
  it('a refused tap never settles', async () => {
    h.cool = { ok: false, status: 409, error: 'cooldown_window_passed' };
    const res = await cooldownPOST(post('/api/coach/me/cooldown', { programId: 'p', sessionId: 's' }));
    expect(res.status).toBe(409);
    expect(h.settle).not.toHaveBeenCalled();
  });
});
