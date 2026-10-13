// THE CLUB CROWD — a packed floor that bounces to the tempo (vis-party, 2026-10-13; docs/VISUAL-PASS-PLAN.md Part B, dance:
// "an instanced club crowd, bigger than 8, bouncing to the BPM").
//
// The Cypher's ring is eight skinned bodies (Onlookers.MAX_BODIES — a body costs about six draws and a skin). A club is a
// hundred people, and from the stage camera most of them are a head, shoulders and raised hands against the LED wall. So the
// back of the room is SILHOUETTES: one painted atlas of four poses (arms down, both arms up, a phone held up, hands clapping),
// four unit quads sharing it, and every figure a THIN INSTANCE of one of them — 72–110 people for four draws on one texture,
// the shape the dunk's crowd cards use. The eight real bodies stay where they are (the near ring); this fills the room behind.
//
// WHAT MOVES IS PURE. `crowdLayout` lays the figures out deterministically from a seed (the same room every visit — nobody
// jitters between runs), and `crowdBob` is each one's hop at this instant as a function of the song's beat position and the
// cheer pulse alone, with no clock of its own: a paused song holds the whole floor mid-bounce, like everything else on the
// stage (beatBus.ts's rule). `calm` (reduced motion) leaves them standing — a bob is motion, and the setting stops it.
//
// Phones get half the people (CROWD_BY_TIER); the quads are unlit, alpha-tested PBR (the repo's StandardMaterial ratchet).

import { Color3, Mesh, MeshBuilder, PBRMaterial, DynamicTexture, Matrix, Quaternion, Vector3, VertexData, type Scene, type TransformNode } from '@babylonjs/core';

export const POSES = 4;
export const CROWD_BY_TIER = { mobile: 36, desktop: 72, high: 110 } as const;
export function crowdCountFor(tier: string): number {
  return tier === 'high' || tier === 'tv' ? CROWD_BY_TIER.high : tier === 'mobile' ? CROWD_BY_TIER.mobile : CROWD_BY_TIER.desktop;
}

export interface CrowdFigure {
  x: number; z: number;
  /** Quad size, metres (a head-to-hip silhouette, so it stands a little over a metre and a half). */
  w: number; h: number;
  /** 0..1 — where in its own bounce this person is; spreads the floor so it ripples instead of marching. */
  phase: number;
  /** Which of the POSES atlas cells it wears. */
  pose: number;
  /** Radians of lean left/right when it lands. */
  lean: number;
}

export interface CrowdArea { x0: number; x1: number; z0: number; z1: number; rows: number }

/** Deterministic 0..1 from an integer seed (mulberry-ish, no state — a layout is a pure function of its inputs). */
function rnd(seed: number, k: number): number {
  let t = (seed * 374761393 + k * 668265263) | 0;
  t = Math.imul(t ^ (t >>> 13), 1274126177);
  return (((t ^ (t >>> 16)) >>> 0) % 100000) / 100000;
}

/** Lay `count` people out in `area.rows` rows, each row staggered from the last, with a little scatter. Pure. */
export function crowdLayout(count: number, area: CrowdArea, seed = 7): CrowdFigure[] {
  const rows = Math.max(1, area.rows);
  const perRow = Math.max(1, Math.ceil(count / rows));
  const out: CrowdFigure[] = [];
  for (let r = 0; r < rows && out.length < count; r++) {
    const z = rows === 1 ? area.z0 : area.z0 + ((area.z1 - area.z0) * r) / (rows - 1);
    for (let c = 0; c < perRow && out.length < count; c++) {
      const k = r * 97 + c;
      const u = (c + 0.5 + (r % 2 ? 0.5 : 0)) / (perRow + 0.5);
      const h = 1.55 + rnd(seed, k) * 0.35;
      out.push({
        x: area.x0 + (area.x1 - area.x0) * u + (rnd(seed, k + 1000) - 0.5) * 0.35,
        z: z + (rnd(seed, k + 2000) - 0.5) * 0.45,
        w: h * 0.55, h,
        phase: rnd(seed, k + 3000),
        pose: Math.floor(rnd(seed, k + 4000) * POSES) % POSES,
        lean: (rnd(seed, k + 5000) - 0.5) * 0.14,
      });
    }
  }
  return out;
}

