import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  try {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return files(p);
      return /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') ? [p] : [];
    });
  } catch {
    return [];
  }
}

describe('the live call does not record', () => {
  it('no recorder under the call or session trees', () => {
    const roots = ['lib/coach-store/call', 'components/coach-store/call', 'app/session'];
    const hit = roots.flatMap(files).filter((f) => /MediaRecorder|captureStream|recordRTC/i.test(readFileSync(f, 'utf8')));
    expect(hit).toEqual([]);
  });
});
