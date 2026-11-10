// BINJGB-SHELF-1 G1(a) (Cyber A1–A7, 2026-11-09). The G1 v2 real-build run showed Firebase Hosting's static layer serving
// public/vendor/binjgb/* with the flag OFF: ɵcodegenPublicDirectory copies public/ whole, and Hosting answers a static
// file before the function (so before middleware and the flag) is asked. The player left public/; a route handler serves
// it from a server-only module. NEW tests only — the four existing-test path edits are in their own diff.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import * as routeModule from '@/app/vendor/binjgb/[file]/route';
import { DELETE, GET, OPTIONS, PATCH, POST, PUT } from '@/app/vendor/binjgb/[file]/route';
import { binjgbVendorBytes } from '@/lib/binjgb/vendor-bytes.server';
import { BINJGB_VENDOR_TYPES, binjgbVendorFile } from '@/lib/binjgb/vendorHttp';
import { BINJGB_JS_SHA256, BINJGB_WASM_SHA256 } from '@/lib/binjgb/vendor';
import { CREDITS } from '@/lib/credits/credits';
import { middleware } from '../../middleware';
import { read, ROOT } from './helpers';

const JS_PIN = 'a68e5854b5d68339a34c0aa0b6dbeacd615ed316657ee17b63dafa5e00561b09';
const WASM_PIN = '52c165069441a09180b4bd63464318aa7b861b1d36e0d05e8047b48619fd2f0b';
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const THIRD = join(ROOT, 'third_party/binjgb');
const ROUTE = 'app/vendor/binjgb/[file]/route.ts';

const get = (file: string) => GET(new Request(`http://fel.test/vendor/binjgb/${encodeURIComponent(file)}`), { params: { file } });
const headerList = (r: Response) => [...r.headers.entries()].sort();
const UNLISTED = [
  'BINJGB.JS', 'Binjgb.wasm', 'binjgb.JS', 'binjgb.WASM', 'LICENSE', 'VENDOR.md', 'binjgb.js ', ' binjgb.js', 'binjgb.js.map',
  'binjgb.wasm.map', 'binjgb', 'x.js', '', '.', '..', '../binjgb.js', 'binjgb.js/..', 'a/binjgb.js', 'binjgb.js/',
  'a\\binjgb.js', '\\binjgb.js', '%62injgb.js', 'binjgb%2Ejs', 'binjgb.js%00', 'binjgb.js\u0000', 'binjgb..js',
];

afterEach(() => { delete process.env.BINJGB_SHELF_ENABLED; });

describe('A4: the bundled bytes are the pinned ones', () => {
  it('binjgb.js: 13,640 bytes, sha256 a68e5854…', () => {
    const b = binjgbVendorBytes('binjgb.js');
    expect(b.length).toBe(13_640);
    expect(sha(b)).toBe(JS_PIN);
    expect(BINJGB_JS_SHA256).toBe(JS_PIN);
  });
  it('binjgb.wasm: 88,269 bytes, sha256 52c16506…', () => {
    const b = binjgbVendorBytes('binjgb.wasm');
    expect(b.length).toBe(88_269);
    expect(sha(b)).toBe(WASM_PIN);
    expect(BINJGB_WASM_SHA256).toBe(WASM_PIN);
  });
  it('the module is generated from the third_party source copies, byte for byte', () => {
    expect(Buffer.compare(Buffer.from(binjgbVendorBytes('binjgb.js')), readFileSync(join(THIRD, 'binjgb.js')))).toBe(0);
    expect(Buffer.compare(Buffer.from(binjgbVendorBytes('binjgb.wasm')), readFileSync(join(THIRD, 'binjgb.wasm')))).toBe(0);
  });
  it('callers get a copy: mutating one response body cannot change the next', () => {
    const a = binjgbVendorBytes('binjgb.wasm');
    a[0] ^= 0xff;
    expect(sha(binjgbVendorBytes('binjgb.wasm'))).toBe(WASM_PIN);
  });
  it('the bytes module is server-only and imported by the route alone', () => {
    const src = read('lib/binjgb/vendor-bytes.server.ts');
    expect(src).toMatch(/^import 'server-only';$/m);
    expect(src).toMatch(/typeof window !== 'undefined'/);
    const importers: string[] = [];
    const walk = (rel: string) => {
      for (const e of readdirSync(join(ROOT, rel))) {
        if (e === 'node_modules' || e.startsWith('.')) continue;
        const r = rel ? `${rel}/${e}` : e;
        const st = lstatSync(join(ROOT, r));
        if (st.isDirectory()) walk(r);
        else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(e) && !/\.test\.tsx?$/.test(e) && /vendor-bytes\.server/.test(readFileSync(join(ROOT, r), 'utf8'))) importers.push(r);
      }
    };
    for (const d of ['app', 'components', 'lib', 'middleware.ts']) {
      if (d.endsWith('.ts')) { if (/vendor-bytes\.server/.test(read(d))) importers.push(d); } else walk(d);
    }
    expect(importers.filter((f) => f !== 'lib/binjgb/vendor-bytes.server.ts')).toEqual([ROUTE]);
  });
});

