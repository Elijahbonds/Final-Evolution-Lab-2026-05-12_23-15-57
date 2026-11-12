import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FEL_CACHE_PREFIX, SW_URL, isFelWorker, swDecision } from './sw';

describe('NEXT_PUBLIC_SW_ENABLED: the service worker ships off, and off means removed', () => {
  it.each([
    ['production', '1', 'register'],
    ['production', 'true', 'register'],
    ['production', 'TRUE', 'register'],
    ['production', '', 'unregister'],
    ['production', undefined, 'unregister'],
    ['production', '0', 'unregister'],
    ['production', 'false', 'unregister'],
    ['production', 'yes', 'unregister'],
    ['development', '1', 'unregister'],
    ['test', '1', 'unregister'],
    [undefined, '1', 'unregister'],
  ] as const)('NODE_ENV=%s flag=%s -> %s', (env, flag, want) => {
    expect(swDecision(env, flag)).toBe(want);
  });

  it('.env.example ships the flag empty (off)', () => {
    const example = readFileSync(path.resolve(__dirname, '../../.env.example'), 'utf8');
    expect(example).toMatch(/^NEXT_PUBLIC_SW_ENABLED=""$/m);
  });

  it('the kill switch only removes our own worker', () => {
    expect(isFelWorker('https://fel.test/sw.js', 'https://fel.test')).toBe(true);
    expect(isFelWorker('https://fel.test/other-sw.js', 'https://fel.test')).toBe(false);
    expect(isFelWorker('https://elsewhere.test/sw.js', 'https://fel.test')).toBe(false);
    expect(isFelWorker(undefined, 'https://fel.test')).toBe(false);
    expect(isFelWorker('not a url', 'https://fel.test')).toBe(false);
    expect(SW_URL).toBe('/sw.js');
  });

  it('every cache the worker opens carries the prefix the kill switch deletes', () => {
    const src = readFileSync(path.resolve(__dirname, '../../public/sw.js'), 'utf8');
    const names = [...src.matchAll(/(\w+):\s*'([a-z-]+)'\s*\+/g)].map((m) => m[2]);
    expect(names.length).toBeGreaterThanOrEqual(3);
    for (const n of names) expect(n.startsWith(FEL_CACHE_PREFIX), n).toBe(true);
  });
});
