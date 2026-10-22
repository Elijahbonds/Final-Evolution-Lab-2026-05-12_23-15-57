// SCREEN-MINOR-LOCK (PM 2026-10-21; Cyber network log run 2: 13–17, under 13 and "rather not say" reached results with
// the camera ON). Until the parent flow ships, the Quick Screen's camera is for 18 or older only:
//
//   · under 13, 13–17, "rather not say" and no age: no camera card, no camera asked for (no PoseService start, no
//     getUserMedia), no camera component in the tree; the one way on is the camera-free card's single button.
//   · 18 or older: unchanged, the camera card and then the camera.
//   · the age answer: sessionStorage only (no cookie, no localStorage), and an answer under 18 or "rather not say" is
//     locked for the rest of the session — a new Start, the card's restart button or a later "18 or older" cannot loosen it.
//
// THE REAL PAGE IS DRIVEN, NOT A COPY OF IT. assess-app.tsx is called as a function under a tiny hook runtime (React's
// hooks swapped for a per-component store while the page renders; effects run after each render as React would), its
// element tree is walked, and the buttons' own callbacks are pressed. The camera owner (screen-pose.ts) is a spy, and
// navigator.mediaDevices.getUserMedia is a spy too.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// ── a hook runtime for one component ──
const hooks = vi.hoisted(() => {
  type Effect = { deps: unknown[] | undefined; cleanup?: (() => void) | void };
  const rt = {
    on: false,
    slots: [] as unknown[],
    effects: [] as Effect[],
    pending: [] as { i: number; fn: () => (() => void) | void }[],
    i: 0,
    e: 0,
    dirty: false,
  };
  const same = (a: unknown[] | undefined, b: unknown[] | undefined) => !!a && !!b && a.length === b.length && a.every((x, k) => Object.is(x, b[k]));
  const api = {
    useState<T>(init: T | (() => T)): [T, (v: T | ((p: T) => T)) => void] {
      const i = rt.i++;
      if (!(i in rt.slots)) rt.slots[i] = typeof init === 'function' ? (init as () => T)() : init;
      const set = (v: T | ((p: T) => T)) => {
        const next = typeof v === 'function' ? (v as (p: T) => T)(rt.slots[i] as T) : v;
        if (!Object.is(next, rt.slots[i])) { rt.slots[i] = next; rt.dirty = true; }
      };
      return [rt.slots[i] as T, set];
    },
    useRef<T>(init: T): { current: T } {
      const i = rt.i++;
      if (!(i in rt.slots)) rt.slots[i] = { current: init };
      return rt.slots[i] as { current: T };
    },
    useCallback<T>(fn: T): T { rt.i++; return fn; },
    useEffect(fn: () => (() => void) | void, deps?: unknown[]) {
      const e = rt.e++;
      const had = rt.effects[e];
      if (!had || !same(had.deps, deps)) { rt.pending.push({ i: e, fn }); rt.effects[e] = { deps, cleanup: had?.cleanup }; }
    },
  };
  return { rt, api };
});

vi.mock('react', async (orig) => {
  const actual = await orig<typeof import('react')>();
  const pick = <K extends 'useState' | 'useRef' | 'useCallback' | 'useEffect'>(k: K) =>
    ((...a: unknown[]) => (hooks.rt.on ? (hooks.api[k] as (...x: unknown[]) => unknown)(...a) : (actual[k] as (...x: unknown[]) => unknown)(...a))) as (typeof actual)[K];
  const effect = pick('useEffect');
  return { ...actual, default: actual, useState: pick('useState'), useRef: pick('useRef'), useCallback: pick('useCallback'), useEffect: effect, useLayoutEffect: effect };
});

// ── the camera owner, the router and the page's two own hooks, as spies ──
const cam = vi.hoisted(() => ({ starts: [] as unknown[], stops: 0 }));
vi.mock('@/app/play/mirror/assess/_components/screen-pose', () => {
  const svc = {
    status: { state: 'idle', camera: null, model: null, source: 'camera', why: null },
    stats: { fps: 0 },
    video: null,
    start: (o: unknown) => { cam.starts.push(o); return new Promise<boolean>(() => {}); },   // never resolves: the ask is what is counted
    stop: () => { cam.stops++; },
    onStatus: () => () => {},
    onFrame: () => () => {},
    requestHighRate: async () => ({ cameraFps: null }),
    endHighRate: () => {},
  };
  return { screenPose: () => svc, pageMemoryStorage: () => ({ get: () => null, set: () => {} }) };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: () => {}, push: () => {}, back: () => {} }) }));
vi.mock('@/app/play/mirror/assess/_components/use-voice', () => ({ useVoice: () => ({ on: true, setOn: () => {}, speak: () => {} }) }));
vi.mock('@/app/play/mirror/assess/_components/use-leave-guard', () => ({ useLeaveGuard: () => ({ asking: false, stay: () => {}, leave: () => {} }) }));

