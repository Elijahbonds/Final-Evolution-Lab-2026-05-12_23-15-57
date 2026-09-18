'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { buildEnclosure, type EnclosureOptions } from '@/lib/render/environment';

/* ================================================================
   M14-P6 — Enclosure
   ----------------------------------------------------------------
   Renders the 4 inward-facing perimeter walls (plus optional ceiling)
   computed by the PURE buildEnclosure() core, so an indoor venue reads
   as a real room instead of an open void behind the backdrop.

   Deliberately additive & low-regression:
     • walls sit at the perimeter of the navigable bounds (behind the
       action and existing dressing), tinted dark and matte,
     • they do NOT cast shadows (perf) but can receive them,
     • the scene skybox/IBL still shows above the wall height.
   ================================================================ */

export interface EnclosureProps extends EnclosureOptions {
  color?: string;
  opacity?: number;
  receiveShadow?: boolean;
  ceilingColor?: string;
}

export function Enclosure({
  color = '#0c0a14',
  opacity = 1,
  receiveShadow = true,
  ceilingColor,
  ...opts
}: EnclosureProps) {
  const spec = useMemo(() => buildEnclosure(opts), [
    opts.boundsMin,
    opts.boundsMax,
    opts.height,
    opts.pad,
    opts.ceiling,
  ]);

  const transparent = opacity < 1;

  return (
    <group>
      {spec.walls.map((w) => (
        <mesh
          key={w.id}
          position={w.position}
          rotation={[0, w.rotationY, 0]}
          receiveShadow={receiveShadow}
        >
          <planeGeometry args={[w.width, w.height]} />
          <meshStandardMaterial
            color={color}
            roughness={0.95}
            metalness={0.02}
            side={THREE.FrontSide}
            transparent={transparent}
            opacity={opacity}
          />
        </mesh>
      ))}
      {spec.ceiling && (
        <mesh
          position={spec.ceiling.position}
          rotation={[Math.PI / 2, 0, 0]}
          receiveShadow={false}
        >
          <planeGeometry args={[spec.ceiling.width, spec.ceiling.depth]} />
          <meshStandardMaterial
            color={ceilingColor ?? color}
            roughness={0.98}
            metalness={0.0}
            side={THREE.BackSide}
          />
        </mesh>
      )}
    </group>
  );
}

export default Enclosure;
