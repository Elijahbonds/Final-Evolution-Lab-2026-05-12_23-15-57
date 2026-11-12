// BINJGB-SHELF-1 — headers. T-CSP-SHELF (Cyber G2 + F-A + N-2) and T-FLAG-SHELF-OFF-STATIC (G10).
// The middleware half is checked here; the built-server half (next.config.js headers merged with middleware's) can only be
// proven by the PR-time `curl -sI /play/gb-shelf` on `next start` with the flag on (Cyber F-A). That stays a PR gate.
import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import {
  config, cspEnforced, middleware, ROUTE_POLICIES, routePolicyFor, SCREEN_PERMISSIONS_POLICY, SHELF_PERMISSIONS_POLICY,
} from '../../middleware';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nextConfig = require('../../next.config.js');

const SPEC_SHELF_PP = 'camera=(), microphone=(), geolocation=(), gamepad=(self), fullscreen=(self)';
const call = (path: string) => middleware(new NextRequest(`http://fel.test${path}`));

function matcherHits(pathname: string): boolean {
  return (config.matcher as string[]).some((p) =>
    new RegExp(`^${p.replace(/:path\*/g, '.*').replace(/:\w+\*/g, '.*').replace(/:\w+/g, '[^/]+')}$`).test(pathname));
}

afterEach(() => { delete process.env.BINJGB_SHELF_ENABLED; });

describe('T-CSP-SHELF — middleware (G2)', () => {
  it('matches the shelf and its sub-paths; never a /play/gb-local route (OQ-6)', () => {
    for (const p of ['/play/gb-shelf', '/play/gb-shelf/x', '/play/gb-shelf/local-frame']) expect(matcherHits(p), p).toBe(true);
    expect(matcherHits('/play/gb-local')).toBe(false);
    expect((config.matcher as string[]).some((m) => m.includes('gb-local'))).toBe(false);
  });

  it('the shelf gets the ENFORCED CSP exactly as specified, the shelf Permissions-Policy and no-referrer', () => {
    for (const p of ['/play/gb-shelf', '/play/gb-shelf/some-slug']) {
      const res = call(p);
      const csp = res.headers.get('Content-Security-Policy') ?? '';
      const nonce = csp.match(/'nonce-([^']+)'/)?.[1] ?? '';
      expect(nonce.length, p).toBeGreaterThanOrEqual(16);
      expect(csp, p).toBe(
        "default-src 'self'; " +
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'; ` +
        "style-src 'self' 'unsafe-inline'; font-src 'self'; manifest-src 'self'; " +
        "connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self'; object-src 'none'; " +
        "base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
      expect(res.headers.get('Permissions-Policy'), p).toBe(SPEC_SHELF_PP);
      expect(res.headers.get('Permissions-Policy'), p).toContain('camera=()');
      expect(res.headers.get('Permissions-Policy'), p).toContain('gamepad=(self)');
      expect(res.headers.get('Referrer-Policy'), p).toBe('no-referrer');
      expect(res.headers.get('Content-Security-Policy-Report-Only'), p).toBeNull();
      expect(res.headers.get('Cross-Origin-Embedder-Policy'), p).toBeNull();   // no COEP (G2 item 4)
    }
    expect(SHELF_PERMISSIONS_POLICY).toBe(SPEC_SHELF_PP);
  });

  it('the local frame is the one shelf path the shelf page may frame: frame-ancestors \'self\', same Permissions-Policy', () => {
    const res = call('/play/gb-shelf/local-frame');
    expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'self'");
    expect(res.headers.get('Content-Security-Policy')).not.toContain("frame-ancestors 'none'");
    expect(res.headers.get('Permissions-Policy')).toBe(SPEC_SHELF_PP);
  });

  it("Cyber F1: no 'unsafe-eval' anywhere and no 'unsafe-inline' in script-src, on every shelf path incl. the local frame", () => {
    for (const p of ['/play/gb-shelf', '/play/gb-shelf/some-slug', '/play/gb-shelf/local-frame']) {
      const csp = call(p).headers.get('Content-Security-Policy') ?? '';
      expect(csp, p).toContain("style-src 'self' 'unsafe-inline'");
      expect(csp, p).not.toMatch(/'unsafe-eval'/);
      const scriptDirective = csp.split(';').map((d) => d.trim()).filter((d) => d.startsWith('script-src'));
      expect(scriptDirective, p).toHaveLength(1);
      expect(scriptDirective[0], p).not.toContain("'unsafe-inline'");
    }
  });

  it("'wasm-unsafe-eval' only on /screen*, /play/mirror/assess* and /play/gb-shelf*; never on other paths", () => {
    const groups = ROUTE_POLICIES.filter((p) => p.wasm).map((p) => p.prefix).sort();
    expect(groups).toEqual(['/play/gb-shelf', '/play/gb-shelf/local-frame', '/play/mirror/assess', '/screen']);
    for (const p of ['/', '/play', '/play/dunk', '/play/mirror', '/links', '/books', '/vendor/binjgb/binjgb.js', '/play/gb-shelfx']) {
      expect(routePolicyFor(p), p).toBeNull();
    }
    for (const p of ['/links', '/books', '/elijah']) {
      const res = call(p);
      expect(`${res.headers.get('Content-Security-Policy') ?? ''}${res.headers.get('Content-Security-Policy-Report-Only') ?? ''}`, p).not.toContain('wasm-unsafe-eval');
    }
  });

  it('/screen* and /play/mirror/assess* are unchanged: camera=(self), report-only CSP, no enforced CSP, no referrer override', () => {
    for (const p of ['/screen', '/screen/privacy', '/play/mirror/assess', '/play/mirror/assess/results']) {
      const res = call(p);
      expect(res.headers.get('Permissions-Policy'), p).toBe(SCREEN_PERMISSIONS_POLICY);
      expect(res.headers.get('Permissions-Policy'), p).toContain('camera=(self)');
      expect(res.headers.get('Content-Security-Policy'), p).toBeNull();
      expect(res.headers.get('Content-Security-Policy-Report-Only'), p).toContain("'wasm-unsafe-eval'");
      expect(res.headers.get('Content-Security-Policy-Report-Only'), p).toContain("frame-ancestors 'none'");
      expect(res.headers.get('Referrer-Policy'), p).toBeNull();
    }
  });

  it('cspEnforced is built only from a table row (no global default carries wasm)', () => {
    const row = routePolicyFor('/play/gb-shelf')!;
    expect(cspEnforced('n0nce0000000000000', { ...row, wasm: false })).not.toContain('wasm-unsafe-eval');
  });
});

