// HOOPS MOTION phase 3 (review of 3a): THE LEFT-STICK CROSSOVER'S HAND. On a crossover frame DribbleController.cutTo turns the
// facing onto the cut, and 1v1 wrote that facing (face()) BEFORE it asked which side the cut went to — so the cut had no lateral part
// left and the side was float noise (±1e-16, or exactly 0 = 'left'): the right hand half the time (measured, 199 of 400). The side is
// read against the facing the body had BEFORE the cut, as 3v3 always did. Replayed here through the shipped controller.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DribbleController } from './BasketballCore';
import { athleteRight, sideOfVector } from '../anim/athleteSide';

const DT = 1 / 60;
/** mulberry32: a seeded stream, so the 400 cuts are the same on every run */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Stick-space (x right, y up = −z on court) for a world planar direction. */
const stickOf = (x: number, z: number, mag: number): [number, number] => [x * mag, -z * mag];

describe('the left-stick crossover goes to the hand on the side the cut goes to (1v1 and 3v3 read the pre-cut facing)', () => {
  it('replayed through DribbleController: 400 random crossovers, the pre-cut read names the cut\'s side every time; the post-face read is noise', () => {
    const rand = rng(7);
    let fired = 0, agree = 0, degenerate = 0;
    for (let n = 0; n < 400; n++) {
      const base = rand() * 2 * Math.PI;
      const legA = base + (rand() < 0.5 ? -1 : 1) * (62 + 16 * rand()) * Math.PI / 180;
      const legB = base + (legA > base ? -1 : 1) * (62 + 16 * rand()) * Math.PI / 180;
      const mag = 0.7 + 0.3 * rand();
      const A = { x: Math.sin(legA), z: Math.cos(legA) }, B = { x: Math.sin(legB), z: Math.cos(legB) };
      const d = new DribbleController();
      let yaw = 0;
      const [ax, ay] = stickOf(A.x, A.z, mag);
      for (let i = 0; i < 40; i++) yaw = d.update(DT, ax, ay, true).facingRad;   // up one diagonal at pace; the mode's face() each frame
      const yawBeforeCut = yaw;
      const [bx, by] = stickOf(B.x, B.z, mag);
      const r = d.update(DT, bx, by, true);                                      // snapped to the other diagonal
      if (!r.crossover) continue;
      fired++;
      // the cut's side, independently: B against the pre-cut travel's right (right of forward (fx, fz) = (fz, −fx))
      const rightA = athleteRight(yawBeforeCut);
      const want = B.x * rightA.x + B.z * rightA.z > 0 ? 'right' : 'left';
      if (sideOfVector(yawBeforeCut, B) === want) agree++;
      // after face(): the facing IS the cut, so the cut's lateral part is gone
      const post = athleteRight(r.facingRad);
      if (Math.abs(B.x * post.x + B.z * post.z) < 1e-9) degenerate++;
    }
    expect(fired).toBeGreaterThan(300);
    expect(agree).toBe(fired);
    expect(degenerate).toBe(fired);   // the reason the post-face read was a coin flip
  });
  it('the modes read the side against the pre-cut facing: 1v1 captures it before the controller turns it, 3v3 asks before its facing write', () => {
    const one = readFileSync(path.join(__dirname, '../modes/OneVOneMode.ts'), 'utf8');
    const at = one.indexOf('const yawBeforeCut = me.root.rotation.y;');
    const upd = one.indexOf('const drib = meDribble.update(dt, mx, my, sprintOk);');
    const face = one.indexOf('face(me.root, drib.facingRad)');
    const side = one.indexOf('meCarry?.toSide(sideOfVector(yawBeforeCut, { x: mx, z: -my }))');
    expect(at).toBeGreaterThan(0); expect(upd).toBeGreaterThan(at); expect(face).toBeGreaterThan(upd); expect(side).toBeGreaterThan(face);
    expect(one).not.toMatch(/meCarry\?\.toSide\(sideOfVector\(me\.root\.rotation\.y/);
    const three = readFileSync(path.join(__dirname, '../modes/ThreeVThreeMode.ts'), 'utf8');
    const s3 = three.indexOf('carries.get(me)?.toSide(sideOfVector(me.char.root.rotation.y, wish))');
    expect(s3).toBeGreaterThan(0);
    // 3v3's facing write for the hero comes after the crossover's read in the same update
    const w3 = three.indexOf('me.char.root.rotation.y =', s3);
    expect(w3).toBeGreaterThan(s3);
  });
});
