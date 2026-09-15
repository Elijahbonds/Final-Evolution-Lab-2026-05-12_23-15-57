// VenueKit — procedural environments for every mode family. Zero external
// assets: grounds, venue-box walls, and signature props are meshes + dynamic
// textures, so scenes are FULL today; GLB venue pieces can replace parts later.

import {
  Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, PBRMaterial, Texture, TransformNode, Vector3,
} from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import type { GrindLine } from '../core/GroundRide';
import { applyFloorDetailToMesh, floorDetailFor } from './groundTextures';
import { paintCrowdStand, paintTurf, paintTrack } from './PlacePack';

/** Venue props are PBR now (Phase 1, 2026-09-03): they take the procedural IBL
 *  and the tier's shadows like the hero does. Matte by default; the emissive
 *  floor rule stays so nothing goes black under a dim mood. */
const mat = (scene: Scene, name: string, hex: string, emissive = 0.06, roughness = 0.85): PBRMaterial => {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = Color3.FromHexString(hex);
  m.emissiveColor = Color3.FromHexString(hex).scale(emissive);   // ambient floor rule
  m.metallic = 0; m.roughness = roughness;
  return m;
};

/** Painted ground via DynamicTexture — court lines, yard lines, tatami grid… */
/** Ground up to this span keeps the full baked vignette (a court). */
export const GLOW_FULL_M = 45;
/** Past this it has none — the pipeline's own vignette is the only one, and it moves with the camera. */
export const GLOW_MAX_M = 80;

function paintedGround(
  scene: Scene, w: number, l: number, base: string,
  paint: (ctx: CanvasRenderingContext2D, W: number, H: number) => void,
  texSize: [number, number] = [1024, 1024],
): Mesh {
  const ground = MeshBuilder.CreateGround('venue_ground', { width: w, height: l }, scene);
  const [TW, TH] = texSize;
  const tex = new DynamicTexture('venue_ground_tex', { width: TW, height: TH }, scene, texSize[0] !== 1024 || texSize[1] !== 1024);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = base; ctx.fillRect(0, 0, TW, TH);
  paint(ctx, TW, TH);
  tex.update();
  // THE CENTRE GLOW FADES OUT ON BIG GROUND, and that is the whole golf fix.
  //
  // This is one radial gradient baked into a 1024² texture and then stretched over whatever the ground
  // happens to be. On a 30 × 40 court it is a pleasing vignette. On golf's 60 × 90 field it becomes a pale
  // disc tens of metres across sitting exactly where the player stands — the per-mode audit read it as "a
  // flat untextured disc that reads as paper", and picking confirmed the disc IS venue_ground, 3 m away.
  //
  // It is also redundant at that size: `LightRig`'s DefaultRenderingPipeline already applies a real,
  // mood-tinted vignette to the whole frame. A baked one is a second vignette that does not move with the
  // camera, which is exactly what makes it read as an object rather than as light.
  //
  // So it scales with the ground's own size and is gone entirely past GLOW_MAX_M. Small venues are
  // unchanged; a field keeps its texture and loses the blob.
  const span = Math.max(w, l);
  const glowK = Math.max(0, Math.min(1, (GLOW_MAX_M - span) / (GLOW_MAX_M - GLOW_FULL_M)));
  if (glowK > 0) {
    const glow = ctx.createRadialGradient(TW / 2, TH / 2, 60, TW / 2, TH / 2, 640);
    glow.addColorStop(0, `rgba(255,255,255,${(0.10 * glowK).toFixed(3)})`);
    glow.addColorStop(1, `rgba(0,0,0,${(0.12 * glowK).toFixed(3)})`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, TW, TH);
    tex.update();
  }
  const m = new PBRMaterial('venue_ground_mat', scene);
  m.albedoTexture = tex;
  m.emissiveColor = Color3.FromHexString(base).scale(0.08);
  m.metallic = 0; m.roughness = 0.72;                 // a floor that catches light
  ground.material = m;
  ground.receiveShadows = true;
  ground.checkCollisions = false;
  ground.isPickable = true;                 // camera occlusion probe needs it
  return ground;
}

