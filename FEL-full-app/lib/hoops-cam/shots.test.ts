import { describe, expect, it } from 'vitest';
import { ShotReader, type ShotRead } from './shots';
import type { BallObs } from './track';

// The reader on drawn ball paths (no pixels): the ring at (200, 100) with a 10 px half-width (U = 10). Gravity in pixels
// is the ring's own scale: 9.81 m/s² over its 0.2286 m half-width, ×10 px.
const RIM = { x: 200, y: 100, hw: 10, hh: 3 };
const G = (9.81 / 0.2286) * 10;
const FRAME = { w: 400, h: 300 };

type Path = (t: number) => [number, number] | null;
/** A ballistic path from (x0, y0) with (vx, vy) px/s; `after` takes over past a time. */
const arc = (x0: number, y0: number, vx: number, vy: number): Path => (t) => [x0 + vx * t, y0 + vy * t + 0.5 * G * t * t];

function run(path: Path, ms: number, o: { from?: number; reader?: ShotReader; fps?: number } = {}): { reads: ShotRead[]; reader: ShotReader } {
  const reader = o.reader ?? new ShotReader(RIM, FRAME);
  const reads: ShotRead[] = [];
  const dt = 1000 / (o.fps ?? 30);
  let prev: [number, number] | null = null;
  for (let t = 0; t <= ms; t += dt) {
    const p = path(t / 1000);
    let obs: BallObs | null = null;
    if (p) {
      const v = prev ? [(p[0] - prev[0]) / (dt / 1000), (p[1] - prev[1]) / (dt / 1000)] : [0, 0];
      obs = { t: (o.from ?? 0) + t, x: p[0], y: p[1], r: 5, vx: v[0], vy: v[1], coast: false };
    }
    prev = p;
    const r = reader.step((o.from ?? 0) + t, obs);
    if (r) reads.push(r);
  }
  return { reads, reader };
}

// a jumper from (100, 220): up at 380 px/s, through the ring's centre on the way down (vx chosen so)
const tDown = (380 + Math.sqrt(380 * 380 - 4 * (G / 2) * 120)) / G;
const through = (dx: number) => arc(100, 220, (100 + dx) / tDown, -380);

describe('a shot and whether it went in', () => {
  it('a ball that comes down through the ring and into the net is a make, sure', () => {
    const { reads } = run(through(0), 2200);
    expect(reads).toHaveLength(1);
    expect(reads[0]).toMatchObject({ outcome: 'make', sure: true, why: 'through' });
    expect(Math.abs(reads[0].crossU!)).toBeLessThan(0.2);
    expect(reads[0].apexU).toBeGreaterThan(3);
    expect(reads[0].t).toBeLessThan(150);           // the release: the flight's first rising sightings
  });

  it('crossing the ring\'s line 3 half-widths off is a miss, sure; within reach of the ring and out is a rim-out', () => {
    expect(run(through(30), 2200).reads[0]).toMatchObject({ outcome: 'miss', sure: true, why: 'off' });
    // touches down on the ring's end, then pops up and falls outside it
    let bounced = false;
    const rimOut: Path = (t) => {
      const t0 = tDown + 0.04;                              // down onto the ring's end, a few px under its line …
      if (t < t0) return through(13)(t);
      bounced = true;                                       // … and off it, up and away
      const [x0, y0] = through(13)(t0)!;
      const u = t - t0;
      return [x0 + 120 * u, y0 - 160 * u + 0.5 * G * u * u];
    };
    const r = run(rimOut, 2400).reads;
    expect(bounced).toBe(true);
    expect(r[0]).toMatchObject({ outcome: 'miss', why: 'rim_out' });
  });

  it('an air ball (never near the ring) is a miss', () => {
    const r = run(arc(100, 220, 40, -380), 2400).reads;
    expect(r).toHaveLength(1);
    expect(r[0].outcome).toBe('miss');
    expect(['air_ball', 'off']).toContain(r[0].why);
  });

  it('a dribble, a pass or a toss that never gets near the ring\'s height is not a shot', () => {
    expect(run(arc(100, 260, 60, -150), 1500).reads).toEqual([]);
    expect(run(arc(100, 220, 250, -60), 1500).reads).toEqual([]);
  });

  it('lost at the ring after going in: a make, NOT SURE (the page asks)', () => {
    const hidden: Path = (t) => (t < tDown + 0.02 ? through(0)(t) : null);
    const r = run(hidden, 2500).reads;
    expect(r[0]).toMatchObject({ outcome: 'make', sure: false, why: 'lost' });
  });

  it('a ball rising off the ring after coming down on it is a rebound, not a new shot', () => {
    const { reader } = run(through(30), 2200);
    // the same ball bouncing back up off the ring a second later
    const rebound: Path = (t) => (t < 0.3 ? [195, 100 + 300 * t - 0.5 * G * 0] : arc(195, 190, 10, -420)(t - 0.3));
    void rebound;
    const down: Path = (t) => [205, 70 + 200 * t];
    const up: Path = (t) => [205, 115 - 420 * t + 0.5 * G * t * t];
    const before = run(down, 200, { from: 4000, reader }).reads;
    const after = run(up, 900, { from: 4220, reader }).reads;
    expect([...before, ...after]).toEqual([]);
  });

  it('a session ended with a shot in the air closes it NOT SURE', () => {
    const { reader } = run(through(0), 1100);
    const r = reader.flush(1100);
    expect(r).toMatchObject({ sure: false, why: 'lost' });
  });
});
