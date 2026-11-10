// BINJGB-SHELF-1 G1(b)/(c) (Cyber gate ruling on the 2026-11-09 real-build run of 9145070e): with BINJGB_SHELF_ENABLED off,
// `next start` served these six spellings with 200, because next-server matches middleware against the RAW pathname while
// its public-file lookup decodes it. One row per failing spelling, plus %2E%2E traversal. NEW tests only; nothing existing
// is edited. The real-build proof is still the curl gate (scripts/binjgb-curl-gate.sh) on `next start`, never live.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
// next's own matcher compiler and runtime matcher: the same code `next build` / `next start` use for config.matcher.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getMiddlewareMatchers } = require('next/dist/build/analysis/get-page-static-info');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getMiddlewareRouteMatcher } = require('next/dist/shared/lib/router/utils/middleware-route-matcher');
import { config, isShelfStaticPath, middleware, rejectedSpelling } from '../../middleware';
import { read, ROOT } from './helpers';

const FAILED_ON_REAL_BUILD = [
  '/vendor%2Fbinjgb/binjgb.wasm',
  '/vendor%2fbinjgb/binjgb.js',
  '/vendor/binjgb%2Fbinjgb.js',
  '/vendor/binjgb%2fbinjgb.wasm',
  '/%76endor/binjgb/binjgb.js',
  '/vendor/%62injgb/binjgb.wasm',
];
const TRAVERSAL = [
  '/vendor/binjgb/%2E%2E/binjgb/binjgb.js',
  '/vendor/%2e%2e/vendor/binjgb/binjgb.wasm',
  '/play/gb-shelf/%2E%2E/%2E%2E/vendor/binjgb/binjgb.js',
  '/vendor/binjgb/%252E%252E/binjgb.js',
];

const nextMatch = getMiddlewareRouteMatcher(getMiddlewareMatchers(config.matcher, {}));
/** What next-server does: match the raw pathname against the compiled matchers. */
const matcherSeesRaw = (raw: string) => !!nextMatch(raw, {} as never, {});
const call = (raw: string) => middleware(new NextRequest(`http://fel.test${raw}`));

afterEach(() => { delete process.env.BINJGB_SHELF_ENABLED; });

describe('G1(b): the real matcher now reaches middleware for every spelling that leaked', () => {
  for (const p of FAILED_ON_REAL_BUILD) {
    it(`matcher hits ${p} (raw, as next-server matches it)`, () => expect(matcherSeesRaw(p)).toBe(true));
  }
  it('the %2E%2E traversal spellings reach middleware too', () => {
    for (const p of TRAVERSAL) expect(matcherSeesRaw(p), p).toBe(true);
  });
  it('ordinary paths are still not matched (no new middleware on the rest of the app)', () => {
    for (const p of ['/', '/try', '/play', '/play/dunk', '/play/mirror', '/api/guest', '/vendor/havok/HavokPhysics.wasm', '/pose/models/x.task']) {
      expect(matcherSeesRaw(p), p).toBe(false);
    }
  });
});

describe('G1(b)/(c): flag OFF → 404 for each spelling that leaked on the real build', () => {
  for (const p of FAILED_ON_REAL_BUILD) {
    it(`off: ${p} -> 404`, () => {
      delete process.env.BINJGB_SHELF_ENABLED;
      expect(isShelfStaticPath(p)).toBe(true);
      const res = call(p);
      expect(res.status).toBe(404);
      expect(res.headers.get('x-middleware-next')).toBeNull();
    });
  }
});

