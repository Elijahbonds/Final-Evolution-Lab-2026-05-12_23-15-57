// BINJGB-SHELF-1 F6 (Cyber build review dcbbec16): the PR-time / deploy curl gate script, and the middleware half of the
// flag-off static 404 for percent-encoded spellings. The script itself runs only against a local `next start` (or a
// preview deploy) — never live; this test never makes a network request.
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isShelfStaticPath, middleware } from '../../middleware';
import { read, ROOT } from './helpers';

const SCRIPT = 'scripts/binjgb-curl-gate.sh';
const ENCODED = ['/vendor%2Fbinjgb/binjgb.wasm', '/vendor%2fbinjgb/binjgb.js', '/vendor/binjgb%2Fbinjgb.js', '/%76endor/binjgb/binjgb.js', '/vendor/%62injgb/binjgb.wasm', '/vendor/binjgb/binjgb%2Ewasm'];

afterEach(() => { delete process.env.BINJGB_SHELF_ENABLED; });

describe('middleware: percent-encoded spellings of the static paths count too', () => {
  it('isShelfStaticPath sees the decoded path; a malformed escape is not a crash', () => {
    for (const p of ENCODED) expect(isShelfStaticPath(p), p).toBe(true);
    expect(isShelfStaticPath('/vendor/%E0%A4%A')).toBe(false);
    expect(isShelfStaticPath('/vendor/havok/x.wasm')).toBe(false);
    expect(isShelfStaticPath('/vendor%2Fhavok/x.wasm')).toBe(false);
  });

  it('flag off → 404 for each when middleware sees it; flag read per request (no restart)', () => {
    for (const p of ENCODED) expect(middleware(new NextRequest(`http://fel.test${p}`)).status, p).toBe(404);
    process.env.BINJGB_SHELF_ENABLED = '1';
    for (const p of ENCODED) expect(middleware(new NextRequest(`http://fel.test${p}`)).headers.get('x-middleware-next'), p).toBe('1');
  });
});

describe('scripts/binjgb-curl-gate.sh', () => {
  const s = read(SCRIPT);

  it('exists, is executable and parses', () => {
    expect(statSync(join(ROOT, SCRIPT)).mode & 0o111).not.toBe(0);
    expect(spawnSync('bash', ['-n', join(ROOT, SCRIPT)]).status).toBe(0);
  });

  it('refuses any non-localhost BASE_URL unless explicitly told it is a preview (never live), before any request', () => {
    const r = spawnSync('bash', [join(ROOT, SCRIPT)], { env: { PATH: process.env.PATH ?? '', BASE_URL: 'https://finalevolutionlab.example', MODE: 'on' }, encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/refusing/);
    expect(spawnSync('bash', [join(ROOT, SCRIPT)], { env: { PATH: process.env.PATH ?? '', BASE_URL: 'http://localhost:1', MODE: 'sideways' } }).status).toBe(2);
  });

  it('on: exactly one Permissions-Policy (camera=(), gamepad=(self), never a folded camera=(self)), one Referrer-Policy no-referrer', () => {
    expect(s).toMatch(/exactly one Permissions-Policy/);
    expect(s).toMatch(/camera=\(\)/);
    expect(s).toMatch(/gamepad=\(self\)/);
    expect(s).toMatch(/camera=\(self\)/);
    expect(s).toMatch(/exactly one Referrer-Policy: no-referrer/);
  });

  it("on: the middleware's enforced CSP is actually sent ('nonce- + 'wasm-unsafe-eval'), F1 and F3 directives, no unsafe-eval", () => {
    expect(s).toMatch(/grep "'nonce-" \| grep "'wasm-unsafe-eval'"/);
    expect(s).toMatch(/enforced CSP MISSING or replaced/);
    expect(s).toMatch(/sandbox allow-scripts/);
    expect(s).toMatch(/'unsafe-eval'/);
    for (const p of ['check_page /play/gb-shelf shelf', 'check_page /play/gb-shelf/local-frame frame']) expect(s).toContain(p);
  });

  it('off: the vendored files and their percent-encoded / double-encoded / dot-segment spellings must 404', () => {
    for (const p of ['/vendor/binjgb/binjgb.wasm', '/vendor/binjgb/binjgb.js', ...ENCODED, '/vendor%252Fbinjgb/binjgb.js', '/vendor/binjgb/./binjgb.js']) expect(s, p).toContain(p);
    expect(s).toMatch(/--path-as-is/);
  });

  it('runtime flag read: same build, flag off then on; prints BUILD_ID; PASS / FAIL lines and a non-zero exit on FAIL', () => {
    expect(s).toMatch(/\.next\/BUILD_ID/);
    expect(s).toMatch(/flag read at runtime/);
    expect(s).toMatch(/flips need a redeploy/);
    expect(s).toMatch(/printf 'PASS  %s\\n'/);
    expect(s).toMatch(/printf 'FAIL  %s\\n'/);
    expect(s).toMatch(/exit 1\s*$/);
  });
});
