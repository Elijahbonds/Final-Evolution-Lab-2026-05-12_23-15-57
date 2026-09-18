// deckMesh — a skateboard that is shaped like a skateboard (owner, 2026-09-15: "fix the glitched out legs … in
// skateboarding").
//
// WHAT WAS ACTUALLY WRONG. The legs were only half the story. `dressBoard` hangs the baked Meshy scan under the rig's
// board box and seats the scan's BOTTOM on the box's bottom — which is right for a prop whose bottom is the thing that
// touches the ground. The baked skateboard is not that prop: measured on public/models/meshy/skateboard.glb, it spans
// 0.82 m of length (correct) but 0.314 m of HEIGHT, with the deck slab and its kicktails living in the top 5 cm and a
// tall display stand under it. So the game hung a 31 cm tower off the rig: from the chase cam a wooden plank stood up
// between the rider's shins with the wheels splayed at its foot, and the rider — whose soles sit near the ground —
// straddled it. That is the "glitched out legs" frame.
//
// The scan cannot be seated by its deck either: put the deck where a deck goes and the stand hangs a quarter metre
// through the floor. A skateboard is five boxes and four cylinders, so this builds one — sized off the rig's own board
// box, so the surface the rider stands on IS the surface the stance is authored against — and the skate discipline
// stops using the scan. Snow and surf keep theirs: the snowboard scan is a plate with bindings standing on it, which
// is exactly what its box wants.
//
// PBR, not StandardMaterial: these venues light for PBR (hemi 0.85 + directional 2.60) and a StandardMaterial diffuse
// clips to white under it — the bug the ratchet test exists to stop spreading.
import { Color3, MeshBuilder, PBRMaterial } from '@babylonjs/core';
import type { AbstractMesh, Mesh, Scene } from '@babylonjs/core';
import { readBoardSkin } from '../nexus/boardSkins';

/** Deck geometry in the board box's local frame (the box is 0.26 × 0.06 × 0.84, centred, so its top face is y +0.03). */
const TOP = 0.03;               // the face the rider stands on — the stance is authored to land the soles here
const DECK_T = 0.022;           // deck thickness, 7-ply
const TRUCK_Z = 0.245;          // axle positions from centre (a real 0.8 m deck's wheelbase)
const WHEEL_R = 0.027;
const WHEEL_X = 0.105;

function mat(scene: Scene, name: string, hex: string, rough: number, glow = 0): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = Color3.FromHexString(hex);
  m.metallic = 0; m.roughness = rough;
  if (glow > 0) m.emissiveColor = Color3.FromHexString(hex).scale(glow);
  return m;
}

/**
 * Dress the rig's board box as a skateboard: deck, griptape, two trucks, four wheels. The box itself goes invisible and
 * stays the anchor every other system already uses (BoardSync writes its position/rotation, the tricks read it).
 *
 * Returns the parts so a disposal path can take them; they are children of the box, so disposing the box takes them too.
 */
export function buildSkateDeck(board: AbstractMesh, color: string): Mesh[] {
  const scene = board.getScene();
  const skin = (() => { try { return readBoardSkin('skate'); } catch { return null; } })();
  const deckHex = skin?.tint ?? color;
  const glow = skin?.glow ?? 0;
  const parts: Mesh[] = [];
  const add = (m: Mesh, y: number, z = 0, x = 0) => { m.parent = board; m.position.set(x, y, z); m.isPickable = false; parts.push(m); return m; };

  // the deck, flush with the box's top face, plus the two kicktails that make it read as a skateboard and not a plank
  const deck = MeshBuilder.CreateBox('deck_slab', { width: 0.24, height: DECK_T, depth: 0.70 }, scene);
  deck.material = mat(scene, 'deckMat', deckHex, 0.55, glow * 0.5);
  add(deck, TOP - DECK_T / 2);
  for (const s of [-1, 1]) {
    const tail = MeshBuilder.CreateBox(`deck_tail_${s > 0 ? 'nose' : 'tail'}`, { width: 0.22, height: DECK_T, depth: 0.16 }, scene);
    tail.material = deck.material;
    add(tail, TOP - DECK_T / 2 + 0.019, s * 0.41);
    tail.rotation.x = s * -0.42;      // kicked up ~24°, the silhouette a deck is recognised by
  }
  // griptape: the top face is most of what the chase cam ever sees of the board, and a bare coloured slab reads as a
  // plank from back there. A dark, rough skin a millimetre proud of the deck is the whole difference.
  const grip = MeshBuilder.CreateBox('deck_grip', { width: 0.225, height: 0.004, depth: 0.66 }, scene);
  grip.material = mat(scene, 'gripMat', '#1a1a1c', 0.95);
  add(grip, TOP + 0.001);

  const truckMat = mat(scene, 'truckMat', '#9aa3ad', 0.35);
  truckMat.metallic = 0.7;
  const wheelMat = mat(scene, 'wheelMat', '#f2efe6', 0.6);
  for (const s of [-1, 1]) {
    const hanger = MeshBuilder.CreateBox('deck_truck', { width: 0.17, height: 0.018, depth: 0.05 }, scene);
    hanger.material = truckMat;
    add(hanger, TOP - DECK_T - 0.012, s * TRUCK_Z);
    for (const sx of [-1, 1]) {
      const w = MeshBuilder.CreateCylinder('deck_wheel', { diameter: WHEEL_R * 2, height: 0.024, tessellation: 12 }, scene);
      w.material = wheelMat;
      w.rotation.z = Math.PI / 2;     // the axle runs across the deck
      add(w, TOP - 0.057, s * TRUCK_Z, sx * WHEEL_X);
    }
  }
  board.visibility = 0;               // the box stays the anchor; the deck above is what is seen
  return parts;
}

/** World-space height of the face the rider stands on, in the board box's local frame. Exported so the stance and any
 *  probe measure against one number rather than two guesses. */
export const DECK_TOP_LOCAL = TOP;
