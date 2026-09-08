import { describe, expect, it } from 'vitest';
import { GRAVITY, LOB_CATCH_RADIUS, canCatch, lobApex, lobAt, lobFlightTime, lobVelocity, runTimeToLine } from './DunkLob';

describe('DunkLob — the self-lob arc', () => {
  it('arrives at the catch point at the flight time, exactly', () => {
    const from = { x: 0.2, y: 1.1, z: -4 }, to = { x: 0, y: 2.7, z: -9 };
    for (const tf of [0.8, 1.3, 2.1]) {
      const v = lobVelocity(from, to, tf);
      const p = lobAt(from, v, tf);
      expect(p.x).toBeCloseTo(to.x, 5); expect(p.y).toBeCloseTo(to.y, 5); expect(p.z).toBeCloseTo(to.z, 5);
    }
  });
  it('integrates like the ball sim (gravity 9.81, no drag)', () => {
    const from = { x: 0, y: 1, z: 0 }, v = lobVelocity(from, { x: 0, y: 2.5, z: -5 }, 1.2);
    let p = { ...from }, vel = { ...v }; const dt = 1 / 600;
    for (let i = 0; i < 720; i++) { vel.y -= GRAVITY * dt; p = { x: p.x + vel.x * dt, y: p.y + vel.y * dt, z: p.z + vel.z * dt }; }
    const a = lobAt(from, v, 1.2);
    expect(p.y).toBeCloseTo(a.y, 1); expect(p.z).toBeCloseTo(a.z, 2);
  });
  it('is a real lob: the apex sits above both ends', () => {
    const from = { x: 0, y: 1.1, z: -3 }, to = { x: 0, y: 2.7, z: -9 };
    const v = lobVelocity(from, to, 1.4);
    expect(lobApex(from, v)).toBeGreaterThan(to.y + 0.3);
    expect(v.y).toBeGreaterThan(0);
  });
  it('a longer run-in buys a longer, higher toss', () => {
    const near = lobFlightTime(1.5, 7, false), far = lobFlightTime(5.5, 7, false);
    expect(far).toBeGreaterThan(near + 0.4);
    expect(lobFlightTime(4, 7, true)).toBeGreaterThan(lobFlightTime(4, 7, false));   // a standing thrower ramps into the run
    expect(lobFlightTime(0, 7, false)).toBeGreaterThanOrEqual(0.55);   // the catch beat alone
    expect(lobFlightTime(0, 7, false, 0)).toBeLessThan(0.1);   // the run alone, from the line: nothing to add
  });
  it('the catch is a proximity check on the ball hand', () => {
    expect(canCatch({ x: 0, y: 2.6, z: -9 }, { x: 0.2, y: 2.9, z: -9.2 })).toBe(true);
    expect(canCatch({ x: 0, y: 2.6, z: -9 }, { x: 0, y: 2.6 + LOB_CATCH_RADIUS + 0.05, z: -9 })).toBe(false);
  });
});

describe('runTimeToLine — the hold-run ramp', () => {
  it('holds a run already at the max', () => { expect(runTimeToLine(7, 7, 7, 6)).toBeCloseTo(1, 5); });
  it('ramps 2 → 7 at 6 m/s² then holds', () => {
    // ramp: 5/6 s over (49 − 4)/12 = 3.75 m, then 2.25 m at 7 m/s
    expect(runTimeToLine(6, 2, 7, 6)).toBeCloseTo(5 / 6 + 2.25 / 7, 5);
  });
  it('is shorter than the throw-frame speed said when the run keeps ramping', () => {
    expect(runTimeToLine(5.5, 3.4, 7, 6)).toBeLessThan(5.5 / 3.4 - 0.5);
  });
  it('never divides by zero on a standing start', () => { expect(Number.isFinite(runTimeToLine(4, 0, 7, 6))).toBe(true); });
});

// ── DUNK-GLASS-BOUNCE (2026-09-08) ──────────────────────────────────────────────────────────────────────────────
import { FLOOR_E, FLOOR_FRICTION, GLASS_E_N, GLASS_E_T, bounceLobMinTime, bounceLobVelocity, bounceOntoVelocity, glassLobAt, glassLobVelocity, rimRing } from './DunkLob';

/** The ball sim's rules, stepped: gravity, a floor at `floorY` (restitution e, the roll scrubbed by `fr`), and a panel at
 *  `boardZ` facing +z (normal eN, tangential eT). Returns the path and the contacts. */
