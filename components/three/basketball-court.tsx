'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AnimatedNet, type NetHandle } from '@/components/three/ball-flight-renderer';

/**
 * Shared basketball court furniture used by all Venice Blacktop 3D modes.
 * Includes: hoop + backboard + pole, court overlay lines, dust motes, glow ring.
 * Does NOT include the Meshy map GLB (that's loaded by MapMesh in Arena).
 */

// ---- Premium Hoop (reused from dunk-game-3d pattern) ----
export function PremiumHoop({ netRef, netHandle }: { netRef?: React.RefObject<THREE.Mesh>; netHandle?: React.MutableRefObject<NetHandle> }) {
  return (
    <group>
      {/* pole */}
      <mesh position={[0, 1.9, -0.95]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 3.8, 16]} />
        <meshStandardMaterial color={0x555566} metalness={0.85} roughness={0.25} />
      </mesh>
      {/* base plate */}
      <mesh position={[0, 0.02, -0.95]}>
        <cylinderGeometry args={[0.35, 0.4, 0.04, 16]} />
        <meshStandardMaterial color={0x444455} metalness={0.9} roughness={0.3} />
      </mesh>
      {/* support arm */}
      <mesh position={[0, 3.6, -0.45]} castShadow>
        <boxGeometry args={[0.06, 0.06, 0.95]} />
        <meshStandardMaterial color={0x555566} metalness={0.85} roughness={0.25} />
      </mesh>
      {/* backboard — frosted glass */}
      <mesh position={[0, 3.5, -0.5]} castShadow>
        <boxGeometry args={[1.83, 1.07, 0.04]} />
        <meshPhysicalMaterial
          color={0xffffff} transparent opacity={0.18}
          roughness={0.15} metalness={0.0} transmission={0.3} thickness={0.04}
          clearcoat={0.8} clearcoatRoughness={0.1} envMapIntensity={0.4} side={THREE.DoubleSide}
        />
      </mesh>
      {/* backboard frame */}
      <mesh position={[0, 3.5, -0.48]}>
        <boxGeometry args={[1.87, 1.11, 0.01]} />
        <meshStandardMaterial color={0x888899} metalness={0.7} roughness={0.3} transparent opacity={0.6} />
      </mesh>
      {/* target square */}
      <mesh position={[0, 3.32, -0.465]}>
        <boxGeometry args={[0.6, 0.45, 0.005]} />
        <meshBasicMaterial color={0xff3366} transparent opacity={0.85} />
      </mesh>
      {/* target square glow */}
      <mesh position={[0, 3.32, -0.46]}>
        <boxGeometry args={[0.64, 0.49, 0.002]} />
        <meshBasicMaterial color={0xff3366} transparent opacity={0.15} />
      </mesh>
      {/* rim */}
      <mesh position={[0, 3.05, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.23, 0.025, 12, 32]} />
        <meshStandardMaterial color={0xff6a2a} emissive={0xff3300} emissiveIntensity={0.8} metalness={0.7} roughness={0.2} />
      </mesh>
      {/* rim glow */}
      <mesh position={[0, 3.05, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.23, 0.035, 8, 32]} />
        <meshBasicMaterial color={0xff5500} transparent opacity={0.2} />
      </mesh>
      {/* net — animated (through-rim swish) when a netHandle is supplied, else static */}
      {netHandle ? (
        <AnimatedNet handle={netHandle} position={[0, 2.83, 0]} />
      ) : (
        <mesh ref={netRef} position={[0, 2.83, 0]}>
          <cylinderGeometry args={[0.22, 0.10, 0.44, 20, 4, true]} />
          <meshBasicMaterial color={0xffffff} wireframe transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

// ---- Court line overlay (placed over Meshy map) ----
export function CourtLineOverlay() {
  const geo = useMemo(() => {
    const pts: number[] = [];
    const Y = 0.012;
    const add = (x1: number, z1: number, x2: number, z2: number) => { pts.push(x1, Y, z1, x2, Y, z2); };
    add(-2.4, -0.3, 2.4, -0.3); add(-2.4, -0.3, -2.4, 5.2); add(2.4, -0.3, 2.4, 5.2); add(-2.4, 5.2, 2.4, 5.2);
    const R = 2.4;
    for (let i = 0; i <= 32; i++) {
      const a0 = Math.PI * (i / 32), a1 = Math.PI * ((i + 1) / 32);
      add(Math.cos(a0) * R, 5.2 + Math.sin(a0) * R, Math.cos(a1) * R, 5.2 + Math.sin(a1) * R);
    }
    const R3 = 6.75;
    for (let i = 0; i <= 40; i++) {
      const a0 = Math.PI * 0.15 + (Math.PI * 0.7) * (i / 40);
      const a1 = Math.PI * 0.15 + (Math.PI * 0.7) * ((i + 1) / 40);
      add(Math.cos(a0) * R3, 0.5 + Math.sin(a0) * R3, Math.cos(a1) * R3, 0.5 + Math.sin(a1) * R3);
    }
    add(-12, 14, 12, 14);
    const Rc = 1.8;
    for (let i = 0; i <= 32; i++) {
      const a0 = (2 * Math.PI * i) / 32, a1 = (2 * Math.PI * (i + 1)) / 32;
      add(Math.cos(a0) * Rc, 14 + Math.sin(a0) * Rc, Math.cos(a1) * Rc, 14 + Math.sin(a1) * Rc);
    }
    add(-12, -5, -12, 33); add(12, -5, 12, 33);
    add(-12, -5, 12, -5); add(-12, 33, 12, 33);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, []);

  return (
    <group>
      <lineSegments geometry={geo}>
        <lineBasicMaterial color={0x00e5ff} transparent opacity={0.45} />
      </lineSegments>
      <lineSegments geometry={geo}>
        <lineBasicMaterial color={0x00e5ff} transparent opacity={0.1} linewidth={2} />
      </lineSegments>
    </group>
  );
}

// ---- Dust motes ----
export function DustMotes({ count = 50 }: { count?: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const data = useMemo(() => {
    const d = [];
    for (let i = 0; i < count; i++) {
      d.push({
        x: (Math.random() - 0.5) * 16, y: Math.random() * 5 + 0.5, z: (Math.random() - 0.5) * 20,
        speed: 0.1 + Math.random() * 0.2, phase: Math.random() * Math.PI * 2,
      });
    }
    return d;
  }, [count]);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const t = clock.elapsedTime;
    data.forEach((d, i) => {
      dummy.position.set(
        d.x + Math.sin(t * d.speed + d.phase) * 0.5,
        d.y + Math.sin(t * d.speed * 0.7 + d.phase) * 0.3,
        d.z + Math.cos(t * d.speed * 0.5 + d.phase) * 0.4,
      );
      const s = 0.015 + Math.sin(t * 2 + d.phase) * 0.008;
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined as any, undefined as any, count]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color={0xffffff} transparent opacity={0.25} />
    </instancedMesh>
  );
}

// ---- Hoop glow ring ----
export function HoopGlow() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    (ref.current.material as THREE.MeshBasicMaterial).opacity = 0.08 + Math.sin(clock.elapsedTime * 1.5) * 0.03;
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} position={[0, 0.003, 0]}>
      <circleGeometry args={[1.8, 32]} />
      <meshBasicMaterial color={0xff5500} transparent opacity={0.08} />
    </mesh>
  );
}

// ---- Basketball ball mesh ----
export function Basketball({ ballRef }: { ballRef: React.RefObject<THREE.Mesh> }) {
  return (
    <mesh ref={ballRef} castShadow>
      <sphereGeometry args={[0.12, 24, 24]} />
      <meshStandardMaterial color={0xff6b35} roughness={0.65} metalness={0.1} />
    </mesh>
  );
}
