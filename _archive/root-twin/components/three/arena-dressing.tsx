'use client';

/**
 * components/three/arena-dressing.tsx
 * ===================================
 * M13 game-feel — shared "living scene" dressing used by every arena mode so
 * courts/fields/dojos no longer read as dead islands floating in a void.
 *
 * Three pieces, all procedural (no external assets, no AI credits):
 *   1. Bleachers   — tiered stand geometry (steps + risers + back wall).
 *   2. CrowdStand  — an InstancedMesh of spectator figures seated on the
 *                    tiers that bob/cheer each frame so the crowd feels alive.
 *   3. VeniceBackdrop — a gradient sky dome + boardwalk skyline silhouette +
 *                    ocean/ground horizon band, so the Venice court has a real
 *                    horizon instead of an "outer-space island" black abyss.
 *
 * Budget-friendly: crowd is a single InstancedMesh per stand; the backdrop is
 * a handful of unlit quads/dome. No extra dynamic lights are added.
 */

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/* ---------------------------------------------------------------- utilities */

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CROWD_PALETTE = [
  '#00E5FF', '#FF3366', '#00FF9D', '#A855F7', '#FFD700',
  '#f5f5f5', '#ff8a3d', '#4dd0e1', '#e57373', '#9ccc65',
];

/* ---------------------------------------------------------------- bleachers */

export interface StandConfig {
  /** Center of the stand's front edge, world space. */
  position: [number, number, number];
  /** Y-rotation (radians) — stand faces toward -local Z (the action). */
  rotationY?: number;
  /** Along-stand width (meters). */
  width?: number;
  /** Number of tiers (rows). */
  tiers?: number;
  /** Spectators per tier. */
  perTier?: number;
  /** Depth per tier (how far each row steps back). */
  tierDepth?: number;
  /** Height gained per tier. */
  tierRise?: number;
  /** Deterministic seed. */
  seed?: number;
  /** Structure color. */
  color?: string;
}

const DEFAULTS = {
  width: 26, tiers: 6, perTier: 26, tierDepth: 1.15, tierRise: 0.9,
  seed: 1234, color: '#161a24',
};

