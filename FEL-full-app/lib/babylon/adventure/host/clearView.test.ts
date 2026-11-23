import { describe, expect, it } from 'vitest';
import { Mesh, MeshBuilder, Matrix, NullEngine, Scene, TargetCamera, Vector3 } from '@babylonjs/core';
import { CAMERA_RIGS, CAM_CHEST_Y, CAM_CLEAR, VENUE_CAM_CLEAR_VIEW, clearViewEye, enterFraction, type CamBox } from './camera';
import { boxesNear, keepEyeClear, meshCamBoxes } from './camBoxes';
import { FEEL_KNOB_BY_ID } from '@/lib/feel-panel/knobs';

const inside = (p: { x: number; y: number; z: number }, b: CamBox) => p.x > b.minX && p.x < b.maxX && p.y > b.minY && p.y < b.maxY && p.z > b.minZ && p.z < b.maxZ;
// the Coast's boat, as zoneView builds it (roughly): 9 × 3.2 m, from the water to the cabin roof
const BOAT: CamBox = { minX: -5, maxX: 4, minY: -0.4, maxY: 2.8, minZ: -1.6, maxZ: 1.6 };

describe('the zone camera keeps out of solids (improve pass phase 9)', () => {
  it('the knob: its default is the shipped constant, 0 is no check', () => {
    const k = FEEL_KNOB_BY_ID.get('venue.camClearView')!;
    expect(k.def).toBe(VENUE_CAM_CLEAR_VIEW);
    expect(k.min).toBe(0);
  });

  it('an eye inside the boat comes in along its own line to just short of it', () => {
    const chest = { x: 0, y: 0.7 + CAM_CHEST_Y, z: 9 };   // the player on the dock beside the boat, the camera swung over it
    const eye = { x: 0, y: 2, z: 0 };
    expect(inside(eye, BOAT)).toBe(true);
    const e = clearViewEye(chest, eye, [BOAT])!;
    expect(e).not.toBeNull();
    expect(inside(e, BOAT)).toBe(false);
    expect(e.z).toBeGreaterThan(BOAT.maxZ + CAM_CLEAR.room - 0.1);
    // on the chest → eye line: the aim's direction is kept, only the distance shortens
    const k = (e.z - chest.z) / (eye.z - chest.z);
    expect(e.x).toBeCloseTo(chest.x + (eye.x - chest.x) * k);
    expect(e.y).toBeCloseTo(chest.y + (eye.y - chest.y) * k);
  });

  it('a solid between you and the eye pulls it in; a clear view leaves it exactly where the director put it', () => {
    const chest = { x: 0, y: CAM_CHEST_Y, z: 0 };
    const eye = { x: 0, y: 3.2, z: -CAMERA_RIGS.follow.distance };
    expect(clearViewEye(chest, eye, [])).toBeNull();
    expect(clearViewEye(chest, eye, [{ minX: 5, maxX: 6, minY: 0, maxY: 6, minZ: -9, maxZ: -1 }])).toBeNull();   // off to the side
    const trunk: CamBox = { minX: -0.4, maxX: 0.4, minY: 0, maxY: 6, minZ: -4.4, maxZ: -3.6 };
    const e = clearViewEye(chest, eye, [trunk])!;
    expect(e.z).toBeGreaterThan(trunk.maxZ);
    expect(Math.hypot(e.x - chest.x, e.y - chest.y, e.z - chest.z)).toBeGreaterThanOrEqual(CAM_CLEAR.minPull - 1e-9);
  });

  it('a thin prop (insideOnly) only matters with the eye inside it: a palm between you and the eye leaves the camera be', () => {
    const chest = { x: 0, y: CAM_CHEST_Y, z: 0 };
    const palm: CamBox = { minX: -2, maxX: 2, minY: 0, maxY: 6, minZ: -4, maxZ: -2, insideOnly: true };
    expect(clearViewEye(chest, { x: 0, y: 3.2, z: -7.5 }, [palm])).toBeNull();
    const e = clearViewEye(chest, { x: 0, y: 3, z: -3 }, [palm])!;
    expect(inside(e, palm)).toBe(false);
    expect(e.z).toBeGreaterThan(palm.maxZ);
  });

  it('never closer than the minimum pull; a box round the chest (the ground you stand in) is not a blocker', () => {
    const chest = { x: 0, y: CAM_CHEST_Y, z: 0 };
    const eye = { x: 0, y: 3, z: -7 };
    const wall: CamBox = { minX: -3, maxX: 3, minY: 0, maxY: 5, minZ: -0.6, maxZ: -0.4 };
    const e = clearViewEye(chest, eye, [wall])!;
    expect(Math.hypot(e.x - chest.x, e.y - chest.y, e.z - chest.z)).toBeCloseTo(CAM_CLEAR.minPull, 5);
    expect(enterFraction(chest, eye, { minX: -1, maxX: 1, minY: 0, maxY: 2, minZ: -1, maxZ: 1 })).toBeNull();
  });

  it('a low rim the chest stands just above does not pull an eye looking down over it', () => {
    const chest = { x: 0, y: 1.0 + CAM_CHEST_Y, z: 0 };   // standing 1 m up (on a dais), the rim's top level with your feet
    const rim: CamBox = { minX: -5, maxX: 5, minY: 0, maxY: 1, minZ: -2, maxZ: -1 };
    expect(clearViewEye({ x: 0, y: CAM_CHEST_Y, z: 0 }, { x: 0, y: 3.2, z: -7.5 }, [rim])).toBeNull();
    expect(clearViewEye(chest, { x: 0, y: 4.2, z: -7.5 }, [rim])).toBeNull();
  });

  it('the Babylon side: thin instances give one box each; keepEyeClear moves the eye and keeps the aim', () => {
    const engine = new NullEngine();
    (engine.getCaps() as { instancedArrays: boolean }).instancedArrays = true;   // a browser has them; the NullEngine says it has not
    const scene = new Scene(engine);
    const cam = new TargetCamera('c', new Vector3(0, 2, 0), scene);
    cam.setTarget(new Vector3(0, 1.5, 9));
    const m = MeshBuilder.CreateBox('coast_prop_rock_0', { size: 1 }, scene) as Mesh;
    m.thinInstanceAdd([Matrix.Translation(0, 0.5, 0), Matrix.Translation(20, 0.5, 0)]);
    const boxes = meshCamBoxes(scene, (n) => n.startsWith('coast_prop_'));
    expect(boxes).toHaveLength(2);
    expect(boxes[1].minX).toBeCloseTo(19.5);
    expect(boxes.every((b) => b.insideOnly)).toBe(true);
    expect(boxesNear(boxes, 0, 0, 5)).toHaveLength(1);
    // a 3 m boulder where the eye is
    const big = MeshBuilder.CreateBox('coast_boat', { width: 3, height: 3, depth: 3 }, scene);
    big.position.set(0, 1.5, 0);
    const all = meshCamBoxes(scene, (n) => n === 'coast_boat');
    const aimBefore = cam.getTarget().clone();
    expect(keepEyeClear(cam, { x: 0, y: 0, z: 9 }, all)).toBe(true);
    expect(cam.position.z).toBeGreaterThan(1.5);
    expect(cam.getTarget().equalsWithEpsilon(aimBefore, 1e-6)).toBe(true);
    expect(keepEyeClear(cam, { x: 0, y: 0, z: 9 }, all)).toBe(false);   // clear now: left alone
    scene.dispose();
  });
});
