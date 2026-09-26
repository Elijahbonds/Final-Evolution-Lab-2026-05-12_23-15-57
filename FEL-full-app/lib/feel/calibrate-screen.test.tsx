// /play/calibrate: ?return= and "Back to the room" (MUSIC-SUITE P2, 2026-09-25).
//
// The rooms link here with ?return=/play/dance (or /play/music); the screen must send the player back there after saving,
// and only ever to a path on this origin. app/ is outside the vitest include (vitest.config.ts), so the screen's tests
// live here beside its math. The page is driven with the session and the redirect mocked; the client is rendered to
// markup (its initial state) and its post-save decision is the pure savePanelAction.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const h = vi.hoisted(() => ({ session: null as unknown, redirects: [] as string[] }));
vi.mock('next-auth', () => ({ getServerSession: async () => h.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { h.redirects.push(to); throw new Error(`NEXT_REDIRECT ${to}`); },
  useRouter: () => ({ push: () => {} }),
}));

import CalibratePage from '@/app/play/calibrate/page';
import { CalibrateClient, savePanelAction, offsetLine, isCalibrationTapKey } from '@/app/play/calibrate/_components/calibrate-client';

/** The CalibrateClient element inside the page's tree. */
function findClient(node: ReactNode): ReactElement<{ returnTo?: string | null }> | null {
  if (!isValidElement(node)) return Array.isArray(node) ? node.map(findClient).find(Boolean) ?? null : null;
  if (node.type === CalibrateClient) return node as ReactElement<{ returnTo?: string | null }>;
  return findClient((node.props as { children?: ReactNode }).children);
}

beforeEach(() => { h.session = { user: { id: 'u1' } }; h.redirects = []; });

describe('the page reads ?return=', () => {
  it('hands a room path to the screen', async () => {
    const el = await CalibratePage({ searchParams: { return: '/play/dance' } });
    expect(findClient(el)?.props.returnTo).toBe('/play/dance');
  });

  it('drops anything that could leave the origin', async () => {
    for (const r of ['//evil.example', 'https://evil.example/', '/\\evil.example', 'javascript:alert(1)']) {
      const el = await CalibratePage({ searchParams: { return: r } });
      expect(findClient(el)?.props.returnTo, r).toBeNull();
    }
  });

  it('takes the first of a repeated ?return=, and none is none', async () => {
    expect(findClient(await CalibratePage({ searchParams: { return: ['/play/music', '//evil.example'] } }))?.props.returnTo).toBe('/play/music');
    expect(findClient(await CalibratePage({}))?.props.returnTo).toBeNull();
  });

  it('a signed-out player is sent to sign in with the way back (return and all) in ?next=', async () => {
    h.session = null;
    await expect(CalibratePage({ searchParams: { return: '/play/dance' } })).rejects.toThrow(/NEXT_REDIRECT/);
    expect(h.redirects).toEqual([`/login?next=${encodeURIComponent('/play/calibrate?return=%2Fplay%2Fdance')}`]);
    h.redirects = [];
    await expect(CalibratePage({ searchParams: { return: '//evil.example' } })).rejects.toThrow(/NEXT_REDIRECT/);
    expect(h.redirects).toEqual([`/login?next=${encodeURIComponent('/play/calibrate')}`]);
  });

  it('tells a Bluetooth player why to measure again', async () => {
    const m = renderToStaticMarkup(await CalibratePage({}));
    expect(m).toMatch(/Bluetooth headphones often add 200–300 ms/);
  });
});

describe('the screen', () => {
  it('opened from a room, its way out is "Back to the room"', () => {
    const m = renderToStaticMarkup(createElement(CalibrateClient, { returnTo: '/play/dance' }));
    expect(m).toMatch(/<a[^>]*href="\/play\/dance"[^>]*>Back to the room<\/a>/);
    expect(m).not.toMatch(/Back to modes/);
    expect(m).toMatch(/16 taps at 80 BPM/);
  });

  it('opened on its own, "Back to modes" as before', () => {
    const m = renderToStaticMarkup(createElement(CalibrateClient));
    expect(m).toMatch(/<a[^>]*href="\/modes"[^>]*>Back to modes<\/a>/);
  });

  it('after SAVE: back to the room (or SAVED); a nudge makes it a new reading; no taps, nothing to save', () => {
    const base = { taps: 16, justSaved: false, savedOffsetMs: 0, offsetMs: 250, returnTo: '/play/dance' };
    expect(savePanelAction(base)).toBe('save');
    expect(savePanelAction({ ...base, justSaved: true, savedOffsetMs: 250 })).toBe('back');
    expect(savePanelAction({ ...base, justSaved: true, savedOffsetMs: 250, returnTo: null })).toBe('saved');
    expect(savePanelAction({ ...base, justSaved: true, savedOffsetMs: 250, offsetMs: 275 })).toBe('save');
    expect(savePanelAction({ ...base, taps: 0 })).toBe('none');
  });

  it('MUSIC-SUITE P2 FIX PASS: an uneven reading offers no SAVE (both rooms apply what is saved); a steady one does', () => {
    const base = { taps: 16, justSaved: false, savedOffsetMs: 0, offsetMs: 250, returnTo: '/play/dance' };
    expect(savePanelAction({ ...base, steady: false })).toBe('none');
    expect(savePanelAction({ ...base, steady: true })).toBe('save');
    expect(savePanelAction(base)).toBe('save');                           // (callers that do not say: as before)
  });

  it('MUSIC-SUITE P2 FIX PASS: a held SPACE is one tap — its key repeats are not taps', () => {
    const hold = [{ key: ' ', code: 'Space', repeat: false }, ...Array.from({ length: 30 }, () => ({ key: ' ', code: 'Space', repeat: true }))];
    expect(hold.filter(isCalibrationTapKey)).toHaveLength(1);
    expect(isCalibrationTapKey({ key: 'Unidentified', code: 'Space' })).toBe(true);
    expect(isCalibrationTapKey({ key: 'Enter', code: 'Enter' })).toBe(false);
  });

  it('a Bluetooth-sized offset is not called "slightly late"', () => {
    expect(offsetLine(250)).toMatch(/Bluetooth/);
    expect(offsetLine(50)).toMatch(/slightly late/);
    expect(offsetLine(-50)).toMatch(/slightly early/);
    expect(offsetLine(0)).toMatch(/Dead on the beat/);
  });
});