// ── Wall juice (one place → every venue) ────────────────────────────────────
// Applied AFTER each wall's painter: a night-sky gradient cap above the art,
// a neon trim strip at the top edge, and a soft floor-glow at the base — the
// difference between "flat plywood box" and "arena at night". Zero draws added.
function wallJuice(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  // sky cap: deep to lifted over the top third of the wall
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.34);
  sky.addColorStop(0, 'rgba(6,8,18,0.95)');
  sky.addColorStop(1, 'rgba(6,8,18,0)');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H * 0.34);
  // neon trim strip along the top edge — the venue's light line
  ctx.fillStyle = 'rgba(0,229,255,0.9)';
  ctx.fillRect(0, 0, W, 5);
  ctx.fillStyle = 'rgba(0,229,255,0.22)';
  ctx.fillRect(0, 5, W, 14);
  // base glow: the floor light bleeding up the wall bottom
  const base = ctx.createLinearGradient(0, H * 0.82, 0, H);
  base.addColorStop(0, 'rgba(255,255,255,0)');
  base.addColorStop(1, 'rgba(255,255,255,0.08)');
  ctx.fillStyle = base;
  ctx.fillRect(0, H * 0.82, W, H * 0.18);
}

/** 4-wall venue box with per-wall art painter (M22 §6). */
function venueBox(
  scene: Scene, w: number, l: number, h: number,
  painters: Array<WallPainter>,
): TransformNode {
  const root = new TransformNode('venue_box', scene);
  const defs = [
    { name: 'north', pos: new Vector3(0, h / 2, -l / 2), rotY: 0, width: w },
    { name: 'south', pos: new Vector3(0, h / 2, l / 2), rotY: Math.PI, width: w },
    { name: 'east', pos: new Vector3(w / 2, h / 2, 0), rotY: -Math.PI / 2, width: l },
    { name: 'west', pos: new Vector3(-w / 2, h / 2, 0), rotY: Math.PI / 2, width: l },
  ];
  defs.forEach((d, i) => {
    const wall = MeshBuilder.CreatePlane(`wall_${d.name}`, { width: d.width, height: h }, scene);
    wall.position = d.pos; wall.rotation.y = d.rotY; wall.parent = root;
    const painter = painters[i % painters.length];
    // a TILED painter draws one tile of `tileM` metres; the texture keeps the tile's own aspect so what it paints is
    // not stretched, and repeats along the wall (SHARED-PLACE-FLOOR: a 94 m wall of 6 px dots was the "dot crowd")
    const texH = painter.tileM ? Math.round(1024 * h / painter.tileM) : 256;
    const tex = new DynamicTexture(`wall_tex_${d.name}`, { width: 1024, height: texH }, scene, true);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    painter(ctx, 1024, texH);
    wallJuice(ctx, 1024, texH);          // every venue gets the finish
    tex.update(true);
    if (painter.tileM) { tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.uScale = Math.max(1, Math.round(d.width / painter.tileM)); }
    const m = new PBRMaterial(`wall_mat_${d.name}`, scene);
    m.albedoTexture = tex; m.emissiveTexture = tex; m.emissiveColor = new Color3(0.35, 0.35, 0.35);
    m.metallic = 0; m.roughness = 0.9;
    m.backFaceCulling = false;
    wall.material = m; wall.isPickable = false;
  });
  return root;
}

// ── Wall painters (reused across venues) ────────────────────────────────────
/** A wall painter; `tileM` (metres) makes venueBox repeat one painted tile along the wall instead of stretching it. */
type WallPainter = ((ctx: CanvasRenderingContext2D, W: number, H: number) => void) & { tileM?: number };

/**
 * The stand behind a venue box. SHARED-PLACE-FLOOR: this was five rows of 6 px circles stretched along a 94 m wall
 * (the eye's "dot-crowd"). It is the shared PlacePack crowd now — seated silhouettes in stepped rows, a 14 m tile
 * repeated, so a person is ~0.6 m wide wherever the wall is.
 */
const paintBleachers = (crowd: string[]): WallPainter => Object.assign(
  (ctx: CanvasRenderingContext2D, W: number, H: number) => paintCrowdStand(ctx, W, H, {
    rows: 6, perRow: 24, accent: crowd[crowd.length - 1] ?? '#ffd60a', bg: '#232733', seed: crowd.length * 97,
  }),
  { tileM: 14 },
);
const paintOcean = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#ffb36b'); g.addColorStop(0.55, '#ff8f5e'); g.addColorStop(0.56, '#2a6f97'); g.addColorStop(1, '#1b4965');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * W, H * 0.6 + Math.random() * H * 0.35, 14, 2);
};
const paintBoardwalk = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
  ctx.fillStyle = '#26170f'; ctx.fillRect(0, 0, W, H);
  const shops = ['#e07a5f', '#3d5a80', '#81b29a', '#f2cc8f', '#9d4edd'];
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = shops[i % shops.length];
    ctx.fillRect(i * 128 + 8, H * 0.35, 112, H * 0.65);
    ctx.fillStyle = '#ffd75e'; ctx.fillRect(i * 128 + 28, H * 0.5, 30, 24);  // lit window
  }
};
/** Mix a hex colour toward the wall so the tag keeps its hue but loses chroma. */
const towardWall = (hex: string, wall: string, k: number): string => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = p(hex); const [wr, wg, wb] = p(wall);
  const m = (a: number, w: number) => Math.round(a + (w - a) * k);
  return `rgb(${m(r, wr)}, ${m(g, wg)}, ${m(b, wb)})`;
};

