// Backdrops — the BACKGROUND ENHANCEMENT pass (M61): every mode gets a real
// painted world beyond the playfield instead of a flat clear-color void.
// Three layers per venue family, all procedural (DynamicTexture painting,
// zero image assets), tuned to read like anime background art (matches the
// M59 grade — bold gradient skies, silhouette scenery, halation-friendly
// light sources):
//   1. SKY DOME — a big inside-out sphere painted with a vertical gradient
//      sky + sun/moon disc + clouds or stars.
//   2. HORIZON RING — a distant cylinder of silhouette scenery (city
//      skyline / mountain ridges / palms / stadium bowl) with lit windows
//      or snow caps painted in.
//   3. DRIFT — the dome slow-rotates (~0.1°/s) so clouds/stars visibly
//      live; costs one rotation assignment per frame.
// One call: mountBackdrop(scene, family). Families map onto the moods the
// modes already declare, so wiring is a lookup, not per-mode art direction.

import {
  Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, Texture,
} from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';

export type BackdropFamily = 'venice' | 'dojo' | 'alpine' | 'stadium' | 'ocean' | 'park';

/** modes already carry a mood — this maps mood → backdrop family so the
 *  harness can mount without per-mode edits. Override per mode if wanted. */
export const MOOD_TO_FAMILY: Record<string, BackdropFamily> = {
  goldenHour: 'venice', dojoWarm: 'dojo', alpine: 'alpine',
  nightGame: 'stadium', default: 'park',
};

interface SkySpec {
  stops: [number, string][];          // vertical gradient (0 top → 1 horizon)
  sun: { x: number; y: number; r: number; color: string; glow: string } | null;
  stars: number;                      // star count (0 = day)
  clouds: number;                     // puffy cloud count
  cloudColor: string;
}
interface RingSpec {
  base: string;                       // silhouette color
  paint: (g: CanvasRenderingContext2D, W: number, H: number, spec: RingSpec) => void;
  windows: string | null;             // lit-window color (night scenes)
}

const SKIES: Record<BackdropFamily, SkySpec> = {
  venice: {
    stops: [[0, '#2c2a6e'], [0.45, '#b34a8c'], [0.75, '#ff8a5c'], [1, '#ffd98a']],
    sun: { x: 0.5, y: 0.78, r: 0.055, color: '#fff3c4', glow: '#ff9d5c' }, stars: 0, clouds: 7, cloudColor: '#ffb9d0',
  },
  ocean: {
    stops: [[0, '#1d3a6e'], [0.5, '#3a7cb0'], [0.8, '#7fc4d9'], [1, '#ffe9b0']],
    sun: { x: 0.62, y: 0.72, r: 0.05, color: '#fff8dc', glow: '#ffd98a' }, stars: 0, clouds: 10, cloudColor: '#ffffff',
  },
  dojo: {
    stops: [[0, '#0c1030'], [0.55, '#232a5c'], [0.85, '#4a3a6e'], [1, '#6e4a6e']],
    sun: { x: 0.68, y: 0.7, r: 0.045, color: '#f4ecd8', glow: '#8a90d9' }, stars: 130, clouds: 3, cloudColor: '#3a4070',
  },
  alpine: {
    stops: [[0, '#2a6ed9'], [0.5, '#6ea8e8'], [0.85, '#c4ddf4'], [1, '#f0f6fc']],
    sun: { x: 0.35, y: 0.8, r: 0.06, color: '#ffffff', glow: '#dceafc' }, stars: 0, clouds: 12, cloudColor: '#ffffff',
  },
  stadium: {
    stops: [[0, '#05061c'], [0.5, '#141a4a'], [0.85, '#3a2a6e'], [1, '#6e2a8a']],
    sun: null, stars: 170, clouds: 0, cloudColor: '#000000',
  },
  park: {
    stops: [[0, '#3a2a8a'], [0.5, '#8a4ab0'], [0.8, '#e87a6e'], [1, '#ffc98a']],
    sun: { x: 0.44, y: 0.76, r: 0.05, color: '#fff3c4', glow: '#ff9d8a' }, stars: 20, clouds: 6, cloudColor: '#e8a0c4',
  },
};

