// THE STREETBALL ARENA (vis-hoops-court, 2026-10-14) — Part B threevthree: "chain-link cage, graffiti walls, boombox and benches;
// pole lights with real falloff, glow on the fixtures; team colour language".
//
// The venue is called "Streetball Arena" and was a half court on a lawn: a hoop, two lamps and palms. This builds what the name
// promises round the half court the mode plays (|x| ≤ 8, z 0.5..15, the rim at z −0.6), all outside the players' clamp, all
// procedural, all in a handful of draws:
//
//   THE CAGE        chain-link panels down both sidelines and behind the basket (the near end stays OPEN: the 'team' camera stands
//                   18 m back and as far as 29 m — a fence there would be a wall in the lens), steel posts and a top rail. The wire is
//                   a diamond lattice of REAL bars (one thin-instanced draw a panel); a panel is hidden while the camera is within a couple of metres of it (the
//                   camera is outside the sideline fence whenever the ball-handler works the wing), so the cage reads from across
//                   the court and never fills the frame.
//   THE WALLS       two graffiti walls (PlacePack's, the Venice art wall) outside the cage on either side — never behind the rim:
//                   what stands behind the thing you aim at is kept quiet (the WORLD-POPULATION rule), and the cage's back panel is
//                   a faint wire for the same reason.
//   THE SIDELINE    two benches inside the fence, a boombox on one and a duffel by the other.
//   THE POLES       four lamp poles at the cage's corners. Each head is NAMED `lhead_stb_*` on a `lampHead_stb` material: the glow
//                   layer draws its halo and FixtureLights puts a clustered point light under it (desktop/high); on goldenHour that
//                   light is quiet, and the game's dusk (hoopsDusk) brings it up.
//   THE TEAM RINGS  a flat ring under every body but the hero's own (who has his): the hero's team's colour under his two mates, the
//                   other team's under the three they face — the court tells you who is who from the back of the arena.
//
// Names are the contract with the rest of the rig: `court_*` is a receiver-only name (a fence's shadow is a lattice of nothing and
// costs a draw per cascade), `player_ring_team_*` is on both the shadow rig's never-cast list and the glossy floor's skip list (a ring that moves every frame must not draw into the shadow map). Everything is `isPickable = false`: the camera's
// occlusion probe never sees it, the players never touch it. Visual only — it reads body positions and writes meshes.

import { Color3, Matrix, Mesh, MeshBuilder, PBRMaterial, Quaternion, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Observer, Scene } from '@babylonjs/core';
import { makeTexture } from './texture';
import { buildGraffitiStage } from '../visual/PlacePack';
import { unlitDiffuse } from '../visual/unlit';

/** The play area the mode enforces (ThreeVThreeMode COURT_HALF_WIDTH 8, z 0.5..15, the rim at z −0.6): nothing here stands in it. */
export const PLAY = { halfW: 8, zNear: 0.5, zFar: 15, rimZ: -0.6 } as const;
/** The fence line: 1.6 m outside the clamp, from behind the hoop to past the painted court's far line (the near end is open). */
export const CAGE = { x: 9.6, zBack: -2.7, zFront: 17.8, height: 3.4, postEvery: 4.2 } as const;

export interface Spot { x: number; z: number }
export interface CagePlan {
  posts: Spot[];
  /** the three chain-link panels: from (x0, z0) to (x1, z1), the fence's own height */
  panels: { id: 'L' | 'R' | 'B'; x0: number; z0: number; x1: number; z1: number }[];
  poles: (Spot & { yaw: number })[];
  walls: (Spot & { yaw: number; width: number; height: number; seed: number })[];
  benches: (Spot & { yaw: number })[];
  boombox: Spot & { y: number };
  duffel: Spot;
}

/** Pure: where everything stands. A phone gets no wall and no wire (mobileBudget.json: 3v3's row has 98 active meshes and 256 MB, and 216 MB of that
 *  is spent): the frame, the poles, the benches and the rings are 8 meshes. */
