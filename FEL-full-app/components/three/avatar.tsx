'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useGLTFAsset } from './gltf-loader';
import { needsLightingFloor, lightingFloorPatch } from '@/lib/render/material-floor';

export type AvatarHandle = {
  group: THREE.Group;
  mixer: THREE.AnimationMixer;
  /** The "primary" action (first clip, or sub-clip). Games that only scrub use this. */
  action: THREE.AnimationAction;
  clipDuration: number;
  bone: (name: string) => THREE.Object3D | null;
  /** Scrub the primary clip to an absolute time in seconds (legacy). */
  scrub: (t: number) => void;
  /** Play a named animation clip (multi-clip GLBs). */
  play: (name: string, opts?: {
    loop?: boolean;
    timeScale?: number;
    fadeIn?: number;
    clampWhenFinished?: boolean;
    onFinish?: () => void;
  }) => THREE.AnimationAction | null;
  /** Stop all clips and optionally fade to a named clip. */
  stopAll: (fadeTo?: string, fadeTime?: number) => void;
  /** List of available clip names in this GLB. */
  clipNames: string[];
  /**
   * Live-update the playback rate of an already-running clip WITHOUT restarting
   * it. Used for stride-synced locomotion (cadence tracks ground speed). No-op
   * if the named clip is not currently running.
   */
  setTimeScale: (name: string, timeScale: number) => void;
};

/**
 * Loads a rigged GLB, clones it (SkeletonUtils preserves skin binding), builds
 * root-motion-stripped clips, and hands an imperative controller back to the
 * game scene. The game drives world position/height; the mocap drives body pose.
 *
 * MULTI-CLIP SUPPORT: if the GLB contains multiple animations, they are all
 * available via `handle.play(name)`. The first animation (or a sub-clip of it)
 * remains the "primary" action for backward-compatible scrub() usage.
 */
