// TRY-AGE-BANDS-FIX-1 v2 (Cyber N3, PM's call): the /c/[code]/play guest challenge run gets the same server-honoured, session-held age
// rule as /try. NEW tests only. The harness of shell.test.tsx: node (no jsdom), the real component and the real AgeStep inside a host
// render (tests/helpers/driveRender), mount effects run on demand, fetch / cookies / sessionStorage are stand-ins, the Babylon stage is a stub.
// The flag is the component's `ageBands` prop (app/c/[code]/play/page.tsx passes isTryAgeBandsEnabled()).
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drive, findAll, settle, type Found } from '@/tests/helpers/driveRender';

const fx = vi.hoisted(() => ({ effects: [] as Array<() => unknown> }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const useEffect = ((effect: () => unknown) => { fx.effects.push(effect); }) as typeof actual.useEffect;
  const base = ((actual as unknown as { default?: typeof actual }).default ?? actual) as typeof actual;
  return { ...actual, useEffect, default: { ...base, useEffect } };
});
vi.mock('next/dynamic', () => ({ default: () => function Stage() { return null; } }));

import { GuestChallengeRun } from '@/components/challenges/guest-challenge-run';
import { AgeStep } from '@/components/age-step';
import { AGE_QUESTION } from '@/lib/privacy/ageScreen';
import { forgetAgeForTests, KEYS } from '@/lib/screen/store';
import { TRY_MINOR_COOKIE } from '@/lib/privacy/tryMinorFlag';

