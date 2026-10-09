import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx|png|svg|jpg)$/.test(name) && !name.includes('.test.') ? [p] : [];
  });
}

describe('no Equinox logo', () => {
  it('the word is not an image source or a file name', () => {
    const roots = ['lib/coach-store', 'components/coach-store', 'app/coach', 'app/session', 'app/program'];
    for (const root of roots) {
      for (const file of files(root)) {
        expect(file.toLowerCase()).not.toContain('equinox');
        if (file.endsWith('.ts') || file.endsWith('.tsx')) {
          const src = readFileSync(file, 'utf8');
          expect(src).not.toMatch(/<img[^>]+equinox/i);
          expect(src).not.toMatch(/src=["'][^"']*equinox/i);
        }
      }
    }
  });
});
