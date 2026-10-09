// FONT-SHARED (2026-09-29): one font-loading path. The display token asked for 'Chakra Petch', 'JetBrains Mono' by
// name; next/font registers its faces under hashed names and Chakra Petch was never loaded, so the READY cards, TAP TO
// START, the body-play line and the JuiceKit banners all drew in Courier. The token now points at app/layout.tsx's
// next/font variables, the variables sit on <html> where :root can see them, and no font is preloaded (owner call:
// a page loads only the faces its text uses).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../..');
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8');
const noComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
const LAYOUT = noComments(read('app/layout.tsx'));
const THEME = noComments(read('app/theme.css'));

/** Every source file that uses the display token. */
function consumers(): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      if (f === 'node_modules' || f.startsWith('.')) continue;
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?|css)$/.test(f) && !/\.test\.tsx?$/.test(f) && readFileSync(p, 'utf8').includes('fel-font-display')) out.push(relative(ROOT, p));
    }
  };
  for (const d of ['app', 'components', 'lib']) walk(join(ROOT, d));
  return out.sort();
}

describe('the display face is loaded, once, through next/font', () => {
  // FONT-SHARED (2026-09-29) met FONT-LOCAL (2026-09-30) on 2026-10-05. This block used to pin FONT-SHARED's
  // MECHANISM, `import { … } from 'next/font/google'`, which is exactly what FONT-LOCAL had to remove because the
  // build-time fetch from Google failed CI's builds. It now pins both passes' INTENT instead. FONT-LOCAL itself
  // shipped with no test at all, so the first check below is new: before it, nothing stopped the Google import (and
  // the broken CI builds) from coming back.
  const calls = [...LAYOUT.matchAll(/const (\w+) = localFont\(\{([\s\S]*?)\n\}\)/g)].map(([, name, opts]) => ({ name, opts }));

  it('every face loads from a committed file, never fetched from Google at build time (FONT-LOCAL)', () => {
    expect(LAYOUT).toMatch(/import localFont from 'next\/font\/local'/);
    expect(LAYOUT, 'next/font/google fetches at build time and that fetch failed CI builds').not.toMatch(/next\/font\/google/);
  });

  it('four faces: Chakra Petch as --font-chakra, beside the three it already had (FONT-SHARED)', () => {
    expect(calls.map((c) => c.name).sort()).toEqual(['barlow', 'chakraPetch', 'jetbrainsMono', 'plexSans']);
    const variable = Object.fromEntries(calls.map((c) => [c.name, /variable: '([^']+)'/.exec(c.opts)?.[1]]));
    expect(variable).toEqual({ barlow: '--font-display', plexSans: '--font-sans', jetbrainsMono: '--font-mono', chakraPetch: '--font-chakra' });
  });

  it('every face has preload: false (owner call: a page loads only the faces its text uses)', () => {
    expect(calls).toHaveLength(4);
    for (const { name, opts } of calls) expect(opts, name).toMatch(/preload: false/);
  });

  it('every font file the layout names is committed in app/fonts (a missing one fails the build)', () => {
    const paths = calls.flatMap((c) => [...c.opts.matchAll(/path: '([^']+)'/g)].map((m) => m[1]));
    expect(paths.length).toBeGreaterThanOrEqual(10);
    for (const rel of paths) expect(existsSync(join(ROOT, 'app', rel)), rel).toBe(true);
    expect(paths.filter((x) => x.includes('chakra-petch'))).toHaveLength(4);
  });

  it('the font variables sit on <html>, so theme.css\'s :root tokens can use them', () => {
    const html = /<html[^>]*className=\{`([^`]*)`\}/.exec(LAYOUT);
    expect(html, 'the <html> className').not.toBeNull();
    for (const v of ['barlow', 'plexSans', 'jetbrainsMono', 'chakraPetch']) expect(html![1]).toContain(`\${${v}.variable}`);
    expect(/<body[^>]*className="([^"]*)"/.exec(LAYOUT)?.[1]).not.toMatch(/variable/);
  });
});

describe('--fel-font-display is defined once, from the next/font variables', () => {
  it('one definition: Chakra Petch, then the mono face, then the system monospace', () => {
    const defs = [...THEME.matchAll(/--fel-font-display\s*:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(defs).toEqual(['var(--font-chakra), var(--font-mono), ui-monospace, monospace']);
    const everywhere = consumers().flatMap((f) => [...noComments(read(f)).matchAll(/--fel-font-display\s*:/g)].map(() => f));
    expect(everywhere).toEqual(['app/theme.css']);
  });

  it('no consumer of the token names a family in quotes (a name next/font never registers)', () => {
    const files = consumers();
    expect(files).toEqual(expect.arrayContaining([
      'app/theme.css', 'components/games/body-play.tsx', 'components/games/boot-splash.tsx',
      'components/reliability/global-error-boundary.tsx', 'lib/babylon/premium/JuiceKit.ts',
    ]));
    for (const f of files) {
      const src = noComments(read(f));
      expect(src, f).not.toMatch(/Chakra Petch|JetBrains Mono/);
    }
  });
});
