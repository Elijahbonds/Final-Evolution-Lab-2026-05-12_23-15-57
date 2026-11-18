/**
 * VENICE ↔ COAST: the boat landing as drawn (lane/coast-door; the rules are coastDoor.ts). A plank jetty from the rim out to
 * the water's edge, its posts, and the boat at its end (a hull, a cabin, a mast and a flag): placeholder boxes, painted by
 * vertex colour and merged into ONE mesh (one draw, one material, no texture). The walk-up ring is an instance of the courts'
 * own gold ring (courtsView 'venice_ring'): no draw of its own. Scenery: the jetty is beyond the rim, not walkable.
 */

import { Color3, Color4, Mesh, MeshBuilder, StandardMaterial, TransformNode, VertexBuffer, type InstancedMesh, type Scene } from '@babylonjs/core';
import { BOAT_STOP, JETTY } from './coastDoor';

export interface CoastDoorView { root: TransformNode; dispose(): void }

const paint = (m: Mesh, hex: string): Mesh => {
  const c = Color4.FromHexString(`${hex}FF`), n = m.getTotalVertices(), a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { a[i * 4] = c.r; a[i * 4 + 1] = c.g; a[i * 4 + 2] = c.b; a[i * 4 + 3] = 1; }
  m.setVerticesData(VertexBuffer.ColorKind, a, false);
  return m;
};

export function mountCoastDoorView(scene: Scene, parent: TransformNode | null): CoastDoorView {
  const root = new TransformNode('venice_coast_door', scene);
  root.parent = parent;
  const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, hex: string, rotX = 0): Mesh => {
    const m = paint(MeshBuilder.CreateBox(`venice_boat_${name}`, { width: w, height: h, depth: d }, scene), hex);
    m.position.set(x, y, z); m.rotation.x = rotX; return m;
  };
  const parts: Mesh[] = [];
  const z = BOAT_STOP.z, len = JETTY.x0 - JETTY.x1, cx = (JETTY.x0 + JETTY.x1) / 2;
  // the jetty: a deck on posts, from the rim out over the sand to the water
  parts.push(box('deck', len, 0.16, JETTY.halfW * 2, cx, JETTY.y, z, '#8A6A4A'));
  for (let x = JETTY.x0 - 3; x > JETTY.x1; x -= 6) for (const dz of [-JETTY.halfW + 0.15, JETTY.halfW - 0.15]) parts.push(box(`post${x}${dz}`, 0.22, 1.6, 0.22, x, JETTY.y - 0.5, z + dz, '#5B4433'));
  // the boat, moored beside the jetty's end, bow to the sea
  const bx = JETTY.x1 - 2, bz = z + JETTY.halfW + 2.2;
  parts.push(box('hull', 9, 1.2, 3.2, bx, 0.1, bz, '#F2F2EE'));
  parts.push(box('stripe', 9.05, 0.22, 3.25, bx, 0.35, bz, '#1F6FB2'));
  parts.push(box('cabin', 3.4, 1.5, 2.4, bx + 1.2, 1.4, bz, '#E8E3D6'));
  parts.push(box('roof', 3.8, 0.14, 2.8, bx + 1.2, 2.2, bz, '#1F6FB2'));
  parts.push(box('mast', 0.14, 4.6, 0.14, bx - 1.6, 2.9, bz, '#DADADA'));
  parts.push(box('flag', 0.04, 0.7, 1.1, bx - 1.6, 4.8, bz + 0.6, '#FFD166'));
  // a post at the jetty's head with a lamp, so the landing reads from the courts
  parts.push(box('headpost', 0.3, 3.2, 0.3, JETTY.x0 + 0.4, 1.6, z - JETTY.halfW - 0.4, '#3B3B3B'));
  parts.push(box('lamp', 0.6, 0.4, 0.6, JETTY.x0 + 0.4, 3.3, z - JETTY.halfW - 0.4, '#FFD166'));
  const mesh = Mesh.MergeMeshes(parts, true, true)!;
  mesh.name = 'venice_boat_landing';
  const mat = new StandardMaterial('venice_boat_mat', scene); mat.specularColor = new Color3(0.08, 0.08, 0.08);
  mesh.material = mat; mesh.parent = root; mesh.isPickable = false; mesh.receiveShadows = true; mesh.freezeWorldMatrix();
  // the walk-up ring: the courts' gold ring, one more instance
  let ring: InstancedMesh | null = null;
  const master = scene.getMeshByName('venice_ring');
  if (master instanceof Mesh) {
    ring = master.createInstance('venice_ring_pier.end');
    ring.parent = root; ring.position.set(BOAT_STOP.x, 0.08, BOAT_STOP.z); ring.isPickable = false;
  }
  return {
    root,
    dispose() { ring?.dispose(); mesh.dispose(); mat.dispose(); root.dispose(); },
  };
}
