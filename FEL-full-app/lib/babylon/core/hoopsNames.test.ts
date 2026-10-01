// HOOPS-10 Phase 3: no real people's names in the dunk/hoops UI and data (owner round 1, LEDGER §4; the
// HOOPS-MOTION gate: "0 real people's names in the dunk and hoops UI and data — a grep test over DunkCuts and
// the celebration labels"). The dunks stay homages in the code comments; the player-facing credit is the
// in-fiction FLIGHT NIGHT crew. This is a source scan (stripComments keeps the homage comments from tripping
// it — a comment naming the inspiration is not a credit, and the rule is about what a player reads).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';

const ROOT = path.resolve(__dirname, '../../..');

// The real dunkers whose names were in the player-facing credit fields. A name belongs in a comment (the
// homage), never in `by:`, a label, the HUD, or the poster.
const REAL_DUNKERS = [
  'Brandon Ruffin', 'Vince Carter', 'Jus Fly', 'Justin Darlington', 'Jordan Kilganon',
  'Taurian Fontenette', 'Guy Dupuy', 'Team Flight Brothers', 'Chen Dengxing', 'LeBron', 'Kobe',
];

/** Player-facing hoops data/UI sources a credit could surface from. */
const PLAYER_FACING = [
  'lib/babylon/core/DunkSystem.ts',
  'lib/babylon/core/DunkCuts.ts',
  'lib/babylon/core/DunkLandCelebrate.ts',
];

describe('no real dunker is named in player-facing hoops data (HOOPS-10 phase 3)', () => {
  it('no credit/label field names a real dunker (comments are stripped — the homage stays, the credit goes)', () => {
    const offenders: string[] = [];
    for (const f of PLAYER_FACING) {
      const s = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      for (const name of REAL_DUNKERS) {
        // only string-literal / rendered positions count; stripComments has already dropped the prose
        if (new RegExp(`'[^']*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^']*'`).test(s)) offenders.push(`${f}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the credit that survives is the in-fiction crew, so the poster is never blank', () => {
    const sys = stripComments(fs.readFileSync(path.join(ROOT, 'lib/babylon/core/DunkSystem.ts'), 'utf8'));
    const cuts = stripComments(fs.readFileSync(path.join(ROOT, 'lib/babylon/core/DunkCuts.ts'), 'utf8'));
    expect(sys).toContain("by: 'FLIGHT NIGHT'");
    expect(cuts).toContain("by: 'FLIGHT NIGHT'");
  });
});
