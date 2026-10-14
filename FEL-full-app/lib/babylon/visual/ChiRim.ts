// CHI RIMS — a glow edge on a skinned body (w3-atmos, wave 3; vis-foundation-2 left it as "a skinned glow include for chi rims").
//
// A fighter with a full chi meter (and, for a moment, an agent materialising in the Hundred) gets a lit edge: the silhouette
// burns in the chi colour and the bloom turns it into a halo. The aura column (combat/combatFx) is the energy AROUND the
// body; this is the body's own contour.
//
// HOW (and why it is not a GlowLayer include). Every skinned body already has an ink hull: Babylon's outline renderer
// re-draws the mesh pushed out along its normals, behind it (visual/AnimeInk.ts), skinned the same way the body is. So the
// edge is that hull, recoloured: an HDR colour (the pipeline is a float target, bloom keys on what is over its threshold) and
// a wider line. It costs NO draw, NO shader and NO compile - the hull is drawn already - and it follows every bone. A real
// GlowLayer include would draw the body FILLED in the colour (the layer renders the whole mesh into its target, not its
// edge) and the two fighters share one material, so a per-fighter fresnel plugin would need a material clone and a compile
// mid-match. The ink hull is per mesh (outlineColor / outlineWidth) and is restored to exactly what it was.
//
// Presentation only: it reads a level the mode already computes and draws. Never scoring, never timing.

import { Color3 } from '@babylonjs/core';
import type { AbstractMesh, Observer, Scene, TransformNode } from '@babylonjs/core';
import { motionPolicy } from '../../a11y/reducedMotion';

export type RimTier = 'mobile' | 'desktop' | 'high';

export interface RimLook {
  on: boolean;
  /** how many times the colour's own brightness the edge is drawn at (HDR: > 1 is what the bloom catches) */
  gain: number;
  /** the hull's width in metres (the ink line is 0.015) */
  width: number;
}

/** Pure: what a rim of `level` 0..1 draws. A fuller meter is a brighter, wider edge; a phone's bloom is smaller, so it gets more gain for the same halo. */
export function rimLook(level: number, tier: RimTier): RimLook {
  const l = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));
  if (l < 0.04) return { on: false, gain: 1, width: 0 };
  // gain 1.25 .. 2: a colour pushed past ~2x tone-maps to white, and a white edge says nothing about WHICH fighter is charged
  return { on: true, gain: (1 + l * 1.0) * (tier === 'mobile' ? 1.25 : 1), width: 0.016 + l * 0.013 };
}

/** The edge's slow breath: +-12 % at about 1.6 Hz. Still under reduced motion (a pulse is motion; the edge itself stays). */
export function rimPulse(t: number, calm: boolean): number {
  return calm ? 1 : 1 + Math.sin(t * 10) * 0.12;
}

/** Pure: an arrival edge's level at `age` seconds of `life` - it blazes at once and settles to nothing (quadratic). */
export function edgeLevel(age: number, life: number): number {
  if (!(life > 0) || !(age >= 0) || age >= life) return 0;
  const u = 1 - age / life;
  return u * u;
}

export interface ChiRimHandle {
  /** Hold an edge on `root`'s skinned meshes at `level` 0..1 (0 lets it go). `color` is a hex. Call every frame or on change. */
  set(key: string, root: TransformNode, level: number, color?: string): void;
  /** A one-shot edge that blazes and settles over `life` seconds (an agent materialising). */
  flash(root: TransformNode, color?: string, life?: number): void;
  /** Let every held edge go (a round's end, a KO). The ink returns exactly as it was. */
  clear(): void;
  tick(dt: number): void;
  /** The meshes currently carrying an edge (a probe's view). */
  readonly active: readonly AbstractMesh[];
  dispose(): void;
}

interface Saved { color: Color3; width: number; on: boolean }
interface Held { key: string; root: TransformNode; level: number; target: number; hex: string; meshes: AbstractMesh[] }
interface Burst { root: TransformNode; hex: string; age: number; life: number; meshes: AbstractMesh[] }

