import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { is3D, isBabylon } from './flags';
import { stripComments } from '@/lib/testing/sourceScan';

const ROOT = path.resolve(__dirname, '../..');

function playLoaderFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) { walk(abs); continue; }
      if (e.name === 'loader.tsx') out.push(abs);
    }
  };
  walk(path.join(ROOT, 'app/play'));
  return out.sort();
}

/**
 * WHICH RENDERER A MODE GETS. Twenty files import these two predicates, and getting one wrong does not throw — it
 * quietly serves the 2D deck to a player who should have had the Babylon build, which has happened in this repo
 * before (see the note beside brainbrawl in lib/babylon/modes/registry.ts).
 */
describe('renderer flags', () => {
  it('a known Babylon mode is Babylon, and an unknown string is not', () => {
    // NOTE the key vocabulary: these flags speak 'dunkContest', while the Babylon registry speaks 'dunk'. Two names
    // for one mode in two tables is the route-key-versus-mode-id trap this repo has been caught by before, and a
    // test that used the registry's spelling here would have quietly asserted 2D for the flagship mode.
    expect(isBabylon('dunkContest')).toBe(true);
    expect(isBabylon('velocityKart')).toBe(true);
    expect(isBabylon('aeroAces')).toBe(true);
    expect(isBabylon('tiebreak')).toBe(true);
    expect(isBabylon('not_a_mode')).toBe(false);
    expect(isBabylon('')).toBe(false);
    expect(isBabylon('dunk')).toBe(false);          // the registry's key is NOT this table's key
  });

  it('never answers yes on a prototype-chain key — the classic lookup-table hole', () => {
    for (const k of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(isBabylon(k), k).toBe(false);
      expect(is3D(k), k).toBe(false);
    }
  });

  it('the kill switch turns EVERYTHING off, which is the point of a kill switch', () => {
    const prev = process.env.NEXT_PUBLIC_DISABLE_3D;
    process.env.NEXT_PUBLIC_DISABLE_3D = '1';
    try {
      expect(isBabylon('dunkContest')).toBe(false);
      expect(is3D('dunkContest')).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_DISABLE_3D;
      else process.env.NEXT_PUBLIC_DISABLE_3D = prev;
    }
  });

  it('only the exact value "1" disarms 3D — a stray truthy string must not blank the game', () => {
    const prev = process.env.NEXT_PUBLIC_DISABLE_3D;
    for (const v of ['0', 'false', 'true', 'yes', '']) {
      process.env.NEXT_PUBLIC_DISABLE_3D = v;
      expect(isBabylon('dunkContest'), `NEXT_PUBLIC_DISABLE_3D=${v}`).toBe(true);
    }
    if (prev === undefined) delete process.env.NEXT_PUBLIC_DISABLE_3D;
    else process.env.NEXT_PUBLIC_DISABLE_3D = prev;
  });

  it('every play loader asks for a Babylon flag key that is actually enabled', () => {
    const prev = process.env.NEXT_PUBLIC_DISABLE_3D;
    delete process.env.NEXT_PUBLIC_DISABLE_3D;
    try {
      const bad: string[] = [];
      for (const file of playLoaderFiles()) {
        const rel = path.relative(ROOT, file);
        const src = stripComments(fs.readFileSync(file, 'utf8'));
        for (const m of src.matchAll(/isBabylon\(\s*['"]([^'"]+)['"]\s*\)/g)) {
          const key = m[1];
          if (!isBabylon(key)) bad.push(`${rel}: isBabylon('${key}') is false`);
        }
      }
      expect(bad).toEqual([]);
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_DISABLE_3D;
      else process.env.NEXT_PUBLIC_DISABLE_3D = prev;
    }
  });
});
