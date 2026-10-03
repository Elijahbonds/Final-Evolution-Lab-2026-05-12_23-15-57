import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string): string => stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const GUARDED_HOSTS = fs
  .readdirSync(path.join(ROOT, 'components/games'))
  .filter((file) => file.endsWith('-babylon.tsx'))
  .map((file) => `components/games/${file}`)
  .sort();

describe('Babylon host boot guards', () => {
  it('the Babylon hosts defer boot so StrictMode cleanup can cancel the phantom mount', () => {
    for (const rel of GUARDED_HOSTS) {
      const src = read(rel);
      expect(src, rel).toContain('const startTimer = setTimeout(() =>');
      expect(src, rel).toContain('clearTimeout(startTimer);');
    }
  });

  it('the Babylon hosts are mount-owned and read result callbacks through refs', () => {
    for (const rel of GUARDED_HOSTS) {
      const src = read(rel);
      expect(src, rel).toContain('const onEndRef = useRef(onEnd);');
      expect(src, rel).toContain('onEndRef.current = onEnd;');
      expect(src, rel).not.toMatch(/\}, \[onEnd\]\);/);
    }
  });

  it('the Babylon hosts surface boot errors instead of only logging to the console', () => {
    for (const rel of GUARDED_HOSTS) {
      const src = read(rel);
      expect(src, rel).toMatch(/\.catch\(\(e\) => \{ if \(!disposed\) setLoadError\(String\(e\?\.message \?\? e\)\); \}\)/);
      if (src.includes('<BootSplash')) {
        const boot = src.slice(src.indexOf('<BootSplash'));
        expect(boot, rel).toContain("detail={phase === 'error' ? (loadError ?? undefined) : (countdown ?? undefined)}");
      } else {
        expect(src, rel).toContain("{phase === 'error'");
        expect(src, rel).toContain('{loadError}');
      }
    }
  });
});
