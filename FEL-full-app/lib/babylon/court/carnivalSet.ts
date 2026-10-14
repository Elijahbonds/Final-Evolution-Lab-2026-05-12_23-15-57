// THE CARNIVAL SET (vis-hoops-court, 2026-10-14) — Part B carnival: "string lights over the court (thin-instanced bulbs plus a glow),
// tents, a ferris wheel and carousel silhouette on the horizon, party-goer props (balloons as cheap meshes)".
//
// The Carnival Court was a tiled plaza, a yellow podium and two people in front of a photograph. This is the fair around it, built
// round the hub the mode frames: the camera stands at about z −8 looking +z at the party-goers (z 2..5) and the podium (z 9), the
// hoop and banners are BEHIND it, so the set goes in FRONT of the lens, on the far side of the plaza and beyond:
//
//   STRING LIGHTS   two strands down the plaza's sides and one across behind the podium, hung on poles with a catenary's sag. Each
//                   strand is ONE mesh of bulbs (merged, local to its middle) named `bb_bulb_carn_*` on a `lantern_carn_*` material:
//                   the glow layer draws a halo on every bulb and FixtureLights puts one clustered light at each strand (desktop/high).
//   BOOTHS          four game booths along the back, each a painted body, a striped awning and a sign.
//   BIG TOPS        two striped tents at the edges.
//   THE CAROUSEL    a canopy on poles, a bulb ring round its rim, turning slowly, out past the booths.
//   THE WHEEL       a ferris wheel on the horizon, lit rim (`bb_wheel_marquee_carn`: the glow's own name for a lit wheel), turning once a
//                   minute: 60 m out, over the photograph's pier.
//   BALLOONS        three bunches by the podium and the booths: one thin-instanced draw, bobbing.
//
// Everything stands outside the party-goers' spots and inside the dome (280 m), is `isPickable = false`, and is switched off with the
// hub (an event paints its own floor — the dojo is a room, and a fair outside its walls would be a sky of lanterns). The wheel, the carousel and the balloons turn or bob every frame, so their names carry `court` (the rig's receiver-only
// hint: they take shadows and never throw one — a moving caster is redrawn into the map each frame); the poles, booths and tents are
// still casters (a pole's shadow is the point), drawn once into the static cache. Phones: no wheel's rim glow (the glow is
// desktop-only), half the bulbs, no balloons' strings; textures are small (the budget on a phone is almost spent here).

import { Color3, Matrix, Mesh, MeshBuilder, PBRMaterial, StandardMaterial, TransformNode, Vector3, VertexData } from '@babylonjs/core';
import type { AbstractMesh, Observer, Scene } from '@babylonjs/core';
import { makeTexture } from './texture';
import { unlitDiffuse } from '../visual/unlit';

export interface P3 { x: number; y: number; z: number }

/** Pure: `n + 1` points along a hanging cord from a to b that sags `sag` metres at the middle (a parabola: close enough to a catenary). */
export function sagPoints(a: P3, b: P3, sag: number, n: number): P3[] {
  const out: P3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - 4 * sag * t * (1 - t), z: a.z + (b.z - a.z) * t });
  }
  return out;
}

export interface StrandPlan { id: number; hue: string; from: P3; to: P3; sag: number; bulbs: number }
export interface BoothPlan { x: number; z: number; yaw: number; body: string; awning: 0 | 1; sign: string }
export interface CarnivalPlan {
  poles: P3[];
  strands: StrandPlan[];
  booths: BoothPlan[];
  tents: { x: number; z: number; r: number; h: number }[];
  carousel: { x: number; z: number };
  wheel: { x: number; z: number; r: number; y: number };
  balloons: { x: number; z: number; n: number }[];
}

export const POLE_H = 4.6;
export const WHEEL_TURN_S = 70;
export const CAROUSEL_TURN_S = 26;

