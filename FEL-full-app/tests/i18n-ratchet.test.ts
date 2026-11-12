// THE i18n RATCHET (A11-07, lane/a11y-design, 2026-10-25).
//
// The converted folders take their words from messages/en/*.json through t() (lib/i18n). This fails when a NEW
// hard-coded, user-facing string appears in one of them: a file's count may never rise above its baseline, and a file
// with no baseline (a new one) is held to zero. It never fails the strings already in the tree — they are the baseline,
// counted the day the folder was converted — and a count that drops is fine (lower the number here when it does, so the
// ratchet keeps the ground). The scanner is tests/helpers/i18nScan.ts (the TypeScript parser, not a regex).
//
// Converting a folder later: move its strings into messages/en/<area>.json, add the folder to CONVERTED, and record
// what is left (a brand mark, say) in BASELINE with the reason.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { hardCodedText } from './helpers/i18nScan';

const ROOT = join(__dirname, '..');

/** Folders and files whose user-facing text lives in messages/en. */
export const CONVERTED = [
  'components/shell',        // the status rail, the tab bar, the tab page frame, the Play shelf, the venue strip and shelf
  'components/settings',     // motion, colour vision, the big-screen menus
  'app/play/page.tsx',       // the Play tab
  'app/profile/page.tsx',    // the Profile tab
  'app/train/page.tsx',      // the Train tab
] as const;

/** What a converted file may still say in code, and why. Everything else is zero. */
const BASELINE: Record<string, number> = {
  'components/shell/status-rail.tsx': 2,   // the wordmark, "FE" + "L": a brand, the same in every language
};

function files(): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    const abs = join(ROOT, p);
    if (!existsSync(abs)) return;
    if (statSync(abs).isDirectory()) { for (const e of readdirSync(abs)) walk(join(p, e)); return; }
    if (/\.(tsx?)$/.test(p) && !/\.(test|spec)\.tsx?$/.test(p)) out.push(p);
  };
  for (const c of CONVERTED) walk(c);
  return out.sort();
}

describe('the scanner finds what a player reads, and only that', () => {
  it('JSX text, a readable attribute and prose in a literal; not classes, keys, paths, t() keys or comments', () => {
    const src = `'use client';
      // A comment that says Hello World
      import { t } from '@/lib/i18n';
      const L = { reduce: 'Reduced', full: 'Full' };
      export function X({ on }: { on: boolean }) {
        if (on === 'authenticated') return null;
        return <nav aria-label="Main" className="flex items-center gap-2 text-fel-dim">
          <a href="/play" data-x="Some Thing">{t('shell.tabs.play')}</a>
          {/* Pick your lane */}
          <p title={\`Score \${1}\`}>Pick your lane</p>
        </nav>;
      }`;
    expect(hardCodedText(src, 'x.tsx').map((h) => h.text)).toEqual(['Reduced', 'Full', 'Main', 'Pick your lane']);
  });
});

describe('no new hard-coded text in a converted folder', () => {
  const list = files();
  it('the converted set exists', () => {
    expect(list.length).toBeGreaterThan(8);
  });
  for (const f of list) {
    it(f, () => {
      const hits = hardCodedText(readFileSync(join(ROOT, f), 'utf8'), f);
      const allowed = BASELINE[f] ?? 0;
      expect(hits.length, `${relative(ROOT, join(ROOT, f))}: new hard-coded text — move it to messages/en and use t():\n${hits.map((h) => `  line ${h.line}: ${JSON.stringify(h.text)}`).join('\n')}`).toBeLessThanOrEqual(allowed);
    });
  }
  it('every baseline names a converted file', () => {
    for (const f of Object.keys(BASELINE)) expect(list, f).toContain(f);
  });
});
