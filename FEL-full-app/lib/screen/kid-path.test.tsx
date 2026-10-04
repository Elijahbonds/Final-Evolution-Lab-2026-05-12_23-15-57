// SCREEN-FIX-2 item 3 (Research 11:01 AM PT; FE PM + Research amend 11:50 AM PT, which sets the storage rule):
// UNDER 18 (under 13, 13–17, "rather not say") SEES ONLY THEIR OWN NUMBER, AND KEEPS ONLY THE AGE ANSWER.
//
//   · The one thing an under-18 run keeps is the AGE ANSWER, in this tab's sessionStorage (the per-run lock, S-12;
//     AGE-RESET: every new Start asks it again, "Run it again" included). Their result, takeoff leg, gate record and
//     everything else live in page memory only, grown-up ticked or not. Nothing in localStorage, IndexedDB or cookies,
//     and nothing sent (no fetch, XHR, beacon or socket), start to finish.
//   · 18 or older keep the age answer and their results in this tab's sessionStorage (fel.screen.* keys), as before.
//   · The kid view: the jump, the change since their last screen on this page, the save-your-number line, "Run it again"
//     and the privacy page. No band, colour, grade, priority, cue, label, rank or "personal best".
//
// The page's own calls are made here as assess-app.tsx makes them (lib/screen/flow.test.ts pins those lines in the page):
// clearScreen / readAge / lockAge on the steps, writeTakeoff at the takeoff prompt, keepResult at the end, and the
// screen's PoseService memory (screen-pose.ts) when the model drops to lite. Every browser store and sender is a spy.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { gradeSession } from '@/lib/assess/runner';
import { cmj, kneeWall, ohsFront, ohsSide, singleLegSquat, syntheticCalibration } from '@/lib/assess/replay';
import { MODEL_MEMORY_KEY } from '@/lib/pose/modelChoice';
import { KidResults } from '@/app/play/mirror/assess/_components/kid-results';
import { ResultsView } from '@/app/play/mirror/assess/_components/results-view';
import { screenPose } from '@/app/play/mirror/assess/_components/screen-pose';
import { summarize, type ScreenSummary } from './checks';
import { PRE_START, preStep, type PreEvent, type PreState } from './flow';
import { KEYS, SCREEN_PREFIX, clearScreen, forgetAgeForTests, keepResult, localForClear, lockAge, readAge, readResult, recall, resetAge, tabStorage, writeTakeoff } from './store';
import { isKid, type AgeBand } from './age';
import { jumpChange, jumpChangeLine } from './kid';
import { BAND_WORDS } from './PROPOSED-thresholds';
import { KID_JUMP, KID_NO_JUMP, KID_SAME_AS_LAST, KID_SAVE_LINE, RUN_IT_AGAIN, SCREENSHOT_LINE } from './copy';

// ── the browser, as spies ──
type Call = { where: string; op: string; key?: string };
let calls: Call[] = [];
class SpyStorage {
  constructor(private readonly where: string, private readonly m = new Map<string, string>()) {}
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { calls.push({ where: this.where, op: 'setItem', key: k }); this.m.set(k, v); }
  removeItem(k: string) { calls.push({ where: this.where, op: 'removeItem', key: k }); this.m.delete(k); }
  clear() { calls.push({ where: this.where, op: 'clear' }); this.m.clear(); }
  keys() { return [...this.m.keys()]; }
}
let session: SpyStorage, local: SpyStorage;
const sent = (where: string) => (...a: unknown[]) => { calls.push({ where, op: 'send', key: String(a[0] ?? '') }); };

