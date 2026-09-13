// VenueKit — procedural environments for every mode family. Zero external
// assets: grounds, venue-box walls, and signature props are meshes + dynamic
// textures, so scenes are FULL today; GLB venue pieces can replace parts later.

import {
  Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, PBRMaterial, TransformNode, Vector3,
} from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import type { GrindLine } from '../core/GroundRide';
import { applyFloorDetailToMesh, floorDetailFor } from './groundTextures';

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
function paintedGround(
  scene: Scene, w: number, l: number, base: string,
  paint: (ctx: CanvasRenderingContext2D, W: number, H: number) => void,
): Mesh {
  const ground = MeshBuilder.CreateGround('venue_ground', { width: w, height: l }, scene);
  const tex = new DynamicTexture('venue_ground_tex', { width: 1024, height: 1024 }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = base; ctx.fillRect(0, 0, 1024, 1024);
  paint(ctx, 1024, 1024);
  tex.update();
  // the finish: a soft center glow painted INTO the texture (no lights added)
  const glow = ctx.createRadialGradient(512, 512, 60, 512, 512, 640);
  glow.addColorStop(0, 'rgba(255,255,255,0.10)');
  glow.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1024, 1024);
  tex.update();
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
  painters: Array<(ctx: CanvasRenderingContext2D, W: number, H: number) => void>,
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
    const tex = new DynamicTexture(`wall_tex_${d.name}`, { width: 1024, height: 256 }, scene, false);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    (painters[i % painters.length])(ctx, 1024, 256);
    wallJuice(ctx, 1024, 256);          // every venue gets the finish
    tex.update();
    const m = new PBRMaterial(`wall_mat_${d.name}`, scene);
    m.albedoTexture = tex; m.emissiveTexture = tex; m.emissiveColor = new Color3(0.35, 0.35, 0.35);
    m.metallic = 0; m.roughness = 0.9;
    m.backFaceCulling = false;
    wall.material = m; wall.isPickable = false;
  });
  return root;
}

// ── Wall painters (reused across venues) ────────────────────────────────────
const paintBleachers = (crowd: string[]) => (ctx: CanvasRenderingContext2D, W: number, H: number) => {
  ctx.fillStyle = '#1a2028'; ctx.fillRect(0, 0, W, H);
  for (let row = 0; row < 5; row++) {
    ctx.fillStyle = '#242c36'; ctx.fillRect(0, H - (row + 1) * 44, W, 10);
    for (let x = 8; x < W; x += 18) {
      ctx.fillStyle = crowd[(x / 18 + row) % crowd.length | 0];
      ctx.beginPath(); ctx.arc(x, H - (row + 1) * 44 - 8, 6, 0, Math.PI * 2); ctx.fill();
    }
  }
};
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
    paintedGround(scene, 44, 90, '#1e4d2b', (ctx, W, H) => {
      ctx.strokeStyle = '#eaf2ea'; ctx.lineWidth = 4;
      for (let i = 1; i < 9; i++) {                                     // yard lines
        const y = (H / 9) * i;
        ctx.beginPath(); ctx.moveTo(W * 0.08, y); ctx.lineTo(W * 0.92, y); ctx.stroke();
        ctx.font = 'bold 34px monospace'; ctx.fillStyle = '#eaf2ea';
        ctx.fillText(String((i < 5 ? i : 9 - i) * 10), W * 0.12, y - 8);
      }
      ctx.fillStyle = 'rgba(255,61,94,0.35)'; ctx.fillRect(0, 0, W, H / 12);   // end zone
    });
    venueBox(scene, 48, 94, 8, [paintBleachers(CROWD)]);
    for (const z of [-30, 0, 30]) for (const x of [-19, 19]) {          // floodlights
      const glow = MeshBuilder.CreatePlane(`flood_${x}_${z}`, { width: 2.4, height: 1.2 }, scene);
      glow.position.set(x, 7, z); glow.billboardMode = Mesh.BILLBOARDMODE_ALL;
      const gm = mat(scene, 'flood', '#ffffff', 0); gm.emissiveColor = new Color3(0.9, 0.95, 1);
      glow.material = gm;
    }
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
