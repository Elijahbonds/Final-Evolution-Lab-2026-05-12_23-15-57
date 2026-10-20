// GET /api/feel-panel (feel-panel lane, owner 2026-10-20): the panel opens only when the server flag FEEL_PANEL_ENABLED is on AND the
// signed-in user passes the repo's one admin check, lib/admin/requireAdmin (role === 'admin'). requireAdmin runs for real here; only the
// session it reads is a stand-in (as lib/admin/coachAdminGate.test.ts does).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: null as { user?: { id?: string; role?: string } } | null, sessionReads: 0 }));
vi.mock('next-auth', () => ({ getServerSession: async () => { h.sessionReads++; return h.session; } }));
vi.mock('@/lib/db', () => ({ prisma: {} }));

import { GET } from '@/app/api/feel-panel/route';
import { isFeelPanelEnabled } from '@/lib/flags';

const saved = process.env.FEEL_PANEL_ENABLED;
beforeEach(() => { delete process.env.FEEL_PANEL_ENABLED; h.session = null; h.sessionReads = 0; });
afterEach(() => { if (saved === undefined) delete process.env.FEEL_PANEL_ENABLED; else process.env.FEEL_PANEL_ENABLED = saved; });

const as = (role?: string) => { h.session = role === undefined ? null : { user: { id: 'u1', role } }; };
const call = async () => { const r = await GET(); return { status: r.status, body: await r.json(), cache: r.headers.get('cache-control') }; };

describe('FEEL_PANEL_ENABLED (lib/flags.ts)', () => {
  it('is OFF unless set to 1 / true / on / yes', () => {
    expect(isFeelPanelEnabled()).toBe(false);
    for (const v of ['', '0', 'false', 'off', 'no', 'maybe']) { process.env.FEEL_PANEL_ENABLED = v; expect(isFeelPanelEnabled(), v).toBe(false); }
    for (const v of ['1', 'true', 'TRUE', 'on', 'yes']) { process.env.FEEL_PANEL_ENABLED = v; expect(isFeelPanelEnabled(), v).toBe(true); }
  });
});

describe('GET /api/feel-panel', () => {
  it('answers 200 every time (no red console line for every player on every /play visit)', async () => {
    for (const flag of [undefined, '1']) for (const role of [undefined, 'player', 'admin']) {
      if (flag) process.env.FEEL_PANEL_ENABLED = flag; else delete process.env.FEEL_PANEL_ENABLED;
      as(role);
      expect((await call()).status, `${flag} ${role}`).toBe(200);
    }
  });
  it('flag OFF: closed for everyone — an admin too — and no session is read', async () => {
    for (const role of [undefined, 'player', 'coach', 'owner', 'admin']) {
      as(role);
      expect(await call(), String(role)).toEqual({ status: 200, body: { enabled: false }, cache: 'no-store' });
    }
    expect(h.sessionReads).toBe(0);
  });
  it('flag ON: closed for signed out, players, coaches and owners (requireAdmin is role === "admin" only)', async () => {
    process.env.FEEL_PANEL_ENABLED = '1';
    for (const role of [undefined, 'player', 'coach', 'owner', 'test', 'Admin', '']) {
      as(role);
      expect(await call(), String(role)).toEqual({ status: 200, body: { enabled: false }, cache: 'no-store' });
    }
  });
  it('flag ON + an admin: open', async () => {
    process.env.FEEL_PANEL_ENABLED = '1';
    as('admin');
    expect(await call()).toEqual({ status: 200, body: { enabled: true }, cache: 'no-store' });
  });
});
