'use client';

/**
 * components/three/procedural-map.tsx — PROCEDURAL, ASSETLESS ENVIRONMENTS
 *
 * WHY THIS EXISTS (mirrors the M105 character strategy)
 * The Meshy-derived environment GLBs in public/models/maps/*.glb render badly
 * (scan noise, wrong scale, muddy materials). Rather than keep shipping broken
 * scans, this builds every venue from three.js PRIMITIVES + CanvasTexture-
 * painted markings — no downloads, no CDN, nothing to 404, and no scan artefact
 * can recur. It is the exact same move made for characters: replace the broken
 * asset with a code-generated one behind a flag, so rollback is one env var.
 *
 * DROP-IN CONTRACT
 * This is a faithful replacement for <MapMesh>: it renders ONLY the venue shell
 * (ground + venue props + distant silhouettes) that used to live inside the GLB.
 * It deliberately does NOT add a sky dome or set scene.background — the game
 * components own that (SceneBackdrop photo, or a <color> clear). Gameplay never
 * raycasts the map mesh (verified: three-point + big-air use analytic physics at
 * floorY=0), so swapping the visual shell is safe.
 *
 * ART DIRECTION: continuous with the Babylon NexusWebScene venues and the NEXUS
 * palette (cyan #00E5FF / red #FF3366 / green #00FF9D / purple #A855F7 /
 * gold #FFD700 on near-black). Flat-ish PBR, painted lines, emissive accents.
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import type { MapConfig } from '@/lib/map-data';

// ── spec ────────────────────────────────────────────────────────────────

type GroundKind = 'court' | 'sand' | 'snow' | 'water' | 'grass' | 'mat' | 'street' | 'stage' | 'clay';
type Markings = 'basketball' | 'halfcourt' | 'tennis' | 'soccer' | 'volleyball' | 'none';
type PropKind =
  | 'hoop' | 'net' | 'goal' | 'ramp' | 'palm' | 'pine' | 'lamp' | 'crowd'
  | 'wall' | 'flag' | 'tee' | 'beam' | 'podium' | 'ridge' | 'rock' | 'shelf';

interface PropSpec {
  kind: PropKind;
  pos: [number, number, number];
  rotY?: number;
  scale?: number;
  color?: string;
}

interface EnvSpec {
  ground: GroundKind;
  size: [number, number];
  color: string;
  lineColor?: string;
  markings?: Markings;
  props: PropSpec[];
}

// ── painted ground textures (no image files) ────────────────────────────

function paintMarkings(kind: Exclude<Markings, 'none'>, base: string, line: string): THREE.CanvasTexture {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = line;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  const box = (x: number, y: number, w: number, h: number) => ctx.strokeRect(x, y, w, h);
  const arc = (x: number, y: number, r: number, a0 = 0, a1 = Math.PI * 2) => {
    ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.stroke();
  };
  const seg = (x0: number, y0: number, x1: number, y1: number) => {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  };
  switch (kind) {
    case 'basketball':
      box(40, 40, S - 80, S - 80);
      seg(S / 2, 40, S / 2, S - 40);
      arc(S / 2, S / 2, 110);
      box(40, S / 2 - 150, 190, 300);
      box(S - 230, S / 2 - 150, 190, 300);
      arc(230, S / 2, 150, -Math.PI / 2, Math.PI / 2);
      arc(S - 230, S / 2, 150, Math.PI / 2, (3 * Math.PI) / 2);
      break;
    case 'halfcourt':
      box(40, 40, S - 80, S - 80);
      box(S / 2 - 150, 40, 300, 190);
      arc(S / 2, 230, 150, 0, Math.PI);
      arc(S / 2, 40, 380, 0.35, Math.PI - 0.35);
      break;
    case 'tennis':
      box(60, 40, S - 120, S - 80);
      seg(60, S / 2, S - 60, S / 2);
      box(150, 250, S - 300, S - 500);
      seg(S / 2, 250, S / 2, S - 250);
      break;
    case 'soccer':
      box(40, 40, S - 80, S - 80);
      seg(40, S / 2, S - 40, S / 2);
      arc(S / 2, S / 2, 120);
      box(S / 2 - 200, 40, 400, 130);
      box(S / 2 - 200, S - 170, 400, 130);
      break;
    case 'volleyball':
      box(60, 60, S - 120, S - 120);
      seg(60, S / 2, S - 60, S / 2);
      seg(60, S / 2 - 160, S - 60, S / 2 - 160);
      seg(60, S / 2 + 160, S - 60, S / 2 + 160);
      break;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function paintOrganic(kind: 'water' | 'snow' | 'sand' | 'grass', base: string): THREE.CanvasTexture {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  const light = kind === 'water' ? 'rgba(255,255,255,0.18)'
    : kind === 'snow' ? 'rgba(255,255,255,0.55)'
    : kind === 'grass' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.10)';
  ctx.strokeStyle = light;
  ctx.lineWidth = kind === 'water' ? 5 : 3;
  const amp = kind === 'water' ? 16 : kind === 'snow' ? 7 : 5;
  for (let i = 0; i < 46; i++) {
    const y = (i / 46) * S;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= S; x += 32) {
      ctx.lineTo(x, y + Math.sin((x / S) * Math.PI * 4 + i * 0.7) * amp);
    }
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ── prop primitives ─────────────────────────────────────────────────────

function Hoop({ color = '#FF6B00', scale = 1 }: { color?: string; scale?: number }) {
  return (
    <group scale={scale}>
      <mesh position={[0, 1.52, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 3.05, 12]} />
        <meshStandardMaterial color="#2A2E37" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 3.0, 0.3]} castShadow>
        <boxGeometry args={[1.8, 1.05, 0.06]} />
        <meshStandardMaterial color="#F4F1E8" roughness={0.4} />
      </mesh>
      <mesh position={[0, 2.7, 0.72]}>
        <torusGeometry args={[0.45, 0.028, 8, 24]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

function Net({ color = '#FFFFFF', scale = 1 }: { color?: string; scale?: number }) {
  return (
    <mesh position={[0, 0.9 * scale, 0]}>
      <boxGeometry args={[9 * scale, 1.0 * scale, 0.05]} />
      <meshStandardMaterial color={color} transparent opacity={0.32} roughness={0.9} />
    </mesh>
  );
}

function Goal({ color = '#FFFFFF', scale = 1 }: { color?: string; scale?: number }) {
  const w = 3.6 * scale, h = 2.0 * scale;
  return (
    <group>
      {[-w / 2, w / 2].map((x, i) => (
        <mesh key={i} position={[x, h / 2, 0]} castShadow>
          <cylinderGeometry args={[0.06 * scale, 0.06 * scale, h, 10]} />
          <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, h, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.06 * scale, 0.06 * scale, w, 10]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
    </group>
  );
}

function Ramp({ color = '#5C6270', scale = 1, rotY = 0 }: { color?: string; scale?: number; rotY?: number }) {
  return (
    <mesh position={[0, 0.9 * scale, 0]} rotation={[-0.42, rotY, 0]} castShadow receiveShadow>
      <boxGeometry args={[6 * scale, 0.3, 4 * scale]} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

function Palm({ scale = 1 }: { scale?: number }) {
  const fronds = useMemo(() => Array.from({ length: 6 }, (_, i) => (i * Math.PI * 2) / 6), []);
  return (
    <group scale={scale}>
      <mesh position={[0, 2.6, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.28, 5.2, 8]} />
        <meshStandardMaterial color="#6b5136" roughness={0.9} />
      </mesh>
      <group position={[0, 5.1, 0]}>
        {fronds.map((a, i) => (
          <mesh key={i} rotation={[Math.PI / 3.2, a, 0]} position={[Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5]}>
            <coneGeometry args={[0.5, 2.6, 4]} />
            <meshStandardMaterial color="#1f7a4d" roughness={0.75} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Pine({ scale = 1 }: { scale?: number }) {
  return (
    <group scale={scale}>
      <mesh position={[0, 0.8, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.18, 1.6, 6]} />
        <meshStandardMaterial color="#4a3826" roughness={0.9} />
      </mesh>
      {[1.7, 2.6, 3.3].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} castShadow>
          <coneGeometry args={[1.3 - i * 0.32, 1.5 - i * 0.25, 7]} />
          <meshStandardMaterial color="#20583a" roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

function Lamp({ color = '#FFE9A8', scale = 1 }: { color?: string; scale?: number }) {
  return (
    <group scale={scale}>
      <mesh position={[0, 2.5, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 5, 8]} />
        <meshStandardMaterial color="#2A2E37" metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0, 5.1, 0]}>
        <sphereGeometry args={[0.25, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} />
      </mesh>
    </group>
  );
}

function CrowdTier({ scale = 1 }: { scale?: number }) {
  return (
    <group>
      {[0, 1, 2].map((r) => (
        <mesh key={r} position={[0, 0.45 * scale + r * 0.85 * scale, r * 1.5 * scale]} receiveShadow>
          <boxGeometry args={[22 * scale, 0.9 * scale, 1.6 * scale]} />
          <meshStandardMaterial color={r % 2 ? '#1B2030' : '#232A3D'} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

function Wall({ color = '#12151F', scale = 1 }: { color?: string; scale?: number }) {
  return (
    <mesh position={[0, 3 * scale, 0]} receiveShadow>
      <boxGeometry args={[24 * scale, 6 * scale, 0.4]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

function Flag({ color = '#FF3B30', scale = 1 }: { color?: string; scale?: number }) {
  return (
    <group scale={scale}>
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 2.2, 6]} />
        <meshStandardMaterial color="#EEEEEE" roughness={0.5} />
      </mesh>
      <mesh position={[0.35, 1.9, 0]}>
        <boxGeometry args={[0.7, 0.45, 0.02]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Tee({ color = '#3FA45B', scale = 1 }: { color?: string; scale?: number }) {
  return (
    <mesh position={[0, 0.06, 0]} receiveShadow>
      <cylinderGeometry args={[1.1 * scale, 1.1 * scale, 0.12, 20]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

function Beam({ color = '#C8A15A', scale = 1 }: { color?: string; scale?: number }) {
  return (
    <mesh position={[0, 1.25 * scale, 0]} castShadow>
      <boxGeometry args={[5 * scale, 0.16 * scale, 0.5 * scale]} />
      <meshStandardMaterial color={color} roughness={0.6} />
    </mesh>
  );
}

function Podium({ color = '#5E5CE6', scale = 1 }: { color?: string; scale?: number }) {
  return (
    <mesh position={[0, 0.25 * scale, 0]} castShadow>
      <cylinderGeometry args={[1.5 * scale, 1.5 * scale, 0.5 * scale, 24]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} roughness={0.5} />
    </mesh>
  );
}

function Ridge({ color = '#1a2233', scale = 1 }: { color?: string; scale?: number }) {
  // Distant mountain/skyline silhouette — a low wide cone ring, sits near the
  // horizon and never occludes the sky.
  return (
    <mesh position={[0, 2 * scale, 0]} scale={scale}>
      <coneGeometry args={[10, 7, 5]} />
      <meshStandardMaterial color={color} roughness={1} />
    </mesh>
  );
}

function Rock({ color = '#3a3f47', scale = 1 }: { color?: string; scale?: number }) {
  return (
    <mesh position={[0, 0.4 * scale, 0]} scale={scale} castShadow>
      <dodecahedronGeometry args={[0.8, 0]} />
      <meshStandardMaterial color={color} roughness={0.95} flatShading />
    </mesh>
  );
}

function Shelf({ color = '#3a2c22', scale = 1 }: { color?: string; scale?: number }) {
  return (
    <mesh position={[0, 1 * scale, 0]} scale={scale} castShadow>
      <boxGeometry args={[3, 2, 0.6]} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

function Prop({ p }: { p: PropSpec }) {
  const common = { color: p.color, scale: p.scale ?? 1 };
  let inner: React.ReactNode = null;
  switch (p.kind) {
    case 'hoop': inner = <Hoop {...common} />; break;
    case 'net': inner = <Net {...common} />; break;
    case 'goal': inner = <Goal {...common} />; break;
    case 'ramp': inner = <Ramp {...common} rotY={p.rotY ?? 0} />; break;
    case 'palm': inner = <Palm scale={common.scale} />; break;
    case 'pine': inner = <Pine scale={common.scale} />; break;
    case 'lamp': inner = <Lamp {...common} />; break;
    case 'crowd': inner = <CrowdTier scale={common.scale} />; break;
    case 'wall': inner = <Wall {...common} />; break;
    case 'flag': inner = <Flag {...common} />; break;
    case 'tee': inner = <Tee {...common} />; break;
    case 'beam': inner = <Beam {...common} />; break;
    case 'podium': inner = <Podium {...common} />; break;
    case 'ridge': inner = <Ridge {...common} />; break;
    case 'rock': inner = <Rock {...common} />; break;
    case 'shelf': inner = <Shelf {...common} />; break;
  }
  const rot = p.kind === 'ramp' ? 0 : (p.rotY ?? 0);
  return <group position={p.pos} rotation={[0, rot, 0]}>{inner}</group>;
}

// ── venue table (keyed to lib/map-data.ts MAPS) ─────────────────────────

const beach = (): PropSpec[] => [
  { kind: 'palm', pos: [-13, 0, -10] },
  { kind: 'palm', pos: [13, 0, -10], scale: 0.9 },
  { kind: 'lamp', pos: [15, 0, 2], color: '#FFD79A' },
  { kind: 'lamp', pos: [-15, 0, 2], color: '#FFD79A' },
];

const ENV_SPECS: Record<string, EnvSpec> = {
  'venice-blacktop': {
    ground: 'court', size: [30, 30], color: '#243447', lineColor: '#F2F6FF', markings: 'basketball',
    props: [{ kind: 'hoop', pos: [0, 0, -13], color: '#FF6B00' }, { kind: 'hoop', pos: [0, 0, 13], rotY: Math.PI, color: '#FF6B00' }, ...beach()],
  },
  'venice-blue-court': {
    // LIVE (three-point). PremiumHoop + VeniceSurround are rendered by the game;
    // this only supplies the painted court floor + a far crowd silhouette.
    ground: 'court', size: [28, 28], color: '#1B5E8C', lineColor: '#F2F6FF', markings: 'basketball',
    props: [{ kind: 'crowd', pos: [0, 0, -20] }, { kind: 'lamp', pos: [14, 0, -8], color: '#00E5FF' }, { kind: 'lamp', pos: [-14, 0, -8], color: '#FF3366' }],
  },
  'venice-skatepark': {
    ground: 'street', size: [30, 30], color: '#3A3F4A', lineColor: '#FF9F0A', markings: 'none',
    props: [{ kind: 'ramp', pos: [-7, 0, -5], rotY: 0.2, color: '#5C6270' }, { kind: 'ramp', pos: [8, 0, 4], rotY: Math.PI - 0.2, color: '#5C6270' }, { kind: 'wall', pos: [0, 0, -15], color: '#22242E' }, ...beach()],
  },
  'shop': {
    ground: 'stage', size: [12, 12], color: '#1e1a17', lineColor: '#3a2c22', markings: 'none',
    props: [{ kind: 'wall', pos: [0, 0, -6], scale: 0.5, color: '#241a14' }, { kind: 'shelf', pos: [-4, 0, -5] }, { kind: 'shelf', pos: [4, 0, -5] }, { kind: 'lamp', pos: [0, 0, 4], color: '#FFD79A', scale: 0.7 }],
  },
  'dojo': {
    ground: 'mat', size: [14, 14], color: '#8C2F3A', lineColor: '#F0D9A0', markings: 'none',
    props: [{ kind: 'wall', pos: [0, 0, -8], scale: 0.7, color: '#1A1220' }, { kind: 'wall', pos: [0, 0, 8], rotY: Math.PI, scale: 0.7, color: '#1A1220' }, { kind: 'lamp', pos: [6, 0, -6], color: '#FFCF9A' }, { kind: 'lamp', pos: [-6, 0, -6], color: '#FFCF9A' }],
  },
  'tennis-court': {
    ground: 'clay', size: [16, 30], color: '#2B6CB0', lineColor: '#FFFFFF', markings: 'tennis',
    props: [{ kind: 'net', pos: [0, 0, 0], color: '#F0F0F0' }, { kind: 'crowd', pos: [0, 0, -20] }, { kind: 'crowd', pos: [0, 0, 20], rotY: Math.PI }],
  },
  'coastal-links': {
    ground: 'grass', size: [40, 40], color: '#3B8A4E', lineColor: '#FFFFFF', markings: 'none',
    props: [{ kind: 'tee', pos: [0, 0, 12], color: '#4FA45B' }, { kind: 'flag', pos: [2, 0, -14], color: '#FF3B30' }, { kind: 'palm', pos: [-14, 0, -6], scale: 1.2 }, { kind: 'palm', pos: [15, 0, 2] }],
  },
  'baseball-park': {
    ground: 'grass', size: [40, 40], color: '#2F7A42', lineColor: '#E8D5A8', markings: 'none',
    props: [{ kind: 'tee', pos: [0, 0, 6], color: '#C8A15A' }, { kind: 'flag', pos: [-15, 0, -14], color: '#FF3B30' }, { kind: 'flag', pos: [15, 0, -14], color: '#0A84FF' }, { kind: 'crowd', pos: [0, 0, 22], rotY: Math.PI }],
  },
  'gridiron': {
    ground: 'grass', size: [32, 44], color: '#256B38', lineColor: '#FFFFFF', markings: 'soccer',
    props: [{ kind: 'goal', pos: [0, 0, -20], color: '#FFD60A' }, { kind: 'goal', pos: [0, 0, 20], rotY: Math.PI, color: '#FFD60A' }, { kind: 'crowd', pos: [0, 0, -30] }, { kind: 'crowd', pos: [0, 0, 30], rotY: Math.PI }],
  },
  'soccer-stadium': {
    ground: 'grass', size: [32, 46], color: '#2E7D46', lineColor: '#FFFFFF', markings: 'soccer',
    props: [{ kind: 'goal', pos: [0, 0, -22], color: '#FFFFFF' }, { kind: 'goal', pos: [0, 0, 22], rotY: Math.PI, color: '#FFFFFF' }, { kind: 'crowd', pos: [0, 0, -32] }, { kind: 'crowd', pos: [0, 0, 32], rotY: Math.PI }],
  },
  'sand-court': {
    ground: 'sand', size: [18, 28], color: '#E0C08A', lineColor: '#FFFFFF', markings: 'volleyball',
    props: [{ kind: 'net', pos: [0, 0, 0], scale: 1.1, color: '#FFFFFF' }, { kind: 'palm', pos: [-11, 0, -8] }, { kind: 'palm', pos: [11, 0, 8], scale: 0.9 }],
  },
  'surf-break': {
    ground: 'water', size: [60, 60], color: '#0E6E96', lineColor: '#FFFFFF', markings: 'none',
    props: [{ kind: 'palm', pos: [-20, 0, 18], scale: 1.3 }, { kind: 'palm', pos: [-24, 0, 12] }, { kind: 'ridge', pos: [22, 0, -20], color: '#0a3348', scale: 1.4 }],
  },
  'mountain-slope': {
    // LIVE (big-air). Snow slope + kickers + pines + distant peaks.
    ground: 'snow', size: [40, 60], color: '#E8F2FA', lineColor: '#BFD8EA', markings: 'none',
    props: [
      { kind: 'ramp', pos: [-4, 0, -6], color: '#DCE9F5' },
      { kind: 'ramp', pos: [5, 0, 6], rotY: Math.PI, color: '#DCE9F5' },
      { kind: 'flag', pos: [6, 0, -4], color: '#0A84FF' },
      { kind: 'flag', pos: [-7, 0, 2], color: '#FF3B30' },
      { kind: 'pine', pos: [-13, 0, -10], scale: 1.2 },
      { kind: 'pine', pos: [14, 0, -8] },
      { kind: 'pine', pos: [-16, 0, 6], scale: 0.9 },
      { kind: 'pine', pos: [16, 0, 8], scale: 1.1 },
      { kind: 'ridge', pos: [-20, 0, -24], color: '#8ecfff', scale: 2 },
      { kind: 'ridge', pos: [22, 0, -26], color: '#abd0ee', scale: 2.4 },
      { kind: 'ridge', pos: [0, 0, -30], color: '#c7ddf2', scale: 3 },
    ],
  },
  'gymnastics-gym': {
    ground: 'mat', size: [22, 22], color: '#5B2A8C', lineColor: '#E8D0FF', markings: 'none',
    props: [{ kind: 'beam', pos: [0, 0, -3], color: '#C8A15A' }, { kind: 'podium', pos: [-7, 0, 4], color: '#A855F7' }, { kind: 'wall', pos: [0, 0, -12], scale: 0.7, color: '#180C28' }, { kind: 'lamp', pos: [9, 0, -6], color: '#A855F7' }, { kind: 'lamp', pos: [-9, 0, -6], color: '#A855F7' }],
  },
  'neuro-arena': {
    ground: 'stage', size: [20, 20], color: '#171034', lineColor: '#5E5CE6', markings: 'none',
    props: [{ kind: 'podium', pos: [-3, 0, 2], color: '#5E5CE6' }, { kind: 'podium', pos: [3, 0, 2], color: '#FF3366' }, { kind: 'wall', pos: [0, 0, -10], scale: 0.7, color: '#0A0620' }, { kind: 'lamp', pos: [8, 0, -4], color: '#00E5FF' }, { kind: 'lamp', pos: [-8, 0, -4], color: '#FF3366' }],
  },
};

const DEFAULT_SPEC: EnvSpec = {
  ground: 'stage', size: [24, 24], color: '#16283D', lineColor: '#4FC3F7', markings: 'none', props: [],
};

// ── ground ──────────────────────────────────────────────────────────────

function Ground({ spec, floorY }: { spec: EnvSpec; floorY: number }) {
  const tex = useMemo(() => {
    if (spec.markings && spec.markings !== 'none') {
      return paintMarkings(spec.markings, spec.color, spec.lineColor ?? '#FFFFFF');
    }
    if (spec.ground === 'water' || spec.ground === 'snow' || spec.ground === 'sand' || spec.ground === 'grass') {
      return paintOrganic(spec.ground, spec.color);
    }
    return null;
  }, [spec]);

  const isWater = spec.ground === 'water';
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, floorY, 0]} receiveShadow>
      <planeGeometry args={[spec.size[0], spec.size[1], 1, 1]} />
      <meshStandardMaterial
        color={spec.color}
        map={tex ?? undefined}
        roughness={isWater ? 0.2 : 0.9}
        metalness={isWater ? 0.15 : 0}
      />
    </mesh>
  );
}

// ── entry point ───────────────────────────────────────────────────────────

/**
 * Procedural, assetless replacement for <MapMesh>. Renders the venue shell
 * (ground + props) built entirely from three.js primitives.
 */
export function ProceduralMap({ config }: { config: MapConfig }) {
  const spec = ENV_SPECS[config.key] ?? DEFAULT_SPEC;
  const floorY = config.floorY ?? 0;
  return (
    <group name={`procmap_${config.key}`}>
      <Ground spec={spec} floorY={floorY} />
      {spec.props.map((p, i) => (
        <Prop key={`${p.kind}_${i}`} p={{ ...p, pos: [p.pos[0], p.pos[1] + floorY, p.pos[2]] }} />
      ))}
    </group>
  );
}

export default ProceduralMap;