function ridge(g: CanvasRenderingContext2D, W: number, H: number, baseY: number, amp: number, step: number, color: string): void {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, H);
  let y = baseY;
  for (let x = 0; x <= W; x += step) {
    y = baseY + (Math.sin(x * 0.013) + Math.sin(x * 0.031 + 2)) * amp * 0.5 + (Math.random() - 0.5) * amp * 0.3;
    g.lineTo(x, y);
  }
  g.lineTo(W, H);
  g.closePath();
  g.fill();
}

function skyline(g: CanvasRenderingContext2D, W: number, H: number, baseY: number, color: string, windows: string | null): void {
  g.fillStyle = color;
  let x = 0;
  while (x < W) {
    const w = 30 + Math.random() * 70;
    const h = 40 + Math.random() * (H - baseY) * 0.9;
    g.fillRect(x, H - h, w, h);
    if (windows && Math.random() < 0.8) {
      g.fillStyle = windows;
      for (let wy = H - h + 8; wy < H - 10; wy += 14) {
        for (let wx = x + 5; wx < x + w - 6; wx += 12) {
          if (Math.random() < 0.4) g.fillRect(wx, wy, 5, 7);
        }
      }
      g.fillStyle = color;
    }
    x += w + 6 + Math.random() * 20;
  }
}

