// Every page under app/dev is a hard 404 outside `next dev`, except the one the owner chose to publish by its URL
// (/dev/adventure, 2026-10-06 — held by lib/babylon/adventure/host/hiddenRoute.test.ts).
//
// Why a scan: /dev/shelf and /dev/shelf/cards were written without the gate and were served on the live site for weeks,
// the second one showing a made-up "Elijah Bonds" profile with a PRQ of 64 (found by the 2026-10-14 bug sweep). A new
// dev page that forgets the line fails here instead of shipping.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';

const ROOT = path.resolve(__dirname, '../..');
const DEV = path.join(ROOT, 'app/dev');
const PUBLISHED = new Set(['app/dev/adventure/page.tsx']);

function pages(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return pages(p);
    return e.name === 'page.tsx' ? [p] : [];
  });
}

describe('app/dev pages are a 404 outside next dev', () => {
  const all = pages(DEV).map((f) => path.relative(ROOT, f).split(path.sep).join('/'));

  it('finds the dev pages (the scan itself is alive)', () => {
    expect(all.length).toBeGreaterThan(25);
    expect(all).toContain('app/dev/shelf/page.tsx');
    expect(all).toContain('app/dev/shelf/cards/page.tsx');
  });

  it.each(all.filter((f) => !PUBLISHED.has(f)))('%s calls notFound() unless NODE_ENV is development', (rel) => {
    const src = stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    expect(src, rel).toMatch(/process\.env\.NODE_ENV\s*!==\s*['"]development['"]/);
    expect(src, rel).toMatch(/notFound\(\)/);
  });
});
