// The lazy registry is registry.ts by another door, nothing else (PERF-LOAD PRF-05).
//
// Same keys, and every lazy entry resolves to the very definition object registry.ts holds, so a host that mounts
// MODES.<key> from lazyRegistry.ts runs exactly what it ran from registry.ts. And the hosts that moved to it no longer pull
// registry.ts (all 30 modes) into their route's first download.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MODES as LAZY } from './lazyRegistry';
import { MODES } from './registry';
import { stripComments } from '@/lib/testing/sourceScan';

const ROOT = path.resolve(__dirname, '../../..');

describe('lazyRegistry: the registry, one dynamic import per mode', () => {
  it('has exactly registry.ts\'s keys', () => {
    expect(Object.keys(LAZY).sort()).toEqual(Object.keys(MODES).sort());
  });

  it('every entry names its own key and resolves to registry.ts\'s definition object (===)', async () => {
    for (const [key, ref] of Object.entries(LAZY)) {
      expect(ref.modeKey, key).toBe(key);
      expect(await ref(), key).toBe(MODES[key]);
    }
  }, 120_000);

  it('a second call reuses the first import', async () => {
    const a = LAZY.sprint(); const b = LAZY.sprint();
    expect(await a).toBe(await b);
  });

  it('the file imports no mode statically (a static import would put that mode back in every host\'s chunk)', () => {
    const src = stripComments(fs.readFileSync(path.join(ROOT, 'lib/babylon/modes/lazyRegistry.ts'), 'utf8'));
    const statics = [...src.matchAll(/^\s*import\s+(?!type\b)[^;]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    expect(statics).toEqual([]);
  });

  it('no game host imports the eager registry (components/games)', () => {
    const dir = path.join(ROOT, 'components/games');
    const eager = fs.readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.'))
      .filter((f) => /from ['"]@\/lib\/babylon\/modes\/registry['"]/.test(stripComments(fs.readFileSync(path.join(dir, f), 'utf8'))));
    expect(eager).toEqual([]);
  });
});
