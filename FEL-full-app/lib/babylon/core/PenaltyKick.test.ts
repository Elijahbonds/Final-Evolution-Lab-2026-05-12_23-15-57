import { describe, it, expect } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { launchKick, frameHit, judgeKick, kickZone, GOAL, OVER_BAR_FROM, BALL_R } from './PenaltyKick';
import { SoccerBall, GRASS } from './SoccerBall';

const SPOT = { x: 0, y: 0.11, z: 0 };
/** Fly a kick on the real ball until it crosses the line or stops; return where it crossed. */
function fly(target: { x: number; y: number }, power: number, opts = {}, wind?: Vector3) {
  const m = { position: new Vector3(SPOT.x, SPOT.y, SPOT.z) }; const b = new SoccerBall(m, GRASS);
  const { vel, spin } = launchKick(SPOT, target, power, opts); b.launch(new Vector3(SPOT.x, SPOT.y, SPOT.z), vel, spin);
  let t = 0, hit: string | null = null; const prev = b.pos.clone();
  while (b.active && t < 4 && b.pos.z < GOAL.z) {
    prev.copyFrom(b.pos);
    if (wind) b.vel.addInPlace(wind.scale(GRASS.dragK * 2.5 * b.vel.subtract(wind).length() * (1 / 120)));
    b.step(1 / 120); t += 1 / 120;
    const h = frameHit(prev, b.pos); if (h && !hit) { hit = h.kind; b.deflect(h.normal, 0.65); }
  }
  return { x: b.pos.x, y: b.pos.y, z: b.pos.z, hit, t };
}

describe('PenaltyKick — the PES read', () => {
  it('a driven kick at a target arrives near it (the elevation solve is right)', () => {
    for (const [tx, ty] of [[2.5, 1.8], [-3, 0.6], [0, 1.2]] as const) {
      const r = fly({ x: tx, y: ty }, 0.6);
      expect(r.z).toBeGreaterThanOrEqual(GOAL.z - 0.1);
      expect(Math.abs(r.x - tx)).toBeLessThan(0.35); expect(Math.abs(r.y - ty)).toBeLessThan(0.45);
    }
  });
  it('the meter has zones and OVER means over: full power sails the bar, top bins stays under it', () => {
    expect(kickZone(0.2)).toBe('SOFT'); expect(kickZone(0.6)).toBe('DRIVEN'); expect(kickZone(0.85)).toBe('TOP BINS'); expect(kickZone(0.95)).toBe('OVER');
    const over = fly({ x: 2.6, y: 2.0 }, 1.0), bins = fly({ x: 2.6, y: 2.0 }, OVER_BAR_FROM - 0.02);
    expect(judgeKick(over, 0, 0.9, false)).toBe('over');
    expect(judgeKick(bins, -2, 0.9, false)).toBe('goal');
  });
  it('a curled finesse shot bends: the same target, opposite curls, opposite sides of it', () => {
    const l = fly({ x: 1.5, y: 1.0 }, 0.7, { curl: -1 }), r = fly({ x: 1.5, y: 1.0 }, 0.7, { curl: 1 });
    expect(r.x - l.x).toBeGreaterThan(0.5);
  });
  it('the chip floats high and slow and still drops under the bar', () => {
    const c = fly({ x: 0, y: 1.0 }, 0.5, { chip: true });
    expect(c.t).toBeGreaterThan(0.75); expect(c.y).toBeLessThan(GOAL.barY - BALL_R); expect(c.y).toBeGreaterThan(0.3);
  });
  it('the frame is a thing: a ball at the post hits the post, at the bar the bar, and deflects out', () => {
    const post = fly({ x: GOAL.halfW - 0.02, y: 1.0 }, 0.6), bar = fly({ x: 0, y: GOAL.barY - 0.02 }, 0.6);
    expect(post.hit).toBe('post'); expect(bar.hit).toBe('bar');
    expect(frameHit({ x: 0, y: 1, z: 5 }, { x: 0, y: 1, z: 5.5 })).toBeNull();
  });
  it('the keeper saves what he reaches, and only under the bar', () => {
    expect(judgeKick({ x: 1.5, y: 1.0, z: GOAL.z }, 1.2, 0.9, false)).toBe('saved');
    expect(judgeKick({ x: 1.5, y: 1.0, z: GOAL.z }, -1.2, 0.9, false)).toBe('goal');
    expect(judgeKick({ x: 3.9, y: 1.0, z: GOAL.z }, -1.2, 0.9, false)).toBe('wide');
    expect(judgeKick({ x: 0, y: 1.0, z: 6 }, 0, 0.9, true)).toBe('short');
  });
  it('a crosswind is physics: the same kick lands off its line downwind', () => {
    const still = fly({ x: 0, y: 1.2 }, 0.6), gust = fly({ x: 0, y: 1.2 }, 0.6, {}, new Vector3(4, 0, 0));
    expect(gust.x - still.x).toBeGreaterThan(0.15);
  });
});