/** Pure: where the fair stands. The plaza's party-goers are at (−1.5, 5) and (1.5, 2) and the podium at (0, 9): nothing stands within 3 m of them. */
export function carnivalPlan(tier: string): CarnivalPlan {
  const phone = tier === 'mobile';
  const X = 9.5;   // the plaza's sides
  const poles: P3[] = [
    { x: -X, y: 0, z: -3 }, { x: -X, y: 0, z: 8 }, { x: -X, y: 0, z: 19 },
    { x: X, y: 0, z: -3 }, { x: X, y: 0, z: 8 }, { x: X, y: 0, z: 19 },
  ];
  const top = (p: P3): P3 => ({ x: p.x, y: POLE_H, z: p.z });
  const bulbs = phone ? 9 : 16;
  const strands: StrandPlan[] = [
    { id: 0, hue: '#ffe2a8', from: top(poles[0]), to: top(poles[1]), sag: 0.7, bulbs },
    { id: 1, hue: '#ff6fd8', from: top(poles[1]), to: top(poles[2]), sag: 0.7, bulbs },
    { id: 2, hue: '#ffe2a8', from: top(poles[3]), to: top(poles[4]), sag: 0.7, bulbs },
    { id: 3, hue: '#6fd8ff', from: top(poles[4]), to: top(poles[5]), sag: 0.7, bulbs },
    { id: 4, hue: '#ffd166', from: top(poles[2]), to: top(poles[5]), sag: 1.1, bulbs: bulbs + 6 },   // across behind the podium
  ];
  const booths: BoothPlan[] = [
    { x: -12, z: 24, yaw: Math.PI, body: '#d1495b', awning: 0, sign: 'RING TOSS' },
    { x: -5.5, z: 25, yaw: Math.PI, body: '#00798c', awning: 1, sign: 'HOOP SHOT' },
    { x: 5.5, z: 25, yaw: Math.PI, body: '#edae49', awning: 0, sign: 'FRIES' },
    { x: 12, z: 24, yaw: Math.PI, body: '#6a4c93', awning: 1, sign: 'PRIZES' },
  ];
  return {
    poles, strands,
    booths: phone ? booths.slice(0, 3) : booths,
    tents: [{ x: -19, z: 14, r: 4.2, h: 3.4 }, { x: 19, z: 17, r: 4.6, h: 3.6 }],
    carousel: { x: 26, z: 40 },
    wheel: { x: -34, z: 74, r: 13, y: 15.5 },
    balloons: phone ? [] : [{ x: -4.2, z: 10.5, n: 8 }, { x: 4.4, z: 10.5, n: 7 }, { x: 0, z: 21, n: 9 }],
  };
}

/** Pure: does a point stand clear of the party-goers' spots and the podium? */
export function clearOfHub(p: { x: number; z: number }, margin = 3): boolean {
  const spots = [{ x: -1.5, z: 5 }, { x: 1.5, z: 2 }, { x: 0, z: 9 }];
  return spots.every((s) => Math.hypot(p.x - s.x, p.z - s.z) > margin);
}

/** The striped awning / tent cloth: bands alternate two colours. */
export function paintStripes(g: CanvasRenderingContext2D, W: number, H: number, a: string, b: string, bands = 8): void {
  const w = W / bands;
  for (let i = 0; i < bands; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(i * w, 0, w + 1, H); }
}

/** A booth's sign: a dark board, a lit-up word. */
export function paintSign(g: CanvasRenderingContext2D, W: number, H: number, text: string, hue: string): void {
  g.fillStyle = '#17131f'; g.fillRect(0, 0, W, H);
  g.strokeStyle = hue; g.lineWidth = 8; g.strokeRect(10, 10, W - 20, H - 20);
  g.fillStyle = hue; g.font = '900 54px system-ui, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, W / 2, H / 2 + 3, W - 50);
}

export interface CarnivalSetHandle {
  readonly root: TransformNode;
  readonly meshes: readonly AbstractMesh[];
  /** Show or hide the whole fair (the hub's shown, an event's floor is up). */
  setEnabled(on: boolean): void;
  dispose(): void;
}

/** A merged mesh of small spheres at `pts`, local to their middle (so the mesh's own position is where its light sits). */
function bulbMesh(scene: Scene, name: string, pts: P3[], d: number, seg: number): { mesh: Mesh; centre: Vector3 } | null {
  if (!pts.length) return null;
  const c = new Vector3(0, 0, 0);
  for (const p of pts) { c.x += p.x; c.y += p.y; c.z += p.z; }
  c.scaleInPlace(1 / pts.length);
  const parts = pts.map((p, i) => { const s = MeshBuilder.CreateSphere(`${name}_p${i}`, { diameter: d, segments: seg }, scene); s.position.set(p.x - c.x, p.y - c.y, p.z - c.z); return s; });
  const mesh = Mesh.MergeMeshes(parts, true, true, undefined, false, false);
  if (!mesh) return null;
  mesh.name = name; mesh.position.copyFrom(c);
  return { mesh, centre: c };
}

