// Is there a VOCABULARY now, and does every trick ride a clip that actually exists?
//
// The second question is the one that matters most: a trick pointing at an unregistered clip renders the rider in BIND
// POSE, which is the worst-looking bug in this engine and one this repo has already paid for twice.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  SKATE_TRICKS, SNOW_TRICKS, SURF_TRICKS, TRICKS_BY_DISCIPLINE,
  allBoardTricks, trickFor, fitsAir, bestFitting, airTrickFor, scoreTrick, basePts, needsRail,
  type BoardDiscipline,
} from './BoardTricks';

const ROOT = path.resolve(__dirname, '../../..');
const registry = ['clipRegistry.ts', 'clipAliases.ts']
  .map((f) => fs.readFileSync(path.join(ROOT, 'lib/babylon/anim', f), 'utf8')).join('\n');

describe('EVERY trick rides a clip that exists', () => {
  it('no trick names a clip the registry has never heard of', () => {
    const missing = allBoardTricks()
      .filter((t) => !new RegExp(`['"\`]${t.clip}['"\`]`).test(registry))
      .map((t) => `${t.id} -> ${t.clip}`);
    expect(missing, `tricks pointing at unregistered clips: ${JSON.stringify(missing)}`).toEqual([]);
  });

  it('and the list is honest about how few board clips there are', () => {
    // eleven registered board clips, one of them a named trick. The variety is COMBINATION, not new animation.
    const clips = new Set(allBoardTricks().map((t) => t.clip));
    expect(clips.size).toBeLessThanOrEqual(8);
    expect(allBoardTricks().length).toBeGreaterThan(clips.size * 3);
  });
});

describe('there IS a vocabulary now', () => {
  it('each discipline has a real list, not a placeholder', () => {
    for (const d of ['skate', 'snow', 'surf'] as BoardDiscipline[]) {
      expect(TRICKS_BY_DISCIPLINE[d].length, `${d} list`).toBeGreaterThanOrEqual(7);
    }
  });

  it('skate can tell a kickflip from a heelflip — which "GRAB" never could', () => {
    const k = SKATE_TRICKS.find((t) => t.id === 'kickflip')!;
    const h = SKATE_TRICKS.find((t) => t.id === 'heelflip')!;
    expect(Math.sign(k.flipDeg)).toBe(-Math.sign(h.flipDeg));   // opposite flips
    expect(k.label).not.toBe(h.label);
  });

  it('ids and labels are unique within a discipline', () => {
    for (const d of ['skate', 'snow', 'surf'] as BoardDiscipline[]) {
      const ids = TRICKS_BY_DISCIPLINE[d].map((t) => t.id);
      const labels = TRICKS_BY_DISCIPLINE[d].map((t) => t.label);
      expect(new Set(ids).size, `${d} ids`).toBe(ids.length);
      expect(new Set(labels).size, `${d} labels`).toBe(labels.length);
    }
  });

  it('no two tricks in a discipline share the SAME input — one input, one trick', () => {
    for (const d of ['skate', 'snow', 'surf'] as BoardDiscipline[]) {
      const keys = TRICKS_BY_DISCIPLINE[d].map((t) => `${t.dir ?? '-'}+${t.btn}`);
      expect(new Set(keys).size, `${d} inputs`).toBe(keys.length);
    }
  });

  it('a surf list is mostly ON the wave, not in the air — a wave is not a ramp', () => {
    const airs = SURF_TRICKS.filter((t) => t.kind === 'air').length;
    expect(airs).toBeLessThan(SURF_TRICKS.length / 2);
  });

  it('snow spins further than skate — bigger air, longer rotations', () => {
    const maxSkate = Math.max(...SKATE_TRICKS.map((t) => t.spinDeg));
    const maxSnow = Math.max(...SNOW_TRICKS.map((t) => t.spinDeg));
    expect(maxSnow).toBeGreaterThan(maxSkate);
  });
});

describe('the input grammar is the dunk\'s — hold a direction, tap a button', () => {
  it('a direction plus a button resolves to one trick', () => {
    expect(trickFor('skate', 'left', 'A')?.id).toBe('kickflip');
    expect(trickFor('skate', 'right', 'A')?.id).toBe('heelflip');
    expect(trickFor('snow', 'left', 'B')?.id).toBe('method');
  });

  it('a BARE button still does something — every button works before you learn the directions', () => {
    expect(trickFor('skate', null, 'A')?.id).toBe('ollie');
    expect(trickFor('snow', null, 'A')?.id).toBe('straight_air');
  });

  it('an unheld direction falls back to the bare version of that button', () => {
    // 'down' + X is a tailslide on skate; a direction with no entry should not silently do nothing
    expect(trickFor('skate', 'up', 'X')?.id).toBe('noseslide');
    expect(trickFor('skate', 'left', 'X')?.id).toBe('boardslide');   // no left+X, so the bare X
  });

  it('a button with no trick at all returns null rather than guessing', () => {
    expect(trickFor('surf', 'down', 'X')).toBeNull();
  });
});

