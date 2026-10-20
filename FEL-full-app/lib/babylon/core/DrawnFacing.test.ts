// hoops-dip movement pass (owner 2026-10-20): the drawn facing never snaps — a 55° one-frame cut is spread over TURN_SMOOTH_SEC, an ordinary
// slewed turn is followed exactly (no lag), a placed body (a reset) takes its facing at once, a pause turns nothing.
import { describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { stepDrawnFacing, drawnFacingIdle, DrawnFacing, TURN_SMOOTH_SEC, SNAP_MIN_RAD, TELEPORT_M } from './DrawnFacing';

const DT = 1 / 60, DEG = Math.PI / 180;
const seeded = (yaw: number) => { const s = drawnFacingIdle(); stepDrawnFacing(s, yaw, 0, 0, DT); return s; };

describe('the drawn facing', () => {
  it('the momentum cross\'s −55° one-frame cut: spread over TURN_SMOOTH_SEC at a constant rate, no frame over a sixth of it, then exact', () => {
    const s = seeded(0); const target = -55 * DEG; const yaws: number[] = [];
    for (let i = 0; i < 20; i++) yaws.push(stepDrawnFacing(s, target, 0, 0, DT).yaw);
    const steps = yaws.map((y, i) => Math.abs(y - (i ? yaws[i - 1] : 0)) / DEG);
    expect(Math.max(...steps)).toBeLessThanOrEqual(55 * DT / TURN_SMOOTH_SEC + 1e-6);   // 7.6° a frame at 60 fps
    const done = yaws.findIndex((y) => Math.abs(y - target) < 1e-9);
    expect((done + 1) * DT).toBeCloseTo(TURN_SMOOTH_SEC, 1);
    expect(yaws.at(-1)).toBeCloseTo(target, 9);
  });
  it('an ordinary turn the movement slews (a few degrees a frame) is followed exactly, frame for frame', () => {
    const s = seeded(0);
    for (let i = 1; i <= 30; i++) { const t = i * 5 * DEG; expect(stepDrawnFacing(s, t, 0, 0, DT).yaw).toBeCloseTo(t, 9); }
    expect(5 * DEG).toBeLessThan(SNAP_MIN_RAD);
  });
  it('the reversal\'s −129° flip goes the short way and lands; a second jump mid-slew still ends TURN_SMOOTH_SEC after it', () => {
    const s = seeded(170 * DEG);
    stepDrawnFacing(s, -150 * DEG, 0, 0, DT);   // +40° the short way across ±180
    expect(s.yaw > 170 * DEG || s.yaw < -170 * DEG).toBe(true);
    for (let i = 0; i < 4; i++) stepDrawnFacing(s, -150 * DEG, 0, 0, DT);
    const t2 = -60 * DEG; let n = 0; while (Math.abs(s.yaw - t2) > 1e-9 && n < 60) { stepDrawnFacing(s, t2, 0, 0, DT); n++; }
    expect(n * DT).toBeLessThanOrEqual(TURN_SMOOTH_SEC + DT);
  });
  it('a placed body (moved over TELEPORT_M in a frame) takes its facing at once; a frame with no time turns nothing', () => {
    const s = seeded(0);
    expect(stepDrawnFacing(s, 2, TELEPORT_M + 0.1, 0, DT).yaw).toBe(2);
    expect(stepDrawnFacing(s, -1, TELEPORT_M + 0.1, 0, 0).yaw).toBe(2);
  });
});

function stage() {
  const engine = new NullEngine(); (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine); new FreeCamera('c', new Vector3(0, 2, -5), scene);
  const root = new TransformNode('root', scene); root.rotationQuaternion = Quaternion.Identity();
  const setYaw = (y: number) => { root.rotation.y = y; Quaternion.RotationYawPitchRollToRef(y, 0, 0, root.rotationQuaternion!); };   // the modes' face()
  const yaw = () => root.rotationQuaternion!.toEulerAngles().y;
  let drawnSeen = NaN; scene.onAfterAnimationsObservable.add(() => { drawnSeen = yaw(); });   // what the layers (and the carry) draw against
  const facing = DrawnFacing.for(scene, root);
  return { engine, scene, root, setYaw, yaw, facing, drawn: () => drawnSeen };
}

describe("the hook: drawn for the render, the movement's for the game", () => {
  it("a −55° cut: the render draws the slew; between renders — where the game reads it — the root holds the movement's facing exactly", () => {
    const t = stage();
    for (let i = 0; i < 5; i++) { t.setYaw(0.3); t.scene.render(); }
    const target = 0.3 - 55 * DEG; const drawn: number[] = [];
    for (let i = 0; i < 12; i++) {
      t.setYaw(target); t.scene.render();
      drawn.push(t.drawn());
      expect(t.yaw(), 'after the render: the movement\'s').toBeCloseTo(target, 6);
      expect(t.root.rotation.y).toBeCloseTo(target, 9);
    }
    expect(drawn[0]).toBeGreaterThan(target + 40 * DEG);   // the first frame of the cut is drawn barely turned…
    for (let i = 1; i < drawn.length; i++) expect(Math.abs(drawn[i] - drawn[i - 1]) / DEG).toBeLessThanOrEqual(55 * (1 / 60) / TURN_SMOOTH_SEC + 1e-3);
    expect(drawn.at(-1)).toBeCloseTo(target, 6);           // …and lands within TURN_SMOOTH_SEC
    t.scene.dispose(); t.engine.dispose();
  });
  it('a root turned by something else during the render is left as that wrote it', () => {
    const t = stage();
    for (let i = 0; i < 5; i++) { t.setYaw(0); t.scene.render(); }
    const obs = t.scene.onAfterAnimationsObservable.add(() => { Quaternion.RotationYawPitchRollToRef(1.0, 0, 0, t.root.rotationQuaternion!); t.root.rotation.y = 1.0; });
    t.setYaw(-1.0); t.scene.render();
    expect(t.yaw()).toBeCloseTo(1.0, 6);
    t.scene.onAfterAnimationsObservable.remove(obs);
    t.scene.dispose(); t.engine.dispose();
  });
});
