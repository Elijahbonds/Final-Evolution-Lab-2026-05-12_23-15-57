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
 * IMPROVE (2026-10-06), aeroaces #20: A LIGHTER RIVAL. Every baked body carries three 2048² JPEG maps (base colour,
 * metal-rough, normal): ~2.5 MB of the ~3 MB file and ~64 MB of GPU memory with mips, per body. The field's plane is
 * seen from a chase camera, tens of metres off, so its LOD carries the same mesh with the maps at 1024²
 * (scripts/meshy/vehicle-lod.mts makes it): ~1.1 MB on the wire, ~16 MB on the GPU. Opt-in per call (`lod`), and a
 * missing LOD file falls back to the full body.
 */
export const VEHICLE_LOD: Partial<Record<VehicleKind, Record<string, string>>> = {
  plane: { rival: 'v-d5a0bbed-lod1' },
};
export const vehicleLodUrl = (kind: VehicleKind, id: string): string | null => {
  const f = VEHICLE_LOD[kind]?.[id];
  return f ? `/models/vehicles/${f}.${kind}.glb` : null;
};

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

/**
 * IMPROVE (2026-10-06), aeroaces #17: INSTANCED BODIES. A field of seven planes wearing the same body cloned the GLB
 * seven times (`doNotInstantiate: true`): seven meshes, seven draws, seven shadow draws per cascade. With `instance`,
 * the first body dressed from a file is cloned as before and becomes the TEMPLATE; every later one is a hardware
 * instance of it (`instantiateHierarchy`), which Babylon draws in one call. Safe for these bodies because they share
 * one material and nothing tints a body per racer (cloneMaterials was already false — the clones shared it anyway).
 * A template whose meshes are gone (its racer disposed) is replaced by the next clone.
 */
const templates = new WeakMap<Scene, Map<string, TransformNode>>();
function liveTemplate(scene: Scene, url: string): TransformNode | null {
  const t = templates.get(scene)?.get(url) ?? null;
  if (!t || t.isDisposed()) return null;
  const meshes = t.getChildMeshes();
  return meshes.length && meshes.every((m) => !m.isDisposed()) ? t : null;
}

/** Mount the baked body under `root`; hide `hide` when it arrives. Resolves null (nothing hidden) if the file is missing.
 *  `lod`: wear the kind's lighter body where there is one (#20). `instance`: share one drawn body across every racer
 *  dressed from the same file (#17). Both opt-in; the default is exactly the old clone. */
export async function dressVehicle(scene: Scene, root: TransformNode, kind: VehicleKind, id: string, opts: { hide?: AbstractMesh[]; yaw?: number; y?: number; lod?: boolean; instance?: boolean } = {}): Promise<VehicleBodyHandle | null> {
  const full = vehicleBodyUrl(kind, id);
  const lodUrl = opts.lod ? vehicleLodUrl(kind, id) : null;
  let url = lodUrl ?? full;
  let c = await loadBody(scene, url);
  if (!c && lodUrl) { url = full; c = await loadBody(scene, full); }   // no LOD on disk: the full body, as before
  if (!c || scene.isDisposed || root.isDisposed()) return null;
  const yaw = opts.yaw ?? vehicleForwardYaw(kind, id);
  const template = opts.instance ? liveTemplate(scene, url) : null;
  let body: TransformNode;
  let groups: { dispose(): void }[] = [];
  if (template) {
    body = template.instantiateHierarchy(root, { doNotInstantiate: false }) as TransformNode;
    body.name = `${root.name}_body`;
  } else {
    const inst = c.instantiateModelsToScene((n) => `${root.name}_body_${n}`, false, { doNotInstantiate: true });
    groups = inst.animationGroups;
    body = new TransformNode(`${root.name}_body`, scene);
    body.parent = root;
    for (const n of inst.rootNodes) n.parent = body;
    if (opts.instance) {
      let byUrl = templates.get(scene);
      if (!byUrl) { byUrl = new Map(); templates.set(scene, byUrl); }
      byUrl.set(url, body);
    }
  }
  body.rotation.y = yaw;
  body.position.y = opts.y ?? 0;
  for (const m of body.getChildMeshes()) { m.isPickable = false; m.receiveShadows = true; }
  for (const m of opts.hide ?? []) m.setEnabled(false);
  console.info(`[FEL-VEHICLE] ${kind} ${id} wears ${url.split('/').pop()} (${body.getChildMeshes().length} meshes${template ? ', instanced' : ''}, ${opts.hide?.length ?? 0} primitives hidden)`);
  // an instance must never take the shared material with it; a clone keeps the old dispose
  return { root: body, dispose: () => { for (const g of groups) g.dispose(); body.dispose(false, !template && !opts.instance); } };
}
