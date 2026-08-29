// rideWorlds v3 — REPLACES the M42 file. All three worlds get their Phase 5
// build-out (every mesh procedural, zero external assets, same as always):
//   SKATEPARK v2 — the park grows 46→70 units and gains a BOWL (an octagon
//     of inward-tilted banks), a DOWNHILL STRAIGHT (a long descending lane
//     that builds real speed), two quarter-pipes, a second funbox, and
//     five rails (was two) with escalating grind bonuses.
//   SLOPE v2 — rocks ON the piste (real obstacles), three down-slope RAILS
//     (snowboarding finally grinds), two KICKER ramps, and a SKI-LIFT line:
//     pylons + a high cable that is itself a grindable line (400 bonus) —
//     hit the kicker beside pylon 2 to reach it. Plus a marked YETI DEN
//     position the mode uses to spawn its new pursuer.
//   SURF v3 — the wave finally CURLS: a partial-arc cylinder rides above
//     the lip as a funnel/tube that opens and closes on a readable cycle
//     (barrelActive), and BUOYS dot the water as obstacles.
// New in the RideWorld contract: `obstacles` (position+radius list — empty
// where a world has none). Modes shipped alongside consume it.

import { Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';
import type { GrindLine } from '../core/GroundRide';

export interface RideObstacle { pos: Vector3; radius: number }

export interface RideWorld {
  ground: AbstractMesh[];
  grindLines: GrindLine[];
  markers: Vector3[];
  obstacles: RideObstacle[];
  dispose(): void;
}

function mat(scene: Scene, name: string, hex: string): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(hex);
  m.specularColor = Color3.Black();
  return m;
}

function paintGround(scene: Scene, w: number, h: number, painter: (g: CanvasRenderingContext2D, W: number, H: number) => void): StandardMaterial {
  const tex = new DynamicTexture('groundTex', { width: 1024, height: 1024 }, scene, false);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  painter(g, 1024, 1024);
  tex.update();
  const m = new StandardMaterial('groundMat', scene);
  m.diffuseTexture = tex;
  m.specularColor = Color3.Black();
  return m;
}

function makeRail(scene: Scene, all: AbstractMesh[], lines: GrindLine[], a: Vector3, b: Vector3, bonus: number): void {
  const rail = MeshBuilder.CreateCylinder('rail', { diameter: 0.09, height: Vector3.Distance(a, b) }, scene);
  rail.position = Vector3.Center(a, b);
  const d = b.subtract(a);
  rail.rotation.x = Math.PI / 2 - Math.atan2(d.y, Math.hypot(d.x, d.z));
  rail.rotation.y = Math.atan2(d.x, d.z);
  rail.material = mat(scene, 'railM', '#d8dce2');
  all.push(rail);
  lines.push({ a, b, bonus });
}

