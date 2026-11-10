// BINJGB-SHELF-1 C1–C4 (Cyber F2F6 review 7c9809b2). C1's two describe blocks are Cyber's paste, word for word.
// C1: a soft-navigated shelf reloads on mount; the shelf path appears in code only in shelf-owned files.
// C2: routePolicyFor matches the decoded, slash-collapsed spelling, so odd spellings of the local frame keep its sandbox.
// C3: a client-sent x-nonce never passes through middleware on a path with no policy row.
// C4: the curl gate's cookie rules and its no-cookie / teen local-frame 404 rows.
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware, routePolicyFor } from '../../middleware';
import { firstLoadPath, reloadOnShelfMount } from '@/lib/binjgb/nav';
import { read, sources } from './helpers';

/** Code only — comments here quote the rule. */
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('F2 defence in depth: a soft-navigated shelf reloads on mount', () => {
  const perf = (name?: string) => ({ getEntriesByType: (t: string) => (t === 'navigation' && name !== undefined ? [{ name } as PerformanceEntry] : []) });
  it('first load outside the shelf → reload; on the shelf, or unknown → no reload', () => {
    expect(reloadOnShelfMount(firstLoadPath(perf('https://fel.example/play')))).toBe(true);
    expect(reloadOnShelfMount(firstLoadPath(perf('https://fel.example/screen')))).toBe(true);
    expect(reloadOnShelfMount(firstLoadPath(perf('https://fel.example/play/gb-shelf')))).toBe(false);
    expect(reloadOnShelfMount(firstLoadPath(perf('https://fel.example/play/gb-shelf/some-slug')))).toBe(false);
    expect(reloadOnShelfMount(firstLoadPath(perf()))).toBe(false);
    expect(reloadOnShelfMount(firstLoadPath(undefined))).toBe(false);
  });
  it('the guard checks it first thing on mount', () => {
    expect(code('components/binjgb/shelf-nav-guard.tsx')).toMatch(/if \(reloadOnShelfMount\(firstLoadPath\(\)\)\) \{ window\.location\.reload\(\); return; \}/);
  });
});

describe('F2 hardening: the shelf path appears in code only in shelf-owned files', () => {
  it('catches variable / aliased hrefs, redirect(), router aliases and imported SHELF_PATH anywhere else', () => {
    const ALLOW = new Set([
      'app/play/gb-shelf/page.tsx', 'app/play/gb-shelf/[slug]/page.tsx', 'app/play/gb-shelf/local-frame/route.ts',
      'components/binjgb/homebrew-shelf.tsx', 'components/binjgb/homebrew-row.tsx', 'components/binjgb/shelf-nav-guard.tsx',
      'components/binjgb/local-player.tsx',
      'lib/binjgb/nav.ts', 'lib/binjgb/messages.ts', 'lib/binjgb/copy.ts', 'lib/binjgb/frameDoc.ts',
    ]);
    const hits = sources(['app', 'components', 'lib', 'hooks', 'server'])
      .filter((f) => !ALLOW.has(f))
      .filter((f) => /gb-shelf|SHELF_PATH|LOCAL_FRAME_PATH/.test(code(f)));
    expect(hits).toEqual([]);
  });
});

describe('C1: the mount reload sits before every listener and cannot loop', () => {
  it('it is the first statement in the effect, before the click and popstate listeners', () => {
    const g = code('components/binjgb/shelf-nav-guard.tsx');
    const effect = g.indexOf('useEffect(() => {');
    const reload = g.indexOf('if (reloadOnShelfMount(firstLoadPath()))');
    expect(effect).toBeGreaterThan(0);
    expect(reload).toBeGreaterThan(effect);
    expect(g.slice(effect + 'useEffect(() => {'.length, reload).trim()).toBe('');
    expect(reload).toBeLessThan(g.indexOf("addEventListener('click'"));
  });

  it('after the reload the navigation entry is the shelf URL, so the next mount does not reload again', () => {
    const afterReload = { getEntriesByType: () => [{ name: 'https://fel.example/play/gb-shelf' } as PerformanceEntry] };
    expect(reloadOnShelfMount(firstLoadPath(afterReload))).toBe(false);
    expect(firstLoadPath({ getEntriesByType: () => [{ name: 'not a url' } as PerformanceEntry] })).toBeNull();
  });
});

describe('C2: odd spellings of the local frame get the local-frame row (sandbox), not the shelf row', () => {
  const ODD = ['/play/gb-shelf/local%2Dframe', '/play/gb-shelf//local-frame', '/play/%67b-shelf/local-frame'];

  it('routePolicyFor: decoded, slash-collapsed first', () => {
    for (const p of [...ODD, '/play/gb-shelf/local%2dframe', '/play/gb-shelf/%6Cocal-frame', '/play/gb-shelf/local-frame/', '//play/gb-shelf/local-frame']) {
      expect(routePolicyFor(p)?.prefix, p).toBe('/play/gb-shelf/local-frame');
    }
    expect(routePolicyFor('/play/%67b-shelf')?.prefix).toBe('/play/gb-shelf');
    expect(routePolicyFor('/play/gb-shelfx')).toBeNull();
    expect(routePolicyFor('/play/%E0%A4%A')).toBeNull();   // a malformed escape: the raw spelling, no row
  });

  it("those three spellings carry `sandbox allow-scripts` and `frame-ancestors 'self'`", () => {
    for (const p of ODD) {
      const csp = middleware(new NextRequest(`http://fel.test${p}`)).headers.get('Content-Security-Policy') ?? '';
      expect(csp, p).toContain('sandbox allow-scripts');
      expect(csp, p).toContain("frame-ancestors 'self'");
      expect(csp, p).not.toContain('allow-same-origin');
    }
  });

  it('the canonical paths are unchanged', () => {
    expect(routePolicyFor('/play/gb-shelf')?.prefix).toBe('/play/gb-shelf');
    expect(routePolicyFor('/play/gb-shelf/some-slug')?.prefix).toBe('/play/gb-shelf');
    expect(routePolicyFor('/screen')?.prefix).toBe('/screen');
    expect(routePolicyFor('/play/mirror/assess/x')?.prefix).toBe('/play/mirror/assess');
    expect(routePolicyFor('/')).toBeNull();
  });
});