function simulate(from: { x: number; y: number; z: number }, v: { x: number; y: number; z: number }, tf: number, opts: { floorY?: number; radius?: number; e?: number; fr?: number; boardZ?: number; eN?: number; eT?: number } = {}) {
  const R = opts.radius ?? 0.12, floorY = opts.floorY ?? 0, e = opts.e ?? FLOOR_E, fr = opts.fr ?? FLOOR_FRICTION;
  let p = { ...from }, vel = { ...v }; const dt = 1 / 600; const bounces: number[] = []; let glass: { x: number; y: number; t: number } | null = null;
  const n = Math.round(tf / dt);
  for (let i = 0; i < n; i++) {
    const prev = { ...p };
    vel.y -= GRAVITY * dt; p = { x: p.x + vel.x * dt, y: p.y + vel.y * dt, z: p.z + vel.z * dt };
    if (p.y - R < floorY && vel.y < 0) { p.y = floorY + R; vel.y = -vel.y * e; vel.x *= fr; vel.z *= fr; bounces.push((i + 1) * dt); }
    if (opts.boardZ != null) { const s = opts.boardZ + R; if (prev.z >= s && p.z < s) { const k = (s - prev.z) / (p.z - prev.z); glass = { x: prev.x + (p.x - prev.x) * k, y: prev.y + (p.y - prev.y) * k, t: (i + 1) * dt }; vel.z = -vel.z * (opts.eN ?? GLASS_E_N); vel.x *= opts.eT ?? GLASS_E_T; vel.y *= opts.eT ?? GLASS_E_T; p.z = s + 1e-4; } }
  }
  return { p, bounces, glass };
}

describe('glassLobVelocity — the off-glass throw', () => {
  const from = { x: 0.1, y: 1.9, z: -6.4 }, to = { x: 0.18, y: 2.8, z: -8.2 }, boardZ = -10.67;
  it('meets the face on the way in and lands on the catch point at tf, exactly', () => {
    for (const tf of [0.8, 1.0, 1.3]) {
      const g = glassLobVelocity(from, to, boardZ, tf)!;
      expect(g).not.toBeNull();
      expect(g.hit.z).toBeCloseTo(boardZ + 0.12, 6);   // the centre at contact, a radius off the face
      expect(g.t1).toBeGreaterThan(0); expect(g.t1).toBeLessThan(tf);
      const at = lobAt(from, g.v, g.t1); expect(at.x).toBeCloseTo(g.hit.x, 6); expect(at.y).toBeCloseTo(g.hit.y, 6);
      const end = glassLobAt(from, g, tf);
      expect(end.x).toBeCloseTo(to.x, 5); expect(end.y).toBeCloseTo(to.y, 5); expect(end.z).toBeCloseTo(to.z, 5);
      expect(g.v.z).toBeLessThan(0);   // thrown at the board
    }
  });
  it('integrates like the ball sim with the panel rebound (the catch radius holds)', () => {
    const tf = 0.95, g = glassLobVelocity(from, to, boardZ, tf)!;
    const s = simulate(from, g.v, tf, { boardZ });
    expect(s.glass).not.toBeNull();
    expect(s.glass!.y).toBeCloseTo(g.hit.y, 1);
    expect(Math.hypot(s.p.x - to.x, s.p.y - to.y, s.p.z - to.z)).toBeLessThan(0.1);
  });
  it('a throw from nearer the line meets the glass lower, over the rim; the rebound reads as a lob back out', () => {
    const near = glassLobVelocity({ x: 0, y: 1.9, z: -6.8 }, to, boardZ, 0.85)!, far = glassLobVelocity({ x: 0, y: 1.9, z: -5.0 }, to, boardZ, 1.3)!;
    expect(near.hit.y).toBeLessThan(far.hit.y);
    expect(near.hit.y).toBeGreaterThan(3.05 + 0.2);   // above the iron
    const back = glassLobAt({ x: 0, y: 1.9, z: -6.8 }, near, near.t1 + 0.1);
    expect(back.z).toBeGreaterThan(boardZ + 0.3);      // coming back out toward the runway
  });
  it('refuses a throw that is not in front of the board', () => {
    expect(glassLobVelocity({ x: 0, y: 1.9, z: -11 }, to, boardZ, 1)).toBeNull();
    expect(glassLobVelocity(from, { x: 0, y: 2.8, z: -11 }, boardZ, 1)).toBeNull();
  });
  it('the restitution is a rebound, not a reflection: the ball comes back slower than it went in', () => {
    const g = glassLobVelocity(from, to, boardZ, 1.0)!;
    expect(GLASS_E_N).toBeLessThan(1); expect(GLASS_E_T).toBeLessThanOrEqual(1);
    const inV = Math.abs(g.v.z), outV = Math.abs(-g.v.z * GLASS_E_N);
    expect(outV).toBeLessThan(inV);
  });
});