// World-Population Protocol L5: ambience must never compete with L1/L2 for the
// player's attention. This wall sits directly behind the Venice hoop — exactly
// where the eye goes during a shot — and was 14 fully-saturated neon beziers up
// to 18px wide. The ball, the rim and the release bar all had to fight it, which
// is the concern recorded in 3PT's sign-off.
//
// The tags stay (this is Venice Beach; graffiti is right) but they are mixed
// toward the wall colour, thinned, and drawn under a partial alpha so they read
// as a painted wall at gameplay distance rather than as competing shapes.
const paintGraffiti = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
  const WALL = '#2b2b31';
  ctx.fillStyle = WALL; ctx.fillRect(0, 0, W, H);
  const cols = ['#ff006e', '#3a86ff', '#ffbe0b', '#34e89e', '#fb5607'];
  ctx.save();
  ctx.globalAlpha = 0.5;                                        //TUNE(elijah)
  for (let i = 0; i < 10; i++) {                                //TUNE(elijah) was 14
    // 0.55 toward the wall keeps the hue readable while dropping the chroma
    // that was pulling focus off the rim.
    ctx.strokeStyle = towardWall(cols[i % cols.length], WALL, 0.55);   //TUNE(elijah)
    ctx.lineWidth = 5 + Math.random() * 6;                      //TUNE(elijah) was 8+10
    ctx.beginPath();
    ctx.moveTo(Math.random() * W, Math.random() * H);
    ctx.bezierCurveTo(Math.random() * W, Math.random() * H, Math.random() * W, Math.random() * H, Math.random() * W, Math.random() * H);
    ctx.stroke();
  }
  ctx.restore();
};
const paintTrees = (snow: boolean) => (ctx: CanvasRenderingContext2D, W: number, H: number) => {
  ctx.fillStyle = snow ? '#dfeaf5' : '#0e1a14'; ctx.fillRect(0, 0, W, H);
  for (let x = 12; x < W; x += 34) {
    ctx.fillStyle = snow ? '#3a5a48' : '#1c3a2a';
    ctx.beginPath();
    ctx.moveTo(x, H); ctx.lineTo(x + 12, H - 70 - Math.random() * 60); ctx.lineTo(x + 24, H);
    ctx.fill();
  }
};

const CROWD = ['#e07a5f', '#3d5a80', '#81b29a', '#f2cc8f', '#f4f1de', '#9d4edd'];

