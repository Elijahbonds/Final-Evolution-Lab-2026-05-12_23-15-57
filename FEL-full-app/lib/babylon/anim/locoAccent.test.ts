// hoops-dip movement pass (owner 2026-10-20): the decel step and the push-off are READ off the body's own ground speed (never written to
// it): a hard stop from a run draws the stop, a hard start from standing draws the start, a jog's ordinary changes draw nothing, an accent
// lasts its own time, ends at once off a loop, and two never come closer than ACCENT_GAP_SEC.
import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { hoopsNodeRig } from '../../../tests/helpers/hoopsNodeRig';
import { LocoAccent, stepAccent, accentIdle, accentFor, accentShape, ACCENT_SEC, ACCENT_GAP_SEC, STOP_FROM_MPS, STOP_DECEL_MPS2, START_ACCEL_MPS2 } from './locoAccent';

const DT = 1 / 60;
/** Feed a speed trace (m/s a frame); the accents seen, with the frame each started. */
function run(trace: number[], onLoop = true): { kind: string; at: number }[] {
  const s = accentIdle(); const out: { kind: string; at: number }[] = []; let was: string | null = null;
  trace.forEach((v, i) => { const a = stepAccent(s, v, DT, onLoop); if (a && a.kind !== was) out.push({ kind: a.kind, at: i }); was = a ? a.kind : null; });
  return out;
}
const hold = (v: number, sec: number) => Array.from({ length: Math.round(sec / DT) }, () => v);
const ramp = (a: number, b: number, sec: number) => Array.from({ length: Math.round(sec / DT) }, (_, i) => a + ((b - a) * (i + 1)) / Math.round(sec / DT));

describe('the stop and the start, read off the body', () => {
  it('a run braked to a stop in 0.3 s draws the decel step, once', () => {
    expect(run([...hold(5.5, 1), ...ramp(5.5, 0, 0.3), ...hold(0, 1)]).map((a) => a.kind)).toEqual(['stop']);
  });
  it('standing, then hard to a run in 0.4 s: the push-off, once', () => {
    expect(run([...hold(0, 1), ...ramp(0, 5.5, 0.4), ...hold(5.5, 1)]).map((a) => a.kind)).toEqual(['start']);
  });
  it('a jog that eases off and on (under the thresholds) draws nothing; a slow walk-up draws nothing', () => {
    expect(run([...hold(3.7, 0.5), ...ramp(3.7, 2.5, 0.6), ...ramp(2.5, 3.7, 0.6)])).toEqual([]);
    expect(run([...hold(0, 0.5), ...ramp(0, 2, 1.5)])).toEqual([]);
  });
  it('nothing off a loop (a shot, a move beat): the detector reads, but draws no accent', () => {
    expect(run([...hold(5.5, 1), ...ramp(5.5, 0, 0.3), ...hold(0, 1)], false)).toEqual([]);
  });
  it('an accent lasts its own time; a stop straight into a start waits ACCENT_GAP_SEC', () => {
    const s = accentIdle(); let n = 0;
    for (const v of [...hold(5.5, 1), ...ramp(5.5, 0, 0.25)]) stepAccent(s, v, DT, true);
    while (stepAccent(s, 0, DT, true)?.kind === 'stop') n++;
    expect((n + 1) * DT).toBeLessThanOrEqual(ACCENT_SEC.stop + 2 * DT);
    const t = run([...hold(5.5, 1), ...ramp(5.5, 0, 0.2), ...ramp(0, 5.5, 0.3), ...hold(5.5, 0.5)]);
    expect(t[0].kind).toBe('stop');
    if (t[1]) expect((t[1].at - t[0].at) * DT).toBeGreaterThanOrEqual(ACCENT_GAP_SEC - 1e-9);
  });
  it('the thresholds as named; the shape is a bump, 0 at its ends', () => {
    expect(accentFor(-STOP_DECEL_MPS2 - 1, STOP_FROM_MPS + 0.1, 9)).toBe('stop');
    expect(accentFor(-STOP_DECEL_MPS2 - 1, STOP_FROM_MPS - 0.5, 9)).toBeNull();
    expect(accentFor(START_ACCEL_MPS2 + 1, 0, 0.1)).toBe('start');
    expect(accentFor(START_ACCEL_MPS2 + 1, 0, 1)).toBeNull();
    expect(accentShape(0)).toBe(0); expect(accentShape(1)).toBe(0); expect(accentShape(0.5)).toBeCloseTo(1, 9);
  });
});

describe('the accent on the node rig (a run braked to a stop)', () => {
  it('the hips go down, the chest leans back against the brake, the feet and the hands stay where the layers before drew them', () => {
    const r = hoopsNodeRig('right');
    (r.scene.getEngine() as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
    const nodes = ['LeftFoot', 'RightFoot', 'LeftHand', 'RightHand'].map((n) => r.nodes[n]);
    let pre: Vector3[] = [];
    const acc = LocoAccent.for(r.scene, r.sk, r.root, () => 'speed_dribble');
    // what the layers before left, and the drawn pose right after the accent (ahead of the carry's wrists)
    let post: Vector3[] = []; let hipsPost = 0; let spineFwd = 0;
    r.scene.onAfterAnimationsObservable.add(() => {
      post = nodes.map((n) => { n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); });
      hipsPost = r.nodes.Hips.getAbsolutePosition().y;
      const sp = r.nodes.Spine2; sp.computeWorldMatrix(true); const up = Vector3.TransformNormal(Vector3.Up(), sp.getWorldMatrix());
      spineFwd = -up.z;   // the root faces −z: the chest's lean toward the body's front
    });
    r.scene.onAfterAnimationsObservable.add(() => { pre = nodes.map((n) => { n.computeWorldMatrix(true); return n.getAbsolutePosition().clone(); }); }, undefined, true);
    const frame = () => { r.scene.onBeforeAnimationsObservable.notifyObservers(r.scene); r.scene.onAfterAnimationsObservable.notifyObservers(r.scene); };
    const speeds = [...hold(5.5, 1), ...ramp(5.5, 0, 0.3), ...hold(0, 0.6)];
    let deepest = 0, leanMin = 0, saw = false;
    for (const v of speeds) {
      r.root.position.z -= v / 60; frame();
      if (acc.now) {
        saw = true; deepest = Math.max(deepest, acc.now.drop); leanMin = Math.min(leanMin, spineFwd);
        post.forEach((p, i) => expect(Vector3.Distance(p, pre[i]), `${nodes[i].name} kept`).toBeLessThan(0.004));
      }
    }
    expect(saw).toBe(true);
    expect(deepest).toBeGreaterThan(0.04);
    expect(leanMin, 'the chest leans back').toBeLessThan(-0.08);
    void hipsPost;
    r.dispose();
  });
});
