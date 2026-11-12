// BINJGB-SHELF-1 load-your-own (spec §3.5; Cyber L2 + L3 + L3-SEND, reviews 9caccc46 / 928a9bed).
// T-LOCAL-SIZE-CAP, T-LOCAL-TYPE-CHECK (malformed corpus, generated in memory), T-LOCAL-POSTMESSAGE-ORIGIN (parent helpers
// AND the frame's own program run against a fake window), T-LOCAL-NO-UPLOAD, T-LOCAL-NET, T-NO-EXTERNAL-ROM,
// T-LOCAL-ANALYTICS, T-LOCAL-NO-PERSIST, T-LOCAL-INMEM.
import { describe, expect, it, vi } from 'vitest';
import {
  checkFileMeta, hasArchiveMagic, LOCAL_FILE_ACCEPT, LOCAL_FILE_MAX_BYTES, validateCart,
} from '@/lib/binjgb/cart';
import {
  acceptFromLocalFrame, LOCAL_FRAME_PATH, LOCAL_FRAME_SANDBOX, MSG, postToLocalFrame, type LocalFrameLike,
} from '@/lib/binjgb/messages';
import { FRAME_RUNTIME, frameConfig, frameDocument } from '@/lib/binjgb/frameDoc';
import { read, sources, SHELF_CODE_DIRS, syntheticCart } from './helpers';

/** Source with line and block comments removed, so a scan sees code only (comments here quote the rules). */
const code_ = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

describe('T-LOCAL-SIZE-CAP (L2): over 8,388,608 bytes → rejected on File.size, before any read', () => {
  it('the cap is exactly 8 MiB', () => {
    expect(LOCAL_FILE_MAX_BYTES).toBe(8_388_608);
  });

  it('checkFileMeta needs only name and size: at the cap OK, one byte over → too-big; 0 bytes → empty', () => {
    expect(checkFileMeta({ name: 'a.gb', size: 8_388_608 })).toEqual({ ok: true });
    expect(checkFileMeta({ name: 'a.gb', size: 8_388_609 })).toEqual({ ok: false, reason: 'too-big' });
    expect(checkFileMeta({ name: 'a.gbc', size: 0 })).toEqual({ ok: false, reason: 'empty' });
  });

  it('the picker rejects before reading: checkFileMeta runs, and returns, before file.arrayBuffer() and before any Worker', () => {
    const src = read('components/binjgb/local-player.tsx');
    const meta = src.indexOf('checkFileMeta(file)');
    const reject = src.indexOf('if (!meta.ok)');
    const readAt = src.indexOf('file.arrayBuffer()');
    expect(meta).toBeGreaterThan(0);
    expect(reject).toBeGreaterThan(meta);
    expect(readAt).toBeGreaterThan(reject);
    expect(src.slice(reject, src.indexOf('\n', reject))).toMatch(/return;/);
    expect(src.match(/file\.arrayBuffer\(\)/g)).toHaveLength(1);
    expect(src).not.toMatch(/\.slice\(\s*0\s*,[^)]*\)\.arrayBuffer|FileReader|\.stream\(\)/);   // no partial read
  });

  it('the Worker re-checks the size on the bytes', () => {
    expect(validateCart(new ArrayBuffer(LOCAL_FILE_MAX_BYTES + 1))).toEqual({ ok: false, reason: 'too-big' });
  });
});

