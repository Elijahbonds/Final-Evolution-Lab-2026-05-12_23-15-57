// One camera frame, one evaluation (MIRROR-COACH P2, 2026-09-26): the gate the compositor's render loop puts in front of
// the analysis, so the adapter's repeated frame (same object, same timestamp) is not evaluated a second time.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PoseFrameGate } from './pose-frame-gate';

describe('PoseFrameGate', () => {
  it('admits a frame once; the same frame handed back again is refused', () => {
    const g = new PoseFrameGate();
    const f = { timestampMs: 1_000 };
    expect(g.admit(f)).toBe(true);
    expect(g.admit(f)).toBe(false);                      // the adapter's "previous frame unchanged"
    expect(g.admit({ timestampMs: 1_000 })).toBe(false); // a copy with the same clock is the same camera frame
    expect(g.admit({ timestampMs: 1_033 })).toBe(true);
  });

  it('a frame stamped earlier than one already admitted is refused, and reset() starts over', () => {
    const g = new PoseFrameGate();
    expect(g.admit({ timestampMs: 500 })).toBe(true);
    expect(g.admit({ timestampMs: 499 })).toBe(false);
    g.reset();
    expect(g.admit({ timestampMs: 499 })).toBe(true);
  });

  it('a 60 Hz render loop over a 30 fps camera admits each camera frame exactly once', () => {
    const g = new PoseFrameGate();
    let admitted = 0;
    // 600 display ticks at 16.7 ms; the camera's frame changes every other tick, as the adapter hands it over
    let cam = { timestampMs: 0 };
    for (let tick = 0; tick < 600; tick++) {
      if (tick % 2 === 0) cam = { timestampMs: tick * 16.7 + 1 };
      if (g.admit(cam)) admitted++;
    }
    expect(admitted).toBe(300);
  });
});

describe('the compositor analyses only what the gate admits', () => {
  const src = readFileSync(new URL('./overlay-compositor.ts', import.meta.url), 'utf8');
  it('the gate sits between detect() and every evaluation', () => {
    const detect = src.indexOf('adapter.detect(opts.video, t0)');
    const gate = src.indexOf('if (!poseGate.admit(frame)) { scene.render(); return; }');
    expect(detect).toBeGreaterThan(0);
    expect(gate).toBeGreaterThan(detect);
    for (const call of ['kin.evaluate(frame)', 'reps.feed(', 'squatAudit?.evaluate(frame)', 'opts.onFrame?.(']) {
      expect(src.indexOf(call), call).toBeGreaterThan(gate);
    }
  });
});
