// QUIZ PODIUMS — a lit stand under each contestant in Who Scene It (vis-party, 2026-10-13; docs/VISUAL-PASS-PLAN.md Part B,
// who_scene_it: "a podium with glow").
//
// Who Scene It's contestants stood on bare venue floor — a buzz-in game with nothing to say whose seat is whose, who has
// buzzed, who is right. Brain Brawl's set has risers and lecterns with a state light (party/BrainBrawlStage.ts Lectern.light);
// this is the same idea for a mode whose set changes every question: a dark round base under each body and a glowing ring in
// the seat's colour that goes to the state — armed, buzzed, right, wrong, locked out. The ring is named `…neon_ring…`, so the
// foundation's GlowLayer (scene/EmissiveGlow.ts, include list by name) gives it the halo; its colour is a pure function of the
// state (`podiumLook`), so a test can hold the table to what a spectator needs to read from across the room.

import { Color3, Mesh, MeshBuilder, PBRMaterial, TransformNode, type Scene } from '@babylonjs/core';

export type PodiumState = 'armed' | 'buzzed' | 'right' | 'wrong' | 'out';

/** Hue and brightness per state. TUNED (new): the right/wrong colours are the game's own (green / red), the buzz is white-hot. */
export const PODIUM_LOOK: Record<PodiumState, { hex: string | null; level: number }> = {
  armed:  { hex: null,      level: 0.55 },   // the seat's own colour, resting
  buzzed: { hex: '#ffffff', level: 1.6 },
  right:  { hex: '#34d399', level: 1.5 },
  wrong:  { hex: '#ef4444', level: 1.3 },
  out:    { hex: '#475569', level: 0.25 },   // locked out of this question: the light goes grey
};

/** A state's ring colour for a seat: the state's hue, or the seat colour when the state has none. Pure. */
export function podiumLook(state: PodiumState, seatHex: string): { hex: string; level: number } {
  const l = PODIUM_LOOK[state];
  return { hex: l.hex ?? seatHex, level: l.level };
}

/** Seconds a flash state (buzzed / right / wrong) holds its peak before it settles to a resting glow. */
export const PODIUM_FLASH_SEC = 0.9;
/** How lit a ring is `age` seconds after entering `state`: flash states ease from their peak toward a resting 0.7 of it. Pure. */
export function podiumLevelAt(state: PodiumState, age: number): number {
  const peak = PODIUM_LOOK[state].level;
  if (state === 'armed' || state === 'out') return peak;
  const k = Math.min(1, Math.max(0, age / PODIUM_FLASH_SEC));
  return peak * (1 - 0.3 * k);
}

export interface PodiumSpotLike { x: number; z: number; yaw: number }

export interface QuizPodiumsHandle {
  setState(i: number, state: PodiumState): void;
  /** Stand each podium under its contestant; a seat with no spot is hidden. */
  place(spots: readonly (PodiumSpotLike | null)[]): void;
  tick(dt: number): void;
  readonly meshes: readonly Mesh[];
  dispose(): void;
}

export function mountQuizPodiums(scene: Scene, seatHex: readonly string[]): QuizPodiumsHandle {
  const root = new TransformNode('wsi_podiums', scene);
  const base = new PBRMaterial('wsi_podium_base_mat', scene);
  base.albedoColor = Color3.FromHexString('#14102e'); base.metallic = 0.5; base.roughness = 0.4;
  const nodes: TransformNode[] = [], rings: Mesh[] = [], ringMats: PBRMaterial[] = [], bases: Mesh[] = [];
  const state: PodiumState[] = [], age: number[] = [];
  const cache = seatHex.map((h) => Color3.FromHexString(h));
  seatHex.forEach((hex, i) => {
    const node = new TransformNode(`wsi_podium_${i}`, scene); node.parent = root;
    const b = MeshBuilder.CreateCylinder(`wsi_podium_base_${i}`, { height: 0.14, diameterTop: 1.2, diameterBottom: 1.36, tessellation: 40 }, scene);
    b.parent = node; b.position.y = 0.07; b.material = base; b.isPickable = false; bases.push(b);
    const ring = MeshBuilder.CreateTorus(`wsi_podium_neon_ring_${i}`, { diameter: 1.28, thickness: 0.05, tessellation: 48 }, scene);
    ring.parent = node; ring.position.y = 0.145; ring.isPickable = false;
    const m = new PBRMaterial(`wsi_podium_ring_mat_${i}`, scene);
    m.albedoColor = Color3.Black(); m.emissiveColor = cache[i].scale(PODIUM_LOOK.armed.level); m.roughness = 0.5;
    ring.material = m; rings.push(ring); ringMats.push(m); nodes.push(node);
    state.push('armed'); age.push(0);
  });
  const paint = (i: number): void => {
    const look = podiumLook(state[i], seatHex[i]);
    Color3.FromHexString(look.hex).scaleToRef(podiumLevelAt(state[i], age[i]), ringMats[i].emissiveColor);
  };
  return {
    meshes: [...bases, ...rings],
    setState(i, s) { if (i < 0 || i >= nodes.length) return; state[i] = s; age[i] = 0; paint(i); },
    place(spots) {
      nodes.forEach((n, i) => {
        const sp = spots[i];
        n.setEnabled(!!sp);
        if (sp) { n.position.set(sp.x, 0, sp.z); n.rotation.y = sp.yaw; }
      });
    },
    tick(dt) {
      for (let i = 0; i < nodes.length; i++) {
        if (state[i] === 'armed' || state[i] === 'out' || age[i] >= PODIUM_FLASH_SEC) continue;
        age[i] += dt; paint(i);
      }
    },
    dispose() {
      for (const m of [...bases, ...rings]) m.dispose(false, false);
      for (const m of ringMats) m.dispose();
      base.dispose(); root.dispose();
    },
  };
}
