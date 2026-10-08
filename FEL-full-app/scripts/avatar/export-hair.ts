/**
 * EXPORT A CODE-BUILT HAIRSTYLE for the Mac bake (2026-10-07, the hair expansion; owner: "code-built now, Blender/Mac bake
 * scripts for higher-quality versions later — scripts only; the owner runs them").
 *
 *   npx tsx scripts/avatar/export-hair.ts --style "Box Braids" [--sex male|female] [--beard full] [--tier desktop]
 *       [--out scripts/avatar/out/hair]
 *   npx tsx scripts/avatar/export-hair.ts --all [--sex female]
 *
 * Runs anywhere (no Blender): loads the kit body in a NullEngine, builds the style exactly as the game does
 * (lib/babylon/creator/hair/build.buildHair against the body's own head field), and writes
 *   <slug>-<sex>.obj   positions (the kit's rest skeleton space, metres), normals, uvs, one object per piece kind
 *                      (hair / beard / acc / fabric / trim / skin) so Blender can give each its own material;
 *   <slug>-<sex>.json  per vertex: the body joints and weights it is skinned to (Head / Neck / Spine2, build.bindAt),
 *                      the swing chain it hangs on (−1: none) and its `along` (0 root → 1 tip), plus the chains.
 * scripts/avatar/mpfb/bake-hair.py reads both: it is the GUIDE MESH a modelled / carded / baked version is fitted to.
 * Nothing here is shipped or loaded by the game.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NullEngine, Scene, SceneLoader } from '@babylonjs/core';
import type { Mesh, TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { HAIR_STYLES } from '../../lib/closet/wearable-catalog';
import { BEARD_STYLES, type BeardStyle } from '../../lib/creator/look/doc';
import { bodyMeshOf } from '../../lib/babylon/creator/shape/renderShape';
import { clothFieldOf } from '../../lib/babylon/creator/clothes/bodyField';
import { headFieldOf } from '../../lib/babylon/creator/hair/headField';
import { buildHair, type HairGeo } from '../../lib/babylon/creator/hair/build';
import type { HairTier } from '../../lib/babylon/creator/hair/headKit';

const argv = process.argv.slice(2);
const flag = (n: string, d?: string) => { const i = argv.indexOf(n); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const SEX = flag('--sex', 'male') === 'female' ? 'female' : 'male';
const TIER = (flag('--tier', 'desktop') as HairTier);
const OUT = flag('--out', join('scripts', 'avatar', 'out', 'hair'))!;
const BEARD = flag('--beard') as BeardStyle | undefined;
const styles = argv.includes('--all') ? HAIR_STYLES.filter((s) => s !== 'Bald') : [flag('--style', 'Locs')!];
if (BEARD && !(BEARD_STYLES as readonly string[]).includes(BEARD)) throw new Error(`FELHAIR --beard must be one of ${BEARD_STYLES.join(', ')}`);
for (const s of styles) if (!HAIR_STYLES.includes(s)) throw new Error(`FELHAIR unknown style "${s}"`);

/** The file name a style is written (and baked) under: 'Box Braids' → 'box-braids'. bake-hair.py uses the same rule. */
export const hairSlug = (style: string): string => style.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const KIND_NAMES = ['hair', 'beard', 'acc', 'fabric', 'trim', 'skin'];

function obj(g: HairGeo, name: string): string {
  const lines = [`# FEL code-built hair: ${name} (export-hair.ts). Rest skeleton space, metres.`];
  for (let v = 0; v < g.verts; v++) lines.push(`v ${g.P[v * 3].toFixed(5)} ${g.P[v * 3 + 1].toFixed(5)} ${g.P[v * 3 + 2].toFixed(5)}`);
  for (let v = 0; v < g.verts; v++) lines.push(`vn ${g.N[v * 3].toFixed(4)} ${g.N[v * 3 + 1].toFixed(4)} ${g.N[v * 3 + 2].toFixed(4)}`);
  for (let v = 0; v < g.verts; v++) lines.push(`vt ${g.UV[v * 2].toFixed(4)} ${g.UV[v * 2 + 1].toFixed(4)}`);
  // one object per kind (a triangle's kind is its first corner's)
  for (let k = 0; k < KIND_NAMES.length; k++) {
    const faces: string[] = [];
    for (let t = 0; t + 2 < g.ind.length; t += 3) {
      if (g.kind[g.ind[t]] !== k) continue;
      const [a, b, c] = [g.ind[t] + 1, g.ind[t + 1] + 1, g.ind[t + 2] + 1];
      faces.push(`f ${a}/${a}/${a} ${b}/${b}/${b} ${c}/${c}/${c}`);
    }
    if (faces.length) lines.push(`o ${name}_${KIND_NAMES[k]}`, `usemtl hair.${KIND_NAMES[k]}`, ...faces);
  }
  return lines.join('\n') + '\n';
}

async function main(): Promise<void> {
  const scene = new Scene(new NullEngine());
  const glb = readFileSync(join('public', 'models', 'candidates', `fel-kit-${SEX}.glb`));
  const c = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${glb.toString('base64')}`, scene, undefined, '.glb');
  const inst = c.instantiateModelsToScene((x) => x, false, { doNotInstantiate: true });
  const body = bodyMeshOf((inst.rootNodes[0] as TransformNode).getChildMeshes()) as Mesh;
  const H = headFieldOf(body), F = clothFieldOf(body);
  if (!H || !F) throw new Error('FELHAIR the kit body has no head field');
  mkdirSync(OUT, { recursive: true });
  for (const style of styles) {
    const g = buildHair(H, { style, beard: BEARD ?? null, acc: [] }, { tier: TIER, winding: F.winding });
    const name = `${hairSlug(style)}-${SEX}`;
    writeFileSync(join(OUT, `${name}.obj`), obj(g, name));
    writeFileSync(join(OUT, `${name}.json`), JSON.stringify({
      style, sex: SEX, tier: TIER, bones: F.bones, verts: g.verts,
      joints: Array.from(g.J), weights: Array.from(g.W).map((w) => Math.round(w * 1e4) / 1e4),
      chain: Array.from(g.chain), along: Array.from(g.along).map((a) => Math.round(a * 1e3) / 1e3), chains: g.chains,
    }));
    console.log(`FELHAIR ${style} → ${join(OUT, name)}.obj  ${g.verts} verts, ${g.tris} tris, ${g.chains.length} chains`);
  }
}

void main();