export function Avatar({
  url,
  clipName = 'dunk',
  subStartFrame,
  subEndFrame,
  clipFps = 30,
  stripRoot = true,
  tint,
  onReady,
}: {
  url: string;
  clipName?: string;
  subStartFrame?: number;
  subEndFrame?: number;
  clipFps?: number;
  stripRoot?: boolean;
  tint?: string;
  onReady?: (h: AvatarHandle) => void;
}) {
  const gltf = useGLTFAsset(url);
  const gl = useThree((s) => s.gl);

  const built = useMemo(() => {
    const root = skeletonClone(gltf.scene) as THREE.Object3D;
    root.traverse((o: any) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
        o.frustumCulled = false;
        if (o.material?.map) o.material.map.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
        if (o.material) {
          // Clone so we never mutate a shared/cached material.
          o.material = o.material.clone();
          const m: any = o.material;
          if (tint) m.color = new THREE.Color(tint);
          // ── M14 §2 lighting floor: no avatar surface may render pure black. ──
          // GLBs with NO authored materials (our low-poly NPC rigs) get three's
          // default MeshStandardMaterial (metalness=1, roughness=1), which reads
          // as solid black in a dark scene without an env map — this is the root
          // cause of the "invisible football defenders" regression. Detect that
          // default-metal case precisely (so well-authored hero materials are
          // untouched) and pull it back to a lit, readable PBR surface with a
          // small emissive ambient floor derived from its own colour.
          const probe = {
            isPhysical: m.isMeshStandardMaterial === true || m.isMeshPhysicalMaterial === true,
            metalness: typeof m.metalness === 'number' ? m.metalness : 0,
            roughness: typeof m.roughness === 'number' ? m.roughness : 1,
            hasColorMap: !!m.map,
            hasEnvMap: !!m.envMap,
          };
          if (needsLightingFloor(probe)) {
            const patch = lightingFloorPatch();
            m.metalness = patch.metalness;
            m.roughness = patch.roughness;
            if (m.emissive) {
              const base = tint ? new THREE.Color(tint) : (m.color ? m.color.clone() : new THREE.Color('#ffffff'));
              m.emissive = base.clone().multiplyScalar(patch.emissiveScale);
              m.emissiveIntensity = 1;
            }
            m.needsUpdate = true;
          }
        }
      }
    });

    // Drop the model so its feet rest on the group origin (y = 0).
    const box = new THREE.Box3().setFromObject(root);
    root.position.y -= box.min.y;

    const grp = new THREE.Group();
    grp.add(root);

    const boneMap = new Map<string, THREE.Object3D>();
    root.traverse((o) => { if ((o as any).isBone) boneMap.set(o.name, o); });

    const mixer = new THREE.AnimationMixer(root);

    // ── Strip Hips.position from ALL clips ──
    const processClip = (c: THREE.AnimationClip): THREE.AnimationClip => {
      const cl = c.clone();
      if (stripRoot) {
        cl.tracks = cl.tracks.filter((t) =>
          !/(^|\.|\b)Hips\.position$/i.test(t.name) && !/Hips\.position$/i.test(t.name)
        );
        cl.resetDuration();
      }
      return cl;
    };

    // ── Build action map for ALL animations ──
    const actionMap = new Map<string, THREE.AnimationAction>();
    const clipNames: string[] = [];
    for (const rawClip of gltf.animations) {
      const processed = processClip(rawClip);
      const act = mixer.clipAction(processed);
      act.enabled = true;
      actionMap.set(processed.name, act);
      clipNames.push(processed.name);
    }

    // ── Build primary action (backward compat: subclip or first clip) ──
    let primaryClip = gltf.animations[0] ?? null;
    if (primaryClip && subStartFrame != null && subEndFrame != null) {
      primaryClip = THREE.AnimationUtils.subclip(primaryClip, clipName, subStartFrame, subEndFrame, clipFps);
      if (stripRoot) {
        primaryClip.tracks = primaryClip.tracks.filter((t) =>
          !/(^|\.|\b)Hips\.position$/i.test(t.name) && !/Hips\.position$/i.test(t.name)
        );
        primaryClip.resetDuration();
      }
    } else if (primaryClip) {
      primaryClip = processClip(primaryClip);
    }

    let primaryAction: THREE.AnimationAction;
    if (primaryClip && subStartFrame != null && subEndFrame != null) {
      // sub-clip: create a dedicated action (not in the actionMap)
      primaryAction = mixer.clipAction(primaryClip);
    } else {
      // use the first action from the map
      primaryAction = actionMap.values().next().value as THREE.AnimationAction;
    }
    if (primaryAction) {
      primaryAction.play();
      primaryAction.paused = true;
      primaryAction.enabled = true;
    }

    return {
      scene: root, mixer, primaryAction, boneMap, group: grp,
      clipDuration: primaryClip?.duration ?? 0,
      actionMap, clipNames,
    };
  }, [gltf, gl, tint, url, clipName, subStartFrame, subEndFrame, clipFps, stripRoot]);

  const groupRef = useRef<THREE.Group>(null);
  const smoothTime = useRef(0);
  const finishListeners = useRef(new Map<THREE.AnimationAction, () => void>());

  // Listen for animation finished events
  useEffect(() => {
    const onFinished = (e: { action: THREE.AnimationAction }) => {
      const cb = finishListeners.current.get(e.action);
      if (cb) {
        finishListeners.current.delete(e.action);
        cb();
      }
    };
    built.mixer.addEventListener('finished', onFinished as any);
    return () => {
      built.mixer.removeEventListener('finished', onFinished as any);
    };
  }, [built.mixer]);

  useEffect(() => {
    if (!onReady) return;
    const { group, mixer, primaryAction: action, clipDuration, boneMap, actionMap, clipNames } = built;
    const handle: AvatarHandle = {
      group,
      mixer,
      action,
      clipDuration,
      clipNames,
      bone: (n) => boneMap.get(n) ?? null,
      scrub: (t) => {
        const target = THREE.MathUtils.clamp(t, 0, clipDuration);
        const current = smoothTime.current;
        smoothTime.current = current + (target - current) * Math.min(1, 18 * 0.016);
        action.paused = true;
        action.time = smoothTime.current;
        mixer.update(0);
      },
      play: (name, opts) => {
        const act = actionMap.get(name);
        if (!act) return null;
        const { loop = false, timeScale = 1, fadeIn = 0.15, clampWhenFinished = true, onFinish } = opts ?? {};
        // Fade out all currently playing actions
        actionMap.forEach((a) => {
          if (a !== act && a.isRunning()) {
            a.fadeOut(fadeIn);
          }
        });
        act.reset();
        act.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
        act.clampWhenFinished = clampWhenFinished;
        act.timeScale = timeScale;
        act.fadeIn(fadeIn);
        act.play();
        if (onFinish) {
          finishListeners.current.set(act, onFinish);
        }
        return act;
      },
      setTimeScale: (name, timeScale) => {
        const act = actionMap.get(name);
        if (act && act.isRunning()) {
          act.timeScale = timeScale;
        }
      },
      stopAll: (fadeTo, fadeTime = 0.2) => {
        actionMap.forEach((a) => a.fadeOut(fadeTime));
        if (fadeTo) {
          const target = actionMap.get(fadeTo);
          if (target) {
            target.reset();
            target.setLoop(THREE.LoopRepeat, Infinity);
            target.fadeIn(fadeTime);
            target.play();
          }
        }
      },
    };
    onReady(handle);
    return () => { mixer.stopAllAction(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [built]);

  // Keep mixer ticking for play()-driven animations
  useFrame((_, delta) => {
    built.mixer.update(delta);
  });

  return <primitive object={built.group} ref={groupRef} />;
}
