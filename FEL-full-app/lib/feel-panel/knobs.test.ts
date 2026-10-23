// feel-panel lane (owner 2026-10-20): the catalogue's defaults ARE the shipped constants, every bound is safe, and every knob is read.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEEL_KNOBS, FEEL_KNOB_BY_ID, clampKnob, stepDecimals } from './knobs';
import { AI_HAND_RANGE_M, AI_HAND_DWELL_SEC, AI_HAND_GAP_SEC } from '@/lib/babylon/core/AiBallHand';
import { HAND_CLEAR_M } from '@/lib/babylon/anim/Dribble';
import { DIST_GREEN_NEAR_M, DIST_GREEN_FAR_M, DIST_GREEN_MAX_NARROW } from '@/lib/babylon/core/ShotWindow';
import { SHOT_CLOCK_1V1_SEC, SHOT_CLOCK_3V3_SEC } from '@/lib/babylon/core/ShotClock';
import { DUNK_RING_QUALITY, DUNK_SHORT_BIAS, DUNK_CLANK_MIN_MPS, DUNK_CLANK_SPAN_MPS } from '@/lib/babylon/core/RimForAll';
import { COMBO_OPEN_K, COMBO_GRACE_SEC } from '@/lib/babylon/anim/comboFlow';
import { GUARD_RANGE_M } from '@/lib/babylon/core/GuardHand';
import { PORTRAIT_HERO_MARGIN } from '@/lib/babylon/modes/netPortraitCam';

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== 'node_modules') out.push(...tsFiles(p)); }
    else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}

describe('the feel knob catalogue', () => {
  it('the #375 numbers are registered with their shipped defaults', () => {
    const def = (id: string) => FEEL_KNOB_BY_ID.get(id)?.def;
    expect(def('hoops.aiHandRangeM')).toBe(AI_HAND_RANGE_M);
    expect(def('hoops.aiHandDwellSec')).toBe(AI_HAND_DWELL_SEC);
    expect(def('hoops.aiHandGapSec')).toBe(AI_HAND_GAP_SEC);
    expect(def('hoops.handClearM')).toBe(HAND_CLEAR_M);
    expect([AI_HAND_RANGE_M, AI_HAND_DWELL_SEC, AI_HAND_GAP_SEC, HAND_CLEAR_M]).toEqual([2.4, 0.35, 0.9, 0.01]);
    // hoops-shot-core
    expect(def('hoops.distGreenNearM')).toBe(DIST_GREEN_NEAR_M);
    expect(def('hoops.distGreenFarM')).toBe(DIST_GREEN_FAR_M);
    expect(def('hoops.distGreenMaxNarrow')).toBe(DIST_GREEN_MAX_NARROW);
    expect(def('hoops.shotClock1v1Sec')).toBe(SHOT_CLOCK_1V1_SEC);
    expect(def('hoops.shotClock3v3Sec')).toBe(SHOT_CLOCK_3V3_SEC);
    expect(def('hoops.dunkRingQuality')).toBe(DUNK_RING_QUALITY);
    expect(def('hoops.dunkShortBias')).toBe(DUNK_SHORT_BIAS);
    expect(def('hoops.dunkClankMinMps')).toBe(DUNK_CLANK_MIN_MPS);
    expect(def('hoops.dunkClankSpanMps')).toBe(DUNK_CLANK_SPAN_MPS);
    // hoops-moves (group "Hoops · handle")
    expect(def('hoops.comboOpenK')).toBe(COMBO_OPEN_K);
    expect(def('hoops.comboGraceSec')).toBe(COMBO_GRACE_SEC);
    expect(def('hoops.guardRangeM')).toBe(GUARD_RANGE_M);
    // tiebreak-cam (group "Tennis · camera")
    expect(def('tennis.portraitHeroMargin')).toBe(PORTRAIT_HERO_MARGIN);
    expect([COMBO_OPEN_K, COMBO_GRACE_SEC, GUARD_RANGE_M]).toEqual([0.5, 0.15, 2.0]);
  });

  it('every row is well formed: unique `<area>.<camelName>` id, min ≤ default ≤ max, the default on the step grid, a source', () => {
    expect(new Set(FEEL_KNOBS.map((k) => k.id)).size).toBe(FEEL_KNOBS.length);
    for (const k of FEEL_KNOBS) {
      expect(k.id, k.id).toMatch(/^[a-z][a-zA-Z0-9]*\.[a-z][a-zA-Z0-9]*$/);
      expect(k.min, k.id).toBeLessThan(k.max);
      expect(k.def, k.id).toBeGreaterThanOrEqual(k.min);
      expect(k.def, k.id).toBeLessThanOrEqual(k.max);
      expect(k.step, k.id).toBeGreaterThan(0);
      expect(clampKnob(k, k.def), k.id).toBe(k.def);
      expect(k.source, k.id).toMatch(/^lib\/\S+\.ts [A-Z][A-Z0-9_]+$/);
      expect(k.label.length, k.id).toBeGreaterThan(0);
    }
  });

  it('each row\'s `source` names a real file that exports that constant', () => {
    for (const k of FEEL_KNOBS) {
      const [file, name] = k.source.split(' ');
      expect(readFileSync(file, 'utf8'), k.id).toMatch(new RegExp(`export const ${name} = `));
    }
  });

  it('every knob is read through feel() somewhere in lib/, and every feel(\'…\') read names a registered knob', () => {
    const reads = new Set<string>();
    for (const f of tsFiles('lib')) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bfeel\('([^']+)'/g)) reads.add(m[1]);
    }
    for (const k of FEEL_KNOBS) expect(reads.has(k.id), `${k.id} is never read`).toBe(true);
    for (const id of reads) expect(FEEL_KNOB_BY_ID.has(id), `feel('${id}') is not in the catalogue`).toBe(true);
  });

  it('clampKnob: finite numbers only, inside the bounds, on the grid', () => {
    const k = FEEL_KNOB_BY_ID.get('hoops.aiHandRangeM')!;
    expect(clampKnob(k, 2.43)).toBe(2.45);
    expect(clampKnob(k, -1)).toBe(k.min);
    expect(clampKnob(k, 1e9)).toBe(k.max);
    expect(clampKnob(k, Number.POSITIVE_INFINITY)).toBeNull();
    expect(clampKnob(k, '3')).toBeNull();
    expect(stepDecimals(0.05)).toBe(2);
    expect(stepDecimals(0.001)).toBe(3);
    expect(stepDecimals(1)).toBe(0);
  });
});
