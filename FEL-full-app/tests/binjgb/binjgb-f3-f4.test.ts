// BINJGB-SHELF-1 F3 + F4 (Cyber build review dcbbec16).
// F3: the local-frame document is sandboxed by its OWN header (CSP `sandbox allow-scripts`), not only by the parent's
//     attribute — opened top-level or framed without the attribute, it is still an opaque origin. Never allow-same-origin.
// F4: the frame and picker never hang silently: start() reports `failed` on any throw, a missing _malloc, a 0 pointer or
//     a rejected factory; a 10 s parent watchdog from mount to `started`; file.arrayBuffer() failures read as unreadable.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware, ROUTE_POLICIES } from '../../middleware';
import { FRAME_RUNTIME, frameConfig } from '@/lib/binjgb/frameDoc';
import { MSG } from '@/lib/binjgb/messages';
import { armStartWatchdog, START_TIMEOUT_MS } from '@/lib/binjgb/watchdog';
import { read, syntheticCart } from './helpers';

const call = (path: string) => middleware(new NextRequest(`http://fel.test${path}`));
const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('F3: the local frame is sandboxed by its own CSP', () => {
  it('local-frame CSP ends with `sandbox allow-scripts`, never allow-same-origin', () => {
    const csp = call('/play/gb-shelf/local-frame').headers.get('Content-Security-Policy') ?? '';
    expect(csp).toMatch(/; sandbox allow-scripts$/);
    expect(csp.match(/sandbox/g)).toHaveLength(1);
    expect(csp).not.toContain('allow-same-origin');
    expect(csp).toContain("frame-ancestors 'self'");
  });

  it('the shelf page and its title routes carry no sandbox directive', () => {
    for (const p of ['/play/gb-shelf', '/play/gb-shelf/some-slug']) {
      expect(call(p).headers.get('Content-Security-Policy') ?? '', p).not.toContain('sandbox');
    }
  });

  it('only the local-frame row has a sandbox; the pose routes (report-only) are unchanged', () => {
    expect(ROUTE_POLICIES.filter((r) => r.sandbox !== null).map((r) => [r.prefix, r.sandbox])).toEqual([['/play/gb-shelf/local-frame', 'allow-scripts']]);
    for (const p of ['/screen', '/play/mirror/assess']) {
      const res = call(p);
      expect(res.headers.get('Content-Security-Policy-Report-Only') ?? '', p).not.toContain('sandbox');
      expect(res.headers.get('Content-Security-Policy'), p).toBeNull();
    }
  });

  it("the parent's receive rule is unchanged: 'null' origin from the frame's own window", () => {
    expect(code('lib/binjgb/messages.ts')).toMatch(/if \(event\.origin !== 'null'\) return null;/);
  });
});

