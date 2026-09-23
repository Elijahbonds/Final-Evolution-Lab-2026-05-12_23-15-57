// vehicleBody — the Meshy vehicle bodies on the kart and the aircraft (models pass phase 5, 2026-09-22).
//
// The kart and the toy plane were primitives ("there is no kart in public/models/meshy"). The owner's second drop is ten
// textured bodies — five karts, five cartoon planes — baked by scripts/meshy/batch-vehicles.sh to ~4 MB each. A body
// mounts UNDER the vehicle's root as a dressed child: the physics, the seat anchors and the mode's own handling of the
// root do not change; the primitive parts are hidden when the body arrives and stay if it never does (no placeholder
// gap — the primitives ARE the fallback). The bake put the nose toward −x with the kart's floor at y 0 and the plane
// centred; `yaw` turns the nose to the vehicle's +z.
import { SceneLoader, TransformNode, type AbstractMesh, type AssetContainer, type Scene } from '@babylonjs/core';

export type VehicleKind = 'kart' | 'plane';

/** Which baked body a garage pick wears. 'rival' is the fifth body of each drop, worn by the field. */
export const VEHICLE_BODIES: Record<VehicleKind, Record<string, string>> = {
  kart: { runabout: 'v-3f3497d3', slipstream: 'v-72c403b8', tailspin: 'v-c0217ad8', anvil: 'v-cc72c133', rival: 'v-f920e610' },
  plane: { trainer: 'v-70f39ad6', darter: 'v-7ba884aa', kestrel: 'v-94e199f7', bastion: 'v-9f7ec425', rival: 'v-d5a0bbed' },
};
export const vehicleBodyUrl = (kind: VehicleKind, id: string): string => `/models/vehicles/${VEHICLE_BODIES[kind][id] ?? VEHICLE_BODIES[kind].rival}.${kind}.glb`;

/** The bake's karts lie along x (nose −x) and the planes along z (the bake reported x 1.95 / z 1.4 for the karts, x 3.6 / z 4.5 for
 *  the planes); the modes drive +z. Per kind, verified on a frame. */
export const VEHICLE_BODY_YAW: Record<VehicleKind, number> = { kart: Math.PI / 2, plane: Math.PI };   // frames: the kart's wheel sat in front of the driver at π/2; the plane flew backwards at 0

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
  body.rotation.y = opts.yaw ?? VEHICLE_BODY_YAW[kind];
  body.position.y = opts.y ?? 0;
  for (const n of inst.rootNodes) n.parent = body;
  for (const m of body.getChildMeshes()) { m.isPickable = false; m.receiveShadows = true; }
  for (const m of opts.hide ?? []) m.setEnabled(false);
  console.info(`[FEL-VEHICLE] ${kind} ${id} wears ${url.split('/').pop()} (${body.getChildMeshes().length} meshes, ${opts.hide?.length ?? 0} primitives hidden)`);
  return { root: body, dispose: () => { for (const g of inst.animationGroups) g.dispose(); body.dispose(false, true); } };
}