describe('A1: nothing binjgb is left in public/', () => {
  it('public/vendor/binjgb does not exist', () => {
    expect(existsSync(join(ROOT, 'public/vendor/binjgb'))).toBe(false);
  });
  it('no file or folder anywhere under public/ matches /binjgb/i, and none has a pinned sha256', () => {
    const named: string[] = [];
    const pinned: string[] = [];
    const walk = (abs: string) => {
      for (const e of readdirSync(abs)) {
        const p = join(abs, e);
        if (/binjgb/i.test(e)) named.push(relative(ROOT, p));
        const st = lstatSync(p);
        if (st.isDirectory()) walk(p);
        else if (st.isFile() && (st.size === 13_640 || st.size === 88_269)) {
          const s = sha(readFileSync(p));
          if (s === JS_PIN || s === WASM_PIN) pinned.push(relative(ROOT, p));
        }
      }
    };
    walk(join(ROOT, 'public'));
    expect(named).toEqual([]);
    expect(pinned).toEqual([]);
  });
  it('the build-check script exists, is executable, parses, and fails on a planted copy (A1)', () => {
    const script = join(ROOT, 'scripts/binjgb-static-scan.sh');
    expect(lstatSync(script).mode & 0o777).toBe(0o755);
    expect(spawnSync('bash', ['-n', script]).status).toBe(0);
    const s = read('scripts/binjgb-static-scan.sh');
    expect(s).toContain(JS_PIN);
    expect(s).toContain(WASM_PIN);
    const t = mkdtempSync(join(tmpdir(), 'bjb-scan-'));
    try {
      mkdirSync(join(t, 'hosting/vendor/x'), { recursive: true });
      mkdirSync(join(t, 'static/chunks'), { recursive: true });
      writeFileSync(join(t, 'hosting/index.html'), '<!doctype html>');
      writeFileSync(join(t, 'static/chunks/a.js'), 'console.log(1)');
      const clean = spawnSync('bash', [script, join(t, 'hosting'), join(t, 'static')], { encoding: 'utf8' });
      expect(clean.status, clean.stdout + clean.stderr).toBe(0);
      expect(clean.stdout).toContain('RESULT PASS');
      // a renamed copy of the wasm in Hosting's static layer
      writeFileSync(join(t, 'hosting/vendor/x/renamed.bin'), binjgbVendorBytes('binjgb.wasm'));
      // the server module's base64 leaking into a client chunk
      writeFileSync(join(t, 'static/chunks/b.js'), read('lib/binjgb/vendor-bytes.server.ts'));
      const dirty = spawnSync('bash', [script, join(t, 'hosting'), join(t, 'static')], { encoding: 'utf8' });
      expect(dirty.status).toBe(1);
      expect(dirty.stdout).toMatch(/FAIL .*renamed\.bin has the sha256/);
      expect(dirty.stdout).toMatch(/FAIL .*b\.js embeds the base64/);
      // F4 (Cyber review 467aa397): the same bytes embedded at a 1- and a 2-byte offset inside a bigger base64 blob
      rmSync(join(t, 'hosting/vendor/x/renamed.bin'));
      rmSync(join(t, 'static/chunks/b.js'));
      for (const [k, name] of [[1, 'binjgb.wasm'], [2, 'binjgb.js']] as const) {
        const blob = Buffer.concat([Buffer.alloc(k, 0x41), Buffer.from(binjgbVendorBytes(name)), Buffer.from('tail')]);
        writeFileSync(join(t, `static/chunks/shift${k}.js`), `const x="${blob.toString('base64')}";`);
      }
      const shifted = spawnSync('bash', [script, join(t, 'hosting'), join(t, 'static')], { encoding: 'utf8' });
      expect(shifted.status, shifted.stdout).toBe(1);
      expect(shifted.stdout).toMatch(/FAIL .*shift1\.js embeds the base64/);
      expect(shifted.stdout).toMatch(/FAIL .*shift2\.js embeds the base64/);
      // a wrong (missing or empty) path can never pass
      mkdirSync(join(t, 'empty'));
      expect(spawnSync('bash', [script, join(t, 'empty'), join(t, 'nope')], { encoding: 'utf8' }).status).toBe(1);
    } finally {
      rmSync(t, { recursive: true, force: true });
    }
  });
});

