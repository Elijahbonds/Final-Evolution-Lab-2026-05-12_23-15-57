// TRY-AGE-BANDS-FIX-1 (Cyber TRY-AGE-BANDS-REVIEW 2026-11-09: F1, F2 and new rows T-TRYAGE-1..12; Elijah: "Show under-18s their
// own /try score only, never public"). NEW tests only. Same harness as components/games/guest-dunk-shell.test.tsx: node (no
// jsdom), the real shell and the real AgeStep inside a host render (tests/helpers/driveRender), mount effects run on demand,
// fetch / track / cookies / sessionStorage are stand-ins, the Babylon stage is a stub. The flag is the shell's `ageBands` prop
// (app/try/page.tsx passes isTryAgeBandsEnabled()).
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
import { cameraAllowed, forgetAgeForTests, readSessionAge, KEYS } from '@/lib/screen/store';
import { TRY_MINOR_COOKIE, tryMinorCookieHeader, tryMinorInCookieString } from '@/lib/privacy/tryMinorFlag';

const NOW = new Date();
const THIS_YEAR = NOW.getFullYear();
const SESSION_KEY = KEYS.sessionAge;
const pad = (n: number) => String(n).padStart(2, '0');
/** A birth date `years` years before today, shifted by `dayShift` days (+1 = one day short of that birthday). */
function dateYearsAgo(years: number, dayShift = 0): { y: number; m: number; d: number; iso: string } {
  const t = new Date(NOW.getFullYear() - years, NOW.getMonth(), NOW.getDate() + dayShift, 12);
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate(), iso: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}` };
}

let fetchCalls: string[] = [];
let cookieWrites: string[] = [];
let session: Map<string, string>;
let local: Map<string, string>;
function stubBrowser(cookie = '', sessionSeed: Record<string, string> = {}) {
  fetchCalls = []; cookieWrites = []; fx.track = []; fx.effects.length = 0; forgetAgeForTests();
  session = new Map(Object.entries(sessionSeed)); local = new Map();
  const storage = (m: Map<string, string>) => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } });
  let jar = cookie;
  vi.stubGlobal('document', {
    get cookie() { return jar; },
    set cookie(v: string) { cookieWrites.push(v); jar = jar ? `${jar}; ${v.split(';')[0]}` : v.split(';')[0]; },
  });
  vi.stubGlobal('localStorage', storage(local));
  vi.stubGlobal('window', { sessionStorage: storage(session) });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { fetchCalls.push(String(url)); return new Response('{}'); }));
  vi.stubGlobal('navigator', { sendBeacon: vi.fn(() => true) });
}
beforeEach(() => { stubBrowser(); });
afterEach(() => { vi.unstubAllGlobals(); forgetAgeForTests(); });

const ageStep = (tree: React.ReactElement): Found => {
  const [el] = findAll(tree, (e) => e.type === AgeStep);
  if (!el) throw new Error('no AgeStep in the tree');
  return el;
};
const hasAgeStep = (tree: React.ReactElement) => findAll(tree, (e) => e.type === AgeStep).length > 0;
const runMountEffects = () => { for (const e of fx.effects.splice(0)) e(); };
/** Render the shell and run its mount effects inside the first render pass, as a mount does. */
const mount = (props: Record<string, unknown> = { ageBands: true }) =>
  drive(() => { fx.effects.length = 0; return GuestDunkShell({ challengeCode: null, ...props }); }, [() => runMountEffects()]);
/**
 * Answer the REAL AgeStep (year, month, day, Continue) on its own and return what it handed its callbacks: ['blocked'] when it
 * called onBlocked (the year-only block, before the month and day are read), or [year, 'YYYY-MM-DD'] for onLocked.
 */
function realAgeStepAnswer(date: { y: number; m: number; d: number }): unknown[] {
  let got: unknown[] | null = null;
  const step = drive(() => AgeStep({ mode: 'signup', onLocked: (...a: unknown[]) => { got = a; }, onBlocked: () => { got = ['blocked']; } }), [
    (tree) => { findAll(tree, (e) => e.type === 'select')[0].props.onChange({ target: { value: String(date.y) } }); },
    (tree) => {
      findAll(tree, (e) => e.type === 'input' && e.props['aria-label'] === 'Month')[0].props.onChange({ target: { value: String(date.m) } });
      findAll(tree, (e) => e.type === 'input' && e.props['aria-label'] === 'Day')[0].props.onChange({ target: { value: String(date.d) } });
    },
  ]);
  findAll(step.tree, (e) => e.type === 'button')[0].props.onClick();
  if (!got) throw new Error('the real AgeStep called neither onLocked nor onBlocked');
  return got;
}
/** The shell, with the answer the real AgeStep produced for `date` handed to the shell's own handler inside its render pass. */
const shellAfterAnswer = (date: { y: number; m: number; d: number }, props: Record<string, unknown> = { ageBands: true }) => {
  const got = realAgeStepAnswer(date);
  const r = drive(() => GuestDunkShell({ challengeCode: null, ...props }), [
    (tree) => { const p = ageStep(tree).props; if (got[0] === 'blocked') p.onBlocked(); else p.onLocked(...got); },
  ]);
  return { r, got };
};
const guestPosts = () => fetchCalls.filter((u) => u === '/api/guest');
const nothingSent = () => { expect(fetchCalls).toEqual([]); expect(fx.track).toEqual([]); };

describe('T-TRYAGE-UI-13YR-BLOCK (pins F4: the protective year block)', () => {
  it('flag on, the real AgeStep, born Jan 1 of thisYear−13 (already 13): blocked, block flag written, 0 fetch, 0 track, sessionAge under-13', async () => {
    const { r } = shellAfterAnswer({ y: THIS_YEAR - 13, m: 1, d: 1 });
    await settle();
    expect(r.html).not.toContain(AGE_QUESTION);
    expect(r.html).not.toContain('CLAIM');
    expect(cookieWrites.some((c) => c.startsWith('fel_age_gate=1;'))).toBe(true);
    expect(local.get('fel:ageGate')).toBe('1');
    nothingSent();
    expect(session.get(SESSION_KEY)).toBe('under-13');
  });
});

describe('T-TRYAGE-UI-13-LOWER', () => {
  it('flag on, the real AgeStep, born thisYear−14 with the birthday tomorrow (age 13): local, 0 fetch, sessionAge 13-17', async () => {
    const d = dateYearsAgo(14, 1);
    const { r } = shellAfterAnswer(d);
    await settle();
    expect(r.html).not.toContain(AGE_QUESTION);
    nothingSent();
    expect(session.get(SESSION_KEY)).toBe('13-17');
  });
});

describe('T-TRYAGE-UI-18-EDGE', () => {
  it('flag on, the real AgeStep: thisYear−18 one day short -> local, 0 fetch; on the birthday -> exactly 1 POST /api/guest', async () => {
    const short = dateYearsAgo(18, 1);
    const a = shellAfterAnswer(short);
    await settle();
    expect(a.r.html).not.toContain(AGE_QUESTION);
    nothingSent();
    expect(session.get(SESSION_KEY)).toBe('13-17');

    stubBrowser();
    const on = dateYearsAgo(18);
    shellAfterAnswer(on);
    await settle();
    expect(guestPosts()).toHaveLength(1);
    expect(fetchCalls).toHaveLength(1);
    expect(session.get(SESSION_KEY)).toBe('18+');
  });
});

describe('T-TRYAGE-UNKNOWN-SHELL', () => {
  it.each([[undefined], ['2010-13-40']])('flag on, onLocked(year, %j): local, 0 fetch, 0 track, sessionAge unknown', async (bad) => {
    const r = drive(() => GuestDunkShell({ challengeCode: null, ageBands: true }), [(tree) => ageStep(tree).props.onLocked(THIS_YEAR - 30, bad)]);
    await settle();
    expect(r.html).not.toContain(AGE_QUESTION);
    nothingSent();
    expect(session.get(SESSION_KEY)).toBe('unknown');
  });
});

describe('T-TRYAGE-REFRESH-HOLD (F1)', () => {
  it('flag on, sessionStorage already holds 13-17: a fresh mount does not show the question, the gate is local', async () => {
    stubBrowser('', { [SESSION_KEY]: '13-17' });
    const r = mount();
    await settle();
    expect(hasAgeStep(r.tree)).toBe(false);
    expect(r.html).not.toContain(AGE_QUESTION);
    expect(r.html).not.toContain('CLAIM');
    nothingSent();
  });

  it('an adult answer, if one were reachable from the old question, still sends 0 fetch (the lock only tightens)', async () => {
    stubBrowser('', { [SESSION_KEY]: '13-17' });
    let first!: React.ReactElement;
    drive(() => { const t = GuestDunkShell({ challengeCode: null, ageBands: true }); first ??= t; return t; }, [() => runMountEffects()]);
    expect(hasAgeStep(first)).toBe(true); // the very first render still had the question: its handlers are what a stale tab could call
    ageStep(first).props.onLocked(dateYearsAgo(30).y, dateYearsAgo(30).iso);
    await settle();
    nothingSent();
    expect(session.get(SESSION_KEY)).toBe('13-17');
  });

  it("held under-13 goes to blocked; held unknown goes to local; held 18+ or nothing still asks", async () => {
    stubBrowser('', { [SESSION_KEY]: 'under-13' });
    let r = mount();
    expect(hasAgeStep(r.tree)).toBe(false);
    expect(r.html).not.toContain(AGE_QUESTION);
    nothingSent();
    stubBrowser('', { [SESSION_KEY]: 'unknown' });
    r = mount();
    expect(hasAgeStep(r.tree)).toBe(false);
    nothingSent();
    stubBrowser('', { [SESSION_KEY]: '18+' });
    r = mount();
    expect(hasAgeStep(r.tree)).toBe(true);
    expect(r.html).toContain(AGE_QUESTION);
    stubBrowser();
    r = mount();
    expect(hasAgeStep(r.tree)).toBe(true);
    expect(r.html).toContain(AGE_QUESTION);
  });

  it('the block flag still wins over the session lock (a held 13-17 + the block cookie is blocked, not local)', async () => {
    stubBrowser('fel_age_gate=1', { [SESSION_KEY]: '13-17' });
    const r = mount();
    expect(hasAgeStep(r.tree)).toBe(false);
    nothingSent();
    expect(cookieWrites).toEqual([]);
  });

  it('flag OFF: a held 13-17 changes nothing (the question is asked as shipped)', async () => {
    stubBrowser('', { [SESSION_KEY]: '13-17' });
    const r = mount({ ageBands: false });
    expect(hasAgeStep(r.tree)).toBe(true);
    expect(r.html).toContain(AGE_QUESTION);
  });
});

describe('T-TRYAGE-ONBLOCKED-LOCK', () => {
  it('flag on: onBlocked() writes sessionAge under-13 and the block flag, with 0 fetch', async () => {
    const r = drive(() => GuestDunkShell({ challengeCode: null, ageBands: true }), [(tree) => ageStep(tree).props.onBlocked()]);
    await settle();
    expect(session.get(SESSION_KEY)).toBe('under-13');
    expect(cookieWrites.some((c) => c.startsWith('fel_age_gate=1;'))).toBe(true);
    expect(r.html).not.toContain(AGE_QUESTION);
    nothingSent();
  });
});

describe('T-TRYAGE-FLAGOFF-PARITY', () => {
  it('flag off: a teen year gives local and NO session key and no fel_try_minor; an under-13 year writes no session key; an adult year sends exactly 1 POST', async () => {
    let r = drive(() => GuestDunkShell({ challengeCode: null, ageBands: false }), [(tree) => ageStep(tree).props.onLocked(THIS_YEAR - 15, '2000-01-01')]);
    await settle();
    expect(r.html).not.toContain(AGE_QUESTION);
    expect(session.has(SESSION_KEY)).toBe(false);
    expect(cookieWrites).toEqual([]);
    nothingSent();

    stubBrowser();
    r = drive(() => GuestDunkShell({ challengeCode: null, ageBands: false }), [(tree) => ageStep(tree).props.onBlocked()]);
    await settle();
    expect(session.has(SESSION_KEY)).toBe(false);
    expect(cookieWrites.every((c) => !c.startsWith(`${TRY_MINOR_COOKIE}=`))).toBe(true);
    nothingSent();

    stubBrowser();
    drive(() => GuestDunkShell({ challengeCode: null, ageBands: false }), [(tree) => ageStep(tree).props.onLocked(THIS_YEAR - 30)]);
    await settle();
    expect(guestPosts()).toHaveLength(1);
    expect(fetchCalls).toHaveLength(1);
    expect(cookieWrites).toEqual([]);
  });
});

describe('T-TRYAGE-TEEN-NO-STORE + "a 15-year-old sees their own score, never public"', () => {
  const stage = (tree: React.ReactElement) => findAll(tree, (e) => typeof e.props.onEnd === 'function')[0];

  it('flag on, a 15-year-old with reviewHref set: the result shows their own score; no review link, no CLAIM, no /signup href, no share, nothing sent', async () => {
    const teen = dateYearsAgo(15);
    const r = drive(() => GuestDunkShell({ challengeCode: null, reviewHref: '/coach/offers/dunk-jump-review', ageBands: true }), [
      (tree) => ageStep(tree).props.onLocked(teen.y, teen.iso),
      (tree) => { void stage(tree).props.onEnd({ score: 70, won: true }); },
    ]);
    await settle();
    expect(r.html).toContain('Score 70');
    expect(r.html).not.toContain('/coach/offers');
    expect(r.html).not.toContain('CLAIM');
    expect(r.html).not.toContain('/signup');
    expect(r.html.toLowerCase()).not.toMatch(/share|leaderboard/);
    nothingSent();
  });

  it('control: the same run for an adult DOES show the review link (so the teen result above is the gate, not a missing link)', async () => {
    const adult = dateYearsAgo(30);
    const r = drive(() => GuestDunkShell({ challengeCode: null, reviewHref: '/coach/offers/dunk-jump-review', ageBands: true }), [
      (tree) => ageStep(tree).props.onLocked(adult.y, adult.iso),
      (tree) => { void stage(tree).props.onEnd({ score: 70, won: true }); },
    ]);
    await settle();
    expect(r.html).toContain('/coach/offers/dunk-jump-review');
  });
});

describe('T-TRYAGE-TEEN-CHALLENGE', () => {
  it('flag on, a teen and a challengeCode: the end and card handlers post no /api/challenge/*/attempt', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const teen = dateYearsAgo(15);
    const r = drive(() => GuestDunkShell({ challengeCode: 'C1', ageBands: true }), [(tree) => ageStep(tree).props.onLocked(teen.y, teen.iso)]);
    const s = findAll(r.tree, (e) => typeof e.props.onEnd === 'function')[0];
    await s.props.onEnd({ score: 70, won: true });
    if (s.props.onCard) await s.props.onCard({ score: 70, won: true });
    await settle();
    expect(fetchCalls.filter((u) => u.startsWith('/api/challenge'))).toEqual([]);
    nothingSent();
    vi.mocked(console.error).mockRestore();
  });
});

describe('T-TRYAGE-UNKNOWN-TIE', () => {
  it('a lock holding unknown followed by onBlocked: the shell renders blocked and sends nothing', async () => {
    stubBrowser('', { [SESSION_KEY]: 'unknown' });
    forgetAgeForTests();
    const r = drive(() => GuestDunkShell({ challengeCode: null, ageBands: true }), [(tree) => ageStep(tree).props.onBlocked()]);
    await settle();
    expect(r.html).not.toContain(AGE_QUESTION);
    expect(cookieWrites.some((c) => c.startsWith('fel_age_gate=1;'))).toBe(true);
    nothingSent();
  });
});

describe('T-TRYAGE-SCREEN-CROSSLOCK', () => {
  it('after a /try teen lock the Screen camera stays off for the tab; after a /try adult lock nothing is carried that skips the Screen\'s own question', async () => {
    const teen = dateYearsAgo(15);
    drive(() => GuestDunkShell({ challengeCode: null, ageBands: true }), [(tree) => ageStep(tree).props.onLocked(teen.y, teen.iso)]);
    expect(readSessionAge(window.sessionStorage as any)).toBe('13-17');
    expect(cameraAllowed(readSessionAge(window.sessionStorage as any))).toBe(false);

    stubBrowser();
    const adult = dateYearsAgo(30);
    drive(() => GuestDunkShell({ challengeCode: null, ageBands: true }), [(tree) => ageStep(tree).props.onLocked(adult.y, adult.iso)]);
    expect(readSessionAge(window.sessionStorage as any)).toBe('18+');
    // The Screen (assess-app.tsx `pre`) carries only kid bands from this lock into its own run: `held && !cameraAllowed(held)`.
    const held = readSessionAge(window.sessionStorage as any);
    expect(!!held && !cameraAllowed(held)).toBe(false);
  });
});

describe('T-TRYAGE-MINOR-COOKIE (F2)', () => {
  it('the constant: value 1, session-only (no Max-Age, no Expires), Path=/, SameSite=Lax, no age / id / timestamp', () => {
    const h = tryMinorCookieHeader();
    expect(h).toMatch(/^fel_try_minor=1; Path=\/; SameSite=Lax(; Secure)?$/);
    expect(h).not.toMatch(/Max-Age|Expires|HttpOnly/i);
    expect(h).not.toMatch(/\d{4}/);
    expect(tryMinorInCookieString('a=b; fel_try_minor=1')).toBe(true);
    expect(tryMinorInCookieString('fel_try_minor=2')).toBe(false);
    expect(tryMinorInCookieString('xfel_try_minor=1')).toBe(false);
    expect(tryMinorInCookieString(null)).toBe(false);
  });

  it('flag on: a teen answer writes the constant cookie (value 1, no Max-Age / Expires); an adult answer writes none', async () => {
    const teen = dateYearsAgo(15);
    drive(() => GuestDunkShell({ challengeCode: null, ageBands: true }), [(tree) => ageStep(tree).props.onLocked(teen.y, teen.iso)]);
    const minor = cookieWrites.filter((c) => c.startsWith(`${TRY_MINOR_COOKIE}=`));
    expect(minor).toHaveLength(1);
    expect(minor[0]).toBe(tryMinorCookieHeader());
    expect(minor[0]).not.toMatch(/Max-Age|Expires/i);

    stubBrowser();
    const adult = dateYearsAgo(30);
    drive(() => GuestDunkShell({ challengeCode: null, ageBands: true }), [(tree) => ageStep(tree).props.onLocked(adult.y, adult.iso)]);
    expect(cookieWrites.filter((c) => c.startsWith(`${TRY_MINOR_COOKIE}=`))).toEqual([]);
  });

  it('a new tab (empty sessionStorage) with the cookie goes to local: no question, 0 fetch; an adult re-pick there cannot start a guest', async () => {
    stubBrowser(`${TRY_MINOR_COOKIE}=1`);
    let first!: React.ReactElement;
    const r = drive(() => { const t = GuestDunkShell({ challengeCode: null, ageBands: true }); first ??= t; return t; }, [() => runMountEffects()]);
    expect(hasAgeStep(r.tree)).toBe(false);
    expect(r.html).not.toContain(AGE_QUESTION);
    nothingSent();
    // the lock the old question would have taken is empty here, but the answer is gone from the page: no guest row can start
    expect(guestPosts()).toEqual([]);
  });

  it('flag off: the cookie is neither written nor read', async () => {
    stubBrowser(`${TRY_MINOR_COOKIE}=1`);
    const r = mount({ ageBands: false });
    expect(hasAgeStep(r.tree)).toBe(true);
    expect(cookieWrites).toEqual([]);
  });
});
