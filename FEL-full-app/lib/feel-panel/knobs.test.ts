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
import { PROTECT_DRIBBLE_ON, REST_BOUNCE_ON, REST_TEMPO_IDLE, REST_TEMPO_PROTECT, CLIP_LOCK_GAIN, CLIP_LOCK_HZ_MAX, CLIP_LOCK_MAX_MPS, PROTECT_GUARD_ON, GUARD_BACK_M, GUARD_OUT_M, GUARD_DROP_M, GUARD_SEC, GUARD_BAR_X_M, GUARD_BAR_Y_M, GUARD_BAR_Z_M } from '@/lib/babylon/anim/RestDribble';
import { EYES_ON_DEFENDER_ON, READ_RANGE_M, READ_SPEED01, READ_GLANCE_EVERY_SEC, READ_GLANCE_SEC, PROTECT_POSTURE_ON, PROTECT_TURN_DEG, PROTECT_EYES, PROTECT_CHEST_AIM } from '@/lib/babylon/core/HoopsLook';
import { PROTECT_SINK_M, PROTECT_SINK_SEC } from '@/lib/babylon/anim/ProtectSink';
import { MOVE_EASE_ON, MOVE_EASE_SEC, MOVE_EASE_RATE_DEG, MOVE_ARM_RATE_DEG } from '@/lib/babylon/anim/MoveEase';
import { JUMPER_HOP_ON, JUMPER_APEX_AFTER_RELEASE_SEC, JUMPER_MIN_LOAD_SEC, JUMPER_HANG_ON, JUMPER_HANG_SCALE } from '@/lib/babylon/core/JumperHop';
import { BALL_SIDE_SHADE_ON, SHADE_OFFSET_M, SHADE_REACT_SEC, SHADE_SHIFT_MPS, SHADE_FLIP_M, SHADE_RANGE_M, SHADE_RESEED_M } from '@/lib/babylon/core/BallSideShade';

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
    expect([COMBO_OPEN_K, COMBO_GRACE_SEC, GUARD_RANGE_M]).toEqual([0.5, 0.15, 2.0]);
    // hoops-defense-fx
    expect(def('hoops.ballSideShadeOn')).toBe(BALL_SIDE_SHADE_ON ? 1 : 0);
    expect(def('hoops.shadeOffsetM')).toBe(SHADE_OFFSET_M);
    expect(def('hoops.shadeHoldSec')).toBe(SHADE_REACT_SEC);
    expect(def('hoops.shadeSlideMps')).toBe(SHADE_SHIFT_MPS);
    expect(def('hoops.shadeDeadBandM')).toBe(SHADE_FLIP_M);
    expect(def('hoops.shadeRangeM')).toBe(SHADE_RANGE_M);
    expect(def('hoops.shadeReseedM')).toBe(SHADE_RESEED_M);
    expect([BALL_SIDE_SHADE_ON, SHADE_OFFSET_M, SHADE_REACT_SEC, SHADE_SHIFT_MPS, SHADE_FLIP_M, SHADE_RANGE_M, SHADE_RESEED_M]).toEqual([true, 0.5, 0.22, 2.4, 0.08, 2.4, 1.0]);
    // lane/h3-handler (#312 / #314 ports): "Hoops · handle (rest)" and "Hoops · jump shot"
    const pins: [string, number][] = [
      ['hoops.protectDribbleOn', PROTECT_DRIBBLE_ON], ['hoops.restBounceOn', REST_BOUNCE_ON], ['hoops.restTempoIdle', REST_TEMPO_IDLE], ['hoops.restTempoProtect', REST_TEMPO_PROTECT],
      ['hoops.clipLockGain', CLIP_LOCK_GAIN], ['hoops.clipLockHzMax', CLIP_LOCK_HZ_MAX], ['hoops.clipLockMaxMps', CLIP_LOCK_MAX_MPS],
      ['hoops.eyesOnDefenderOn', EYES_ON_DEFENDER_ON], ['hoops.readRangeM', READ_RANGE_M], ['hoops.readSpeed01', READ_SPEED01], ['hoops.readGlanceEverySec', READ_GLANCE_EVERY_SEC], ['hoops.readGlanceSec', READ_GLANCE_SEC],
      ['hoops.protectGuardOn', PROTECT_GUARD_ON], ['hoops.guardBackM', GUARD_BACK_M], ['hoops.guardOutM', GUARD_OUT_M], ['hoops.guardDropM', GUARD_DROP_M], ['hoops.guardSec', GUARD_SEC],
      ['hoops.guardBarXM', GUARD_BAR_X_M], ['hoops.guardBarYM', GUARD_BAR_Y_M], ['hoops.guardBarZM', GUARD_BAR_Z_M],
      ['hoops.protectPostureOn', PROTECT_POSTURE_ON], ['hoops.protectTurnDeg', PROTECT_TURN_DEG], ['hoops.protectEyes', PROTECT_EYES], ['hoops.protectChestAim', PROTECT_CHEST_AIM],
      ['hoops.protectSinkM', PROTECT_SINK_M], ['hoops.protectSinkSec', PROTECT_SINK_SEC],
      ['hoops.moveEaseOn', MOVE_EASE_ON], ['hoops.moveEaseSec', MOVE_EASE_SEC], ['hoops.moveEaseRateDeg', MOVE_EASE_RATE_DEG], ['hoops.moveArmRateDeg', MOVE_ARM_RATE_DEG],
      ['hoops.jumperHopOn', JUMPER_HOP_ON], ['hoops.jumperApexAfterReleaseSec', JUMPER_APEX_AFTER_RELEASE_SEC], ['hoops.jumperMinLoadSec', JUMPER_MIN_LOAD_SEC], ['hoops.jumperHangOn', JUMPER_HANG_ON], ['hoops.jumperHangScale', JUMPER_HANG_SCALE],
    ];
    for (const [id, v] of pins) expect(def(id), id).toBe(v);
    // the ported numbers (#312: REST_TEMPO 1.2 / 1.45, clip lock gain 3 / 2.6 Hz, READ 3.5 m / 0.42, PROTECT_TURN 50°, eyes 0.9, chestAim 0.8,
    // PROTECT_SINK 0.06; #314: MOVE_EASE 0.2 s / 1000°/s / 1800°/s, JUMPER apex +0.03 s, load 0.08 s, hang 0.1) and every feature ON
    expect(pins.map(([, v]) => v)).toEqual([1, 1, 1.2, 1.45, 3, 2.6, 0.4, 1, 3.5, 0.42, 2.4, 0.55, 1, 0.22, 0.06, 0.06, 0.15, 0.15, 1.06, 0.34, 1, 50, 0.9, 0.8, 0.06, 0.18, 1, 0.2, 1000, 1800, 1, 0.03, 0.08, 1, 0.1]);
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