describe('A2: the route handler', () => {
  it('runtime nodejs, force-dynamic, no generateStaticParams / revalidate (never prerendered, never in Hosting)', () => {
    const m = routeModule as Record<string, unknown>;
    expect(m.runtime).toBe('nodejs');
    expect(m.dynamic).toBe('force-dynamic');
    expect(m.generateStaticParams).toBeUndefined();
    expect(m.revalidate).toBeUndefined();
    expect(m.dynamicParams).toBeUndefined();
    // I-2 (Cyber review 467aa397): OPTIONS and the 405 methods are explicit so they carry no-store; no HEAD export (Next
    // derives HEAD from GET), and still nothing that could prerender.
    expect(Object.keys(m).sort()).toEqual(['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST', 'PUT', 'dynamic', 'runtime']);
    const code = read(ROUTE).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/generateStaticParams|revalidate|force-static/);
  });
  it('the allow-list is exact and case-sensitive; %, /, \\ and .. are refused first', () => {
    expect(Object.keys(BINJGB_VENDOR_TYPES).sort()).toEqual(['binjgb.js', 'binjgb.wasm']);
    expect(binjgbVendorFile('binjgb.js')).toBe('binjgb.js');
    expect(binjgbVendorFile('binjgb.wasm')).toBe('binjgb.wasm');
    for (const n of UNLISTED) expect(binjgbVendorFile(n), JSON.stringify(n)).toBeNull();
    for (const n of [undefined, null, 1, ['binjgb.js'], { toString: () => 'binjgb.js' }]) expect(binjgbVendorFile(n)).toBeNull();
    expect(binjgbVendorFile('constructor')).toBeNull();
    expect(binjgbVendorFile('__proto__')).toBeNull();
  });
  it('flag off: every request, listed or not, gets the one identical 404 (empty, nosniff, no-store)', async () => {
    delete process.env.BINJGB_SHELF_ENABLED;
    const ref = await get('binjgb.js');
    const refHeaders = headerList(ref);
    expect(ref.status).toBe(404);
    expect(await ref.text()).toBe('');
    for (const n of ['binjgb.wasm', ...UNLISTED]) {
      const r = await get(n);
      expect(r.status, n).toBe(404);
      expect(await r.text(), n).toBe('');
      expect(headerList(r), n).toEqual(refHeaders);
    }
    process.env.BINJGB_SHELF_ENABLED = '0';
    expect((await get('binjgb.wasm')).status).toBe(404);
  });
  it('flag on: binjgb.js and binjgb.wasm are 200 with the pinned bytes; the flag is read per request', async () => {
    process.env.BINJGB_SHELF_ENABLED = '1';
    const js = await get('binjgb.js');
    expect(js.status).toBe(200);
    expect(sha(new Uint8Array(await js.arrayBuffer()))).toBe(JS_PIN);
    const wasm = await get('binjgb.wasm');
    expect(wasm.status).toBe(200);
    expect(sha(new Uint8Array(await wasm.arrayBuffer()))).toBe(WASM_PIN);
    delete process.env.BINJGB_SHELF_ENABLED;
    expect((await get('binjgb.js')).status).toBe(404);
  });
  it('flag on: a name not on the list is the same 404 as flag off', async () => {
    const off = headerList(await get('binjgb.js'));
    process.env.BINJGB_SHELF_ENABLED = '1';
    for (const n of UNLISTED) {
      const r = await get(n);
      expect(r.status, n).toBe(404);
      expect(await r.text(), n).toBe('');
      expect(headerList(r), n).toEqual(off);
    }
  });
});