// ── SKATEPARK v2 — bowl, downhill straight, five rails ─────────────────────
export function buildSkatepark(scene: Scene): RideWorld {
  const all: AbstractMesh[] = [];
  const rideable: AbstractMesh[] = [];
  const ground = MeshBuilder.CreateGround('park_floor', { width: 70, height: 70 }, scene);
  ground.checkCollisions = true;
  ground.isPickable = true;
  ground.material = paintGround(scene, 70, 70, (g, W, H) => {
    g.fillStyle = '#8d8496'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 3;
    for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo((i / 14) * W, 0); g.lineTo((i / 14) * W, H); g.stroke(); }
    g.fillStyle = 'rgba(34,211,238,0.5)'; g.font = 'bold 90px sans-serif';
    g.fillText('FEL', W * 0.42, H * 0.52);
  });
  all.push(ground); rideable.push(ground);

  const rampM = mat(scene, 'rampM', '#6f6680');
  for (const [x, z, ry] of [[-22, -26, 0], [22, -26, 0], [0, 28, Math.PI], [-28, 0, Math.PI / 2], [28, 6, -Math.PI / 2]] as const) {
    const ramp = MeshBuilder.CreateBox('ramp', { width: 10, height: 0.6, depth: 6 }, scene);
    ramp.position.set(x, 1.15, z);
    ramp.rotation.set(-0.42, ry, 0);
    ramp.material = rampM;
    ramp.checkCollisions = true;
    all.push(ramp); rideable.push(ramp);
  }

  // THE BOWL — an octagon of inward-tilted banks around a sunken center;
  // carve the rim, drop in off any bank
  const bowlC = new Vector3(-16, 0, 14), bowlR = 6.5;
  const bankM = mat(scene, 'bowlM', '#5f5670');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const bank = MeshBuilder.CreateBox(`bowl_${i}`, { width: 5.4, height: 0.5, depth: 3.6 }, scene);
    bank.position.set(bowlC.x + Math.sin(a) * bowlR, 0.8, bowlC.z + Math.cos(a) * bowlR);
    bank.rotation.set(0.5, a + Math.PI, 0);         // tilted down toward the center
    bank.material = bankM;
    bank.checkCollisions = true;
    all.push(bank); rideable.push(bank);
  }

  // THE DOWNHILL STRAIGHT — a long descending lane; drop in at the high
  // end and it builds real speed toward the rail beside it
  const lane = MeshBuilder.CreateBox('dh_lane', { width: 8, height: 0.5, depth: 30 }, scene);
  lane.position.set(20, 1.6, -6);
  lane.rotation.set(0.14, 0, 0);
  lane.material = mat(scene, 'laneM', '#79708a');
  lane.checkCollisions = true;
  all.push(lane); rideable.push(lane);

  const boxM = mat(scene, 'funM', '#5a5266');
  for (const [x, z] of [[0, -2], [-8, -12]] as const) {
    const box = MeshBuilder.CreateBox('funbox', { width: 6, height: 1.1, depth: 4 }, scene);
    box.position.set(x, 0.55, z);
    box.material = boxM;
    all.push(box);
  }

  const grindLines: GrindLine[] = [];
  makeRail(scene, all, grindLines, new Vector3(-6, 0.8, 4), new Vector3(-6, 0.8, 12), 180);
  makeRail(scene, all, grindLines, new Vector3(6, 0.8, -4), new Vector3(6, 0.8, -12), 180);
  makeRail(scene, all, grindLines, new Vector3(16, 2.9, -18), new Vector3(16, 0.9, 6), 220);   // beside the downhill lane
  makeRail(scene, all, grindLines, new Vector3(-2, 0.8, 20), new Vector3(6, 0.8, 24), 260);    // kinked pair, part 1
  makeRail(scene, all, grindLines, new Vector3(6, 0.8, 24), new Vector3(14, 0.8, 20), 300);    // part 2 — transfer pays most

  return { ground: rideable, grindLines, markers: [], obstacles: [], dispose: () => all.forEach((m) => m.dispose()) };
}

