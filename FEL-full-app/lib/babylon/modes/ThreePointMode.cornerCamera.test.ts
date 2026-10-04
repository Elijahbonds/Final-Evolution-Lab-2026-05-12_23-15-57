// HOOPS-10PHASE-2 (Elijah, Oct 3 2026 9:35 PM PT) — "3PT corner camera".
//
// On the first shot of rack 1 (the 30-degree corner), the rim fell out of frame. A geometry
// probe (see the comment on camBoundsMesh in ThreePointMode.ts) found the cause: the 'hoops'
// preset's camera wants to stand ~13m out past the sideline to frame a corner shooter opposite
// the rim, CameraDirector.clampToBounds crushes that back onto basketball_h2h's 16x19 venue_ground
// (the only VENUE_SHELL mesh in that venue), and the collapsed vantage point puts the rim
// 22-26 degrees off the look axis — inside a desktop lens, but outside a portrait phone's much
// narrower horizontal FOV (TargetCamera's default fovMode is vertical-fixed, so the horizontal
// angle shrinks below a 1:1 aspect). This test reproduces the exact production geometry — the
// real venue_ground box AND the camBoundsMesh fix — and checks every one of the 5 rack spawns,
// on both a desktop and a portrait-phone viewport, puts the rim on screen.
import { afterEach, describe, expect, it } from 'vitest';
import { Matrix, MeshBuilder, NullEngine, Scene, TargetCamera, Vector3 } from '@babylonjs/core';
import { CameraDirector } from '../core/CameraDirector';
import { RACK_POS, RIM, CAM_BOUNDS_SIZE, CAM_BOUNDS_CENTER } from './ThreePointMode';

/** basketball_h2h's NexusWebScene ground spec (venueSpecs.ts): size [16, 19], offset [0, 7.6]. */
const VENUE_GROUND = { width: 16, height: 19, center: new Vector3(0, 0, 7.6) };

const VIEWS = [
  { name: 'desktop', w: 1280, h: 720 },
  { name: 'phone portrait', w: 390, h: 844 },
] as const;

const engines: NullEngine[] = [];

/** Mirrors ThreePointMode.load(): the real venue_ground, plus (optionally) the camBoundsMesh fix. */
function mountCourt(scene: Scene, withFix: boolean): void {
  const ground = MeshBuilder.CreateGround('venue_ground', { width: VENUE_GROUND.width, height: VENUE_GROUND.height }, scene);
  ground.position.copyFrom(VENUE_GROUND.center);
  if (withFix) {
    const box = MeshBuilder.CreateBox('venue_box_3pt_cam_bounds', CAM_BOUNDS_SIZE, scene);
    box.position.copyFrom(CAM_BOUNDS_CENTER);
    box.isVisible = false;
    box.isPickable = false;
  }
}

function frameRack(subject: Vector3, withFix: boolean, w: number, h: number) {
  const engine = new NullEngine({ renderWidth: w, renderHeight: h });
  engine.getDeltaTime = () => 1000 / 60;
  engines.push(engine);
  const scene = new Scene(engine);
  mountCourt(scene, withFix);
  const camera = new TargetCamera('cam', new Vector3(0, 3, -8), scene);
  camera.fov = 0.8;
  scene.activeCamera = camera;
  const dir = new CameraDirector(scene, camera, 'hoops');
  // Mirrors ThreePointMode.load(): one instant snap, no eased follow-in — exactly the call
  // the shooter's FIRST frame at a rack gets.
  dir.snapTo(subject, RIM);
  scene.render();
  const project = (p: Vector3) => {
    const s = Vector3.Project(p, Matrix.Identity(), scene.getTransformMatrix(), camera.viewport.toGlobal(w, h));
    return { x: s.x / w, y: s.y / h, z: s.z };
  };
  return { camera, project };
}

afterEach(() => {
  while (engines.length) engines.pop()!.dispose();
});

describe('3PT corner camera', () => {
  it('without the cam-bounds fix, the 30/150 deg corner racks lose the rim on a portrait phone', () => {
    // Documents the bug this test guards against — the fix must not be removed without this
    // regression having somewhere to fail.
    const corner = RACK_POS[0];
    const { project } = frameRack(corner, false, 390, 844);
    const rim = project(RIM.add(new Vector3(0, 0.65, 0)));
    const offFrame = rim.x < 0 || rim.x > 1 || rim.y < 0 || rim.y > 1 || rim.z <= 0 || rim.z >= 1;
    expect(offFrame).toBe(true);
  });

  for (const view of VIEWS) {
    it(`shows the shooter AND the rim on the first frame of all 5 racks (${view.name})`, () => {
      for (let i = 0; i < RACK_POS.length; i++) {
        const subject = RACK_POS[i];
        const { project } = frameRack(subject, true, view.w, view.h);
        const shooter = project(subject.add(new Vector3(0, 1.3, 0)));
        const rim = project(RIM.add(new Vector3(0, 0.65, 0)));
        for (const [label, p] of [['shooter', shooter], ['rim', rim]] as const) {
          expect(p.z, `rack ${i + 1} ${label} depth (${view.name})`).toBeGreaterThan(0);
          expect(p.z, `rack ${i + 1} ${label} depth (${view.name})`).toBeLessThan(1);
          expect(p.x, `rack ${i + 1} ${label} x (${view.name})`).toBeGreaterThan(0.02);
          expect(p.x, `rack ${i + 1} ${label} x (${view.name})`).toBeLessThan(0.98);
          expect(p.y, `rack ${i + 1} ${label} y (${view.name})`).toBeGreaterThan(0.02);
          expect(p.y, `rack ${i + 1} ${label} y (${view.name})`).toBeLessThan(0.98);
        }
      }
    });
  }
});
