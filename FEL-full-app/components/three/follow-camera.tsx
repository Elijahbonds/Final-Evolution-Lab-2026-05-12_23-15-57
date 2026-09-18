'use client';

import { useRef, useEffect, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { applyLookInput, orbitOffset, type OrbitState, type LookDirs } from '@/lib/camera/rigs';
import { LOOK_KEYS } from '@/lib/input-schemes';

/**
 * Smooth third-person follow camera with AABB collision handling.
 * Tracks a moving target (the player) with critically-damped interpolation.
 * If boundsMin/boundsMax are provided, clamps the camera position to stay
 * within the navigable volume and above floorY / below ceilingY.
 */
export function FollowCamera({
  target,
  offset,
  lookHeight = 1.4,
  lookOffsetX = 0,
  lookOffsetZ = 0,
  stiffness = 5,
  boundsMin,
  boundsMax,
  floorY,
  ceilingY,
  enableLook = false,
}: {
  target: MutableRefObject<THREE.Vector3>;
  offset: THREE.Vector3;
  lookHeight?: number;
  lookOffsetX?: number;
  lookOffsetZ?: number;
  stiffness?: number;
  boundsMin?: THREE.Vector3;
  boundsMax?: THREE.Vector3;
  floorY?: number;
  ceilingY?: number;
  /**
   * Opt-in right-stick free-look (P4). When true, the camera can be swung about
   * the player with the right stick / on-screen look pad (the shared LOOK_KEYS).
   * The orbit auto-recenters to zero when there is no look input, so framing is
   * IDENTICAL to the classic follow cam whenever the player is not looking
   * around. Default false → zero regression for scenes that do not opt in.
   */
  enableLook?: boolean;
}) {
  const cam = useThree((s) => s.camera);
  const desired = useRef(new THREE.Vector3());
  const lookCur = useRef<THREE.Vector3 | null>(null);
  const lookTgt = useRef(new THREE.Vector3());
  const orbit = useRef<OrbitState>({ yaw: 0, pitch: 0 });
  const lookDirs = useRef<LookDirs>({});
  const rotatedOffset = useRef(new THREE.Vector3());

  // Listen for the shared LOOK keys (dispatched by the physical right stick and
  // the on-screen look pad through the unified synthetic-keyboard bridge).
  useEffect(() => {
    if (!enableLook) return;
    const set = (k: string, down: boolean) => {
      if (k === LOOK_KEYS.left) lookDirs.current.left = down;
      else if (k === LOOK_KEYS.right) lookDirs.current.right = down;
      else if (k === LOOK_KEYS.up) lookDirs.current.up = down;
      else if (k === LOOK_KEYS.down) lookDirs.current.down = down;
    };
    const kd = (e: KeyboardEvent) => set(e.key, true);
    const ku = (e: KeyboardEvent) => set(e.key, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, [enableLook]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const t = target.current;

    // Apply right-stick orbit to the camera offset (identity when centered).
    let effOffset: THREE.Vector3 = offset;
    if (enableLook) {
      orbit.current = applyLookInput(orbit.current, lookDirs.current, dt);
      const ro = orbitOffset({ x: offset.x, y: offset.y, z: offset.z }, orbit.current);
      rotatedOffset.current.set(ro.x, ro.y, ro.z);
      effOffset = rotatedOffset.current;
    }

    // Compute desired camera position
    desired.current.copy(t).add(effOffset);

    // --- COLLISION: clamp to navigable AABB ---
    if (boundsMin && boundsMax) {
      desired.current.x = Math.max(boundsMin.x, Math.min(boundsMax.x, desired.current.x));
      desired.current.z = Math.max(boundsMin.z, Math.min(boundsMax.z, desired.current.z));
    }
    // Floor / ceiling clamp
    if (floorY !== undefined) {
      desired.current.y = Math.max(floorY + 1.0, desired.current.y); // minimum 1m above floor
    }
    if (ceilingY !== undefined) {
      desired.current.y = Math.min(ceilingY - 0.5, desired.current.y);
    }

    // Smooth interpolation
    const k = 1 - Math.exp(-stiffness * dt);
    cam.position.lerp(desired.current, k);

    // Look target with smooth tracking
    lookTgt.current.set(t.x + lookOffsetX, t.y + lookHeight, t.z + lookOffsetZ);
    if (!lookCur.current) lookCur.current = lookTgt.current.clone();
    lookCur.current.lerp(lookTgt.current, k);
    cam.lookAt(lookCur.current);
  });

  return null;
}
