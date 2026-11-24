// improve-hoops phase 3 (2026-11-22): what a hoops body's clips cost to build, headless (NullEngine), and whether two builds agree.
//   npx tsx scripts/probes/improve-hoops/clipbench.mts [mode=onevone] [body=public/models/candidates/fel-kit-male.mobile.glb,public/models/rivals/echo.glb]
// env FEEL='perf.poseClipFast=0' sets knob overrides the way the feel panel's module would read them (setFeelUser + setFeelOverride).
// Per body: the ms to build the authored clips (registerAuthoredClips) and the hoops captures (installOpponentMotion), the clip count,
// and — against the first body — the largest quaternion difference over every clip both have (0 = bit-identical).
import { readFileSync } from 'node:fs';
import { NullEngine, Scene, ArcRotateCamera, Vector3, SceneLoader, type AnimationGroup, type TransformNode } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { CharacterAnimator } = await import(APP + '/lib/babylon/anim/CharacterAnimator.ts');
const { registerAuthoredClips } = await import(APP + '/lib/babylon/anim/authored/index.ts');
const { installOpponentMotion, HERO_CAPTURE } = await import(APP + '/lib/babylon/anim/opponentMotion.ts');
const { setFeelUser, setFeelSession, setFeelOverride } = await import(APP + '/lib/feel-panel/feel.ts');
const { poseClipShareStats } = await import(APP + '/lib/babylon/anim/poseClip.ts');

const mode = process.argv[2] ?? 'onevone';
const files = (process.argv[3] ?? 'public/models/candidates/fel-kit-male.mobile.glb,public/models/rivals/echo.glb').split(',');
const FEEL = Object.fromEntries((process.env.FEEL ?? '').split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split('='); return [k, Number(v)]; }));
if (Object.keys(FEEL).length) { setFeelUser(true); setFeelSession(null); for (const [k, v] of Object.entries(FEEL)) setFeelOverride(k, v); }
const SPOTS: [number, number, number][] = [[0, 0, 0], [3.2, 0, -4.1], [-4.5, 0, 6], [1, 0, 2]];
const YAWS = [Math.PI, 0, 0.7, -2.1];

const scene = new Scene(new NullEngine());
scene.activeCamera = new ArcRotateCamera('c', -Math.PI / 2, 1.2, 3.2, new Vector3(0, 1, 0), scene);
scene.metadata = { felTier: 'mobile', felModeId: mode };
type Built = { name: string; ms: number; groups: Map<string, AnimationGroup> };
const out: Built[] = [];
let n = 0;
for (let i = 0; i < Math.max(files.length, Number(process.env.BODIES ?? files.length)); i++) {
  const f = files[i % files.length];
  const c = await SceneLoader.LoadAssetContainerAsync('', `data:model/gltf-binary;base64,${readFileSync(f).toString('base64')}`, scene, undefined, '.glb');
  const inst = c.instantiateModelsToScene((x) => `${x}_b${++n}`, false, { doNotInstantiate: true });
  for (const g of inst.animationGroups) g.stop();
  const root = inst.rootNodes[0] as TransformNode;
  const sp = SPOTS[i % SPOTS.length]; root.position.set(...sp); root.rotation = new Vector3(0, YAWS[i % YAWS.length], 0);
  const sk = inst.skeletons[0];
  const animator = new CharacterAnimator(scene, inst.animationGroups);
  const t0 = performance.now();
  registerAuthoredClips(animator, scene, sk);
  const t1 = performance.now();
  installOpponentMotion(animator, scene, sk, undefined, HERO_CAPTURE);
  const t2 = performance.now();
  const groups = (animator as unknown as { groups: Map<string, AnimationGroup> }).groups;
  out.push({ name: `${f.replace(/^.*\//, '')}#${i}`, ms: t2 - t0, groups });
  console.log(`${f.replace(/^.*\//, '')} #${i}: authored ${Math.round(t1 - t0)} ms, captures ${Math.round(t2 - t1)} ms, ${groups.size} clips`);
}
console.log(`share: ${poseClipShareStats.hits} reused, ${poseClipShareStats.misses} solved, ${poseClipShareStats.size()} kept; heap ${Math.round(process.memoryUsage().heapUsed / 1e6)} MB`);
// agreement: every clip's every track's every key, as local rotation values, against body 0 of the same file
const diff = (a: AnimationGroup, b: AnimationGroup): number => {
  let worst = 0;
  const byTarget = (g: AnimationGroup) => new Map(g.targetedAnimations.map((t) => [`${(t.target as { name: string }).name.replace(/_b\d+$/, '')}|${t.animation.targetProperty}`, t.animation.getKeys()]));
  const A = byTarget(a), B = byTarget(b);
  if (A.size !== B.size) { if (process.env.WHY) console.log('tracks', A.size, B.size); return Infinity; }
  for (const [k, ka] of A) {
    const kb = B.get(k); if (!kb || kb.length !== ka.length) { if (process.env.WHY) console.log('keys', k, ka.length, kb?.length); return Infinity; }
    for (let j = 0; j < ka.length; j++) {
      const va = ka[j].value, vb = kb[j].value;
      if (Math.abs(ka[j].frame - kb[j].frame) > 1e-9) { if (process.env.WHY) console.log("frame", k, j, ka[j].frame, kb[j].frame, ka.length); return Infinity; }
      for (const c of ['x', 'y', 'z', 'w'] as const) if (va?.[c] !== undefined) {
        // q and -q are the same rotation
        worst = Math.max(worst, Math.min(Math.abs(va[c] - vb[c]), Math.abs(va[c] + vb[c])));
      } else if (typeof va === 'number') worst = Math.max(worst, Math.abs(va - vb));
    }
  }
  return worst;
};
for (let i = 1; i < out.length; i++) {
  const base = out.find((o) => o.name.split('#')[0] === out[i].name.split('#')[0]);
  if (!base || base === out[i]) continue;
  let worst = 0, worstClip = '';
  let inf = 0;
  for (const [name, g] of out[i].groups) { const b = base.groups.get(name); if (!b) continue; const d = diff(b, g); if (d === Infinity) { inf++; if (process.env.WHY) console.log('  structural', name); continue; } if (d > worst) { worst = d; worstClip = name; } }
  console.log(`  structural differences: ${inf}`);
  console.log(`${out[i].name} vs ${base.name}: worst ${worst} (${worstClip})`);
}
if (process.env.DUMP) {
  const dump: Record<string, unknown> = {};
  for (const [name, g] of out[0].groups) dump[name] = g.targetedAnimations.map((t) => [(t.target as { name: string }).name.replace(/_b\d+$/, ''), t.animation.targetProperty, t.animation.getKeys().map((k) => [k.frame, k.value?.asArray ? k.value.asArray() : k.value])]);
  (await import('node:fs')).writeFileSync(process.env.DUMP, JSON.stringify(dump));
}