describe('G1(b): the spelling rules (decode once, then refuse)', () => {
  it('encoded slash, any case, under /vendor or /play → encoded-slash', () => {
    for (const p of ['/vendor%2Fbinjgb/binjgb.wasm', '/vendor%2fbinjgb/binjgb.js', '/vendor/binjgb%2Fbinjgb.js', '/vendor/binjgb%2fbinjgb.wasm',
      '/play/gb-shelf%2Fsome-slug', '/play%2Fgb-shelf', '/vendor%2Fhavok/x.wasm']) {
      expect(rejectedSpelling(p), p).toBe('encoded-slash');
    }
  });
  it('encoded backslash, any case → encoded-backslash', () => {
    for (const p of ['/vendor/binjgb/%5Cbinjgb.js', '/vendor/binjgb/%5cbinjgb.js', '/play/gb-shelf%5Clocal-frame']) expect(rejectedSpelling(p), p).toBe('encoded-backslash');
  });
  it("a '%' left after one decode → double-encoded", () => {
    for (const p of ['/vendor%252Fbinjgb/binjgb.js', '/vendor/binjgb/%252E%252E/binjgb.js', '/play/%2567b-shelf']) expect(rejectedSpelling(p), p).toBe('double-encoded');
  });
  it('%2E%2E / %2E segments after decoding → dot-segment', () => {
    for (const p of ['/vendor/binjgb/%2E%2E/binjgb/binjgb.js', '/vendor/%2e%2e/vendor/binjgb/binjgb.wasm', '/play/gb-shelf/%2E%2E/%2E%2E/vendor/binjgb/binjgb.js', '/vendor/binjgb/%2E/binjgb.js']) {
      expect(rejectedSpelling(p), p).toBe('dot-segment');
    }
  });
  it('a malformed escape under /vendor is refused, not a crash', () => {
    expect(rejectedSpelling('/vendor/%E0%A4%A')).toBe('malformed');
  });
  it('plain decodable spellings are left to the flag (%76, %62, %2E inside a name, %2D)', () => {
    for (const p of ['/%76endor/binjgb/binjgb.js', '/vendor/%62injgb/binjgb.wasm', '/vendor/binjgb/binjgb%2Ewasm', '/play/gb-shelf/local%2Dframe', '/play/%67b-shelf']) {
      expect(rejectedSpelling(p), p).toBeNull();
    }
  });
  it('out of scope paths are never refused by it', () => {
    for (const p of ['/', '/u/some%20name', '/api/x%2Fy', '/screen', '/playground%2Fx', '/vendorx%2Fy']) expect(rejectedSpelling(p), p).toBeNull();
  });
  it('repeated slashes are collapsed before the prefix checks', () => {
    for (const p of ['//vendor/binjgb/binjgb.js', '/vendor//binjgb/binjgb.wasm', '//vendor//binjgb//LICENSE', '//gb-shelf//x.bin']) expect(isShelfStaticPath(p), p).toBe(true);
    expect(isShelfStaticPath('//vendor//havok/x.wasm')).toBe(false);
  });
});

describe('G1(b): refused spellings are 404 whatever the flag says', () => {
  it('flag ON: double-encoded, backslash and traversal spellings still 404 (raw rule, as middleware sees them)', () => {
    process.env.BINJGB_SHELF_ENABLED = '1';
    for (const p of ['/vendor%252Fbinjgb/binjgb.js', '/vendor/binjgb/%252E%252E/binjgb.js', '/vendor/binjgb/%5Cbinjgb.js', '/play/gb-shelf%2Fsome-slug', '/vendor%2Fhavok/x.wasm']) {
      expect(call(p).status, p).toBe(404);
    }
  });
  it('flag OFF: the same, plus every traversal spelling that survives URL parsing', () => {
    delete process.env.BINJGB_SHELF_ENABLED;
    for (const p of [...TRAVERSAL, '/vendor%252Fbinjgb/binjgb.js', '/vendor/binjgb/%5Cbinjgb.js', '/vendor/%E0%A4%A']) expect(call(p).status, p).toBe(404);
  });
  it('the canonical spelling still follows the flag (read per request)', () => {
    delete process.env.BINJGB_SHELF_ENABLED;
    expect(call('/vendor/binjgb/binjgb.js').status).toBe(404);
    process.env.BINJGB_SHELF_ENABLED = '1';
    expect(call('/vendor/binjgb/binjgb.js').headers.get('x-middleware-next')).toBe('1');
  });
  it('the shelf routes keep their policy rows (C2 spellings unchanged)', () => {
    process.env.BINJGB_SHELF_ENABLED = '1';
    const csp = call('/play/gb-shelf/local%2Dframe').headers.get('Content-Security-Policy') ?? '';
    expect(csp).toContain('sandbox allow-scripts');
  });
});

