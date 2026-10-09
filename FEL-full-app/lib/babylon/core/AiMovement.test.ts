// HOOPS MOTION phase 3b — the AI moves with the hero's weight: CourtMovement's accel 26 / decel 34, the sprint flag honoured, and no
// frame's change of velocity over 34 m/s² whatever a bang-bang brain asks for.
import { describe, expect, it } from 'vitest';
import { AiMover, AI_ACCEL, AI_BRAKE, AI_DECEL, AI_SPRINT_X, AI_PLANT_MPS, AccelFollower, driveCruiseMps, driveCruiseFrom, driveFraction, driveSecFor } from './AiMovement';
import { CourtMovement, DEFAULT_MOVEMENT } from './CourtMovement';

const DT = 1 / 60;
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Drive a mover with a per-frame intent; returns every frame's speed and |Δv| / dt. */
function drive(m: AiMover, frames: number, intent: (i: number) => { moveX: number; moveY: number; sprint?: boolean }, dt = DT) {
  const speeds: number[] = [], acc: number[] = [];
  let px = m.vel.x, pz = m.vel.z;
  for (let i = 0; i < frames; i++) {
    m.stepIntent(dt, intent(i));
    speeds.push(Math.hypot(m.vel.x, m.vel.z));
    acc.push(Math.hypot(m.vel.x - px, m.vel.z - pz) / dt); px = m.vel.x; pz = m.vel.z;
  }
  return { speeds, acc };
}

