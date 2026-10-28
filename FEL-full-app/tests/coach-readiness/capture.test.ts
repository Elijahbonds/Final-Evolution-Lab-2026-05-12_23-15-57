// COACH-READINESS: the 30-second check's live read, on the JUMP-PRO bench's filmed takes (lib/jump/ballistic.ts — a
// physics body filmed through the app's own virtual camera). The check reuses the jump check: calibrateFront, T5's flight
// finder and gradeT5 with JUMP-PRO's re-timing. Measured here: it finishes on the third landing, inside the 30 seconds,
// and its best and mean sit on the force-plate truth within the bench's own ±.
import { describe, expect, it } from 'vitest';
import { buildTake, filmTake } from '@/lib/jump/ballistic';
import { ReadinessCapture, dayJumpsOf } from '@/lib/coach/readiness/capture';
import { JUMPS_ASKED } from '@/lib/coach/readiness/thresholds';

function run(fps: number, heights: number[], seed = 3, leadS = 3.2) {
  const take = buildTake(heights.map((m) => ({ trial: { heightM: m } })), { leadS });
  const { frames, truth } = filmTake(take, { fps, seed });
  const c = new ReadinessCapture({ aspect: 4 / 3, cameraFps: fps });
  let doneAt: number | null = null;
  const steps = new Set<string>();
  for (const f of frames) { const v = c.push(f); steps.add(v.step); if (v.step === 'done') { doneAt = f.t; break; } }
  return { r: c.finish(), doneAt, truth, steps, end: frames[frames.length - 1].t };
}

describe('the live check', () => {
  it.each([30, 60])('%i fps: stand → jump → done on the third landing, under 30 s, best and mean on the truth', (fps) => {
    const { r, doneAt, truth, steps } = run(fps, [0.4, 0.42, 0.41]);
    expect([...steps]).toEqual(['stand', 'jump', 'done']);
    expect(doneAt).not.toBeNull();
    expect(doneAt!).toBeLessThan(30_000);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.jumps.jumps).toBe(JUMPS_ASKED);
    const best = Math.max(...truth.map((t) => t.heightV0Cm)), mean = truth.reduce((a, t) => a + t.heightV0Cm, 0) / truth.length;
    expect(Math.abs(r.jumps.bestCm - best)).toBeLessThan(3);
    expect(Math.abs(r.jumps.meanCm - mean)).toBeLessThan(3);
    expect(r.jumps.teCm).toBeGreaterThan(0);
    expect(r.jumps.poseHz).toBeGreaterThan(fps * 0.9);
  });

  it('one jump is not a check: it says so and asks again', () => {
    const { r } = run(60, [0.4]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.why).toMatch(/Only 1 jump counted/);
  });

  it('no still stand, no read: the stand step says what to fix', () => {
    const c = new ReadinessCapture({ aspect: 4 / 3 });
    for (let t = 0; t < 3000; t += 33) c.push({ t, present: false, image: [] });
    expect(c.view().step).toBe('stand');
    const r = c.finish();
    expect(r.ok).toBe(false);
  });

  it('an outlier (far above the others) is left out of the best and the mean', () => {
    const t5 = {
      jumps: [1, 2, 3].map((index) => ({ index, valid: true, heightCm: index === 3 ? 60 : 40, flightMs: 0, takeoffT: 0, landT: 0, landingFlex: null, landingValgus: { left: null, right: null }, landingSymMs: null, dipKneeFlex: null })),
      bestHeightCm: 60, bestFlightMs: null, bestJump: 3, poseFps: 60, cameraFps: 60, fpsLow: false, heightPlusMinusCm: null, cvPct: null, inconsistent: false,
      session: { n: 3, bestCm: 60, bestIndex: 3, bestCleanCm: 40, bestCleanIndex: 1, meanCm: 46.7, sdCm: 11, cvPct: 20, measurementSdCm: null, typicalErrorCm: 11, realChangeCm: 30, outliers: [3] },
    };
    const r = dayJumpsOf(t5);
    expect(r.ok && r.jumps).toMatchObject({ bestCm: 40, meanCm: 40, jumps: 2 });
  });
});
