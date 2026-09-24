import { describe, it, expect } from 'vitest';
import { alignQuatKeys, smoothByDefault, smoothQuatKeys, smoothScalarKeys, type Q4 } from './smoothKeys';

const axisAngle = (ax: [number, number, number], deg: number): Q4 => {
  const h = (deg * Math.PI) / 360, l = Math.hypot(...ax);
  return [(ax[0] / l) * Math.sin(h), (ax[1] / l) * Math.sin(h), (ax[2] / l) * Math.sin(h), Math.cos(h)];
};
const angleDeg = (a: Q4, b: Q4) => (2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]))) * 180) / Math.PI;

describe('smoothKeys — the joint-space cubic between poses', () => {
  it('passes through every authored pose', () => {
    const keys = [{ t: 0, q: axisAngle([1, 0, 0], 0) }, { t: 0.3, q: axisAngle([1, 0, 0], 70) }, { t: 0.5, q: axisAngle([0, 1, 1], 40) }, { t: 0.9, q: axisAngle([1, 0, 0], -20) }];
    const out = smoothQuatKeys(keys, { fps: 30, duration: 0.9 });
    for (const k of keys) {
      const s = out.find((o) => Math.abs(o.t - k.t) < 1e-6)!;
      expect(angleDeg(s.q, k.q)).toBeLessThan(0.01);
    }
    expect(out.length).toBe(28);
  });

  it('reaches a pose where the motion turns round and never overshoots it', () => {
    const out = smoothScalarKeys([{ t: 0, v: 0 }, { t: 0.2, v: 1 }, { t: 0.9, v: 0 }], { fps: 60, duration: 0.9 });
    expect(Math.max(...out.map((o) => o.v))).toBeLessThanOrEqual(1 + 1e-9);
    // a rotation too: a hand authored AT the rim does not swing past it
    const q = smoothQuatKeys([{ t: 0, q: axisAngle([1, 0, 0], 0) }, { t: 0.2, q: axisAngle([1, 0, 0], 90) }, { t: 0.9, q: axisAngle([1, 0, 0], 10) }], { fps: 60, duration: 0.9 });
    const peak = Math.max(...q.map((o) => angleDeg(o.q, axisAngle([1, 0, 0], 0))));
    expect(peak).toBeLessThan(90.5);
  });

  it('keeps the velocity continuous through a key (the linear slerp breaks it on the key frame)', () => {
    const keys = [{ t: 0, v: 0 }, { t: 0.3, v: 0.4 }, { t: 0.6, v: 1.4 }, { t: 1, v: 1.6 }];
    const out = smoothScalarKeys(keys, { fps: 100, duration: 1 });
    const at = (t: number) => out.find((o) => Math.abs(o.t - t) < 1e-6)!.v;
    const jump = (t: number) => Math.abs((at(t + 0.01) - at(t)) / 0.01 - (at(t) - at(t - 0.01)) / 0.01);
    // linear: the speed steps from 1.33 to 3.33 m/s on the 0.3 key; the cubic changes by a sliver of that over a frame
    expect(jump(0.3)).toBeLessThan(0.3);
    expect(jump(0.6)).toBeLessThan(0.6);
  });

  it('a HOLD key eases to a stop on the pose', () => {
    const out = smoothScalarKeys([{ t: 0, v: 0 }, { t: 0.4, v: 1 }, { t: 0.8, v: 2 }], { fps: 100, duration: 0.8, holds: [0.4] });
    const at = (t: number) => out.find((o) => Math.abs(o.t - t) < 1e-6)!.v;
    expect(Math.abs(at(0.41) - at(0.4)) / 0.01).toBeLessThan(0.2);   // ~0 at the key, the average over the first 10 ms
    // without the hold it passes through at speed
    const flow = smoothScalarKeys([{ t: 0, v: 0 }, { t: 0.4, v: 1 }, { t: 0.8, v: 2 }], { fps: 100, duration: 0.8 });
    const fa = (t: number) => flow.find((o) => Math.abs(o.t - t) < 1e-6)!.v;
    expect((fa(0.41) - fa(0.4)) / 0.01).toBeGreaterThan(2);
  });

  it('aligns hemispheres, so q and −q never spin the long way round', () => {
    const a = axisAngle([0, 1, 0], 10), b = axisAngle([0, 1, 0], 30).map((c) => -c) as Q4;
    expect(alignQuatKeys([{ t: 0, q: a }, { t: 1, q: b }])[1].q[3]).toBeGreaterThan(0);
    const out = smoothQuatKeys([{ t: 0, q: a }, { t: 1, q: b }], { fps: 30, duration: 1 });
    for (let i = 1; i < out.length; i++) expect(angleDeg(out[i].q, out[i - 1].q)).toBeLessThan(2);
  });

  it('the capture prefilter takes the estimator jitter out', () => {
    const keys = Array.from({ length: 21 }, (_, i) => ({ t: i * 0.05, v: i * 0.05 + (i % 2 ? 0.03 : -0.03) }));
    const raw = smoothScalarKeys(keys, { fps: 20, duration: 1 });
    const filt = smoothScalarKeys(keys, { fps: 20, duration: 1, prefilter: 1 });
    const rough = (s: { v: number }[]) => s.slice(2, -2).reduce((a, x, i, arr) => (i ? a + Math.abs(x.v - 2 * arr[i - 1].v + (arr[i - 2]?.v ?? arr[i - 1].v)) : a), 0);
    expect(rough(filt)).toBeLessThan(rough(raw) * 0.6);
  });

  it('the dunk family is smooth by default, captures prefiltered, other modes untouched', () => {
    expect(smoothByDefault('dunk_finish_windmill')).toBe(0);
    expect(smoothByDefault('dunk_360_eastbay')).toBe(0);
    expect(smoothByDefault('dunk_mc_tomahawk')).toBe(1);
    expect(smoothByDefault('dunk_mocap')).toBe(1);
    expect(smoothByDefault('bball_dribble_run')).toBeNull();
    expect(smoothByDefault('karate_jab')).toBeNull();
  });
});
