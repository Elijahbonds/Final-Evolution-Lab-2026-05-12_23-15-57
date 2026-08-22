'use client';

/**
 * components/three/venice-surround.tsx — M14-P7 Venice Court Environment
 *
 * Thin R3F skin over the PURE lib/render/venice-court.ts core. Rings the open
 * Venice court with procedural beach-playground dressing (chain-link fence,
 * corner palms, boardwalk benches, lamp posts) placed just outside the
 * navigable bounds, so the court stops floating in a bare sky backdrop.
 *
 * All geometry positions come from buildCourtSurround() — this file only maps
 * those placements onto lightweight three primitives. Open-air by design: props
 * sit at ground level and never occlude the sky / IBL above.
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { buildCourtSurround, type SurroundOptions, type PropPlacement } from '@/lib/render/venice-court';
import type { Vec3 } from '@/lib/render/environment';

function Palm({ scale = 1 }: { scale?: number }) {
  // Trunk + 6 radial fronds. Cheap but reads as a palm silhouette.
  const fronds = useMemo(() => Array.from({ length: 6 }, (_, i) => (i * Math.PI * 2) / 6), []);
  return (
    <group scale={[scale, scale, scale]}>
      <mesh position={[0, 2.6, 0]} castShadow={false} receiveShadow={false}>
        <cylinderGeometry args={[0.16, 0.28, 5.2, 8]} />
        <meshStandardMaterial color="#6b5136" roughness={0.9} metalness={0.02} />
      </mesh>
      <group position={[0, 5.1, 0]}>
        {fronds.map((a, i) => (
          <mesh key={i} rotation={[Math.PI / 3.2, a, 0]} position={[Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5]}>
            <coneGeometry args={[0.5, 2.6, 4]} />
            <meshStandardMaterial color="#1f7a4d" roughness={0.75} metalness={0.03} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Bench() {
  return (
    <group>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1.8, 0.12, 0.5]} />
        <meshStandardMaterial color="#3a4656" roughness={0.85} metalness={0.1} />
      </mesh>
      <mesh position={[-0.7, 0.25, 0]}>
        <boxGeometry args={[0.12, 0.5, 0.45]} />
        <meshStandardMaterial color="#2a3340" roughness={0.85} metalness={0.1} />
      </mesh>
      <mesh position={[0.7, 0.25, 0]}>
        <boxGeometry args={[0.12, 0.5, 0.45]} />
        <meshStandardMaterial color="#2a3340" roughness={0.85} metalness={0.1} />
      </mesh>
    </group>
  );
}

function FencePost() {
  return (
    <mesh position={[0, 1.1, 0]}>
      <cylinderGeometry args={[0.05, 0.05, 2.2, 6]} />
      <meshStandardMaterial color="#7d8894" roughness={0.6} metalness={0.5} />
    </mesh>
  );
}

function Lamp() {
  return (
    <group>
      <mesh position={[0, 2.4, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 4.8, 8]} />
        <meshStandardMaterial color="#4a4f57" roughness={0.5} metalness={0.6} />
      </mesh>
      <mesh position={[0, 4.9, 0]}>
        <sphereGeometry args={[0.28, 12, 12]} />
        <meshStandardMaterial color="#fff6d8" emissive="#ffe9a8" emissiveIntensity={2.4} roughness={0.3} />
      </mesh>
      <pointLight position={[0, 4.9, 0]} color="#ffe9a8" intensity={6} distance={14} decay={2} />
    </group>
  );
}

function Prop({ p }: { p: PropPlacement }) {
  return (
    <group position={p.position} rotation={[0, p.rotationY, 0]}>
      {p.kind === 'palm' && <Palm scale={p.scale} />}
      {p.kind === 'bench' && <Bench />}
      {p.kind === 'fencePost' && <FencePost />}
      {p.kind === 'lamp' && <Lamp />}
    </group>
  );
}

export interface VeniceSurroundProps {
  boundsMin: Vec3;
  boundsMax: Vec3;
  pad?: number;
  fencePostSpacing?: number;
  palmScale?: number;
  /** semi-transparent chain-link infill between posts (subtle). */
  showFenceMesh?: boolean;
}

export function VeniceSurround({
  boundsMin,
  boundsMax,
  pad,
  fencePostSpacing,
  palmScale,
  showFenceMesh = true,
}: VeniceSurroundProps) {
  const spec = useMemo(
    () => buildCourtSurround({ boundsMin, boundsMax, pad, fencePostSpacing, palmScale } as SurroundOptions),
    [boundsMin, boundsMax, pad, fencePostSpacing, palmScale],
  );

  const { minX, maxX, minZ, maxZ, floorY } = spec.perimeter;
  const midX = (minX + maxX) / 2;
  const midZ = (minZ + maxZ) / 2;
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const fenceH = 2.2;

  return (
    <group>
      {spec.props.map((p) => (
        <Prop key={p.id} p={p} />
      ))}

      {showFenceMesh && (
        <group>
          {/* North / South chain-link infill */}
          <mesh position={[midX, floorY + fenceH / 2, minZ]}>
            <planeGeometry args={[spanX, fenceH]} />
            <meshStandardMaterial color="#9aa6b2" roughness={0.6} metalness={0.4} transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <mesh position={[midX, floorY + fenceH / 2, maxZ]}>
            <planeGeometry args={[spanX, fenceH]} />
            <meshStandardMaterial color="#9aa6b2" roughness={0.6} metalness={0.4} transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          {/* East / West chain-link infill */}
          <mesh position={[minX, floorY + fenceH / 2, midZ]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[spanZ, fenceH]} />
            <meshStandardMaterial color="#9aa6b2" roughness={0.6} metalness={0.4} transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <mesh position={[maxX, floorY + fenceH / 2, midZ]} rotation={[0, Math.PI / 2, 0]}>
            <planeGeometry args={[spanZ, fenceH]} />
            <meshStandardMaterial color="#9aa6b2" roughness={0.6} metalness={0.4} transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        </group>
      )}
    </group>
  );
}

export default VeniceSurround;
