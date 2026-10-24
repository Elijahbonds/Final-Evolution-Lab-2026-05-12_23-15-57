// FN-0 COUCH-HOST-SEATS (2026-10-19): the couch start is added to six /play pages, and the sign-in gate is untouched —
// a signed-out visitor still goes to /login, couch or not (guest play is the owner's call). A signed-in visitor gets the
// "Couch (2–4)" start beside the solo game, and ?couch=1 opens the host-seat room for that page's mode.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement } from 'react';

const auth = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('next-auth', () => ({ getServerSession: async () => auth.session }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw Object.assign(new Error(`REDIRECT ${to}`), { to }); } }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/components/controller-link/couch-start', () => ({
  CouchRoom: function CouchRoom() { return null; },
  CouchStart: function CouchStart() { return null; },
}));
// each mode's solo loader (Babylon, behind next/dynamic) is not what this test is about
function Loader() { return null; }
vi.mock('@/app/play/tennis/_components/loader', () => ({ TennisLoader: Loader }));
vi.mock('@/app/play/volleyball/_components/loader', () => ({ VolleyballLoader: Loader }));
vi.mock('@/app/play/threepoint/_components/loader', () => ({ ThreePointLoader: Loader }));
vi.mock('@/app/play/golf/_components/loader', () => ({ GolfLoader: Loader }));
vi.mock('@/app/play/skateboard/_components/loader', () => ({ SkateboardLoader: Loader }));
vi.mock('@/app/play/karate-vs/_components/loader', () => ({ KarateVsLoader: Loader }));

import { loginPath } from '@/lib/auth/safeNext';
import { COUCH_MODES, couchHref, couchRequested } from '@/lib/party/catalog';

const PAGES: { dir: string; modeId: string; load: () => Promise<{ default: (p: { searchParams?: Record<string, string> }) => Promise<ReactElement> }> }[] = [
  { dir: 'tennis', modeId: 'tennis', load: () => import('@/app/play/tennis/page') },
  { dir: 'volleyball', modeId: 'volleyball', load: () => import('@/app/play/volleyball/page') },
  { dir: 'threepoint', modeId: 'threepoint', load: () => import('@/app/play/threepoint/page') },
  { dir: 'golf', modeId: 'golf', load: () => import('@/app/play/golf/page') },
  { dir: 'skateboard', modeId: 'skateboard', load: () => import('@/app/play/skateboard/page') },
  { dir: 'karate-vs', modeId: 'karate_vs', load: () => import('@/app/play/karate-vs/page') },
];

async function redirectOf(run: () => Promise<unknown>): Promise<string | null> {
  try { await run(); return null; } catch (e) { return (e as { to?: string }).to ?? null; }
}

function typeName(el: unknown): string {
  return isValidElement(el) && typeof el.type === 'function' ? el.type.name : '';
}

beforeEach(() => { auth.session = null; });

describe('/play/* sign-in gate with the couch start', () => {
  it('the six couch modes are the six pages', () => {
    expect(COUCH_MODES.map((m) => m.href)).toEqual(PAGES.map((p) => `/play/${p.dir}`));
    expect(couchHref(COUCH_MODES[2])).toBe('/play/threepoint?couch=1');
    expect(couchRequested({ couch: '1' })).toBe(true);
    expect(couchRequested({ couch: ['1'] })).toBe(true);
    expect(couchRequested({ couch: 'yes' })).toBe(false);
    expect(couchRequested(undefined)).toBe(false);
  });

  it.each(PAGES)('signed out: /play/$dir still redirects to login, with or without ?couch=1', async ({ dir, load }) => {
    const page = (await load()).default;
    const want = loginPath(`/play/${dir}`);
    expect(want).toMatch(/^\/login\?next=/);
    expect(await redirectOf(() => page({}))).toBe(want);
    expect(await redirectOf(() => page({ searchParams: { couch: '1' } }))).toBe(want);
  });

  it.each(PAGES)('signed in: /play/$dir offers the couch start; ?couch=1 opens the room for $modeId', async ({ load, modeId }) => {
    auth.session = { user: { id: 'host' } };
    const page = (await load()).default;
    const solo = await page({});
    const kids = (solo.props as { children: unknown[] }).children;
    expect(kids.map(typeName)).toEqual(['Loader', 'CouchStart']);
    expect((kids[1] as ReactElement<{ modeId: string }>).props.modeId).toBe(modeId);
    const couch = await page({ searchParams: { couch: '1' } });
    expect(typeName(couch)).toBe('CouchRoom');
    expect((couch.props as { modeId: string }).modeId).toBe(modeId);
  });
});