describe('T-CSP-SHELF — next.config.js (Cyber N-2): rule 0 untouched, shelf rules appended', () => {
  it('rule 0 is still the global rule with its own values', async () => {
    const rules = await nextConfig.headers();
    expect(rules[0].source).toBe('/(.*)');
    const h0 = new Map(rules[0].headers.map((x: { key: string; value: string }) => [x.key, x.value]));
    expect(h0.get('Permissions-Policy')).toBe('camera=(self), microphone=(self), geolocation=()');
    expect(h0.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('later rules for /play/gb-shelf and /play/gb-shelf/:path* set the shelf Permissions-Policy (= middleware) and no-referrer', async () => {
    const rules = (await nextConfig.headers()) as { source: string; headers: { key: string; value: string }[] }[];
    for (const source of ['/play/gb-shelf', '/play/gb-shelf/:path*']) {
      const i = rules.findIndex((r) => r.source === source);
      expect(i, source).toBeGreaterThan(0);   // after rule 0, so Next sends this value for the same key
      const h = new Map(rules[i].headers.map((x) => [x.key, x.value]));
      expect(h.get('Permissions-Policy'), source).toBe(SHELF_PERMISSIONS_POLICY);
      expect(h.get('Referrer-Policy'), source).toBe('no-referrer');
      expect(rules[i].headers.map((x) => x.key).sort(), source).toEqual(['Permissions-Policy', 'Referrer-Policy']);
    }
    expect(rules.some((r) => r.source.includes('gb-local'))).toBe(false);
  });
});

describe('T-FLAG-SHELF-OFF-STATIC (G10): public files skip the flag, so middleware 404s them while it is off', () => {
  const STATIC = ['/vendor/binjgb/binjgb.js', '/vendor/binjgb/binjgb.wasm', '/vendor/binjgb/LICENSE', '/vendor/binjgb/VENDOR.md', '/gb-shelf/x/y.bin'];

  it('the matcher covers both static prefixes', () => {
    for (const p of STATIC) expect(matcherHits(p), p).toBe(true);
  });

  it('flag off → 404 for every one of them (no wasm, no player script, no game bytes)', () => {
    delete process.env.BINJGB_SHELF_ENABLED;
    for (const p of STATIC) expect(call(p).status, p).toBe(404);
  });

  it('flag on → passed through to the static file', () => {
    process.env.BINJGB_SHELF_ENABLED = '1';
    for (const p of STATIC) {
      const res = call(p);
      expect(res.status, p).toBe(200);
      expect(res.headers.get('x-middleware-next'), p).toBe('1');
    }
  });

  it('other vendored files are not caught by it (havok still serves)', () => {
    expect(matcherHits('/vendor/havok/HavokPhysics.wasm')).toBe(false);
  });
});