function skinnedOf(root: TransformNode): AbstractMesh[] {
  return root.getChildMeshes(false).filter((m) => !!m.skeleton && !m.isDisposed());
}

export function mountChiRim(scene: Scene, opts: { tier?: RimTier } = {}): ChiRimHandle {
  const md = scene.metadata as { felTier?: string } | null;
  const tier: RimTier = opts.tier ?? (md?.felTier === 'mobile' || md?.felTier === 'high' ? md.felTier : 'desktop');
  const saved = new Map<AbstractMesh, Saved>();
  const held = new Map<string, Held>();
  const bursts: Burst[] = [];
  const colour = (hex: string): Color3 => Color3.FromHexString(hex);
  let t = 0;

  const take = (m: AbstractMesh): void => {
    if (saved.has(m)) return;
    saved.set(m, { color: m.outlineColor.clone(), width: m.outlineWidth, on: m.renderOutline });
  };
  const release = (m: AbstractMesh): void => {
    const s = saved.get(m); if (!s) return;
    saved.delete(m);
    if (m.isDisposed()) return;
    m.outlineColor.copyFrom(s.color); m.outlineWidth = s.width; m.renderOutline = s.on;
  };
  const paint = (m: AbstractMesh, hex: string, level: number, pulse: number): void => {
    const L = rimLook(level, tier);
    if (!L.on) return;
    take(m);
    const c = colour(hex), k = L.gain * pulse;
    m.outlineColor.set(c.r * k, c.g * k, c.b * k);
    m.outlineWidth = L.width;
    m.renderOutline = true;
  };
  // a mesh carrying two claims (an agent flashing while it also holds a held edge) takes the brighter: paint order is held, then bursts
  const burstOwned = (m: AbstractMesh): boolean => bursts.some((b) => b.meshes.includes(m));

  // (a mesh disposed while it carries an edge needs no restore: its ink goes with it)
  const dead: Observer<AbstractMesh> = scene.onMeshRemovedObservable.add((m) => { saved.delete(m); });
  return {
    set(key, root, level, color) {
      let h = held.get(key);
      if (!h) { if (!(level >= 0.04)) return; h = { key, root, level: 0, target: 0, hex: color ?? '#ffd36b', meshes: skinnedOf(root) }; held.set(key, h); }
      if (h.root !== root) { for (const m of h.meshes) if (!burstOwned(m)) release(m); h.root = root; h.meshes = skinnedOf(root); }
      h.target = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));
      if (color) h.hex = color;
    },
    flash(root, color, life = 0.8) {
      bursts.push({ root, hex: color ?? '#22d3ee', age: 0, life, meshes: skinnedOf(root) });
    },
    clear() { for (const h of held.values()) h.target = 0; },
    tick(dt) {
      t += dt;
      const calm = !motionPolicy().flash;
      const pulse = rimPulse(t, calm);
      for (const [k, h] of held) {
        h.level += (h.target - h.level) * Math.min(1, dt * 5);
        if (h.level < 0.02 && h.target <= 0) { for (const m of h.meshes) if (!burstOwned(m)) release(m); held.delete(k); continue; }
        if (!h.meshes.length || h.meshes.some((m) => m.isDisposed())) h.meshes = skinnedOf(h.root);   // a body that was re-dressed
        for (const m of h.meshes) paint(m, h.hex, h.level, pulse);
      }
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i]; b.age += dt;
        const lv = edgeLevel(b.age, b.life) * (calm ? 0.6 : 1);
        if (lv <= 0) {
          bursts.splice(i, 1);
          for (const m of b.meshes) if (![...held.values()].some((h) => h.meshes.includes(m))) release(m);
          continue;
        }
        for (const m of b.meshes) if (!m.isDisposed()) paint(m, b.hex, Math.max(lv, 0.05), 1);
      }
    },
    get active() { return [...saved.keys()]; },
    dispose() { scene.onMeshRemovedObservable.remove(dead); for (const m of [...saved.keys()]) release(m); held.clear(); bursts.length = 0; },
  };
}
