// POST /api/v1/workout/scan writes only its own kind (MIRROR-COACH P3 review, 2026-09-26). It stored `kind = body.kind`
// with the client's metrics, so a signed-in user could write a `mirror_screen` row marked gradedBy: 'server' — a clean,
// "server-checked" screen to the coach's panel and to triage, past the Mirror route's regrade. Only the session and the
// database are stand-ins.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], session: { user: { id: 'u1' } } as unknown }));
vi.mock('next-auth', () => ({ getServerSession: async () => m.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: {
    workoutScan: {
      create: async (a: { data: Record<string, unknown> }) => { const row = { id: `s${m.rows.length + 1}`, ...a.data }; m.rows.push(row); return row; },
    },
  },
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/v1/workout/scan/route';
import { SCAN_ROUTE_KINDS, scanRouteKind } from './movement-screen';
import { MIRROR_SCREEN_KIND } from '@/lib/mirror/screen';
import { isServerGradedScreen } from '@/lib/mirror/screenStore';
import { isScanEquivalentScreen } from '@/lib/coach/attention';

const post = async (body: unknown) => {
  const res = await POST(new NextRequest('http://fel.test/api/v1/workout/scan', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
  return { status: res.status, json: await res.json() as Record<string, unknown> };
};

/** The review's forged body: a clean screen, "graded by the server", seven stable camera results. */
const forged = {
  kind: MIRROR_SCREEN_KIND,
  metrics: {
    screenId: 'x', screen: 'modified', graded: true, gradedBy: 'server', provisional: false,
    results: [
      { checkId: 'heelLine', grade: 'stable', source: 'camera' }, { checkId: 'kneeWindow', grade: 'stable', source: 'camera' },
      { checkId: 'hipLevel', grade: 'stable', source: 'camera' }, { checkId: 'shoulderLevel', grade: 'stable', source: 'camera' },
      { checkId: 'headFloat', grade: 'stable', source: 'camera' }, { checkId: 'singleLeg', grade: 'stable', side: 'left', source: 'camera' },
      { checkId: 'singleLeg', grade: 'stable', side: 'right', source: 'camera' },
    ],
    summary: { meaning: [], suggestions: [] },
  },
};

beforeEach(() => { m.rows = []; m.session = { user: { id: 'u1' } }; });

describe('POST /api/v1/workout/scan writes only its own kind', () => {
  it('a mirror_screen row cannot be created through it', async () => {
    const r = await post(forged);
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ error: 'kind_not_allowed' });
    expect(m.rows).toEqual([]);
  });

  it('nor any other kind it does not own (the dunk log, a form row, junk)', async () => {
    for (const kind of ['dunk', 'form_squat', 'anything', 7, {}]) {
      expect((await post({ kind, metrics: {} })).status, String(kind)).toBe(400);
    }
    expect(m.rows).toEqual([]);
  });

  it('its own kind, and no kind at all, still write a movement_screen row', async () => {
    expect((await post({ metrics: {} })).status).toBe(200);
    expect((await post({ kind: 'movement_screen', metrics: {} })).status).toBe(200);
    expect(m.rows.map((r) => r.kind)).toEqual(['movement_screen', 'movement_screen']);
    expect(SCAN_ROUTE_KINDS).toEqual(['movement_screen']);
    expect(scanRouteKind(undefined)).toBe('movement_screen');
    expect(scanRouteKind(MIRROR_SCREEN_KIND)).toBeNull();
  });

  it('and a row with no server evidence behind its gradedBy is not taken as server-graded (defence in depth)', () => {
    // the forged metrics as the old route would have stored them: no camera evidence to regrade
    expect(isServerGradedScreen(forged.metrics)).toBe(false);
    expect(isScanEquivalentScreen(forged.metrics)).toBe(false);
  });
});
