// TRY-AGE-PLACEHOLDER-1 (PM review): with the switch on, the REAL AgeStep hands the shell the full birth date
// (components/age-step.tsx: `onLocked?.(n, birthDate as string)`), and the shell's handler routes it: an adult date reaches
// startGuest (exactly one POST /api/guest), a teen date the phone-only path, an under-13 date the blocked path.
// Same harness as guest-dunk-shell.test.tsx (node, no jsdom): tests/helpers/driveRender.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drive, findAll, settle, type Found } from '@/tests/helpers/driveRender';

const fx = vi.hoisted(() => ({ effects: [] as Array<() => unknown>, track: [] as unknown[][] }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const useEffect = ((effect: () => unknown) => { fx.effects.push(effect); }) as typeof actual.useEffect;
  const base = ((actual as unknown as { default?: typeof actual }).default ?? actual) as typeof actual;
  return { ...actual, useEffect, default: { ...base, useEffect } };
});
vi.mock('next/dynamic', () => ({ default: () => function Stage() { return null; } }));
vi.mock('@/lib/analytics', () => ({ track: (...a: unknown[]) => { fx.track.push(a); }, flush: async () => {} }));

import { GuestDunkShell } from '@/components/games/guest-dunk-shell';
import { AgeStep } from '@/components/age-step';
import { AGE_QUESTION } from '@/lib/privacy/ageScreen';
import { forgetAgeForTests } from '@/lib/screen/store';

const NOW = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
/** A birth date `years` years before today, shifted by `dayShift` days (+1 = one day short of the birthday). */
function dateYearsAgo(years: number, dayShift = 0): { y: number; m: number; d: number; iso: string } {
  const t = new Date(NOW.getFullYear() - years, NOW.getMonth(), NOW.getDate() + dayShift, 12);
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate(), iso: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}` };
}

let fetchCalls: string[] = [];
let session: Map<string, string>;
beforeEach(() => {
  fetchCalls = []; fx.track = []; session = new Map(); forgetAgeForTests();
  const storage = (m: Map<string, string>) => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } });
  vi.stubGlobal('document', { cookie: '' });
  vi.stubGlobal('localStorage', storage(new Map()));
  vi.stubGlobal('window', { sessionStorage: storage(session) });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { fetchCalls.push(String(url)); return new Response('{}'); }));
  vi.stubGlobal('navigator', { sendBeacon: vi.fn(() => true) });
});
afterEach(() => { vi.unstubAllGlobals(); forgetAgeForTests(); });

const ageStep = (tree: React.ReactElement): Found => {
  const [el] = findAll(tree, (e) => e.type === AgeStep);
  if (!el) throw new Error('no AgeStep in the tree');
  return el;
};

/** Answer the real AgeStep (year, month, day, Continue) and return what it handed onLocked. */
function answerAgeStep(date: { y: number; m: number; d: number }): unknown[] | null {
  let got: unknown[] | null = null;
  const step = drive(() => AgeStep({ mode: 'signup', onLocked: (...a: unknown[]) => { got = a; }, onBlocked: () => { got = ['blocked']; } }), [
    (tree) => { findAll(tree, (e) => e.type === 'select')[0].props.onChange({ target: { value: String(date.y) } }); },
    (tree) => {
      findAll(tree, (e) => e.type === 'input' && e.props['aria-label'] === 'Month')[0].props.onChange({ target: { value: String(date.m) } });
      findAll(tree, (e) => e.type === 'input' && e.props['aria-label'] === 'Day')[0].props.onChange({ target: { value: String(date.d) } });
    },
  ]);
  findAll(step.tree, (e) => e.type === 'button')[0].props.onClick();
  return got;
}

describe('TRY-AGE-PLACEHOLDER-1: the age step → shell wiring with the switch on', () => {
  it('the real AgeStep passes the full birth date, not only the year', () => {
    const adult = dateYearsAgo(30);
    expect(answerAgeStep(adult)).toEqual([adult.y, adult.iso]);
  });

  it('an adult full birth date reaches startGuest: exactly 1 POST /api/guest and play_now_click', async () => {
    const adult = dateYearsAgo(18);   // the 18th birthday is today
    const r = drive(() => GuestDunkShell({ challengeCode: null, ageBands: true }), [(tree) => ageStep(tree).props.onLocked(adult.y, adult.iso)]);
    await settle();
    expect(fetchCalls.filter((u) => u === '/api/guest')).toHaveLength(1);
    expect(fx.track.some((a) => a[0] === 'play_now_click')).toBe(true);
    expect(r.html).not.toContain(AGE_QUESTION);
    expect(session.get('fel.screen.sessionAge')).toBe('18+');
  });

  it('a teen full birth date (one day short of 18) reaches the phone-only path: nothing sent', async () => {
    const teen = dateYearsAgo(18, 1);
    const r = drive(() => GuestDunkShell({ challengeCode: null, ageBands: true }), [(tree) => ageStep(tree).props.onLocked(teen.y, teen.iso)]);
    await settle();
    expect(fetchCalls).toEqual([]);
    expect(fx.track).toEqual([]);
    expect(r.html).not.toContain(AGE_QUESTION);
    expect(r.html).not.toContain('CLAIM');
    expect(session.get('fel.screen.sessionAge')).toBe('13-17');
  });

  it('an under-13 full birth date (one day short of 13) reaches the blocked path: nothing sent', async () => {
    const kid = dateYearsAgo(13, 1);
    const r = drive(() => GuestDunkShell({ challengeCode: null, ageBands: true }), [(tree) => ageStep(tree).props.onLocked(kid.y, kid.iso)]);
    await settle();
    expect(fetchCalls).toEqual([]);
    expect(fx.track).toEqual([]);
    expect(r.html).not.toContain(AGE_QUESTION);
    expect(r.html).not.toContain('CLAIM');
    expect(session.get('fel.screen.sessionAge')).toBe('under-13');
  });
});