describe('A3: exact response headers', () => {
  it('200: exactly content-type, nosniff and no-store', async () => {
    process.env.BINJGB_SHELF_ENABLED = '1';
    expect(headerList(await get('binjgb.js'))).toEqual([
      ['cache-control', 'no-store'], ['content-type', 'application/javascript; charset=utf-8'], ['x-content-type-options', 'nosniff'],
    ]);
    expect(headerList(await get('binjgb.wasm'))).toEqual([
      ['cache-control', 'no-store'], ['content-type', 'application/wasm'], ['x-content-type-options', 'nosniff'],
    ]);
  });
  it('404: exactly nosniff and no-store, no type, no body', async () => {
    expect(headerList(await get('binjgb.js'))).toEqual([['cache-control', 'no-store'], ['x-content-type-options', 'nosniff']]);
  });
  it('middleware (the second layer) sends the same 404 headers, flag off and for refused spellings', async () => {
    delete process.env.BINJGB_SHELF_ENABLED;
    for (const p of ['/vendor/binjgb/binjgb.js', '/vendor/binjgb/binjgb.wasm', '/vendor/binjgb/LICENSE', '/gb-shelf/x/y.bin']) {
      const r = middleware(new NextRequest(`http://fel.test${p}`));
      expect(r.status, p).toBe(404);
      expect(r.headers.get('x-content-type-options'), p).toBe('nosniff');
      expect(r.headers.get('cache-control'), p).toBe('no-store');
      expect(await r.text(), p).toBe('');
    }
    process.env.BINJGB_SHELF_ENABLED = '1';
    for (const p of ['/vendor%2Fbinjgb/binjgb.wasm', '/vendor/binjgb%2fbinjgb.js', '/vendor/binjgb/%252E%252E/binjgb.js', '/vendor/binjgb/%5Cbinjgb.js']) {
      const r = middleware(new NextRequest(`http://fel.test${p}`));
      expect(r.status, p).toBe(404);
      expect(r.headers.get('x-content-type-options'), p).toBe('nosniff');
      expect(r.headers.get('cache-control'), p).toBe('no-store');
    }
  });
});

describe('A5: the flag-on encoded-slash pass-through is gone', () => {
  it('with the flag ON every %2F spelling of the vendored folder is a 404 in middleware', () => {
    process.env.BINJGB_SHELF_ENABLED = '1';
    for (const p of ['/vendor%2Fbinjgb/binjgb.wasm', '/vendor%2fbinjgb/binjgb.js', '/vendor/binjgb%2Fbinjgb.js', '/vendor/binjgb%2fbinjgb.wasm']) {
      expect(middleware(new NextRequest(`http://fel.test${p}`)).status, p).toBe(404);
    }
    expect(middleware(new NextRequest('http://fel.test/vendor/binjgb/binjgb.js')).headers.get('x-middleware-next')).toBe('1');
    expect(read('middleware.ts')).not.toMatch(/rejected === 'encoded-slash'/);
  });
});

