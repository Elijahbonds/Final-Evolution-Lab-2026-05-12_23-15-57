// A StandardMaterial IN A PBR-LIT SCENE IS A BUG, AND IT KEEPS COMING BACK (2026-09-13).
//
// Three times in one day: Velocity Kart (a #f25f5c kart rendered WHITE, tarmac pale blue), the racing
// trackside layer I wrote myself an hour after reading about it, and Freerun — where seven distinct
// authored colours all clipped to the same white and made the mode look unfinished.
//
// The cause is always identical. These venues light for PBR: hemispheric 0.85 plus a directional at 2.60.
// StandardMaterial multiplies its diffuse by that linearly and clips at white, so a palette that looks
// right in a colour picker cannot survive the rig. `VenueKit.paint` exists precisely for this.
//
// A blanket conversion is not safe to do blind — some of these are deliberately unlit markers, where
// StandardMaterial is the right tool. So this is a RATCHET instead: the current usage is recorded, and the
// count may only go DOWN. It cannot stop somebody converting a file; it can stop the bug spreading to a
// new one, which is what actually happened three times today.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MODES_DIR = join(process.cwd(), 'lib/babylon/modes');

/**
 * Known `new StandardMaterial` count per shipping mode file, measured 2026-09-13.
 *
 * LOWER IS ALWAYS FINE — a file that drops off this list entirely is a win and the test says so. Raising a
 * number, or adding a file, is the thing this exists to catch.
 */
const KNOWN: Record<string, number> = {
  'MixedCombatMode.ts': 6,
  'ThreePointMode.ts': 3,
  'BrainBrawlMode.ts': 3,
  'precisionModes.ts': 2,
  'aimSwingCore.ts': 2,
  'SprintMode.ts': 2,
  'AeroAcesMode.ts': 2,
  'boardCore.ts': 1,
  'ShowdownMode.ts': 1,
  'KarateEndlessMode.ts': 1,
  'DuelMode.ts': 1,
  'AirSessionMode.ts': 1,
};

function counts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of readdirSync(MODES_DIR)) {
    if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
    const n = (readFileSync(join(MODES_DIR, f), 'utf8').match(/new StandardMaterial/g) ?? []).length;
    if (n > 0) out[f] = n;
  }
  return out;
}

describe('the StandardMaterial ratchet', () => {
  const now = counts();

  it('NO MODE FILE GAINS A StandardMaterial', () => {
    for (const [file, n] of Object.entries(now)) {
      const allowed = KNOWN[file] ?? 0;
      expect(n, `${file} went from ${allowed} to ${n}. In a PBR-lit venue this clips to white — `
        + 'use VenueKit.paint, or add the file to KNOWN with a comment saying why it must be unlit.')
        .toBeLessThanOrEqual(allowed);
    }
  });

  it('and no NEW file starts using one', () => {
    const fresh = Object.keys(now).filter((f) => !(f in KNOWN));
    expect(fresh, `new StandardMaterial users: ${fresh.join(', ')}`).toEqual([]);
  });

  it('the ratchet is honest about files that have been fixed', () => {
    // not a failure — a note, so the KNOWN table gets tidied rather than rotting
    const fixed = Object.keys(KNOWN).filter((f) => !(f in now));
    if (fixed.length) console.info(`[RATCHET] fixed since the table was written: ${fixed.join(', ')}`);
    expect(Array.isArray(fixed)).toBe(true);
  });

  it('the modes fixed today stay fixed', () => {
    // Freerun and the trackside layer were both converted on 2026-09-13 and must not regress
    expect(now['FreeRunMode.ts'] ?? 0).toBe(0);
  });
});