describe('F4: the frame reports failed instead of hanging', () => {
  const APP = 'https://fel.example';

  function boot(makeModule: () => unknown) {
    const posts: { type: string }[] = [];
    const parent = { postMessage: (msg: { type: string }) => { posts.push(msg); } };
    const listeners: Record<string, ((ev: unknown) => void)[]> = {};
    const canvas = {
      style: {} as Record<string, string>, focus: vi.fn(), addEventListener: vi.fn(),
      getContext: () => ({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: vi.fn() }),
    };
    const w = {
      document: { getElementById: () => canvas, body: { style: {} } },
      parent, Binjgb: vi.fn(makeModule), innerWidth: 390, innerHeight: 400,
      requestAnimationFrame: vi.fn(() => 7), cancelAnimationFrame: vi.fn(),
      addEventListener: (t: string, f: (ev: unknown) => void) => { (listeners[t] ??= []).push(f); },
    };
    // eslint-disable-next-line no-new-func
    new Function(`return (${FRAME_RUNTIME})`)()(w, frameConfig(APP));
    const load = () => {
      for (const f of listeners.message ?? []) f({ origin: APP, source: parent, data: { type: MSG.load, cart: ab(syntheticCart()), wasm: new ArrayBuffer(8), battery: null } });
    };
    return { posts, load, w };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const goodModule = (over: Record<string, unknown> = {}) => ({
    HEAPU8: new Uint8Array(1 << 20), _malloc: vi.fn(() => 4096), _free: vi.fn(), _emulator_new_simple: vi.fn(() => 1), _emulator_delete: vi.fn(),
    _get_frame_buffer_ptr: () => 0, _get_frame_buffer_size: () => 160 * 144 * 4, _emulator_get_ticks_f64: () => 0,
    _emulator_run_until_f64: () => 4, _emulator_was_ext_ram_updated: () => 0, ...over,
  });
  const types = (posts: { type: string }[]) => posts.map((p) => p.type);

  it('control: a working module starts', async () => {
    const f = boot(async () => goodModule());
    f.load(); await flush();
    expect(types(f.posts)).toEqual([MSG.ready, MSG.started]);
  });

  it('no _malloc → failed (once), nothing started', async () => {
    const f = boot(async () => goodModule({ _malloc: undefined }));
    f.load(); await flush();
    expect(types(f.posts)).toEqual([MSG.ready, MSG.failed]);
  });

  it('_malloc returns 0 (no room in the fixed heap) → failed, the emulator is never created', async () => {
    const mod = goodModule({ _malloc: vi.fn(() => 0) });
    const f = boot(async () => mod);
    f.load(); await flush();
    expect(types(f.posts)).toEqual([MSG.ready, MSG.failed]);
    expect(mod._emulator_new_simple).not.toHaveBeenCalled();
  });

  it('a throw anywhere in the body (aborting malloc, emulator) → failed, pointer freed, no frame loop left running', async () => {
    const mod = goodModule({ _emulator_new_simple: vi.fn(() => { throw new Error('abort'); }) });
    const f = boot(async () => mod);
    f.load(); await flush();
    expect(types(f.posts)).toEqual([MSG.ready, MSG.failed]);
    expect(mod._free).toHaveBeenCalledWith(4096);
    expect(f.w.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('emulator_new returns 0 → failed and the cart memory is freed', async () => {
    const mod = goodModule({ _emulator_new_simple: vi.fn(() => 0) });
    const f = boot(async () => mod);
    f.load(); await flush();
    expect(types(f.posts)).toEqual([MSG.ready, MSG.failed]);
    expect(mod._free).toHaveBeenCalledWith(4096);
  });

  it('the factory rejects, throws synchronously, or returns a non-promise → failed', async () => {
    for (const make of [async () => { throw new Error('wasm'); }, () => { throw new Error('sync'); }, () => 42]) {
      const f = boot(make as () => unknown);
      f.load(); await flush();
      expect(types(f.posts)).toEqual([MSG.ready, MSG.failed]);
    }
  });

  it('a second load after a failure does not send failed twice', async () => {
    const f = boot(async () => goodModule({ _malloc: vi.fn(() => 0) }));
    f.load(); await flush(); f.load(); await flush();
    expect(types(f.posts).filter((t) => t === MSG.failed)).toHaveLength(1);
  });
});

describe('F4: the parent watchdog and the file read', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('the start watchdog is 10 s and fires once', () => {
    vi.useFakeTimers();
    expect(START_TIMEOUT_MS).toBe(10_000);
    const onTimeout = vi.fn();
    armStartWatchdog(onTimeout);
    vi.advanceTimersByTime(9_999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('disarming (started / failed / stop / unmount) means it never fires', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const disarm = armStartWatchdog(onTimeout);
    vi.advanceTimersByTime(5_000);
    disarm();
    disarm();
    vi.advanceTimersByTime(20_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('the player arms it from mount while loading, and on timeout shows wasmFail and stops', () => {
    const p = code('components/binjgb/local-player.tsx');
    expect(p).toMatch(/if \(!mounted \|\| phase !== 'loading'\) return;\s*return armStartWatchdog\(\(\) => \{\s*setError\(SHELF_COPY\.wasmFail\);\s*stop\(\);\s*\}\);/);
  });

  it('file.arrayBuffer() is caught and reads as unreadable; still the only read, still after the size/type check', () => {
    const p = code('components/binjgb/local-player.tsx');
    expect(p.match(/file\.arrayBuffer\(\)/g)).toHaveLength(1);
    expect(p).toMatch(/try \{\s*bytes = await file\.arrayBuffer\(\);\s*\} catch \{\s*setPicked\(null\); setPhase\('idle'\); setError\(PICKER_COPY\.unreadable\); return;\s*\}/);
    expect(p.indexOf('checkFileMeta(file)')).toBeLessThan(p.indexOf('file.arrayBuffer()'));
  });
});
