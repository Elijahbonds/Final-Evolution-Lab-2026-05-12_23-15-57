// vis-foundation-2 A9.12 — the broadcast intro rides OVER the play camera: when it ends (or a press skips it) the frame is
// exactly where the play camera would have had it, and the play camera underneath never knew it was there.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { CameraDirector } from './CameraDirector';
import { INTRO, introSec } from '../scene/broadcastShots';

afterEach(() => vi.unstubAllGlobals());

function rig() {
  const engine = new NullEngine();
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60;
  const scene = new Scene(engine);
  const cam = new FreeCamera('cam', new Vector3(0, 3, -8), scene);
  const dir = new CameraDirector(scene, cam, 'gridiron');
  return { engine, scene, cam, dir };
}
/** A runner jogging +z, `frames` frames; `onFrame` may poke the director. Returns the camera's position and target per frame. */
function run(frames: number, arm: (d: CameraDirector) => void, onFrame?: (d: CameraDirector, i: number) => void) {
  const { engine, scene, cam, dir } = rig();
  const p = new Vector3(0, 0, 0), v = new Vector3(0, 0, 3);
  dir.snapTo(p, p.add(new Vector3(0, 0, 12)));
  arm(dir);
  const out: { pos: Vector3; target: Vector3; fov: number; lb: number; intro: boolean }[] = [];
  for (let i = 0; i < frames; i++) {
    p.z += 3 / 60;
    onFrame?.(dir, i);
    dir.update(p, v, null);
    out.push({ pos: cam.position.clone(), target: cam.getTarget().clone(), fov: cam.fov, lb: dir.cinematic01, intro: dir.inIntro });
  }
  scene.dispose(); engine.dispose();
  return out;
}

describe('the broadcast intro', () => {
  const N = Math.ceil(introSec('walkIn') * 60) + 30;
  it('flies a crane and a player shot, then the frame is EXACTLY the play camera\'s', () => {
    const plain = run(N, () => {});
    const intro = run(N, (d) => { expect(d.establish('walkIn')).toBe(true); });
    // early: far from where the play camera is, behind the bars
    expect(Vector3.Distance(intro[10].pos, plain[10].pos)).toBeGreaterThan(8);
    expect(intro[10].lb).toBe(1);
    // the player shot: in front of the runner, who runs +z
    const i = Math.round((INTRO.craneSec + 0.5) * 60);
    expect(intro[i].intro).toBe(true);
    expect(intro[i].pos.z).toBeGreaterThan(i * 3 / 60);
    // after: identical to the run that never had an intro
    const last = N - 1;
    expect(intro[last].intro).toBe(false);
    expect(intro[last].lb).toBe(0);
    expect(intro[last].pos.x).toBeCloseTo(plain[last].pos.x, 6);
    expect(intro[last].pos.y).toBeCloseTo(plain[last].pos.y, 6);
    expect(intro[last].pos.z).toBeCloseTo(plain[last].pos.z, 6);
    expect(intro[last].target.z).toBeCloseTo(plain[last].target.z, 6);
    expect(intro[last].fov).toBeCloseTo(plain[last].fov, 9);
  });
  it('a press skips it: the frame eases round to the play camera and is the play camera\'s after skipSec', () => {
    const at = 40;
    const plain = run(at + 60, () => {});
    const skipped = run(at + 60, (d) => d.establish('walkIn'), (d, i) => { if (i === at) d.skipIntro(); });
    const done = at + Math.ceil(INTRO.skipSec * 60) + 2;
    expect(skipped[done].intro).toBe(false);
    expect(skipped[done].pos.z).toBeCloseTo(plain[done].pos.z, 6);
    expect(skipped[at + 5].lb).toBeLessThan(skipped[at - 1].lb);   // the bars open with the skip
  });
  it('a skip from the player shot (in front) swings ROUND the runner to the play camera (behind), never through them', () => {
    const at = Math.round((INTRO.craneSec + 0.4) * 60);
    const skipped = run(at + 40, (d) => d.establish('walkIn'), (d, i) => { if (i === at) d.skipIntro(); });
    let closest = Infinity;
    for (let i = at; i < at + 40; i++) closest = Math.min(closest, Math.hypot(skipped[i].pos.x, skipped[i].pos.z - (i + 1) * 3 / 60));
    expect(closest).toBeGreaterThan(2);
  });
  it('reduced motion: no intro at all', () => {
    vi.stubGlobal('window', { location: { search: '?motion=reduce' } });
    const { dir } = rig();
    expect(dir.establish('walkIn')).toBe(false);
    expect(dir.inIntro).toBe(false);
  });
  it('endIntro leaves the camera where the play camera wants it', () => {
    const plain = run(30, () => {});
    const ended = run(30, (d) => d.establish('establish'), (d, i) => { if (i === 29) d.endIntro(); });
    expect(ended[29].pos.z).toBeCloseTo(plain[29].pos.z, 6);
    expect(ended[29].intro).toBe(false);
  });
});
