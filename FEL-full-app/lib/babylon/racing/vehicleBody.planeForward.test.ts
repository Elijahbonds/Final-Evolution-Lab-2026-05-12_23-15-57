// Every Aero Aces airframe points its nose along the velocity. The baked bodies used to wear a π yaw,
// which left the propeller on X while ArcadeFlight drives +Z, so the planes flew sideways. The toy fallback
// is built nose-+Z and is not dressed. This loads each mesh, mounts it the way dressVehicle does, and flies
// the same Euler the mode writes onto the root.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FreeCamera, Matrix, NullEngine, Scene, SceneLoader, TransformNode, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { forwardOf } from './ArcadeFlight';
import { buildToyPlane } from './toyPlane';
import { VEHICLE_BODIES, vehicleForwardYaw, type VehicleKind } from './vehicleBody';

const DEG = Math.PI / 180;
const NOSE_LIMIT = 10 * DEG;
const LEVEL_LIMIT = 8 * DEG;

interface Airframe {
  id: string;
  /** Propeller direction in the vehicle root's local space, after the load-time yaw. */
  nose: Vector3;
  /** Wing tips in that same space, so a straight-flight roll reads as their height difference. */
  left: Vector3;
  right: Vector3;
}

let scene: Scene;
const frames: Airframe[] = [];

function cloud(root: TransformNode): Vector3[] {
  const pts: Vector3[] = [];
  root.computeWorldMatrix(true);
  for (const m of root.getChildMeshes(false)) {
    const vd = m.getVerticesData('position');
    if (!vd) continue;
    m.computeWorldMatrix(true);
    const wm = m.getWorldMatrix();
    for (let i = 0; i < vd.length; i += 3) pts.push(Vector3.TransformCoordinates(new Vector3(vd[i], vd[i + 1], vd[i + 2]), wm));
  }
  return pts;
}

/** The shorter horizontal axis is the fuselage (these cartoon wings outspan the body). */
function fuselageAxis(pts: Vector3[]): 'x' | 'z' {
  const span = (axis: 'x' | 'z') => {
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) { const v = axis === 'x' ? p.x : p.z; if (v < lo) lo = v; if (v > hi) hi = v; }
    return hi - lo;
  };
  return span('x') < span('z') ? 'x' : 'z';
}

function endSlice(pts: Vector3[], axis: 'x' | 'z', sign: 1 | -1): Vector3[] {
  const get = (p: Vector3) => (axis === 'x' ? p.x : p.z);
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) { const v = get(p); if (v < lo) lo = v; if (v > hi) hi = v; }
  const reach = (hi - lo) * 0.08;
  return pts.filter((p) => (sign > 0 ? get(p) >= hi - reach : get(p) <= lo + reach));
}

/** Propeller / spinner: the fuselage end whose tip is the rounder disc. */
function noseOf(pts: Vector3[]): Vector3 {
  const axis = fuselageAxis(pts);
  const score = (sign: 1 | -1) => {
    const s = endSlice(pts, axis, sign);
    const u = (p: Vector3) => (axis === 'x' ? p.y : p.x);
    const v = (p: Vector3) => (axis === 'x' ? p.z : p.y);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of s) {
      const uu = u(p), vv = v(p);
      if (uu < u0) u0 = uu; if (uu > u1) u1 = uu;
      if (vv < v0) v0 = vv; if (vv > v1) v1 = vv;
    }
    const su = u1 - u0, sv = v1 - v0;
    const circ = Math.min(su, sv) / Math.max(su, sv, 1e-6);
    return circ * (su + sv) * 0.5;
  };
  const sign: 1 | -1 = score(1) >= score(-1) ? 1 : -1;
  const tip = endSlice(pts, axis, sign);
  const cen = tip.reduce((a, p) => a.addInPlace(p), Vector3.Zero()).scaleInPlace(1 / tip.length);
  const mid = pts.reduce((a, p) => a.addInPlace(p), Vector3.Zero()).scaleInPlace(1 / pts.length);
  return cen.subtract(mid).normalize();
}

function wingTips(pts: Vector3[], nose: Vector3): { left: Vector3; right: Vector3 } {
  // Wings are the long axis perpendicular to the nose, on the ground plane.
  const wing = Math.abs(nose.x) > Math.abs(nose.z) ? 'z' : 'x';
  const get = (p: Vector3) => (wing === 'x' ? p.x : p.z);
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) { const v = get(p); if (v < lo) lo = v; if (v > hi) hi = v; }
  const reach = (hi - lo) * 0.06;
  const mean = (s: Vector3[]) => s.reduce((a, p) => a.addInPlace(p), Vector3.Zero()).scaleInPlace(1 / s.length);
  return { left: mean(pts.filter((p) => get(p) <= lo + reach)), right: mean(pts.filter((p) => get(p) >= hi - reach)) };
}

