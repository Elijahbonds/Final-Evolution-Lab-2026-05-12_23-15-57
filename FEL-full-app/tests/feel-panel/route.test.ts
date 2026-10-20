// GET /api/feel-panel (feel-panel lane, owner 2026-10-20): the panel opens only when the server flag FEEL_PANEL_ENABLED is on AND the
// signed-in user is on FEEL_PANEL_USERS (a comma list of User ids — owner decision 2026-10-20: a NARROW permission, since role 'admin'
// also opens the CRM and the admin dashboards) or is an admin by the repo's own check, lib/admin/requireAdmin (role === 'admin').
// requireAdmin runs for real; only the session it reads is a stand-in (as lib/admin/coachAdminGate.test.ts does).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: null as { user?: { id?: string; role?: string } } | null, sessionReads: 0 }));
vi.mock('next-auth', () => ({ getServerSession: async () => { h.sessionReads++; return h.session; } }));
vi.mock('@/lib/db', () => ({ prisma: {} }));

import { GET } from '@/app/api/feel-panel/route';
import { feelPanelUserIds, isFeelPanelEnabled, isFeelPanelUser } from '@/lib/flags';

const saved = { flag: process.env.FEEL_PANEL_ENABLED, users: process.env.FEEL_PANEL_USERS };
const restore = (k: string, v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
beforeEach(() => { delete process.env.FEEL_PANEL_ENABLED; delete process.env.FEEL_PANEL_USERS; h.session = null; h.sessionReads = 0; });
afterEach(() => { restore('FEEL_PANEL_ENABLED', saved.flag); restore('FEEL_PANEL_USERS', saved.users); });

const as = (id: string | undefined, role = 'player') => { h.session = id === undefined ? null : { user: { id, role } }; };
const call = async () => { const r = await GET(); return { status: r.status, body: await r.json(), cache: r.headers.get('cache-control') }; };
const OPEN = { status: 200, body: { enabled: true }, cache: 'no-store' };
const CLOSED = { status: 200, body: { enabled: false }, cache: 'no-store' };

describe('FEEL_PANEL_ENABLED and FEEL_PANEL_USERS (lib/flags.ts)', () => {
  it('the flag is OFF unless set to 1 / true / on / yes', () => {
    expect(isFeelPanelEnabled()).toBe(false);
    for (const v of ['', '0', 'false', 'off', 'no', 'maybe']) { process.env.FEEL_PANEL_ENABLED = v; expect(isFeelPanelEnabled(), v).toBe(false); }
    for (const v of ['1', 'true', 'TRUE', 'on', 'yes']) { process.env.FEEL_PANEL_ENABLED = v; expect(isFeelPanelEnabled(), v).toBe(true); }
  });
  it('the allowlist is a comma list of exact user ids; empty or unset lists nobody', () => {
    expect(feelPanelUserIds().size).toBe(0);
    expect(isFeelPanelUser('u-owner')).toBe(false);
    process.env.FEEL_PANEL_USERS = ' u-owner , ,u-two ';
    expect([...feelPanelUserIds()]).toEqual(['u-owner', 'u-two']);
    expect(isFeelPanelUser('u-owner')).toBe(true);
    expect(isFeelPanelUser('U-OWNER')).toBe(false);
    expect(isFeelPanelUser('u-own')).toBe(false);
    expect(isFeelPanelUser('')).toBe(false);
    expect(isFeelPanelUser(undefined)).toBe(false);
  });
});

describe('GET /api/feel-panel', () => {
  it('flag OFF: closed for everyone — a listed user and an admin too — and no session is read', async () => {
    process.env.FEEL_PANEL_USERS = 'u-owner';
    for (const [id, role] of [[undefined, 'player'], ['u-1', 'player'], ['u-owner', 'player'], ['u-a', 'admin']] as const) {
      as(id, role);
      expect(await call(), `${id} ${role}`).toEqual(CLOSED);
    }
    expect(h.sessionReads).toBe(0);
  });
  it('flag ON + a user on FEEL_PANEL_USERS (a plain player role — no admin needed): open', async () => {
    process.env.FEEL_PANEL_ENABLED = '1'; process.env.FEEL_PANEL_USERS = 'u-other,u-owner';
    as('u-owner', 'player');
    expect(await call()).toEqual(OPEN);
  });
  it('flag ON + an admin not on the list: open (requireAdmin, role === "admin")', async () => {
    process.env.FEEL_PANEL_ENABLED = '1'; process.env.FEEL_PANEL_USERS = 'u-owner';
    as('u-a', 'admin');
    expect(await call()).toEqual(OPEN);
  });
  it('flag ON: closed for signed out, unlisted players, coaches and owners, and a near-miss id', async () => {
    process.env.FEEL_PANEL_ENABLED = '1'; process.env.FEEL_PANEL_USERS = 'u-owner';
    for (const [id, role] of [[undefined, 'player'], ['u-1', 'player'], ['u-c', 'coach'], ['u-o', 'owner'], ['u-t', 'test'], ['u-x', 'Admin'], ['u-owner2', 'player'], ['U-OWNER', 'player']] as const) {
      as(id, role);
      expect(await call(), `${id} ${role}`).toEqual(CLOSED);
    }
  });
  it('flag ON but the list empty: only admins', async () => {
    process.env.FEEL_PANEL_ENABLED = '1';
    as('u-owner', 'player'); expect(await call()).toEqual(CLOSED);
    as('u-a', 'admin'); expect(await call()).toEqual(OPEN);
  });
  it('answers 200 every time (no red console line for every player on every /play visit)', async () => {
    for (const flag of [undefined, '1']) for (const [id, role] of [[undefined, 'player'], ['u-1', 'player'], ['u-a', 'admin']] as const) {
      if (flag) process.env.FEEL_PANEL_ENABLED = flag; else delete process.env.FEEL_PANEL_ENABLED;
      as(id, role);
      expect((await call()).status, `${flag} ${id}`).toBe(200);
    }
  });
});

describe('no owner identity in code', () => {
  it('no email address in the feel-panel sources or the flag', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['lib/flags.ts', 'app/api/feel-panel/route.ts', 'lib/feel-panel/feel.ts', 'lib/feel-panel/sessionGate.ts', 'lib/feel-panel/knobs.ts', 'components/feel-panel/feel-panel.tsx', 'components/feel-panel/feel-sheet.tsx']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    }
  });
});
