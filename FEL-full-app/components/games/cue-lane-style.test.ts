// QA P2-03 (2026-09-27): "The Cypher has faded pads". The cue lane's discs sat straight on the stage (washed out on a
// bright place), passed discs at 45 %, and nothing lit with the beat. Pad contrast ≥ 3:1 against the background at rest,
// and lit on the beat.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FAMILY_COLOR, MOVE_COLOR } from '@/lib/babylon/core/danceTracks';
import { LANE_PLATE_ALPHA, PASSED_CUE_OPACITY, contrastRatio, hitRingStyle, plateOver } from './cue-lane-style';

describe('The Cypher\'s cue lane', () => {
  it('every family and move colour is ≥ 3:1 against the plate, over a white stage and a black one', () => {
    for (const stage of ['#ffffff', '#000000', '#c8b89a']) {   // white, black, the Studio's wooden floor
      const plate = plateOver(stage);
      for (const [k, c] of [...Object.entries(FAMILY_COLOR), ...Object.entries(MOVE_COLOR)]) {
        expect(contrastRatio(c, plate), `${k} on ${stage}`).toBeGreaterThanOrEqual(3);
      }
      expect(contrastRatio('#ffffff', plate)).toBeGreaterThanOrEqual(3);   // the disc's white rim
    }
  });

  it('passed discs stay readable (no longer 45 %)', () => {
    expect(PASSED_CUE_OPACITY).toBeGreaterThanOrEqual(0.7);
  });

  it('the hit ring is steady at rest and lights on the beat', () => {
    const rest = hitRingStyle(0), beat = hitRingStyle(1);
    expect(rest.opacity).toBeGreaterThanOrEqual(0.8);
    expect(beat.opacity).toBe(1);
    expect(beat.boxShadow).not.toBe(rest.boxShadow);
    expect(hitRingStyle(null)).toEqual(rest);
  });

  it('the host draws the plate under the lane and feeds the ring the beat', () => {
    const host = readFileSync(path.resolve(__dirname, 'timing-babylon.tsx'), 'utf8');
    expect(host).toContain("style={{ background: `rgba(0,0,0,${LANE_PLATE_ALPHA})` }}");
    expect(host).toContain("...hitRingStyle(typeof hud.beatPulse === 'number' ? hud.beatPulse : null)");
    expect(host).toContain('opacity: c.in < -0.05 ? PASSED_CUE_OPACITY : 1,');
    expect(LANE_PLATE_ALPHA).toBe(0.75);
  });
});
