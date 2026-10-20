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
    const hang = run(d, Math.floor(DribbleController.HESI_HANG_SEC / DT), 0, 1);
    expect(d.hanging).toBe(true);
    expect(Math.max(...hang.slice(3))).toBeLessThanOrEqual(DribbleController.HESI_HANG_MAX_MPS + 1e-9);   // ≤ 0.3 m/s (after the eased plant's first frames)
    expect(hang.length * DT).toBeGreaterThanOrEqual(5 * DT);
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
  // H2-HESI-COOLDOWN-CONSUME: a tap thrown inside HESI_COOLDOWN_SEC fires no hesitation — and its pull-back used to stay the last
  // direction, so the push out of it read as a reversal: a phantom crossover on every tap the cooldown refused (3 of 6 at 0.5 s).
  it('a pull-then-push tap thrown inside the hesi cooldown is consumed: no hesitation, and no phantom crossover', () => {
    const d = new DribbleController(); d.setFacing(Math.PI);
    run(d, 60, 0, 1);
    let hesis = 0, crosses = 0;
    for (let k = 0; k < 6; k++) {                                         // six taps, one every 0.5 s (every other one inside the cooldown)
      for (const [x, y, n] of [[0, -1, 6], [0, 1, 24]] as const) for (let i = 0; i < n; i++) { const r = d.update(DT, x, y, false); if (r.hesitation) hesis++; if (r.crossover) crosses++; }
    }
    expect(hesis).toBe(3);
    expect(crosses).toBe(0);
  });
  it('a real crossover thrown inside the hesi cooldown still fires', () => {
    const d = new DribbleController(); d.setFacing(Math.PI);
    run(d, 40, 0, 1);
    run(d, 6, 0, -1); run(d, 20, 0, 1);                                   // a hesi and its explode — the cooldown runs on
    run(d, 6, 0, -1); run(d, 6, 0, 1);                                    // a refused tap inside it
    run(d, 6, 1, 0.3);                                                    // the run drifts right…
    let crossed = false;
    for (let i = 0; i < 3; i++) if (d.update(DT, -1, 0.3, false).crossover) crossed = true;   // …and the hard flick left
    expect(crossed).toBe(true);
  });
  it('repeated hesi taps with 60-frame gaps: still no crossover in 6 cycles', () => {
    const d = new DribbleController(); d.setFacing(Math.PI);
    run(d, 60, 0, 1);
    let crosses = 0;
    for (let k = 0; k < 6; k++) {
      for (const [x, y, n] of [[0, -1, 6], [0, 1, 60]] as const) for (let i = 0; i < n; i++) if (d.update(DT, x, y, false).crossover) crosses++;
    }
    expect(crosses).toBe(0);
  });
  // QA spec: after a hesitation's explode, a lean one way (4 frames) and a snap the other (8 frames) is ONE crossover, on the first
  // snap frame and none before — mirrored both ways.
  for (const [lean, name] of [[-1, 'lean left, snap right'], [1, 'lean right, snap left']] as const) {
    it(`after the hesi's explode, ${name}: the crossover fires exactly once, on the first snap frame`, () => {
      const d = new DribbleController(); d.setFacing(Math.PI);
      run(d, 40, 0, 1);
      run(d, 6, 0, -1); run(d, 20, 0, 1);                                 // the hesi, its hang and its explode
      const frames: number[] = [];
      for (let i = 0; i < 12; i++) if (d.update(DT, i < 4 ? lean : -lean, 0, false).crossover) frames.push(i);
      expect(frames).toEqual([4]);
    });
  }
});
