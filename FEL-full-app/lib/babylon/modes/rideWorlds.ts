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

import { Color3, DynamicTexture, Mesh, MeshBuilder, StandardMaterial, PBRMaterial, TransformNode, Vector3, Matrix, Material } from '@babylonjs/core';
import type { AbstractMesh, Scene } from '@babylonjs/core';
import type { GrindLine } from '../core/GroundRide';
import { SKATE_VENUES, type BoardVenue } from '../nexus/boardVenues';
import { applyFloorDetailToMesh } from '../visual/groundTextures';

export interface RideObstacle { pos: Vector3; radius: number }

export interface RideWorld {
  ground: AbstractMesh[];
  grindLines: GrindLine[];
  markers: Vector3[];
  obstacles: RideObstacle[];
  /** L4 — where onlookers stand in THIS venue. Where the people of a place
   *  belong is knowledge the venue has and a mode does not, so the builder
   *  hands them over rather than each mode guessing coordinates. */
  crowdSpots: Vector3[];
  /** Half-extent of the rideable world, metres. The mode's clamp and the fence read THIS, not a module constant, so a
   *  venue can be a different size without the two disagreeing. */
  bound: number;
  dispose(): void;
}

/** Ride-world props are PBR (Phase 1, 2026-09-03): matte, lit by the IBL and the tier's shadows. */
function mat(scene: Scene, name: string, hex: string): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = Color3.FromHexString(hex);
  m.metallic = 0; m.roughness = 0.9;
  return m;
}

