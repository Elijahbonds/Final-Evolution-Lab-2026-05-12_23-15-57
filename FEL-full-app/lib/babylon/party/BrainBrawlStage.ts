// BrainBrawlStage — the quiz show's set (BRAINBRAWL-RESIDUAL, 2026-09-24).
//
// The eye graded the stage at ~3.5 of a 7.5 bar on 252548b, and it was right about every piece of it: a Venice sunset photo
// over a flat black wall (the venue's backdrop showing through, with the NEXUS "camera behind the wall" warning), a dark
// floor, the wheel a plain disc with five UNLABELLED squares (you matched the pin to the chip by colour), the risers and
// lecterns untextured boxes, nobody in the audience, and a lectern so big next to the contestant that only a head showed.
//
// This builds the room the game is played in, measured against the live camera ('court', held at (0, 4.02, 6.63) looking
// 6° down, vertical FOV 0.8 — the camera itself is NOT changed):
//   · an LED WALL behind everything, lit from inside (the category colours run up it in bars; BRAIN / BRAWL across the top
//     corners; it flashes the landed category's colour) — tall and wide enough that the venue's sky never shows;
//   · a STAGE DECK with the wheel's five colours radiating across it and a lit edge;
//   · THE WHEEL raised into the top band of the frame so the question card sits under it rather than on it: a face painted
//     with the five wedges and their NAMES (upright at the pin), a gold rim with chasing bulbs, pegs between the wedges and a
//     FLAPPER at the top that the pegs kick as they pass (the tick you hear), on a column stand;
//   · RISERS and LECTERNS with real surfaces: a lit band on the riser, a slim tapered lectern with a light ring (the state:
//     armed / locked / right / wrong / winner), a buzzer dome that punches on the slap and a screen with the seat and score;
//   · two AUDIENCE galleries either side of the wheel, three raked rows each, for rigged onlookers (the mode seats them);
//   · soft light beams dropping onto the podiums.
// Everything is PBR (the StandardMaterial ratchet: a StandardMaterial clips to white under this rig), textured from canvases
// painted here — no image downloads. The names the probes measure are kept: bb_wheel (the spinning node), bb_wheel_pin, and
// one bb_wedge_<CATEGORY> mesh at each wedge's centre on the face.

import {
  Color3, DynamicTexture, Mesh, MeshBuilder, PBRMaterial, TransformNode, Vector3, VertexData, Constants,
  type Scene,
} from '@babylonjs/core';
import { CATEGORIES, CATEGORY_COLOR, type Category } from '../core/BrainBrawlCore';
import { PODIUM_TOP_M, PODIUM_AHEAD_M } from '../anim/authored/party';

/** The wheel: centre, radius, and a small tilt so its face points at the camera below it. */
export const WHEEL = { x: 0, y: 4.85, z: -4.6, r: 1.45, tilt: 0.09 };
/** The seats: 2.3 m further forward than 252548b's line (z −2), on a lower riser, never wider than `spread`. POLISH-2 N7: the
 *  eye found the lecterns' feet and the risers cut off by the frame's bottom edge — Brain Brawl's camera now stands back far
 *  enough to hold the whole podium, riser foot and floor included (BrainBrawlMode's CAM_ANCHOR), so the seats may spread wider
 *  (3.6 m) to keep the same place in the frame, beside the card's column. */
export const SEATS = { z: 0.3, riser: 0.55, spread: 3.6 };
/** The riser's radius: just wide enough for the body and the lectern in front of it (the lectern's front edge is 0.55 m from
 *  the riser's centre), so its foot sits as high in the frame as it can. */
const RISER_R = 0.65;
/**
 * Where the host stands (POLISH-2 N2). He stood centre stage — exactly where the card's column sits — so from the expose to the
 * reveal the card hid him. His mark is now stage right of the card (screen right, world −x): clear of the card's column (the
 * middle 40 % of the frame) and inside P2's podium, a step behind the seats' line. The wheel is behind him and up to his right,
 * the side party_present sweeps his right arm to. A portrait phone's frame ends inside the podiums, so there he keeps the
 * centre (HOST_CENTRE; the phone's card covers the whole width either way).
 */
export const HOST_AT = new Vector3(-3.0, 0, -0.9);
export const HOST_CENTRE = new Vector3(0, 0, -2.4);

const TAU = Math.PI * 2;
const hex = (h: string) => Color3.FromHexString(h);

/** A canvas painted once into a texture (never cloned: a cloned DynamicTexture is never ready and the material never draws). */
function painted(scene: Scene, name: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, alpha = false): DynamicTexture {
  const t = new DynamicTexture(name, { width: w, height: h }, scene, true);
  const g = t.getContext() as unknown as CanvasRenderingContext2D;
  g.clearRect(0, 0, w, h);
  draw(g, w, h);
  t.hasAlpha = alpha;
  t.update(true);
  t.anisotropicFilteringLevel = 8;
  return t;
}

interface MatOpts { albedo?: DynamicTexture; color?: string; emissiveTex?: DynamicTexture; emissive?: string; glow?: number; metallic?: number; roughness?: number; alpha?: number; unlit?: boolean }
function material(scene: Scene, name: string, o: MatOpts): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  if (o.albedo) m.albedoTexture = o.albedo;
  m.albedoColor = hex(o.color ?? '#ffffff');
  if (o.emissiveTex) m.emissiveTexture = o.emissiveTex;
  m.emissiveColor = o.emissive ? hex(o.emissive).scale(o.glow ?? 1) : Color3.Black();
  m.metallic = o.metallic ?? 0;
  m.roughness = o.roughness ?? 0.6;
  if (o.alpha !== undefined) m.alpha = o.alpha;
  if (o.unlit) m.unlit = true;
  return m;
}

