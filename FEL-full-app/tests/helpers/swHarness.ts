// Runs the real public/sw.js in Node (app-feel, round 7): a vm context with just enough of a service worker's globals
// (self, caches, fetch, clients, registration) to fire install, activate and fetch at it and see what it did.
//
// Two modes. `loadSwRules()` runs the file with no `self`, so only the pure FEL_SW object exists (its event handlers
// are skipped). `startSw()` gives it a fake worker scope and returns handles to drive it.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export const SW_PATH = path.resolve(__dirname, '../../public/sw.js');
export const ORIGIN = 'https://fel.test';

export interface SwRoute { strategy: 'bypass' | 'network-fallback' | 'cache-first' | 'stale-while-revalidate'; cache?: string }
export interface SwRules {
  VERSION: string; POSE_VERSION: string; OFFLINE_URL: string; STATIC_MAX_ENTRIES: number;
  CACHES: { static: string; pose: string; offline: string };
  strategyFor(req: { url: string; origin: string; method?: string; mode?: string; range?: boolean }): SwRoute;
  isCurrentCache(name: string): boolean;
}

const source = () => readFileSync(SW_PATH, 'utf8');

export function loadSwRules(): SwRules {
  const ctx = vm.createContext({ URL });
  vm.runInContext(source(), ctx, { filename: SW_PATH });
  return (ctx as { FEL_SW: SwRules }).FEL_SW;
}

/** A Response the way a browser's same-origin fetch reports it (type 'basic'). */
export function basic(body: string, status = 200, headers: Record<string, string> = {}): Response {
  const res = new Response(body, { status, headers });
  Object.defineProperty(res, 'type', { value: 'basic' });
  return res;
}

type Handler = (event: unknown) => void;
const keyOf = (r: string | { url: string }) => (typeof r === 'string' ? new URL(r, ORIGIN).href : r.url);

class FakeCache {
  store = new Map<string, Response>();
  async match(r: string | { url: string }) { const hit = this.store.get(keyOf(r)); return hit ? hit.clone() : undefined; }
  async put(r: string | { url: string }, res: Response) { this.store.set(keyOf(r), res); }
  async add(r: string | { url: string }) { const res = await this.fetcher(keyOf(r)); if (!res.ok) throw new TypeError('add failed'); this.store.set(keyOf(r), res); }
  async delete(r: string | { url: string }) { return this.store.delete(keyOf(r)); }
  async keys() { return [...this.store.keys()].map((url) => ({ url })); }
  constructor(private fetcher: (url: string) => Promise<Response>) {}
}

export interface FakeRequest { url: string; method: string; mode: string; headers: Headers }
export function request(pathOrUrl: string, init: { method?: string; mode?: string; headers?: Record<string, string> } = {}): FakeRequest {
  return { url: new URL(pathOrUrl, ORIGIN).href, method: init.method ?? 'GET', mode: init.mode ?? 'cors', headers: new Headers(init.headers ?? {}) };
}

export function startSw(network: (url: string) => Promise<Response>) {
  const listeners = new Map<string, Handler>();
  const named = new Map<string, FakeCache>();
  const calls = { skipWaiting: 0, claim: 0, preloadEnabled: 0, fetched: [] as string[] };
  const fetchImpl = async (r: string | { url: string }) => { const url = keyOf(r); calls.fetched.push(url); return network(url); };
  const caches = {
    async open(name: string) { if (!named.has(name)) named.set(name, new FakeCache(fetchImpl)); return named.get(name)!; },
    async keys() { return [...named.keys()]; },
    async delete(name: string) { return named.delete(name); },
    async match(r: string | { url: string }) { for (const c of named.values()) { const hit = await c.match(r); if (hit) return hit; } return undefined; },
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Handler) => listeners.set(type, fn),
    skipWaiting: async () => { calls.skipWaiting += 1; },
    clients: { claim: async () => { calls.claim += 1; } },
    registration: { navigationPreload: { enable: async () => { calls.preloadEnabled += 1; } } },
  };
  const ctx = vm.createContext({
    self, caches, fetch: fetchImpl, URL, Headers, Response, Promise, console,
    Request: class { url: string; constructor(u: string) { this.url = new URL(u, ORIGIN).href; } },
  });
  vm.runInContext(source(), ctx, { filename: SW_PATH });

  /** Fire an install or activate event and wait for everything it asked to wait for. */
  async function lifecycle(type: 'install' | 'activate') {
    const waits: Promise<unknown>[] = [];
    listeners.get(type)!({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  }

  /** Fire a fetch event. `handled` is false when the worker left the request to the browser (no respondWith). */
  async function fetchEvent(req: FakeRequest, preloadResponse?: Promise<Response | undefined>) {
    let responded: Promise<Response> | null = null;
    const waits: Promise<unknown>[] = [];
    listeners.get('fetch')!({ request: req, preloadResponse, respondWith: (p: Promise<Response>) => { responded = p; }, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    if (!responded) return { handled: false as const };
    const response: Response = await responded;
    // let the background work (cache writes, revalidation) settle, as the browser would keep the worker alive for it
    for (let i = 0; i < 5 && waits.length; i++) await Promise.all(waits.splice(0));
    return { handled: true as const, response };
  }

  return { lifecycle, fetchEvent, calls, cacheNames: () => [...named.keys()].sort(), cache: (n: string) => named.get(n), openCache: caches.open };
}