import { AssessApp } from '@/app/play/mirror/assess/_components/assess-app';
import { AgeStep, CameraInfoStep, GrownUpStep, PainStep, StartStep, TakeoffStep } from '@/app/play/mirror/assess/_components/gate-steps';
import { KidNoCamera, KidResults } from '@/app/play/mirror/assess/_components/kid-results';
import { LiveHud } from '@/app/play/mirror/assess/_components/live-hud';
import { CAMERA_INFO_BUTTON, CAMERA_INFO_TITLE, GROWN_UP_CHECKBOX, KID_NO_CAMERA_BODY, KID_NO_CAMERA_TITLE } from './copy';
import { KEYS, SCREEN_PREFIX, cameraAllowed, clearScreen, forgetAgeForTests, lockAge, lockSessionAge, readAge, readSessionAge, resetAge } from './store';
import type { AgeBand } from './age';

// ── the browser, as spies ──
type Call = { where: string; op: string; key?: string };
let calls: Call[] = [];
class SpyStorage {
  constructor(private readonly where: string, readonly m = new Map<string, string>()) {}
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { calls.push({ where: this.where, op: 'setItem', key: k }); this.m.set(k, v); }
  removeItem(k: string) { calls.push({ where: this.where, op: 'removeItem', key: k }); this.m.delete(k); }
  clear() { calls.push({ where: this.where, op: 'clear' }); this.m.clear(); }
}
let session: SpyStorage, local: SpyStorage, getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  calls = [];
  cam.starts = []; cam.stops = 0;
  session = new SpyStorage('sessionStorage');
  local = new SpyStorage('localStorage');
  forgetAgeForTests();
  clearScreen(null);
  getUserMedia = vi.fn(async () => { throw new Error('no camera in a test'); });
  const cookieJar = { get cookie() { return ''; }, set cookie(v: string) { calls.push({ where: 'document.cookie', op: 'set', key: v.split('=')[0] }); } };
  const noop = () => {};
  vi.stubGlobal('window', {
    sessionStorage: session, localStorage: local, location: { pathname: '/play/mirror/assess', search: '', hostname: 'screen.example' },
    history: { length: 1, back: noop }, addEventListener: noop, removeEventListener: noop, visualViewport: null, speechSynthesis: { cancel: noop },
  });
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', session);
  vi.stubGlobal('document', cookieJar);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia }, userAgent: 'test', maxTouchPoints: 0 });
});
afterEach(() => { vi.unstubAllGlobals(); hooks.rt.on = false; });

// ── the page ──
/** One mounted AssessApp: render, run its effects, re-render while state changed; then the tree. */
function mount(initialRun: 'jump' | 'full' | null = null) {
  const rt = hooks.rt;
  rt.slots = []; rt.effects = []; rt.pending = [];
  let tree: ReactElement | null = null;
  const render = () => {
    for (let guard = 0; guard < 50; guard++) {
      rt.on = true; rt.i = 0; rt.e = 0; rt.dirty = false; rt.pending = [];
      try { tree = AssessApp({ initialRun }) as ReactElement; } finally { rt.on = false; }
      for (const p of rt.pending) {
        const had = rt.effects[p.i];
        if (typeof had?.cleanup === 'function') had.cleanup();
        rt.on = true;
        try { had.cleanup = p.fn(); } finally { rt.on = false; }
      }
      if (!rt.dirty) return;
    }
    throw new Error('the page never settled');
  };
  /** Press a callback from the tree, then let the page settle. */
  const press = (fn: (() => void) | undefined) => { expect(fn).toBeTypeOf('function'); fn!(); render(); };
  render();
  return {
    get tree() { return tree!; },
    find: <P,>(type: unknown) => all(tree, type) as ReactElement<P>[],
    press,
  };
}

/** Every element of `type` in a tree of elements (the page's own tree; child components are not rendered). */
function all(node: ReactNode, type: unknown, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) { for (const n of node) all(n, type, out); return out; }
  if (!isValidElement(node)) return out;
  if (node.type === type) out.push(node);
  const p = node.props as Record<string, unknown>;
  all(p.children as ReactNode, type, out);
  return out;
}
const one = <P,>(page: ReturnType<typeof mount>, type: unknown): P => {
  const hits = page.find<P>(type);
  expect(hits, String((type as { name?: string }).name ?? type)).toHaveLength(1);
  return hits[0].props as P;
};

