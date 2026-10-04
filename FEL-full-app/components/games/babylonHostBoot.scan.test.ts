import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stripComments } from '@/lib/testing/sourceScan';

const HOSTS = [
  'duel-babylon.tsx',
  'football-babylon.tsx',
  'mixedcombat-babylon.tsx',
  'air-session-babylon.tsx',
];

describe('deferred Babylon host boot', () => {
  it.each(HOSTS)('%s defers boot and reports a load error', (file) => {
    const src = stripComments(readFileSync(`components/games/${file}`, 'utf8'));
    expect(src).toContain('const startTimer = setTimeout');
    expect(src).toContain('clearTimeout(startTimer)');
    expect(src).toContain('onEndRef');
    expect(src).toContain('.catch((e) => { if (!disposed) setLoadError(String(e?.message ?? e)); })');
  });
});