// ── SLOPE v2 — rocks, rails, kickers, the ski-lift grind, the yeti den ─────
export function buildSlopeRun(scene: Scene): RideWorld {
  const all: AbstractMesh[] = [];
  const rideable: AbstractMesh[] = [];
  const PITCH = 0.22;
  const piste = MeshBuilder.CreateGround('piste', { width: 34, height: 220 }, scene);
  piste.rotation.x = PITCH;
  piste.position.set(0, 0, 0);
  piste.checkCollisions = true;
  piste.isPickable = true;
  piste.material = paintGround(scene, 34, 220, (g, W, H) => {
    g.fillStyle = '#eef3f7'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(120,150,175,0.25)'; g.lineWidth = 5;
    for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo((i / 14) * W, 0); g.lineTo((i / 14) * W + 30, H); g.stroke(); }
  });
  all.push(piste); rideable.push(piste);

  const onPiste = (x: number, dist: number): Vector3 =>
    new Vector3(x, -Math.sin(PITCH) * dist, Math.cos(PITCH) * dist);

  const markers: Vector3[] = [];
  const gateMatL = mat(scene, 'gateL', '#e23c50'), gateMatR = mat(scene, 'gateR', '#2c6fe2');
  for (let i = 0; i < 12; i++) {
    const dist = 18 + i * 15;
    const cx = Math.sin(i * 1.7) * 9;
    markers.push(onPiste(cx, dist));
    for (const side of [-1, 1]) {
      const pole = MeshBuilder.CreateCylinder('gate', { diameter: 0.12, height: 1.6 }, scene);
      pole.position = onPiste(cx + side * 1.7, dist).add(new Vector3(0, 0.8, 0));
      pole.material = side < 0 ? gateMatL : gateMatR;
      all.push(pole);
    }
  }

  // trees (scenery, off-piste) — unchanged from M39
  const trunkM = mat(scene, 'trunk', '#5a3d26'), leafM = mat(scene, 'leaf', '#1d4d2b');
  for (let i = 0; i < 22; i++) {
    const dist = 10 + i * 9.5;
    const x = (i % 2 ? 1 : -1) * (15 + (i * 7) % 4);
    const p = onPiste(x, dist);
    const trunk = MeshBuilder.CreateCylinder('trunk', { diameter: 0.3, height: 1.4 }, scene);
    trunk.position = p.add(new Vector3(0, 0.7, 0)); trunk.material = trunkM;
    const leaf = MeshBuilder.CreateCylinder('leaf', { diameterTop: 0, diameterBottom: 1.9, height: 3.2 }, scene);
    leaf.position = p.add(new Vector3(0, 3, 0)); leaf.material = leafM;
    all.push(trunk, leaf);
  }

  // ROCKS — actually on the piste, between gates, never ON a gate line
  const obstacles: RideObstacle[] = [];
  const rockM = mat(scene, 'rockM', '#7d838c');
  for (let i = 0; i < 8; i++) {
    const dist = 26 + i * 21;
    const x = Math.sin(i * 2.9) * 10;
    const p = onPiste(x, dist);
    const rock = MeshBuilder.CreateSphere(`rock_${i}`, { diameter: 1.7, segments: 6 }, scene);
    rock.position = p.add(new Vector3(0, 0.35, 0));
    rock.scaling.y = 0.55;
    rock.material = rockM;
    all.push(rock);
    obstacles.push({ pos: rock.position, radius: 1.0 });
  }

  // RAILS — three down-slope grind lines following the piste surface
  const grindLines: GrindLine[] = [];
  for (const [x, d1, d2, bonus] of [[-5, 40, 58, 200], [6, 92, 112, 240], [-3, 150, 172, 280]] as const) {
    makeRail(scene, all, grindLines,
      onPiste(x, d1).add(new Vector3(0, 0.7, 0)),
      onPiste(x, d2).add(new Vector3(0, 0.7, 0)), bonus);
  }

  // KICKERS — two launch ramps; the second sits under the lift cable
  const kickM = mat(scene, 'kickM', '#cfd8e2');
  for (const [x, dist] of [[3, 70], [11.5, 125]] as const) {
    const kick = MeshBuilder.CreateBox('kicker', { width: 5, height: 0.5, depth: 4 }, scene);
    kick.position = onPiste(x, dist).add(new Vector3(0, 0.7, 0));
    kick.rotation.set(PITCH - 0.5, 0, 0);
    kick.material = kickM;
    kick.checkCollisions = true;
    all.push(kick); rideable.push(kick);
  }

  // SKI-LIFT — pylons down the right edge, cable strung pylon-to-pylon,
  // and the cable IS a grind line (hit the second kicker to reach it)
  const pylonM = mat(scene, 'pylonM', '#3a424c');
  const cableM = mat(scene, 'cableM', '#20262d');
  const pylonTops: Vector3[] = [];
  for (let i = 0; i < 5; i++) {
    const p = onPiste(13.5, 30 + i * 40);
    const pylon = MeshBuilder.CreateCylinder(`pylon_${i}`, { diameter: 0.35, height: 5.4 }, scene);
    pylon.position = p.add(new Vector3(0, 2.7, 0));
    pylon.material = pylonM;
    all.push(pylon);
    pylonTops.push(p.add(new Vector3(0, 5.2, 0)));
    // a hanging chair every other pylon — pure dressing
    if (i % 2 === 0) {
      const chair = MeshBuilder.CreateBox(`chair_${i}`, { width: 0.9, height: 0.7, depth: 0.6 }, scene);
      chair.position = p.add(new Vector3(0, 4.1, 6));
      chair.material = pylonM;
      all.push(chair);
    }
  }
  for (let i = 0; i < pylonTops.length - 1; i++) {
    const a = pylonTops[i], b = pylonTops[i + 1];
    const cable = MeshBuilder.CreateCylinder(`cable_${i}`, { diameter: 0.07, height: Vector3.Distance(a, b) }, scene);
    cable.position = Vector3.Center(a, b);
    const d = b.subtract(a);
    cable.rotation.x = Math.PI / 2 - Math.atan2(d.y, Math.hypot(d.x, d.z));
    cable.rotation.y = Math.atan2(d.x, d.z);
    cable.material = cableM;
    all.push(cable);
  }
  // the whole cable run as one high-value grind line (segment 2→3 sits
  // right past the second kicker's launch arc)
  grindLines.push({ a: pylonTops[2], b: pylonTops[3], bonus: 400 });

  return { ground: rideable, grindLines, markers, obstacles, dispose: () => all.forEach((m) => m.dispose()) };
}

