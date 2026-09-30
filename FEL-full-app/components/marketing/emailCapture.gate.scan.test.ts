// JOIN-LAB-HIDE (2026-09-29): the Join the Lab form renders only behind the switch. The hero test covers `/`; this scan
// covers the next page someone gives the form. Every place in app/, components/ or lib/ that imports
// components/marketing/email-capture and renders it (as <EmailCapture …>, under any imported name, or through
// createElement) must have joinLabEnabled() in front of it: on the same line or in the few lines above, the way
// guest-landing-hero.tsx writes `{joinLabEnabled() && (`. The form's own file is the one exception.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['app', 'components', 'lib'];
const FORM_FILE = 'components/marketing/email-capture.tsx';
/** How far above a render the switch may sit: `{joinLabEnabled() && (`, then a wrapping element, then the form. */
const REACH = 4;

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.(tsx?|jsx?|mts)$/.test(name) && !/\.test\.[jt]sx?$/.test(name)) out.push(p);
  }
  return out;
}

/** The names a file imports the form under (named, aliased or default), or [] when it does not import it. */
export function formNames(src: string): string[] {
  const names: string[] = [];
  const imports = /import\s+([^;]*?)\s+from\s+['"][^'"]*\/email-capture['"]/g;
  for (const m of src.matchAll(imports)) {
    const clause = m[1];
    const named = clause.match(/\{([^}]*)\}/);
    if (named) {
      for (const part of named[1].split(',')) {
        const [imported, local] = part.trim().split(/\s+as\s+/);
        if (imported) names.push((local ?? imported).trim());
      }
    }
    const dflt = clause.replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim();
    if (dflt && !dflt.startsWith('*')) names.push(dflt);
    const ns = clause.match(/\*\s+as\s+(\w+)/);
    if (ns) names.push(`${ns[1]}.EmailCapture`, `${ns[1]}.default`);
  }
  return names.filter(Boolean);
}

/** The 1-based lines where the file renders the form with no joinLabEnabled() within REACH lines above it. */
export function ungatedRenders(src: string): number[] {
  const names = formNames(src);
  if (names.length === 0) return [];
  const lines = src.split('\n');
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const render = new RegExp(names.map((n) => `<${esc(n)}\\b|createElement\\(\\s*${esc(n)}\\b`).join('|'));
  const out: number[] = [];
  lines.forEach((line, i) => {
    if (!render.test(line)) return;
    const above = lines.slice(Math.max(0, i - REACH), i + 1).join('\n');
    if (!/\bjoinLabEnabled\(\)/.test(above)) out.push(i + 1);
  });
  return out;
}

describe('the Join the Lab form renders only behind joinLabEnabled()', () => {
  const files = ROOTS.flatMap((r) => sources(r)).filter((f) => f !== FORM_FILE);
  const renderers = files.filter((f) => formNames(readFileSync(f, 'utf8')).length > 0);

  it('the scan finds the render site on `/`: the signed-out landing hero (the only one when this lane was cut)', () => {
    expect(renderers).toContain('components/guest-landing-hero.tsx');
  });

  it('no file renders the form without the switch in front of it', () => {
    const ungated = renderers
      .map((f) => ({ file: f, lines: ungatedRenders(readFileSync(f, 'utf8')) }))
      .filter((r) => r.lines.length > 0);
    expect(ungated).toEqual([]);
  });

  describe('the checker itself (controls, so a pass above means something)', () => {
    const imp = "import { EmailCapture } from '@/components/marketing/email-capture';\n";

    it('flags a bare render', () => {
      expect(ungatedRenders(`${imp}export const A = () => (\n  <div>\n    <EmailCapture source="x" />\n  </div>\n);`)).toEqual([4]);
    });

    it('passes a render behind the switch, as the hero writes it', () => {
      const src = `${imp}export const A = () => (\n  <div>\n    {joinLabEnabled() && (\n      <div className="w">\n        <EmailCapture source="x" />\n      </div>\n    )}\n  </div>\n);`;
      expect(ungatedRenders(src)).toEqual([]);
    });

    it('flags an aliased, a default and a createElement render', () => {
      expect(ungatedRenders("import { EmailCapture as Join } from '@/components/marketing/email-capture';\nconst a = <Join />;")).toEqual([2]);
      expect(ungatedRenders("import Capture from '@/components/marketing/email-capture';\nconst a = <Capture />;")).toEqual([2]);
      expect(ungatedRenders(`${imp}const a = createElement(EmailCapture, {});`)).toEqual([2]);
    });

    it('ignores a file that does not import the form', () => {
      expect(ungatedRenders('const a = <EmailCaptureLike />;')).toEqual([]);
    });
  });
});