describe('C3: only middleware mints the nonce', () => {
  const forwarded = (res: Response, name: string) => res.headers.get(`x-middleware-request-${name}`);

  it('on a path with no policy row, a client-sent x-nonce is stripped from the forwarded request', () => {
    for (const path of ['/play', '/play/gb-shelfx', '/me']) {
      expect(routePolicyFor(path), path).toBeNull();
      const res = middleware(new NextRequest(`http://fel.test${path}`, { headers: { 'x-nonce': 'AAAAAAAAAAAAAAAAAAAAAA==', 'x-keep': '1' } }));
      expect(res.headers.get('x-middleware-next'), path).toBe('1');
      const overridden = (res.headers.get('x-middleware-override-headers') ?? '').split(',').map((h) => h.trim());
      expect(overridden, path).toContain('x-keep');          // the request headers were rewritten…
      expect(overridden, path).not.toContain('x-nonce');     // …without the client's nonce
      expect(forwarded(res, 'x-nonce'), path).toBeNull();
      expect(forwarded(res, 'x-keep'), path).toBe('1');
    }
  });

  it('with no client x-nonce, a no-policy path is passed through untouched (no header rewrite)', () => {
    const res = middleware(new NextRequest('http://fel.test/play'));
    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(res.headers.get('x-middleware-override-headers')).toBeNull();
  });

  it('the no-policy branch deletes x-nonce from the forwarded request headers', () => {
    const src = code('middleware.ts');
    expect(src).toMatch(/if \(!policy\) \{\s*if \(!request\.headers\.has\('x-nonce'\)\) return NextResponse\.next\(\);\s*const stripped = new Headers\(request\.headers\);\s*stripped\.delete\('x-nonce'\);\s*return NextResponse\.next\(\{ request: \{ headers: stripped \} \}\);\s*\}/);
  });

  it('a policy path always gets a fresh nonce, never the client one', () => {
    const res = middleware(new NextRequest('http://fel.test/play/gb-shelf/local-frame', { headers: { 'x-nonce': 'AAAAAAAAAAAAAAAAAAAAAA==' } }));
    const sent = forwarded(res, 'x-nonce');
    expect(sent).toBeTruthy();
    expect(sent).not.toBe('AAAAAAAAAAAAAAAAAAAAAA==');
    expect(res.headers.get('Content-Security-Policy')).toContain(`'nonce-${sent}'`);
  });
});

describe('C4: the curl gate — local test accounts only, and the age rows', () => {
  const s = read('scripts/binjgb-curl-gate.sh');

  it('documents the cookie rule: local test accounts only, never Elijah / production, never pasted, signed out after', () => {
    expect(s).toMatch(/LOCAL TEST accounts on the\s*\n?#?\s*local or preview database only/);
    expect(s).toMatch(/never Elijah's session, never a production session/);
    expect(s).toMatch(/Never paste them into chat, NOTES or\s*\n?#?\s*logs/);
    expect(s).toMatch(/Sign the test accounts out afterwards/);
  });

  it('never prints a cookie: no echo / printf of $COOKIE or $TEEN_COOKIE, cookies only in a curl header', () => {
    const lines = s.split('\n').filter((l) => !l.trim().startsWith('#'));
    expect(lines.filter((l) => /(echo|printf|pass|fail)\b[^\n]*\$(\{)?(COOKIE|TEEN_COOKIE|cookie)\b/.test(l))).toEqual([]);
    expect(s).toMatch(/-H "Cookie: \$cookie"/);
  });

  it('no cookie → local-frame 404; a teen account → local-frame 404 (SKIP when no local teen account)', () => {
    expect(s).toContain('h="$(headers_as "" /play/gb-shelf/local-frame)"');
    expect(s).toContain('on: no cookie: /play/gb-shelf/local-frame -> 404');
    expect(s).toContain('h="$(headers_as "$TEEN_COOKIE" /play/gb-shelf/local-frame)"');
    expect(s).toContain('on: teen account: /play/gb-shelf/local-frame -> 404');
    expect(s).toMatch(/printf 'SKIP  %s\\n'/);
  });

  it('MODE=on without the adult cookie fails rather than silently skipping', () => {
    expect(s).toContain('if [ -z "$COOKIE" ]; then fail "on: FEL_GATE_COOKIE not set');
  });

  it('C2 rows: every odd local-frame spelling is 404 / redirect, or 200 only WITH sandbox allow-scripts', () => {
    for (const p of ['/play/gb-shelf/local%2Dframe', '/play/gb-shelf/local%2dframe', '/play/gb-shelf//local-frame', '/play/gb-shelf/local-frame/', '/play/%67b-shelf/local-frame', '/play/gb-shelf/%6Cocal-frame']) {
      expect(s, p).toContain(p);
    }
    expect(s).toContain('fail "on: $p -> 200 WITHOUT sandbox allow-scripts"');
  });
});