/** No camera card, no grown-up step that talks about the camera, no picture, no HUD, no canvas: nothing camera-shaped. */
function noCameraInTree(page: ReturnType<typeof mount>) {
  for (const t of [CameraInfoStep, GrownUpStep, PainStep, TakeoffStep, LiveHud, 'canvas', 'video']) expect(page.find(t), String(t)).toEqual([]);
}
const asked = () => cam.starts.length + getUserMedia.mock.calls.length;
const writes = () => calls.filter((c) => c.op !== 'send');

/** From the start card to the age answer, as a person taps it. */
function answer(page: ReturnType<typeof mount>, age: AgeBand, kind: 'jump' | 'full' = 'jump') {
  const start = one<{ onJump: () => void; onFull: () => void }>(page, StartStep);
  page.press(kind === 'jump' ? start.onJump : start.onFull);
  page.press(one<{ onAnswer: (a: AgeBand) => void }>(page, AgeStep).onAnswer.bind(null, age));
}

const MINORS = ['under-13', '13-17', 'unknown'] as const;

describe('under 13, 13–17 and "rather not say": no camera ask, no camera, one camera-free way on', () => {
  it.each(MINORS)('%s: the age answer goes straight to the camera-free card; no camera card, no PoseService start, no getUserMedia', (age) => {
    const page = mount();
    answer(page, age);
    noCameraInTree(page);
    const card = one<{ onRestart: () => void }>(page, KidNoCamera);
    expect(asked()).toBe(0);
    expect(cam.starts).toEqual([]);
    expect(getUserMedia).not.toHaveBeenCalled();
    // the card's markup: its one button, and no camera ask in it
    const html = renderToStaticMarkup(<KidNoCamera onRestart={card.onRestart} />);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('Continue without the camera');
    expect(html).not.toContain('Back to the start');
    expect(html).toContain(KID_NO_CAMERA_TITLE);
    expect(html).toContain(KID_NO_CAMERA_BODY);
    for (const s of [CAMERA_INFO_BUTTON, CAMERA_INFO_TITLE, GROWN_UP_CHECKBOX, 'Allow']) expect(html).not.toContain(s);
    expect(html).not.toMatch(/href="https?:/);
  });

  it.each(MINORS)('%s, the full screen too, and from a ?run= link (no start card)', (age) => {
    const page = mount();
    answer(page, age, 'full');
    noCameraInTree(page);
    one(page, KidNoCamera);
    forgetAgeForTests(); session.m.clear();                   // a new tab: the session lock above would skip the question
    const linked = mount('full');
    linked.press(one<{ onAnswer: (a: AgeBand) => void }>(linked, AgeStep).onAnswer.bind(null, age));
    noCameraInTree(linked);
    one(linked, KidNoCamera);
    expect(asked()).toBe(0);
  });

  it.each(MINORS)('%s: the card\'s only button goes back to the start, and a new Start comes straight back to the card — the question is not asked again', (age) => {
    const page = mount();
    answer(page, age);
    page.press(one<{ onRestart: () => void }>(page, KidNoCamera).onRestart);
    expect(page.find(KidNoCamera)).toEqual([]);
    page.press(one<{ onJump: () => void }>(page, StartStep).onJump);
    expect(page.find(AgeStep)).toEqual([]);
    one(page, KidNoCamera);
    noCameraInTree(page);
    expect(asked()).toBe(0);
  });

  it('no age at all (a camera button pressed with no answer) never reaches the camera', () => {
    // the page's own lock: with nothing answered, cameraAllowed refuses every band the page could hold
    expect(cameraAllowed(null, null, null)).toBe(false);
    expect(cameraAllowed(undefined)).toBe(false);
    expect(cameraAllowed('18+', null)).toBe(false);
    for (const a of MINORS) expect(cameraAllowed(a)).toBe(false);
    expect(cameraAllowed('18+', '18+', '18+')).toBe(true);
    const page = mount();
    one(page, StartStep);
    expect(asked()).toBe(0);
  });

  it.each(MINORS)('%s: the back arrow on the card is a restart, never a step toward the camera', (age) => {
    const page = mount();
    answer(page, age);
    const back = (page.tree.props as { back: () => void }).back;
    page.press(back);
    one(page, StartStep);
    noCameraInTree(page);
    expect(asked()).toBe(0);
  });
});

describe('18 or older: unchanged — the camera card, then the camera', () => {
  it('jump and full: pain → take-off → the camera card → one camera start', () => {
    for (const kind of ['jump', 'full'] as const) {
      cam.starts = [];
      forgetAgeForTests();
      session.m.clear();
      const page = mount();
      answer(page, '18+', kind);
      expect(page.find(KidNoCamera)).toEqual([]);
      page.press(one<{ onAnswer: (h: boolean) => void }>(page, PainStep).onAnswer.bind(null, false));
      page.press(one<{ onAnswer: (s: 'left' | 'right' | null) => void }>(page, TakeoffStep).onAnswer.bind(null, 'left'));
      // the camera card's effect presses it (SCREEN-REALTIME): the camera is asked for, once
      expect(cam.starts).toHaveLength(1);
      expect(page.find(KidNoCamera)).toEqual([]);
    }
  });

  it('a kid answer earlier in the session still closes the camera to a later "18 or older" (the next Start never asks)', () => {
    const page = mount();
    answer(page, '13-17');
    page.press(one<{ onRestart: () => void }>(page, KidNoCamera).onRestart);
    page.press(one<{ onJump: () => void }>(page, StartStep).onJump);
    expect(page.find(AgeStep)).toEqual([]);
    one(page, KidNoCamera);
    // even a fresh mount of the page in the same tab (a reload) holds it
    const reload = mount();
    reload.press(one<{ onJump: () => void }>(reload, StartStep).onJump);
    one(reload, KidNoCamera);
    expect(asked()).toBe(0);
  });

  it('an adult answer is asked again on a new Start (AGE-RESET), and a kid answer then locks the session', () => {
    const page = mount();
    answer(page, '18+');
    one(page, PainStep);
    page.press((page.tree.props as { back: () => void }).back);   // pain → the start card (18 or older)
    answer(page, 'under-13');
    one(page, KidNoCamera);
    expect(readSessionAge(session)).toBe('under-13');
    expect(asked()).toBe(0);
  });
});

describe('the age answer: sessionStorage only, and locked for the session', () => {
  it.each([...MINORS, '18+'] as const)('%s: no cookie and no localStorage, start to finish; every write is a fel.screen.* sessionStorage key', (age) => {
    const page = mount();
    answer(page, age);
    if (age !== '18+') page.press(one<{ onRestart: () => void }>(page, KidNoCamera).onRestart);
    expect(calls.filter((c) => c.where === 'document.cookie')).toEqual([]);
    expect(calls.filter((c) => c.where === 'localStorage')).toEqual([]);
    expect(local.m.size).toBe(0);
    for (const w of writes()) {
      expect(w.where).toBe('sessionStorage');
      expect(w.key!.startsWith(SCREEN_PREFIX)).toBe(true);
    }
    expect(session.m.get(KEYS.age)).toBe(age);
    expect(session.m.get(KEYS.sessionAge)).toBe(age);
  });

  it.each(MINORS)('%s: the session lock only tightens — a later answer, resetAge, "Done, clear my results" and lockAge cannot loosen it', (age) => {
    expect(lockSessionAge(session, age)).toBe(age);
    expect(lockSessionAge(session, '18+')).toBe(age);
    resetAge(session);
    clearScreen(session, local);
    expect(readSessionAge(session)).toBe(age);
    expect(session.m.get(KEYS.sessionAge)).toBe(age);
    lockAge(session, '18+');                                  // the run's key says adult…
    expect(readAge(session)).toBe('18+');
    expect(cameraAllowed(readAge(session), readSessionAge(session))).toBe(false);   // …the session still says no camera
  });

  it('a hand-edited session key cannot loosen what this page already holds', () => {
    lockSessionAge(session, '13-17');
    session.m.set(KEYS.sessionAge, '18+');
    expect(readSessionAge(session)).toBe('13-17');
    session.m.set(KEYS.sessionAge, 'adult');
    expect(readSessionAge(session)).toBe('13-17');
  });

  it('a browser that refuses sessionStorage still holds the lock for the page\'s life, and writes nowhere else', () => {
    const refusing = { length: 0, key: () => null, getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
    expect(lockSessionAge(refusing, 'unknown')).toBe('unknown');
    expect(lockSessionAge(refusing, '18+')).toBe('unknown');
    expect(readSessionAge(refusing)).toBe('unknown');
    expect(calls).toEqual([]);
  });

  it('the page wires the session lock where the source says: the age answer, every new Start, and the camera itself', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const app = readFileSync(join(__dirname, '../../app/play/mirror/assess/_components/assess-app.tsx'), 'utf8');
    expect(app).toMatch(/input\.type === 'age' \? \{ type: 'age', age: lockSessionAge\(tabStorage\(\), input\.age\) \} : input;/);
    expect(app).toMatch(/if \(held && !cameraAllowed\(held\)\) lockAge\(tabStorage\(\), held\);/);
    expect(app).toMatch(/if \(!cameraAllowed\(preRef\.current\.age, readAge\(tabStorage\(\)\), readSessionAge\(tabStorage\(\)\)\)\) \{ setPhase\('noCamera'\); return; \}/);
    // and no kid result is reachable any more from the camera: the kid card holds no camera number
    expect(renderToStaticMarkup(<KidNoCamera onRestart={() => {}} />)).not.toMatch(/data-kid-jump|data-kid-number/);
    expect(KidResults).toBeTypeOf('function');
  });
});
