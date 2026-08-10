// VenueKit — procedural environments for every mode family. Zero external
// assets: grounds, venue-box walls, and signature props are meshes + dynamic
// textures, so scenes are FULL today; GLB venue pieces can replace parts later.

import {
  Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3,
} from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import type { GrindLine } from '../core/GroundRide';

const mat = (scene: Scene, name: string, hex: string, emissive = 0.06): StandardMaterial => {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.emissiveColor = Color3.FromHexString(hex).scale(emissive);   // ambient floor rule
  m.specularColor = new Color3(0.05, 0.05, 0.05);
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
  const m = new StandardMaterial('venue_ground_mat', scene);
  m.diffuseTexture = tex;
  m.emissiveColor = Color3.FromHexString(base).scale(0.08);
  m.specularColor = new Color3(0.04, 0.04, 0.04);
  ground.material = m;
  ground.receiveShadows = true;
  ground.checkCollisions = false;
  ground.isPickable = true;                 // camera occlusion probe needs it
  return ground;
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
    tex.update();
    const m = new StandardMaterial(`wall_mat_${d.name}`, scene);
    m.diffuseTexture = tex; m.emissiveTexture = tex; m.emissiveColor = new Color3(0.35, 0.35, 0.35);
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
const paintGraffiti = (ctx: CanvasRenderingContext2D, W: number, H: number) => {
  ctx.fillStyle = '#2b2b31'; ctx.fillRect(0, 0, W, H);
  const cols = ['#ff006e', '#3a86ff', '#ffbe0b', '#34e89e', '#fb5607'];
  for (let i = 0; i < 14; i++) {
    ctx.strokeStyle = cols[i % cols.length]; ctx.lineWidth = 8 + Math.random() * 10;
    ctx.beginPath();
    ctx.moveTo(Math.random() * W, Math.random() * H);
    ctx.bezierCurveTo(Math.random() * W, Math.random() * H, Math.random() * W, Math.random() * H, Math.random() * W, Math.random() * H);
    ctx.stroke();
  }
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
    paintedGround(scene, 22, 90, '#1e4d2b', (ctx, W, H) => {
      ctx.strokeStyle = '#eaf2ea'; ctx.lineWidth = 4;
      for (let i = 1; i < 9; i++) {                                     // yard lines
        const y = (H / 9) * i;
        ctx.beginPath(); ctx.moveTo(W * 0.08, y); ctx.lineTo(W * 0.92, y); ctx.stroke();
        ctx.font = 'bold 34px monospace'; ctx.fillStyle = '#eaf2ea';
        ctx.fillText(String((i < 5 ? i : 9 - i) * 10), W * 0.12, y - 8);
      }
      ctx.fillStyle = 'rgba(255,61,94,0.35)'; ctx.fillRect(0, 0, W, H / 12);   // end zone
    });
    venueBox(scene, 26, 94, 8, [paintBleachers(CROWD)]);
    for (const z of [-30, 0, 30]) for (const x of [-13, 13]) {          // floodlights
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
    paintedGround(scene, 60, 400, '#eef4fa', (ctx, W, H) => {
      ctx.fillStyle = 'rgba(160,190,220,0.35)';
      for (let i = 0; i < 200; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 3, 12);  // groom lines
    });
    venueBox(scene, 64, 404, 12, [paintTrees(true)]);
    for (let z = -40; z > -360; z -= 60) for (const x of [-24, 24]) {   // gate flags
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

  buildField(scene: Scene, preset: 'tennis' | 'golf' | 'ballpark' | 'pitch'): void {
    const bases = { tennis: '#2f6d8f', golf: '#2c7a3f', ballpark: '#3a7a4a', pitch: '#2c6e3f' } as const;
    paintedGround(scene, 30, 40, bases[preset], (ctx, W, H) => {
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
    venueBox(scene, 34, 44, 7, [paintBleachers(CROWD), paintTrees(false)]);
  },
};
