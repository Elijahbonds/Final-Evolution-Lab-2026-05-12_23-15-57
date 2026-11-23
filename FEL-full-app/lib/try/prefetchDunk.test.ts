// improve-screens phase 2 (lib/try/prefetchDunk.ts): the guest dunk starts loading while /try asks the birth date, and NOTHING about
// the visitor goes with it. Pins the request list (every request a GET of a public file, no cookies, no body, no query), the order,
// once per page, failures harmless, and the knob's two ends (0 = no request at all, as before).
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEEL_STORAGE_KEY, resetFeelForTests, setFeelSession, setFeelUser } from '@/lib/feel-panel/feel';
import { feelSessionBlock } from '@/lib/feel-panel/sessionGate';
import { FEEL_KNOB_BY_ID } from '@/lib/feel-panel/knobs';
import { DUNK_FIRST_FILES, TRY_PREFETCH_DUNK, defaultDeps, isStaticFile, prefetchDunk, resetPrefetchDunkForTests, tryPrefetchDunk, type PrefetchDeps } from './prefetchDunk';

const g = globalThis as { window?: unknown };
function knob(v: number) {
  const m = new Map<string, string>([[FEEL_STORAGE_KEY, JSON.stringify({ 'try.prefetchDunk': v })]]);
  g.window = { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: () => {}, removeItem: () => {} } };
  setFeelUser(true); setFeelSession(feelSessionBlock('/play/dunk', '?playtest=1'));
}
beforeEach(() => { resetFeelForTests(); resetPrefetchDunkForTests(); });
afterEach(() => { resetFeelForTests(); delete g.window; vi.unstubAllGlobals(); });

const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function rig(fail = false) {
  const log: string[] = [];
  const deps: PrefetchDeps = {
    loadCode: async () => { log.push('code'); if (fail) throw new Error('offline'); },
    get: async (p) => { log.push(p); if (fail) throw new Error('offline'); },
    idle: (fn) => fn(),
  };
  return { log, deps };
}
const FILES = ['/models/a.glb', '/models/skins/b.jpg', '/sounds/c.mp3'];

describe('the knob try.prefetchDunk', () => {
  it('ships at 0 (the measured cut missed the 25 % bar); the catalogue row matches', () => {
    expect(TRY_PREFETCH_DUNK).toBe(0);
    const k = FEEL_KNOB_BY_ID.get('try.prefetchDunk')!;
    expect([k.def, k.min, k.max, k.step]).toEqual([0, 0, 1, 1]);
    expect(tryPrefetchDunk()).toBe(false);
  });
  it('0 (shipped): nothing at all is requested (today\'s /try)', async () => {
    const { log, deps } = rig();
    expect(prefetchDunk(deps, FILES)).toBe(false);
    await flush();
    expect(log).toEqual([]);
  });
});

describe('what it fetches (try.prefetchDunk 1)', () => {
  beforeEach(() => { knob(1); });
  it('1: the code chunk first, then every file, in the order the dunk asks for them', async () => {
    const { log, deps } = rig();
    expect(prefetchDunk(deps, FILES)).toBe(true);
    await flush();
    expect(log).toEqual(['code', ...FILES]);
  });
  it('once per page', async () => {
    const { log, deps } = rig();
    prefetchDunk(deps, FILES); prefetchDunk(deps, FILES);
    await flush();
    expect(log.filter((l) => l === 'code')).toHaveLength(1);
  });
  it('a failure (offline, a missing file) is harmless: nothing throws, the rest still go', async () => {
    const { log, deps } = rig(true);
    expect(() => prefetchDunk(deps, FILES)).not.toThrow();
    await flush();
    expect(log).toEqual(['code', ...FILES]);
  });
  it('only public files: an API route, a query, another origin or a climb out are never fetched', async () => {
    for (const bad of ['/api/guest', '/api/profile.json', '/models/a.glb?u=1', 'https://x.example/a.glb', '/models/../api/x.json', '/_next/data/x.json', '/try'])
      expect(isStaticFile(bad), bad).toBe(false);
    const { log, deps } = rig();
    prefetchDunk(deps, ['/api/guest', '/models/a.glb?who=me', '/models/ok.glb']);
    await flush();
    expect(log).toEqual(['code', '/models/ok.glb']);
  });
  it('the shipped list is public files only, each one real in public/', () => {
    for (const f of DUNK_FIRST_FILES) {
      expect(isStaticFile(f), f).toBe(true);
      expect(() => readFileSync(`public${f}`), f).not.toThrow();
    }
  });
});

describe('THE REQUEST LIST: nothing about the visitor', () => {
  it('each GET is a plain file request: method GET, credentials omitted (no cookies), no body, no headers of its own', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string, i?: RequestInit) => { calls.push([u, i]); return new Response('x'); }));
    await defaultDeps.get('/models/a.glb');
    expect(calls).toHaveLength(1);
    const [u, init] = calls[0];
    expect(u).toBe('/models/a.glb');
    expect(init?.method).toBe('GET');
    expect(init?.credentials).toBe('omit');
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toBeUndefined();
  });
  it('the code chunk is the same module next/dynamic loads at mount (no second copy, nothing else)', () => {
    const src = readFileSync('lib/try/prefetchDunk.ts', 'utf8');
    expect(src).toContain("loadCode: () => import('@/components/games/dunk-babylon'),");
    expect(readFileSync('components/games/guest-dunk-shell.tsx', 'utf8')).toContain("dynamicImport(() => import('@/components/games/dunk-babylon')");
  });
  it('the shell starts it only on the birth-date step, after hydration, for the Babylon dunk', () => {
    const shell = readFileSync('components/games/guest-dunk-shell.tsx', 'utf8');
    expect(shell).toContain("if (gate === 'ask' && hydrated && babylon) prefetchDunk();");
  });
});
