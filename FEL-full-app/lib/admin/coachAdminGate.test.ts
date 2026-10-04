// /coach/admin and the knowledge-base list reads.
// The session callbacks are the real ones in lib/auth.ts (prisma is a stand-in), so this proves an admin
// user row lands on session.user.role and requireAdmin lets that session through. The page and the two
// list routes then run against that same session stand-in.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement } from 'react';
import { NextRequest } from 'next/server';
import { loginPath, safeLoginNext } from '@/lib/auth/safeNext';

type Ex = { id: string; slug: string; name: string; published: boolean; category: { id: string; name: string } };

const h = vi.hoisted(() => ({
  session: null as { user?: { id?: string; role?: string; email?: string } } | null,
  dbRole: 'admin' as string | null,
  dbThrows: false,
  exerciseReads: 0,
  categoryReads: 0,
  exercises: [
    { id: 'e-pub', slug: 'tripod-foot', name: 'Tripod Foot Activation', published: true, category: { id: 'c1', name: 'Foot & Ankle' } },
    { id: 'e-draft', slug: 'draft-thing', name: 'Draft Thing', published: false, category: { id: 'c1', name: 'Foot & Ankle' } },
  ] as Ex[],
  categories: [{ id: 'c1', name: 'Foot & Ankle', _count: { exercises: 2 } }],
}));

vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); },
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));
vi.mock('@/app/coach/admin/_components/kb-admin', () => ({
  KBAdmin: Object.assign(() => null, { displayName: 'KBAdmin' }),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: async () => {
        if (h.dbThrows) throw new Error('database unreachable');
        return h.dbRole == null ? null : { role: h.dbRole };
      },
    },
    playerProfile: { findUnique: async () => ({ id: 'profile-elijah' }) },
    exercise: {
      findMany: async (args?: { where?: { published?: boolean } }) => {
        h.exerciseReads += 1;
        if (args?.where?.published === true) return h.exercises.filter((e) => e.published);
        return h.exercises;
      },
    },
    exerciseCategory: {
      findMany: async () => {
        h.categoryReads += 1;
        return h.categories;
      },
    },
  },
}));

import { authOptions } from '@/lib/auth';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import CoachAdminPage from '@/app/coach/admin/page';
import { GET as exercisesGET, POST as exercisesPOST } from '@/app/api/coach/exercises/route';
import { GET as categoriesGET } from '@/app/api/coach/categories/route';
import { GET as catalogueGET } from '@/app/api/coach/catalogue/route';
import { GET as metricsGET } from '@/app/api/admin/metrics/route';
import { GET as diagGET } from '@/app/api/admin/diag/route';

const jwt = authOptions.callbacks!.jwt as (arg: unknown) => Promise<{ role?: string; sub?: string }>;
const sessionCb = authOptions.callbacks!.session as (arg: unknown) => Promise<{ user: { role?: string } }>;

beforeEach(() => {
  h.session = null;
  h.dbRole = 'admin';
  h.dbThrows = false;
  h.exerciseReads = 0;
  h.categoryReads = 0;
});

describe('the session carries role, and an admin account passes', () => {
  it('sign-in copies User.role onto the session, including after the database refresh', async () => {
    const token = await jwt({
      token: {},
      user: { id: 'elijah', email: 'elijahbonds1@gmail.com', role: 'admin' },
      account: null,
    });
    expect(token.role).toBe('admin');
    const session = await sessionCb({
      session: { user: { email: 'elijahbonds1@gmail.com' }, expires: '2099-01-01' },
      token,
    });
    expect(session.user.role).toBe('admin');
    h.session = session;
    expect(await requireAdmin()).toMatchObject({ role: 'admin' });
    expect(isValidElement(await CoachAdminPage())).toBe(true);
  });

  it('a token minted before role existed refreshes from the user row and stays admin', async () => {
    const token = await jwt({ token: { sub: 'elijah' }, account: null });
    expect(token.role).toBe('admin');
    const session = await sessionCb({ session: { user: {}, expires: '2099-01-01' }, token });
    expect(session.user.role).toBe('admin');
  });

  it('a database blink does not demote an admin who already holds the role', async () => {
    h.dbThrows = true;
    const token = await jwt({
      token: { sub: 'elijah', role: 'admin', roleAt: Date.now() - 10 * 60_000 },
      account: null,
    });
    expect(token.role).toBe('admin');
  });
});