/** Tiered stand structure (steps + back wall). Static geometry. */
function Bleachers({ cfg }: { cfg: Required<StandConfig> }) {
  const { width, tiers, tierDepth, tierRise, color } = cfg;
  const steps = useMemo(() => {
    const out: { y: number; z: number }[] = [];
    for (let i = 0; i < tiers; i++) out.push({ y: i * tierRise, z: -i * tierDepth });
    return out;
  }, [tiers, tierDepth, tierRise]);
  const backH = tiers * tierRise + 1.2;
  return (
    <group>
      {steps.map((s, i) => (
        <mesh key={i} position={[0, s.y + tierRise / 2 - tierRise, s.z]} receiveShadow castShadow>
          <boxGeometry args={[width, tierRise, tierDepth * 0.98]} />
          <meshStandardMaterial color={color} roughness={0.9} metalness={0.05} />
        </mesh>
      ))}
      {/* back wall */}
      <mesh position={[0, backH / 2 - tierRise, -tiers * tierDepth]} receiveShadow>
        <boxGeometry args={[width, backH, 0.4]} />
        <meshStandardMaterial color={color} roughness={0.95} />
      </mesh>
      {/* side rails glow */}
      {[-width / 2, width / 2].map((x) => (
        <mesh key={x} position={[x, 0.2, -tiers * tierDepth * 0.5]}>
          <boxGeometry args={[0.12, 0.5, tiers * tierDepth]} />
          <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------- crowd figures */

interface CrowdDatum {
  base: THREE.Vector3;
  color: THREE.Color;
  phase: number;
  bob: number;
  cheer: number;
}

/** InstancedMesh of seated spectators that bob + occasionally cheer. */
function CrowdStand({ cfg, excitement }: { cfg: Required<StandConfig>; excitement: React.MutableRefObject<number> }) {
  const { width, tiers, perTier, tierDepth, tierRise, seed } = cfg;
  const count = tiers * perTier;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const data = useMemo<CrowdDatum[]>(() => {
    const rand = mulberry32(seed);
    const arr: CrowdDatum[] = [];
    for (let t = 0; t < tiers; t++) {
      for (let p = 0; p < perTier; p++) {
        const x = (p / (perTier - 1) - 0.5) * width * 0.96 + (rand() - 0.5) * 0.3;
        const y = t * tierRise + 0.5;
        const z = -t * tierDepth + (rand() - 0.5) * 0.15;
        arr.push({
          base: new THREE.Vector3(x, y, z),
          color: new THREE.Color(CROWD_PALETTE[Math.floor(rand() * CROWD_PALETTE.length)]),
          phase: rand() * Math.PI * 2,
          bob: 0.5 + rand() * 0.9,
          cheer: rand(),
        });
      }
    }
    return arr;
  }, [tiers, perTier, width, tierDepth, tierRise, seed]);

  // Set instance colors once.
  const colorInit = useRef(false);
  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const time = state.clock.elapsedTime;
    const ex = Math.min(1, Math.max(0, excitement.current));
    if (!colorInit.current) {
      data.forEach((d, i) => mesh.setColorAt(i, d.color));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      colorInit.current = true;
    }
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      // idle sway + excitement-scaled cheer jump
      const sway = Math.sin(time * d.bob + d.phase) * 0.05;
      const jump = ex > 0.01
        ? Math.max(0, Math.sin(time * (6 + d.cheer * 4) + d.phase)) * 0.32 * ex
        : 0;
      dummy.position.set(d.base.x, d.base.y + sway + jump, d.base.z);
      const armUp = 1 + jump * 1.4;
      dummy.scale.set(0.42, 0.62 * armUp, 0.42);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} castShadow>
      <capsuleGeometry args={[0.5, 0.7, 3, 6]} />
      <meshStandardMaterial roughness={0.8} metalness={0.05} vertexColors />
    </instancedMesh>
  );
}

/**
 * A full grandstand = bleacher structure + living crowd, positioned/rotated as
 * one unit. `excitement` (0..1) ref scales the cheer animation — raise it on
 * scores / KOs / touchdowns for a reactive crowd.
 */
export function Grandstand({
  excitement,
  ...partial
}: StandConfig & { excitement: React.MutableRefObject<number> }) {
  const cfg: Required<StandConfig> = {
    rotationY: 0,
    ...DEFAULTS,
    ...partial,
  } as Required<StandConfig>;
  return (
    <group position={cfg.position} rotation={[0, cfg.rotationY, 0]}>
      <Bleachers cfg={cfg} />
      <CrowdStand cfg={cfg} excitement={excitement} />
    </group>
  );
}

/* -------------------------------------------------------------- backdrop */

function makeGradientTex(top: string, mid: string, horizon: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, horizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Boardwalk / palm skyline silhouette, alpha-on-transparent. */
function makeBoardwalkTex(color: string, seed: number): THREE.CanvasTexture {
  const W = 1024, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, W, H);
  const rand = mulberry32(seed);
  ctx.fillStyle = color;
  // low boardwalk buildings
  let x = 0;
  ctx.beginPath();
  ctx.moveTo(0, H);
  while (x < W) {
    const w = 40 + rand() * 90;
    const h = H * (0.28 + rand() * 0.34);
    ctx.lineTo(x, H - h);
    ctx.lineTo(Math.min(W, x + w), H - h);
    x += w;
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
  // palm trees
  for (let i = 0; i < 14; i++) {
    const px = rand() * W;
    const th = H * (0.4 + rand() * 0.35);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3 + rand() * 2;
    ctx.beginPath();
    ctx.moveTo(px, H);
    ctx.lineTo(px + (rand() - 0.5) * 12, H - th);
    ctx.stroke();
    // fronds
    const ty = H - th;
    for (let f = 0; f < 6; f++) {
      const ang = (-Math.PI / 2) + (f - 2.5) * 0.5;
      ctx.beginPath();
      ctx.moveTo(px, ty);
      ctx.lineTo(px + Math.cos(ang) * 26, ty + Math.sin(ang) * 22);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface VeniceBackdropProps {
  /** 'golden' keeps the golden-hour dunk sky; 'day' is bright Venice noon. */
  palette?: 'golden' | 'day';
  /** World radius of the surrounding horizon ring. */
  radius?: number;
  /** Base Y of the horizon band (usually court floor level). */
  baseY?: number;
  seed?: number;
  /** Draw the gradient sky dome. Set false to keep an existing photographic sky. */
  withSky?: boolean;
  /** Draw the boardwalk/palm silhouette band. Set false if the sky photo already has one. */
  withSilhouette?: boolean;
  /** Ground/ocean ring color override. */
  groundColor?: string;
  /** Inner radius where the ground ring starts (should be >= court half-width). */
  innerRadius?: number;
}

/**
 * A closed horizon so the camera never sees the void below/around the court:
 *   - sky dome (gradient, unlit),
 *   - an ocean/ground ring plane at the horizon,
 *   - a boardwalk + palm silhouette band wrapped around the far distance.
 */
export function VeniceBackdrop({
  palette = 'golden', radius = 140, baseY = -0.5, seed = 7,
  withSky = true, withSilhouette = true, groundColor, innerRadius = 18,
}: VeniceBackdropProps) {
  const sky = useMemo(() => palette === 'golden'
    ? makeGradientTex('#2a1a3e', '#c0568a', '#ffb066')
    : makeGradientTex('#1e5fa4', '#5fa8d8', '#cfeaf5'),
    [palette]);
  const board = useMemo(() => makeBoardwalkTex(palette === 'golden' ? '#241030' : '#1c3a50', seed), [palette, seed]);
  const oceanColor = groundColor ?? (palette === 'golden' ? '#264a63' : '#2f7fb0');

  return (
    <group>
      {/* sky dome */}
      {withSky && (
        <mesh scale={[radius, radius, radius]} position={[0, baseY, 0]}>
          <sphereGeometry args={[1, 24, 16]} />
          <meshBasicMaterial map={sky} side={THREE.BackSide} fog={false} toneMapped={false} depthWrite={false} />
        </mesh>
      )}
      {/* ocean / ground ring — a big disc at the horizon so there is never a void */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, baseY - 0.05, 0]}>
        <ringGeometry args={[innerRadius, radius * 0.98, 64, 1]} />
        <meshStandardMaterial color={oceanColor} roughness={0.6} metalness={0.15} side={THREE.DoubleSide} />
      </mesh>
      {/* boardwalk silhouette band wrapped around the far distance */}
      {withSilhouette && (
      <>
      <mesh position={[0, baseY + 12, -radius * 0.72]} scale={[radius * 1.9, 34, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={board} transparent opacity={0.96} fog={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, baseY + 12, radius * 0.72]} rotation={[0, Math.PI, 0]} scale={[radius * 1.9, 34, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={board} transparent opacity={0.9} fog={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[-radius * 0.72, baseY + 12, 0]} rotation={[0, Math.PI / 2, 0]} scale={[radius * 1.9, 34, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={board} transparent opacity={0.9} fog={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[radius * 0.72, baseY + 12, 0]} rotation={[0, -Math.PI / 2, 0]} scale={[radius * 1.9, 34, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={board} transparent opacity={0.9} fog={false} depthWrite={false} toneMapped={false} />
      </mesh>
      </>
      )}
    </group>
  );
}

export default Grandstand;
