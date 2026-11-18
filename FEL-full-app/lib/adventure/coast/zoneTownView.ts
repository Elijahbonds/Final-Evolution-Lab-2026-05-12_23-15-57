/**
 * THE HARBOUR TOWN, drawn (lane/coast-d; zoneTown.ts is the data). Shipped and procedural pieces only:
 *
 *   houses        boxes and gables, their colours in the vertices: ONE mesh for the four
 *   the street    one ground strip on the terrain, the shipped concrete tile (visual/groundTextures)
 *   the market    the shipped Venice boardwalk kit (four shopfronts, three stalls, one atlas), loaded once
 *   sports spots  a marker each (an upright board, a net, a flag, a start line's posts): ONE vertex-coloured mesh; the start
 *                 line's checkered strip; a ring at each spot (instances of one ring) and a sign each (one shared atlas texture)
 *   townsfolk     the Venice phone watchers' bodies (visual/Onlookers: roster bodies, idling), `coast.townsfolk` of them, paused
 *                 while off screen; a "!" over each one whose quest is on offer
 */

import {
  Color3, Color4, DynamicTexture, Mesh, MeshBuilder, SceneLoader, StandardMaterial, TransformNode, Vector3, Vector4, VertexBuffer, VertexData,
  type Scene,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { Onlookers } from '@/lib/babylon/visual/Onlookers';
import { groundTextureFor, TILE_M } from '@/lib/babylon/visual/groundTextures';
import { terrainY } from './zoneLayout';
import { HOUSES, MARKET, MARKET_KIT_URL, RING_SEGMENTS, SPORT_SPOTS, STREET, TOWNSFOLK, houseBase, type SportSpot } from './zoneTown';

/** A flat band on the ground (radius r, width w): RING_SEGMENTS × 2 triangles (a torus at the same look was 2,592). */
function groundRing(name: string, r: number, w: number, scene: Scene): Mesh {
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [];
  for (let i = 0; i <= RING_SEGMENTS; i++) {
    const a = (i / RING_SEGMENTS) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    pos.push(c * (r - w / 2), 0, s * (r - w / 2), c * (r + w / 2), 0, s * (r + w / 2)); nrm.push(0, 1, 0, 0, 1, 0);
    if (i < RING_SEGMENTS) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const m = new Mesh(name, scene), vd = new VertexData();
  vd.positions = pos; vd.normals = nrm; vd.indices = idx; vd.applyToMesh(m);
  return m;
}

export interface ZoneTownView {
  root: TransformNode;
  ready: Promise<void>;
  /** Show the "!" over the townsfolk whose quest is on offer (by townsperson id). */
  setOffers(ids: ReadonlySet<string>): void;
  update(dt: number): void;
  readonly townsfolk: number;
  dispose(): void;
}

const paint = (m: Mesh, hex: string): Mesh => {
  const c = Color4.FromHexString(`${hex}FF`), n = m.getTotalVertices(), a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { a[i * 4] = c.r; a[i * 4 + 1] = c.g; a[i * 4 + 2] = c.b; a[i * 4 + 3] = 1; }
  m.setVerticesData(VertexBuffer.ColorKind, a, false);
  return m;
};

export function mountZoneTownView(scene: Scene, o: { townsfolk: number; sports: boolean }): ZoneTownView {
  const root = new TransformNode('coast_town', scene);
  const mats: StandardMaterial[] = [], texs: DynamicTexture[] = [];
  const vcMat = new StandardMaterial('coast_town_mat', scene); vcMat.specularColor = new Color3(0.1, 0.1, 0.1); mats.push(vcMat);

  // the houses: walls, a gable roof (a box turned 45° about its ridge), a door on the street side
  const parts: Mesh[] = [];
  for (const h of HOUSES) {
    const w = h.maxX - h.minX, d = h.maxZ - h.minZ, base = houseBase(h), cx = (h.minX + h.maxX) / 2, cz = (h.minZ + h.maxZ) / 2;
    const body = paint(MeshBuilder.CreateBox(`${h.id}_body`, { width: w, height: h.h + 1, depth: d }, scene), h.color);
    body.position.set(cx, base + (h.h - 1) / 2, cz); parts.push(body);
    const s = d / Math.SQRT2 + 0.25;
    const roof = paint(MeshBuilder.CreateBox(`${h.id}_roof`, { width: w + 0.6, height: s, depth: s }, scene), h.roof);
    roof.rotation.x = Math.PI / 4; roof.position.set(cx, base + h.h, cz); parts.push(roof);
    const door = paint(MeshBuilder.CreateBox(`${h.id}_door`, { width: 1.2, height: 2.1, depth: 0.12 }, scene), '#5B3A29');
    door.position.set(cx, terrainY(cx, h.minZ) + 1.05, h.minZ - 0.05); parts.push(door);
  }
  // the sports markers
  const markerAt = (s: SportSpot): [number, number, number] => [s.at[0], terrainY(s.at[0], s.at[1]), s.at[1]];
  let startStrip: Mesh | null = null;
  if (o.sports) for (const s of SPORT_SPOTS) {
    const [x, y, z] = markerAt(s);
    if (s.marker === 'surfboard') {
      const b = paint(MeshBuilder.CreateSphere(`${s.id}_board`, { diameter: 1, segments: 10 }, scene), '#F4D35E');
      b.scaling.set(0.55, 2.2, 0.14); b.position.set(x - 2.5, y + 0.9, z - 1); b.rotation.z = 0.12; parts.push(b);
    } else if (s.marker === 'net') {
      for (const dz of [-4.5, 4.5]) { const p = paint(MeshBuilder.CreateBox(`${s.id}_post${dz}`, { width: 0.12, height: 2.5, depth: 0.12 }, scene), '#E8E8E8'); p.position.set(x - 3, y + 1.25, z + dz); parts.push(p); }
      const net = paint(MeshBuilder.CreateBox(`${s.id}_netband`, { width: 0.05, height: 0.9, depth: 9 }, scene), '#F7F7F2'); net.position.set(x - 3, y + 1.95, z); parts.push(net);
    } else if (s.marker === 'flag') {
      const pole = paint(MeshBuilder.CreateBox(`${s.id}_pole`, { width: 0.07, height: 2.6, depth: 0.07 }, scene), '#EDEDED'); pole.position.set(x - 2, y + 1.3, z - 2); parts.push(pole);
      const flag = paint(MeshBuilder.CreateBox(`${s.id}_flag`, { width: 0.03, height: 0.5, depth: 0.8 }, scene), '#E63946'); flag.position.set(x - 2, y + 2.35, z - 1.6); parts.push(flag);
      const tee = paint(MeshBuilder.CreateBox(`${s.id}_teebox`, { width: 3, height: 0.06, depth: 3 }, scene), '#4F9A52'); tee.position.set(x, y + 0.03, z); parts.push(tee);
    } else {
      for (const dz of [-4, 4]) { const p = paint(MeshBuilder.CreateBox(`${s.id}_gate${dz}`, { width: 0.25, height: 3.2, depth: 0.25 }, scene), '#222222'); p.position.set(x + 2, y + 1.6, z + dz); parts.push(p); }
      const banner = paint(MeshBuilder.CreateBox(`${s.id}_banner`, { width: 0.2, height: 0.7, depth: 8.2 }, scene), '#E63946'); banner.position.set(x + 2, y + 3.0, z); parts.push(banner);
      const t = new DynamicTexture('coast_checker', 128, scene, false); texs.push(t);
      const g = t.getContext() as CanvasRenderingContext2D;
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4'; g.fillRect(i * 16, j * 16, 16, 16); }
      t.update(); t.uScale = 6; t.vScale = 1;
      const cm = new StandardMaterial('coast_checker_mat', scene); cm.diffuseTexture = t; cm.specularColor = Color3.Black(); mats.push(cm);
      startStrip = MeshBuilder.CreateGround(`${s.id}_strip`, { width: 1.4, height: 8 }, scene);
      startStrip.position.set(x + 2, y + 0.04, z); startStrip.material = cm; startStrip.isPickable = false; startStrip.parent = root;
    }
  }
  const town = Mesh.MergeMeshes(parts, true, true)!;
  town.name = 'coast_town_built'; town.material = vcMat; town.isPickable = false; town.receiveShadows = true; town.parent = root;
  town.freezeWorldMatrix();

  // the street: one strip on the terrain
  const len = STREET.x1 - STREET.x0, n = Math.ceil(len / 4);
  const street = MeshBuilder.CreateGround('coast_street', { width: len, height: STREET.halfWidth * 2, subdivisionsX: n, subdivisionsY: 2, updatable: true }, scene);
  const cxs = (STREET.x0 + STREET.x1) / 2;
  street.updateMeshPositions((pos) => { for (let i = 0; i < pos.length; i += 3) pos[i + 1] = terrainY(cxs + pos[i], STREET.z + pos[i + 2]) + 0.04; }, true);
  street.position.set(cxs, 0, STREET.z);
  const tile = groundTextureFor(scene, 'concrete', len / TILE_M.concrete, (STREET.halfWidth * 2) / TILE_M.concrete); texs.push(tile);
  const sm = new StandardMaterial('coast_street_mat', scene); sm.diffuseTexture = tile; sm.diffuseColor = Color3.FromHexString('#D9D2C3'); sm.specularColor = Color3.Black(); mats.push(sm);
  street.material = sm; street.isPickable = false; street.receiveShadows = true; street.parent = root;

  // the rings and the signs at the sports spots (one ring mesh, instances; one atlas for the four signs)
  if (o.sports) {
    const ringMat = new StandardMaterial('coast_sport_ring_mat', scene); ringMat.backFaceCulling = false;
    ringMat.diffuseColor = Color3.FromHexString('#7DD3FC'); ringMat.emissiveColor = Color3.FromHexString('#7DD3FC').scale(0.5); ringMat.specularColor = Color3.Black(); mats.push(ringMat);
    const atlas = new DynamicTexture('coast_sport_signs', { width: 512, height: 512 }, scene, false); texs.push(atlas);
    const g = atlas.getContext() as CanvasRenderingContext2D;
    g.fillStyle = 'rgba(8,10,16,0.92)'; g.fillRect(0, 0, 512, 512);
    const signMat = new StandardMaterial('coast_sport_sign_mat', scene); signMat.disableLighting = true; signMat.emissiveTexture = atlas; mats.push(signMat);
    let ringMaster: Mesh | null = null;
    SPORT_SPOTS.forEach((s, k) => {
      const [x, y, z] = markerAt(s);
      if (!ringMaster) {
        ringMaster = groundRing('coast_sport_ring', 1, 0.05, scene); ringMaster.scaling.setAll(s.radius * 0.7);
        ringMaster.material = ringMat; ringMaster.isPickable = false; ringMaster.parent = root; ringMaster.position.set(x, y + 0.1, z);
      } else { const r = ringMaster.createInstance(`coast_sport_ring_${s.id}`); r.parent = root; r.isPickable = false; r.scaling.setAll(s.radius * 0.7); r.position.set(x, y + 0.1, z); }
      g.fillStyle = '#7DD3FC'; g.font = 'bold 54px sans-serif'; g.textBaseline = 'middle';
      g.fillText(s.game.slice(0, 18), 20, k * 128 + 66);
      const v0 = 1 - (k + 1) / 4, v1 = 1 - k / 4;
      const sign = MeshBuilder.CreatePlane(`coast_sport_sign_${s.id}`, { width: 4.2, height: 1.05, sideOrientation: Mesh.DOUBLESIDE, frontUVs: new Vector4(0, v0, 1, v1), backUVs: new Vector4(1, v0, 0, v1) }, scene);
      sign.parent = root; sign.position.set(x, y + 3.6, z); sign.billboardMode = Mesh.BILLBOARDMODE_Y; sign.isPickable = false; sign.material = signMat;
    });
    atlas.update();
  }

  // the market strip: the shipped boardwalk kit, once
  const kitAt = new TransformNode('coast_market', scene); kitAt.parent = root;
  kitAt.position.set(MARKET.x, terrainY(MARKET.x, MARKET.z) - 0.05, MARKET.z);
  const slash = MARKET_KIT_URL.lastIndexOf('/');
  const kit = SceneLoader.ImportMeshAsync('', MARKET_KIT_URL.slice(0, slash + 1), MARKET_KIT_URL.slice(slash + 1), scene).then((r) => {
    for (const m of r.meshes) { if (!m.parent) m.parent = kitAt; m.isPickable = false; m.receiveShadows = true; }
  }).catch((e) => console.warn('[COAST] market kit', e));

  // the townsfolk: the Venice watchers' bodies, idling, facing the street; paused while off screen
  const folk = TOWNSFOLK.slice(0, Math.max(0, Math.min(TOWNSFOLK.length, Math.round(o.townsfolk))));
  const crowd = folk.length ? new Onlookers(scene, folk.map((p) => new Vector3(p.at[0], terrainY(p.at[0], p.at[1]), p.at[1])), '#2b3550',
    new Vector3((STREET.x0 + STREET.x1) / 2, terrainY((STREET.x0 + STREET.x1) / 2, STREET.z), STREET.z), { pauseOffscreen: true, restBetweenCheers: true, idleBobStepSec: 0.2, oneBodyPerFrame: true }) : null;

  // "!" over a townsperson whose quest is on offer
  const bang = new DynamicTexture('coast_bang', 64, scene, false); texs.push(bang);
  const bg = bang.getContext() as CanvasRenderingContext2D;
  bg.clearRect(0, 0, 64, 64); bg.fillStyle = '#FACC15'; bg.beginPath(); bg.arc(32, 32, 30, 0, Math.PI * 2); bg.fill();
  bg.fillStyle = '#111'; bg.font = 'bold 46px sans-serif'; bg.textAlign = 'center'; bg.textBaseline = 'middle'; bg.fillText('!', 32, 35);
  bang.hasAlpha = true; bang.update();
  const bm = new StandardMaterial('coast_bang_mat', scene); bm.disableLighting = true; bm.emissiveTexture = bang; bm.opacityTexture = bang; mats.push(bm);
  const marks = new Map<string, Mesh>();
  for (const p of folk) {
    const m = MeshBuilder.CreatePlane(`coast_bang_${p.id}`, { size: 0.7 }, scene);
    m.material = bm; m.billboardMode = Mesh.BILLBOARDMODE_ALL; m.isPickable = false; m.parent = root;
    m.position.set(p.at[0], terrainY(p.at[0], p.at[1]) + 2.45, p.at[1]); m.setEnabled(false);
    marks.set(p.id, m);
  }

  let t = 0;
  return {
    root,
    ready: Promise.allSettled([kit]).then(() => undefined),
    townsfolk: folk.length,
    setOffers(ids) { for (const [id, m] of marks) m.setEnabled(ids.has(id)); },
    update(dt) {
      t += dt;
      crowd?.update(dt);
      for (const m of marks.values()) if (m.isEnabled()) m.position.y += Math.sin(t * 3) * 0.002;
    },
    dispose() { crowd?.dispose(); for (const x of texs) x.dispose(); for (const m of mats) m.dispose(); root.dispose(false, true); },
  };
}