beforeEach(() => {
  calls = [];
  session = new SpyStorage('sessionStorage');
  local = new SpyStorage('localStorage');
  forgetAgeForTests();
  clearScreen(null);
  const cookieJar = { get cookie() { return ''; }, set cookie(v: string) { calls.push({ where: 'document.cookie', op: 'set', key: v.split('=')[0] }); } };
  vi.stubGlobal('window', { sessionStorage: session, localStorage: local, location: { pathname: '/play/mirror/assess', search: '', hostname: 'screen.example' } });
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', session);
  vi.stubGlobal('document', cookieJar);
  vi.stubGlobal('indexedDB', { open: sent('indexedDB.open') });
  vi.stubGlobal('fetch', vi.fn(sent('fetch')));
  vi.stubGlobal('XMLHttpRequest', class { open = sent('XMLHttpRequest.open'); send = sent('XMLHttpRequest.send'); });
  vi.stubGlobal('navigator', { sendBeacon: sent('navigator.sendBeacon') });
  vi.stubGlobal('WebSocket', class { constructor(url: string) { sent('WebSocket')(url); } send = sent('WebSocket.send'); });
});
afterEach(() => { vi.unstubAllGlobals(); });

// ── the athlete ──
const cal = syntheticCalibration();
const summaryFor = (jumpM: number): ScreenSummary => summarize(gradeSession({
  calibration: cal, T1: { front: ohsFront({ kneeInL: 0.06 }).frames, side: ohsSide().frames },
  T2: { left: kneeWall('left').frames, right: kneeWall('right').frames },
  T3: { left: singleLegSquat('left').frames, right: singleLegSquat('right').frames }, T5: cmj([0, 1, 2].map(() => ({ heightM: jumpM }))).frames,
  takeoffLeg: 'left',
}))!;
const FIRST = summaryFor(0.40), SECOND = summaryFor(0.45);

/** The page (assess-app.tsx), its steps and its end, with the page's memory of the last jump (a ref there). */
function page() {
  let pre: PreState = PRE_START;
  let lastIn: number | null = null;
  const views: string[] = [];
  const ev = (e: PreEvent) => {
    if (e.type === 'start') { clearScreen(tabStorage(), localForClear()); resetAge(tabStorage()); }
    const x: PreEvent = e.type === 'start' ? { type: 'start', locked: readAge(tabStorage()) }
      : e.type === 'age' ? { type: 'age', age: lockAge(tabStorage(), e.age) } : e;
    pre = preStep(pre, x);
  };
  /** The camera, the takeoff prompt and the end, as the page runs them. */
  const checks = (s: ScreenSummary) => {
    // the model drops to lite on a slow desktop: PoseService writes its memory through the screen's storage
    (screenPose() as unknown as { deps: { storage: { set(k: string, v: string): void } } }).deps.storage.set(MODEL_MEMORY_KEY, '{"model":"lite"}');
    writeTakeoff(tabStorage(), pre.gate, 'left');
    const who = keepResult(tabStorage(), pre.gate, s);
    if (who === 'kid') {
      views.push(renderToStaticMarkup(createElement(KidResults, { jumpIn: s.jumpBestIn, lastIn, onRunAgain: () => {} })));
      lastIn = s.jumpBestIn ?? lastIn;
    } else {
      views.push(renderToStaticMarkup(createElement(ResultsView, { summary: recall(tabStorage())!.summary, age: readAge(tabStorage()), onClear: () => {}, onRunAgain: () => {} })));
    }
    return who;
  };
  return { ev, checks, views, get pre() { return pre; } };
}
const through = (age: AgeBand, grownUp = true): PreEvent[] => [
  { type: 'start' }, { type: 'age', age }, ...(age === '18+' || !grownUp ? [] : [{ type: 'grownUp' } as const]), { type: 'pain', hurts: false }, { type: 'cameraOn' },
];
// "Run it again" (AGE-RESET): a fresh run — the age and the grown-up step are asked again, for the same kid too.
const again = (age: AgeBand): PreEvent[] => [
  { type: 'start' }, { type: 'age', age }, ...(age === '18+' ? [] : [{ type: 'grownUp' } as const]), { type: 'pain', hurts: false }, { type: 'cameraOn' },
];

const KIDS = ['under-13', '13-17', 'unknown'] as const;
const writes = () => calls.filter((c) => c.op !== 'send');
const sends = () => calls.filter((c) => c.op === 'send');

