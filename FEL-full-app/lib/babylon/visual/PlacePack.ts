// PlacePack — the shared PLACE layer: floor value, turf, crowd, graffiti, and the checklist a place has to pass.
//
// SHARED-PLACE-FLOOR (2026-09-14). The eye's HARD list had three PLACE fails that were one disease in three coats:
//
//   SKATE    "melted featureless Venice field". The floor was #b8a48c under a 2.4 sun: a PBR albedo that light
//            lands at near-white, and the ramps were #8d7f6d — one value step away. Nothing had an edge, so
//            every ramp melted into the slab it stood on.
//   FOOTBALL "flat untextured green + dot-crowd". The kit gridiron was one flat #1e4d2b with thin lines, and
//            the stand around it was paintBleachers — 5 rows of 6 px circles on a dark wall.
//   DERBY /  the scanned field is triangle soup with its texture smeared across it, and the procedural field
//   PENALTY  that would have read cleanly was hidden under it.
//
// Each mode had grown its own painter for the same three surfaces (a floor, a crowd, a wall), so each fix
// would have been N fixes. This is the one place they live now; the venue builders call it.
//
// Painters take a 2-D context and draw; they own no Babylon state, so the value rules below are unit-testable
// and the painting is shared by DynamicTextures anywhere in the tree.

import { Color3, DynamicTexture, Mesh, MeshBuilder, PBRMaterial, TransformNode } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';

export { lumaHex, FLOOR_LUMA, readableFloorHex, separatedHex, PLACE_BAR, placeVerdict, type PlaceMeasure } from './placeRules';

// ── seeded rng ──────────────────────────────────────────────────────────────────────────────────────────

export function placeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

type Ctx = CanvasRenderingContext2D;

// ── turf ───────────────────────────────────────────────────────────────────────────────────────────────

export interface TurfOpts {
  base: string;
  /** mown bands across the texture's V axis (the length of a field) */
  stripes?: number;
  /** 0..1 darkness of the alternate band */
  stripeDepth?: number;
  /** worn patches (goalmouths, the line of scrimmage) */
  wear?: number;
  seed?: number;
}

