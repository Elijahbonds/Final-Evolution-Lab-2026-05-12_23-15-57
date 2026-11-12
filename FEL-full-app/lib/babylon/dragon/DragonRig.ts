// DragonRig — the Babylon side of the dragon ride: the three v5 LODs and the rider (elijah-hero.glb), one clip clock across LODs,
// the LOD forcing (dragonLod), the rider ↔ DR_Seat parenting (riderSeat), the Surf water morphs (surfMorphs) and the corrective
// drivers (correctiveMorphs), written every frame AFTER animation sampling and BEFORE skinning (onAfterAnimationsObservable).
// The flight path (Glide altitude, Dive arc, swoop / jump-off pass) is code: the caller places `root` each frame.
import {
  SceneLoader, TransformNode, type AnimationGroup, type AssetContainer, type MorphTargetManager, type Nullable, type Observer,
  type Quaternion, type Scene,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import {
  DRAGON_FPS, DRAGON_GLB_DIR, DRAGON_GLB_FILES, DR_SEAT, MORPH_NAMES, RIDER_GLB, type DragonClip,
} from './dragonRideConsts';
import { pickDragonLod, type DragonLod, type LodRanges } from './dragonLod';
import { SurfMorphDriver } from './surfMorphs';
import { correctiveWeights, type Quat } from './correctiveMorphs';
import { RiderSeatLink } from './riderSeat';

interface LodSet { container: AssetContainer; seat: TransformNode | null; groups: Map<string, AnimationGroup>; morphs: MorphTargetManager[]; thigh: TransformNode | null; wing: TransformNode | null }

const q4 = (q: Nullable<Quaternion> | undefined): Quat => (q ? [q.x, q.y, q.z, q.w] : [0, 0, 0, 1]);

export interface DragonRig {
  root: TransformNode;
  rider: TransformNode;
  link: RiderSeatLink;
  readonly lod: DragonLod;
  readonly clip: DragonClip | null;
  play(clip: DragonClip, o?: { loop?: boolean; speed?: number }): void;
  /** Camera distance this frame (drives the LOD pick with its forcing rules). */
  setCameraDistance(m: number): void;
  setSurfing(on: boolean): void;
  setDrivenTuckOrFold(on: boolean): void;
  /** The current clip frame (24 fps). */
  frame(): number;
  dispose(): void;
}

export async function loadDragonRig(scene: Scene, lodRanges: LodRanges): Promise<DragonRig> {
  const root = new TransformNode('dragonRide_root', scene);
  const sets: LodSet[] = [];
  for (const file of DRAGON_GLB_FILES) {
    const container = await SceneLoader.LoadAssetContainerAsync(DRAGON_GLB_DIR, file, scene);
    container.addAllToScene();
    for (const n of container.rootNodes) n.parent = root;
    const all = container.transformNodes;
    const seat = all.find((t) => t.name === DR_SEAT) ?? null;
    const groups = new Map(container.animationGroups.map((g) => { g.stop(); return [g.name, g] as const; }));
    const morphs = container.meshes.map((m) => m.morphTargetManager).filter((m): m is MorphTargetManager => !!m);
    sets.push({ container, seat, groups, morphs, thigh: all.find((t) => t.name === 'DR_HindThigh_L') ?? null, wing: all.find((t) => t.name === 'DR_WingUpper_L') ?? null });
  }
  const riderC = await SceneLoader.LoadAssetContainerAsync('', RIDER_GLB, scene);
  riderC.addAllToScene();
  const rider = new TransformNode('dragonRide_rider', scene);
  for (const n of riderC.rootNodes) n.parent = rider;

  let lod: DragonLod = 0, clip: DragonClip | null = null, loop = true, speed = 1, dist = 0, surfing = false, driven = false;
  const rest = sets.map((s) => ({ thigh: q4(s.thigh?.rotationQuaternion), wing: q4(s.wing?.rotationQuaternion) }));
  const show = (i: DragonLod) => sets.forEach((s, k) => s.container.meshes.forEach((m) => m.setEnabled(k === i)));
  const link = new RiderSeatLink({
    parent: () => { const seat = sets[lod].seat; if (seat) rider.setParent(seat); },
    unparent: () => rider.setParent(null),
  });
  const surf = new SurfMorphDriver();
  const groupOf = (i: DragonLod) => (clip ? sets[i].groups.get(clip) ?? null : null);

  const setLod = (next: DragonLod) => {
    if (next === lod) return;
    const from = groupOf(lod), to = groupOf(next);
    const at = from?.animatables[0]?.masterFrame ?? 0;
    from?.stop();
    if (to) { to.start(loop, speed); to.goToFrame(at); }
    if (link.parented) { const seat = sets[next].seat; if (seat) { const local = rider.position.clone(); rider.parent = seat; rider.position.copyFrom(local); } }
    lod = next; show(lod);
  };
  show(0);

  const obs: Nullable<Observer<Scene>> = scene.onAfterAnimationsObservable.add(() => {
    if (clip) setLod(pickDragonLod(dist, clip, lodRanges));
    const dt = scene.getEngine().getDeltaTime() / 1000;
    const sw = surf.update(dt, surfing);
    const s = sets[lod];
    const c = clip ?? 'DR_Glide_Loop';
    const cw = correctiveWeights(c, { drivenTuckOrFold: driven, thighRest: rest[lod].thigh, thigh: q4(s.thigh?.rotationQuaternion), wingRest: rest[lod].wing, wing: q4(s.wing?.rotationQuaternion) });
    for (const m of s.morphs) {
      for (let i = 0; i < m.numTargets; i++) {
        const t = m.getTarget(i), name = t.name as (typeof MORPH_NAMES)[number];
        if (name === 'wing_to_fin' || name === 'tail_fin' || name === 'water_spots') t.influence = sw[name];
        else if (cw.source !== 'keyed' && (name === 'corr_tuck_legs' || name === 'corr_wing_fold')) t.influence = cw[name];
      }
    }
  });

  return {
    root, rider, link,
    get lod() { return lod; },
    get clip() { return clip; },
    play(next, o = {}) {
      groupOf(lod)?.stop();
      clip = next; loop = o.loop ?? true; speed = o.speed ?? 1;
      groupOf(lod)?.start(loop, speed);
    },
    setCameraDistance(m) { dist = m; },
    setSurfing(on) { surfing = on; },
    setDrivenTuckOrFold(on) { driven = on; },
    frame() { const a = groupOf(lod)?.animatables[0]; return a ? (a.masterFrame / (a.getAnimations()[0]?.animation.framePerSecond ?? DRAGON_FPS)) * DRAGON_FPS : 0; },
    dispose() {
      scene.onAfterAnimationsObservable.remove(obs);
      for (const s of sets) s.container.dispose();
      riderC.dispose(); rider.dispose(); root.dispose();
    },
  };
}