describe('G2/G3: scripts/binjgb-curl-gate.sh', () => {
  const SCRIPT = 'scripts/binjgb-curl-gate.sh';
  const s = read(SCRIPT);
  it('parses and is still executable', () => {
    expect(spawnSync('bash', ['-n', join(ROOT, SCRIPT)]).status).toBe(0);
  });
  it('G2: a redirect counts only as a 308 to the same-origin canonical path, followed one hop', () => {
    expect(s).toContain('canonical_location() {');
    expect(s).toContain('if [ "$s" = "308" ] && c="$(canonical_location "$loc")"; then');
    expect(s).toContain('fail "$MODE: $path -> 308 to a non-canonical Location: ${R_LOC:-none}"');
    expect(s).toContain('fail "on: $p -> 308 to a non-canonical Location: ${loc:-none}"');
    expect(s).not.toMatch(/404\|301\|302\|307\|308\) pass/);
  });
  it('G2: canonical_location accepts only "/path" or BASE_URL origin + "/path", nothing odd', () => {
    const fn = s.slice(s.indexOf('canonical_location() {'), s.indexOf('}\n', s.indexOf('canonical_location() {')) + 2);
    const run = (loc: string) => spawnSync('bash', ['-c', `${fn}\ncanonical_location "$1"`, 'x', loc], { env: { PATH: process.env.PATH ?? '', BASE_URL: 'http://127.0.0.1:3100' }, encoding: 'utf8' });
    for (const [loc, want] of [['/vendor/binjgb/binjgb.js', '/vendor/binjgb/binjgb.js'], ['http://127.0.0.1:3100/play/gb-shelf', '/play/gb-shelf']] as const) {
      const r = run(loc); expect(r.status, loc).toBe(0); expect(r.stdout, loc).toBe(want);
    }
    for (const loc of ['', '//evil.example/x', 'https://evil.example/vendor/binjgb/binjgb.js', 'http://127.0.0.1:3101/x', 'http://127.0.0.1:3100.evil/x',
      'vendor/binjgb/binjgb.js', '/vendor%2Fbinjgb/binjgb.js', '/vendor//binjgb', '/vendor/./binjgb', '/vendor/../x', '/vendor/..', '/a\\b']) {
      const r = run(loc); expect(r.status, loc).toBe(1); expect(r.stdout, loc).toBe('');
    }
  });
  it('G3: every vendor row records status, Content-Type, Content-Length and body sha256; off → any non-404 FAILs', () => {
    expect(s).toMatch(/record_row\(\) \{ printf 'INFO  %s\\n' "\$MODE: \$1 status=\$\{R_STATUS:-none\} type=\$\{R_TYPE:--\} length=\$\{R_LEN:--\} bytes=\$R_BYTES sha256=\$R_SHA/);
    expect(s).toContain('case "$p" in /play/*) expect_404 "$p" ;; *) vendor_row "$p" 404 ;; esac');
    expect(s).toContain('vendor_row /vendor/binjgb/binjgb.js 200');
    expect(s).toContain('vendor_row /vendor/binjgb/binjgb.wasm 200');
    for (const p of [...FAILED_ON_REAL_BUILD, '/vendor/binjgb/%2E%2E/binjgb/binjgb.js', '/vendor/binjgb/%5Cbinjgb.js']) expect(s, p).toContain(p);
  });
  it('the cookie is still never printed', () => {
    const lines = s.split('\n').filter((l) => !l.trim().startsWith('#'));
    expect(lines.filter((l) => /(echo|printf|pass|fail|record_row)\b[^\n]*\$(\{)?(COOKIE|TEEN_COOKIE|cookie)\b/.test(l))).toEqual([]);
  });
});

// Cyber G1 clearance (efc40be6): spellings with no '%' that a case-insensitive disk (the Mini's APFS) might serve.
// Middleware is deliberately NOT changed for them yet; the real-build curl gate decides. Only what holds today is pinned.
describe('G1 clearance rows: case / trailing slash / ";" / "?" spellings', () => {
  const CASE_ROWS = ['/Vendor/binjgb/binjgb.wasm', '/VENDOR/BINJGB/BINJGB.JS', '/vendor/Binjgb/binjgb.wasm', '/vendor/binjgb/BINJGB.WASM'];
  const LOWER_ROWS = ['/vendor/binjgb/binjgb.wasm/', '/vendor/binjgb/binjgb.wasm;x'];
  it('the curl gate carries every row in its flag-off vendor list', () => {
    const s = read('scripts/binjgb-curl-gate.sh');
    for (const p of [...CASE_ROWS, ...LOWER_ROWS]) expect(s, p).toContain(p);
    expect(s).toContain("'/vendor/binjgb/binjgb.wasm;x' '/vendor/binjgb/binjgb.wasm?x=1'");
  });
  it('matcher: the lower-case rows reach middleware (the query is not part of the matched pathname)', () => {
    for (const p of [...LOWER_ROWS, '/vendor/binjgb/binjgb.wasm']) expect(matcherSeesRaw(p), p).toBe(true);
  });
  it('flag off: the lower-case rows and the ?x=1 row are 404 in middleware', () => {
    delete process.env.BINJGB_SHELF_ENABLED;
    for (const p of [...LOWER_ROWS, '/vendor/binjgb/binjgb.wasm?x=1']) expect(call(p).status, p).toBe(404);
  });
});
