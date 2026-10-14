// The cinematic layer (lane/w3-present, wave 3): a cut is drawn OVER the play camera's frame and the play camera's own frame is put back
// before anything reads it again. NullEngine, a real Scene.render(), observers placed where the harness places its own.
import { afterEach, describe, expect, it } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { mountCinemaRig, CIN_EASE_OUT_SEC } from './cinemaRig';

const made: Array<{ scene: Scene; engine: NullEngine }> = [];
afterEach(() => { for (const m of made.splice(0)) { m.scene.dispose(); m.engine.dispose(); } });

function rigged(fps = 60) {
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / fps;
  const scene = new Scene(engine);
  const cam = new FreeCamera('cam', new Vector3(0, 2, 8), scene);
  cam.setTarget(new Vector3(0, 1, 0)); cam.fov = 0.8;
  const rig = mountCinemaRig(scene, cam);
  made.push({ scene, engine });
  // what the renderer sees: recorded by observers placed AFTER the rig's (as the harness's own are), and what the next update() sees
  const drawn: Array<{ pos: Vector3; fov: number }> = [];
  scene.onBeforeRenderObservable.add(() => drawn.push({ pos: cam.position.clone(), fov: cam.fov }));
  const frame = (): void => { scene.render(); };
  return { scene, cam, rig, drawn, frame };
}
const POSE = { pos: { x: 5, y: 1, z: -3 }, target: { x: 0, y: 1, z: 0 }, fov: 0.5 };

describe('the cinema rig', () => {
  it('draws the cinematic pose and puts the play camera back, every frame', () => {
    const { cam, rig, drawn, frame } = rigged();
    const live = cam.position.clone();
    rig.play(() => ({ shot: POSE, letterbox: 1 }));
    for (let i = 0; i < 5; i++) {
      frame();
      expect(drawn[i].pos.x).toBeCloseTo(5, 6); expect(drawn[i].fov).toBeCloseTo(0.5, 6);   // what was drawn
      expect(cam.position.x).toBeCloseTo(live.x, 6); expect(cam.position.y).toBeCloseTo(live.y, 6); expect(cam.position.z).toBeCloseTo(live.z, 6);   // what the next update reads
      expect(cam.fov).toBeCloseTo(0.8, 6);
    }
  });

  it('the cut sees the play camera\'s frame of THAT render (the follow keeps moving underneath)', () => {
    const { cam, rig, frame } = rigged();
    const seen: number[] = [];
    rig.play((live) => { seen.push(live.pos.z); return { shot: POSE, letterbox: 0 }; });
    cam.position.z = 8; frame();
    cam.position.z = 9; frame();      // the mode's update moved the play camera
    expect(seen).toEqual([8, 9]);
    expect(cam.position.z).toBeCloseTo(9, 6);
  });

  it('"play" ends the cut: the play camera is drawn, the bars go, the rig is idle', () => {
    const { scene, rig, drawn, cam, frame } = rigged();
    let n = 0;
    rig.play(() => (++n > 2 ? { shot: 'play', letterbox: 0 } : { shot: POSE, letterbox: 1 }));
    frame(); frame();
    expect((scene.metadata as { felCinematic?: number }).felCinematic).toBe(1);
    frame();
    expect(rig.active).toBe(false);
    expect(drawn[2].pos.z).toBeCloseTo(cam.position.z, 6);
    expect((scene.metadata as { felCinematic?: number }).felCinematic).toBe(0);
  });

  it('stop() eases from where the cut was into the play camera over CIN_EASE_OUT_SEC, around the subject, then is idle', () => {
    const { rig, drawn, cam, frame } = rigged();
    rig.play(() => ({ shot: POSE, letterbox: 1 }), () => ({ x: 0, y: 0, z: 0 }));
    frame();
    rig.stop();
    const n = Math.ceil(CIN_EASE_OUT_SEC * 60) + 2;
    for (let i = 0; i < n; i++) frame();
    expect(rig.active).toBe(false);
    // frame 1 (the cut), then eased frames: monotone toward the play camera's z (8), never nearer the subject than the nearer end
    const zs = drawn.slice(1).map((d) => d.pos.z);
    expect(zs[0]).toBeLessThan(0);                    // began at the cut's pose
    expect(zs[zs.length - 2]).toBeGreaterThan(6);     // ended at the play camera
    expect(cam.position.z).toBeCloseTo(8, 6);
    for (const d of drawn.slice(1)) expect(Math.hypot(d.pos.x, d.pos.z)).toBeGreaterThan(2);   // around, not through, the subject at the origin
  });

  it('a shake that rides on the draw (registered after the rig) rides on the cinematic frame, and is gone with the restore', () => {
    const { scene, rig, cam, drawn, frame } = rigged();
    scene.onBeforeRenderObservable.add(() => { cam.position.x += 0.1; });   // the harness Shaker, in kind
    rig.play(() => ({ shot: POSE, letterbox: 0 }));
    frame();
    expect(drawn[0].pos.x).toBeCloseTo(5, 6);          // (recorded before the shake observer in this scene's order)
    expect(cam.position.x).toBeCloseTo(0, 6);          // restored: the shake does not accumulate on the play camera
  });

  it('idle: nothing is touched, and a level held by someone else (a replay\'s bars) is left alone', () => {
    const { scene, cam, frame } = rigged();
    (scene.metadata ??= {}).felCinematic = 1;
    const before = cam.position.clone();
    frame(); frame();
    expect(cam.position.equals(before)).toBe(true);
    expect((scene.metadata as { felCinematic?: number }).felCinematic).toBe(1);
  });

  it('cancel() and dispose() leave the play camera in place and the bars down', () => {
    const { scene, rig, cam, frame } = rigged();
    rig.play(() => ({ shot: POSE, letterbox: 1 })); frame();
    rig.cancel();
    expect(rig.active).toBe(false);
    expect((scene.metadata as { felCinematic?: number }).felCinematic).toBe(0);
    rig.play(() => ({ shot: POSE, letterbox: 1 })); frame();
    rig.dispose();
    frame();
    expect(cam.position.z).toBeCloseTo(8, 6);
  });
});