describe('bounceLobVelocity — the bounce-bounce self-lob', () => {
  const from = { x: 0.1, y: 1.0, z: -4.4 }, to = { x: 0.18, y: 2.8, z: -8.2 };
  it('one bounce: thrown down, one floor contact where it says, arrives at the catch point at tf', () => {
    const tf = 1.2, b = bounceLobVelocity(from, to, tf, 1)!;
    expect(b).not.toBeNull();
    expect(b.v.y).toBeLessThan(0);                 // thrown DOWN
    expect(b.bounces.length).toBe(1);
    const s = simulate(from, b.v, tf);
    expect(s.bounces.length).toBe(1);
    expect(s.bounces[0]).toBeCloseTo(b.times[0], 1);
    expect(Math.hypot(s.p.x - to.x, s.p.y - to.y, s.p.z - to.z)).toBeLessThan(0.12);
    expect(b.bounces[0].z).toBeLessThan(from.z); expect(b.bounces[0].z).toBeGreaterThan(to.z);   // on the way
  });
  it('two bounces: bounce-bounce then the catch, the ball descending into the hand from its last apex', () => {
    // the hop before the last is 1/e² higher (4.4 m for a 2.8 m catch): a real bounce-bounce is a ~3 s throw
    const min2 = bounceLobMinTime(from, to, 2)!; expect(min2).toBeGreaterThan(2.4); expect(min2).toBeLessThan(3.4);
    const tf = min2 + 0.2, b = bounceLobVelocity(from, to, tf, 2)!;
    expect(b).not.toBeNull();
    expect(b.bounces.length).toBe(2);
    expect(b.apex).toBeGreaterThan(to.y);          // the catch is on the descent
    const s = simulate(from, b.v, tf);
    expect(s.bounces.length).toBe(2);
    expect(Math.hypot(s.p.x - to.x, s.p.y - to.y, s.p.z - to.z)).toBeLessThan(0.15);
    // the second hop is lower than the first (restitution), and shorter along the floor (the scrub)
    expect(b.times[1] - b.times[0]).toBeGreaterThan(0);
    expect(Math.abs(b.bounces[1].z - b.bounces[0].z)).toBeLessThan(Math.abs(b.bounces[0].z - from.z) + 3);
  });
  it('refuses a time it cannot make, and the mode can drop a bounce', () => {
    expect(bounceLobVelocity(from, to, 0.2, 2)).toBeNull();
    expect(bounceLobVelocity(from, to, 0.6, 2)).toBeNull();
    expect(bounceLobVelocity(from, to, 0.9, 1)).toBeNull();      // one bounce up to 2.8 m and back down into the hand needs ~0.95 s
    expect(bounceLobVelocity(from, to, 1.0, 1)).not.toBeNull();
  });
  it('a bounce off a prop top above the hand: thrown UP onto the roof, one contact a radius over it, caught on the way down', () => {
    const min1 = bounceLobMinTime({ x: 0, y: 1.2, z: -4.0 }, { x: 0, y: 2.8, z: -8.1 }, 1, 1.46)!; expect(min1).toBeGreaterThan(1.7);   // up 2 m over the roof and back
    const b = bounceLobVelocity({ x: 0, y: 1.2, z: -4.0 }, { x: 0, y: 2.8, z: -8.1 }, min1 + 0.1, 1, 1.46)!;
    expect(b).not.toBeNull();
    expect(b.v.y).toBeGreaterThan(0);              // up onto the roof
    expect(b.bounces[0].y).toBeCloseTo(1.46 + 0.12, 6);
    const s = simulate({ x: 0, y: 1.2, z: -4.0 }, b.v, min1 + 0.1, { floorY: 1.46 });
    expect(s.bounces.length).toBe(1);
    expect(Math.hypot(s.p.y - 2.8, s.p.z + 8.1)).toBeLessThan(0.12);
  });
  it('refuses a catch below the floor', () => {
    expect(bounceLobVelocity(from, { x: 0, y: 0.1, z: -8 }, 1, 1)).toBeNull();
  });
});

describe('bounceOntoVelocity — the bounce off the car', () => {
  it('pins the one contact to the roof point and reaches the catch at its own time', () => {
    const from = { x: 0.27, y: 0.67, z: -5.2 }, to = { x: 0.18, y: 3.14, z: -7.84 }, roofZ = -7.0, roof = 1.46;
    const b = bounceOntoVelocity(from, to, roofZ, roof)!;
    expect(b).not.toBeNull();
    expect(b.bounces[0].z).toBeCloseTo(roofZ, 2); expect(b.bounces[0].y).toBeCloseTo(roof + 0.12, 6);
    expect(b.v.y).toBeGreaterThan(0);   // tossed UP onto the roof
    const s = simulate(from, b.v, b.tf!, { floorY: roof });
    expect(s.bounces.length).toBe(1);
    expect(Math.hypot(s.p.x - to.x, s.p.y - to.y, s.p.z - to.z)).toBeLessThan(0.15);
    expect(b.tf!).toBeGreaterThan(1.5); expect(b.tf!).toBeLessThan(4);
  });
  it('refuses a roof point the thrower is too far from (a toss over the cap), or off the line', () => {
    expect(bounceOntoVelocity({ x: 0, y: 0.7, z: -1.5 }, { x: 0, y: 3.1, z: -7.84 }, -7.7, 1.46)).toBeNull();   // the contact 0.14 m before the catch: near-vertical, out of reach
    expect(bounceOntoVelocity({ x: 0, y: 0.7, z: -4.7 }, { x: 0, y: 3.1, z: -7.84 }, -4.75, 1.46)).toBeNull();   // at the thrower's feet
  });
});

describe('rimRing', () => {
  it('twelve colliders on the iron, all at rim height', () => {
    const ring = rimRing({ x: 0, y: 3.05, z: -10.28 }, 0.45);
    expect(ring.length).toBe(12);
    for (const p of ring) { expect(p.y).toBe(3.05); expect(Math.hypot(p.x, p.z + 10.28)).toBeCloseTo(0.45, 6); }
  });
});
