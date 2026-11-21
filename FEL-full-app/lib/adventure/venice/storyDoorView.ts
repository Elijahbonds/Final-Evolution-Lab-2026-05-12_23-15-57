/**
 * VENICE ↔ THE STORY: the story gate as drawn (lane/story; the rules are storyDoor.ts). Two stone posts and a lintel on the east sand,
 * facing the courts, with a lamp on each post and a violet glow panel inside the frame: placeholder boxes, painted by vertex colour
 * and merged into ONE mesh (one draw, one material, no texture), the boat landing's recipe (coastDoorView.ts). The walk-up ring is
 * an instance of the courts' own gold ring (courtsView 'venice_ring'): no draw of its own. Scenery: you walk through the frame.
 */

import { Color3, Color4, Mesh, MeshBuilder, StandardMaterial, TransformNode, VertexBuffer, type InstancedMesh, type Scene } from '@babylonjs/core';
import { STORY_ARCH, STORY_GATE } from './storyDoor';

export interface StoryDoorView { root: TransformNode; dispose(): void }

const paint = (m: Mesh, hex: string): Mesh => {
  const c = Color4.FromHexString(`${hex}FF`), n = m.getTotalVertices(), a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { a[i * 4] = c.r; a[i * 4 + 1] = c.g; a[i * 4 + 2] = c.b; a[i * 4 + 3] = 1; }
  m.setVerticesData(VertexBuffer.ColorKind, a, false);
  return m;
};

export function mountStoryDoorView(scene: Scene, parent: TransformNode | null): StoryDoorView {
  const root = new TransformNode('venice_story_door', scene);
  root.parent = parent;
  const box = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, hex: string): Mesh => {
    const m = paint(MeshBuilder.CreateBox(`venice_story_${name}`, { width: w, height: h, depth: d }, scene), hex);
    m.position.set(x, y, z); return m;
  };
  const { x, halfW, h } = STORY_ARCH, z = STORY_GATE.z;
  const parts: Mesh[] = [
    box('base', 1.4, 0.3, halfW * 2 + 1.6, x, 0.15, z, '#8C8274'),
    box('postN', 0.7, h, 0.7, x, h / 2, z - halfW, '#B9AE9C'),
    box('postS', 0.7, h, 0.7, x, h / 2, z + halfW, '#B9AE9C'),
    box('lintel', 0.9, 0.6, halfW * 2 + 1.4, x, h + 0.3, z, '#A39883'),
    box('glow', 0.08, h - 0.4, halfW * 2 - 0.7, x + 0.1, (h - 0.4) / 2 + 0.2, z, '#7C3AED'),
    box('lampN', 0.5, 0.4, 0.5, x - 0.2, h + 0.8, z - halfW, '#FFD166'),
    box('lampS', 0.5, 0.4, 0.5, x - 0.2, h + 0.8, z + halfW, '#FFD166'),
  ];
  const mesh = Mesh.MergeMeshes(parts, true, true)!;
  mesh.name = 'venice_story_gate';
  const mat = new StandardMaterial('venice_story_mat', scene); mat.specularColor = new Color3(0.08, 0.08, 0.08);
  mesh.material = mat; mesh.parent = root; mesh.isPickable = false; mesh.receiveShadows = true; mesh.freezeWorldMatrix();
  let ring: InstancedMesh | null = null;
  const master = scene.getMeshByName('venice_ring');
  if (master instanceof Mesh) {
    ring = master.createInstance('venice_ring_story.gate');
    ring.parent = root; ring.position.set(STORY_GATE.x, 0.08, STORY_GATE.z); ring.isPickable = false;
  }
  return {
    root,
    dispose() { ring?.dispose(); mesh.dispose(); mat.dispose(); root.dispose(); },
  };
}