describe('AiMover: an AI body on the hero\'s model', () => {
  it('starts at the hero\'s accel (26 m/s²), never in one frame, and tops out at its run speed', () => {
    const m = new AiMover(3.6);
    const { speeds, acc } = drive(m, 60, () => ({ moveX: 1, moveY: 0 }));
    expect(speeds[0]).toBeLessThanOrEqual(AI_ACCEL * DT + 1e-9);                 // was 3.6 on the first frame (216 m/s²)
    expect(Math.max(...acc)).toBeLessThanOrEqual(AI_ACCEL + 1e-6);
    expect(speeds[speeds.length - 1]).toBeCloseTo(3.6, 6);
    expect(speeds.findIndex((v) => v >= 3.6 - 1e-6)).toBeGreaterThan(6);         // about 0.14 s to the top
  });
  it('stops at the hero\'s decel (34 m/s²): 3.6 m/s to a stand in about 0.11 s, not a frame', () => {
    const m = new AiMover(3.6);
    drive(m, 60, () => ({ moveX: 1, moveY: 0 }));
    const { speeds, acc } = drive(m, 30, () => ({ moveX: 0, moveY: 0 }));
    expect(Math.max(...acc)).toBeLessThanOrEqual(AI_DECEL + 1e-6);
    const stopAt = speeds.findIndex((v) => v < 1e-6);
    expect(stopAt).toBeGreaterThanOrEqual(5); expect(stopAt).toBeLessThanOrEqual(8);
  });
  it('honours the sprint flag: the sprint top is AI_SPRINT_X of the run, and letting it go bleeds back at ≤ 34 m/s²', () => {
    const m = new AiMover(3.8);
    const up = drive(m, 120, () => ({ moveX: 0, moveY: 1, sprint: true }));
    expect(up.speeds[up.speeds.length - 1]).toBeCloseTo(3.8 * AI_SPRINT_X, 6);
    const down = drive(m, 30, () => ({ moveX: 0, moveY: 1, sprint: false }));
    expect(down.speeds[0]).toBeGreaterThan(3.8);                                 // not a snap to the run top
    expect(Math.max(...down.acc)).toBeLessThanOrEqual(AI_DECEL + 1e-6);
    expect(down.speeds[down.speeds.length - 1]).toBeCloseTo(3.8, 6);
  });
  it('a reversal is a plant: a hard brake at ≤ 34 m/s² through zero, then the new way — he comes back (CourtMovement\'s heading lerp never did)', () => {
    const m = new AiMover(3.6);
    drive(m, 60, () => ({ moveX: 1, moveY: 0 }));
    let planted = 0; let px = m.vel.x, pz = m.vel.z, worst = 0; const xs: number[] = [];
    for (let i = 0; i < 40; i++) {
      const st = m.stepIntent(DT, { moveX: -1, moveY: 0.0 }); if (st.planting) planted++;
      worst = Math.max(worst, Math.hypot(m.vel.x - px, m.vel.z - pz) / DT); px = m.vel.x; pz = m.vel.z; xs.push(m.vel.x);
    }
    expect(worst).toBeLessThanOrEqual(AI_DECEL + 1e-6);
    expect(planted).toBeGreaterThanOrEqual(3);                                   // the plant is a real beat (> AI_PLANT_MPS against the wish)
    expect(xs.findIndex((x) => x <= -3.6 + 1e-6)).toBeLessThan(18);            // 3.6 → −3.6 in ≈ 0.25 s
    expect(m.vel.x).toBeCloseTo(-3.6, 6);
    // the hero's CourtMovement, asked the same (nearly) opposite way, keeps running the old way — why the AI steers in velocity space
    const hero = new CourtMovement({ ...DEFAULT_MOVEMENT, maxSpeed: 4.32, jogFactor: 3.6 / 4.32 });
    for (let i = 0; i < 60; i++) hero.update(DT, 1, 0, false);
    for (let i = 0; i < 60; i++) hero.update(DT, -1, 0.05, false);
    expect(hero.vel.x).toBeGreaterThan(0);
    expect(AI_PLANT_MPS).toBeGreaterThan(0);
  });
  it('a 90° turn at speed is an arc: the speed dips and recovers, never harder than 34 m/s²', () => {
    const m = new AiMover(4.2);
    drive(m, 60, () => ({ moveX: 1, moveY: 0 }));
    const t = drive(m, 40, () => ({ moveX: 0, moveY: 1 }));
    expect(Math.max(...t.acc)).toBeLessThanOrEqual(AI_DECEL + 1e-6);
    expect(Math.min(...t.speeds)).toBeGreaterThan(2.5); expect(Math.min(...t.speeds)).toBeLessThan(4.2);
    expect(m.vel.z).toBeCloseTo(-4.2, 6);
  });
  it('a bang-bang brain (random unit intents, stops and sprints every few frames): no frame over 34 m/s², at 30, 60 and 144 fps', () => {
    for (const fps of [30, 60, 144]) {
      const rand = rng(fps);
      const m = new AiMover(4.2);
      let cur = { moveX: 0, moveY: 0, sprint: false };
      const { acc } = drive(m, fps * 20, (i) => {
        if (i % Math.max(2, Math.round(fps / 8)) === 0) {
          const r = rand();
          if (r < 0.2) cur = { moveX: 0, moveY: 0, sprint: false };
          else { const a = rand() * 2 * Math.PI; cur = { moveX: Math.cos(a), moveY: Math.sin(a), sprint: rand() < 0.4 }; }
        }
        return cur;
      }, 1 / fps);
      expect(Math.max(...acc), `${fps} fps`).toBeLessThanOrEqual(AI_DECEL + 1e-6);
    }
  });
  it('a wish in m/s (an attacker\'s own) moves at that speed; speedScale multiplies the tops; stop() stands him still', () => {
    const m = new AiMover(4.6);
    for (let i = 0; i < 90; i++) m.step(DT, { x: 0, z: -2.0 });
    expect(Math.hypot(m.vel.x, m.vel.z)).toBeCloseTo(2.0, 6);
    expect(m.vel.z).toBeLessThan(0);
    const b = new AiMover(4.2); b.speedScale = 1.25;
    for (let i = 0; i < 120; i++) b.stepIntent(DT, { moveX: 1, moveY: 0 });
    expect(b.vel.x).toBeCloseTo(4.2 * 1.25, 6);
    b.stop(); expect(b.vel.length()).toBe(0);
  });
  it('the numbers are the hero\'s: accel 26 and decel 34 (DEFAULT_MOVEMENT), a sprint AI_SPRINT_X of the run', () => {
    expect(AI_ACCEL).toBe(DEFAULT_MOVEMENT.accel); expect(AI_DECEL).toBe(DEFAULT_MOVEMENT.decel);
    expect(AI_ACCEL).toBe(26); expect(AI_DECEL).toBe(34); expect(AI_SPRINT_X).toBeGreaterThan(1);
    expect(AI_BRAKE).toBeLessThan(AI_DECEL); expect(AI_BRAKE).toBeGreaterThanOrEqual(AI_DECEL - 1);   // the mover's brake: a margin under the line, no more
  });
});

