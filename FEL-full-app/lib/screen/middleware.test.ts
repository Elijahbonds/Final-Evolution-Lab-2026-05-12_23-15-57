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

  it('matches /elijah only to let the public redirect through, with no screen camera policy', () => {
    expect(matcherHits('/elijah')).toBe(true);
    const res = call('/elijah');
    expect(res.headers.get('Permissions-Policy')).toBeNull();
    expect(res.headers.get('location') ?? '').not.toMatch(/\/login/);
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

  it('CSP-Report-Only carries no directive a report-only policy ignores (each one is a console error on every load)', () => {
    // upgrade-insecure-requests is ignored when delivered report-only, and Chrome
    // logs "The Content Security Policy directive 'upgrade-insecure-requests' is ignored when delivered in a report-only
    // policy" as an error. Found on the live /screen and /play/mirror/assess by the 2026-10-14 bug sweep.
    for (const p of ['/screen', '/screen/privacy', '/screen/program/dunking', '/play/mirror/assess', '/play/mirror/assess/results']) {
      const csp = call(p).headers.get('Content-Security-Policy-Report-Only') ?? '';
      expect(csp, p).not.toMatch(/upgrade-insecure-requests/);
    }
  });

  it('nonces differ between two requests', () => {
    const na = call('/screen').headers.get('Content-Security-Policy-Report-Only')!.match(/'nonce-([^']+)'/)![1];
    const nb = call('/screen').headers.get('Content-Security-Policy-Report-Only')!.match(/'nonce-([^']+)'/)![1];
    expect(na).not.toBe(nb);
    expect(na.length).toBeGreaterThanOrEqual(16);
  });
});