describe('an under-18 run keeps the age answer and nothing else, and sends nothing', () => {
  it.each(KIDS)('%s, grown-up ticked: two screens ("Run it again" re-asks the age); the age answer is the only value kept, and nothing is sent', (age) => {
    const p = page();
    for (const e of through(age)) p.ev(e);
    expect(p.pre.step).toBe('camera');
    expect(p.checks(FIRST)).toBe('kid');
    for (const e of again(age)) p.ev(e);
    expect(p.pre.step).toBe('camera');
    expect(p.checks(SECOND)).toBe('kid');
    // the age answer is written per run: run 1's answer, the new Start's reset, run 2's answer — nothing else, ever
    expect(writes()).toEqual([
      { where: 'sessionStorage', op: 'setItem', key: KEYS.age },
      { where: 'sessionStorage', op: 'removeItem', key: KEYS.age },
      { where: 'sessionStorage', op: 'setItem', key: KEYS.age },
    ]);
    expect(sends()).toEqual([]);
    expect(session.keys()).toEqual([KEYS.age]);
    expect(local.keys()).toEqual([]);
    expect(readResult(tabStorage())).toBeNull();
    expect(recall(tabStorage())).toBeNull();                        // not even the page's result memory
  });

  it.each(KIDS)('%s, grown-up NOT ticked: the camera never comes, and the age answer is the only write', (age) => {
    const p = page();
    for (const e of through(age, false)) p.ev(e);
    expect(p.pre.step).toBe('grownUp');
    expect(writes()).toEqual([{ where: 'sessionStorage', op: 'setItem', key: KEYS.age }]);
    expect(sends()).toEqual([]);
  });

  it.each(KIDS)('%s: a result handed to the store, ticked or not, is refused: nothing but the age key, ever', (age) => {
    lockAge(tabStorage(), age);
    for (const grownUp of [true, false]) {
      expect(keepResult(tabStorage(), { ageBand: age, grownUp, at: 'x', textVersion: 'screen-grown-up-v2-2026-09-29' }, FIRST)).toBe('kid');
      expect(writeTakeoff(tabStorage(), { ageBand: age, grownUp, at: 'x', textVersion: 'screen-grown-up-v2-2026-09-29' }, 'right')).toBe(false);
    }
    expect(session.keys()).toEqual([KEYS.age]);
    expect(isKid(age)).toBe(true);
  });
});

describe('18 or older keep the age answer and their results in this tab, and nothing else', () => {
  it('only fel.screen.* sessionStorage keys; no localStorage, IndexedDB, cookie or send', () => {
    const p = page();
    for (const e of through('18+')) p.ev(e);
    expect(p.checks(FIRST)).toBe('adult');
    for (const e of again('18+')) p.ev(e);                          // the second screen answers the age again (AGE-RESET)
    expect(p.checks(SECOND)).toBe('adult');
    expect(writes().length).toBeGreaterThan(1);
    for (const w of writes()) {
      expect(w.where).toBe('sessionStorage');
      expect(w.key!.startsWith(SCREEN_PREFIX)).toBe(true);
    }
    expect(sends()).toEqual([]);
    expect(local.keys()).toEqual([]);
    expect(readResult(tabStorage())!.summary).toEqual(SECOND);
    expect(isKid('18+')).toBe(false);
  });
});

