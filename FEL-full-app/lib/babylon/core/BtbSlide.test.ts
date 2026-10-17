// H2 (owner, 2026-10-16: "add a curry slide like behind the back"): the BTB slide's body — DribbleController.slide — travels.
// Thrown SET (the stick home), a hop written as a velocity was bled by the stop in a step: the first reel measured 0.26 m in 0.9 s.
// The hop is committed now (CourtMovement.holdFor): it leaves after the clip's load and holds its speed through the skip.
import { describe, expect, it } from 'vitest';
import { DribbleController } from './BasketballCore';
import { CourtMovement, DEFAULT_MOVEMENT } from './CourtMovement';

const DT = 1 / 60;
function slideTravel(side: 'left' | 'right', stick: [number, number] = [0, 0], frames = 54): { x: number; z: number; facing: number } {
  const d = new DribbleController();
  d.setFacing(Math.PI);   // facing −z (the rim at −z): the athlete's right is −x
  const f0 = d.facing;
  d.slide(side, 0, -1, false);
  let x = 0, z = 0;
  for (let i = 0; i < frames; i++) { d.update(DT, stick[0], stick[1], false); x += d.vel.x * DT; z += d.vel.z * DT; }
  return { x, z, facing: d.facing - f0 };
}

describe('the BTB slide hop (DribbleController.slide)', () => {
  it('thrown set, it travels ≈ 0.75 m sideways the ball\'s way in 0.9 s (the stop no longer bleeds it in a step)', () => {
    const r = slideTravel('left');   // facing −z, the athlete's LEFT is +x
    expect(r.x).toBeGreaterThan(0.65); expect(r.x).toBeLessThan(1.1);
    expect(Math.abs(r.facing)).toBeLessThan(1e-9);   // the chest stays on the man
  });
  it('it gives a little ground away from the rim, never toward it', () => {
    const r = slideTravel('right');
    expect(r.x).toBeLessThan(-0.65);
    expect(r.z).toBeGreaterThan(0.1);   // the rim is at −z: away is +z
  });
  it('the stick cannot rewrite the hop while it is committed (from the hop\'s first frame to the end of its hold)', () => {
    // frames 0–3 are the load (SLIDE_DELAY_SEC 0.06: the stick still moves the body there); the hop leaves on frame 4, held to 0.30 s
    const hop = (stick: [number, number]) => slideTravel('left', stick, 18).x - slideTravel('left', stick, 4).x;
    expect(hop([-1, 0])).toBeCloseTo(hop([0, 0]), 9);
    expect(hop([0, 0])).toBeGreaterThan(0.6);   // 3 m/s for ~0.23 s
  });
});

describe('CourtMovement.holdFor', () => {
  it('keeps the written velocity and the facing, then the update is the old one again', () => {
    const m = new CourtMovement({ ...DEFAULT_MOVEMENT });
    m.vel.set(3, 0, 0); m.facing = 1.2; m.holdFor(0.1);
    for (let i = 0; i < 5; i++) m.update(DT, 0, 0, false);
    expect(m.vel.x).toBeCloseTo(3, 9); expect(m.facing).toBeCloseTo(1.2, 9); expect(m.holding).toBe(true);
    for (let i = 0; i < 10; i++) m.update(DT, 0, 0, false);
    expect(m.holding).toBe(false); expect(m.vel.x).toBeLessThan(3);   // released, the stop takes it
  });
  it('stop() clears it', () => { const m = new CourtMovement({ ...DEFAULT_MOVEMENT }); m.vel.set(3, 0, 0); m.holdFor(1); m.stop(); expect(m.holding).toBe(false); expect(m.vel.length()).toBe(0); });
});