const RINGS: Record<BackdropFamily, RingSpec> = {
  venice: {
    base: '#3a1f4a', windows: '#ffca7a',
    paint: (g, W, H) => {
      skyline(g, W, H, H * 0.45, '#3a1f4a', '#ffca7a');
      // palm silhouettes in front
      g.fillStyle = '#241030';
      for (let i = 0; i < 26; i++) {
        const x = Math.random() * W, h = 60 + Math.random() * 50;
        g.fillRect(x, H - h, 5, h);
        for (let f = 0; f < 6; f++) {
          const a = (f / 6) * Math.PI - Math.PI * 0.1;
          g.beginPath();
          g.ellipse(x + 2, H - h, 30, 7, a, 0, Math.PI);
          g.fill();
        }
      }
    },
  },
  ocean: {
    base: '#2a4a6e', windows: null,
    paint: (g, W, H) => {
      ridge(g, W, H, H * 0.72, 26, 22, '#2a4a6e');            // far headland
      g.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 30; i++) g.fillRect(Math.random() * W, H * 0.8 + Math.random() * H * 0.15, 14 + Math.random() * 26, 2);
      g.fillStyle = '#1c3450';                                 // sailboat silhouettes
      for (let i = 0; i < 5; i++) {
        const x = Math.random() * W, y = H * 0.82 + Math.random() * 20;
        g.fillRect(x - 8, y, 18, 3);
        g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 16); g.lineTo(x + 9, y - 3); g.closePath(); g.fill();
      }
    },
  },
  dojo: {
    base: '#141230', windows: '#ffb96b',
    paint: (g, W, H) => {
      ridge(g, W, H, H * 0.5, 60, 26, '#1c1840');              // far mountains
      ridge(g, W, H, H * 0.68, 40, 20, '#141230');             // near ridge
      // pagoda silhouettes with lit windows
      g.fillStyle = '#0c0a20';
      for (let i = 0; i < 5; i++) {
        const x = 100 + Math.random() * (W - 200), y = H * 0.68;
        for (let t = 0; t < 3; t++) {
          const w = 70 - t * 18;
          g.fillRect(x - w / 2, y - 26 * (t + 1), w, 22);
          g.fillRect(x - w / 2 - 8, y - 26 * (t + 1) - 4, w + 16, 6);
        }
        g.fillStyle = '#ffb96b';
        g.fillRect(x - 8, y - 20, 6, 8); g.fillRect(x + 4, y - 20, 6, 8);
        g.fillStyle = '#0c0a20';
      }
    },
  },
  alpine: {
    base: '#4a6a9e', windows: null,
    paint: (g, W, H) => {
      ridge(g, W, H, H * 0.42, 90, 30, '#4a6a9e');             // far peaks
      // snow caps: repaint upper edge white-ish
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(240,248,255,0.85)';
      for (let x = 0; x < W; x += 8) {
        const y = H * 0.42 + (Math.sin(x * 0.013) + Math.sin(x * 0.031 + 2)) * 45;
        g.fillRect(x, y - 60, 8, 46);
      }
      g.globalCompositeOperation = 'source-over';
      ridge(g, W, H, H * 0.66, 55, 24, '#2c4a72');             // near ridge, no caps
      g.fillStyle = '#1c3050';                                 // pine line
      for (let i = 0; i < 120; i++) {
        const x = Math.random() * W, y = H * 0.82 + Math.random() * 24, h = 16 + Math.random() * 14;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6, y + h); g.lineTo(x - 6, y + h); g.closePath(); g.fill();
      }
    },
  },
  stadium: {
    base: '#0a0c24', windows: '#dfe8ff',
    paint: (g, W, H) => {
      // upper bowl silhouette + roaring light towers
      g.fillStyle = '#0a0c24';
      g.fillRect(0, H * 0.55, W, H * 0.45);
      g.fillStyle = 'rgba(140,160,255,0.16)';                  // crowd shimmer rows
      for (let y = H * 0.58; y < H * 0.9; y += 10) {
        for (let x = 0; x < W; x += 7) if (Math.random() < 0.35) g.fillRect(x, y, 3, 3);
      }
      for (let i = 0; i < 6; i++) {                            // light towers
        const x = (i + 0.5) * (W / 6);
        g.fillStyle = '#060818';
        g.fillRect(x - 5, H * 0.28, 10, H * 0.3);
        g.fillStyle = '#eef4ff';
        g.fillRect(x - 26, H * 0.24, 52, 14);
        const glow = g.createRadialGradient(x, H * 0.3, 4, x, H * 0.3, 90);
        glow.addColorStop(0, 'rgba(220,235,255,0.5)'); glow.addColorStop(1, 'rgba(220,235,255,0)');
        g.fillStyle = glow;
        g.fillRect(x - 90, H * 0.2, 180, 180);
      }
    },
  },
  park: {
    base: '#2c1c40', windows: '#ffd98a',
    paint: (g, W, H) => {
      skyline(g, W, H, H * 0.5, '#2c1c40', '#ffd98a');
      g.fillStyle = '#1c1030';                                 // treeline in front
      for (let i = 0; i < 60; i++) {
        const x = Math.random() * W, y = H * 0.86 + Math.random() * 10, r = 14 + Math.random() * 16;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
    },
  },
};

