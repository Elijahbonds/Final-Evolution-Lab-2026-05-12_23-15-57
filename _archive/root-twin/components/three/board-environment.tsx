'use client';

/**
 * components/three/board-environment.tsx
 *
 * Fix areas 1 (lighting), 4 (backgrounds), 5 (stage/environment):
 *  - Time-of-day presets (per-run variety, SSX-style) driving sun + hemisphere
 *    + fog + sky tint from ONE table.
 *  - Gradient sky dome (canvas texture, no network asset) — the app's
 *    scene-backdrop equirect (public/backdrops/*) can replace the dome; the
 *    silhouettes + lights still apply on top. See REFINEMENT.md.
 *  - Parallax silhouette layers: 2 canvas-generated ridge/skyline/horizon
 *    strips at different depths that track the player at different rates —
 *    reads as a huge world for the cost of 2 transparent quads.
 *
 * Budget: exactly 2 dynamic lights (hemisphere + directional). Rim feel comes
 * from the emissive dome + additive silhouette glow, not a third light.
 */

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { BoardModeId } from '../../lib/board/trick-table';

// ---------------------------------------------------------------------------
// Time of day
// ---------------------------------------------------------------------------

export type TimeOfDayId = 'dawn' | 'day' | 'sunset' | 'night';

export interface TimeOfDayPreset {
  skyTop: string;
  skyHorizon: string;
  sunColor: string;
  sunIntensity: number;
  sunPos: [number, number, number];
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fogColor: string;
  fogDensity: number;
  silhouette: string;
}

export const TIME_OF_DAY: Record<TimeOfDayId, TimeOfDayPreset> = {
  dawn: {
    skyTop: '#1e2a4a', skyHorizon: '#f2a65e',
    sunColor: '#ffd9a0', sunIntensity: 1.6, sunPos: [30, 10, -20],
    hemiSky: '#7488b8', hemiGround: '#2a2320', hemiIntensity: 0.55,
    fogColor: '#c98d5c', fogDensity: 0.012, silhouette: '#141a2e',
  },
  day: {
    skyTop: '#2660a4', skyHorizon: '#bfe3f2',
    sunColor: '#fff4d6', sunIntensity: 2.1, sunPos: [18, 34, 12],
    hemiSky: '#9cc4e4', hemiGround: '#3a3a34', hemiIntensity: 0.7,
    fogColor: '#a9cfe0', fogDensity: 0.008, silhouette: '#28455e',
  },
  sunset: {
    skyTop: '#301a4a', skyHorizon: '#ff7e45',
    sunColor: '#ffb265', sunIntensity: 1.8, sunPos: [-34, 8, -14],
    hemiSky: '#8a5a86', hemiGround: '#241a16', hemiIntensity: 0.5,
    fogColor: '#b0553a', fogDensity: 0.011, silhouette: '#1c1030',
  },
  night: {
    skyTop: '#060a18', skyHorizon: '#20335c',
    sunColor: '#b8ccff', sunIntensity: 0.9, sunPos: [-14, 26, 18],
    hemiSky: '#2c3d66', hemiGround: '#0c0e14', hemiIntensity: 0.42,
    fogColor: '#0d1526', fogDensity: 0.014, silhouette: '#04060e',
  },
};

const TOD_ORDER: TimeOfDayId[] = ['dawn', 'day', 'sunset', 'night'];

/** Deterministic per-run pick (seed with Date.now() or run index). */
export function pickTimeOfDay(seed: number): TimeOfDayId {
  return TOD_ORDER[Math.abs(Math.floor(seed)) % TOD_ORDER.length];
}

// ---------------------------------------------------------------------------
// Canvas texture helpers (generated once per mount — no external assets)
// ---------------------------------------------------------------------------