describe('/coach/admin', () => {
  it('renders for an admin', async () => {
    h.session = { user: { id: 'elijah', role: 'admin' } };
    const el = await CoachAdminPage();
    expect(isValidElement(el)).toBe(true);
  });

  it('denies a signed-in non-admin', async () => {
    h.session = { user: { id: 'player-1', role: 'player' } };
    await expect(CoachAdminPage()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('denies a coach: the page is admin-only, the same check as /api/admin', async () => {
    h.session = { user: { id: 'coach-1', role: 'coach' } };
    await expect(CoachAdminPage()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(await requireAdmin()).toBeNull();
  });

  it('sends a signed-out visitor to login with a same-origin ?next=', async () => {
    h.session = null;
    const dest = loginPath('/coach/admin');
    await expect(CoachAdminPage()).rejects.toThrow(`NEXT_REDIRECT ${dest}`);
    const next = new URL(`http://fel.test${dest}`).searchParams.get('next');
    expect(safeLoginNext(next)).toBe('/coach/admin');
  });
});

describe('knowledge-base list reads', () => {
  async function body(res: Response) { return res.json() as Promise<{ exercises?: { id: string }[]; categories?: { id: string }[]; error?: string }>; }

  it('allows an admin and a coach, and returns the library', async () => {
    for (const role of ['admin', 'coach'] as const) {
      h.session = { user: { id: role, role } };
      h.exerciseReads = 0;
      h.categoryReads = 0;
      const exercises = await exercisesGET();
      const categories = await categoriesGET();
      expect(exercises.status, role).toBe(200);
      expect(categories.status, role).toBe(200);
      expect((await body(exercises)).exercises?.map((e) => e.id)).toEqual(['e-pub', 'e-draft']);
      expect((await body(categories)).categories?.map((c) => c.id)).toEqual(['c1']);
    }
  });

  it('denies a signed-in player and does not query the library', async () => {
    h.session = { user: { id: 'player-1', role: 'player' } };
    const exercises = await exercisesGET();
    const categories = await categoriesGET();
    expect(exercises.status).toBe(403);
    expect(categories.status).toBe(403);
    expect((await body(exercises)).error).toBe('Forbidden');
    expect(h.exerciseReads).toBe(0);
    expect(h.categoryReads).toBe(0);
  });

  it('denies a signed-in user with no coach or admin role', async () => {
    h.session = { user: { id: 'owner-1', role: 'owner' } };
    expect((await exercisesGET()).status).toBe(403);
    expect((await categoriesGET()).status).toBe(403);
    expect(h.exerciseReads).toBe(0);
  });

  it('denies a signed-out caller with 401', async () => {
    h.session = null;
    expect((await exercisesGET()).status).toBe(401);
    expect((await categoriesGET()).status).toBe(401);
    expect(h.exerciseReads).toBe(0);
    expect(h.categoryReads).toBe(0);
  });

  it('keeps writes admin-only: a coach who can read cannot create', async () => {
    h.session = { user: { id: 'coach-1', role: 'coach' } };
    const res = await exercisesPOST(new Request('http://fel.test/api/coach/exercises', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Nope' }),
    }));
    expect(res.status).toBe(403);
  });

  it('leaves the published catalogue open to a signed-in player', async () => {
    h.session = { user: { id: 'player-1', role: 'player' } };
    const res = await catalogueGET();
    expect(res.status).toBe(200);
    const json = await body(res);
    expect(json.exercises?.map((e) => e.id)).toEqual(['e-pub']);
    expect(json.exercises?.map((e) => e.id)).not.toContain('e-draft');
  });
});

describe('the admin APIs still use requireAdmin', () => {
  it('a signed-in player is unauthorized on metrics and diag', async () => {
    h.session = { user: { id: 'player-1', role: 'player' } };
    expect((await metricsGET()).status).toBe(401);
    expect((await diagGET(new NextRequest('http://fel.test/api/admin/diag'))).status).toBe(401);
  });

  it('a missing session is unauthorized on metrics and diag', async () => {
    h.session = null;
    expect((await metricsGET()).status).toBe(401);
    expect((await diagGET(new NextRequest('http://fel.test/api/admin/diag'))).status).toBe(401);
  });
});