/** A mown field: alternating bands, a blade grain that survives mipmapping as mottle, and a few worn patches. */
export function paintTurf(ctx: Ctx, W: number, H: number, o: TurfOpts): void {
  const r = placeRng(o.seed ?? 7);
  const stripes = o.stripes ?? 12, depth = o.stripeDepth ?? 0.16;
  ctx.fillStyle = o.base; ctx.fillRect(0, 0, W, H);
  const band = H / stripes;
  ctx.fillStyle = `rgba(0,0,0,${depth})`;
  for (let i = 0; i < stripes; i += 2) ctx.fillRect(0, i * band, W, band);
  // mottle: a few dozen soft blobs, light and dark — reads at play distance where blades do not
  for (let i = 0; i < 60; i++) {
    const x = r() * W, y = r() * H, rad = 18 + r() * 60, dark = r() < 0.5;
    const g = ctx.createRadialGradient(x, y, 1, x, y, rad); if (!g) break;   // headless 2-D stubs hand back nothing
    g.addColorStop(0, dark ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,210,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // blade grain, short strokes (kept to a couple of thousand: never paint a field with tens of thousands of rects)
  for (let i = 0; i < 2400; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,220,0.07)';
    ctx.fillRect(r() * W, r() * H, 1.5, 3 + r() * 4);
  }
  for (let i = 0; i < (o.wear ?? 0); i++) {
    const x = W * (0.2 + r() * 0.6), y = r() * H, rw = 30 + r() * 70;
    const g = ctx.createRadialGradient(x, y, 2, x, y, rw); if (!g) break;
    g.addColorStop(0, 'rgba(120,96,62,0.38)'); g.addColorStop(1, 'rgba(120,96,62,0)');
    ctx.fillStyle = g; ctx.fillRect(x - rw, y - rw, rw * 2, rw * 2);
  }
}

// ── crowd ──────────────────────────────────────────────────────────────────────────────────────────────

export interface CrowdOpts {
  rows: number;
  /** the venue colour a minority wears at strength */
  accent: string;
  /** the stand behind the people */
  bg?: string;
  /** spectators per row across the texture */
  perRow?: number;
  seed?: number;
}

const TOPS = ['#e63946', '#f1faee', '#457b9d', '#ffb703', '#2a9d8f', '#8338ec', '#fb8500', '#1d3557', '#d62828', '#06d6a0'];
const SKINS = ['#5c3a21', '#8d5524', '#c68642', '#e0ac69', '#f1c27d'];

/**
 * A stand of PEOPLE, readable from the field: stepped seat rows, and on each a shoulder-and-head silhouette big
 * enough to be a person at 30 m (the old bleachers were 6 px dots, which is what "dot crowd" meant). Rows sit
 * lower-is-nearer, a minority wear the accent, a few hold a sign up, and every 20th seat is empty.
 */
export function paintCrowdStand(ctx: Ctx, W: number, H: number, o: CrowdOpts): void {
  const r = placeRng(o.seed ?? 0x5eed);
  const bg = o.bg ?? '#2b2f3a';
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const rowH = H / o.rows;
  const per = o.perRow ?? 34;
  for (let row = 0; row < o.rows; row++) {
    const y0 = row * rowH;
    const back = 1 - row / Math.max(1, o.rows - 1);   // top of the texture = back of the stand
    // the seat step: a lit riser and its shadow, so the stand has tiers even where it is empty
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(0, y0 + rowH * 0.82, W, rowH * 0.06);
    ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(0, y0 + rowH * 0.88, W, rowH * 0.12);
    const pitch = W / per;
    for (let i = 0; i < per; i++) {
      if (r() < 0.05) continue;
      const cx = (i + 0.5) * pitch + (r() - 0.5) * pitch * 0.3;
      const stand = r() < 0.18;                       // on their feet
      const baseY = y0 + rowH * 0.84;
      const bodyH = rowH * (stand ? 0.62 : 0.46), bodyW = pitch * 0.62;
      const top = r() < 0.14 ? o.accent : TOPS[Math.floor(r() * TOPS.length)];
      ctx.fillStyle = mixToward(top, bg, 0.18 + back * 0.22);
      // shoulders: a rounded block
      const sx = cx - bodyW / 2, sy = baseY - bodyH;
      ctx.beginPath();
      ctx.moveTo(sx, baseY); ctx.lineTo(sx, sy + bodyW * 0.25);
      ctx.quadraticCurveTo(sx, sy, sx + bodyW * 0.3, sy);
      ctx.lineTo(sx + bodyW * 0.7, sy); ctx.quadraticCurveTo(sx + bodyW, sy, sx + bodyW, sy + bodyW * 0.25);
      ctx.lineTo(sx + bodyW, baseY); ctx.closePath(); ctx.fill();
      // head
      const hr = pitch * 0.2;
      ctx.fillStyle = mixToward(SKINS[Math.floor(r() * SKINS.length)], bg, 0.12 + back * 0.2);
      ctx.beginPath(); ctx.arc(cx, sy - hr * 0.85, hr, 0, Math.PI * 2); ctx.fill();
      // arms up / a sign, for a few
      if (stand && r() < 0.5) {
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(2, pitch * 0.09);
        ctx.beginPath(); ctx.moveTo(sx + 2, sy + 4); ctx.lineTo(sx - pitch * 0.08, sy - rowH * 0.22); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx + bodyW - 2, sy + 4); ctx.lineTo(sx + bodyW + pitch * 0.08, sy - rowH * 0.22); ctx.stroke();
      } else if (r() < 0.04) {
        ctx.fillStyle = r() < 0.5 ? '#f7f3e3' : o.accent;
        ctx.fillRect(cx - pitch * 0.5, sy - rowH * 0.42, pitch, rowH * 0.24);
      }
    }
  }
}

function mixToward(hex: string, toward: string, t: number): string {
  return Color3.Lerp(Color3.FromHexString(hex), Color3.FromHexString(toward), Math.max(0, Math.min(1, t))).toHexString();
}

// ── graffiti ───────────────────────────────────────────────────────────────────────────────────────────

const SPRAY = ['#ff4d6d', '#ffd60a', '#00e5ff', '#7cff6b', '#b15cff', '#ff8a3d', '#f7f3e3'];
const TAGS = ['FEL', 'VENICE', 'DOGTOWN', 'SKATE', 'LOCALS', 'SEND IT', 'Z-BOYS', 'OG', '310', 'FLOW'];

