'use client';

/**
 * rival-figure.tsx — M12.1 shared stylized opponent.
 * ==================================================
 * A lightweight, primitive-built humanoid used as the visible on-court rival
 * for the hoops modes (dunk contest, 1v1). Before M12 the opponent existed only
 * as an abstract score counter, so the rival appeared to "score from an empty
 * court". This figure gives the opponent a physical presence: it idles on the
 * court during the player's turn and can be posed (crouch / arm-raise / jump)
 * to visibly attack the rim on its own turn.
 *
 * Deliberately geometry-only (no GLB / mixer) to stay well within the perf
 * budget when rendered alongside the hero avatar and the environment scan.
 */

import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';

export interface RivalHandle {
  /** Root group — move / rotate this to place the rival in the world. */
  group: THREE.Group;
  /**
   * Pose the figure.
   * @param crouch   0..1 — bends knees and lowers the torso (wind-up before a jump)
   * @param armRaise 0..1 — raises the right arm overhead (reach / slam)
   */
  setPose: (crouch: number, armRaise: number) => void;
}

export const RivalFigure = forwardRef<RivalHandle, {
  color?: string;
  accent?: string;
  onReady?: (h: RivalHandle) => void;
}>(function RivalFigure({ color = '#FF3366', accent = '#15151b', onReady }, ref) {
  const group = useRef<THREE.Group>(null!);
  const torso = useRef<THREE.Group>(null!);
  const rArm = useRef<THREE.Group>(null!);
  const lLeg = useRef<THREE.Group>(null!);
  const rLeg = useRef<THREE.Group>(null!);

  const jersey = useMemo(
    () => new THREE.MeshStandardMaterial({
      color, roughness: 0.55, metalness: 0.1,
      emissive: new THREE.Color(color), emissiveIntensity: 0.28,
    }),
    [color],
  );
  const dark = useMemo(
    () => new THREE.MeshStandardMaterial({ color: accent, roughness: 0.85, metalness: 0.05 }),
    [accent],
  );

  useImperativeHandle(ref, () => {
    const h: RivalHandle = {
      get group() { return group.current; },
      setPose: (crouch, armRaise) => {
        const c = Math.max(0, Math.min(1, crouch));
        const a = Math.max(0, Math.min(1, armRaise));
        if (torso.current) torso.current.position.y = 1.1 - c * 0.32;
        if (lLeg.current) lLeg.current.rotation.x = c * 0.6;
        if (rLeg.current) rLeg.current.rotation.x = -c * 0.6;
        if (rArm.current) rArm.current.rotation.x = -a * Math.PI * 0.92;
      },
    };
    onReady?.(h);
    return h;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onReady]);

  return (
    <group ref={group}>
      {/* Torso group pivots at the hips so a crouch lowers the whole upper body. */}
      <group ref={torso} position={[0, 1.1, 0]}>
        <mesh castShadow material={jersey}>
          <capsuleGeometry args={[0.28, 0.6, 6, 12]} />
        </mesh>
        <mesh position={[0, 0.62, 0]} castShadow material={dark}>
          <sphereGeometry args={[0.22, 16, 16]} />
        </mesh>
        {/* Left arm — static, hanging down. */}
        <group position={[-0.34, 0.28, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow material={jersey}>
            <capsuleGeometry args={[0.09, 0.55, 4, 8]} />
          </mesh>
        </group>
        {/* Right arm — pivots at the shoulder for the reach / slam. */}
        <group ref={rArm} position={[0.34, 0.28, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow material={jersey}>
            <capsuleGeometry args={[0.09, 0.55, 4, 8]} />
          </mesh>
        </group>
      </group>
      {/* Legs pivot at the hips. */}
      <group ref={lLeg} position={[-0.14, 0.75, 0]}>
        <mesh position={[0, -0.38, 0]} castShadow material={dark}>
          <capsuleGeometry args={[0.11, 0.6, 4, 8]} />
        </mesh>
      </group>
      <group ref={rLeg} position={[0.14, 0.75, 0]}>
        <mesh position={[0, -0.38, 0]} castShadow material={dark}>
          <capsuleGeometry args={[0.11, 0.6, 4, 8]} />
        </mesh>
      </group>
    </group>
  );
});