describe('the air budget is the skill', () => {
  it('a 900 cannot be thrown off a kerb', () => {
    const big = SNOW_TRICKS.find((t) => t.id === 'cork720')!;
    expect(fitsAir(big, 0.2)).toBe(false);
    expect(fitsAir(big, 1.3)).toBe(true);
  });

  it('bestFitting gives the hardest trick the air can actually hold', () => {
    const small = bestFitting('snow', 'Y', 0.35);
    const huge = bestFitting('snow', 'Y', 1.4);
    expect(huge).not.toBeNull();
    if (small) expect(small.difficulty).toBeLessThan(huge!.difficulty);
    expect(huge!.difficulty).toBeGreaterThan(4);
  });

  it('no air at all means no air trick, rather than a bail the player did not cause', () => {
    expect(bestFitting('snow', 'Y', 0)).toBeNull();
  });

  it('a ground trick needs no air', () => {
    const slide = SKATE_TRICKS.find((t) => t.id === 'boardslide')!;
    expect(fitsAir(slide, 0)).toBe(true);
    expect(needsRail(slide)).toBe(true);
    expect(needsRail(SKATE_TRICKS.find((t) => t.id === 'ollie')!)).toBe(false);
  });
});

describe('scoring comes off difficulty, so the table cannot drift from the feel', () => {
  it('a harder trick is worth more', () => {
    const ollie = SKATE_TRICKS.find((t) => t.id === 'ollie')!;
    const tre = SKATE_TRICKS.find((t) => t.id === 'tre')!;
    expect(basePts(tre)).toBeGreaterThan(basePts(ollie) * 2);
  });

  it('a spin is worth more than the same trick without one', () => {
    const fs360 = SKATE_TRICKS.find((t) => t.id === 'fs360')!;
    const bs180 = SKATE_TRICKS.find((t) => t.id === 'bs180')!;
    expect(basePts(fs360)).toBeGreaterThan(basePts(bs180));
  });

  it('UNDER-ROTATION hurts more than it helps — a spin is not a free button', () => {
    const t = SNOW_TRICKS.find((t2) => t2.id === 'snow720')!;
    const clean = scoreTrick(t, 1);
    const sketchy = scoreTrick(t, 0.8);
    expect(sketchy).toBeLessThan(clean * 0.7);      // 0.8 of the rotation pays well under 80%
  });

  it('a completely blown rotation is worth nothing', () => {
    expect(scoreTrick(SNOW_TRICKS[0], 0)).toBe(0);
  });

  it('scores are clamped against silly input', () => {
    const t = SKATE_TRICKS[0];
    expect(scoreTrick(t, 99)).toBe(basePts(t));
    expect(scoreTrick(t, -5)).toBe(0);
  });

  it('every trick is worth something', () => {
    for (const t of allBoardTricks()) expect(basePts(t)).toBeGreaterThan(0);
  });
});

// ANIM-RESIDUAL (2026-09-14): stick forward + A mid-air flashed NOSE MANUAL and froze the rider in its nose grab.
describe('a mid-air press only ever throws an AIR trick', () => {
  it('no discipline, direction, button or air budget resolves to a manual, a grind or a revert', () => {
    const dirs = [null, 'up', 'down', 'left', 'right'] as const;
    for (const d of ['skate', 'snow', 'surf'] as BoardDiscipline[]) for (const dir of dirs) for (const btn of ['A', 'B', 'X', 'Y'] as const) {
      for (const air of [0, 0.25, 0.5, 1.5]) {
        const t2 = airTrickFor(d, dir, btn, air);
        if (t2) expect(t2.kind, `${d} ${dir}+${btn} @${air}`).toBe('air');
      }
    }
  });
  it('up + A in the air is not the nose manual; a bare A is the ollie; a kickflip still needs its direction', () => {
    expect(trickFor('skate', 'up', 'A')?.id).toBe('nosemanual');          // the GROUND link keeps its input
    expect(airTrickFor('skate', 'up', 'A', 0.5)?.id).toBe('ollie');
    // 0.6 s, not 0.5: BOARD-10PHASE P5 rescaled skate's air budget so the pop gates the table, and a kickflip
    // now wants 0.58 s. The assertion is unchanged — a kickflip still needs its direction AND enough air.
    expect(airTrickFor('skate', 'left', 'A', 0.6)?.id).toBe('kickflip');
    expect(airTrickFor('skate', 'up', 'X', 0.9)).toBeNull();                // no rail slide over open air
  });
  it('a held direction the air cannot hold falls back to the best air that fits', () => {
    const t2 = airTrickFor('snow', 'left', 'Y', 0.6);
    expect(t2 === null || t2.airSec <= 0.6).toBe(true);
  });
  it('the press that pops the ollie is spent on the pop (SkateRunMode source)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/babylon/modes/SkateRunMode.ts'), 'utf8');
    expect(src).toMatch(/if \(!rig\.rider\.grounded && !popped\)/);
    expect(src).not.toMatch(/bestFitting\('skate'/);
  });
});
