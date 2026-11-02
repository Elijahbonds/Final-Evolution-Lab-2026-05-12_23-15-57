// NEX-01 (owner 2026-10-20, "owner first (admin)"): /studio and its write routes are for the founder and admins only, the role read
// from the database on every request. The real layout runs here with the session, the database and next/navigation as stand-ins.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ session: null as unknown, role: 'admin' as string | null, reads: 0, fail: false }));
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => m.session) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: { user: { findUnique: vi.fn(async (a: { select: Record<string, true> }) => { m.reads++; if (m.fail) throw new Error('db down'); expect(a.select).toEqual({ role: true }); return m.role === null ? null : { role: m.role }; }) } },
}));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); },
}));

import StudioLayout from '@/app/studio/layout';
import { STUDIO_AUDIENCE_ROLES, studioAudienceAllows, studioAudienceOk, studioNotFound } from './audience';
import { APPROVER_ROLES } from '@/lib/creator/creative-card-review';

const open = async (): Promise<string> => {
  try { await StudioLayout({ children: 'STUDIO' }); return 'OPEN'; } catch (e) { return (e as Error).message; }
};

beforeEach(() => { vi.stubEnv('NEXUS_STUDIO_ENABLED', '1'); m.session = { user: { id: 'u1' } }; m.role = 'admin'; m.reads = 0; m.fail = false; });
afterEach(() => vi.unstubAllEnvs());

describe('the audience', () => {
  it('is the review board’s approvers: founder and admin, exact strings', () => {
    expect(STUDIO_AUDIENCE_ROLES).toBe(APPROVER_ROLES);
    expect(STUDIO_AUDIENCE_ROLES).toEqual(['founder', 'admin']);
    for (const r of ['founder', 'admin']) expect(studioAudienceAllows(r)).toBe(true);
    for (const r of ['user', 'mod', 'coach', 'owner', 'Admin', 'admin ', '', null, undefined]) expect(studioAudienceAllows(r as string)).toBe(false);
  });
  it('studioAudienceOk: the flag first (no database read when it is off), then the database role; an error refuses', async () => {
    const db = { user: { findUnique: vi.fn(async () => ({ role: 'admin' })) } };
    vi.stubEnv('NEXUS_STUDIO_ENABLED', '');
    expect(await studioAudienceOk(db, 'u1')).toBe(false);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    vi.stubEnv('NEXUS_STUDIO_ENABLED', '1');
    expect(await studioAudienceOk(db, null)).toBe(false);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(await studioAudienceOk(db, 'u1')).toBe(true);
    db.user.findUnique.mockImplementationOnce(async () => { throw new Error('down'); });
    expect(await studioAudienceOk(db, 'u1')).toBe(false);
  });
  it('a write route’s refusal is the plain 404', async () => {
    const r = studioNotFound();
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: 'not_found' });
  });
});

describe('/studio’s layout', () => {
  it('flag off: a 404 for everyone, before the session or the database', async () => {
    vi.stubEnv('NEXUS_STUDIO_ENABLED', '');
    expect(await open()).toBe('NOT_FOUND');
    expect(m.reads).toBe(0);
  });
  it('signed out: the login round trip (the flag is on)', async () => {
    m.session = null;
    expect(await open()).toBe('REDIRECT /login?next=%2Fstudio');
    expect(m.reads).toBe(0);
  });
  it('founder and admin open it', async () => {
    for (const r of ['founder', 'admin']) { m.role = r; expect(await open(), r).toBe('OPEN'); }
  });
  it('every other role — and a session that only CLAIMS admin — gets the same 404 a guest gets with the flag off', async () => {
    for (const r of ['user', 'mod', 'coach', 'owner', null]) {
      m.session = { user: { id: 'u2', role: 'admin' } };
      m.role = r;
      expect(await open(), String(r)).toBe('NOT_FOUND');
    }
  });
  it('a role changed in the database after sign-in takes effect on the next request', async () => {
    m.role = 'admin';
    expect(await open()).toBe('OPEN');
    m.role = 'user';
    expect(await open()).toBe('NOT_FOUND');
    m.role = 'founder';
    expect(await open()).toBe('OPEN');
    expect(m.reads).toBe(3);
  });
  it('a session with no id, or a database error, is a 404 (fail closed)', async () => {
    m.session = { user: {} };
    expect(await open()).toBe('NOT_FOUND');
    m.session = { user: { id: 'u1' } };
    m.fail = true;
    expect(await open()).toBe('NOT_FOUND');
  });
});