/**
 * A painted wall: a primer base, big throw-up letters with an outline and a drop shadow, drips, and a couple of
 * characters' worth of shapes. Saturated on purpose — this is scenery the camera passes, not a backdrop behind a
 * rim (the WORLD-POPULATION-PROTOCOL rule that muted the 3PT wall is about what sits behind the thing you aim at).
 */
export function paintGraffitiWall(ctx: Ctx, W: number, H: number, seed: number, base = '#cfc6b6'): void {
  const r = placeRng(seed);
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
  // old paint-over patches: walls get buffed and re-hit
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = mixToward(SPRAY[Math.floor(r() * SPRAY.length)], base, 0.7);
    ctx.fillRect(r() * W, r() * H * 0.6, W * (0.15 + r() * 0.3), H * (0.3 + r() * 0.5));
  }
  const pieces = 2 + Math.floor(r() * 2);
  for (let p = 0; p < pieces; p++) {
    const word = TAGS[Math.floor(r() * TAGS.length)];
    const fill = SPRAY[Math.floor(r() * SPRAY.length)];
    let edge = SPRAY[Math.floor(r() * SPRAY.length)]; if (edge === fill) edge = '#111111';
    const size = Math.round(H * (0.32 + r() * 0.2));
    const x = (p + 0.1 + r() * 0.3) * (W / pieces), y = H * (0.45 + r() * 0.35);
    ctx.save();
    ctx.translate(x, y); ctx.rotate((r() - 0.5) * 0.18);
    ctx.font = `900 ${size}px Impact, "Arial Black", sans-serif`;
    ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(word, size * 0.06, size * 0.06);   // drop shadow
    ctx.lineWidth = size * 0.12; ctx.strokeStyle = '#141414'; ctx.strokeText(word, 0, 0);
    ctx.lineWidth = size * 0.06; ctx.strokeStyle = edge; ctx.strokeText(word, 0, 0);
    ctx.fillStyle = fill; ctx.fillText(word, 0, 0);
    // drips off the letters
    ctx.fillStyle = fill;
    const wWord = ctx.measureText(word).width;
    for (let d = 0; d < 7; d++) ctx.fillRect(r() * wWord, -size * 0.1, 3, size * (0.2 + r() * 0.45));
    ctx.restore();
  }
  // small tags and a stencil band along the bottom
  ctx.font = `bold ${Math.round(H * 0.09)}px sans-serif`;
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = r() < 0.5 ? '#161616' : SPRAY[Math.floor(r() * SPRAY.length)];
    ctx.fillText(TAGS[Math.floor(r() * TAGS.length)].toLowerCase(), r() * W, H * (0.12 + r() * 0.8));
  }
  const grime = ctx.createLinearGradient(0, H * 0.8, 0, H);
  if (grime) {
    grime.addColorStop(0, 'rgba(40,30,20,0)'); grime.addColorStop(1, 'rgba(40,30,20,0.45)');
    ctx.fillStyle = grime; ctx.fillRect(0, H * 0.8, W, H * 0.2);
  }
}

// ── scene builders ─────────────────────────────────────────────────────────────────────────────────────

function paintedMat(scene: Scene, name: string, w: number, h: number, paint: (ctx: Ctx, W: number, H: number) => void, emissive = 0): PBRMaterial {
  const tex = new DynamicTexture(`${name}_tex`, { width: w, height: h }, scene, true);
  paint(tex.getContext() as unknown as Ctx, w, h);
  tex.update(true);
  const m = new PBRMaterial(name, scene);
  m.albedoTexture = tex;
  if (emissive > 0) { m.emissiveTexture = tex; m.emissiveColor = new Color3(emissive, emissive, emissive); }
  m.metallic = 0; m.roughness = 0.92;
  m.environmentIntensity = 0.5;
  m.onDisposeObservable.add(() => tex.dispose());
  return m;
}

export interface StandOpts {
  width: number;
  rows?: number;
  accent?: string;
  seed?: number;
  /** step depth / rise per row, metres */
  step?: [number, number];
  /** a touch of self-light so a night stand is not a black wall */
  emissive?: number;
}

/**
 * A stepped grandstand facing +z in its own frame (rotate the node to face the play): concrete risers carrying ONE
 * crowd texture across all rows (so the people line up row over row instead of the texture repeating per box), a
 * front wall and a back rail. Three meshes, three materials, no shadows cast.
 */