describe('A6: the licence and the record live outside public/, and /credits shows the licence verbatim', () => {
  const c = CREDITS.find((x) => x.id === 'binjgb')!;
  it('third_party/binjgb holds exactly the source copies and the records', () => {
    expect(readdirSync(THIRD).sort()).toEqual(['LICENSE', 'VENDOR.md', 'binjgb.js', 'binjgb.wasm']);
    expect(sha(readFileSync(join(THIRD, 'LICENSE')))).toBe('5a7b61a51a5efb789721b3480b502f324094911aeca46937956c561b52638009');
  });
  it('the credit\'s notice IS the LICENSE file, byte for byte (bundled, not retyped), copyright line intact', () => {
    const licence = readFileSync(join(THIRD, 'LICENSE'), 'utf8');
    expect(c.notice).toBe(licence);
    expect(c.notice!.split('\n')[0]).toBe('Copyright (c) 2016 Ben Smith');
    expect(read('lib/credits/credits.ts')).toMatch(/^import BINJGB_LICENSE_TEXT from '\.\.\/\.\.\/third_party\/binjgb\/LICENSE\?raw';$/m);
    expect(read('lib/credits/credits.ts')).not.toContain('Permission is hereby granted');
  });
  it('the credit records the third_party paths, never public/', () => {
    expect(c.recordedIn).toEqual(['third_party/binjgb/LICENSE', 'third_party/binjgb/VENDOR.md']);
    for (const r of c.recordedIn) expect(existsSync(join(ROOT, r)), r).toBe(true);
  });
  it('next.config bundles only that LICENSE as a string (webpack 5 asset/source, no loader dep)', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nextConfig = require('../../next.config.js');
    for (const isServer of [true, false]) {
      const cfg = nextConfig.webpack({ output: {}, module: { rules: [] } }, { isServer });
      const raw = cfg.module.rules.filter((r: { type?: string }) => r.type === 'asset/source');
      expect(raw).toHaveLength(1);
      expect(raw[0].test.test('/x/FEL-full-app/third_party/binjgb/LICENSE')).toBe(true);
      expect(raw[0].test.test('/x/FEL-full-app/public/LICENSE')).toBe(false);
      expect(raw[0].test.test('/x/FEL-full-app/third_party/binjgb/binjgb.wasm')).toBe(false);
      expect(raw[0].resourceQuery.test('?raw')).toBe(true);
      expect(raw[0].resourceQuery.test('?raw&x')).toBe(false);
    }
  });
  it('the credits page renders the licence text', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { CreditsList } = await import('@/components/credits/credits-list');
    const html = renderToStaticMarkup(createElement(CreditsList));
    expect(html).toContain('Copyright (c) 2016 Ben Smith');
    expect(html).toContain('THE SOFTWARE IS PROVIDED &quot;AS IS&quot;');
  });
});

describe('I-2: OPTIONS and 405 carry no-store too (Cyber review 467aa397)', () => {
  it('flag on: OPTIONS is 204, no body, Allow GET, HEAD, OPTIONS, no-store, nosniff', async () => {
    process.env.BINJGB_SHELF_ENABLED = '1';
    const r = await OPTIONS();
    expect(r.status).toBe(204);
    expect(await r.text()).toBe('');
    expect(headerList(r)).toEqual([['allow', 'GET, HEAD, OPTIONS'], ['cache-control', 'no-store'], ['x-content-type-options', 'nosniff']]);
  });
  it('flag on: POST / PUT / PATCH / DELETE are 405, no body, Allow, no-store, nosniff', async () => {
    process.env.BINJGB_SHELF_ENABLED = '1';
    for (const h of [POST, PUT, PATCH, DELETE]) {
      const r = await h();
      expect(r.status).toBe(405);
      expect(await r.text()).toBe('');
      expect(headerList(r)).toEqual([['allow', 'GET, HEAD, OPTIONS'], ['cache-control', 'no-store'], ['x-content-type-options', 'nosniff']]);
    }
  });
  it('flag off: OPTIONS and every 405 method are the same one 404 as GET', async () => {
    delete process.env.BINJGB_SHELF_ENABLED;
    const ref = headerList(await get('binjgb.js'));
    for (const h of [OPTIONS, POST, PUT, PATCH, DELETE]) {
      const r = await h();
      expect(r.status).toBe(404);
      expect(await r.text()).toBe('');
      expect(headerList(r)).toEqual(ref);
    }
  });
});

