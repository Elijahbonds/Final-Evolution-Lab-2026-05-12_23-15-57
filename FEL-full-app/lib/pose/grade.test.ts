// grade's "0 false jumps" rule on hand-made event lists (movement play, phase 2, 2026-09-24). REVIEW (2026-09-24): the
// gate counted only take-offs that landed, so a take-off whose flight the reader dropped (lost in the air, past
// MAX_FLIGHT_MS) passed it while a mode had already acted on the take-off. Now every unmatched take-off is false unless
// it may still be in the air when the take ends (`dangling`): no landing, no take-off after it, and less than
// MAX_FLIGHT_MS before the last frame.
import { describe, it, expect } from 'vitest';
import { grade, SPLICE_MS } from './grade';
import { MAX_FLIGHT_MS, type BodyEvent } from './BodyReader';
import { script, hold, jumpBeat } from './streamKit';
import { restPose, synthesize, type PoseFixture } from './synth';

const out = synthesize(script([hold(restPose(), 1.5), jumpBeat(restPose(), 2.4), hold(restPose(), 1.5)]), { seed: 17 });
const fx = { name: 'one jump', frames: out.frames, gt: out.gt, settings: { synth: out.settings }, source: { kind: 'script' } } as unknown as PoseFixture;
const J = out.gt.jumps[0];
const t0 = out.frames[0].t, tEnd = out.frames[out.frames.length - 1].t;

const takeoff = (t: number): BodyEvent => ({ kind: 'takeoff', t, seen: t + 60, feet: 'two', foot: 'both', v0: 2.4, predictedHeightM: 0.29 });
const land = (tOff: number, t: number): BodyEvent => {
  const T = (t - tOff) / 1000;
  return { kind: 'land', t, seen: t + 100, flightMs: T * 1000, heightM: (9.81 * T * T) / 8, firstFoot: 'both' };
};
/** The true jump, read right. */
const real = (): BodyEvent[] => [takeoff(J.takeoff.t), land(J.takeoff.t, J.landing.t)];
const graded = (ev: BodyEvent[]) => grade(fx, [...ev].sort((a, b) => a.t - b.t), null);

describe('grade: false jumps, landed or not', () => {
  it('the stream holds one true jump, with room before it and after it', () => {
    expect(out.gt.jumps).toHaveLength(1);
    expect(J.takeoff.t - 600).toBeGreaterThan(t0 + SPLICE_MS);
    expect(tEnd - MAX_FLIGHT_MS - 100).toBeGreaterThan(J.landing.t + 100);
  });
  it('the true jump read right: no false jump, nothing in the air', () => {
    const g = graded(real());
    expect(g.jumps[0].takeoff && g.jumps[0].land).toBeTruthy();
    expect(g.falseJumps).toEqual([]);
    expect(g.dangling).toBe(0);
  });
  it('a take-off that matches no true jump and lands is false (as before)', () => {
    const t = J.landing.t + 400;
    const g = graded([...real(), takeoff(t), land(t, t + 300)]);
    expect(g.falseJumps.map((x) => x.t)).toEqual([t]);
    expect(g.dangling).toBe(0);
  });
  it('a take-off never landed, with a take-off after it, is false: it cannot still be in the air', () => {
    const t = J.takeoff.t - 600;                                  // dropped before the true jump took off
    const g = graded([takeoff(t), ...real()]);
    expect(g.falseJumps.map((x) => x.t)).toEqual([t]);
    expect(g.dangling).toBe(0);
    expect(g.jumps[0].takeoff!.t).toBe(J.takeoff.t);             // the true jump still matched to its own take-off
  });
  it('a take-off never landed, the last of the take but older than MAX_FLIGHT_MS, is false: no flight lasts that long', () => {
    const t = tEnd - MAX_FLIGHT_MS - 100;
    const g = graded([...real(), takeoff(t)]);
    expect(g.falseJumps.map((x) => x.t)).toEqual([t]);
    expect(g.dangling).toBe(0);
  });
  it('a take-off never landed, the last of the take and inside MAX_FLIGHT_MS of its end, is still in the air: dangling, not false', () => {
    const t = tEnd - 500;
    const g = graded([...real(), takeoff(t)]);
    expect(g.falseJumps).toEqual([]);
    expect(g.dangling).toBe(1);
  });
  it('the true jump\'s own take-off never landed is neither: its row shows the landing missing', () => {
    const g = graded([takeoff(J.takeoff.t)]);
    expect(g.falseJumps).toEqual([]);
    expect(g.dangling).toBe(0);
    expect(g.jumps[0].takeoff).not.toBeNull();
    expect(g.jumps[0].land).toBeNull();
    expect(g.jumps[0].dLandF).toBeNull();                         // unread stays unread, never 0
  });
});
