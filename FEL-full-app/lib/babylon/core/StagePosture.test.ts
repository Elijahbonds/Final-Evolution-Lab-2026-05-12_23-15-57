import { describe, expect, it } from 'vitest';
import { stageWindow, stagePose, STAGE_POSTURE, STAGE_LEGS, STAGE_INPUT_IDLE, type StagePostureInput } from './StagePosture';

const S = (o: Partial<StagePostureInput> = {}): StagePostureInput => ({ ...STAGE_INPUT_IDLE, ...o });

describe('StagePosture', () => {
  it('a body with nothing to do idles; one with something to watch WATCHES it', () => {
    expect(stageWindow(S())).toBe('idle');
    expect(stageWindow(S({ watching: true }))).toBe('watch');
    expect(STAGE_POSTURE.watch.eyes).toBe(1);
  });
  it('a routine step reads STEP; the judgement beat takes the body off it', () => {
    expect(stageWindow(S({ stepping: true }))).toBe('step');
    expect(stageWindow(S({ stepping: true, beat: 'hit' }))).toBe('hit');
    expect(stageWindow(S({ stepping: true, beat: 'stumble' }))).toBe('stumble');
  });
  it('a clean hit LIFTS the chest and the chin; a miss closes them', () => {
    expect(STAGE_POSTURE.hit.spine2[0]).toBeLessThan(0);      // thoracic open
    expect(STAGE_POSTURE.hit.eyes).toBe(1);
    expect(STAGE_POSTURE.stumble.forward).toBeGreaterThan(0); // shoulders roll in
    expect(STAGE_POSTURE.stumble.eyes).toBeLessThan(0.2);
  });
  it('the step window stays LIGHT — the routine is the clip’s, not the layer’s', () => {
    expect(STAGE_POSTURE.step.weight).toBeLessThanOrEqual(0.5);
    expect(STAGE_LEGS.step.weight).toBe(0);
    expect(STAGE_POSTURE.step.hipYawKeep).toBe(1);
  });
  it('the result beats outrank everything', () => {
    expect(stageWindow(S({ celebrating: true, beat: 'stumble', swinging: true }))).toBe('celebrate');
    expect(stageWindow(S({ dejected: true, beat: 'hit' }))).toBe('dejected');
    expect(stageWindow(S({ swinging: true, charging: true }))).toBe('swing');
  });
  it('every window has a leg pose and legal weights', () => {
    for (const w of Object.keys(STAGE_POSTURE) as (keyof typeof STAGE_POSTURE)[]) {
      expect(STAGE_LEGS[w]).toBeDefined();
      expect(STAGE_POSTURE[w].weight).toBeGreaterThanOrEqual(0);
      expect(STAGE_POSTURE[w].weight).toBeLessThanOrEqual(1);
    }
    expect(stagePose(S({ stepping: true })).pose).toBe(STAGE_POSTURE.step);
  });
});