function mount(kind: VehicleKind, id: string, imported: TransformNode): TransformNode {
  const root = new TransformNode(`plane_${id}`, scene);
  const body = new TransformNode(`plane_${id}_body`, scene);
  body.parent = root;
  body.rotation.y = vehicleForwardYaw(kind, id);
  imported.parent = body;
  root.computeWorldMatrix(true);
  return root;
}

async function loadGlb(id: string): Promise<Airframe> {
  const file = `${VEHICLE_BODIES.plane[id]}.plane.glb`;
  const b64 = readFileSync(path.resolve('public/models/vehicles', file)).toString('base64');
  const loaded = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + b64, scene, undefined, '.glb');
  const holder = new TransformNode(`import_${id}`, scene);
  for (const n of loaded.meshes) if (!n.parent) n.parent = holder;
  const root = mount('plane', id, holder);
  const pts = cloud(root);
  const nose = noseOf(pts);
  const wings = wingTips(pts, nose);
  return { id, nose, left: wings.left, right: wings.right };
}

/** The mode writes `root.rotation.set(-pitch, heading, -roll)`. */
function fly(frame: Airframe, heading: number, pitch: number, roll: number): { nose: Vector3; tilt: number } {
  const m = Matrix.RotationYawPitchRoll(heading, -pitch, -roll);
  const nose = Vector3.TransformNormal(frame.nose, m).normalize();
  const left = Vector3.TransformCoordinates(frame.left, m);
  const right = Vector3.TransformCoordinates(frame.right, m);
  const tilt = Math.atan2(right.y - left.y, Math.hypot(right.x - left.x, right.z - left.z));
  return { nose, tilt };
}

const STRAIGHT = [
  { name: 'level, heading 0', heading: 0, pitch: 0, roll: 0 },
  { name: 'level, heading 1.1', heading: 1.1, pitch: 0, roll: 0 },
] as const;
const TURNS = [
  { name: 'climb', heading: 0.4, pitch: 0.25, roll: 0 },
  { name: 'banked turn', heading: -0.8, pitch: 0.05, roll: 0.45 },
] as const;

beforeAll(async () => {
  scene = new Scene(new NullEngine());
  new FreeCamera('c', new Vector3(0, 2, -8), scene);
  for (const id of Object.keys(VEHICLE_BODIES.plane)) frames.push(await loadGlb(id));
  const toy = buildToyPlane(scene, 'fallback', '#e63946', '#ffd166');
  const pts = cloud(toy.root);
  // The prop blades make the nose slice a thin line, so the disc test picks the round tail tip.
  // The cowling is the nose of this primitive (authored at +Z, in front of the pilot).
  const cowl = toy.root.getChildMeshes(false).find((m) => m.name.includes('cowl'));
  if (!cowl) throw new Error('toy plane has no cowling');
  cowl.computeWorldMatrix(true);
  const nose = cowl.getAbsolutePosition().normalize();
  const wings = wingTips(pts, nose);
  frames.push({ id: 'toy-fallback', nose, left: wings.left, right: wings.right });
});

afterAll(() => { scene?.dispose(); });

describe('Aero Aces planes fly nose-first', () => {
  it('loads every garage airframe plus the toy fallback', () => {
    expect(frames.map((f) => f.id).sort()).toEqual([...Object.keys(VEHICLE_BODIES.plane), 'toy-fallback'].sort());
  });

  it('the nose stays within 10° of the velocity in straight flight and in turns, and the wings are level on a straight', () => {
    for (const frame of frames) {
      for (const leg of [...STRAIGHT, ...TURNS]) {
        const flown = fly(frame, leg.heading, leg.pitch, leg.roll);
        const vel = forwardOf({ heading: leg.heading, pitch: leg.pitch });
        const ang = Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(flown.nose, vel.normalize()))));
        expect(ang, `${frame.id} ${leg.name}`).toBeLessThan(NOSE_LIMIT);
      }
      for (const leg of STRAIGHT) {
        const flown = fly(frame, leg.heading, leg.pitch, leg.roll);
        expect(Math.abs(flown.tilt), `${frame.id} ${leg.name} roll`).toBeLessThan(LEVEL_LIMIT);
      }
    }
  });
});