function makeSkyTexture(top: string, horizon: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(0.72, horizon);
  grad.addColorStop(1, horizon);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Silhouette strip: mountains / skyline / ocean swell, alpha-on-transparent. */
function makeSilhouetteTexture(
  kind: 'ridge' | 'skyline' | 'horizon',
  color: string,
  seed: number
): THREE.CanvasTexture {
  const W = 1024, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = color;

  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };

  ctx.beginPath();
  ctx.moveTo(0, H);
  if (kind === 'ridge') {
    let y = H * 0.55;
    for (let x = 0; x <= W; x += 16) {
      y += (rand() - 0.5) * 46;
      y = Math.max(H * 0.12, Math.min(H * 0.8, y));
      ctx.lineTo(x, y);
    }
  } else if (kind === 'skyline') {
    let x = 0;
    while (x < W) {
      const w = 24 + rand() * 70;
      const h = H * (0.35 + rand() * 0.4);
      ctx.lineTo(x, H - h);
      ctx.lineTo(Math.min(W, x + w), H - h);
      x += w;
    }
    ctx.lineTo(W, H * 0.6);
  } else {
    for (let x = 0; x <= W; x += 32) {
      ctx.lineTo(x, H * 0.62 + Math.sin(x * 0.02 + seed) * 7 + (rand() - 0.5) * 5);
    }
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const MODE_SILHOUETTE: Record<BoardModeId, 'ridge' | 'skyline' | 'horizon'> = {
  skate: 'skyline',  // venice rooftops + palms read as skyline blocks
  snow: 'ridge',     // mountain ranges
  surf: 'horizon',   // open ocean swell line
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface BoardEnvironmentProps {
  mode: BoardModeId;
  tod: TimeOfDayId;
  /** player group — parallax layers track it at depth-dependent rates */
  targetRef: React.MutableRefObject<THREE.Object3D | null>;
}

export function BoardEnvironment({ mode, tod, targetRef }: BoardEnvironmentProps) {
  const preset = TIME_OF_DAY[tod];
  const nearLayer = useRef<THREE.Group>(null);
  const farLayer = useRef<THREE.Group>(null);
  const dome = useRef<THREE.Group>(null);

  const skyTex = useMemo(
    () => makeSkyTexture(preset.skyTop, preset.skyHorizon),
    [preset.skyTop, preset.skyHorizon]
  );
  const silNear = useMemo(
    () => makeSilhouetteTexture(MODE_SILHOUETTE[mode], preset.silhouette, 1337),
    [mode, preset.silhouette]
  );
  const silFar = useMemo(
    () => makeSilhouetteTexture(MODE_SILHOUETTE[mode], preset.skyHorizon, 4242),
    [mode, preset.skyHorizon]
  );

  useFrame(() => {
    const t = targetRef.current;
    if (!t) return;
    // Layers follow the player fully in z (endless world) but lag in x —
    // the differential is what sells parallax depth.
    if (dome.current) dome.current.position.set(t.position.x, 0, t.position.z);
    if (farLayer.current) {
      farLayer.current.position.set(t.position.x * 0.96, 0, t.position.z - 170);
    }
    if (nearLayer.current) {
      nearLayer.current.position.set(t.position.x * 0.88, 0, t.position.z - 120);
    }
  });

  return (
    <group>
      {/* fog from the same preset table */}
      <fogExp2 attach="fog" args={[preset.fogColor, preset.fogDensity]} />

      {/* the ONLY two dynamic lights in the scene (three-budget) */}
      <hemisphereLight
        args={[preset.hemiSky, preset.hemiGround, preset.hemiIntensity]}
      />
      <directionalLight
        position={preset.sunPos}
        color={preset.sunColor}
        intensity={preset.sunIntensity}
      />

      {/* gradient sky dome (swap for app scene-backdrop equirect if desired) */}
      <group ref={dome}>
        <mesh scale={[220, 220, 220]}>
          <sphereGeometry args={[1, 20, 12]} />
          <meshBasicMaterial
            map={skyTex}
            side={THREE.BackSide}
            fog={false}
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* parallax silhouettes */}
      <group ref={farLayer}>
        <mesh position={[0, 26, 0]} scale={[420, 80, 1]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={silFar}
            transparent
            opacity={0.55}
            fog={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
      <group ref={nearLayer}>
        <mesh position={[0, 16, 0]} scale={[320, 56, 1]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            map={silNear}
            transparent
            opacity={0.9}
            fog={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}

export default BoardEnvironment;