export function streetballPlan(tier: string): CagePlan {
  const xs = [-CAGE.x, CAGE.x];
  const sidePosts = (x: number): Spot[] => {
    const n = Math.ceil((CAGE.zFront - CAGE.zBack) / CAGE.postEvery), out: Spot[] = [];
    for (let i = 0; i <= n; i++) out.push({ x, z: CAGE.zBack + ((CAGE.zFront - CAGE.zBack) * i) / n });
    return out;
  };
  const backPosts: Spot[] = [-4.8, 0, 4.8].map((x) => ({ x, z: CAGE.zBack }));
  const walls = [
    { x: -14.2, z: 3.4, yaw: Math.PI / 2, width: 6.4, height: 2.7, seed: 7 },
    { x: 14.2, z: 10.6, yaw: -Math.PI / 2, width: 6.4, height: 2.7, seed: 11 },
  ];
  return {
    posts: [...sidePosts(xs[0]), ...sidePosts(xs[1]), ...backPosts],
    panels: [
      { id: 'L', x0: -CAGE.x, z0: CAGE.zBack, x1: -CAGE.x, z1: CAGE.zFront },
      { id: 'R', x0: CAGE.x, z0: CAGE.zBack, x1: CAGE.x, z1: CAGE.zFront },
      { id: 'B', x0: -CAGE.x, z0: CAGE.zBack, x1: CAGE.x, z1: CAGE.zBack },
    ],
    poles: [
      { x: -CAGE.x - 0.7, z: CAGE.zBack - 0.3, yaw: Math.atan2(1, 1) }, { x: CAGE.x + 0.7, z: CAGE.zBack - 0.3, yaw: -Math.atan2(1, 1) },
      { x: -CAGE.x - 0.7, z: CAGE.zFront + 0.2, yaw: Math.PI - Math.atan2(1, 1) }, { x: CAGE.x + 0.7, z: CAGE.zFront + 0.2, yaw: Math.PI + Math.atan2(1, 1) },
    ],
    walls: tier === 'mobile' ? [] : walls,
    benches: [{ x: -9.0, z: 8.4, yaw: Math.PI / 2 }, { x: 9.0, z: 12.2, yaw: -Math.PI / 2 }],
    boombox: { x: -9.0, z: 8.0, y: 0.5 },
    duffel: { x: 9.0, z: 11.5 },
  };
}

/** Pure: does a point stand clear of the play area (with `margin` to spare)? */
export function clearOfPlay(p: Spot, margin = 0.4): boolean {
  return Math.abs(p.x) > PLAY.halfW + margin || p.z < PLAY.rimZ - margin || p.z > PLAY.zFar + margin;
}

/** Pure: is a fence panel shown with the camera `d` metres from its rectangle? Hidden inside 1.6 m, back from 2.4 m (a wire a hand from the lens
 *  is a bar across the whole frame). `was` is its state a frame ago: the two thresholds are a hysteresis, so it does not flicker at the edge. */
export function panelShown(d: number, was: boolean): boolean { return was ? d > 1.6 : d > 2.4; }

/** One diamond of the wire is this many metres across: a stylised 30 cm — a real 6 cm mesh is a haze at the camera's distance and the cage would not read. */
export const LINK_CELL_M = 0.3;
/** The wire's thickness, metres (a pixel or so at the 'team' camera's 20 m). */
export const LINK_WIRE_M = 0.02;

export interface Seg { x0: number; y0: number; x1: number; y1: number }

/** Pure: the wire of a chain-link panel `w × h` metres, as segments in the panel's own frame (x along it from 0, y up from 0): two families
 *  of diagonals, `cell` apart along the panel, each clipped to the rectangle. Real bars, not a texture: a texture's alpha is either a blended
 *  panel (an opaque wall to the SSAO's geometry buffer: the lawn behind it went black) or an alpha-test the rig's materials did not honour —
 *  geometry has neither problem, and costs one draw. */