function paintGround(scene: Scene, w: number, h: number, painter: (g: CanvasRenderingContext2D, W: number, H: number) => void): PBRMaterial {
  const tex = new DynamicTexture('groundTex', { width: 1024, height: 1024 }, scene, false);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  painter(g, 1024, 1024);
  tex.update();
  const m = new PBRMaterial('groundMat', scene);
  m.albedoTexture = tex;
  m.metallic = 0; m.roughness = 0.95;                 // snow, sand, asphalt: all matte
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

/** Half-width of the skatepark's playable area. The rider clamps here AND the
 *  fence is built here — one constant so a player never hits an invisible wall. */
export const PARK_BOUND = 33;

// ── SKATEPARK v2 — bowl, downhill straight, five rails ─────────────────────
/**
 * THE SKATEPARK, built to a VENUE.
 *
 * Two things were wrong with the one fixed park this replaces, and both were measured rather than felt:
 *
 *   COLOUR. Every surface was a shade of one grey-purple — ground #8d8496, ramps #6f6680, bowl #5f5670, lane #79708a,
 *   boxes #5a5266, fence #3c3947. Six materials, one value. That is why it read washed-out beside the snow run, which
 *   has green against white against blue. Each venue now brings a real palette and the surfaces take their colours
 *   from it, so the place has ground, structure, markings, edges and one accent that is allowed to shout.
 *
 *   SIZE. The park was 70 units across with the rider clamped at 33, and a rider crosses that in EIGHT SECONDS at ride
 *   speed. The layout is now laid out in FRACTIONS of the venue's own bound, so a bigger venue is genuinely a bigger
 *   place with more in it rather than the same furniture pushed further apart.
 */
export function buildSkatepark(scene: Scene, venue: BoardVenue = SKATE_VENUES[0]): RideWorld {
  const all: AbstractMesh[] = [];
  const rideable: AbstractMesh[] = [];
  const P = venue.palette;
  const B = venue.bound;
  /** Place a feature at a fraction of the bound, so every venue keeps its proportions. */
  const f = (frac: number): number => frac * B;

  const ground = MeshBuilder.CreateGround('park_floor', { width: B * 2 + 8, height: B * 2 + 8 }, scene);
  ground.checkCollisions = true;
  ground.isPickable = true;
  ground.material = paintGround(scene, B * 2 + 8, B * 2 + 8, (g, W, H) => {
    g.fillStyle = P.ground; g.fillRect(0, 0, W, H);
    // slab joints, and a few of them stained — a flat grid reads as graph paper, not concrete
    g.strokeStyle = P.line; g.globalAlpha = 0.10; g.lineWidth = 3;
    for (let i = 1; i < 16; i++) {
      g.beginPath(); g.moveTo((i / 16) * W, 0); g.lineTo((i / 16) * W, H); g.stroke();
      g.beginPath(); g.moveTo(0, (i / 16) * H); g.lineTo(W, (i / 16) * H); g.stroke();
    }
    g.globalAlpha = 0.06; g.fillStyle = P.edge;
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * W, y = Math.random() * H, r = 12 + Math.random() * 46;
      g.beginPath(); g.ellipse(x, y, r, r * 0.6, Math.random() * Math.PI, 0, Math.PI * 2); g.fill();
    }
    // painted lines: a place people marked, which is most of what makes concrete read as a park
    g.globalAlpha = 0.5; g.strokeStyle = P.accent; g.lineWidth = 8;
    g.beginPath(); g.arc(W * 0.31, H * 0.63, W * 0.11, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(W * 0.62, H * 0.18); g.lineTo(W * 0.62, H * 0.82); g.stroke();
    g.globalAlpha = 0.42; g.fillStyle = P.accent; g.font = `bold ${Math.round(W * 0.07)}px sans-serif`;
    g.fillText('FEL', W * 0.44, H * 0.53);
    g.globalAlpha = 1;
  });
  applyFloorDetailToMesh(scene, ground, { kind: 'asphalt', blend: 0.55 }, [B * 2 + 8, B * 2 + 8]);
  all.push(ground); rideable.push(ground);

  const rampM = mat(scene, `rampM_${venue.id}`, P.structure);
  const bankM = mat(scene, `bowlM_${venue.id}`, P.structure);
  const laneM = mat(scene, `laneM_${venue.id}`, P.structure);
  const boxM = mat(scene, `funM_${venue.id}`, P.structure);
  const accentM = mat(scene, `accentM_${venue.id}`, P.accent);

  // BANKS around the outside, laid out on the bound so the far ones are reachable rather than decorative
  for (const [fx, fz, ry] of [
    [-0.66, -0.78, 0], [0.66, -0.78, 0], [0, 0.84, Math.PI], [-0.84, 0, Math.PI / 2], [0.84, 0.18, -Math.PI / 2],
    [-0.34, -0.34, Math.PI * 0.25], [0.42, 0.52, -Math.PI * 0.75],
  ] as const) {
    const ramp = MeshBuilder.CreateBox('ramp', { width: 10, height: 0.6, depth: 6 }, scene);
    ramp.position.set(f(fx), 1.15, f(fz));
    ramp.rotation.set(-0.42, ry, 0);
    ramp.material = rampM;
    ramp.checkCollisions = true;
    all.push(ramp); rideable.push(ramp);
  }

  // THE BOWL — an octagon of inward-tilted banks around a sunken centre
  const bowlC = new Vector3(f(-0.48), 0, f(0.42)), bowlR = 6.5;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const bank = MeshBuilder.CreateBox(`bowl_${i}`, { width: 5.4, height: 0.5, depth: 3.6 }, scene);
    bank.position.set(bowlC.x + Math.sin(a) * bowlR, 0.8, bowlC.z + Math.cos(a) * bowlR);
    bank.rotation.set(0.5, a + Math.PI, 0);
    bank.material = bankM;
    bank.checkCollisions = true;
    all.push(bank); rideable.push(bank);
  }

  // THE DOWNHILL STRAIGHT — longer in a longer park, which is the point of a longer park
  const laneLen = Math.max(30, B * 0.9);
  const lane = MeshBuilder.CreateBox('dh_lane', { width: 8, height: 0.5, depth: laneLen }, scene);
  lane.position.set(f(0.6), 1.6, f(-0.18));
  lane.rotation.set(0.14, 0, 0);
  lane.material = laneM;
  lane.checkCollisions = true;
  all.push(lane); rideable.push(lane);

  // FUNBOXES and a STAIR SET — something to ollie down rather than only things to ride up
  for (const [fx, fz] of [[0, -0.06], [-0.24, -0.36], [0.3, 0.68], [-0.6, -0.6]] as const) {
    const box = MeshBuilder.CreateBox('funbox', { width: 6, height: 1.1, depth: 4 }, scene);
    box.position.set(f(fx), 0.55, f(fz));
    box.material = boxM;
    box.checkCollisions = true;
    all.push(box); rideable.push(box);
  }
  for (let i = 0; i < 4; i++) {
    const step = MeshBuilder.CreateBox('stair', { width: 9, height: 0.34, depth: 1.1 }, scene);
    step.position.set(f(0.12), 0.17 + i * 0.34, f(-0.62) + i * 1.1);
    step.material = boxM;
    step.checkCollisions = true;
    all.push(step); rideable.push(step);
  }

  // L3 BOUNDARY — the fence reads the venue's bound, so the thing you can see and the thing that stops you agree
  const fenceM = mat(scene, `fenceM_${venue.id}`, P.edge);
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
    const span = MeshBuilder.CreateBox('wall_fence', {
      width: dx === 0 ? B * 2 : 0.25, height: 1.9, depth: dz === 0 ? B * 2 : 0.25,
    }, scene);
    span.position.set(dx * B, 0.95, dz * B);
    span.material = fenceM;
    span.isPickable = false;
    all.push(span);
  }

  const grindLines: GrindLine[] = [];
  makeRail(scene, all, grindLines, new Vector3(f(-0.18), 0.8, f(0.12)), new Vector3(f(-0.18), 0.8, f(0.36)), 180);
  makeRail(scene, all, grindLines, new Vector3(f(0.18), 0.8, f(-0.12)), new Vector3(f(0.18), 0.8, f(-0.36)), 180);
  makeRail(scene, all, grindLines, new Vector3(f(0.48), 2.9, f(-0.54)), new Vector3(f(0.48), 0.9, f(0.18)), 220);
  makeRail(scene, all, grindLines, new Vector3(f(-0.06), 0.8, f(0.6)), new Vector3(f(0.18), 0.8, f(0.72)), 260);
  makeRail(scene, all, grindLines, new Vector3(f(0.18), 0.8, f(0.72)), new Vector3(f(0.42), 0.8, f(0.6)), 300);
  // the HANDRAIL down the stair set — the one every skater looks for
  makeRail(scene, all, grindLines, new Vector3(f(0.12) + 5, 1.5, f(-0.62)), new Vector3(f(0.12) + 5, 0.5, f(-0.62) + 4.4), 340);

  // one accent object so the eye has somewhere to land — the thing a place is known by
  const totem = MeshBuilder.CreateCylinder('park_totem', { diameter: 0.9, height: 5.2, tessellation: 8 }, scene);
  totem.position.set(f(-0.78), 2.6, f(0.78));
  totem.material = accentM;
  totem.isPickable = false;
  all.push(totem);

  // Where people watch from: the ledges and the bowl rim, clear of every line the player rides, scaled to the venue
  const crowdSpots = [
    new Vector3(f(-0.72), 0, f(-0.12)), new Vector3(f(-0.72), 0, f(-0.04)), new Vector3(f(-0.67), 0, f(0.03)),
    new Vector3(f(0.36), 0, f(0.66)), new Vector3(f(0.43), 0, f(0.68)), new Vector3(f(0.48), 0, f(0.64)),
    new Vector3(f(-0.29), 0, f(0.54)), new Vector3(f(-0.22), 0, f(0.58)),
    new Vector3(f(0.78), 0, f(-0.42)), new Vector3(f(0.83), 0, f(-0.35)),
  ].slice(0, Math.max(2, venue.crowd));
  return { ground: rideable, grindLines, markers: [], obstacles: [], crowdSpots, bound: B, dispose: () => all.forEach((m) => m.dispose()) };
}