function paintSky(scene: Scene, spec: SkySpec): Texture {
  const tex = new DynamicTexture('bk_sky', { width: 1024, height: 512 }, scene, false);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  const W = 1024, H = 512;
  const grad = g.createLinearGradient(0, 0, 0, H);
  for (const [p, c] of spec.stops) grad.addColorStop(p, c);
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  if (spec.stars > 0) {
    for (let i = 0; i < spec.stars; i++) {
      g.fillStyle = `rgba(255,255,255,${0.35 + Math.random() * 0.65})`;
      const s = Math.random() < 0.12 ? 2.4 : 1.3;
      g.fillRect(Math.random() * W, Math.random() * H * 0.7, s, s);
    }
  }
  if (spec.sun) {
    const { x, y, r, color, glow } = spec.sun;
    const gl = g.createRadialGradient(x * W, y * H, r * W * 0.4, x * W, y * H, r * W * 3.2);
    gl.addColorStop(0, glow + 'cc'); gl.addColorStop(1, glow + '00');
    g.fillStyle = gl;
    g.fillRect(0, 0, W, H);
    g.fillStyle = color;
    g.beginPath(); g.arc(x * W, y * H, r * W, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < spec.clouds; i++) {
    const cx = Math.random() * W, cy = H * (0.25 + Math.random() * 0.45), s = 30 + Math.random() * 60;
    g.fillStyle = spec.cloudColor + '55';
    for (let b = 0; b < 5; b++) {
      g.beginPath();
      g.arc(cx + (b - 2) * s * 0.5, cy + Math.sin(b) * s * 0.14, s * (0.5 + Math.random() * 0.3), 0, Math.PI * 2);
      g.fill();
    }
  }
  tex.update();
  return tex;
}

function paintRing(scene: Scene, spec: RingSpec): Texture {
  const tex = new DynamicTexture('bk_ring', { width: 2048, height: 256 }, scene, false);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  g.clearRect(0, 0, 2048, 256);
  spec.paint(g, 2048, 256, spec);
  tex.update();
  tex.hasAlpha = true;
  return tex;
}

export interface Backdrop { dispose(): void }

/** Mount the full three-layer backdrop. Call AFTER the venue is built (so
 *  it never steals a venue mesh name) and keep the returned handle for
 *  dispose. Radius outside every venue (venues max ~110 units). */
export function mountBackdrop(scene: Scene, family: BackdropFamily): Backdrop {
  const meshes: AbstractMesh[] = [];

  const dome = MeshBuilder.CreateSphere('bk_dome', { diameter: 560, segments: 16, sideOrientation: Mesh.BACKSIDE }, scene);
  const domeMat = new StandardMaterial('bk_dome_m', scene);
  domeMat.emissiveTexture = paintSky(scene, SKIES[family]);
  domeMat.diffuseColor = Color3.Black();
  domeMat.specularColor = Color3.Black();
  domeMat.disableLighting = true;
  dome.material = domeMat;
  dome.isPickable = false;
  dome.applyFog = false;
  meshes.push(dome);

  const ring = MeshBuilder.CreateCylinder('bk_ring', {
    diameter: 470, height: 90, tessellation: 48, sideOrientation: Mesh.BACKSIDE, cap: Mesh.NO_CAP,
  }, scene);
  ring.position.y = 30;
  const ringMat = new StandardMaterial('bk_ring_m', scene);
  const ringTex = paintRing(scene, RINGS[family]);
  ringMat.emissiveTexture = ringTex;
  ringMat.opacityTexture = ringTex;
  ringMat.diffuseColor = Color3.Black();
  ringMat.specularColor = Color3.Black();
  ringMat.disableLighting = true;
  ring.material = ringMat;
  ring.isPickable = false;
  meshes.push(ring);

  // DRIFT — clouds/stars slowly live
  const obs = scene.onBeforeRenderObservable.add(() => {
    dome.rotation.y += 0.000028 * scene.getEngine().getDeltaTime();
  });

  return {
    dispose(): void {
      scene.onBeforeRenderObservable.remove(obs);
      for (const m of meshes) m.dispose();
    },
  };
}

// WIRING (ModeHarness, right after the venue builds — one line):
//   const backdrop = mountBackdrop(scene, MOOD_TO_FAMILY[modeConfig.mood] ?? 'park');
//   ... on mode dispose: backdrop.dispose();
// Per-venue overrides where the mood is broader than the place:
//   surf → 'ocean'   (goldenHour mood, but the horizon should be open sea)
//   snowboard/big-air → 'alpine' · dojo modes → 'dojo' · football → 'stadium'
// The LightRig RECEIVER_HINTS regex ignores 'bk_' names (no floor words),
// and both meshes are unlit/emissive — the backdrop can't catch shadows or
// interfere with FrameGuard's mesh counts meaningfully (adds exactly 2).