describe('F3: the curl gate compares the case variants off vs on, and checks HEAD / OPTIONS (Cyber review 467aa397)', () => {
  const s = read('scripts/binjgb-curl-gate.sh');
  it('MODE=off records the three case variants to FEL_GATE_CASE_FILE; MODE=on requires and compares them', () => {
    expect(s).toContain("CASE_ROWS='/Vendor/binjgb/binjgb.wasm /VENDOR/BINJGB/BINJGB.JS /vendor/Binjgb/binjgb.wasm'");
    expect(s).toContain(`printf '%s %s %s\\n' "$p" "$R_STATUS" "$R_SHA" >> "$CASE_FILE"`);
    expect(s).toMatch(/no flag-off record \(set FEL_GATE_CASE_FILE/);
    expect(s).toContain('same status and sha256 as flag off');
  });
  it('HEAD must be 200 with 0 body bytes and OPTIONS 0 body bytes with no-store, over a raw socket', () => {
    expect(s).toContain('raw_request HEAD /vendor/binjgb/binjgb.js');
    expect(s).toContain('raw_request OPTIONS /vendor/binjgb/binjgb.js');
    expect(s).toContain('if [ "$RAW_STATUS" = "200" ] && [ "$RAW_BODY" = "0" ]');
    expect(s).toContain('OPTIONS Cache-Control has no-store');
  });
});

describe('A4/A7: the Firebase static layer (gate-script row, not a test-time superstatic run)', () => {
  // superstatic ships inside firebase-tools, which is not a dependency of this app; adding it would be a new dep. So this
  // test asserts the input to ɵcodegenPublicDirectory (public/, copied whole) holds no vendor/binjgb tree, and the gate
  // script carries the MODE=static row set that the Mini rerun drives through a superstatic stand-in.
  it('public/ (what the codegen copies whole) has no vendor/binjgb tree under any spelling', () => {
    const vendor = join(ROOT, 'public/vendor');
    const entries = existsSync(vendor) ? readdirSync(vendor) : [];
    expect(entries.filter((e) => e.toLowerCase() === 'binjgb')).toEqual([]);
    expect(existsSync(join(ROOT, 'public/gb-shelf'))).toBe(false);
  });
  it('the curl gate has MODE=static, running every flag-off vendor row against the static layer', () => {
    const s = read('scripts/binjgb-curl-gate.sh');
    expect(lstatSync(join(ROOT, 'scripts/binjgb-curl-gate.sh')).mode & 0o777).toBe(0o755);
    expect(s).toContain('if [ "$MODE" = "off" ] || [ "$MODE" = "static" ]; then');
    expect(s).toContain('[ "$MODE" != "static" ]');
    expect(s).toContain('case "$p" in /play/*) expect_404 "$p" ;; *) vendor_row "$p" 404 ;; esac');
  });
  it('the curl gate checks the route\'s exact headers and its 404s, flag on and off', () => {
    const s = read('scripts/binjgb-curl-gate.sh');
    expect(s).toContain('route_headers "route /vendor/binjgb/binjgb.js" "application/javascript; charset=utf-8"');
    expect(s).toContain('route_headers "route /vendor/binjgb/binjgb.wasm" "application/wasm"');
    for (const p of ['/vendor/binjgb/LICENSE', '/vendor/binjgb/VENDOR.md', '/vendor/binjgb/BINJGB.JS', '/vendor/binjgb/x.js']) expect(s, p).toContain(p);
    expect(s).toContain('nosniff=${R_NOSNIFF:--} cache=${R_CACHE:--}');
    expect(s).toMatch(/want 404 with an empty body/);
  });
  it('MODE=static is accepted and anything else still exits 2', () => {
    const script = join(ROOT, 'scripts/binjgb-curl-gate.sh');
    const env = { PATH: process.env.PATH ?? '', HOME: tmpdir() };
    expect(spawnSync('bash', [script], { env: { ...env, MODE: 'sideways', BASE_URL: 'http://127.0.0.1:9' } }).status).toBe(2);
    expect(spawnSync('bash', [script], { env: { ...env, MODE: 'static', BASE_URL: 'https://example.invalid' } }).status).toBe(2);
  });
});