// ── SLOPE v2 — rocks, rails, kickers, the ski-lift grind, the yeti den ─────
export function buildSlopeRun(scene: Scene): RideWorld {
  const all: AbstractMesh[] = [];
  const rideable: AbstractMesh[] = [];
  const PITCH = SLOPE_PITCH;
  // The snow must cover the RUN: the last gate sits at SLALOM_START + (SLALOM_GATES − 1) × SLALOM_SPACING = 238 m down the
  // fall line and the finish beyond it, but the piste was a 220 m ground centred on the start (−110 … +110). Nobody noticed
  // while the rider was pinned at y ≈ 0 (see SnowboardSlalomMode's Rider overrides); once the rider actually rides the
  // snow, it ran off the end at ~150 m and fell to the hard floor. Centre the ground on the run instead.
  const RUN_LEN = SLALOM_START + SLALOM_GATES * SLALOM_SPACING + 60;
  const PISTE_LEN = RUN_LEN + 40;
  const piste = MeshBuilder.CreateGround('piste', { width: PISTE_HALF_WIDTH * 2, height: PISTE_LEN }, scene);
  piste.rotation.x = PITCH;
  const pisteCentre = PISTE_LEN / 2 - 20;                      // spans −20 m (behind the start) … RUN_LEN + 20 m
  piste.position.set(0, -Math.sin(PITCH) * pisteCentre, Math.cos(PITCH) * pisteCentre);
  piste.checkCollisions = true;
  piste.isPickable = true;
  piste.material = paintGround(scene, 34, PISTE_LEN, (g, W, H) => {
    // Pass 5 phase 7: near-white snow (#eef3f7) under a white sky read as a 211–221 mean-luminance whiteout in the
    // slalom frames. Cooler snow, denser darker groom lines and shadowed drifts give the run edges to read speed against.
    g.fillStyle = '#c6d5e4'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(92,126,172,0.55)';
    for (let i = 0; i < Math.round(700 * H / 220); i++) g.fillRect(Math.random() * W, Math.random() * H, 2, 16);
    g.fillStyle = 'rgba(70,100,150,0.32)';
    for (let i = 0; i < Math.round(160 * H / 220); i++) { g.beginPath(); g.ellipse(Math.random() * W, Math.random() * H, 8 + Math.random() * 20, 2 + Math.random() * 5, 0, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(120,150,175,0.25)'; g.lineWidth = 5;
    for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo((i / 14) * W, 0); g.lineTo((i / 14) * W + 30, H); g.stroke(); }
  });
  all.push(piste); rideable.push(piste);

  // ARENA-10PHASE P9 (2026-09-07): OFF-PISTE SNOWFIELDS. The groomed piste is 34 m wide and the tree lines stand at
  // x ±19…±24 — past its edge, over nothing: the kit pines and the rocks hung in the air with the void under them (and
  // the void fell away with the pitch, so the further down the run the higher they floated). Two ungroomed fields, the
  // same pitch, 70 m each side: darker, rougher snow with rock speckle, pickable so the prop set can drop onto them,
  // not rideable — the rider still clamps to the groomed width.
  const offM = paintGround(scene, 70, PISTE_LEN, (g, W, H) => {
    g.fillStyle = '#b3c4d6'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(70,100,150,0.35)';
    for (let i = 0; i < Math.round(420 * H / 220); i++) { g.beginPath(); g.ellipse(Math.random() * W, Math.random() * H, 10 + Math.random() * 30, 3 + Math.random() * 7, Math.random() * 3, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(60,66,74,0.5)';
    for (let i = 0; i < Math.round(140 * H / 220); i++) g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 5, 2 + Math.random() * 3);
  });
  for (const side of [-1, 1]) {
    const field = MeshBuilder.CreateGround(`offpiste_${side < 0 ? 'l' : 'r'}`, { width: 70, height: PISTE_LEN }, scene);
    field.rotation.x = PITCH;
    field.position.set(side * (PISTE_HALF_WIDTH + 35), -Math.sin(PITCH) * pisteCentre - 0.02, Math.cos(PITCH) * pisteCentre);
    field.isPickable = true;
    field.material = offM;
    all.push(field);
  }

  const onPiste = (x: number, dist: number): Vector3 =>
    new Vector3(x, -Math.sin(PITCH) * dist, Math.cos(PITCH) * dist);

  const markers: Vector3[] = [];
  const gateMatL = mat(scene, 'gateL', '#e23c50'), gateMatR = mat(scene, 'gateR', '#2c6fe2');
  // A slalom is a RHYTHM: left, right, left, at a spacing you can carve. This
  // was sin(i * 1.7) * 9, which is neither -- stepping a sine by 1.7 radians
  // aliases into a near-random sequence (0, +8.9, -2.3, -8.4, +4.4, +7.3 ...),
  // so consecutive gates could sit 12.8m apart across only 15m of slope.
  //
  // Sized against measurements rather than taste. A rider descends at ~12 m/s
  // once the tuck is feeding the momentum model, and can hold about 5.5 m/s
  // across the fall line in a committed carve. At 20m spacing that is ~1.7s of
  // travel and ~9m of reachable lateral movement per gate, so the offsets ramp
  // 3.2m -> 5.0m a side (6.4m -> 10m gate to gate): comfortable at the top of
  // the course, genuinely demanding at the bottom. Gate 0 sits dead ahead so
  // the run starts fair rather than with an immediate cut across the hill.
  const gateLeftM: Matrix[] = [], gateRightM: Matrix[] = [];
  for (let i = 0; i < SLALOM_GATES; i++) {
    const dist = slalomGateDist(i);
    const cx = slalomGateX(i);
    markers.push(onPiste(cx, dist));
    for (const side of [-1, 1]) {
      // one MATRIX per pole, not one mesh — batched below
      (side < 0 ? gateLeftM : gateRightM).push(
        Matrix.Translation(...(() => { const q = onPiste(cx + side * 1.7, dist).add(new Vector3(0, 0.8, 0)); return [q.x, q.y, q.z] as [number, number, number]; })()),
      );
    }
  }
  // THIN INSTANCES for the slalom poles. 24 poles were 24 draw calls and the mode flags its own budget at
  // `draws 786 > 600`; they are the same cylinder in two colours, which is exactly what thin instances are for. Two
  // masters (one per gate colour) carry the lot, so 24 draws become 2.
  const gatePole = (name: string, m: Material, mats: Matrix[]): AbstractMesh | null => {
    if (!mats.length) return null;
    const master = MeshBuilder.CreateCylinder(name, { diameter: 0.12, height: 1.6 }, scene);
    master.material = m;
    const buf = new Float32Array(mats.length * 16);
    mats.forEach((mm, i) => mm.copyToArray(buf, i * 16));
    master.thinInstanceSetBuffer('matrix', buf, 16, true);
    return master;
  };
  { const l = gatePole('gate', gateMatL, gateLeftM); if (l) all.push(l); }
  { const r = gatePole('gate', gateMatR, gateRightM); if (r) all.push(r); }

  // trees (scenery, off-piste) — unchanged from M39
  const trunkM = mat(scene, 'trunk', '#5a3d26'), leafM = mat(scene, 'leaf', '#1d4d2b');
  // 22 trees were 44 draw calls (a trunk and a leaf each) and every one is the same pair of cylinders. Batched to two
  // masters: 44 draws become 2. Together with the poles this is 68 of the mode's ~786.
  const trunkMats: Matrix[] = [], leafMats: Matrix[] = [];
  for (let i = 0; i < 22; i++) {
    const dist = 10 + i * 9.5;
    const x = (i % 2 ? 1 : -1) * (15 + (i * 7) % 4);
    const p = onPiste(x, dist);
    const t = p.add(new Vector3(0, 0.7, 0)), l = p.add(new Vector3(0, 3, 0));
    trunkMats.push(Matrix.Translation(t.x, t.y, t.z));
    leafMats.push(Matrix.Translation(l.x, l.y, l.z));
  }
  const batch = (name: string, opts: Parameters<typeof MeshBuilder.CreateCylinder>[1], m: Material, mats: Matrix[]): AbstractMesh | null => {
    if (!mats.length) return null;
    const master = MeshBuilder.CreateCylinder(name, opts, scene);
    master.material = m;
    const buf = new Float32Array(mats.length * 16);
    mats.forEach((mm, i) => mm.copyToArray(buf, i * 16));
    master.thinInstanceSetBuffer('matrix', buf, 16, true);
    return master;
  };
  { const t = batch('trunk', { diameter: 0.3, height: 1.4 }, trunkM, trunkMats); if (t) all.push(t); }
  { const l = batch('leaf', { diameterTop: 0, diameterBottom: 1.9, height: 3.2 }, leafM, leafMats); if (l) all.push(l); }

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

  // Spectators beside the piste, well outside the gate corridor (gates run to
  // +-5m; these stand at +-13m) so they never read as an obstacle on the line.
  // Clustered at three points down the course, because a slope's spectators
  // gather at the interesting corners rather than lining the whole run.
  const crowdSpots: Vector3[] = [];
  for (const [side, dist] of [[-1, 55], [-1, 58], [1, 60], [1, 120], [-1, 124], [1, 127], [-1, 190], [1, 193]] as const) {
    crowdSpots.push(onPiste(side * 13 + side * Math.random() * 1.5, dist));
  }
  return { ground: rideable, grindLines, markers, obstacles, crowdSpots, bound: PISTE_HALF_WIDTH, dispose: () => all.forEach((m) => m.dispose()) };
}

// ── SURF v3 — the curling funnel wave + buoys ──────────────────────────────
/** Half-width of the surfable water. The rider clamps here and the water ends
 *  here, so the edge the player feels is the edge they can see. */
export const SURF_HALF_WIDTH = 45;

// ── The slalom course, as data ──────────────────────────────────────────────
// These were literals inside buildSlopeRun, and scripts/slalom-drive.mts had to
// MIRROR the formula to steer at the gates -- its own header warns that the two
// would drift. One definition instead: the world builds from it, the driver
// aims with it, and the tests check it.
/** Half-width of the piste. The rider clamps here and the snow ends here. */
export const PISTE_HALF_WIDTH = 17;
export const SLALOM_GATES = 12;
/** Metres down the fall line between gates. */
export const SLALOM_SPACING = 20;
/** Distance to the first gate. */
export const SLALOM_START = 18;
/** Slope pitch, radians. */
export const SLOPE_PITCH = 0.22;
/**
 * Lateral offset of gate `i`, in metres.
 *
 * Alternating, opening up as the course goes on, and gate 0 dead ahead so the
 * run starts fair. Sized against measured numbers rather than taste: a rider
 * descends at ~12 m/s once the tuck feeds the momentum model and holds about
 * 5.5 m/s across the fall line in a committed carve, so 20m of spacing is ~1.7s
 * and ~9.2m of reachable lateral movement per gate.
 *
 * The ramp was 3.2 -> 5.0m a side when it was set by eye, which asks 9.8m of
 * the last three gates -- past what a rider can cover, i.e. the same
 * unreachable-tail defect the rebuild was meant to remove, reintroduced at a
 * smaller scale. snowboard-run-tests C1 checks every gate against the measured
 * figure and caught it. 3.1 -> 4.1 keeps the hardest gate at ~8.2m, about 90%
 * of what is available, so the course is demanding at the bottom without
 * asking for more than the rider has -- and boost, which shortens the window
 * by making the descent faster, still fits inside the remainder.
 */
export function slalomGateX(i: number): number {
  return i === 0 ? 0 : (i % 2 === 0 ? -1 : 1) * (3.1 + (i / 11) * 1.0);
}
/** Distance down the fall line to gate `i`. */
export function slalomGateDist(i: number): number {
  return SLALOM_START + i * SLALOM_SPACING;
}

// ── SURF BREAK v6 — a wave you are ON (ARENA-10PHASE P3 / SURF-WAVES-BOUNDS, 2026-09-07) ─────────────────────────────
// v5 was a 3.4 m cylinder lying on a flat 90 × 220 m plate with a 200 × 60 m teal sky PLANE at z −95: no face, no swell,
// nothing to rise and fall on, and the plate ended 20 m past the lap (playtest d3d4a93: "empty purple→orange gradient, no
// wave/rider" — the rider had left the plate and the camera was 70 m up looking at the dome). The wave is a RIBBON now:
// a swell back that rises over 7 m, a crest that peels along its length (sections stand up and back off), and a concave
// face that falls away over WAVE_FACE_LEN m to the water. The ribbon is a ground mesh — the rider's raycast rides it, so
// the body climbs as the wave arrives under it and drops as it drifts ahead — and the water is 180 × 380 m with the shore
// past the lap's furthest reach, so there is nothing to ride off.

/** The wave travels toward the shore (+z) at this speed; the lap wrap and the rider's wave-relative drift both use it. */
export const WAVE_SPEED = 4.5;
/** The lip runs −50 → +90 and wraps (the rider wraps with it, see SurfBreakMode). */
export const WAVE_LAP = 140;
/** Metres of face ahead of the crest before it flattens into the water (the scored POCKET lives inside it). */
export const WAVE_FACE_LEN = 9;
/** Crest height at a standing section's peak (m). */
export const WAVE_HEIGHT = 2.6;

/** Face height (m above flat water) `u` metres ahead of the crest for a section whose crest stands `h` high: the swell
 *  back rises over 7 m (smoothstep), the face falls away CONCAVE — steep under the lip, flat at the bottom. */
export function waveProfile(u: number, h: number): number {
  if (u <= -7) return 0;
  if (u < 0) { const t = (u + 7) / 7; return h * t * t * (3 - 2 * t); }
  if (u >= WAVE_FACE_LEN) return 0;
  const t = 1 - u / WAVE_FACE_LEN;
  return h * t * t;
}
/** Crest height along the wave: the section PEELS — one shoulder stands up while another backs off — plus a little chop. */
export function crestHeightAt(x: number, tSec: number): number {
  return WAVE_HEIGHT * (0.72 + 0.28 * Math.sin(x * 0.085 + tSec * 0.7)) + 0.12 * Math.sin(x * 0.6 - tSec * 2.1);
}

/**
 * @param pocket The scored pocket band, in metres ahead of the lip. The VENUE
 *   draws exactly the band the MODE scores -- passing it in rather than
 *   duplicating the numbers here is what stops the drawn pocket and the scored
 *   pocket drifting apart, the same reason the patrol rail's mesh is asserted
 *   to sit on its grind line. (v6: the band is a lighter run of the face's own
 *   vertex colours between pocket.min and pocket.max.)
 */
export function buildSurfBreak(scene: Scene, pocket: { min: number; max: number }): {
  world: RideWorld;
  waveLipAt(tSec: number): Vector3;
  barrelActive(tSec: number): boolean;
  /** Face height at world (x, z) for the wave at `tSec` — the mode pitches the board with it. */
  faceHeightAt(x: number, z: number, tSec: number): number;
} {
  const all: AbstractMesh[] = [];
  // THE WATER — wide and long enough that no lap, no drift and no clamp ever shows an edge (was 90 × 220: the rider ran off
  // the end 11 s into an unattended run)
  const WATER_W = 180, WATER_L = 380;
  const water = MeshBuilder.CreateGround('water', { width: WATER_W, height: WATER_L }, scene);
  water.checkCollisions = true;
  water.isPickable = true;
  water.material = paintGround(scene, WATER_W, WATER_L, (g, W, H) => {
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0f5f8f'); grad.addColorStop(0.5, '#1a7fae'); grad.addColorStop(1, '#2492bf');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 3;
    for (let i = 0; i < 60; i++) {
      g.beginPath(); g.moveTo(Math.random() * W, Math.random() * H);
      g.bezierCurveTo(Math.random() * W, Math.random() * H, Math.random() * W, Math.random() * H, Math.random() * W, Math.random() * H);
      g.stroke();
    }
    // swell lines toward the horizon
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 6;
    for (let i = 0; i < 14; i++) { const y = (i / 14) * H * 0.45; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= W; x += 24) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 5); g.stroke(); }
  });
  all.push(water);

  // THE WAVE — one transform the whole set rides on; waveLipAt() moves it down the lap
  const waveRoot = new TransformNode('waveRoot', scene);
  const XS: number[] = []; for (let x = -(SURF_HALF_WIDTH + 12); x <= SURF_HALF_WIDTH + 12; x += 3) XS.push(x);
  // rows run from the flat water AHEAD of the face back over the crest to the swell back: that winding puts the ribbon's
  // normals on the RIDER's side (reversed, the face lit from behind rendered near-black under the sun, measured 2026-09-08)
  const US = [12, WAVE_FACE_LEN, 7.2, 5.5, 3.8, 2.4, 1.3, 0.5, 0, -0.8, -1.8, -3.2, -5, -7];
  const pathsFor = (rows: number[], tSec: number, lift = 0): Vector3[][] =>
    rows.map((u) => XS.map((x) => new Vector3(x, waveProfile(u, crestHeightAt(x, tSec)) + lift, u)));
  // FLAT ALBEDO PER STRIP. Both vertex colours and a DynamicTexture rendered this ribbon plain white under the PBR shader
  // (measured 2026-09-08, four variants — a flat albedoColor on the same mesh rendered blue), so the wave's colour is a set
  // of ribbons: the face in deep water blue, a foam strip along the crest, whitewater down the back, and the scored
  // POCKET as a pale translucent band riding the face — the band the mode scores, drawn on the wave itself.
  const strips: { mesh: Mesh; rows: number[]; lift: number }[] = [];
  const strip = (name: string, rows: number[], hex: string, alpha: number, lift: number, rough = 0.8): Mesh => {
    const m = MeshBuilder.CreateRibbon(name, { pathArray: pathsFor(rows, 0, lift), updatable: true }, scene);
    m.parent = waveRoot;
    const pm = new PBRMaterial(`${name}M`, scene);
    pm.albedoColor = Color3.FromHexString(hex);
    pm.emissiveColor = Color3.FromHexString(hex).scale(0.16);   // the swell back faces away from the sun: deep colour, not black
    pm.metallic = 0; pm.roughness = rough; pm.environmentIntensity = 0.5; pm.directIntensity = 0.5;
    pm.backFaceCulling = false; pm.twoSidedLighting = true;
    if (alpha < 1) pm.alpha = alpha;
    m.material = pm;
    m.isPickable = false;
    strips.push({ mesh: m, rows, lift });
    all.push(m);
    return m;
  };
  const face = strip('waveFace', US, '#1a7fb0', 1, 0);
  face.isPickable = true;
  face.checkCollisions = true;
  strip('waveFoam', [0.9, 0.4, 0, -0.4, -0.9], '#eef8fc', 1, 0.05, 0.9);
  strip('waveWhitewater', [-0.9, -1.6, -2.4, -3.4], '#a9d8e8', 0.8, 0.03, 0.9);
  strip('wavePocket', [pocket.max, (pocket.min + pocket.max) / 2, pocket.min], '#8fdcf2', 0.35, 0.03, 0.9);
  // the lip line — a foam roll along the crest; the barrel hood hangs off it (as before) so the two breathe together
  const lip = MeshBuilder.CreateCylinder('waveLip', { diameter: 0.7, height: (SURF_HALF_WIDTH + 12) * 2, tessellation: 10 }, scene);
  lip.rotation.z = Math.PI / 2;
  lip.parent = waveRoot;
  lip.position.set(0, WAVE_HEIGHT * 0.78, 0.2);
  const lipM = mat(scene, 'lipM', '#f2fbff'); lipM.alpha = 0.8; lipM.twoSidedLighting = true;
  lip.material = lipM;
  lip.isPickable = false;
  all.push(lip);

  // THE FUNNEL — a partial-arc shell curling over the pocket ahead of the
  // lip. Parented to the lip so it travels with the wave; the barrel cycle
  // fades it in (open tube you can ride inside) and out (wave backs off).
  // v6: the hood is sized to the wave (was diameter 8.4 on a 0.9 m lip — with the camera 6.8 m behind the rider its shell
  // crossed the lens as a pale band, measured 2026-09-08): radius 1.7 off the crest, curling forward over the pocket
  const tube = MeshBuilder.CreateCylinder('waveTube', {
    diameter: 3.4, height: (SURF_HALF_WIDTH + 12) * 2 - 4, tessellation: 24, arc: 0.45, enclose: false,
    sideOrientation: Mesh.DOUBLESIDE,
  }, scene);
  tube.parent = lip;
  // lip's local axis is Y (world X after the lip's own rotation) — the tube
  // shares it; roll the open arc so it faces the shore (+z world) and hoods
  // over the pocket
  tube.position.set(0, 0, 0);
  tube.rotation.set(0, Math.PI * 0.62, 0);
  const tubeM = mat(scene, 'tubeM', '#a8dff0');   // spray-pale: the darker blue read as a black bar along the crest
  tubeM.alpha = 0.35;
  tubeM.backFaceCulling = false;
  tubeM.twoSidedLighting = true;   // the hood is seen from inside AND out
  tube.material = tubeM;
  tube.isPickable = false;
  all.push(tube);

  // distant swell lines purely for depth/scale cues
  for (const [z, d] of [[-72, 1.4], [-112, 1.0], [-150, 0.8]] as const) {
    const farSwell = MeshBuilder.CreateCylinder(`farSwell_${z}`, { diameter: d, height: WATER_W, tessellation: 8 }, scene);
    farSwell.rotation.z = Math.PI / 2;
    farSwell.position.set(0, d * 0.3, z);
    const farM = mat(scene, `farSwellM_${z}`, '#e8f6ff'); farM.alpha = 0.45;
    farSwell.material = farM; farSwell.isPickable = false;
    all.push(farSwell);
  }

  // THE SHORE — past the lap's furthest reach (lip 90 + face 9 + the flat clamp), so the wave runs AT the beach and never aground
  const shore = MeshBuilder.CreateGround('shore', { width: WATER_W, height: 30 }, scene);
  shore.position.set(0, 0.03, 138);
  shore.material = mat(scene, 'sand', '#d9c28f');
  all.push(shore);

  // BUOYS — fixed obstacles in the lineup; hitting one is a wipeout
  const obstacles: RideObstacle[] = [];
  const buoyM = mat(scene, 'buoyM', '#ff5a3c');
  for (const [x, z] of [[-14, -8], [18, 12], [-22, 38], [9, 62]] as const) {
    const buoy = MeshBuilder.CreateSphere(`buoy_${x}_${z}`, { diameter: 1.1 }, scene);
    buoy.position.set(x, 0.5, z);
    buoy.material = buoyM;
    buoy.isPickable = false;
    all.push(buoy);
    obstacles.push({ pos: buoy.position, radius: 0.9 });
  }

  // Beachgoers on the sand, watching the break — on the horizon for most of a ride, close at the end of a lap.
  const crowdSpots: Vector3[] = [];
  for (const [x, z] of [[-14, 126], [-11.5, 127.4], [-9, 126.2], [4, 127], [6.5, 128.2],
                        [9, 126.6], [11.5, 127.8], [22, 128], [-24, 127.2]] as const) {
    crowdSpots.push(new Vector3(x, 0.03, z));
  }

  const world: RideWorld = {
    ground: [face, water], grindLines: [], markers: [], obstacles, crowdSpots, bound: 70,
    dispose: () => { all.forEach((m) => m.dispose()); waveRoot.dispose(); },
  };
  const BARREL_ON = 8, BARREL_CYCLE = 18;
  const barrelActive = (tSec: number): boolean => (tSec % BARREL_CYCLE) < BARREL_ON;
  const lipWorld = new Vector3(0, WAVE_HEIGHT * 0.78, -50);
  let lastRebuild = -1;
  const waveLipAt = (tSec: number): Vector3 => {
    const z = -50 + ((tSec * WAVE_SPEED) % WAVE_LAP);
    waveRoot.position.z = z;
    // the set peels: rebuild the ribbon's heights (546 points) — every frame is cheap, and the crest visibly travels
    if (tSec !== lastRebuild) {
      lastRebuild = tSec;
      for (const st of strips) MeshBuilder.CreateRibbon(st.mesh.name, { pathArray: pathsFor(st.rows, tSec, st.lift), instance: st.mesh });
      face.refreshBoundingInfo();
    }
    lip.position.y = WAVE_HEIGHT * 0.78 + Math.sin(tSec * 2.2) * 0.08;
    // the funnel breathes with the barrel cycle
    const active = barrelActive(tSec);
    tubeM.alpha += ((active ? 0.35 : 0.05) - tubeM.alpha) * 0.06;
    lipWorld.set(0, lip.position.y, z);
    return lipWorld;
  };
  const faceHeightAt = (x: number, z: number, tSec: number): number => waveProfile(z - waveRoot.position.z, crestHeightAt(x, tSec));
  return { world, waveLipAt, barrelActive, faceHeightAt };
}
