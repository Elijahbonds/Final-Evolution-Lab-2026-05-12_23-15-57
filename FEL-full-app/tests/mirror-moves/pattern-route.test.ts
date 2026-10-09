// MIRROR-MOVES P2 (2026-10-07; plan Phase 2 / item #19): app/play/mirror/page.tsx reads `?pattern=` and hands the harness its
// first tab. The server component is called directly (next-auth, prisma and the gates mocked) and the tree it returns is
// read — no DOM. Signed out, the login round-trip keeps a known tab; an unknown one is not carried.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); } }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: async () => ({ dobYear: 1990 }) } } }));
vi.mock('@/lib/privacy/scanSaveGate', () => ({ canSaveScanNumbers: async () => false, logGateFailure: () => {} }));
vi.mock('@/lib/privacy/healthWriteGate', () => ({ canWriteHealthData: async () => true }));
const { stub } = vi.hoisted(() => ({ stub: (displayName: string) => Object.assign(() => null, { displayName }) }));
vi.mock('@/app/play/mirror/_components/mirror-harness', () => ({ MirrorHarness: stub('MirrorHarness') }));
vi.mock('@/app/play/mirror/_components/health-intake-gate', () => ({ HealthIntakeGate: stub('HealthIntakeGate') }));

import type { ReactElement } from 'react';
import MirrorPage from '@/app/play/mirror/page';
import { DEFAULT_MIRROR_TAB, MIRROR_TABS } from '@/lib/mirror/patternParam';
import { LESSON_MOVEMENTS, cameraHref } from '@/lib/education/lessonMovement';
import { MIRROR_LIVE_MOVEMENTS, mirrorMovementHref } from '@/lib/mirror/liveMovements';

type El = ReactElement<Record<string, any>>;
async function harnessFor(pattern?: string | string[]) {
  const root = (await MirrorPage(pattern === undefined ? {} : { searchParams: { pattern } })) as El;
  return ((root.props.children as El).props.children as El).props;
}
const param = (href: string) => new URL(href, 'https://fel.example').searchParams.get('pattern') ?? undefined;

beforeEach(() => { h.session = { user: { id: 'athlete-mm' } }; });

describe('/play/mirror?pattern=<id> hands the harness that tab', () => {
  it.each(MIRROR_TABS.map((t) => [t]))('%s', async (tab) => {
    expect((await harnessFor(tab)).initialPattern).toBe(tab);
  });

  it('no parameter, an unknown one, or an empty one: the default tab', async () => {
    expect((await harnessFor()).initialPattern).toBe(DEFAULT_MIRROR_TAB);
    expect((await harnessFor('deadlift')).initialPattern).toBe(DEFAULT_MIRROR_TAB);
    expect((await harnessFor('')).initialPattern).toBe(DEFAULT_MIRROR_TAB);
    expect(((await MirrorPage()) as El).props.children).toBeTruthy();            // the page still renders called bare
  });

  it('every Form Check link and every Playbook "Check it on camera" link opens its own tab', async () => {
    for (const m of MIRROR_LIVE_MOVEMENTS) expect((await harnessFor(param(mirrorMovementHref(m.id)))).initialPattern, m.id).toBe(m.id);
    for (const l of LESSON_MOVEMENTS) expect((await harnessFor(param(cameraHref(l.movement)))).initialPattern, l.lesson).toBe(l.movement);
  });

  it('the other props are untouched (the save gate still decides canSaveScan)', async () => {
    const p = await harnessFor('pushup');
    expect(p.canSaveScan).toBe(false);
    expect(p.youth).toBeNull();                                   // dobYear 1990: an adult (youthGateFor → null)
  });
});

describe('signed out: the login round-trip keeps the tab', () => {
  beforeEach(() => { h.session = null; });
  it('a known tab rides along in ?next=', async () => {
    await expect(MirrorPage({ searchParams: { pattern: 'hinge' } })).rejects.toThrow(
      `NEXT_REDIRECT /login?next=${encodeURIComponent('/play/mirror?pattern=hinge')}`,
    );
  });
  it('no tab, or an unknown one: plain /play/mirror (nothing unknown is carried)', async () => {
    await expect(MirrorPage({ searchParams: { pattern: '<script>' } })).rejects.toThrow(`NEXT_REDIRECT /login?next=${encodeURIComponent('/play/mirror')}`);
    await expect(MirrorPage()).rejects.toThrow(`NEXT_REDIRECT /login?next=${encodeURIComponent('/play/mirror')}`);
  });
});
