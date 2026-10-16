// H2b (hoops-motion plan §4.12): the step-back's hop is the same hop whatever the left stick is doing. Thrown with the stick still
// pushed at the rim, the stick used to STEER the backward hop round at the capped turn rate instead of braking it: the body ran
// backwards at 3.7 m/s for over a second and turned its back to the rim (180° by 0.4 s, both trees, 1v1 and 3v3 in the H2b reel).
import { describe, expect, it } from 'vitest';
import { DribbleController } from './BasketballCore';

const DT = 1 / 60;
const wrap = (a: number) => { let d = a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
/** Jog at the rim (facing −z: the stick's up is forward), step back, then hold the stick at (x, y) for `frames`. */
function stepBackWith(x: number, y: number, frames = 60) {
  const d = new DribbleController(); d.setFacing(Math.PI);
  for (let i = 0; i < 40; i++) d.update(DT, 0, 0.5, false);
  const f0 = d.update(DT, 0, 0.5, false).facingRad;
  d.stepBack(0, -1, false);   // the rim is −z
  const rows: { t: number; yaw: number; vz: number; z: number }[] = []; let z = 0;
  for (let i = 1; i <= frames; i++) { const r = d.update(DT, x, y, false); z += d.vel.z * DT; rows.push({ t: i * DT, yaw: wrap(r.facingRad - f0), vz: d.vel.z, z }); }
  return rows;
}

describe('the step-back hop is committed (CourtMovement.ignoreStickFor)', () => {
  it('with the stick held at the rim the hop is the stick-home hop, frame for frame, and the chest never leaves the rim', () => {
    const held = stepBackWith(0, 0.5), home = stepBackWith(0, 0);
    const n = Math.round(DribbleController.STEPBACK_COMMIT_SEC / DT);
    for (let i = 0; i < n; i++) { expect(held[i].vz).toBeCloseTo(home[i].vz, 9); expect(Math.abs(held[i].yaw)).toBeLessThan(1e-9); }
    expect(held[n - 1].z).toBeGreaterThan(0.3);                                   // it did hop back (+z, away from the rim)…
    expect(Math.max(...held.map((r) => Math.abs(r.yaw)))).toBeLessThan(0.01);   // …and never turned round (it went 180° before)
  });
  it('after the hop the held stick takes over from rest: the body comes back AT the rim (it ran away from it before)', () => {
    const held = stepBackWith(0, 0.5);
    const after = held.filter((r) => r.t > DribbleController.STEPBACK_COMMIT_SEC + 0.2);
    expect(after.every((r) => r.vz < -1)).toBe(true);
  });
  it('a stick held off-axis turns the body only to the stick, after the hop', () => {
    const held = stepBackWith(0.15, 0.5);
    for (const r of held) if (r.t <= DribbleController.STEPBACK_COMMIT_SEC) expect(Math.abs(r.yaw)).toBeLessThan(1e-9);
    const stickYaw = Math.atan2(0.15, 0.5);   // 17°: where the stick points, off the rim line
    expect(Math.max(...held.map((r) => Math.abs(r.yaw)))).toBeLessThan(stickYaw + 0.02);
  });
});
