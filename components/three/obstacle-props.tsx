'use client';

/**
 * ObstacleProps — lightweight ambient obstacles + slow-patrolling "mob" figures
 * driven by the pure `lib/world/obstacle-field` core. Uses only cheap THREE
 * primitives (cones / boxes / capsules), so it adds life to a scene without the
 * cost of extra GLB avatars. Positions are deterministic from a seed.
 *
 * This is intentionally decorative (no gameplay collision) so it can be dropped
 * into any 3D mode safely. A mode that wants real collision can call
 * `resolveObstacleCollision` from the same core against `field.obstacles`.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  generateField,
  mobPositionAt,
  mobFacingAt,
  type FieldConfig,
  type ObstacleField,
} from '@/lib/world/obstacle-field';

interface ObstaclePropsProps {
  config: FieldConfig;
  seed?: number;
  floorY?: number;
  /** Colour for cones/props. */
  propColor?: string;
  /** Colour for the ambient patrolling figures. */
  mobColor?: string;
}

export function ObstacleProps({
  config,
  seed = 1337,
  floorY = 0,
  propColor = '#FFD700',
  mobColor = '#A855F7',
}: ObstaclePropsProps) {
  const field: ObstacleField = useMemo(() => generateField(config, seed), [config, seed]);
  const mobRefs = useRef<Array<THREE.Group | null>>([]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    for (let i = 0; i < field.mobs.length; i++) {
      const g = mobRefs.current[i];
      if (!g) continue;
      const p = mobPositionAt(field.mobs[i], t);
      g.position.set(p.x, floorY, p.z);
      // Capsule figures are symmetric, so plain tangent facing reads fine.
      g.rotation.y = mobFacingAt(field.mobs[i], t);
    }
  });

  return (
    <group>
      {field.obstacles.map((o) => {
        if (o.kind === 'cone') {
          return (
            <mesh key={o.id} position={[o.pos.x, floorY + 0.25, o.pos.z]}>
              <coneGeometry args={[o.radius, 0.5, 12]} />
              <meshStandardMaterial color={propColor} metalness={0.1} roughness={0.6} />
            </mesh>
          );
        }
        if (o.kind === 'barrier') {
          return (
            <mesh key={o.id} position={[o.pos.x, floorY + 0.3, o.pos.z]}>
              <boxGeometry args={[o.radius * 2, 0.6, 0.3]} />
              <meshStandardMaterial color={propColor} metalness={0.2} roughness={0.5} />
            </mesh>
          );
        }
        return (
          <mesh key={o.id} position={[o.pos.x, floorY + o.radius * 0.5, o.pos.z]}>
            <boxGeometry args={[o.radius, o.radius, o.radius]} />
            <meshStandardMaterial color={propColor} metalness={0.15} roughness={0.7} />
          </mesh>
        );
      })}

      {field.mobs.map((m, i) => (
        <group
          key={m.id}
          ref={(el) => {
            mobRefs.current[i] = el;
          }}
          position={[m.home.x, floorY, m.home.z]}
        >
          {/* Simple two-primitive figure: body capsule + head sphere. */}
          <mesh position={[0, 0.75, 0]}>
            <capsuleGeometry args={[0.22, 0.7, 4, 8]} />
            <meshStandardMaterial color={mobColor} metalness={0.1} roughness={0.6} />
          </mesh>
          <mesh position={[0, 1.4, 0]}>
            <sphereGeometry args={[0.2, 12, 12]} />
            <meshStandardMaterial color={mobColor} metalness={0.1} roughness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
