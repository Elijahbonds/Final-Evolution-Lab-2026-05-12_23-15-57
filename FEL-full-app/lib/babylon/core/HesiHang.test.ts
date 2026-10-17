// H2b (hoops-motion plan §4.8, G7): the hesitation HANGS — "root ≤ 0.5 m/s for ≥ 150 ms, then ≥ 3 m/s within 300 ms". Before, the
// R-stick hesi's pause lasted one frame with the stick still forward, and the left-stick tap's pull-then-push exploded on the same
// frame: no hesitation for a defender to bite on.
import { describe, expect, it } from 'vitest';
import { DribbleController } from './BasketballCore';

const DT = 1 / 60;
const run = (d: DribbleController, frames: number, x: number, y: number, sprint = false) => { const out: number[] = []; for (let i = 0; i < frames; i++) { d.update(DT, x, y, sprint); out.push(d.vel.length()); } return out; };

describe('the hesitation hang (DribbleController)', () => {
  it('the R-stick hesi: held still for the hang with the stick forward, then the explode on its last frame', () => {
    const d = new DribbleController(); d.setFacing(Math.PI);           // facing −z: the stick's up (y = 1) is forward
    run(d, 60, 0, 1);                                                     // a jog toward the rim
    expect(d.vel.length()).toBeGreaterThan(3);
    d.hesitate();
    const hang = run(d, Math.round(DribbleController.HESI_HANG_SEC / DT) - 1, 0, 1);
    expect(d.hanging).toBe(true);
    expect(Math.max(...hang.slice(3))).toBeLessThanOrEqual(DribbleController.HESI_HANG_MAX_MPS + 1e-9);   // ≤ 0.3 m/s (after the eased plant's first frames)
    expect(hang.length * DT).toBeGreaterThanOrEqual(0.15);
    const after = run(d, 18, 0, 1);                                        // 0.3 s
    expect(d.hanging).toBe(false);
    expect(Math.max(...after)).toBeGreaterThanOrEqual(3);                 // ≥ 3 m/s within 300 ms
  });
  it('the left-stick pull-then-push is remembered and explodes when the hang ends, not on the frame it was thrown', () => {
    const d = new DribbleController(); d.setFacing(Math.PI);
    run(d, 40, 0, 1);
    run(d, 6, 0, -1);                                                     // the pull-back tap (< PULLBACK_TAP_SEC)
    const first = run(d, 1, 0, 1)[0];                                     // …and the push: the tap resolves into the hang
    expect(d.hanging).toBe(true);
    expect(first).toBeLessThan(3);                                        // no same-frame explode any more
    const after = run(d, 20, 0, 1);
    expect(Math.max(...after)).toBeGreaterThanOrEqual(3);
  });
  it('the stick moves nothing inside the hang (a cut or a crossover thrown in it is not read)', () => {
    const d = new DribbleController(); d.setFacing(Math.PI);
    run(d, 40, 0, 1); d.hesitate();
    const r = run(d, 6, 1, 0);                                            // hard sideways inside the hang
    expect(Math.max(...r.slice(3))).toBeLessThanOrEqual(DribbleController.HESI_HANG_MAX_MPS + 1e-9);
  });
});
