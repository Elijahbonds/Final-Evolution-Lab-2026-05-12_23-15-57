// COACH-VIDEO-REVIEW (2026-10-24): the three route files over the in-memory database — the session, the size cap, and
// the GAP 1 gate (canSaveScanNumbers, called in the route file itself: lib/privacy/scanSaveGate.ts row 1k).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { fakeDb, fakeWorld, type FakeWorld } from '../helpers/fakeFormReviewDb';
import { chain } from '../helpers/formReviewSets';

const h = vi.hoisted(() => ({ session: null as unknown, world: null as unknown, db: null as unknown, canSave: true, canSaveCalls: [] as string[] }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ get prisma() { return h.db; } }));
vi.mock('@/lib/privacy/scanSaveGate', async (orig) => ({
  ...(await orig<typeof import('@/lib/privacy/scanSaveGate')>()),
  canSaveScanNumbers: async (_db: unknown, userId: string) => { h.canSaveCalls.push(userId); return h.canSave; },
}));

import { GET, POST } from '@/app/api/coach/form-reviews/route';
import { DELETE, GET as GET_ONE } from '@/app/api/coach/form-reviews/[id]/route';
import { POST as REPLY } from '@/app/api/coach/form-reviews/[id]/reply/route';
import { buildSubmission, MAX_SUBMISSION_BYTES } from '@/lib/coach/formReview/payload';
import { readSet } from '@/lib/coach/formReview/reader';
import { flagsFor, scoreReps } from '@/lib/coach/formReview/score';
import { resetFormReviewProbe } from '@/lib/coach/formReview/store';

const frames = chain(['squat_clean', 'squat_knee_in_right', 'squat_clean']);
const reps = scoreReps('squat', readSet('squat', frames));
const SUB = buildSubmission({ programId: 'p1', sessionExerciseId: 's1', movement: 'squat', aspect: 0.75, frames, reps, flags: flagsFor('squat', reps) });
const post = (b: unknown) => new NextRequest('http://x/api/coach/form-reviews', { method: 'POST', body: typeof b === 'string' ? b : JSON.stringify(b) });
const as = (id: string | null) => { h.session = id ? { user: { id } } : null; };

let w: FakeWorld;
beforeEach(() => {
  resetFormReviewProbe();
  w = fakeWorld();
  h.world = w; h.db = fakeDb(w); h.canSave = true; h.canSaveCalls = [];
});

describe('POST /api/coach/form-reviews', () => {
  it('signed out: 401, nothing read', async () => {
    as(null);
    expect((await POST(post(SUB))).status).toBe(401);
    expect(h.canSaveCalls).toEqual([]);
  });

  it('asks the GAP 1 gate for the signed-in account, and stores the pose data', async () => {
    as('adult');
    const res = await POST(post(SUB));
    expect(res.status).toBe(200);
    expect(h.canSaveCalls).toEqual(['adult']);
    expect(w.rows).toHaveLength(1);
    expect((await res.json()).flags[0].reason).toBe('Right knee caves on rep 2');
  });

  it('the gate says no: 403, nothing stored', async () => {
    as('adult'); h.canSave = false;
    const res = await POST(post(SUB));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('scan_save_opt_in');
    expect(w.rows).toEqual([]);
  });

  it('a body over the cap is refused by its size, before it is parsed; bad JSON is a 400', async () => {
    as('adult');
    expect((await POST(post('x'.repeat(MAX_SUBMISSION_BYTES + 1)))).status).toBe(413);
    expect((await POST(post('{not json'))).status).toBe(400);
    expect(w.rows).toEqual([]);
  });
});

describe('the queue, one set, the reply, delete', () => {
  it('end to end: the client sends, the coach sees it flagged, opens it, replies to the thread; the client sees it reviewed', async () => {
    as('adult');
    const id = (await (await POST(post(SUB))).json()).id as string;
    as('coach');
    const q = await (await GET(new NextRequest('http://x/api/coach/form-reviews'))).json();
    expect(q.unreviewed).toBe(1);
    expect(q.items[0].flags[0].reason).toBe('Right knee caves on rep 2');
    const one = await (await GET_ONE(new NextRequest(`http://x/api/coach/form-reviews/${id}`), { params: { id } })).json();
    expect(one.review.tracks.length).toBeGreaterThan(0);
    const r = await REPLY(new NextRequest(`http://x/api/coach/form-reviews/${id}/reply`, { method: 'POST', body: JSON.stringify({ cueId: one.presets[0].id }) }), { params: { id } });
    expect(r.status).toBe(200);
    expect(w.messages[0].body).toMatch(/^Form review · Goblet squat, rep 2 \(Right knee caves\)\nCue: /);
    as('adult');
    const mine = await (await GET(new NextRequest('http://x/api/coach/form-reviews?mine=1'))).json();
    expect(mine.items[0].status).toBe('reviewed');
    expect((await DELETE(new NextRequest(`http://x/api/coach/form-reviews/${id}`, { method: 'DELETE' }), { params: { id } })).status).toBe(200);
    expect(w.rows).toEqual([]);
  });

  it('every route refuses a signed-out caller', async () => {
    as(null);
    expect((await GET(new NextRequest('http://x/api/coach/form-reviews'))).status).toBe(401);
    expect((await GET_ONE(new NextRequest('http://x/a/1'), { params: { id: '1' } })).status).toBe(401);
    expect((await DELETE(new NextRequest('http://x/a/1', { method: 'DELETE' }), { params: { id: '1' } })).status).toBe(401);
    expect((await REPLY(new NextRequest('http://x/a/1/reply', { method: 'POST', body: '{}' }), { params: { id: '1' } })).status).toBe(401);
  });
});