/** A soft vertical fade, for the beams. */
function fadeTex(scene: Scene): DynamicTexture {
  return painted(scene, 'bb_beam_fade', 16, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, true);
}

// ── the LED wall ────────────────────────────────────────────────────────────────────────────────────────────────────
function paintWallBase(g: CanvasRenderingContext2D, w: number, h: number): void {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#150b44'); gr.addColorStop(0.5, '#0b0630'); gr.addColorStop(1, '#040212');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  // the LED pitch: a fine dot grid, so a lit wall reads as a SCREEN and not as paint
  g.fillStyle = 'rgba(120,110,255,0.10)';
  for (let y = 4; y < h; y += 10) for (let x = 4; x < w; x += 10) g.fillRect(x, y, 3, 3);
  // hex lattice, faint
  g.strokeStyle = 'rgba(110,92,255,0.22)'; g.lineWidth = 2;
  const s = 46;
  for (let row = 0; row * s * 0.87 < h + s; row++) for (let col = 0; col * s * 1.5 < w + s; col++) {
    const cx = col * s * 1.5, cy = row * s * 1.74 + (col % 2 ? s * 0.87 : 0);
    g.beginPath(); for (let k = 0; k <= 6; k++) { const a = (k / 6) * TAU; g.lineTo(cx + Math.cos(a) * s * 0.5, cy + Math.sin(a) * s * 0.5); } g.stroke();
  }
}

