// The Babylon side of the procedural eyes (IMPROVE (2026-10-06), CREATOR-PLAN phase 4a, tool #3). eyeTexture.ts draws;
// this binds. Called by playerIdentity.applyIdentity on every apply (the player's body only; NPCs keep the shipped eyes).
//
// ONE SMALL TEXTURE PER BODY, made once and redrawn in place when the look's eyes change (a colour drag re-uploads 256²,
// nothing new is created), plus an emissive twin only while the iris glows. The eye material is cloned once per body
// (modes flash and fade a body's own materials, so it is never shared) and everything is disposed with the body's root.
//
// HIDE (tool #4): `hide` takes the eyeballs off (mesh visibility, the eyes only — nothing pickable or colliding is
// touched; the eye mesh is neither), and puts them back when it goes off. Cosmetic only.

import { Color3, RawTexture, Texture } from '@babylonjs/core';
import type { AbstractMesh, BaseTexture, Material, Scene, TransformNode } from '@babylonjs/core';
import { EYE_TEX_SIZE, drawEyes, eyeSig, type EyeParams } from './eyeTexture';

type EyeMat = Material & {
  albedoTexture?: BaseTexture | null; albedoColor?: Color3;
  diffuseTexture?: BaseTexture | null; diffuseColor?: Color3;
  emissiveTexture?: BaseTexture | null; emissiveColor?: Color3;
};

interface EyeState {
  sig: string;
  tex: RawTexture | null;
  emissive: RawTexture | null;
  /** source material → this body's clone */
  clones: Map<Material, EyeMat>;
  /** the meshes this module hid (so turning hide off shows only what it hid) */
  hidden: Set<AbstractMesh>;
}

const states = new WeakMap<TransformNode, EyeState>();

/** The kit's eyeball mesh(es): the `eyes` node / material. */
export function isEyeMesh(m: AbstractMesh): boolean {
  return /^eyes(\b|_|$)/i.test(m.name) || (!!m.material && /^eyes(\b|_|$)/i.test(sourceOf(m.material).name));
}

const cloneSource = new WeakMap<Material, Material>();
const sourceOf = (m: Material): Material => cloneSource.get(m) ?? m;

function stateFor(root: TransformNode): EyeState {
  let s = states.get(root);
  if (s) return s;
  const made: EyeState = { sig: '', tex: null, emissive: null, clones: new Map(), hidden: new Set() };
  states.set(root, made);
  root.onDisposeObservable.addOnce(() => {
    try { made.tex?.dispose(); } catch { /* gone with the scene */ }
    try { made.emissive?.dispose(); } catch { /* gone with the scene */ }
    for (const m of made.clones.values()) { try { m.dispose(false, false); } catch { /* gone with the scene */ } }
    made.clones.clear();
    states.delete(root);
  });
  s = made;
  return s;
}

function rawTex(data: Uint8Array, scene: Scene, name: string): RawTexture {
  // invertY false: the glTF loader's own convention, so texel row = v × size (eyeTexture.ts)
  const t = new RawTexture(data, EYE_TEX_SIZE, EYE_TEX_SIZE, 5 /* RGBA */, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  t.name = name;
  t.wrapU = Texture.CLAMP_ADDRESSMODE; t.wrapV = Texture.CLAMP_ADDRESSMODE;
  return t;
}

/** Draw and bind the eyes on one body; hide them when asked. Returns how many eye meshes it dressed. */
export function applyEyes(spawn: { root: TransformNode; meshes: readonly AbstractMesh[] }, p: EyeParams, hide: boolean): number {
  const eyes = spawn.meshes.filter((m) => !m.isDisposed() && m.material && isEyeMesh(m));
  if (!eyes.length) return 0;
  const S = stateFor(spawn.root);
  const scene = spawn.root.getScene();
  // hide / show (only what this module hid comes back)
  for (const m of eyes) {
    if (hide) { if (m.isVisible) { m.isVisible = false; S.hidden.add(m); } }
    else if (S.hidden.has(m)) { m.isVisible = true; S.hidden.delete(m); }
  }
  const sig = eyeSig(p);
  if (sig !== S.sig) {
    const { albedo, emissive } = drawEyes(p);
    if (S.tex) S.tex.update(albedo); else S.tex = rawTex(albedo, scene, `fel_eyes_${spawn.root.name}`);
    if (emissive) { if (S.emissive) S.emissive.update(emissive); else S.emissive = rawTex(emissive, scene, `fel_eyes_glow_${spawn.root.name}`); }
    else if (S.emissive) { S.emissive.dispose(); S.emissive = null; }
    S.sig = sig;
  }
  for (const m of eyes) {
    const src = sourceOf(m.material!);
    let mat = S.clones.get(src);
    if (!mat) {
      const c = src.clone(`${src.name}_fel_eyes`) as EyeMat | null;
      if (!c) continue;
      // the clone deep-copied the shipped eye map; it is replaced, so that copy goes now (never the source's own)
      const keep = new Set<unknown>(src.getActiveTextures());
      for (const t of c.getActiveTextures()) if (!keep.has(t)) { try { t.dispose(); } catch { /* shared */ } }
      cloneSource.set(c, src);
      S.clones.set(src, c);
      mat = c;
    }
    bind(mat, S.tex!, S.emissive, p.glow);
    if (m.material !== mat) m.material = mat;
  }
  return eyes.length;
}

function bind(m: EyeMat, tex: RawTexture, emissive: RawTexture | null, glow: number): void {
  if ('albedoColor' in m && m.albedoColor) { m.albedoTexture = tex; m.albedoColor = Color3.White(); }
  else if ('diffuseColor' in m && m.diffuseColor) { m.diffuseTexture = tex; m.diffuseColor = Color3.White(); }
  if ('emissiveColor' in m && m.emissiveColor) {
    m.emissiveTexture = emissive;
    m.emissiveColor = emissive ? new Color3(1, 1, 1).scale(0.6 + 0.9 * glow) : Color3.Black();
  }
}

/** What a body's eyes carry (tests and probes). */
export function eyeStats(root: TransformNode): { sig: string; textures: number; clones: number; hidden: number } | null {
  const s = states.get(root);
  return s ? { sig: s.sig, textures: (s.tex ? 1 : 0) + (s.emissive ? 1 : 0), clones: s.clones.size, hidden: s.hidden.size } : null;
}

/** The texture bound to a body's eyes (tests and probes). */
export function eyeTextureOf(root: TransformNode): RawTexture | null { return states.get(root)?.tex ?? null; }
