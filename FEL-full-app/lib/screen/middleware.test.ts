import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { config, middleware, SCREEN_PERMISSIONS_POLICY } from '../../middleware';

const PP = SCREEN_PERMISSIONS_POLICY;

function matcherHits(pathname: string): boolean {
  const patterns = config.matcher as string[];
  return patterns.some((p) => {
    const re = new RegExp(
      `^${p.replace(/:path\*/g, '.*').replace(/:\w+\*/g, '.*').replace(/:\w+/g, '[^/]+')}$`,
    );
    return re.test(pathname);
  });
}

function call(path: string) {
  const req = new NextRequest(`http://fel.test${path}`);
  return middleware(req);
}

describe('SCREEN-HARDEN middleware matcher', () => {
  for (const p of [
    '/screen',
    '/screen/privacy',
    '/screen/program/dunking',
    '/play/mirror/assess',
    '/play/mirror/assess/results',
  ]) {
    it(`matches ${p}`, () => expect(matcherHits(p), p).toBe(true));
  }
  for (const p of [
    '/',
    '/elijah',
    '/try',
    '/play/dunk',
    '/play/mirror',
    '/privacy',
    '/api/guest',
    '/pose/models/x.task',
  ]) {
    it(`does not match ${p}`, () => expect(matcherHits(p), p).toBe(false));
  }
});

describe('SCREEN-HARDEN middleware headers', () => {
  it('sets Permissions-Policy exactly on screen paths', () => {
    const res = call('/screen');
    expect(res.headers.get('Permissions-Policy')).toBe(PP);
    expect(res.headers.get('Permissions-Policy')).toContain('camera=(self)');
    expect(res.headers.get('Permissions-Policy')).toContain('microphone=()');
  });

  it('CSP-Report-Only has wasm-unsafe-eval, a nonce, no unsafe-eval, no report endpoint', () => {
    const res = call('/play/mirror/assess');
    const csp = res.headers.get('Content-Security-Policy-Report-Only') ?? '';
    expect(csp).toContain("'wasm-unsafe-eval'");
    expect(csp).toMatch(/'nonce-[^']+'/);
    expect(csp).not.toMatch(/(?:^|[;\s])'unsafe-eval'/);
    expect(csp).not.toMatch(/report-to|report-uri/i);
    expect(res.headers.get('Content-Security-Policy')).toBeNull();
  });

  it('nonces differ between two requests', () => {
    const na = call('/screen').headers.get('Content-Security-Policy-Report-Only')!.match(/'nonce-([^']+)'/)![1];
    const nb = call('/screen').headers.get('Content-Security-Policy-Report-Only')!.match(/'nonce-([^']+)'/)![1];
    expect(na).not.toBe(nb);
    expect(na.length).toBeGreaterThanOrEqual(16);
  });
});