function buildWall(scene: Scene): { mats: PBRMaterial[] } {
  const mats: PBRMaterial[] = [];
  const Z = -9.4, H = 11, HALF = 3.8;
  // centre: the glow the wheel stands in front of
  const cTex = painted(scene, 'bb_wall_c', 768, 1100, (g, w, h) => {
    paintWallBase(g, w, h);
    const wy = h * (1 - WHEEL.y / H);
    const rg = g.createRadialGradient(w / 2, wy, 20, w / 2, wy, w * 0.62);
    rg.addColorStop(0, 'rgba(150,120,255,0.75)'); rg.addColorStop(0.45, 'rgba(94,92,230,0.30)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
    // light rays out from behind the wheel
    g.save(); g.translate(w / 2, wy);
    for (let k = 0; k < 20; k++) { g.rotate(TAU / 20); const lg = g.createLinearGradient(0, 0, 0, -w); lg.addColorStop(0, 'rgba(200,190,255,0.20)'); lg.addColorStop(1, 'rgba(200,190,255,0)'); g.fillStyle = lg; g.beginPath(); g.moveTo(-10, 0); g.lineTo(10, 0); g.lineTo(40, -w); g.lineTo(-40, -w); g.fill(); }
    g.restore();
  });
  const c = MeshBuilder.CreatePlane('bb_wall_centre', { width: HALF * 2, height: H }, scene);
  c.position.set(0, H / 2, Z); c.rotation.y = Math.PI;
  const cm = material(scene, 'bb_wall_centre_mat', { color: '#000000', emissiveTex: cTex, emissive: '#ffffff', glow: 0.95, roughness: 1 });
  c.material = cm; mats.push(cm);
  // the wings: category light bars, and the name in the top corners
  const W = 9.6, ANG = 0.32;
  for (const side of [1, -1] as const) {
    const word = side > 0 ? 'BRAIN' : 'BRAWL';   // world +x is SCREEN-LEFT: BRAIN reads first
    const tex = painted(scene, `bb_wall_${word}`, 1024, 1100, (g, w, h) => {
      paintWallBase(g, w, h);
      // bars: the five colours, from the floor up, brightest at the foot — the screen-side end is the stage end
      const bars = CATEGORIES.map((cat) => CATEGORY_COLOR[cat]);
      for (let i = 0; i < 10; i++) {
        const x = (side > 0 ? w - 120 - i * 88 : 120 + i * 88) - 14;
        const col = bars[i % bars.length];
        const top = h * (0.30 + (i % 3) * 0.05);
        const lg = g.createLinearGradient(0, h, 0, top);
        lg.addColorStop(0, col); lg.addColorStop(0.7, `${col}66`); lg.addColorStop(1, `${col}00`);
        g.fillStyle = lg; g.fillRect(x, top, 28, h - top);
      }
      // the word, big, in the upper band (above the audience, below the frame's top bar)
      g.font = '900 150px "Arial Black", Impact, system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      // toward the hinge: the frame sees only the inner ~2/3 of each wing; ~7.4 m up, under the top bar, over the galleries
      const tx = side > 0 ? w * 0.67 : w * 0.33, ty = h * 0.33;
      g.shadowColor = '#8b7bff'; g.shadowBlur = 38; g.fillStyle = '#ffffff'; g.fillText(word, tx, ty);
      g.shadowBlur = 0; g.lineWidth = 6; g.strokeStyle = '#6e5cff'; g.strokeText(word, tx, ty);
      // a lit rule under it
      g.fillStyle = '#6e5cff'; g.fillRect(tx - 330, ty + 110, 660, 10);
    });
    const p = MeshBuilder.CreatePlane(`bb_wall_${word.toLowerCase()}`, { width: W, height: H }, scene);
    // hinge at the centre panel's edge, swung toward the stage
    p.position.set(side * (HALF + Math.cos(ANG) * W / 2), H / 2, Z + Math.sin(ANG) * W / 2);
    p.rotation.y = Math.PI - side * ANG;
    const m = material(scene, `bb_wall_${word}_mat`, { color: '#000000', emissiveTex: tex, emissive: '#ffffff', glow: 0.9, roughness: 1 });
    p.material = m; mats.push(m);
  }
  // the header: a dark valance across the very top so no seam of the venue shows above the wall
  const v = MeshBuilder.CreateBox('bb_wall_header', { width: 30, height: 1.4, depth: 0.4 }, scene);
  v.position.set(0, H + 0.6, Z + 0.6);
  v.material = material(scene, 'bb_wall_header_mat', { color: '#0a0716', roughness: 0.8 });
  return { mats };
}

// ── the stage deck ──────────────────────────────────────────────────────────────────────────────────────────────────
function buildDeck(scene: Scene): void {
  const R = 7.4, CZ = -3.6;
  const draw = (glowOnly: boolean) => (g: CanvasRenderingContext2D, w: number, h: number) => {
    const c = w / 2;
    if (!glowOnly) {
      const bg = g.createRadialGradient(c, c, 0, c, c, c);
      bg.addColorStop(0, '#221a52'); bg.addColorStop(0.7, '#130d33'); bg.addColorStop(1, '#0a0720');
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      // brushed boards
      g.globalAlpha = 0.06; g.fillStyle = '#ffffff';
      for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 1);
      g.globalAlpha = 1;
    } else { g.fillStyle = '#000000'; g.fillRect(0, 0, w, h); }
    // the five colours radiating from the wheel's foot (the deck's far edge on the canvas top)
    CATEGORIES.forEach((cat, i) => {
      const a0 = -Math.PI * 0.95 + (i / 5) * Math.PI * 0.9, a1 = a0 + Math.PI * 0.9 / 5 * 0.55;
      g.fillStyle = `${CATEGORY_COLOR[cat]}${glowOnly ? '55' : '30'}`;
      g.beginPath(); g.moveTo(c, c * 0.35); g.arc(c, c * 0.35, c * 1.4, a0 + Math.PI, a1 + Math.PI, false); g.closePath(); g.fill();
    });
    // rings
    g.strokeStyle = glowOnly ? '#9d8cff' : '#5e5ce6'; g.lineWidth = 5;
    for (const k of [0.97, 0.62, 0.3]) { g.beginPath(); g.arc(c, c, c * k, 0, TAU); g.stroke(); }
    g.lineWidth = 14; g.strokeStyle = glowOnly ? '#6e5cff' : '#3b2fa8'; g.beginPath(); g.arc(c, c, c * 0.985, 0, TAU); g.stroke();
  };
  const albedo = painted(scene, 'bb_deck', 1024, 1024, draw(false));
  const glow = painted(scene, 'bb_deck_glow', 1024, 1024, draw(true));
  const deck = MeshBuilder.CreateDisc('bb_deck', { radius: R, tessellation: 96 }, scene);
  deck.rotation.x = Math.PI / 2; deck.position.set(0, 0.012, CZ);
  deck.material = material(scene, 'bb_deck_mat', { albedo, emissiveTex: glow, emissive: '#ffffff', glow: 0.55, roughness: 0.32, metallic: 0.15 });
  deck.receiveShadows = true;
}

// ── the wheel ───────────────────────────────────────────────────────────────────────────────────────────────────────
/** A disc in the wheel's plane (x right-of-wheel, y up, facing +z at the camera) with PLANAR uvs, so the painted face lands
 *  where the wedge maths says it is: canvas column = (0.5 − x/2R)·W (world +x is SCREEN-LEFT), row = (0.5 − y/2R)·H. */
function faceDisc(scene: Scene, name: string, R: number, n = 120): Mesh {
  const pos: number[] = [0, 0, 0], nor: number[] = [0, 0, 1], uv: number[] = [0.5, 0.5], idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU, x = Math.sin(a) * R, y = Math.cos(a) * R;
    pos.push(x, y, 0); nor.push(0, 0, 1); uv.push(0.5 - x / (2 * R), 0.5 + y / (2 * R));
    if (i > 0) idx.push(0, i, i + 1);
  }
  const m = new Mesh(name, scene);
  const vd = new VertexData(); vd.positions = pos; vd.normals = nor; vd.uvs = uv; vd.indices = idx; vd.applyToMesh(m);
  return m;
}

const ICON: Record<Category, string> = { LOGIC: '∴', MEMORY: '◉', COMPUTE: '±', ANALYZE: '◇', IDENTIFY: '✦' };