describe('T-LOCAL-TYPE-CHECK (L2): .gb / .gbc only; no archives, ever unpacked; header rules; no partial load', () => {
  it('extensions: .gb and .gbc in any case; everything else (archives included) rejected', () => {
    for (const n of ['x.gb', 'x.GB', 'x.gbc', 'X.GbC']) expect(checkFileMeta({ name: n, size: 1000 }), n).toEqual({ ok: true });
    for (const n of ['x.zip', 'x.7z', 'x.rar', 'x.gb.zip', 'x.bin', 'x.html', 'x.js', 'x', 'gb', 'x.gba', 'x.sgb']) {
      expect(checkFileMeta({ name: n, size: 1000 }), n).toEqual({ ok: false, reason: 'wrong-type' });
    }
    expect(LOCAL_FILE_ACCEPT).toBe('.gb,.gbc');
  });

  it('a synthetic, header-valid image passes', () => {
    expect(validateCart(ab(syntheticCart(32 * 1024)))).toEqual({ ok: true });
    expect(validateCart(ab(syntheticCart(1024 * 1024, 0x1b)))).toEqual({ ok: true });
  });

  it('the malformed corpus is rejected: truncated, oversize, bad checksum, zip, 7z, rar, polyglot HTML/JS, 0 bytes, bad size byte, bad mapper, bad colour flag', () => {
    const good = syntheticCart(32 * 1024);
    const truncated = good.slice(0, 20_000);
    const badSum = good.slice(); badSum[0x14d] ^= 1;
    const zip = good.slice(); zip.set([0x50, 0x4b, 0x03, 0x04]);
    const sevenZ = good.slice(); sevenZ.set([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
    const rar = good.slice(); rar.set([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]);
    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>'.padEnd(32 * 1024, ' '));
    const badSize = good.slice(); badSize[0x148] = 3;
    const badMapper = syntheticCart(32 * 1024, 0x20);
    const badCgb = good.slice(); badCgb[0x143] = 0x90;
    let x = 0; for (let i = 0x134; i <= 0x14c; i++) x = (x - badCgb[i] - 1) & 0xff; badCgb[0x14d] = x;
    const notPow2 = new Uint8Array(48 * 1024); notPow2.set(good);
    const corpus: [string, Uint8Array, string][] = [
      ['truncated', truncated, 'bad-header'], ['bad checksum', badSum, 'bad-header'], ['zip', zip, 'archive'],
      ['7z', sevenZ, 'archive'], ['rar', rar, 'archive'], ['polyglot html', html, 'bad-header'], ['0 bytes', new Uint8Array(0), 'empty'],
      ['size byte lies', badSize, 'bad-header'], ['mapper off the list', badMapper, 'bad-header'], ['colour flag', badCgb, 'bad-header'],
      ['not a power of two', notPow2, 'bad-header'],
    ];
    for (const [name, bytes, reason] of corpus) expect(validateCart(ab(bytes)), name).toEqual({ ok: false, reason });
    expect(hasArchiveMagic(zip)).toBe(true);
  });

  it('an extension mismatch never reaches the Worker (the name check comes first)', () => {
    expect(checkFileMeta({ name: 'game.zip', size: 32 * 1024 })).toEqual({ ok: false, reason: 'wrong-type' });
  });

  it('nothing unpacks archives: no zip/inflate code in the shelf', () => {
    for (const f of sources(SHELF_CODE_DIRS)) expect(read(f), f).not.toMatch(/DecompressionStream|inflate|unzip|jszip|fflate|pako/i);
  });
});

describe('T-LOCAL-POSTMESSAGE-ORIGIN — parent side (L3 receive + L3-SEND)', () => {
  function fakeFrame(opts: { sandbox?: string[]; src?: string; marked?: boolean } = {}) {
    const posts: { msg: unknown; target: string; transfer?: Transferable[] }[] = [];
    const contentWindow = { postMessage: (msg: unknown, target: string, transfer?: Transferable[]) => { posts.push({ msg, target, transfer }); } };
    const tokens = new Set(opts.sandbox ?? ['allow-scripts']);
    const attrs: Record<string, string> = { src: opts.src ?? LOCAL_FRAME_PATH, ...(opts.marked === false ? {} : { 'data-fel-local-frame': '1' }) };
    const frame: LocalFrameLike = { contentWindow, sandbox: { contains: (t) => tokens.has(t) }, getAttribute: (n) => attrs[n] ?? null };
    return { frame, posts, contentWindow };
  }

  it("receive: only event.source === iframe.contentWindow AND event.origin === 'null'; forged origins ignored", () => {
    const { frame, contentWindow } = fakeFrame();
    const ok = { source: contentWindow, origin: 'null', data: { type: MSG.ready } };
    expect(acceptFromLocalFrame(ok, frame)).toEqual({ type: MSG.ready });
    expect(acceptFromLocalFrame({ ...ok, origin: 'https://fel.example' }, frame)).toBeNull();   // same-origin forgery
    expect(acceptFromLocalFrame({ ...ok, origin: 'https://evil.example' }, frame)).toBeNull();
    expect(acceptFromLocalFrame({ ...ok, source: {} }, frame)).toBeNull();                      // another 'null' window
    expect(acceptFromLocalFrame({ ...ok, source: null }, frame)).toBeNull();
    expect(acceptFromLocalFrame(ok, null)).toBeNull();
    expect(acceptFromLocalFrame({ ...ok, data: { type: 'fel-binjgb:pwn' } }, frame)).toBeNull();
    expect(acceptFromLocalFrame({ ...ok, data: { type: MSG.battery, bytes: new ArrayBuffer(128 * 1024 + 1) } }, frame)).toBeNull();
  });

  it("send: '*' only to the app-created local frame's contentWindow, with the cart and wasm on the transfer list", () => {
    const { frame, posts } = fakeFrame();
    const cart = new ArrayBuffer(8), wasm = new ArrayBuffer(8);
    expect(postToLocalFrame(frame, { type: MSG.load, cart, wasm, battery: null }, [cart, wasm])).toBe(true);
    expect(posts).toHaveLength(1);
    expect(posts[0].target).toBe('*');
    expect(posts[0].transfer).toEqual([cart, wasm]);
  });

  it('send refuses: sandbox with allow-same-origin, no allow-scripts, another src, unmarked frame, cart not transferred', () => {
    const cart = new ArrayBuffer(8), wasm = new ArrayBuffer(8);
    const load = { type: MSG.load, cart, wasm, battery: null } as const;
    for (const f of [
      fakeFrame({ sandbox: ['allow-scripts', 'allow-same-origin'] }), fakeFrame({ sandbox: [] }),
      fakeFrame({ src: 'https://evil.example/' }), fakeFrame({ marked: false }),
    ]) {
      expect(postToLocalFrame(f.frame, load, [cart, wasm])).toBe(false);
      expect(f.posts).toEqual([]);
    }
    const g = fakeFrame();
    expect(postToLocalFrame(g.frame, load, [wasm])).toBe(false);
    expect(postToLocalFrame(g.frame, load, [])).toBe(false);
    expect(postToLocalFrame(null, load, [cart, wasm])).toBe(false);
    expect(g.posts).toEqual([]);
  });

  it('the sandbox is allow-scripts only, everywhere it is written', () => {
    expect(LOCAL_FRAME_SANDBOX).toBe('allow-scripts');
    // allow-same-origin appears in code only as the token postToLocalFrame refuses on; nothing ever sets it
    const uses = sources(SHELF_CODE_DIRS).flatMap((f) => [...code_(f).matchAll(/.*allow-same-origin.*/g)].map((m) => `${f}: ${m[0].trim()}`));
    expect(uses).toEqual([
      "lib/binjgb/messages.ts: if (!iframe.sandbox.contains('allow-scripts') || iframe.sandbox.contains('allow-same-origin')) return false;",
    ]);
    for (const f of sources(SHELF_CODE_DIRS)) expect(code_(f), f).not.toMatch(/sandbox\s*[=:]\s*[^\n]*allow-same-origin|sandbox\.add\(/);
    expect(read('components/binjgb/local-player.tsx')).toMatch(/sandbox=\{LOCAL_FRAME_SANDBOX\}/);
  });

  it("parent code never posts to window.parent / opener / top, never broadcasts, and '*' appears in one place only", () => {
    const parentCode = sources(SHELF_CODE_DIRS).filter((f) => f !== 'lib/binjgb/frameDoc.ts');
    for (const f of parentCode) {
      const src = code_(f);
      expect(src, f).not.toMatch(/window\.(parent|opener|top)\b|BroadcastChannel|\bparent\.postMessage|\btop\.postMessage|opener\.postMessage/);
    }
    const stars = parentCode.filter((f) => /postMessage\([^)]*['"]\*['"]/.test(code_(f)));
    expect(stars).toEqual(['lib/binjgb/messages.ts']);
    expect(code_('lib/binjgb/messages.ts').match(/\.postMessage\(/g)).toHaveLength(1);
    // every other parent → frame post goes through postToLocalFrame
    const player = read('components/binjgb/local-player.tsx');
    expect(player.match(/\.postMessage\(/g)).toEqual(['.postMessage(']);   // the Worker handoff only
    expect(player).toMatch(/worker\.postMessage\(\{ buf \}, \[buf\]\)/);
  });
});

describe('T-LOCAL-POSTMESSAGE-ORIGIN — inside the frame (its real program, on a fake window)', () => {
  const APP = 'https://fel.example';

  function boot() {
    const posts: { msg: { type: string }; origin: string; transfer?: Transferable[] }[] = [];
    const parent = { postMessage: (msg: { type: string }, origin: string, transfer?: Transferable[]) => { posts.push({ msg, origin, transfer }); } };
    const winListeners: Record<string, ((ev: unknown) => void)[]> = {};
    const canvasListeners: Record<string, ((ev: unknown) => void)[]> = {};
    const heap = new Uint8Array(1 << 20);
    const mod = {
      HEAPU8: heap, _malloc: () => 4096, _free: vi.fn(), _emulator_new_simple: vi.fn(() => 1), _emulator_delete: vi.fn(),
      _get_frame_buffer_ptr: () => 0, _get_frame_buffer_size: () => 160 * 144 * 4,
      _emulator_get_ticks_f64: () => 0, _emulator_run_until_f64: () => 4, _emulator_was_ext_ram_updated: () => 0,
      _set_joyp_right: vi.fn(), _set_joyp_left: vi.fn(), _set_joyp_up: vi.fn(), _set_joyp_down: vi.fn(),
      _set_joyp_A: vi.fn(), _set_joyp_B: vi.fn(), _set_joyp_select: vi.fn(), _set_joyp_start: vi.fn(),
    };
    const Binjgb = vi.fn(async () => mod);
    const canvas = {
      style: {} as Record<string, string>, focus: vi.fn(),
      addEventListener: (t: string, f: (ev: unknown) => void) => { (canvasListeners[t] ??= []).push(f); },
      getContext: () => ({ createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: vi.fn() }),
    };
    const w = {
      document: { getElementById: () => canvas, body: { style: {} } },
      parent, Binjgb, innerWidth: 390, innerHeight: 400,
      requestAnimationFrame: vi.fn(() => 1), cancelAnimationFrame: vi.fn(),
      addEventListener: (t: string, f: (ev: unknown) => void) => { (winListeners[t] ??= []).push(f); },
    };
    // eslint-disable-next-line no-new-func
    new Function(`return (${FRAME_RUNTIME})`)()(w, frameConfig(APP));
    const message = (ev: unknown) => { for (const f of winListeners.message ?? []) f(ev); };
    return { posts, message, Binjgb, mod, parent, canvasListeners, winListeners };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const load = () => ({ type: MSG.load, cart: ab(syntheticCart()), wasm: new ArrayBuffer(16), battery: null });

  it('announces itself to the parent with the exact app origin, never "*"', () => {
    const f = boot();
    expect(f.posts).toEqual([{ msg: { type: MSG.ready }, origin: APP, transfer: [] }]);
  });

  it('ignores a load from any other origin, or from a window that is not its parent', async () => {
    const f = boot();
    f.message({ origin: 'https://evil.example', source: f.parent, data: load() });
    f.message({ origin: 'null', source: f.parent, data: load() });
    f.message({ origin: APP, source: {}, data: load() });
    await flush();
    expect(f.Binjgb).not.toHaveBeenCalled();
  });

  it('accepts a load only from the app origin: wasmBinary from the message, locateFile same-origin; replies to APP_ORIGIN', async () => {
    const f = boot();
    const m = load();
    f.message({ origin: APP, source: f.parent, data: m });
    await flush();
    expect(f.Binjgb).toHaveBeenCalledTimes(1);
    const opts = (f.Binjgb.mock.calls[0] as unknown as [{ wasmBinary: ArrayBuffer; locateFile: (p: string) => string }])[0];
    expect(opts.wasmBinary).toBe(m.wasm);
    expect(opts.locateFile('binjgb.wasm')).toBe(`${APP}/vendor/binjgb/binjgb.wasm`);
    expect(f.mod._emulator_new_simple).toHaveBeenCalled();
    expect(f.posts.map((p) => p.msg.type)).toEqual([MSG.ready, MSG.started]);
    expect(f.posts.every((p) => p.origin === APP)).toBe(true);
  });

  it('pad input from the parent is accepted only from the app origin', async () => {
    const f = boot();
    f.message({ origin: APP, source: f.parent, data: load() });
    await flush();
    f.message({ origin: 'https://evil.example', source: f.parent, data: { type: MSG.input, buttons: 255 } });
    expect(f.mod._set_joyp_A).not.toHaveBeenCalledWith(1, 1);
    f.message({ origin: APP, source: f.parent, data: { type: MSG.input, buttons: 16 } });
    expect(f.mod._set_joyp_A).toHaveBeenLastCalledWith(1, 1);
  });

  it("the program's only post is window.parent.postMessage(msg, cfg.appOrigin) — never '*', never top/opener", () => {
    expect(FRAME_RUNTIME.match(/postMessage\(/g)).toHaveLength(1);
    expect(FRAME_RUNTIME).toContain('w.parent.postMessage(msg, cfg.appOrigin, transfer || [])');
    expect(FRAME_RUNTIME).not.toMatch(/['"]\*['"]|\.top\b|\.opener\b|BroadcastChannel/);
  });

  it('the frame document refuses a nonce or an origin it did not make', () => {
    expect(frameDocument('AAAAAAAAAAAAAAAAAAAAAA==', APP)).toContain(`"appOrigin":"${APP}"`);
    expect(frameDocument('"><script>', APP)).toBeNull();
    expect(frameDocument('AAAAAAAAAAAAAAAAAAAAAA==', 'null')).toBeNull();
    expect(frameDocument('AAAAAAAAAAAAAAAAAAAAAA==', 'https://fel.example/path')).toBeNull();
  });
});

describe('zero upload, no network, no persistence (T-LOCAL-NO-UPLOAD, T-LOCAL-NET, T-NO-EXTERNAL-ROM, T-LOCAL-NO-PERSIST, T-LOCAL-INMEM, T-LOCAL-ANALYTICS)', () => {
  const code = sources(SHELF_CODE_DIRS);

  it('the shelf code exists where expected', () => {
    expect(code).toEqual(expect.arrayContaining([
      'lib/binjgb/cart.ts', 'lib/binjgb/messages.ts', 'lib/binjgb/frameDoc.ts', 'components/binjgb/local-player.tsx',
      'app/play/gb-shelf/page.tsx', 'app/play/gb-shelf/local-frame/route.ts',
    ]));
  });

  it('T-LOCAL-NO-UPLOAD: no upload path anywhere in the shelf — no form data, XHR, beacon, socket, multipart or signed URL', () => {
    for (const f of code) {
      expect(read(f), f).not.toMatch(/FormData|XMLHttpRequest|sendBeacon|WebSocket|EventSource|multipart|signedUrl|presign|method:\s*['"](POST|PUT|PATCH)['"]/i);
    }
  });

  it('T-LOCAL-NET / T-NO-EXTERNAL-ROM: the one fetch is the pinned same-origin wasm; no absolute URL to any host', () => {
    const fetches = code.flatMap((f) => [...read(f).matchAll(/\bfetch\(([^,)]*)/g)].map((m) => `${f}: ${m[1].trim()}`));
    expect(fetches).toEqual(['components/binjgb/local-player.tsx: BINJGB_WASM_PATH']);
    for (const f of code) expect(read(f), f).not.toMatch(/https?:\/\//);
    expect(FRAME_RUNTIME).not.toMatch(/\bfetch\(|XMLHttpRequest|import\(/);
  });

  it('T-LOCAL-ANALYTICS: the only event local play sends is { source: "local" } — no name, hash or bytes', () => {
    const calls = code.flatMap((f) => [...read(f).matchAll(/\btrack\(([^)]*)\)/g)].map((m) => `${f}: ${m[1]}`));
    expect(calls).toEqual(["components/binjgb/local-player.tsx: 'homebrew_local_play', { source: 'local' }"]);
  });

  it('T-LOCAL-NO-PERSIST / T-LOCAL-INMEM: no localStorage, sessionStorage, Cache Storage or cookies; the name is never stored', () => {
    for (const f of code) expect(read(f), f).not.toMatch(/localStorage|sessionStorage|caches\.|document\.cookie|showSaveFilePicker|navigator\.storage/);
    expect(FRAME_RUNTIME).not.toMatch(/localStorage|sessionStorage|indexedDB|caches\.|cookie/);
    const player = read('components/binjgb/local-player.tsx');
    // the picked name lives in component state only, cut to 40 chars; it is passed to no store and no message
    expect(player).toMatch(/setPicked\(file\.name\.slice\(0, PICKED_NAME_MAX\)\)/);
    expect(player.match(/file\.name/g)).toHaveLength(1);
    expect(player).toMatch(/ev\.target\.value = ''/);
    // the only IndexedDB writes are battery saves keyed by the local hash
    expect(player).toMatch(/writeBattery\(gameKey\.current, m\.bytes\)/);
    expect(player).not.toMatch(/writeBattery\([^)]*(cart|file|name)/);
  });

  it('the IndexedDB module stores only battery saves and save states, in fel_binjgb', () => {
    const db = read('lib/binjgb/savesDb.ts');
    expect(db).toMatch(/export const SAVES_DB_NAME = 'fel_binjgb';/);
    expect(db.match(/createObjectStore\(/g)).toHaveLength(2);
    expect(db).not.toMatch(/fel_assets'|fel-studio'|fel-athlete-poster'/);
  });
});