// ── SURF v3 — the curling funnel wave + buoys ──────────────────────────────
export function buildSurfBreak(scene: Scene): {
  world: RideWorld;
  waveLipAt(tSec: number): Vector3;
  barrelActive(tSec: number): boolean;
} {
  const all: AbstractMesh[] = [];
  const water = MeshBuilder.CreateGround('water', { width: 90, height: 220 }, scene);
  water.checkCollisions = true;
  water.isPickable = true;
  water.material = paintGround(scene, 90, 220, (g, W, H) => {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1a7fae'); grad.addColorStop(1, '#0c4a72');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 3;
    for (let i = 0; i < 34; i++) {
      g.beginPath(); g.moveTo(Math.random() * W, Math.random() * H);
      g.bezierCurveTo(Math.random() * W, Math.random() * H, Math.random() * W, Math.random() * H, Math.random() * W, Math.random() * H);
      g.stroke();
    }
  });
  all.push(water);

  const sky = MeshBuilder.CreatePlane('surfSky', { width: 200, height: 60 }, scene);
  sky.position.set(0, 28, -95);
  const skyMat = mat(scene, 'surfSkyM', '#2a6f92');
  skyMat.backFaceCulling = false;
  sky.material = skyMat;
  all.push(sky);

  // primary wave the mode rides
  const lip = MeshBuilder.CreateCylinder('waveLip', { diameter: 3.4, height: 70, tessellation: 12 }, scene);
  lip.rotation.z = Math.PI / 2;
  lip.position.set(0, 0.9, -30);
  const lipM = mat(scene, 'lipM', '#37b6d9'); lipM.alpha = 0.85;
  lip.material = lipM;
  all.push(lip);

  // THE FUNNEL — a partial-arc shell curling over the pocket ahead of the
  // lip. Parented to the lip so it travels with the wave; the barrel cycle
  // fades it in (open tube you can ride inside) and out (wave backs off).
  const tube = MeshBuilder.CreateCylinder('waveTube', {
    diameter: 8.4, height: 66, tessellation: 24, arc: 0.45, enclose: false,
    sideOrientation: Mesh.DOUBLESIDE,
  }, scene);
  tube.parent = lip;
  // lip's local axis is Y (world X after the lip's own rotation) — the tube
  // shares it; roll the open arc so it faces the shore (+z world) and hoods
  // over the pocket
  tube.position.set(0, 0, 0);
  tube.rotation.set(0, Math.PI * 0.62, 0);
  const tubeM = mat(scene, 'tubeM', '#2b98c4');
  tubeM.alpha = 0.55;
  tubeM.backFaceCulling = false;
  tube.material = tubeM;
  all.push(tube);

  // a second, distant swell line purely for depth/scale cues
  const farSwell = MeshBuilder.CreateCylinder('farSwell', { diameter: 1.6, height: 70, tessellation: 8 }, scene);
  farSwell.rotation.z = Math.PI / 2;
  farSwell.position.set(0, 0.5, -70);
  const farM = mat(scene, 'farSwellM', '#1e5c82'); farM.alpha = 0.6;
  farSwell.material = farM;
  all.push(farSwell);

  const shore = MeshBuilder.CreateGround('shore', { width: 90, height: 18 }, scene);
  shore.position.set(0, 0.02, 96);
  shore.material = mat(scene, 'sand', '#d9c28f');
  all.push(shore);

  // BUOYS — fixed obstacles in the lineup; hitting one is a wipeout
  const obstacles: RideObstacle[] = [];
  const buoyM = mat(scene, 'buoyM', '#ff5a3c');
  for (const [x, z] of [[-14, -8], [18, 12], [-22, 38], [9, 62]] as const) {
    const buoy = MeshBuilder.CreateSphere(`buoy_${x}_${z}`, { diameter: 1.1 }, scene);
    buoy.position.set(x, 0.5, z);
    buoy.material = buoyM;
    all.push(buoy);
    obstacles.push({ pos: buoy.position, radius: 0.9 });
  }

  const world: RideWorld = {
    ground: [water], grindLines: [], markers: [], obstacles,
    dispose: () => all.forEach((m) => m.dispose()),
  };
  const BARREL_ON = 8, BARREL_CYCLE = 18;
  const barrelActive = (tSec: number): boolean => (tSec % BARREL_CYCLE) < BARREL_ON;
  const waveLipAt = (tSec: number): Vector3 => {
    const z = -50 + ((tSec * 4.5) % 140);
    lip.position.z = z;
    lip.position.y = 0.9 + Math.sin(tSec * 2.2) * 0.15;
    // the funnel breathes with the barrel cycle
    const active = barrelActive(tSec);
    tubeM.alpha += ((active ? 0.55 : 0.08) - tubeM.alpha) * 0.06;
    return lip.position;
  };
  return { world, waveLipAt, barrelActive };
}