describe('the scripted drive at the same weight (driveFraction, AccelFollower)', () => {
  it('keeps the clock and the arrival — the whole length at totalSec — and starts from a stand at ≤ 26 m/s²', () => {
    for (const [T, L] of [[0.8, 2], [1.0, 5.4], [1.6, 8.64], [1.6, 12]] as const) {
      expect(driveFraction(T, T, L)).toBeCloseTo(1, 9);
      expect(driveFraction(0, T, L)).toBe(0);
      const pos = (t: number) => driveFraction(t, T, L) * L;
      let vPrev = 0, worst = 0;
      for (let t = DT; t <= T + 1e-9; t += DT) { const v = (pos(t) - pos(t - DT)) / DT; worst = Math.max(worst, (v - vPrev) / DT); vPrev = v; }
      expect(worst).toBeLessThanOrEqual(AI_ACCEL + 0.5);                          // (the discrete ramp's first frame)
      expect(vPrev).toBeCloseTo(driveCruiseMps(T, L), 1);                        // it arrives at its cruise
      expect(driveCruiseMps(T, L)).toBeGreaterThanOrEqual(L / T - 1e-9);         // a little faster than the old average, to arrive on time
    }
  });
  it('(3b review) from the speed he has: a backpedal, a chase or a run across the line starts the drive at ≤ 34 m/s² and still arrives on the clock', () => {
    // the drive was a stand start whatever he was doing: 2.88 m/s backpedalling → 0.22 m/s toward the rim in one frame (186 m/s², rC)
    for (const [L, T0, v0, vLat] of [[3.1, 0.8, -2.88, 0], [3.1, 0.8, -3.8, 0], [4.0, 0.8, -4.49, 1.2], [5.4, 1.0, 2.5, -2.0], [2.2, 0.8, 4.5, 0], [8.6, 1.6, 0, 3.0]] as const) {
      const T = driveSecFor(L, T0, v0);
      expect(T, `${L} m from ${v0}`).toBeGreaterThanOrEqual(T0);
      expect(driveCruiseFrom(T, L, v0), `${L} m from ${v0}`).not.toBeNull();
      expect(driveCruiseFrom(T, L, v0)!).toBeLessThanOrEqual(driveCruiseMps(T0, L) + 1e-6);   // never a faster cruise than the stand start's
      expect(driveFraction(T, T, L, undefined, v0)).toBeCloseTo(1, 9);                           // the whole length at the (lengthened) clock
      // the root as the mode draws it: along the drive by the profile, across it by the bend seeded with his sideways speed
      const bend = new AccelFollower(); bend.reset(0, vLat);
      const pos = (t: number) => driveFraction(t, T, L, undefined, v0) * L;
      let pa = 0, pl = 0, va = v0, vl = vLat, worst = 0;
      for (let t = DT; t <= T + 1e-9; t += DT) {
        const a = pos(t), l = bend.step(0, DT);
        const nva = (a - pa) / DT, nvl = (l - pl) / DT;
        worst = Math.max(worst, Math.hypot(nva - va, nvl - vl) / DT);
        pa = a; pl = l; va = nva; vl = nvl;
      }
      expect(worst, `${L} m from ${v0} (across ${vLat})`).toBeLessThanOrEqual(34 + 0.5);
    }
    // at v0 = 0 it is the stand-start ramp exactly
    for (const t of [0.1, 0.3, 0.7]) expect(driveFraction(t, 1.0, 5.4, undefined, 0)).toBeCloseTo(driveFraction(t, 1.0, 5.4), 12);
  });
  it('the bend follows its target without a step: a defender stepping into the corridor moves the line at ≤ 18 m/s², ≤ 3 m/s', () => {
    const b = new AccelFollower();
    let prevV = 0, worstA = 0, worstV = 0; const xs: number[] = [];
    for (let i = 0; i < 120; i++) { const target = i < 10 ? 0 : i < 50 ? 0.9 : -0.9; b.step(target, DT); worstA = Math.max(worstA, Math.abs(b.vel - prevV) / DT); worstV = Math.max(worstV, Math.abs(b.vel)); prevV = b.vel; xs.push(b.value); }
    expect(worstA).toBeLessThanOrEqual(18 + 1e-6); expect(worstV).toBeLessThanOrEqual(3 + 1e-6);
    expect(xs[49]).toBeCloseTo(0.9, 1); expect(xs[119]).toBeCloseTo(-0.9, 1);   // 1.8 m across at ≤ 3 m/s: ≈ 0.75 s
  });
});