function paintFace(g: CanvasRenderingContext2D, w: number, h: number): void {
  const c = w / 2, px = w / 2;   // px per radius
  const at = (theta: number, rho: number): [number, number] => [c - Math.sin(theta) * rho * px, c - Math.cos(theta) * rho * px];
  g.fillStyle = '#120c2c'; g.fillRect(0, 0, w, h);
  CATEGORIES.forEach((cat, i) => {
    const t0 = (i / 5) * TAU, t1 = ((i + 1) / 5) * TAU;
    const [mx, my] = at((t0 + t1) / 2, 0.55);
    const rg = g.createRadialGradient(c, c, px * 0.1, mx, my, px * 0.9);
    rg.addColorStop(0, CATEGORY_COLOR[cat]); rg.addColorStop(1, `${CATEGORY_COLOR[cat]}cc`);
    g.fillStyle = rg;
    g.beginPath(); g.moveTo(c, c);
    for (let k = 0; k <= 48; k++) { const [x, y] = at(t0 + (t1 - t0) * (k / 48), 0.94); g.lineTo(x, y); }
    g.closePath(); g.fill();
    // the wedge's own shine: a lighter band near the rim
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.beginPath();
    for (let k = 0; k <= 48; k++) { const [x, y] = at(t0 + (t1 - t0) * (k / 48), 0.94); if (k === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    for (let k = 48; k >= 0; k--) { const [x, y] = at(t0 + (t1 - t0) * (k / 48), 0.8); g.lineTo(x, y); }
    g.closePath(); g.fill();
  });
  // separators
  g.strokeStyle = '#fff8e0'; g.lineWidth = 7;
  for (let i = 0; i < 5; i++) { const [x, y] = at((i / 5) * TAU, 0.94); g.beginPath(); g.moveTo(c, c); g.lineTo(x, y); g.stroke(); }
  // the NAMES, upright when their wedge is under the pin (the text's up is the wedge's outward direction: rotate by −a)
  CATEGORIES.forEach((cat, i) => {
    const a = ((i + 0.5) / 5) * TAU;
    g.save(); g.translate(c, c); g.rotate(-a);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${cat.length > 6 ? 70 : 80}px "Arial Black", Impact, system-ui, sans-serif`;
    g.lineWidth = 12; g.strokeStyle = 'rgba(10,6,30,0.85)'; g.strokeText(cat, 0, -px * 0.7);
    g.fillStyle = '#ffffff'; g.fillText(cat, 0, -px * 0.7);
    g.font = '700 96px system-ui, sans-serif'; g.fillStyle = 'rgba(10,6,30,0.55)'; g.fillText(ICON[cat], 0, -px * 0.44);
    g.restore();
  });
  // the hub
  const hg = g.createRadialGradient(c, c - 20, 10, c, c, px * 0.2);
  hg.addColorStop(0, '#3a2f7a'); hg.addColorStop(1, '#120c2c');
  g.fillStyle = hg; g.beginPath(); g.arc(c, c, px * 0.2, 0, TAU); g.fill();
  g.lineWidth = 8; g.strokeStyle = '#e8c56a'; g.stroke();
  g.font = '900 88px "Arial Black", Impact, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#e8c56a';
  g.fillText('BB', c, c + 4);
}

interface WheelParts { root: TransformNode; flap: TransformNode; bulbs: [PBRMaterial, PBRMaterial]; marquee: PBRMaterial }

function buildWheel(scene: Scene): WheelParts {
  const { r: R } = WHEEL;
  // the frame that does NOT turn: stand, marquee ring, pin
  const frame = new TransformNode('bb_wheel_frame', scene);
  frame.position.set(WHEEL.x, WHEEL.y, WHEEL.z); frame.rotation.x = WHEEL.tilt;
  const chrome = material(scene, 'bb_chrome', { color: '#c9cbd6', metallic: 0.9, roughness: 0.28 });
  const gold = material(scene, 'bb_gold', { color: '#d9ad4b', metallic: 0.85, roughness: 0.3, emissive: '#3a2a08', glow: 0.6 });
  const dark = material(scene, 'bb_stand', { color: '#1b1638', metallic: 0.5, roughness: 0.35 });
  const column = MeshBuilder.CreateCylinder('bb_wheel_column', { height: WHEEL.y, diameterTop: 0.32, diameterBottom: 0.5, tessellation: 24 }, scene);
  column.position.set(WHEEL.x, WHEEL.y / 2, WHEEL.z - 0.35); column.material = dark;
  const plinth = MeshBuilder.CreateCylinder('bb_wheel_plinth', { height: 0.28, diameterTop: 1.4, diameterBottom: 1.7, tessellation: 40 }, scene);
  plinth.position.set(WHEEL.x, 0.14, WHEEL.z - 0.35); plinth.material = dark;
  const marqueeMat = material(scene, 'bb_marquee', { color: '#000000', emissive: '#8b7bff', glow: 1.2, roughness: 0.4 });
  const marquee = MeshBuilder.CreateTorus('bb_wheel_marquee', { diameter: R * 2 + 0.55, thickness: 0.07, tessellation: 96 }, scene);
  marquee.parent = frame; marquee.rotation.x = Math.PI / 2; marquee.position.z = -0.12; marquee.material = marqueeMat;
  const back = MeshBuilder.CreateCylinder('bb_wheel_back', { height: 0.14, diameter: R * 2 + 0.42, tessellation: 96 }, scene);
  back.parent = frame; back.rotation.x = Math.PI / 2; back.position.z = -0.2; back.material = dark;
  // the pointer: a hinge above the top with the flapper hanging from it (the pegs kick it as they pass)
  const flap = new TransformNode('bb_wheel_flap', scene); flap.parent = frame; flap.position.set(0, R + 0.34, 0.16);
  const pin = MeshBuilder.CreateCylinder('bb_wheel_pin', { height: 0.1, diameter: 0.42, tessellation: 3 }, scene);
  pin.parent = flap; pin.rotation.x = Math.PI / 2; pin.rotation.y = Math.PI; pin.position.set(0, -0.16, 0);
  pin.scaling.set(0.8, 1, 1.25);
  pin.material = material(scene, 'bb_pin_mat', { color: '#fff4d6', emissive: '#ffe7a3', glow: 0.8, metallic: 0.3, roughness: 0.25 });
  const hinge = MeshBuilder.CreateSphere('bb_wheel_hinge', { diameter: 0.14, segments: 12 }, scene);
  hinge.parent = flap; hinge.material = gold;

  // the part that turns
  const root = new TransformNode('bb_wheel', scene);
  root.parent = frame;
  const faceTex = painted(scene, 'bb_wheel_face', 1024, 1024, paintFace);
  const face = faceDisc(scene, 'bb_wheel_face', R);
  face.parent = root; face.position.z = 0.02;
  const fm = material(scene, 'bb_wheel_face_mat', { albedo: faceTex, emissiveTex: faceTex, emissive: '#ffffff', glow: 0.55, roughness: 0.4, metallic: 0.05 });
  fm.backFaceCulling = false; face.material = fm;
  const rim = MeshBuilder.CreateTorus('bb_wheel_rim', { diameter: R * 2 + 0.06, thickness: 0.15, tessellation: 96 }, scene);
  rim.parent = root; rim.rotation.x = Math.PI / 2; rim.position.z = 0.03; rim.material = gold;
  // bulbs: twenty on the rim, two sets that chase while it spins
  const bulbSets: Mesh[][] = [[], []];
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * TAU + TAU / 40;
    const b = MeshBuilder.CreateSphere(`bb_bulb_${k}`, { diameter: 0.085, segments: 8 }, scene);
    b.position.set(Math.sin(a) * (R + 0.01), Math.cos(a) * (R + 0.01), 0.11);
    bulbSets[k % 2].push(b);
  }
  const bulbMats = [0, 1].map((s) => material(scene, `bb_bulb_mat_${s}`, { color: '#fff3c4', emissive: '#ffe7a3', glow: 1, roughness: 0.2 })) as [PBRMaterial, PBRMaterial];
  bulbSets.forEach((set, s) => { const m = Mesh.MergeMeshes(set, true, true); if (m) { m.name = `bb_bulbs_${s}`; m.parent = root; m.material = bulbMats[s]; } });
  // pegs between the wedges (what the flapper hits) and the wedge markers the probes measure
  const pegs: Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    const p = MeshBuilder.CreateCylinder(`bb_peg_${i}`, { height: 0.16, diameter: 0.06, tessellation: 10 }, scene);
    p.rotation.x = Math.PI / 2; p.position.set(Math.sin(a) * (R - 0.08), Math.cos(a) * (R - 0.08), 0.1);
    pegs.push(p);
  }
  const pegMesh = Mesh.MergeMeshes(pegs, true, true); if (pegMesh) { pegMesh.name = 'bb_pegs'; pegMesh.parent = root; pegMesh.material = chrome; }
  CATEGORIES.forEach((cat, i) => {
    const a = ((i + 0.5) / 5) * TAU;   // BrainBrawlCore.wedgeAngle: the landing maths reads the same layout
    const mark = MeshBuilder.CreateDisc(`bb_wedge_${cat}`, { radius: 0.05, tessellation: 12 }, scene);
    mark.parent = root; mark.position.set(Math.sin(a) * R * 0.96, Math.cos(a) * R * 0.96, 0.05); mark.rotation.y = Math.PI;
    mark.material = gold;
  });
  const hub = MeshBuilder.CreateCylinder('bb_wheel_hub', { height: 0.16, diameter: 0.2, tessellation: 24 }, scene);
  hub.parent = root; hub.rotation.x = Math.PI / 2; hub.position.z = 0.1; hub.material = gold;
  return { root, flap, bulbs: bulbMats, marquee: marqueeMat };
}

// ── the audience galleries ──────────────────────────────────────────────────────────────────────────────────────────
/** Three raked rows each side of the wheel, in the frame's upper corners between the wheel and the edges. */
export const GALLERY = { x0: 3.5, x1: 8.6, rows: [{ z: -5.6, top: 1.2 }, { z: -6.5, top: 1.8 }, { z: -7.4, top: 2.4 }] };

function buildGalleries(scene: Scene): Vector3[][] {
  const fascia = painted(scene, 'bb_gallery_fascia', 1024, 256, (g, w, h) => {
    g.fillStyle = '#0d0926'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 64) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x, 0, 2, h); }
    const lg = g.createLinearGradient(0, 0, w, 0);
    CATEGORIES.forEach((cat, i) => lg.addColorStop(i / 4, CATEGORY_COLOR[cat]));
    g.fillStyle = lg; g.fillRect(0, h * 0.12, w, 12); g.fillRect(0, h * 0.82, w, 6);
    g.font = '900 56px "Arial Black", Impact, system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.85)'; g.textBaseline = 'middle'; g.textAlign = 'center';
    for (const x of [w * 0.25, w * 0.75]) g.fillText('BRAIN BRAWL', x, h * 0.5);
  });
  const glowFascia = painted(scene, 'bb_gallery_fascia_glow', 1024, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const lg = g.createLinearGradient(0, 0, w, 0);
    CATEGORIES.forEach((cat, i) => lg.addColorStop(i / 4, CATEGORY_COLOR[cat]));
    g.fillStyle = lg; g.fillRect(0, h * 0.12, w, 12); g.fillRect(0, h * 0.82, w, 6);
    g.font = '900 56px "Arial Black", Impact, system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.7)'; g.textBaseline = 'middle'; g.textAlign = 'center';
    for (const x of [w * 0.25, w * 0.75]) g.fillText('BRAIN BRAWL', x, h * 0.5);
  });
  const carpet = painted(scene, 'bb_gallery_carpet', 256, 256, (g, w, h) => {
    g.fillStyle = '#2a1f5c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(${150 + Math.random() * 80},${120 + Math.random() * 60},255,${0.05 + Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = '#6e5cff55'; g.fillRect(0, 0, w, 10);   // the step's lit nosing
  });
  carpet.uScale = 6; carpet.vScale = 1;
  const fasciaMat = material(scene, 'bb_gallery_fascia_mat', { albedo: fascia, emissiveTex: glowFascia, emissive: '#ffffff', glow: 0.8, roughness: 0.5 });
  const stepMat = material(scene, 'bb_gallery_step_mat', { albedo: carpet, color: '#ffffff', roughness: 0.9 });
  const spots: Vector3[][] = [];
  for (const side of [1, -1] as const) {
    const w = GALLERY.x1 - GALLERY.x0, cx = side * (GALLERY.x0 + w / 2);
    const seats: Vector3[] = [];
    GALLERY.rows.forEach((row, k) => {
      const step = MeshBuilder.CreateBox(`bb_gallery_${side > 0 ? 'l' : 'r'}_${k}`, { width: w, height: row.top, depth: 0.95 }, scene);
      step.position.set(cx, row.top / 2, row.z); step.material = stepMat; step.receiveShadows = true;
      // two people a row, staggered row to row so the rows behind show between the heads in front
      for (const f of k % 2 ? [0.3, 0.72] : [0.2, 0.58]) seats.push(new Vector3(side * (GALLERY.x0 + w * f + (k === 2 ? 0.25 : 0)), row.top, row.z + 0.05));
    });
    const front = MeshBuilder.CreatePlane(`bb_gallery_front_${side > 0 ? 'l' : 'r'}`, { width: w, height: GALLERY.rows[0].top }, scene);
    front.position.set(cx, GALLERY.rows[0].top / 2, GALLERY.rows[0].z + 0.48); front.rotation.y = Math.PI; front.material = fasciaMat;
    spots.push(seats);
  }
  return spots;
}

// ── risers and lecterns ─────────────────────────────────────────────────────────────────────────────────────────────
export interface Lectern {
  seatRoot: TransformNode;
  /** The state light: the lectern's crown and ring. */
  light(hexColor: string, k: number): void;
  /** The screen on the front: the seat's tag and score. */
  screen(tag: string, score: number): void;
  /** The buzzer dome punches (the slap landed). */
  buzz(): void;
  tick(dt: number): void;
}

function buildLectern(scene: Scene, seat: number, color: string): Lectern {
  const seatRoot = new TransformNode(`bb_seat_${seat}`, scene);
  const riserH = SEATS.riser;
  // the riser: a round platform, a panelled side with a lit band in the seat colour, a rubber top with a ring
  const side = painted(scene, `bb_riser_side_${seat}`, 1024, 128, (g, w, h) => {
    g.fillStyle = '#17123a'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 64) { g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x, 0, 3, h); }
    g.fillStyle = color; g.fillRect(0, h * 0.42, w, h * 0.16);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 2, w, 3);
  });
  const sideGlow = painted(scene, `bb_riser_glow_${seat}`, 256, 32, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = color; g.fillRect(0, h * 0.42, w, h * 0.16); });
  const riser = MeshBuilder.CreateCylinder(`bb_riser_${seat}`, { height: riserH, diameter: RISER_R * 2, tessellation: 40, cap: Mesh.NO_CAP }, scene);
  riser.parent = seatRoot; riser.position.set(0, riserH / 2, 0.15);
  riser.material = material(scene, `bb_riser_mat_${seat}`, { albedo: side, emissiveTex: sideGlow, emissive: '#ffffff', glow: 0.9, roughness: 0.45, metallic: 0.3 });
  const topTex = painted(scene, `bb_riser_top_${seat}`, 512, 512, (g, w) => {
    const c = w / 2;
    g.fillStyle = '#231c4d'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * w, 2, 2); }
    g.strokeStyle = color; g.lineWidth = 14; g.beginPath(); g.arc(c, c, c * 0.93, 0, TAU); g.stroke();
  });
  const cap = MeshBuilder.CreateDisc(`bb_riser_top_${seat}`, { radius: RISER_R, tessellation: 40 }, scene);
  cap.parent = seatRoot; cap.rotation.x = Math.PI / 2; cap.position.set(0, riserH + 0.002, 0.15);
  cap.material = material(scene, `bb_riser_topmat_${seat}`, { albedo: topTex, roughness: 0.85 });
  cap.receiveShadows = true;

  // the lectern: slim and tapered (the old 0.84 m box hid the body to the chest), in front of the body where the party
  // clips put the hands (PODIUM_AHEAD_M) and at their height (PODIUM_TOP_M)
  const H = PODIUM_TOP_M - 0.04, depthTop = 0.34;
  const root = new TransformNode(`bb_lectern_${seat}`, scene); root.parent = seatRoot;
  root.position.set(0, riserH, PODIUM_AHEAD_M + depthTop / 2 - 0.06);
  const shell = painted(scene, `bb_lectern_shell_${seat}`, 512, 256, (g, w, h) => {
    const lg = g.createLinearGradient(0, 0, 0, h); lg.addColorStop(0, '#2b2466'); lg.addColorStop(1, '#0f0b28');
    g.fillStyle = lg; g.fillRect(0, 0, w, h);
    g.fillStyle = color; for (const x of [w * 0.12, w * 0.38, w * 0.62, w * 0.88]) g.fillRect(x - 3, 0, 6, h);
    g.fillStyle = 'rgba(255,255,255,0.10)'; for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 1);
  });
  const shellGlow = painted(scene, `bb_lectern_seams_${seat}`, 256, 64, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = color; for (const x of [w * 0.12, w * 0.38, w * 0.62, w * 0.88]) g.fillRect(x - 2, 0, 4, h); });
  const body = MeshBuilder.CreateCylinder(`bb_lectern_body_${seat}`, { height: H, diameterTop: 0.66, diameterBottom: 0.44, tessellation: 32 }, scene);
  body.parent = root; body.position.y = H / 2; body.scaling.z = depthTop / 0.66;
  body.material = material(scene, `bb_lectern_mat_${seat}`, { albedo: shell, emissiveTex: shellGlow, emissive: '#ffffff', glow: 0.5, roughness: 0.3, metallic: 0.45 });
  // the crown (state light) and a ring just under it
  const crownMat = material(scene, `bb_lectern_topmat_${seat}`, { color: '#0c0a1a', emissive: color, glow: 0.3, roughness: 0.25, metallic: 0.2 });
  const crown = MeshBuilder.CreateCylinder(`bb_lectern_top_${seat}`, { height: 0.035, diameter: 0.72, tessellation: 32 }, scene);
  crown.parent = root; crown.position.y = H + 0.018; crown.scaling.z = (depthTop + 0.04) / 0.72; crown.material = crownMat;
  const ringMat = material(scene, `bb_lectern_frontmat_${seat}`, { color: '#000000', emissive: color, glow: 0.3, roughness: 0.4 });
  const ring = MeshBuilder.CreateTorus(`bb_lectern_ring_${seat}`, { diameter: 0.6, thickness: 0.03, tessellation: 40 }, scene);
  ring.parent = root; ring.position.y = H * 0.84; ring.scaling.z = depthTop / 0.6; ring.material = ringMat;
  // the buzzer dome where the slap lands (party_buzz: the right hand at +0.12 m, PODIUM_AHEAD_M forward)
  const buzzMat = material(scene, `bb_buzzer_mat_${seat}`, { color: '#b3122a', emissive: '#ff2d55', glow: 0.35, roughness: 0.2, metallic: 0.1 });
  const buzzer = MeshBuilder.CreateSphere(`bb_buzzer_${seat}`, { diameter: 0.14, segments: 16, slice: 0.5 }, scene);
  buzzer.parent = root; buzzer.position.set(0.12, H + 0.035, -(depthTop / 2 - 0.06) + 0.02); buzzer.material = buzzMat;
  // the screen on the front: seat and score
  const screenTex = new DynamicTexture(`bb_lectern_screen_${seat}`, { width: 512, height: 288 }, scene, true);
  const screenMat = material(scene, `bb_lectern_screenmat_${seat}`, { color: '#000000', emissiveTex: screenTex, emissive: '#ffffff', glow: 1, roughness: 0.3 });
  const screen = MeshBuilder.CreatePlane(`bb_lectern_screen_${seat}`, { width: 0.46, height: 0.26 }, scene);
  screen.parent = root; screen.position.set(0, H * 0.55, depthTop / 2 * 0.9 + 0.012); screen.rotation.set(-0.1, Math.PI, 0);
  screen.material = screenMat;
  let shown = '';
  const drawScreen = (tag: string, score: number) => {
    const key = `${tag}|${score}`; if (key === shown) return; shown = key;
    const g = screenTex.getContext() as unknown as CanvasRenderingContext2D, w = 512, h = 288;
    g.fillStyle = '#070512'; g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 14; g.strokeRect(10, 10, w - 20, h - 20);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 112px "Arial Black", Impact, system-ui, sans-serif'; g.fillStyle = color; g.fillText(tag, w / 2, h * 0.4);
    g.font = '800 64px ui-monospace, Menlo, monospace'; g.fillStyle = '#ffffff'; g.fillText(String(score), w / 2, h * 0.76);
    screenTex.update(true);
  };
  drawScreen(seat ? 'P2' : 'P1', 0);
  let punch = 0;
  return {
    seatRoot,
    light(hexColor, k) { const c = hex(hexColor).scale(k); crownMat.emissiveColor = c; ringMat.emissiveColor = c; },
    screen: drawScreen,
    buzz() { punch = 1; },
    tick(dt) {
      if (punch <= 0) return;
      punch = Math.max(0, punch - dt * 4);
      const s = 1 + Math.sin(punch * Math.PI) * 0.35;
      buzzer.scaling.set(s, 1 / s, s);
      buzzMat.emissiveColor = hex('#ff2d55').scale(0.35 + punch * 1.6);
    },
  };
}

// ── light beams ─────────────────────────────────────────────────────────────────────────────────────────────────────
function beam(scene: Scene, name: string, from: Vector3, to: Vector3, color: string, fade: DynamicTexture, alpha: number): Mesh {
  const len = Vector3.Distance(from, to);
  const m = MeshBuilder.CreateCylinder(name, { height: len, diameterTop: 0.25, diameterBottom: 2.2, tessellation: 24, cap: Mesh.NO_CAP }, scene);
  m.position = Vector3.Lerp(from, to, 0.5);
  const dir = to.subtract(from).normalize();
  // the cylinder's +y points from `to` up to `from`
  const up = dir.scale(-1);
  const axis = Vector3.Cross(Vector3.Up(), up); const ang = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(Vector3.Up(), up))));
  if (axis.length() > 1e-5) m.rotate(axis.normalize(), ang);
  const mat = material(scene, `${name}_mat`, { color, unlit: true, alpha });
  mat.opacityTexture = fade; mat.alphaMode = Constants.ALPHA_ADD; mat.backFaceCulling = false; mat.disableDepthWrite = true;
  m.material = mat; m.isPickable = false;
  return m;
}

// ── the whole set ───────────────────────────────────────────────────────────────────────────────────────────────────
export interface StageHandle {
  /** The node that spins (rotation.z is the roll; BrainBrawlCore.wheelLanding aims it). */
  wheel: TransformNode;
  lecterns: Lectern[];
  /** Where the audience stands, one list per gallery. */
  crowd: Vector3[][];
  /** Wash the LED wall in a colour (the landed category, a claim) — it eases back on its own. */
  flash(hexColor: string, k?: number): void;
  /** Per frame: the flapper, the bulbs, the wall. `spinning` is the wheel's angular speed (rad/s). Returns true on a peg tick. */
  tick(dt: number, spinSpeed: number): boolean;
}

export function buildStage(scene: Scene, seatColors: readonly string[]): StageHandle {
  const wall = buildWall(scene);
  buildDeck(scene);
  const w = buildWheel(scene);
  const crowd = buildGalleries(scene);
  const lecterns = seatColors.map((c, i) => buildLectern(scene, i, c));
  const fade = fadeTex(scene);
  // two beams onto the podiums (the seat colours) and one down the wheel's column, all from above the frame
  const beams = [
    beam(scene, 'bb_beam_p1', new Vector3(5.5, 11, -6), new Vector3(SEATS.spread, 0.6, SEATS.z), seatColors[0] ?? '#22d3ee', fade, 0.16),
    beam(scene, 'bb_beam_p2', new Vector3(-5.5, 11, -6), new Vector3(-SEATS.spread, 0.6, SEATS.z), seatColors[1] ?? '#facc15', fade, 0.16),
    beam(scene, 'bb_beam_host', new Vector3(HOST_AT.x * 0.7, 12, HOST_AT.z - 2.5), new Vector3(HOST_AT.x, 0, HOST_AT.z), '#b9b2ff', fade, 0.1),
  ];
  let wash = 0, washColor = hex('#ffffff'), t = 0, flapA = 0, flapV = 0, lastPeg = Math.floor(w.root.rotation.z / (TAU / 5));
  const baseGlow = wall.mats.map((m) => m.emissiveColor.clone());
  return {
    wheel: w.root, lecterns, crowd,
    flash(hexColor, k = 1) { wash = k; washColor = hex(hexColor); },
    tick(dt, spinSpeed) {
      t += dt;
      for (const l of lecterns) l.tick(dt);
      // the wall: a colour wash that eases back, and a slow breath
      wash = Math.max(0, wash - dt * 1.2);
      const breath = 0.94 + Math.sin(t * 1.3) * 0.06;
      wall.mats.forEach((m, i) => { m.emissiveColor = Color3.Lerp(baseGlow[i], washColor, wash * 0.55).scale(breath); });
      // the bulbs: chase while it spins (faster with the wheel), a slow alternate at rest
      const rate = spinSpeed > 0.3 ? 4 + spinSpeed * 1.2 : 1.1;
      const on = Math.floor(t * rate) % 2;
      w.bulbs[0].emissiveColor = hex('#ffe7a3').scale(on ? 1.5 : 0.35);
      w.bulbs[1].emissiveColor = hex('#ffe7a3').scale(on ? 0.35 : 1.5);
      w.marquee.emissiveColor = hex('#8b7bff').scale(1 + (spinSpeed > 0.3 ? 0.4 * Math.sin(t * 20) : 0) + wash * 0.8);
      // the flapper: each peg crossing the top kicks it; a damped spring brings it back
      const peg = Math.floor(w.root.rotation.z / (TAU / 5));
      let ticked = false;
      if (peg !== lastPeg) { flapV += Math.min(9, 2 + spinSpeed * 0.9) * Math.sign(peg - lastPeg); lastPeg = peg; ticked = true; }
      flapV += (-flapA * 180 - flapV * 14) * dt; flapA += flapV * dt;
      flapA = Math.max(-0.6, Math.min(0.6, flapA));
      w.flap.rotation.z = -flapA;
      for (const b of beams) b.visibility = 0.85 + Math.sin(t * 0.7 + b.position.x) * 0.15;
      return ticked;
    },
  };
}