export function buildCrowdStand(scene: Scene, parent: TransformNode | null, name: string, o: StandOpts): TransformNode {
  const rows = o.rows ?? 6, [dz, dy] = o.step ?? [1.1, 0.62];
  const root = new TransformNode(name, scene);
  if (parent) root.parent = parent;
  // FACES +z: the venue-spec convention (tennis's tier at z −28 with rotation 0 faces the court). Rows climb toward −z.
  // the sloped face the people sit on: one plane from the front row to the back row
  const depth = rows * dz, rise = rows * dy;
  const face = MeshBuilder.CreatePlane(`${name}_crowd`, { width: o.width, height: Math.hypot(depth, rise) }, scene);
  face.parent = root;
  face.position.set(0, 1.1 + rise / 2, -depth / 2);
  // a plane's front looks down −z: pitch its top back (+z), then yaw it round so the front looks down +z, top toward −z
  face.rotation.set(Math.atan2(depth, rise), Math.PI, 0);
  face.material = paintedMat(scene, `${name}_crowdM`, 1024, 512, (ctx, W, H) => paintCrowdStand(ctx, W, H, {
    rows, accent: o.accent ?? '#ffd60a', seed: o.seed ?? 1, perRow: Math.round(o.width * 1.6),
  }), o.emissive ?? 0.18);
  face.isPickable = false;
  // front wall (the advertising board) and the back structure
  const front = MeshBuilder.CreateBox(`${name}_front`, { width: o.width, height: 1.1, depth: 0.3 }, scene);
  front.parent = root; front.position.set(0, 0.55, 0.15);
  const fm = new PBRMaterial(`${name}_frontM`, scene); fm.albedoColor = Color3.FromHexString('#20242e'); fm.metallic = 0; fm.roughness = 0.8;
  fm.emissiveColor = Color3.FromHexString(o.accent ?? '#ffd60a').scale(0.25);
  front.material = fm; front.isPickable = false;
  const back = MeshBuilder.CreateBox(`${name}_back`, { width: o.width, height: rise + 2.4, depth: 0.4 }, scene);
  back.parent = root; back.position.set(0, (rise + 2.4) / 2, -(depth + 0.3));
  const bm = new PBRMaterial(`${name}_backM`, scene); bm.albedoColor = Color3.FromHexString('#3a3e48'); bm.metallic = 0; bm.roughness = 0.9;
  back.material = bm; back.isPickable = false;
  return root;
}

export interface GraffitiStageOpts {
  width: number;
  height: number;
  seed: number;
  base?: string;
}

/**
 * A GRAFFITI STAGE: a freestanding painted wall on a low concrete plinth, art on both faces (a different piece each
 * side). This is Venice's art-wall idea — the thing the place is known by — built as mid-ground furniture. Not
 * pickable and no collisions: scenery at the edge of the ride, never an invisible obstacle.
 */
export function buildGraffitiStage(scene: Scene, parent: TransformNode | null, name: string, o: GraffitiStageOpts): TransformNode {
  const root = new TransformNode(name, scene);
  if (parent) root.parent = parent;
  const plinth = MeshBuilder.CreateBox(`${name}_plinth`, { width: o.width + 0.6, height: 0.45, depth: 1.0 }, scene);
  plinth.parent = root; plinth.position.y = 0.225;
  const pm = new PBRMaterial(`${name}_plinthM`, scene); pm.albedoColor = Color3.FromHexString('#6f685e'); pm.metallic = 0; pm.roughness = 0.95;
  plinth.material = pm; plinth.isPickable = false;
  for (const side of [0, 1] as const) {
    const p = MeshBuilder.CreatePlane(`wall_graffiti_${name}_${side}`, { width: o.width, height: o.height, sideOrientation: Mesh.FRONTSIDE }, scene);
    p.parent = root;
    p.position.set(0, 0.45 + o.height / 2, side ? 0.16 : -0.16);
    p.rotation.y = side ? Math.PI : 0;
    p.material = paintedMat(scene, `${name}_art${side}`, 1024, Math.round(1024 * o.height / o.width), (ctx, W, H) => paintGraffitiWall(ctx, W, H, o.seed * 31 + side, o.base), 0.08);
    p.isPickable = false;
  }
  // the slab between the faces, so a grazing angle never sees through the wall
  const core = MeshBuilder.CreateBox(`${name}_core`, { width: o.width, height: o.height, depth: 0.3 }, scene);
  core.parent = root; core.position.y = 0.45 + o.height / 2;
  const cm = new PBRMaterial(`${name}_coreM`, scene); cm.albedoColor = Color3.FromHexString('#8a8175'); cm.metallic = 0; cm.roughness = 0.95;
  core.material = cm; core.isPickable = false;
  return root;
}