export function mountCarnivalSet(scene: Scene, o: { tier: string; /** reduced motion: the wheel, the carousel and the balloons hold still */ calm?: () => boolean }): CarnivalSetHandle {
  const plan = carnivalPlan(o.tier);
  const phone = o.tier === 'mobile';
  const root = new TransformNode('carn_set', scene);
  const made: AbstractMesh[] = [], mats: { dispose(): void }[] = [], texs: { dispose(): void }[] = [];
  const obs: Observer<Scene>[] = [];
  const dress = (m: AbstractMesh, parent: TransformNode | null = root): AbstractMesh => { m.isPickable = false; if (parent) m.parent = parent; made.push(m); return m; };
  const pbr = (name: string, hex: string, metallic = 0, rough = 0.8): PBRMaterial => { const m = new PBRMaterial(name, scene); m.albedoColor = Color3.FromHexString(hex); m.metallic = metallic; m.roughness = rough; mats.push(m); return m; };
  const glow = (name: string, hex: string, gain = 1.4): StandardMaterial => {
    const m = new StandardMaterial(name, scene); m.emissiveColor = Color3.FromHexString(hex).scale(gain); m.diffuseColor = unlitDiffuse(); m.specularColor = Color3.Black(); m.disableLighting = true; mats.push(m); return m;
  };

  // ── poles and wire ───────────────────────────────────────────────────────────────────────────────
  const poleParts = plan.poles.map((p, i) => { const m = MeshBuilder.CreateCylinder(`carn_pole_p${i}`, { height: POLE_H + 0.3, diameterTop: 0.1, diameterBottom: 0.17, tessellation: 8 }, scene); m.position.set(p.x, (POLE_H + 0.3) / 2, p.z); return m; });
  const poles = Mesh.MergeMeshes(poleParts, true, true, undefined, false, false);
  if (poles) { poles.name = 'carn_poles'; poles.material = pbr('carn_pole_m', '#4a3b2e', 0, 0.9); dress(poles); }
  const wireParts: Mesh[] = [];
  for (const s of plan.strands) {
    const path = sagPoints(s.from, s.to, s.sag, 12).map((p) => new Vector3(p.x, p.y, p.z));
    wireParts.push(MeshBuilder.CreateTube(`carn_wire_p${s.id}`, { path, radius: 0.012, tessellation: 4 }, scene));
  }
  const wire = Mesh.MergeMeshes(wireParts, true, true, undefined, false, false);
  if (wire) { wire.name = 'carn_wire'; wire.material = pbr('carn_wire_m', '#15131a', 0, 0.9); dress(wire); }

  // ── the bulbs, a mesh a strand ───────────────────────────────────────────────────────────────────
  for (const s of plan.strands) {
    const pts = sagPoints(s.from, s.to, s.sag, s.bulbs).map((p) => ({ x: p.x, y: p.y - 0.1, z: p.z }));
    const b = bulbMesh(scene, `bb_bulb_carn_${s.id}`, pts, 0.2, phone ? 4 : 6);
    if (!b) continue;
    b.mesh.material = glow(`lantern_carn_${s.id}`, s.hue); dress(b.mesh);
  }

  // ── booths: a body, a striped awning, a sign ─────────────────────────────────────────────────────
  const awnings = [0, 1].map((k) => {
    const t = makeTexture(scene, `carn_awning_tex_${k}`, 64, 32, (g) => paintStripes(g, 64, 32, k ? '#1b9aaa' : '#ef476f', '#fff4e0'), true);
    const m = new StandardMaterial(`carn_awning_m_${k}`, scene); m.specularColor = Color3.Black(); m.diffuseColor = Color3.White(); m.backFaceCulling = false;
    if (t) { m.diffuseTexture = t; texs.push(t); } else m.diffuseColor = Color3.FromHexString(k ? '#1b9aaa' : '#ef476f');
    mats.push(m); return m;
  });
  for (const [i, b] of plan.booths.entries()) {
    const node = new TransformNode(`carn_booth_${i}`, scene); node.parent = root; node.position.set(b.x, 0, b.z); node.rotation.y = b.yaw;
    const body = MeshBuilder.CreateBox(`carn_booth_body_${i}`, { width: 3.4, height: 2.1, depth: 1.8 }, scene); body.position.set(0, 1.05, 0); body.material = pbr(`carn_booth_m_${i}`, b.body, 0, 0.8); dress(body, node);
    // the counter and the awning open toward −z in the booth's own frame (the plaza side: yaw π turns them to face the camera at z −8)
    const awning = MeshBuilder.CreateBox(`carn_awning_${i}`, { width: 3.9, height: 0.07, depth: 1.9 }, scene);
    awning.position.set(0, 2.55, -1.15); awning.rotation.x = 0.32; awning.material = awnings[b.awning]; dress(awning, node);
    const sign = MeshBuilder.CreatePlane(`carn_sign_${i}`, { width: 2.6, height: 0.78 }, scene);
    sign.position.set(0, 3.35, -0.95); sign.rotation.y = Math.PI;
    const st = makeTexture(scene, `carn_sign_tex_${i}`, 256, 80, (g) => paintSign(g, 256, 80, b.sign, ['#ffd166', '#06d6a0', '#ff6fd8', '#6fd8ff'][i % 4]), true);
    const sm = new StandardMaterial(`carn_sign_m_${i}`, scene); sm.disableLighting = true; sm.specularColor = Color3.Black(); sm.diffuseColor = unlitDiffuse(); sm.backFaceCulling = false;
    if (st) { sm.emissiveTexture = st; sm.emissiveColor = Color3.Black(); texs.push(st); } else sm.emissiveColor = new Color3(0.9, 0.8, 0.4);
    sign.material = sm; mats.push(sm); dress(sign, node);
  }

  // ── big tops ─────────────────────────────────────────────────────────────────────────────────────
  const tentTex = makeTexture(scene, 'carn_tent_tex', 64, 32, (g) => paintStripes(g, 64, 32, '#ffd166', '#d1495b', 12), true);
  const tentMat = new StandardMaterial('carn_tent_m', scene); tentMat.specularColor = Color3.Black(); tentMat.diffuseColor = Color3.White(); tentMat.backFaceCulling = false;
  if (tentTex) { tentMat.diffuseTexture = tentTex; texs.push(tentTex); } else tentMat.diffuseColor = Color3.FromHexString('#e0a050');
  mats.push(tentMat);
  for (const [i, t] of plan.tents.entries()) {
    const wall = MeshBuilder.CreateCylinder(`carn_tent_wall_${i}`, { height: 2.2, diameter: t.r * 2, tessellation: 16 }, scene); wall.position.set(t.x, 1.1, t.z); wall.material = tentMat; dress(wall);
    const roof = MeshBuilder.CreateCylinder(`carn_tent_roof_${i}`, { height: t.h, diameterTop: 0.2, diameterBottom: t.r * 2.3, tessellation: 16 }, scene); roof.position.set(t.x, 2.2 + t.h / 2, t.z); roof.material = tentMat; dress(roof);
  }

  // ── the carousel ─────────────────────────────────────────────────────────────────────────────────
  const car = new TransformNode('carn_carousel', scene); car.parent = root; car.position.set(plan.carousel.x, 0, plan.carousel.z);
  const base = MeshBuilder.CreateCylinder('carn_court_carousel_base', { height: 0.5, diameter: 11, tessellation: 24 }, scene); base.position.y = 0.25; base.material = pbr('carn_carousel_base_m', '#7a5c8a', 0, 0.7); dress(base, car);
  const canopy = MeshBuilder.CreateCylinder('carn_court_carousel_roof', { height: 2.8, diameterTop: 0.5, diameterBottom: 11.6, tessellation: 24 }, scene); canopy.position.y = 5.5; canopy.material = tentMat; dress(canopy, car);
  const mastParts = Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; const m = MeshBuilder.CreateCylinder(`carn_carousel_pole_p${i}`, { height: 3.9, diameter: 0.14, tessellation: 6 }, scene); m.position.set(Math.cos(a) * 4.4, 2.45, Math.sin(a) * 4.4); return m; });
  const masts = Mesh.MergeMeshes(mastParts, true, true, undefined, false, false);
  if (masts) { masts.name = 'carn_court_carousel_poles'; masts.material = pbr('carn_carousel_pole_m', '#e8d9b0', 0.4, 0.4); dress(masts, car); }
  const ringPts = Array.from({ length: phone ? 12 : 20 }, (_, i) => { const a = (i / (phone ? 12 : 20)) * Math.PI * 2; return { x: Math.cos(a) * 5.5, y: 4.15, z: Math.sin(a) * 5.5 }; });
  const ring = bulbMesh(scene, 'bb_bulb_carn_carousel', ringPts, 0.26, 5);
  if (ring) { ring.mesh.material = glow('lantern_carn_carousel', '#ffe2a8'); dress(ring.mesh, car); }
  obs.push(scene.onBeforeRenderObservable.add(() => { if (o.calm?.()) return; car.rotation.y += (Math.PI * 2 / CAROUSEL_TURN_S) * Math.min(0.1, scene.getEngine().getDeltaTime() / 1000); }));

  // ── the wheel ────────────────────────────────────────────────────────────────────────────────────
  const { x: wx, z: wz, r: wr, y: wy } = plan.wheel;
  const wheel = new TransformNode('carn_wheel_pivot', scene); wheel.parent = root; wheel.position.set(wx, wy, wz);
  const spokeParts: Mesh[] = [];
  const SEG = phone ? 24 : 36, SPOKES = 12;
  for (let i = 0; i < SEG; i++) {
    const a = (i / SEG) * Math.PI * 2, a2 = ((i + 1) / SEG) * Math.PI * 2;
    const mx = (Math.cos(a) + Math.cos(a2)) / 2 * wr, my = (Math.sin(a) + Math.sin(a2)) / 2 * wr;
    const seg = MeshBuilder.CreateBox(`carn_wheel_seg_p${i}`, { width: 2 * wr * Math.sin(Math.PI / SEG) + 0.1, height: 0.35, depth: 0.5 }, scene);
    seg.position.set(mx, my, 0); seg.rotation.z = (a + a2) / 2 + Math.PI / 2; spokeParts.push(seg);
  }
  for (let i = 0; i < SPOKES; i++) { const a = (i / SPOKES) * Math.PI * 2; const sp = MeshBuilder.CreateBox(`carn_wheel_spoke_p${i}`, { width: wr, height: 0.12, depth: 0.22 }, scene); sp.position.set(Math.cos(a) * wr / 2, Math.sin(a) * wr / 2, 0); sp.rotation.z = a; spokeParts.push(sp); }
  for (let i = 0; i < SPOKES; i++) { const a = ((i + 0.5) / SPOKES) * Math.PI * 2; const g = MeshBuilder.CreateBox(`carn_wheel_cab_p${i}`, { width: 1.5, height: 1.3, depth: 1.5 }, scene); g.position.set(Math.cos(a) * wr, Math.sin(a) * wr - 0.7, 0); spokeParts.push(g); }
  const wheelBody = Mesh.MergeMeshes(spokeParts, true, true, undefined, false, false);
  if (wheelBody) { wheelBody.name = 'carn_court_wheel'; wheelBody.material = pbr('carn_wheel_m', '#d8dee9', 0.3, 0.6); dress(wheelBody, wheel); }
  const rimPts = Array.from({ length: SEG }, (_, i) => { const a = (i / SEG) * Math.PI * 2; return { x: Math.cos(a) * wr, y: Math.sin(a) * wr, z: -0.35 }; });
  const rim = bulbMesh(scene, 'bb_wheel_marquee_carn', rimPts, 0.55, 4);
  if (rim) { rim.mesh.material = glow('lantern_wheel_carn', '#ff9ad5', 2.2); rim.mesh.parent = wheel; rim.mesh.position.copyFrom(rim.centre); dress(rim.mesh, wheel); }
  // the A-frame legs stand on the ground and do not turn
  const legA = MeshBuilder.CreateBox('carn_wheel_leg_a', { width: 0.7, height: wy + 1, depth: 0.7 }, scene); legA.position.set(wx - 4.5, (wy + 1) / 2 - 0.5, wz); legA.rotation.z = -0.3;
  const legB = MeshBuilder.CreateBox('carn_wheel_leg_b', { width: 0.7, height: wy + 1, depth: 0.7 }, scene); legB.position.set(wx + 4.5, (wy + 1) / 2 - 0.5, wz); legB.rotation.z = 0.3;
  const legs = Mesh.MergeMeshes([legA, legB], true, true, undefined, false, false);
  if (legs) { legs.name = 'carn_court_wheel_legs'; legs.material = pbr('carn_wheel_legs_m', '#9aa3b2', 0.3, 0.6); dress(legs); }
  obs.push(scene.onBeforeRenderObservable.add(() => { if (o.calm?.()) return; wheel.rotation.z += (Math.PI * 2 / WHEEL_TURN_S) * Math.min(0.1, scene.getEngine().getDeltaTime() / 1000); }));

  // ── balloons: one thin-instanced draw, bobbing ───────────────────────────────────────────────────
  let bobs: (() => void) | null = null;
  if (plan.balloons.length) {
    const balloon = MeshBuilder.CreateSphere('carn_court_balloon', { diameter: 0.5, segments: 8 }, scene);
    const bm = new StandardMaterial('carn_balloon_m', scene); bm.diffuseColor = Color3.White(); bm.specularColor = new Color3(0.5, 0.5, 0.5); bm.specularPower = 40; bm.emissiveColor = new Color3(0.1, 0.1, 0.1); mats.push(bm);
    balloon.material = bm; balloon.alwaysSelectAsActiveMesh = true; dress(balloon);
    const items: { x: number; z: number; y: number; ph: number }[] = [], cols: number[] = [];
    const PAL = [[1, 0.3, 0.45], [1, 0.82, 0.25], [0.25, 0.85, 0.7], [0.35, 0.75, 1], [0.8, 0.45, 1]];
    plan.balloons.forEach((c, ci) => { for (let k = 0; k < c.n; k++) { const a = k * 2.4 + ci; items.push({ x: c.x + Math.cos(a) * (0.25 + k * 0.07), z: c.z + Math.sin(a) * (0.25 + k * 0.07), y: 3.0 + (k % 4) * 0.28 + (k / c.n) * 0.4, ph: k * 1.3 + ci }); cols.push(...PAL[(k + ci) % PAL.length], 1); } });
    const mats16 = new Float32Array(items.length * 16), colBuf = new Float32Array(cols);
    const m = new Matrix();
    const write = (t: number): void => { items.forEach((it, i) => { Matrix.ScalingToRef(1, 1.18, 1, m); m.setTranslationFromFloats(it.x + Math.sin(t * 0.7 + it.ph) * 0.06, it.y + Math.sin(t * 0.9 + it.ph) * 0.07, it.z); m.copyToArray(mats16, i * 16); }); balloon.thinInstanceBufferUpdated('matrix'); };
    balloon.thinInstanceSetBuffer('matrix', mats16, 16, false); balloon.thinInstanceSetBuffer('color', colBuf, 4, true);
    write(0);
    let clock = 0;
    bobs = () => { if (o.calm?.()) return; clock += Math.min(0.1, scene.getEngine().getDeltaTime() / 1000); if (root.isEnabled()) write(clock); };
    obs.push(scene.onBeforeRenderObservable.add(bobs));
    // the strings: one line system to the ground from each balloon's own bunch centre
    const lines = plan.balloons.map((c) => [new Vector3(c.x, 0.05, c.z), new Vector3(c.x, 3.1, c.z)]);
    const cord = MeshBuilder.CreateLineSystem('carn_court_balloon_cords', { lines }, scene); cord.color = new Color3(0.9, 0.9, 0.9); dress(cord);
  }

  const handle: CarnivalSetHandle = {
    root, meshes: made,
    setEnabled(on) { root.setEnabled(on); },
    dispose() {
      for (const ob of obs) scene.onBeforeRenderObservable.remove(ob);
      root.dispose(false, true);
      for (const m of made) if (!m.isDisposed()) m.dispose(false, true);
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
  return handle;
}

export { VertexData };
