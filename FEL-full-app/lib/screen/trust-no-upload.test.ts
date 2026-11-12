// MIRROR-TRUST-RATING MT-16 (no upload) and MT-17 (a kid keeps nothing): the rating is worked out and kept on this device.
// A whole screen through the runner, the summary and this tab's storage makes no request of any kind and no database
// write, for every age band; the trust files name no network or media-export API; a kid's run still writes only the age.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ writes: [] as string[] }));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, {
    get: (_t, model) => (model === 'then' ? undefined : new Proxy({}, {
      get: (_u, op) => async () => { m.writes.push(`${String(model)}.${String(op)}`); return null; },
    })),
  }),
}));

import { AssessRunner, gradeSession } from '@/lib/assess/runner';
import { quickCapture, standFront } from '@/lib/assess/replay';
import { keptTrust, summarize, summarizeWithTrust } from './checks';
import { AGE_BANDS, isKid, type AgeBand } from './age';
import { KEYS, forgetAgeForTests, gateRecord, keepResult, lockAge, readResult, type StorageLike } from './store';

class MemStore implements StorageLike {
  m = new Map<string, string>(); writes: string[] = [];
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.writes.push(k); this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

const net = { fetch: vi.fn(), beacon: vi.fn(), xhr: vi.fn(), socket: vi.fn() };
beforeEach(() => {
  m.writes = []; forgetAgeForTests();
  for (const f of Object.values(net)) f.mockReset();
  vi.stubGlobal('fetch', net.fetch);
  vi.stubGlobal('navigator', { sendBeacon: net.beacon });
  vi.stubGlobal('XMLHttpRequest', function XHR() { net.xhr(); });
  vi.stubGlobal('WebSocket', function WS() { net.socket(); });
});
afterEach(() => { vi.unstubAllGlobals(); });

/** The page's end of a screen, from the runner's grade to this tab: the jump first, then the rest with it carried in. */
function play(age: AgeBand) {
  const tab = new MemStore();
  lockAge(tab, age);
  const jump = gradeSession(quickCapture({ fps: 60, only: ['T5'] }));
  const t5 = jump.tests.find((t) => t.id === 'T5')!;
  const carried = jump.trust.filter((r) => r.id.startsWith('jump.'));
  const runner = new AssessRunner({ aspect: 4 / 3, painAsked: true, takeoffLeg: 'left', priorTests: { T5: t5 }, priorTrust: carried, cameraFps: () => 60 });
  let t = 0;
  runner.tick({ t, present: false, image: [] }, t);
  for (const f of standFront(1).frames) { t += 16; runner.tick({ ...f, t }, t); }
  const result = gradeSession(quickCapture({ fps: 60, only: ['T1', 'T2', 'T3'] }), { T5: t5 }, carried);
  // as the page does: the summary, then the trust beside it
  const summary = summarize(result)!;
  if (result.trust.length) summary.trust = keptTrust(result.trust);
  const kept = keepResult(tab, gateRecord(age, isKid(age)), summary);
  return { tab, summary, kept, result };
}

describe('MT-16: no upload', () => {
  it.each(AGE_BANDS)('%s: runner → summary → storage sends nothing and writes no database row', (age) => {
    const run = play(age);
    expect(run.summary.trust!.length).toBeGreaterThan(0);
    for (const [k, f] of Object.entries(net)) expect(f, k).not.toHaveBeenCalled();
    expect(m.writes).toEqual([]);
  });

  it('the trust files hold no network API and no media export (toDataURL, toBlob, captureStream), no storage of their own', () => {
    const ROOT = join(__dirname, '../..');
    for (const f of ['lib/screen/trust.ts', 'lib/screen/trust-rows.ts', 'lib/screen/PROPOSED-trust.ts']) {
      const src = readFileSync(join(ROOT, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(src, f).not.toMatch(/\bfetch\s*\(|sendBeacon|XMLHttpRequest|WebSocket|EventSource|['"`]\/api\/|toDataURL|toBlob|captureStream|MediaRecorder|localStorage|sessionStorage|indexedDB|document\.cookie/);
    }
  });

  it('the existing no-save scan (its readdir of lib/screen) covers the new trust files', () => {
    const ROOT = join(__dirname, '../..');
    const scanned = readdirSync(join(ROOT, 'lib/screen')).filter((f) => /\.ts$/.test(f) && !f.endsWith('.test.ts'));
    expect(scanned).toEqual(expect.arrayContaining(['trust.ts', 'trust-rows.ts', 'PROPOSED-trust.ts']));
  });
});

describe('MT-17: kept data', () => {
  it.each(AGE_BANDS)('%s: an adult keeps the trust rows in this tab; a kid\'s run still writes only the age answer', (age) => {
    const run = play(age);
    if (isKid(age)) {
      expect(run.kept).toBe('kid');
      expect(run.tab.writes).toEqual([KEYS.age]);
      expect(readResult(run.tab)).toBeNull();
    } else {
      expect(run.kept).toBe('adult');
      expect(readResult(run.tab)!.summary.trust).toEqual(run.summary.trust);
      expect(summarizeWithTrust(run.result)).toEqual(run.summary);
    }
  });
});