describe('the body is where it is (AiMover.observe)', () => {
  it('a runner held up (a body in the lane, a clamp) takes the speed he really had: freed, he accelerates from it at ≤ 26 m/s², never jumps to his top', () => {
    // the stop at the wall is the wall's; everything the mover does itself stays inside the accel
    const m2 = new AiMover(4.2); const p2 = { x: 0, z: 0 }; const freedSpeeds: number[] = [];
    for (let i = 0; i < 90; i++) { m2.observe(p2, DT); const st = m2.stepIntent(DT, { moveX: 1, moveY: 0 }); if (i >= 30 && i < 60) continue; p2.x += st.vel.x * DT; if (i >= 60) freedSpeeds.push(st.vel.length()); }
    expect(freedSpeeds[0]).toBeLessThanOrEqual(26 * DT * 1.01);   // he starts again from a stand, not from 4.2
    for (let k = 1; k < freedSpeeds.length; k++) expect(freedSpeeds[k] - freedSpeeds[k - 1]).toBeLessThanOrEqual(26 * DT + 1e-9);
  });
  it('a push (a body shoved) becomes his velocity and bleeds off at ≤ 34 m/s²; a teleport (a reset) is not adopted', () => {
    const m = new AiMover(3.8); const pos = { x: 0, z: 0 };
    m.observe(pos, DT); m.stepIntent(DT, { moveX: 0, moveY: 0 });
    pos.x += 0.03;                                               // shoved 3 cm in a frame (1.8 m/s)
    m.observe(pos, DT); expect(m.vel.x).toBeCloseTo(1.8, 6);
    const st = m.stepIntent(DT, { moveX: 0, moveY: 0 }); expect(st.vel.x).toBeCloseTo(1.8 - AI_BRAKE * DT, 6);
    pos.x += 3;                                                  // a reset: 180 m/s in a frame
    const before = m.vel.x; m.observe(pos, DT); expect(m.vel.x).toBe(before);
  });
  it('a physics body observed once per render (3b review): several updates between two moves of the root keep its speed — qaSpeed=4 drove the 1v1 rival at 0.43 m/s', () => {
    // the root moves only in the physics step inside scene.render: N updates a render, the first after the step sees the travel
    for (const N of [1, 2, 4]) {
      const m = new AiMover(3.6); const pos = { x: 0, z: 0 }; let frame = 0; const speeds: number[] = [];
      for (let r = 0; r < 120; r++) {
        let setVel = 0;
        for (let u = 0; u < N; u++) { m.observe(pos, DT, frame); setVel = m.stepIntent(DT, { moveX: 1, moveY: 0 }).vel.x; }
        pos.x += setVel * DT; frame++;   // the physics step moves him by the velocity the mode set, once
        speeds.push(setVel);
      }
      expect(speeds[speeds.length - 1], `qaSpeed ${N}`).toBeCloseTo(3.6, 6);   // was 26·dt ≈ 0.43 at N = 4 (sub-updates 2..N read no travel)
    }
    // without the stamp, a root that did not move between two updates reads as stopped (the 3v3 bodies move in every update)
    const k = new AiMover(3.6); const p = { x: 0, z: 0 };
    for (let i = 0; i < 60; i++) { k.observe(p, DT); p.x += k.stepIntent(DT, { moveX: 1, moveY: 0 }).vel.x * DT; }
    k.observe(p, DT); k.observe(p, DT); expect(k.vel.x).toBe(0);
  });
});