// ── VENUES ──────────────────────────────────────────────────────────────────
export const VenueKit = {
  /**
   * The house paint for a coloured prop: PBR, matte, with the emissive floor so nothing goes black.
   *
   * Exported (2026-09-13) because modes that build their own props were all reaching for StandardMaterial,
   * and a StandardMaterial is WRONG in these scenes. The venues light for PBR — hemispheric 0.85 plus a
   * directional at 2.60 — and StandardMaterial multiplies its diffuse by that linearly and clips at white.
   * Velocity Kart is the worked example: a `#f25f5c` kart rendered WHITE and a `#2a2f38` tarmac rendered pale
   * blue-grey (0.16,0.18,0.22 × 3.45), so the track read as a sheet of sky-coloured plastic. Nobody had
   * mis-typed a colour; the material simply could not survive the lighting the venue sets up.
   */
  paint(scene: Scene, name: string, hex: string, emissive = 0.06, roughness = 0.85): PBRMaterial {
    return mat(scene, name, hex, emissive, roughness);
  },

  buildCourt(scene: Scene, style: 'venice' | 'street' = 'venice'): void {
    paintedGround(scene, 30, 40, style === 'venice' ? '#39547a' : '#3a3a3e', (ctx, W, H) => {
      ctx.strokeStyle = '#f4f1de'; ctx.lineWidth = 6;
      ctx.strokeRect(W * 0.12, H * 0.05, W * 0.76, H * 0.9);          // boundary
      ctx.beginPath(); ctx.arc(W / 2, H * 0.18, W * 0.16, 0, Math.PI); ctx.stroke();  // arc
      ctx.strokeRect(W * 0.38, H * 0.05, W * 0.24, H * 0.2);           // key
    });
    venueBox(scene, 34, 44, 7, [paintOcean, paintBoardwalk, paintBleachers(CROWD), paintGraffiti]);
    // Hoop: pole + backboard + rim + net
    const pole = MeshBuilder.CreateCylinder('hoop_pole', { height: 3.9, diameter: 0.16 }, scene);
    pole.position.set(0, 1.95, -1.6); pole.material = mat(scene, 'pole', '#33383f');
    const board = MeshBuilder.CreateBox('backboard', { width: 1.8, height: 1.05, depth: 0.06 }, scene);
    board.position.set(0, 3.45, -1.15); board.material = mat(scene, 'board', '#dfe8f2', 0.15);
    const rim = MeshBuilder.CreateTorus('rim', { diameter: 0.46, thickness: 0.03 }, scene);
    rim.position.set(0, 3.05, -0.6); rim.material = mat(scene, 'rim', '#ff5a3c', 0.25);
    const net = MeshBuilder.CreateCylinder('net', { height: 0.42, diameterTop: 0.44, diameterBottom: 0.3, tessellation: 12 }, scene);
    net.position.set(0, 2.83, -0.6);
    const netMat = mat(scene, 'net', '#ffffff', 0.2); netMat.alpha = 0.55; net.material = netMat;
    // Palms (cones+cylinders read as palms at distance)
    for (const x of [-12, 12]) for (const z of [-14, 4, 16]) {
      const trunk = MeshBuilder.CreateCylinder(`palm_t_${x}_${z}`, { height: 5, diameterTop: 0.18, diameterBottom: 0.3 }, scene);
      trunk.position.set(x, 2.5, z); trunk.material = mat(scene, 'trunk', '#6b4b2a');
      const crown = MeshBuilder.CreateCylinder(`palm_c_${x}_${z}`, { height: 1.2, diameterTop: 0.1, diameterBottom: 3.4, tessellation: 7 }, scene);
      crown.position.set(x, 5.4, z); crown.material = mat(scene, 'palm', '#2f7d4f', 0.1);
    }
  },

  buildDojo(scene: Scene): void {
    paintedGround(scene, 18, 18, '#b98a52', (ctx, W, H) => {          // tatami grid
      ctx.strokeStyle = '#8a6238'; ctx.lineWidth = 4;
      for (let i = 1; i < 6; i++) {
        ctx.beginPath(); ctx.moveTo((W / 6) * i, 0); ctx.lineTo((W / 6) * i, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, (H / 6) * i); ctx.lineTo(W, (H / 6) * i); ctx.stroke();
      }
    });
    const woodWall = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
      ctx.fillStyle = '#3a2418'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#2a1a10';
      for (let x = 0; x < W; x += 80) ctx.fillRect(x, 0, 10, H);       // beams
      ctx.fillStyle = '#e8d9b8';
      for (let x = 40; x < W; x += 160) ctx.fillRect(x, H * 0.25, 60, H * 0.5);  // shoji panels
    };
    venueBox(scene, 20, 20, 5, [woodWall]);
    // Lanterns — emissive, OFF-CENTER corners only (never between cam and mat)
    for (const [x, z] of [[-8, -8], [8, -8], [-8, 8], [8, 8]] as const) {
      const lantern = MeshBuilder.CreateSphere(`lantern_${x}_${z}`, { diameter: 0.5 }, scene);
      lantern.position.set(x, 3.2, z);
      const lm = mat(scene, 'lantern', '#ff6b3d', 0); lm.emissiveColor = Color3.FromHexString('#ff9d5c');
      lantern.material = lm;
    }
  },

  buildGridiron(scene: Scene): void {
    // Was 22m wide — barely more than a third of a real 48.8m field, cramping
    // every run/pursuit angle into a narrow corridor. 44m brings it in line
    // with the real sideline-to-sideline width; length was already close to
    // regulation so it's untouched.
    // SHARED-PLACE-FLOOR: STREET TURF. The eye's P0 bar was NFL Street, and this was one flat #1e4d2b with 4 px lines —
    // "flat untextured green". A street field is loud and legible: mown 5-yard bands, fat chalk lines, big yard
    // numbers, a painted midfield badge, a filled end zone with its name on it, and the wear where the plays happen.
    // The texture is 1024 × 2048 over 44 × 90 m, so a painted metre is square (the old 1024² stretched every number 2×).
    const FIELD_W = 44, FIELD_L = 90, YD = 0.9144;
    const field = paintedGround(scene, FIELD_W, FIELD_L, '#2f7d3a', (ctx, W, H) => {
      const pxm = W / FIELD_W;                                     // pixels per metre (square)
      const yAt = (z: number) => (FIELD_L / 2 - z) * pxm;          // canvas top is the far (+z) end the runner attacks
      const xAt = (x: number) => (x + FIELD_W / 2) * pxm;
      paintTurf(ctx, W, H, { base: '#2f7d3a', stripes: Math.round(FIELD_L / (5 * YD)), stripeDepth: 0.14, wear: 10, seed: 44 });
      // scrimmage wear down the middle of the field, where every snap happens
      const wear = ctx.createLinearGradient(xAt(-6), 0, xAt(6), 0);
      wear.addColorStop(0, 'rgba(130,104,66,0)'); wear.addColorStop(0.5, 'rgba(130,104,66,0.22)'); wear.addColorStop(1, 'rgba(130,104,66,0)');
      ctx.fillStyle = wear; ctx.fillRect(xAt(-6), yAt(38), xAt(6) - xAt(-6), yAt(-38) - yAt(38));
      // END ZONES: the one the runner attacks (z 40..45) and the one behind (−45..−40)
      for (const [z0, z1, name] of [[40, 45, 'STREET'], [-45, -40, 'FEL']] as const) {
        ctx.fillStyle = z0 > 0 ? '#c1121f' : '#1d3557'; ctx.fillRect(0, yAt(z1), W, yAt(z0) - yAt(z1));
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 10;
        for (let x = -W; x < W * 2; x += 60) { ctx.beginPath(); ctx.moveTo(x, yAt(z1)); ctx.lineTo(x + (yAt(z0) - yAt(z1)), yAt(z0)); ctx.stroke(); }
        ctx.save(); ctx.translate(W / 2, (yAt(z0) + yAt(z1)) / 2);
        if (z0 < 0) ctx.rotate(Math.PI);                           // each end zone's word reads from its own goal line
        ctx.font = `900 ${Math.round(3.4 * pxm)}px Impact, "Arial Black", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 0.35 * pxm; ctx.strokeStyle = '#111'; ctx.strokeText(name, 0, 0);
        ctx.fillStyle = '#fdf0d5'; ctx.fillText(name, 0, 0);
        ctx.restore();
      }
      // chalk: sidelines, goal lines, every 5 yards, and the hashes
      ctx.fillStyle = '#f4f7f2';
      const band = (z: number, thick: number) => ctx.fillRect(xAt(-FIELD_W / 2 + 1.2), yAt(z) - thick * pxm / 2, (FIELD_W - 2.4) * pxm, thick * pxm);
      for (const sx of [-FIELD_W / 2 + 1.2, FIELD_W / 2 - 1.2]) ctx.fillRect(xAt(sx) - 0.25 * pxm, 0, 0.5 * pxm, H);
      band(40, 0.45); band(-40, 0.45);
      ctx.font = `900 ${Math.round(2.2 * pxm)}px Impact, "Arial Black", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let k = -8; k <= 8; k++) {
        const z = k * 5 * YD * (40 / (8 * 5 * YD));               // eight 5-yard bands between z 0 and each goal line
        if (k === -8 || k === 8) continue;
        band(z, k % 2 === 0 ? 0.32 : 0.2);
        for (let h = 1; h < 5; h++) {                               // hash marks, a yard apart
          const hz = z + h * (40 / 40) * YD;
          if (Math.abs(hz) >= 40) continue;
          for (const hx of [-FIELD_W / 2 + 2.2, -3, 3, FIELD_W / 2 - 2.2]) ctx.fillRect(xAt(hx) - 0.45 * pxm, yAt(hz) - 0.06 * pxm, 0.9 * pxm, 0.12 * pxm);
        }
        if (k % 2 === 0 && k !== 0) {                               // numbers every 10 yards, on both sides, facing their sideline
          const label = String((8 - Math.abs(k)) * 5);
          for (const [nx, rot] of [[-FIELD_W / 2 + 5, Math.PI / 2], [FIELD_W / 2 - 5, -Math.PI / 2]] as const) {
            ctx.save(); ctx.translate(xAt(nx), yAt(z)); ctx.rotate(rot); ctx.fillText(label, 0, 0); ctx.restore();
          }
        }
      }
      // the midfield badge
      ctx.save(); ctx.translate(W / 2, yAt(0));
      ctx.fillStyle = 'rgba(193,18,31,0.85)'; ctx.beginPath(); ctx.arc(0, 0, 4.2 * pxm, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 0.4 * pxm; ctx.strokeStyle = '#fdf0d5'; ctx.stroke();
      ctx.fillStyle = '#fdf0d5'; ctx.font = `900 ${Math.round(2.6 * pxm)}px Impact, "Arial Black", sans-serif`; ctx.fillText('FEL', 0, 0);
      ctx.restore();
    }, [1024, 2048]);
    applyFloorDetailToMesh(scene, field, { kind: 'grass', blend: 0.3 }, [FIELD_W, FIELD_L]);
    // round the field off: a dark cinder track past the sidelines, so the chalk has a frame instead of meeting the wall
    const apron = paintedGround(scene, 48, 94, '#3b3530', (ctx, W, H) => {
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; for (let i = 0; i < 1400; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    });
    apron.name = 'venue_apron'; apron.position.y = -0.02; apron.isPickable = false;
    venueBox(scene, 48, 94, 8, [paintBleachers(CROWD)]);
    for (const z of [-30, 0, 30]) for (const x of [-19, 19]) {          // floodlights
      const glow = MeshBuilder.CreatePlane(`flood_${x}_${z}`, { width: 2.4, height: 1.2 }, scene);
      glow.position.set(x, 7, z); glow.billboardMode = Mesh.BILLBOARDMODE_ALL;
      const gm = mat(scene, 'flood', '#ffffff', 0); gm.emissiveColor = new Color3(0.9, 0.95, 1);
      glow.material = gm;
    }
  },

  /**
   * THE SPRINT STRAIGHT (SHARED-PLACE-FLOOR, 2026-09-14). Sprint ran on buildPark — a 40 × 160 grey slab between graffiti
   * walls, the eye's grey void — for a Track & Field race. This is a track: a tartan straight with lanes where the two
   * runners actually stand (x −0.7 and +0.9: edges every 1.6 m), infield grass either side, and a stand down both sides.
   */
  buildTrack(scene: Scene, raceDist = 100): void {
    const edges = [-4.7, -3.1, -1.5, 0.1, 1.7, 3.3, 4.9];
    const len = raceDist + 38, cz = -(raceDist / 2), width = 10.6, cx = 0.1;
    const grass = paintedGround(scene, 44, len + 30, '#3f7f3a', (ctx, W, H) => paintTurf(ctx, W, H, { base: '#3f7f3a', stripes: 16, stripeDepth: 0.1, seed: 5 }));
    grass.name = 'venue_infield'; grass.position.set(0, -0.02, cz); grass.isPickable = false;
    applyFloorDetailToMesh(scene, grass, { kind: 'grass', blend: 0.35 }, [44, len + 30]);
    const tw = 256, th = Math.round(256 * len / width);   // ~24 px a metre: lane lines and numbers stay crisp down a 138 m strip
    const track = paintedGround(scene, width, len, '#a8432f', (ctx, W, H) => paintTrack(ctx, W, H, {
      size: [width, len], center: [cx, cz], laneEdges: edges, startZ: 0, finishZ: -raceDist,
    }), [tw, th]);
    track.position.set(cx, 0, cz);
    const box = venueBox(scene, 44, len + 30, 7, [paintBleachers(CROWD)]);
    box.position.z = cz;
  },

  buildPark(scene: Scene, rails: GrindLine[] = []): void {
    paintedGround(scene, 40, 160, '#7d8288', (ctx, W, H) => {
      ctx.strokeStyle = '#f2cc8f'; ctx.lineWidth = 5;
      ctx.setLineDash([28, 22]);
      ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    });
    venueBox(scene, 44, 164, 7, [paintGraffiti, paintBoardwalk, paintOcean]);
    // ramps + physical rails matching GrindLine data
    for (const [i, line] of rails.entries()) {
      const len = Vector3.Distance(line.a, line.b);
      const rail = MeshBuilder.CreateCylinder(`rail_${i}`, { height: len, diameter: 0.08 }, scene);
      rail.position = Vector3.Center(line.a, line.b);
      const dir = line.b.subtract(line.a).normalize();
      rail.rotation.z = Math.PI / 2;
      rail.rotation.y = Math.atan2(dir.x, dir.z);
      rail.material = mat(scene, 'rail', '#c8ccd2', 0.15);
      const kicker = MeshBuilder.CreateBox(`kicker_${i}`, { width: 3, height: 0.8, depth: 2.4 }, scene);
      kicker.position.set(line.a.x, 0.4, line.a.z + 3);
      kicker.rotation.x = -0.35;
      kicker.material = mat(scene, 'kicker', '#5b6068');
    }
  },

  buildSlope(scene: Scene, liftCable?: GrindLine): void {
    // Pass 5 phase 7: big air's piste was near-white (#eef4fa) with faint groom lines under the alpine sky and read as a
    // flat white sheet. Cooler snow, denser darker groom lines and shadowed drifts give the run edges to read speed against.
    // The piste's own extent, so nothing placed on it can drift past its edge (see the gate flags below).
    const SLOPE_W = 60, SLOPE_L = 400;
    paintedGround(scene, SLOPE_W, SLOPE_L, '#cbd9e7', (ctx, W, H) => {
      ctx.fillStyle = 'rgba(96,130,176,0.55)';
      for (let i = 0; i < 420; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 3, 14);  // groom lines
      ctx.fillStyle = 'rgba(70,100,150,0.30)';
      for (let i = 0; i < 60; i++) {                                                          // drifts
        ctx.beginPath(); ctx.ellipse(Math.random() * W, Math.random() * H, 10 + Math.random() * 24, 3 + Math.random() * 5, 0, 0, Math.PI * 2); ctx.fill();
      }
    });
    venueBox(scene, 64, 404, 12, [paintTrees(true)]);
    // GATE FLAGS, ON THE SNOW. This ran to z −360 on a piste that ends at −200, so the last three pairs hung
    // in the air 160 m past the ground (found by scripts/probes/_ground-audit.mts: six gates over nothing).
    // Bound to the piste's own length now, with a margin, so the two cannot drift apart again.
    const lastGateZ = -(SLOPE_L / 2) + 24;
    for (let z = -40; z > lastGateZ; z -= 60) for (const x of [-24, 24]) {   // gate flags
      const flag = MeshBuilder.CreatePlane(`gate_${x}_${z}`, { width: 0.7, height: 0.5 }, scene);
      flag.position.set(x * 0.6, 1.2, z);
      flag.material = mat(scene, 'gate', z % 120 === -40 ? '#ff3d5e' : '#3a86ff', 0.3);
    }
    if (liftCable) {                                                     // visible lift line
      const len = Vector3.Distance(liftCable.a, liftCable.b);
      const cable = MeshBuilder.CreateCylinder('lift_cable', { height: len, diameter: 0.06 }, scene);
      cable.position = Vector3.Center(liftCable.a, liftCable.b);
      const dir = liftCable.b.subtract(liftCable.a).normalize();
      cable.rotation.z = Math.PI / 2; cable.rotation.y = Math.atan2(dir.x, dir.z);
      cable.material = mat(scene, 'cable', '#3a3f47', 0.2);
      for (const t of [0.2, 0.5, 0.8]) {                                 // chairs
        const chair = MeshBuilder.CreateBox(`chair_${t}`, { width: 0.9, height: 0.7, depth: 0.6 }, scene);
        chair.position = Vector3.Lerp(liftCable.a, liftCable.b, t);
        chair.position.y -= 0.6;
        chair.material = mat(scene, 'chair', '#ff6b3d', 0.15);
      }
      for (const t of [0, 1]) {                                          // pylons
        const p = Vector3.Lerp(liftCable.a, liftCable.b, t);
        const pylon = MeshBuilder.CreateCylinder(`pylon_${t}`, { height: p.y, diameter: 0.3 }, scene);
        pylon.position.set(p.x, p.y / 2, p.z);
        pylon.material = mat(scene, 'pylon', '#3a3f47');
      }
    }
  },

  /** Surf's break: was the only board-family mode with no venue call at all —
   *  just the bare untextured collision plane from BoardRunMode, no water, no
   *  shoreline. Rolling wave-crest lines down the ground texture, an ocean/
   *  palm wall, and a run of beach palms along the break for scale. */
  buildWave(scene: Scene): void {
    paintedGround(scene, 60, 240, '#1b6f96', (ctx, W, H) => {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 6;
      for (let i = 0; i < 10; i++) {
        const y = (H / 10) * i + 20;
        ctx.beginPath(); ctx.moveTo(0, y);
        for (let x = 0; x <= W; x += 40) ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 14);
        ctx.stroke();
      }
    });
    venueBox(scene, 64, 244, 9, [paintOcean, paintTrees(false)]);
    for (const x of [-26, 26]) for (const z of [-20, -100, -180]) {   // beach palms
      const trunk = MeshBuilder.CreateCylinder(`surf_palm_t_${x}_${z}`, { height: 5, diameterTop: 0.18, diameterBottom: 0.3 }, scene);
      trunk.position.set(x, 2.5, z); trunk.material = mat(scene, 'trunk', '#6b4b2a');
      const crown = MeshBuilder.CreateCylinder(`surf_palm_c_${x}_${z}`, { height: 1.2, diameterTop: 0.1, diameterBottom: 3.4, tessellation: 7 }, scene);
      crown.position.set(x, 5.4, z); crown.material = mat(scene, 'palm', '#2f7d4f', 0.1);
    }
  },

  buildField(scene: Scene, preset: 'tennis' | 'golf' | 'ballpark' | 'pitch'): void {
    const bases = { tennis: '#2f6d8f', golf: '#2c7a3f', ballpark: '#3a7a4a', pitch: '#2c6e3f' } as const;
    // All four sports used to share one flat 30x40 field regardless of what
    // they actually need — a golf swing or a baseball hit had nowhere near
    // enough room to fly before hitting the boundary wall, and even tennis
    // read as a cramped box rather than a real court. Sized per sport now
    // (still stylized/arcade scale, not full regulation, but proportioned so
    // the space reads as the right kind of venue and gives real physics
    // room — golf/ballpark need the most depth for a full swing/hit arc).
    const FIELD = { tennis: [24, 42], golf: [60, 90], ballpark: [70, 90], pitch: [50, 70] } as const;
    const BOX = { tennis: [28, 46], golf: [66, 96], ballpark: [76, 96], pitch: [56, 76] } as const;
    const [w, l] = FIELD[preset];
    const [bw, bl] = BOX[preset];
    const field = paintedGround(scene, w, l, bases[preset], (ctx, W, H) => {
      ctx.strokeStyle = '#f4f1de'; ctx.lineWidth = 5;
      if (preset === 'tennis') {
        ctx.strokeRect(W * 0.18, H * 0.1, W * 0.64, H * 0.8);
        ctx.beginPath(); ctx.moveTo(W * 0.18, H / 2); ctx.lineTo(W * 0.82, H / 2); ctx.stroke();
      } else if (preset === 'ballpark') {
        ctx.beginPath(); ctx.moveTo(W / 2, H * 0.9); ctx.lineTo(W * 0.1, H * 0.4);
        ctx.moveTo(W / 2, H * 0.9); ctx.lineTo(W * 0.9, H * 0.4); ctx.stroke();
      } else if (preset === 'pitch') {
        ctx.strokeRect(W * 0.3, H * 0.02, W * 0.4, H * 0.16);            // box
      } else if (preset === 'golf') {
        // GOLF HAD NO BRANCH HERE AT ALL — tennis, ballpark and pitch each got their line work and golf got
        // base colour plus grain, which is why the per-mode audit read it as "a flat untextured disc that
        // reads as paper". A links has no lines to paint, so the thing that makes turf look like a golf
        // course is the MOW: alternating cut directions leave alternating light and dark bands, and that
        // one detail is what the eye uses to read distance down a fairway.
        // SHARED-PLACE-FLOOR: the shared turf painter — the mow bands at a depth that survives the alpine light (a 5.5 %
        // white band did not: the eye still read the fairway as flat bright green), plus mottle and a little wear.
        paintTurf(ctx, W, H, { base: bases.golf, stripes: 14, stripeDepth: 0.16, wear: 3, seed: 90 });
        // NO PAINTED GREEN. The hole has a real `green` mesh of its own (picked it at 8 m), so painting a
        // second one into the turf gives the course two greens that do not line up — my first cut drew a
        // 174 px ellipse on a 1024 texture stretched over 90 m and put a pale blob across the tee. The mow
        // is the whole point here: it is what a fairway reads as, and the green is somebody else's mesh.
      }
    });
    // Pass 7 phase 2 spread: the same tiled grain the spec floors carry (grass on golf / ballpark / pitch, a faint concrete on tennis)
    const grain = floorDetailFor({ tennis: 'hardcourt', golf: 'green', ballpark: 'diamond', pitch: 'pitch' }[preset]);
    if (grain) applyFloorDetailToMesh(scene, field, grain, [w, l]);
    if (preset === 'golf') {
      // ARENA-10PHASE P4 (2026-09-07): a links has no walls. The 7 m box (painted night-sky trim + near-black tree cones,
      // #0e1a14) stood 3 m past the out-of-bounds line, so every drive that sailed OB had the flight camera looking at a
      // black wall with cone silhouettes in it — playtest d3d4a93's "near-black world". The course sits on a wide ROUGH
      // apron instead (the spec's dome, haze and kit trees enclose it), so an OB ball flies over grass, not into a wall.
      const rough = paintedGround(scene, 240, 320, '#4f7f3c', (ctx, W, H) => {
        ctx.fillStyle = 'rgba(60,90,40,0.35)';
        for (let i = 0; i < 900; i++) { const x = Math.random() * W, y = Math.random() * H; ctx.fillRect(x, y, 2 + Math.random() * 6, 1 + Math.random() * 2); }
        ctx.fillStyle = 'rgba(150,170,110,0.18)';
        for (let i = 0; i < 260; i++) { ctx.beginPath(); ctx.ellipse(Math.random() * W, Math.random() * H, 10 + Math.random() * 30, 3 + Math.random() * 8, Math.random() * 3, 0, Math.PI * 2); ctx.fill(); }
      });
      rough.name = 'venue_rough';
      rough.position.set(0, -0.03, 15);
      rough.isPickable = false;
      return;
    }
    venueBox(scene, bw, bl, 7, [paintBleachers(CROWD), paintTrees(false)]);
  },
};
