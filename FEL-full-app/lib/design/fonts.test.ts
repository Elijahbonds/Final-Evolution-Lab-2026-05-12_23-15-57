// FONT-SHARED (2026-09-29): one font-loading path. The display token asked for 'Chakra Petch', 'JetBrains Mono' by
// name; next/font registers its faces under hashed names and Chakra Petch was never loaded, so the READY cards, TAP TO
// START, the body-play line and the JuiceKit banners all drew in Courier. The token now points at app/layout.tsx's
// next/font variables, the variables sit on <html> where :root can see them, and no font is preloaded (owner call:
// a page loads only the faces its text uses).
import { readFileSync, readdirSync, statSync } from 'node:fs';
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
  it('app/layout.tsx loads Chakra Petch as --font-chakra, beside the three faces it already had', () => {
    expect(LAYOUT).toMatch(/import \{ Barlow_Condensed, Chakra_Petch, IBM_Plex_Sans, JetBrains_Mono \} from 'next\/font\/google'/);
    expect(LAYOUT).toMatch(/Chakra_Petch\(\{[^}]*variable: '--font-chakra'/);
    expect(LAYOUT).toMatch(/JetBrains_Mono\(\{[^}]*variable: '--font-mono'/);
  });

  it('every next/font face has preload: false (owner call: a page loads only the faces its text uses)', () => {
    const calls = [...LAYOUT.matchAll(/\b(Barlow_Condensed|Chakra_Petch|IBM_Plex_Sans|JetBrains_Mono)\(\{([^}]*)\}\)/g)];
    expect(calls.map((m) => m[1]).sort()).toEqual(['Barlow_Condensed', 'Chakra_Petch', 'IBM_Plex_Sans', 'JetBrains_Mono']);
    for (const [, name, opts] of calls) expect(opts, name).toMatch(/preload: false/);
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
