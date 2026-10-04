import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string): string => stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const GUARDED_HOSTS = [
  'components/games/showdown-babylon.tsx',
  'components/games/duel-babylon.tsx',
  'components/games/football-babylon.tsx',
  'components/games/dunkduel-babylon.tsx',
  'components/games/carnival-babylon.tsx',
  'components/games/mixedcombat-babylon.tsx',
  'components/games/air-session-babylon.tsx',
];

describe('Babylon host boot guards', () => {
  it('the high-risk hosts defer boot so StrictMode cleanup can cancel the phantom mount', () => {
    for (const rel of GUARDED_HOSTS) {
      const src = read(rel);
      expect(src, rel).toContain('const startTimer = setTimeout(() =>');
      expect(src, rel).toContain('clearTimeout(startTimer);');
    }
  });

  it('the guarded hosts are mount-owned and read result callbacks through refs', () => {
    for (const rel of GUARDED_HOSTS) {
      const src = read(rel);
      expect(src, rel).toContain('const onEndRef = useRef(onEnd);');
      expect(src, rel).toContain('onEndRef.current = onEnd;');
      expect(src, rel).not.toMatch(/\}, \[onEnd\]\);/);
    }
  });

  it('the guarded hosts show boot errors on BootSplash instead of only logging to the console', () => {
    for (const rel of GUARDED_HOSTS) {
      const src = read(rel);
      expect(src, rel).toMatch(/\.catch\(\(e\) => \{ if \(!disposed\) setLoadError\(String\(e\?\.message \?\? e\)\); \}\)/);
      const boot = src.slice(src.indexOf('<BootSplash'));
      expect(boot, rel).toContain("detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}");
    }
  });
});