const NOW = new Date();
const THIS_YEAR = NOW.getFullYear();
const SESSION_KEY = KEYS.sessionAge;
const pad = (n: number) => String(n).padStart(2, '0');
function dateYearsAgo(years: number, dayShift = 0): { y: number; m: number; d: number; iso: string } {
  const t = new Date(NOW.getFullYear() - years, NOW.getMonth(), NOW.getDate() + dayShift, 12);
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate(), iso: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}` };
}

let fetchCalls: string[] = [];
let cookieWrites: string[] = [];
let session: Map<string, string>;
function stubBrowser(cookie = '', sessionSeed: Record<string, string> = {}) {
  fetchCalls = []; cookieWrites = []; fx.effects.length = 0; forgetAgeForTests();
  session = new Map(Object.entries(sessionSeed));
  const local = new Map<string, string>();
  const storage = (m: Map<string, string>) => ({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; } });
  let jar = cookie;
  vi.stubGlobal('document', {
    get cookie() { return jar; },
    set cookie(v: string) { cookieWrites.push(v); jar = jar ? `${jar}; ${v.split(';')[0]}` : v.split(';')[0]; },
  });
  vi.stubGlobal('localStorage', storage(local));
  vi.stubGlobal('window', { sessionStorage: storage(session) });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { fetchCalls.push(String(url)); return new Response('{}'); }));
  return () => (globalThis as unknown as { document: { cookie: string } }).document.cookie;
}
beforeEach(() => { stubBrowser(); });
afterEach(() => { vi.unstubAllGlobals(); forgetAgeForTests(); });

const PROPS = { code: 'C1', modeKey: 'threePoint', title: 'Three Point', targetScore: 40, theirName: 'A friend' };
const ageStep = (tree: React.ReactElement): Found => {
  const [el] = findAll(tree, (e) => e.type === AgeStep);
  if (!el) throw new Error('no AgeStep in the tree');
  return el;
};
const hasAgeStep = (tree: React.ReactElement) => findAll(tree, (e) => e.type === AgeStep).length > 0;
const runMountEffects = () => { for (const e of fx.effects.splice(0)) e(); };
const mount = (ageBands: boolean) =>
  drive(() => { fx.effects.length = 0; return GuestChallengeRun({ ...PROPS, ageBands }); }, [() => runMountEffects()]);
const answer = (date: { y: number; m: number; d: number }): unknown[] => {
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
};
const afterAnswer = (date: { y: number; m: number; d: number }, ageBands = true) => {
  const got = answer(date);
  return drive(() => GuestChallengeRun({ ...PROPS, ageBands }), [
    (tree) => { const p = ageStep(tree).props; if (got[0] === 'blocked') p.onBlocked(); else p.onLocked(...got); },
  ]);
};
const guestPosts = () => fetchCalls.filter((u) => u === '/api/guest');

describe('N3 — /c/[code]/play: a teen / unknown / under-13 answer is held across refresh and new tab (flag on)', () => {
  it('a held 13-17 in the tab: a fresh mount does not ask again (local), nothing sent', () => {
    stubBrowser('', { [SESSION_KEY]: '13-17' });
    const r = mount(true);
    expect(hasAgeStep(r.tree)).toBe(false);
    expect(r.html).not.toContain(AGE_QUESTION);
    expect(fetchCalls).toEqual([]);
  });
  it('held under-13 -> blocked, held unknown -> local; held 18+ or nothing still asks', () => {
    stubBrowser('', { [SESSION_KEY]: 'under-13' });
    expect(hasAgeStep(mount(true).tree)).toBe(false);
    stubBrowser('', { [SESSION_KEY]: 'unknown' });
    expect(hasAgeStep(mount(true).tree)).toBe(false);
    stubBrowser('', { [SESSION_KEY]: '18+' });
    expect(hasAgeStep(mount(true).tree)).toBe(true);
    stubBrowser();
    const r = mount(true);
    expect(hasAgeStep(r.tree)).toBe(true);
    expect(r.html).toContain('challenge-age-step');
    expect(fetchCalls).toEqual([]);
  });
  it('a NEW tab: the session lock is gone but fel_try_minor is there -> local, the question is not asked, nothing sent', () => {
    stubBrowser(`${TRY_MINOR_COOKIE}=1`);
    const r = mount(true);
    expect(hasAgeStep(r.tree)).toBe(false);
    expect(fetchCalls).toEqual([]);
  });
  it('the block cookie still wins (blocked, no cookie written)', () => {
    stubBrowser('fel_age_gate=1', { [SESSION_KEY]: '13-17' });
    const r = mount(true);
    expect(hasAgeStep(r.tree)).toBe(false);
    expect(cookieWrites).toEqual([]);
  });
  it('flag OFF: a held 13-17 and the minor cookie change nothing (the question is asked as shipped)', () => {
    stubBrowser(`${TRY_MINOR_COOKIE}=1`, { [SESSION_KEY]: '13-17' });
    const r = mount(false);
    expect(hasAgeStep(r.tree)).toBe(true);
    expect(r.html).toContain(AGE_QUESTION);
  });
});

describe('N3 — the answer: the full birth date picks the band (flag on); nothing teen reaches the server', () => {
  it('a 15-year-old: local, the session-only fel_try_minor flag is written, sessionAge 13-17, 0 fetch', async () => {
    const r = afterAnswer(dateYearsAgo(15));
    await settle();
    expect(r.html).not.toContain(AGE_QUESTION);
    expect(cookieWrites.some((c) => c.startsWith(`${TRY_MINOR_COOKIE}=1;`) && !/Max-Age|Expires/i.test(c))).toBe(true);
    expect(session.get(SESSION_KEY)).toBe('13-17');
    expect(fetchCalls).toEqual([]);
  });
  it('one day short of 18: local, 0 fetch; on the 18th birthday: exactly one POST /api/guest, sessionAge 18+', async () => {
    afterAnswer(dateYearsAgo(18, 1));
    await settle();
    expect(fetchCalls).toEqual([]);
    expect(session.get(SESSION_KEY)).toBe('13-17');
    stubBrowser();
    afterAnswer(dateYearsAgo(18));
    await settle();
    expect(guestPosts()).toHaveLength(1);
    expect(fetchCalls).toHaveLength(1);
    expect(session.get(SESSION_KEY)).toBe('18+');
  });
  it('under-13 by birth date, and onBlocked: blocked, the block flag written, sessionAge under-13, 0 fetch', async () => {
    afterAnswer(dateYearsAgo(11));
    await settle();
    expect(fetchCalls).toEqual([]);
    expect(cookieWrites.some((c) => c.startsWith('fel_age_gate=1;'))).toBe(true);
    stubBrowser();
    drive(() => GuestChallengeRun({ ...PROPS, ageBands: true }), [(tree) => ageStep(tree).props.onBlocked()]);
    expect(session.get(SESSION_KEY)).toBe('under-13');
    expect(cookieWrites.some((c) => c.startsWith('fel_age_gate=1;'))).toBe(true);
    expect(fetchCalls).toEqual([]);
  });
  it('an unreadable date is unknown: local, 0 fetch, sessionAge unknown', async () => {
    drive(() => GuestChallengeRun({ ...PROPS, ageBands: true }), [(tree) => ageStep(tree).props.onLocked(THIS_YEAR - 30, '2010-13-40')]);
    await settle();
    expect(fetchCalls).toEqual([]);
    expect(session.get(SESSION_KEY)).toBe('unknown');
  });
  it('a lock holding 13-17 followed by an adult pick sends nothing (the lock only tightens)', async () => {
    stubBrowser('', { [SESSION_KEY]: '13-17' });
    let first!: React.ReactElement;
    drive(() => { const t = GuestChallengeRun({ ...PROPS, ageBands: true }); first ??= t; return t; }, [() => runMountEffects()]);
    const a = dateYearsAgo(30);
    ageStep(first).props.onLocked(a.y, a.iso);
    await settle();
    expect(fetchCalls).toEqual([]);
    expect(session.get(SESSION_KEY)).toBe('13-17');
  });
  it('a teen run posts no attempt: finishing the run keeps the result on this page only', async () => {
    const teen = dateYearsAgo(15);
    const r = drive(() => GuestChallengeRun({ ...PROPS, ageBands: true }), [(tree) => ageStep(tree).props.onLocked(teen.y, teen.iso)]);
    const stage = findAll(r.tree, (e) => typeof e.props.onEnd === 'function')[0];
    await stage.props.onEnd({ score: 70, won: true });
    await settle();
    expect(fetchCalls.filter((u) => u.startsWith('/api/challenge'))).toEqual([]);
    expect(fetchCalls).toEqual([]);
  });
  it('flag OFF: exactly the shipped behaviour (teen year -> local with no session key and no minor flag; adult year -> one POST)', async () => {
    drive(() => GuestChallengeRun({ ...PROPS, ageBands: false }), [(tree) => ageStep(tree).props.onLocked(THIS_YEAR - 15, '2000-01-01')]);
    await settle();
    expect(session.has(SESSION_KEY)).toBe(false);
    expect(cookieWrites).toEqual([]);
    expect(fetchCalls).toEqual([]);
    stubBrowser();
    drive(() => GuestChallengeRun({ ...PROPS }), [(tree) => ageStep(tree).props.onLocked(THIS_YEAR - 30)]);
    await settle();
    expect(guestPosts()).toHaveLength(1);
    expect(cookieWrites).toEqual([]);
  });
});

describe('N3 — the page hands the flag to the run', () => {
  it('app/c/[code]/play/page.tsx passes ageBands={isTryAgeBandsEnabled()} (default off)', () => {
    const page = readFileSync('app/c/[code]/play/page.tsx', 'utf8');
    expect(page).toMatch(/import \{ isTryAgeBandsEnabled \} from '@\/lib\/flags';/);
    expect(page).toMatch(/ageBands=\{isTryAgeBandsEnabled\(\)\}/);
  });
});