// ── fields ─────────────────────────────────────────────────────────────────────────────────────────────

export type FieldMarks = 'none' | 'diamond' | 'penalty';

export interface FieldPaint {
  /** metres [width x, depth z] of the plane the texture covers */
  size: [number, number];
  /** world [x, z] of that plane's centre (so markings land where the RULES put them, whatever the plane) */
  center?: [number, number];
  base: string;
  marks: FieldMarks;
  seed?: number;
}

/** Texture pixel size for a field so a painted metre is square (capped at 1024 on the long side... and 2048 on very long fields). */
export function fieldTexSize(size: [number, number]): [number, number] {
  const long = Math.max(size[0], size[1]);
  const px = long > 80 ? 2048 : 1024;
  return [Math.round(px * size[0] / long), Math.round(px * size[1] / long)];
}

/**
 * Paint a playing field in WORLD metres. The canvas top is the +z end and the left edge is −x (the orientation the
 * CreateGround UVs give a DynamicTexture — measured on the football field, where the attacked end zone's word reads
 * the right way up from the runner camera).
 *
 *   diamond — home plate at the origin, the field opening toward +z: grass infield square inside a dirt skin, base
 *             paths, the mound at 18.4 m, foul lines at ±45° to the edge of the plane, a warning track arc.
 *   penalty — the goal line at z 10.4 (FEL's penalty geometry), goal area, penalty area, the spot at the origin and
 *             the D; mown bands run across the pitch.
 */