describe('the pose model memory (Cyber F5): page memory only, for everyone', () => {
  it('fel.pose.model never reaches localStorage from the screen\'s PoseService', () => {
    const svc = screenPose() as unknown as { deps: { storage: { get(k: string): string | null; set(k: string, v: string): void } } };
    svc.deps.storage.set(MODEL_MEMORY_KEY, 'x');
    expect(svc.deps.storage.get(MODEL_MEMORY_KEY)).toBe('x');       // the page still remembers it for its own life
    expect(local.keys()).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('the kid view: their number, the change, the save line, "Run it again"; nothing else', () => {
  const kid = (jumpIn: number | null, lastIn: number | null) => renderToStaticMarkup(createElement(KidResults, { jumpIn, lastIn, onRunAgain: () => {} }));
  const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const NEVER = [/data-band/, /data-check-card/, /data-cue/, /data-top-priority/, /data-personal-best/, /data-cta/, /Top priority/, /Try this/,
    /personal best/i, /Good to go|Worth working on|Priority to work on|Not read/, ...Object.values(BAND_WORDS).map((w) => new RegExp(w)),
    /\b(green|yellow|red)\b/i, /#00FF9D|#FFB020|#FF5A5F/, /\b(rank|average|percentile|norm|better than|compared)\b/i];

  it('a first screen: "Your jump: N in", the save-your-number line and "Run it again"; no change line yet', () => {
    const h = kid(15.7, null);
    expect(text(h)).toContain(`${KID_JUMP}: 15.7 in`);
    expect(h).toContain('data-kid-save-line');
    expect(text(h)).toContain(KID_SAVE_LINE);
    expect(h).not.toContain('data-kid-change');
    expect(h).toMatch(new RegExp(`<button[^>]*data-run-again[^>]*>${RUN_IT_AGAIN}</button>`));
    for (const re of NEVER) expect(h, String(re)).not.toMatch(re);
  });

  it('after "Run it again": the change since the last screen on this page, up, down or the same', () => {
    expect(text(kid(17.7, 15.7))).toContain('+2 in since last time');
    expect(text(kid(15.2, 15.7))).toContain('−0.5 in since last time');
    expect(text(kid(15.7, 15.7))).toContain(KID_SAME_AS_LAST);
    expect(jumpChange(17.7, 15.7)).toEqual({ kind: 'up', inches: 2 });
    expect(jumpChange(15.24, 15.2)).toEqual({ kind: 'same', inches: 0 });
    expect(jumpChangeLine({ kind: 'down', inches: 1.5 })).toBe('−1.5 in since last time');
    for (const h of [kid(17.7, 15.7), kid(15.2, 15.7)]) for (const re of NEVER) expect(h, String(re)).not.toMatch(re);
  });

  it('no jump read: "We couldn\'t read your jump this time" and "Run it again", nothing else to show', () => {
    const h = kid(null, 15.7);
    expect(text(h)).toContain(KID_NO_JUMP);
    expect(h).not.toMatch(/data-kid-number|data-kid-change|data-kid-save-line/);
    expect(h).toContain('data-run-again');
  });

  it('only one link, and it stays inside the screen (the privacy page)', () => {
    expect([...kid(15.7, 14).matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(['/screen/privacy']);
  });

  it('the save-your-number line shows on the kid path, never on the 18+ path', () => {
    const p = page();
    for (const e of through('13-17')) p.ev(e);
    p.checks(FIRST);
    expect(p.views[0]).toContain('data-kid-save-line');
    forgetAgeForTests(); clearScreen(null);
    const a = page();
    session = new SpyStorage('sessionStorage');
    vi.stubGlobal('window', { sessionStorage: session, localStorage: local, location: { pathname: '/play/mirror/assess', search: '', hostname: 'screen.example' } });
    for (const e of through('18+')) a.ev(e);
    a.checks(FIRST);
    expect(a.views[0]).not.toContain('data-kid-save-line');
    expect(a.views[0]).not.toContain(KID_SAVE_LINE);
    expect(a.views[0]).toContain(SCREENSHOT_LINE);
    expect(a.views[0]).toContain('data-screen-results');
  });

  it('the page holds the last jump in memory only, and a first screen after a new Start shows no change', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const app = readFileSync(join(__dirname, '../../app/play/mirror/assess/_components/assess-app.tsx'), 'utf8');
    expect(app).toMatch(/const lastJumpRef = useRef<number \| null>\(null\);/);
    expect(app).toMatch(/if \(keepResult\(tabStorage\(\), gateRef\.current, summary\) === 'kid'\)/);
    // the start card's Start is a new screen (maybe a new person on a shared phone): the last number goes
    expect(app).toMatch(/const startNew = \(kind: ScreenKind = 'full'\) => \{ lastJumpRef\.current = null; modeRef\.current = kind; pre\(\{ type: 'start', kind \}\); \};/);
  });
});