export function latticeSegments(w: number, h: number, cell = LINK_CELL_M): Seg[] {
  const out: Seg[] = [];
  // y = x − c (rising right) for c from −w to h, and y = c − x (falling right) for c from 0 to w + h
  const clip = (c: number, rising: boolean): Seg | null => {
    // the line x = t, y = rising ? t − c : c − t, t over [0, w]; keep y within [0, h]
    const lo = rising ? Math.max(0, c) : Math.max(0, c - h), hi = rising ? Math.min(w, c + h) : Math.min(w, c);
    if (hi - lo < 1e-6) return null;
    return { x0: lo, y0: rising ? lo - c : c - lo, x1: hi, y1: rising ? hi - c : c - hi };
  };
  for (let c = -h; c <= w; c += cell) { const s = clip(c, true); if (s) out.push(s); }
  for (let c = 0; c <= w + h; c += cell) { const s = clip(c, false); if (s) out.push(s); }
  return out;
}

/** The painted boombox face: two speaker cones, a tape deck, a row of lit buttons. */
export function paintBoombox(g: CanvasRenderingContext2D, W: number, H: number): void {
  g.fillStyle = '#1b1d22'; g.fillRect(0, 0, W, H);
  for (const cx of [W * 0.2, W * 0.8]) {
    const gr = g.createRadialGradient(cx, H * 0.55, 2, cx, H * 0.55, H * 0.36);
    gr.addColorStop(0, '#5d636e'); gr.addColorStop(0.35, '#2a2d34'); gr.addColorStop(1, '#101216');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, H * 0.55, H * 0.36, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#6b717c'; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#7b818c'; g.beginPath(); g.arc(cx, H * 0.55, H * 0.07, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#0c0d10'; g.fillRect(W * 0.36, H * 0.2, W * 0.28, H * 0.34);
  g.fillStyle = '#ffb347'; g.fillRect(W * 0.4, H * 0.27, W * 0.2, H * 0.06);
  ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0'].forEach((c, i) => { g.fillStyle = c; g.fillRect(W * (0.38 + i * 0.065), H * 0.66, W * 0.04, H * 0.1); });
}

export interface StreetballTeams {
  /** the hero's team (the hero's own ring is the mode's: it is not drawn here) */
  mine: () => readonly (TransformNode | null | undefined)[];
  theirs: () => readonly (TransformNode | null | undefined)[];
  mineColor: string;
  theirsColor: string;
}
export interface StreetballOpts { tier: string; rim: Vector3; teams?: StreetballTeams }
export interface StreetballHandle { readonly meshes: readonly AbstractMesh[]; dispose(): void }

export function mountStreetball(scene: Scene, o: StreetballOpts): StreetballHandle {
  const plan = streetballPlan(o.tier);
  const made: AbstractMesh[] = [], mats: { dispose(): void }[] = [], texs: { dispose(): void }[] = [], nodes: TransformNode[] = [];
  const obs: Observer<Scene>[] = [];
  const dress = (m: AbstractMesh): void => { m.isPickable = false; made.push(m); };

  // ── the frame: posts and a top rail, one merged mesh ───────────────────────────────────────────────
  const steel = new PBRMaterial('court_cage_steel_m', scene);
  steel.albedoColor = Color3.FromHexString('#5d646e'); steel.metallic = 0.65; steel.roughness = 0.5; mats.push(steel);
  const parts: Mesh[] = [];
  for (const p of plan.posts) {
    const post = MeshBuilder.CreateCylinder('court_cage_post', { height: CAGE.height + 0.5, diameter: 0.14, tessellation: 8 }, scene);
    post.position.set(p.x, (CAGE.height + 0.5) / 2, p.z); parts.push(post);
  }
  for (const pn of plan.panels) {
    const len = Math.hypot(pn.x1 - pn.x0, pn.z1 - pn.z0);
    const rail = MeshBuilder.CreateBox('court_cage_rail', { width: pn.id === 'B' ? len : 0.1, height: 0.1, depth: pn.id === 'B' ? 0.1 : len }, scene);
    rail.position.set((pn.x0 + pn.x1) / 2, CAGE.height + 0.45, (pn.z0 + pn.z1) / 2); parts.push(rail);
  }
  const frame = Mesh.MergeMeshes(parts, true, true, undefined, false, false);
  if (frame) { frame.name = 'court_cage_frame'; frame.material = steel; dress(frame); }

  // ── the wire: real bars, one thin-instanced draw a panel, hidden when the camera is a hand from it ──────────────────
  const wireM = new StandardMaterial('court_cage_link_m', scene);
  wireM.diffuseColor = new Color3(0.78, 0.82, 0.88); wireM.specularColor = new Color3(0.25, 0.25, 0.25); wireM.emissiveColor = new Color3(0.2, 0.22, 0.25); mats.push(wireM);
  // behind the rim the wire is kept quiet (what stands behind the thing you aim at must not compete with the rim): the same lattice, a third as bright
  const wireQuiet = new StandardMaterial('court_cage_link_quiet_m', scene);
  wireQuiet.diffuseColor = new Color3(0.36, 0.38, 0.42); wireQuiet.specularColor = Color3.Black(); wireQuiet.emissiveColor = new Color3(0.06, 0.065, 0.075); mats.push(wireQuiet);
  const panels: { mesh: Mesh; shown: boolean; x: number; z: number; alongX: boolean; lo: number; hi: number }[] = [];
  const q = new Quaternion(), sc = new Vector3(), tr = new Vector3(), m4 = new Matrix();
  for (const pn of o.tier === 'mobile' ? [] : plan.panels) {   // a phone draws the frame alone: a 30 cm lattice is under a pixel at 390 px wide
    const alongX = pn.id === 'B', len = Math.hypot(pn.x1 - pn.x0, pn.z1 - pn.z0);
    const segs = latticeSegments(len, CAGE.height);
    const mesh = MeshBuilder.CreateBox(`court_cage_link_${pn.id}`, { size: 1 }, scene);
    const buf = new Float32Array(segs.length * 16);
    segs.forEach((g, i) => {
      const dx = g.x1 - g.x0, dy = g.y1 - g.y0;
      Quaternion.RotationAxisToRef(Vector3.Forward(), Math.atan2(dy, dx), q);   // about the panel's normal (its local z)
      sc.set(Math.hypot(dx, dy), LINK_WIRE_M, LINK_WIRE_M); tr.set((g.x0 + g.x1) / 2 - len / 2, (g.y0 + g.y1) / 2, 0);
      Matrix.ComposeToRef(sc, q, tr, m4); m4.copyToArray(buf, i * 16);
    });
    mesh.thinInstanceSetBuffer('matrix', buf, 16, true);
    mesh.thinInstanceRefreshBoundingInfo(true);
    mesh.position.set((pn.x0 + pn.x1) / 2, 0.02, (pn.z0 + pn.z1) / 2);
    if (!alongX) mesh.rotation.y = Math.PI / 2;
    mesh.material = pn.id === 'B' ? wireQuiet : wireM; dress(mesh);
    panels.push({ mesh, shown: true, x: mesh.position.x, z: mesh.position.z, alongX, lo: alongX ? pn.x0 : pn.z0, hi: alongX ? pn.x1 : pn.z1 });
  }
  obs.push(scene.onBeforeRenderObservable.add(() => {
    const cam = scene.activeCamera; if (!cam) return;
    const c = cam.globalPosition;
    for (const p of panels) {
      // the distance to the panel's own rectangle (its plane, and past its ends)
      const along = p.alongX ? c.x : c.z, across = p.alongX ? c.z - p.z : c.x - p.x;
      const over = Math.max(0, p.lo - along, along - p.hi);
      const d = Math.hypot(across, over, Math.max(0, c.y - CAGE.height));
      const on = panelShown(d, p.shown);
      if (on !== p.shown) { p.shown = on; p.mesh.setEnabled(on); }
    }
  }));

  // ── the walls ────────────────────────────────────────────────────────────────────────────────────
  for (const w of plan.walls) {
    let wall: TransformNode;
    const name = `court_graffiti_${w.seed}`, mark = scene.meshes.length;
    try { wall = buildGraffitiStage(scene, null, name, { width: w.width, height: w.height, seed: w.seed, base: '#b9ad9a' }); }
    catch {   // a runtime with no canvas to paint on (a headless scene): no wall, and no half of one — a mode's load() never dies for a picture
      for (const m of scene.meshes.slice(mark)) m.dispose(false, true);
      scene.getTransformNodeByName(name)?.dispose(false, true);
      continue;
    }
    wall.position.set(w.x, 0, w.z); wall.rotation.y = w.yaw; nodes.push(wall);
    for (const m of wall.getChildMeshes()) dress(m);
  }

  // ── the sideline: benches, a boombox, a duffel ──────────────────────────────────────────────────
  const wood = new PBRMaterial('court_bench_m', scene); wood.albedoColor = Color3.FromHexString('#8a6038'); wood.metallic = 0; wood.roughness = 0.85; mats.push(wood);
  const benchParts: Mesh[] = [];
  for (const [i, b] of plan.benches.entries()) {
    const seat = MeshBuilder.CreateBox(`court_bench_seat_p${i}`, { width: 1.9, height: 0.07, depth: 0.42 }, scene); seat.position.set(0, 0.46, 0);
    const back = MeshBuilder.CreateBox(`court_bench_back_p${i}`, { width: 1.9, height: 0.34, depth: 0.05 }, scene); back.position.set(0, 0.78, -0.2);
    const legA = MeshBuilder.CreateBox(`court_bench_leg_p${i}`, { width: 0.07, height: 0.46, depth: 0.38 }, scene); legA.position.set(-0.8, 0.23, 0);
    const legB = legA.clone(`court_bench_leg2_p${i}`); legB.position.x = 0.8;
    // the pieces of one bench are placed as a unit: parent them to a node, then bake the node's pose into the merge
    const bench = Mesh.MergeMeshes([seat, back, legA, legB], true, true, undefined, false, false);
    if (!bench) continue;
    bench.bakeTransformIntoVertices(Matrix.RotationY(b.yaw).multiply(Matrix.Translation(b.x, 0, b.z)));
    benchParts.push(bench);
  }
  const benches = Mesh.MergeMeshes(benchParts, true, true, undefined, false, false);
  if (benches) { benches.name = 'court_benches'; benches.material = wood; dress(benches); }
  const boxTex = makeTexture(scene, 'court_boombox_tex', 128, 64, (g) => paintBoombox(g, 128, 64));
  const boxMat = new StandardMaterial('court_boombox_m', scene);
  boxMat.diffuseColor = new Color3(0.85, 0.85, 0.85); boxMat.specularColor = new Color3(0.2, 0.2, 0.2);
  if (boxTex) { boxMat.diffuseTexture = boxTex; texs.push(boxTex); } else boxMat.diffuseColor = new Color3(0.1, 0.1, 0.12);
  mats.push(boxMat);
  const box = MeshBuilder.CreateBox('court_boombox', { width: 0.62, height: 0.3, depth: 0.2 }, scene);
  box.position.set(plan.boombox.x, plan.boombox.y + 0.15, plan.boombox.z); box.rotation.y = -Math.PI / 2; box.material = boxMat; dress(box);
  const bag = MeshBuilder.CreateCapsule('court_duffel', { radius: 0.17, height: 0.7, tessellation: 10 }, scene);
  bag.rotation.z = Math.PI / 2; bag.rotation.y = 0.5; bag.position.set(plan.duffel.x, 0.17, plan.duffel.z);
  const bagMat = new PBRMaterial('court_duffel_m', scene); bagMat.albedoColor = Color3.FromHexString('#c0392b'); bagMat.metallic = 0; bagMat.roughness = 0.8; bag.material = bagMat; mats.push(bagMat); dress(bag);

  // ── the poles: steel mast, an arm, a head the rig reads as a lamp ───────────────────────────────
  const poleM = new PBRMaterial('court_pole_m', scene); poleM.albedoColor = Color3.FromHexString('#2f343c'); poleM.metallic = 0.7; poleM.roughness = 0.45; mats.push(poleM);
  const head = new StandardMaterial('lampHead_stb', scene);
  head.emissiveColor = new Color3(1, 0.86, 0.6).scale(1.4); head.diffuseColor = unlitDiffuse(); head.specularColor = Color3.Black(); head.disableLighting = true; mats.push(head);
  const POLE_H = 6.6;
  const poleParts: Mesh[] = [], headParts: Mesh[] = [];
  for (const [i, p] of plan.poles.entries()) {
    const mast = MeshBuilder.CreateCylinder(`pole_stb_p${i}`, { height: POLE_H, diameterTop: 0.14, diameterBottom: 0.24, tessellation: 8 }, scene);
    mast.position.set(p.x, POLE_H / 2, p.z); poleParts.push(mast);
    const arm = MeshBuilder.CreateBox(`pole_stb_arm_p${i}`, { width: 0.1, height: 0.1, depth: 1.5 }, scene);
    // the arm reaches toward the court along the pole's yaw; the head hangs at its end
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    arm.position.set(p.x + fx * 0.7, POLE_H - 0.05, p.z + fz * 0.7); arm.rotation.y = p.yaw; poleParts.push(arm);
    const h = MeshBuilder.CreateBox(`lhead_stb_${i}`, { width: 0.95, height: 0.14, depth: 0.5 }, scene);
    h.position.set(p.x + fx * 1.3, POLE_H - 0.12, p.z + fz * 1.3); h.rotation.y = p.yaw; h.material = head; h.receiveShadows = false; headParts.push(h);
  }
  const masts = Mesh.MergeMeshes(poleParts, true, true, undefined, false, false);
  if (masts) { masts.name = 'pole_stb_masts'; masts.material = poleM; dress(masts); }
  if (o.tier === 'mobile') {   // a phone has no glow and no fixture lights to read the heads by: one mesh, not four
    const heads = Mesh.MergeMeshes(headParts, true, true, undefined, false, false);
    if (heads) { heads.name = 'pole_stb_heads'; heads.material = head; dress(heads); }
  } else for (const h of headParts) dress(h);   // desktop: a mesh a head, named `lhead_*`, the rig finds each

  // ── the team rings: one flat ring per body but the hero's, two draws in all ────────────────────────
  let ringsOf: (() => void) | null = null;
  if (o.teams) {
    const teams = o.teams;
    const mk = (name: string, color: string): { mesh: Mesh; mat: StandardMaterial } => {
      const mesh = MeshBuilder.CreateTorus(name, { diameter: 1.0, thickness: 0.045, tessellation: 36 }, scene);
      mesh.scaling.y = 0.4; mesh.isPickable = false;
      const mat = new StandardMaterial(`${name}_m`, scene);
      mat.disableLighting = true; mat.diffuseColor = unlitDiffuse(); mat.specularColor = Color3.Black(); mat.emissiveColor = Color3.FromHexString(color); mat.alpha = 0.75;
      mesh.material = mat; mesh.alwaysSelectAsActiveMesh = true; mats.push(mat); made.push(mesh);
      return { mesh, mat };
    };
    const a = mk('player_ring_team_mine', teams.mineColor), b = mk('player_ring_team_theirs', teams.theirsColor);
    const buf = { a: new Float32Array(16 * 4), b: new Float32Array(16 * 4) };
    const m = new Matrix();
    const fill = (target: Float32Array, mesh: Mesh, list: readonly (TransformNode | null | undefined)[]): void => {
      let n = 0;
      for (const t of list) { if (!t || t.isDisposed() || n >= 4) continue; Matrix.TranslationToRef(t.position.x, 0.045, t.position.z, m); m.copyToArray(target, n * 16); n++; }
      for (let k = n; k < 4; k++) Matrix.Scaling(0, 0, 0).copyToArray(target, k * 16);
      mesh.thinInstanceBufferUpdated('matrix');
    };
    a.mesh.thinInstanceSetBuffer('matrix', buf.a, 16, false); b.mesh.thinInstanceSetBuffer('matrix', buf.b, 16, false);
    ringsOf = () => { fill(buf.a, a.mesh, teams.mine()); fill(buf.b, b.mesh, teams.theirs()); };   // through a replay too: the bodies are the recording's then, and the rings follow them
    obs.push(scene.onBeforeRenderObservable.add(ringsOf));
  }

  return {
    meshes: made,
    dispose() {
      for (const o2 of obs) scene.onBeforeRenderObservable.remove(o2);
      for (const m of made) if (!m.isDisposed()) m.dispose();
      for (const n of nodes) n.dispose(false, true);
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
}