export function paintField(ctx: Ctx, W: number, H: number, o: FieldPaint): void {
  const [sw, sd] = o.size, [cx, cz] = o.center ?? [0, 0];
  const pxm = W / sw;
  const X = (x: number) => (x - cx + sw / 2) * pxm;
  const Y = (z: number) => (cz + sd / 2 - z) * pxm;
  paintTurf(ctx, W, H, { base: o.base, stripes: Math.max(6, Math.round(sd / 4)), stripeDepth: 0.13, wear: 6, seed: o.seed ?? 11 });
  const chalk = '#f3f1e7';
  if (o.marks === 'diamond') {
    const dirt = '#b07a4a', BASE = 27.43, MOUND = 18.44;
    const b1: [number, number] = [BASE / Math.SQRT2, BASE / Math.SQRT2], b2: [number, number] = [0, BASE * Math.SQRT2], b3: [number, number] = [-BASE / Math.SQRT2, BASE / Math.SQRT2];
    // the skin: a dirt fan from the plate out past the bases
    // bounded by the foul lines and a 21 m arc round the mound; where each foul line meets that arc:
    const R = 21, t = MOUND / Math.SQRT2 + Math.sqrt((MOUND / Math.SQRT2) ** 2 - MOUND ** 2 + R ** 2);
    const meet = (sgn: number): number => Math.atan2(-(t / Math.SQRT2 - MOUND), sgn * t / Math.SQRT2);   // canvas angle about the mound
    ctx.fillStyle = dirt;
    ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(t / Math.SQRT2), Y(t / Math.SQRT2));
    ctx.arc(X(0), Y(MOUND), R * pxm, meet(1), meet(-1), true);
    ctx.closePath(); ctx.fill();
    // the grass infield square inside the base paths
    const inset = 2.2;
    ctx.fillStyle = o.base;
    ctx.beginPath();
    ctx.moveTo(X(0), Y(inset * Math.SQRT2)); ctx.lineTo(X(b1[0] - inset), Y(b1[1])); ctx.lineTo(X(0), Y(b2[1] - inset * Math.SQRT2)); ctx.lineTo(X(b3[0] + inset), Y(b3[1]));
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fill();
    // the circle around the plate and the mound
    ctx.fillStyle = dirt;
    ctx.beginPath(); ctx.arc(X(0), Y(0), 4 * pxm, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(X(0), Y(MOUND), 2.8 * pxm, 0, Math.PI * 2); ctx.fill();
    // warning track: a dirt band just inside the outfield wall (the mode's wall stands 38 m out)
    ctx.strokeStyle = 'rgba(150,104,62,0.9)'; ctx.lineWidth = 3 * pxm;
    ctx.beginPath(); ctx.arc(X(0), Y(0), 36.5 * pxm, -Math.PI / 2 - Math.PI / 4, -Math.PI / 2 + Math.PI / 4); ctx.stroke();
    // chalk: foul lines to the edge, the batter's boxes, the bases
    ctx.strokeStyle = chalk; ctx.lineWidth = Math.max(3, 0.12 * pxm);
    const far = Math.max(sw, sd);
    for (const s of [1, -1]) { ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(s * far), Y(far)); ctx.stroke(); }
    for (const s of [1, -1]) ctx.strokeRect(X(s > 0 ? 0.5 : -1.7), Y(1), 1.2 * pxm, 2 * pxm);
    ctx.fillStyle = chalk;
    for (const [bx, bz] of [b1, b2, b3]) ctx.fillRect(X(bx) - 0.4 * pxm, Y(bz) - 0.4 * pxm, 0.8 * pxm, 0.8 * pxm);
    ctx.beginPath(); ctx.moveTo(X(-0.25), Y(0.2)); ctx.lineTo(X(0.25), Y(0.2)); ctx.lineTo(X(0.25), Y(-0.1)); ctx.lineTo(X(0), Y(-0.35)); ctx.lineTo(X(-0.25), Y(-0.1)); ctx.closePath(); ctx.fill();
    ctx.fillRect(X(-0.3), Y(MOUND) - 0.08 * pxm, 0.6 * pxm, 0.16 * pxm);   // the rubber
    // ON-DECK CIRCLES and the coaches' boxes — the marks that make a diamond read as a BALLPARK rather than a field
    // (owner, 2026-09-19: "add more detail to the baseball field in the derby mode").
    ctx.fillStyle = dirt;
    for (const s2 of [1, -1]) { ctx.beginPath(); ctx.arc(X(s2 * 6.5), Y(-4.5), 1.5 * pxm, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = chalk; ctx.lineWidth = Math.max(2, 0.1 * pxm);
    for (const s2 of [1, -1]) ctx.strokeRect(X(s2 > 0 ? 14 : -17), Y(20), 3 * pxm, 6 * pxm);   // first- and third-base coach
    // the running lane down the first-base line, and the cut of the grass beyond the bases
    ctx.beginPath(); ctx.moveTo(X(10.5), Y(10.5)); ctx.lineTo(X(19.4), Y(19.4)); ctx.stroke();
  } else if (o.marks === 'penalty') {
    const GOAL = 10.4;
    ctx.strokeStyle = chalk; ctx.lineWidth = Math.max(3, 0.12 * pxm);
    const line = (x0: number, z0: number, x1: number, z1: number) => { ctx.beginPath(); ctx.moveTo(X(x0), Y(z0)); ctx.lineTo(X(x1), Y(z1)); ctx.stroke(); };
    const half = sw / 2 - 0.4;
    line(cx - half, GOAL, cx + half, GOAL);                                // goal line
    const ga = Math.min(9.16, half), pa = Math.min(20.16, half);
    line(-ga, GOAL, -ga, GOAL - 5.5); line(ga, GOAL, ga, GOAL - 5.5); line(-ga, GOAL - 5.5, ga, GOAL - 5.5);   // goal area
    line(-pa, GOAL, -pa, GOAL - 16.5); line(pa, GOAL, pa, GOAL - 16.5); line(-pa, GOAL - 16.5, pa, GOAL - 16.5); // penalty area
    // the D: the part of the 9.15 m circle round the spot that lies outside the penalty area
    const dz = GOAL - 16.5, spotZ = GOAL - 11, a = Math.acos(Math.min(1, (spotZ - dz) / 9.15));
    ctx.beginPath(); ctx.arc(X(0), Y(spotZ), 9.15 * pxm, Math.PI / 2 - a, Math.PI / 2 + a); ctx.stroke();
    ctx.fillStyle = chalk; ctx.beginPath(); ctx.arc(X(0), Y(spotZ), 0.2 * pxm, 0, Math.PI * 2); ctx.fill();
    // goalmouth wear
    const g = ctx.createRadialGradient(X(0), Y(GOAL - 1.5), 2, X(0), Y(GOAL - 1.5), 4 * pxm);
    if (g) { g.addColorStop(0, 'rgba(120,96,62,0.45)'); g.addColorStop(1, 'rgba(120,96,62,0)'); ctx.fillStyle = g; ctx.fillRect(X(-5), Y(GOAL + 2), 10 * pxm, 8 * pxm); }
  }
}

/** A PBR field material painted by paintField, square-pixel sized, with the shared grass grain left to the caller. */
export function fieldMaterial(scene: Scene, name: string, o: FieldPaint): PBRMaterial {
  const [tw, th] = fieldTexSize(o.size);
  const tex = new DynamicTexture(`${name}_tex`, { width: tw, height: th }, scene, true);
  paintField(tex.getContext() as unknown as Ctx, tw, th, o);
  tex.update(true);
  const m = new PBRMaterial(name, scene);
  m.albedoTexture = tex; m.metallic = 0; m.roughness = 0.9; m.environmentIntensity = 0.35;
  m.onDisposeObservable.add(() => tex.dispose());
  return m;
}

// ── track ──────────────────────────────────────────────────────────────────────────────────────────────

export interface TrackPaint {
  size: [number, number];
  center: [number, number];
  /** lane boundary x positions, world metres, ascending */
  laneEdges: number[];
  /** world z of the start line; the race runs toward −z */
  startZ: number;
  /** the rubber's colour (PLACE LOOKS: the beach track is blue) */
  color?: string;
  finishZ: number;
}

/** A tartan straight: rubber grain, white lane lines, the start and finish lines, lane numbers at the start, 10 m ticks. */
export function paintTrack(ctx: Ctx, W: number, H: number, o: TrackPaint): void {
  const [sw, sd] = o.size, [cx, cz] = o.center;
  const pxm = W / sw;
  const X = (x: number) => (x - cx + sw / 2) * pxm;
  const Y = (z: number) => (cz + sd / 2 - z) * pxm;
  const r = placeRng(31);
  ctx.fillStyle = o.color ?? '#a8432f'; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 1800; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,220,200,0.08)'; ctx.fillRect(r() * W, r() * H, 2, 2); }
  // wear down the lane centres where the spikes land
  for (let l = 0; l < o.laneEdges.length - 1; l++) {
    const mid = (o.laneEdges[l] + o.laneEdges[l + 1]) / 2;
    const g = ctx.createLinearGradient(X(mid - 0.5), 0, X(mid + 0.5), 0); if (!g) break;
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(X(mid - 0.5), 0, pxm, H);
  }
  ctx.fillStyle = '#f5f3ec';
  for (const e of o.laneEdges) ctx.fillRect(X(e) - 0.03 * pxm, 0, Math.max(2, 0.06 * pxm), H);
  const across = (z: number, thick: number) => ctx.fillRect(X(o.laneEdges[0]), Y(z) - thick * pxm / 2, (o.laneEdges[o.laneEdges.length - 1] - o.laneEdges[0]) * pxm, thick * pxm);
  across(o.startZ, 0.08); across(o.finishZ, 0.12);
  for (let z = o.startZ - 10; z > o.finishZ; z -= 10) {
    for (const e of o.laneEdges) ctx.fillRect(X(e) - 0.15 * pxm, Y(z) - 0.03 * pxm, 0.3 * pxm, 0.06 * pxm);
  }
  // lane numbers just behind the start line, reading from the blocks. The race runs toward −z, so a number reads the
  // right way up from behind the start only when its top points −z (rotated half a turn on the canvas), and the
  // runner's left is world +x — lane 1 is the +x lane.
  ctx.font = `900 ${Math.round(0.9 * pxm)}px Impact, "Arial Black", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lanes = o.laneEdges.length - 1;
  for (let l = 0; l < lanes; l++) {
    const mid = (o.laneEdges[l] + o.laneEdges[l + 1]) / 2;
    for (const z of [o.startZ + 1.4, o.finishZ - 1.4]) {
      ctx.save(); ctx.translate(X(mid), Y(z)); ctx.rotate(Math.PI); ctx.fillText(String(lanes - l), 0, 0); ctx.restore();
    }
  }
}
