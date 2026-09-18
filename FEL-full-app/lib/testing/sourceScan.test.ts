// The stripper that replaced a regex which ate live code (2026-09-13).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments, sourceFiles } from './sourceScan';

describe('stripComments keeps the code', () => {
  it('drops line and block comments', () => {
    expect(stripComments('const a = 1; // note').trim()).toBe('const a = 1;');
    expect(stripComments('/* hi */ const a = 1;').trim()).toBe('const a = 1;');
    expect(stripComments('a;\n/* multi\n line */\nb;').replace(/\s+/g, ' ').trim()).toBe('a; b;');
  });

  it('A `/*` INSIDE A STRING IS NOT A COMMENT', () => {
    // the exact class of thing the old regex mispaired on
    expect(stripComments("const u = 'http://x/*y*/z'; const k = 1;")).toContain('const k = 1;');
    expect(stripComments('const s = "/*"; const k = 1;')).toContain('const k = 1;');
    expect(stripComments('const t = `a /* b`; const k = 1;')).toContain('const k = 1;');
  });

  it('keeps line numbers stable', () => {
    expect(stripComments('a;\n// gone\nb;').split('\n')).toHaveLength(3);
  });

  it('THE REGRESSION: real host files keep their MODES call', () => {
    // measured: the old regex cut karate-babylon.tsx from 185 lines to 86 and removed this very reference,
    // so a guard looking for it passed while seeing nothing
    const ROOT = path.resolve(__dirname, '../..');
    for (const f of ['components/games/karate-babylon.tsx', 'components/games/basketball-babylon.tsx', 'components/games/football-babylon.tsx']) {
      const raw = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const clean = stripComments(raw);
      expect(clean, f).toMatch(/MODES\./);
      // and it did not devour the file
      expect(clean.split('\n').filter((l) => l.trim()).length).toBeGreaterThan(raw.split('\n').length * 0.3);
    }
  });

  it('sourceFiles finds real files and skips tests', () => {
    const ROOT = path.resolve(__dirname, '../..');
    const files = sourceFiles(ROOT, ['lib/testing'], fs, path);
    expect(files.some((f) => f.endsWith('sourceScan.ts'))).toBe(true);
    expect(files.some((f) => f.includes('.test.'))).toBe(false);
  });
});