/**
 * One figure's hop at this instant: `dy` metres up and `roll` radians of lean. A bounce that lands ON the beat (beatPhase 0)
 * and rises through the beat, scaled up by the cheer pulse. Pure; `calm` returns 0, 0.
 */
export function crowdBob(f: CrowdFigure, beatPhase: number, cheer: number, calm: boolean): { dy: number; roll: number } {
  if (calm) return { dy: 0, roll: 0 };
  // each person is a fraction of a beat off their neighbour so the floor ripples
  const p = (((beatPhase + f.phase * 0.35) % 1) + 1) % 1;
  const hop = Math.sin(Math.min(1, p * 1.6) * Math.PI);          // up and down inside the first 62% of the beat, then still
  const amp = 0.06 + Math.min(1.5, cheer) * 0.07;
  return { dy: hop * amp, roll: Math.sin(p * Math.PI * 2) * f.lean * (0.6 + Math.min(1, cheer)) };
}

/** The atlas: POSES silhouettes side by side, each 128×256, dark bodies with a pale rim (the material's tint colours the rim). */
function paintAtlas(scene: Scene): DynamicTexture {
  const W = 128 * POSES, H = 256;
  const tex = new DynamicTexture('dance_crowd_atlas', { width: W, height: H }, scene, true);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  g.clearRect(0, 0, W, H);
  const body = (x0: number, pose: number): void => {
    const cx = x0 + 64;
    const draw = (): void => {
      g.beginPath(); g.arc(cx, 58, 24, 0, Math.PI * 2);                                   // head
      g.moveTo(cx - 52, H); g.quadraticCurveTo(cx - 54, 112, cx - 18, 100);               // left shoulder
      g.lineTo(cx + 18, 100); g.quadraticCurveTo(cx + 54, 112, cx + 52, H); g.closePath(); // right shoulder, torso
      const arm = (sx: number, ex: number, ey: number): void => {
        g.moveTo(cx + sx * 40, 116); g.lineTo(cx + ex, ey);
      };
      if (pose === 1) { arm(-1, -50, 22); arm(1, 50, 22); }                               // both arms up in a V
      else if (pose === 2) { arm(1, 46, 30); arm(-1, -28, 150); }                         // one arm up (the phone)
      else if (pose === 3) { arm(-1, -14, 44); arm(1, 14, 44); }                          // hands together overhead
      g.lineWidth = 17; g.lineCap = 'round'; g.stroke(); g.fill();
    };
    g.fillStyle = '#0a0614'; g.strokeStyle = '#0a0614'; draw();                             // the dark body
    // stage light from above: a pale gradient laid over the body only (source-atop keeps it inside the silhouette), strongest on
    // the head and shoulders and gone by the chest — a lit crown on a dark crowd, not an outline round each person
    g.save();
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(0, 20, 0, 150);
    gr.addColorStop(0, 'rgba(255,255,255,0.42)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x0, 0, 128, 150);
    g.restore();
    if (pose === 2) {                                                                       // the phone's little screen
      g.fillStyle = '#e8f6ff'; g.fillRect(cx + 38, 12, 14, 22);
    }
  };
  for (let i = 0; i < POSES; i++) body(i * 128, i);
  tex.hasAlpha = true;
  tex.update(true);
  return tex;
}

/** A unit quad (1 × 1, base on y = 0) whose uvs cover pose `p`'s atlas cell. */
function poseQuad(scene: Scene, name: string, p: number): Mesh {
  const m = new Mesh(name, scene);
  const vd = new VertexData();
  vd.positions = [-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0];
  vd.normals = [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1];
  const u0 = p / POSES, u1 = (p + 1) / POSES;
  vd.uvs = [u0, 0, u1, 0, u1, 1, u0, 1];
  vd.indices = [0, 2, 1, 0, 3, 2];   // front face toward −z (the stage camera's side)
  vd.applyToMesh(m);
  return m;
}

export interface ClubCrowdOptions {
  area: CrowdArea;
  count: number;
  /** Rim colours the four pose meshes are tinted with, round-robin (the room's two light colours). */
  rims?: readonly string[];
  seed?: number;
  parent?: TransformNode | null;
}

export interface ClubCrowdHandle {
  readonly figures: readonly CrowdFigure[];
  readonly meshes: readonly Mesh[];
  /** Each pose mesh's instance matrices, 16 floats a person (the translation is floats 12..14) — what the GPU is handed. */
  readonly instanceData: readonly Float32Array[];
  /** Per frame: bob the floor to the beat. Writes the instance matrices (no allocation). */
  update(beatPhase: number, cheer: number, calm: boolean): void;
  dispose(): void;
}

export function mountClubCrowd(scene: Scene, o: ClubCrowdOptions): ClubCrowdHandle {
  const figs = crowdLayout(o.count, o.area, o.seed ?? 7);
  const atlas = paintAtlas(scene);
  const rims = o.rims ?? ['#e8409e', '#34c4e6'];
  const byPose: CrowdFigure[][] = Array.from({ length: POSES }, () => []);
  for (const f of figs) byPose[f.pose].push(f);
  const meshes: Mesh[] = [], mats: PBRMaterial[] = [], bufs: Float32Array[] = [];
  for (let p = 0; p < POSES; p++) {
    const list = byPose[p];
    const mesh = poseQuad(scene, `dance_crowd_${p}`, p);
    if (o.parent) mesh.parent = o.parent;
    mesh.isPickable = false; mesh.receiveShadows = false;
    const m = new PBRMaterial(`dance_crowd_mat_${p}`, scene);
    m.unlit = true;
    m.albedoTexture = atlas;
    m.albedoColor = Color3.FromHexString(rims[p % rims.length]);
    m.useAlphaFromAlbedoTexture = true;
    m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
    m.alphaCutOff = 0.45;
    m.backFaceCulling = false;
    mesh.material = m;
    const buf = new Float32Array(Math.max(1, list.length) * 16);
    bufs.push(buf);
    if (list.length) {
      mesh.thinInstanceSetBuffer('matrix', buf, 16, false);
      mesh.alwaysSelectAsActiveMesh = true;   // the instances span the room; one bounding box per mesh would cull wrongly at the edges
    } else mesh.setEnabled(false);
    meshes.push(mesh); mats.push(m);
  }
  const _s = new Vector3(), _p = new Vector3(), _q = new Quaternion(), _m = new Matrix();
  const write = (beatPhase: number, cheer: number, calm: boolean): void => {
    for (let p = 0; p < POSES; p++) {
      const list = byPose[p];
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        const b = crowdBob(f, beatPhase, cheer, calm);
        _s.set(f.w, f.h, 1);
        _p.set(f.x, b.dy, f.z);
        Quaternion.RotationYawPitchRollToRef(0, 0, b.roll, _q);
        Matrix.ComposeToRef(_s, _q, _p, _m);
        _m.copyToArray(bufs[p], i * 16);
      }
      if (list.length) meshes[p].thinInstanceBufferUpdated('matrix');
    }
  };
  write(0, 0, true);   // the standing floor, before the first beat
  return {
    figures: figs,
    meshes,
    instanceData: bufs,
    update: write,
    dispose() {
      for (const m of meshes) m.dispose(false, false);
      for (const m of mats) m.dispose();
      atlas.dispose();
    },
  };
}
