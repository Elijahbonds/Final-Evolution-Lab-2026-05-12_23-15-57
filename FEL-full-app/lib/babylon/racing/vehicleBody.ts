// vehicleBody — the Meshy vehicle bodies on the kart and the aircraft (models pass phase 5, 2026-09-22).
//
// The kart and the toy plane were primitives ("there is no kart in public/models/meshy"). The owner's second drop is ten
// textured bodies — five karts, five cartoon planes — baked by scripts/meshy/batch-vehicles.sh to ~4 MB each. A body
// mounts UNDER the vehicle's root as a dressed child: the physics, the seat anchors and the mode's own handling of the
// root do not change; the primitive parts are hidden when the body arrives and stay if it never does (no placeholder
// gap — the primitives ARE the fallback). The kart's floor sits at y 0 and the plane is centred. `vehicleForwardYaw`
// turns each body's nose onto the vehicle's +z; the flight and kart code never add a second correction.
import { SceneLoader, TransformNode, type AbstractMesh, type AssetContainer, type Scene } from '@babylonjs/core';

export type VehicleKind = 'kart' | 'plane';

/** Which baked body a garage pick wears. 'rival' is the fifth body of each drop, worn by the field. */
export const VEHICLE_BODIES: Record<VehicleKind, Record<string, string>> = {
  kart: { runabout: 'v-3f3497d3', slipstream: 'v-72c403b8', tailspin: 'v-c0217ad8', anvil: 'v-cc72c133', rival: 'v-f920e610' },
  plane: { trainer: 'v-70f39ad6', darter: 'v-7ba884aa', kestrel: 'v-94e199f7', bastion: 'v-9f7ec425', rival: 'v-d5a0bbed' },
};
export const vehicleBodyUrl = (kind: VehicleKind, id: string): string => `/models/vehicles/${VEHICLE_BODIES[kind][id] ?? VEHICLE_BODIES[kind].rival}.${kind}.glb`;

/**
 * Yaw applied to each baked body so its nose lies on the vehicle's +Z.
 * The modes steer +Z (`forwardOf`, kart `heading`). This is the only place a mesh axis is corrected.
 *
 * Measured after Babylon's glTF import (the loader root is a 180° yaw plus a Z mirror, so these are not the file axes):
 *  - Every kart's nose sits on −X. +π/2 puts it on +Z (the wheel-in-front frame check from when the bodies landed).
 *  - Every plane's propeller sits on +X and the wings run along Z (trainer, darter, kestrel, bastion, rival — same bake).
 *    π spun that propeller onto −X, so the nose stayed sideways to the velocity. −π/2 brings it to +Z.
 */
const KART_NOSE_YAW = Math.PI / 2;
const PLANE_NOSE_YAW = -Math.PI / 2;
export const VEHICLE_FORWARD_YAW: Record<VehicleKind, Readonly<Record<string, number>>> = {
  kart: { runabout: KART_NOSE_YAW, slipstream: KART_NOSE_YAW, tailspin: KART_NOSE_YAW, anvil: KART_NOSE_YAW, rival: KART_NOSE_YAW },
  plane: { trainer: PLANE_NOSE_YAW, darter: PLANE_NOSE_YAW, kestrel: PLANE_NOSE_YAW, bastion: PLANE_NOSE_YAW, rival: PLANE_NOSE_YAW },
};

/** The yaw for this garage id. An unknown id wears the rival body's axis — `dressVehicle` loads that mesh too. */
export function vehicleForwardYaw(kind: VehicleKind, id: string): number {
  return VEHICLE_FORWARD_YAW[kind][id] ?? VEHICLE_FORWARD_YAW[kind].rival;
}

const containers = new WeakMap<Scene, Map<string, Promise<AssetContainer | null>>>();
function loadBody(scene: Scene, url: string): Promise<AssetContainer | null> {
  let cache = containers.get(scene);
  if (!cache) { cache = new Map(); containers.set(scene, cache); }
  let p = cache.get(url);
  if (!p) {
    const i = url.lastIndexOf('/');
    p = SceneLoader.LoadAssetContainerAsync(url.slice(0, i + 1), url.slice(i + 1), scene).catch((e: unknown) => {
      console.warn(`[FEL-VEHICLE] body ${url} did not load (the primitives stay): ${(e as Error)?.message ?? e}`);
      cache!.delete(url);
      return null;
    });
    cache.set(url, p);
  }
  return p;
}

export interface VehicleBodyHandle { root: TransformNode; dispose(): void }

/** Mount the baked body under `root`; hide `hide` when it arrives. Resolves null (nothing hidden) if the file is missing. */
export async function dressVehicle(scene: Scene, root: TransformNode, kind: VehicleKind, id: string, opts: { hide?: AbstractMesh[]; yaw?: number; y?: number } = {}): Promise<VehicleBodyHandle | null> {
  const url = vehicleBodyUrl(kind, id);
  const c = await loadBody(scene, url);
  if (!c || scene.isDisposed || root.isDisposed()) return null;
  const inst = c.instantiateModelsToScene((n) => `${root.name}_body_${n}`, false, { doNotInstantiate: true });
  const body = new TransformNode(`${root.name}_body`, scene);
  body.parent = root;
  body.rotation.y = opts.yaw ?? vehicleForwardYaw(kind, id);
  body.position.y = opts.y ?? 0;
  for (const n of inst.rootNodes) n.parent = body;
  for (const m of body.getChildMeshes()) { m.isPickable = false; m.receiveShadows = true; }
  for (const m of opts.hide ?? []) m.setEnabled(false);
  console.info(`[FEL-VEHICLE] ${kind} ${id} wears ${url.split('/').pop()} (${body.getChildMeshes().length} meshes, ${opts.hide?.length ?? 0} primitives hidden)`);
  return { root: body, dispose: () => { for (const g of inst.animationGroups) g.dispose(); body.dispose(false, true); } };
}
