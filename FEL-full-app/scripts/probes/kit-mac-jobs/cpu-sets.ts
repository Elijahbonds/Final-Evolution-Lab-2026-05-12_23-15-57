// cpu-sets.ts — the kit-glitch headless measures (TEAR, FLOAT, POKE: scripts/probes/kit-glitch/cpu.ts, unchanged) on the kit
// bodies with and without the lane's garment sets (lane/kit-mac-jobs, 2026-11-18). The sets go into each loaded container
// exactly as the game puts them in (kitGarmentSet.applyGarmentSet), so this is today's files vs the new ones through the same code.
//   npx tsx scripts/probes/kit-mac-jobs/cpu-sets.ts <before|after> <shorts|basketball|football> [male female]
// Prints one line per body x pose and a TOTAL line (JSON).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SceneLoader } from '@babylonjs/core';
import { measureBodies } from '../kit-glitch/cpu';
import { KIT_GARMENT_SETS, applyGarmentSet, parseGarmentSet } from '../../../lib/babylon/core/kitGarmentSet';
import type { Wardrobe } from '../../../lib/babylon/core/kit';

const ROOT = resolve(__dirname, '../../..');
const [side = 'after', what = 'shorts', ...rest] = process.argv.slice(2);
const keys = rest.length ? rest : ['male', 'female'];
const wardrobe: Wardrobe = what === 'shorts' ? { tops: 'top_bonds', shorts: 'shorts_court' } : what === 'basketball'
  ? { tops: side === 'after' ? 'top_basketball' : 'top_bonds' } : { tops: side === 'after' ? 'top_football' : 'top_bonds' };
// before / football: today's football top is the Meshy PACK, which this headless probe cannot attach (no fetch): today's
// kit-body top (top_bonds) stands in, and the line says so
let n = 0;
const load = SceneLoader.LoadAssetContainerAsync.bind(SceneLoader);
(SceneLoader as unknown as { LoadAssetContainerAsync: typeof load }).LoadAssetContainerAsync = async (...a: Parameters<typeof load>) => {
  const c = await load(...a);
  const sex = keys[n++] as 'male' | 'female';
  if (side === 'after' && (sex === 'male' || sex === 'female')) {
    for (const kind of what === 'shorts' ? ['shorts'] as const : ['shorts', 'jerseys'] as const) {
      const b = readFileSync(resolve(ROOT, `public${KIT_GARMENT_SETS[kind][sex]}`));
      applyGarmentSet(c, parseGarmentSet(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
    }
    // cpu.ts names its clones `_c<body>` (no digits), which kitOf does not strip, so a wardrobe pick never matches and the slot
    // shows its FIRST garment: the jersey under test is put first (the shorts set replaces the first short already)
    if (what !== 'shorts') {
      const want = `Kit_tops_top_${what}`, i = c.meshes.findIndex((m) => m.name === want);
      const kids = (c.meshes[i]?.parent as unknown as { _children?: unknown[] } | null)?._children;   // applyKit reads the children's order
      if (i >= 0 && kids) { kids.splice(kids.indexOf(c.meshes[i]), 1); kids.unshift(c.meshes[i]); }
    }
  }
  return c;
};
void (async () => {
  const silence = console.warn; console.warn = () => undefined; console.info = () => undefined;
  const log = console.log; console.log = (...x: unknown[]) => { if (!/^(BJS|\[FEL-)/.test(String(x[0]))) log(...x); };
  const want = what === 'shorts' ? /^Kit_shorts/ : /^Kit_tops/;
  const reads = await measureBodies(keys, { wardrobe, log: (r) => console.log(JSON.stringify({ b: r.body, c: `${r.clip}@${r.frac}`, poke: r.pokeBySlot, g: r.garments.filter((g) => want.test(g.mesh)).map((g) => `${g.mesh.replace(/^Kit_/, '')} tear${g.tear} x${g.maxRatio} float${g.float} ${JSON.stringify(g.tearBones)}`) })) });
  console.warn = silence;
  const slot = what === 'shorts' ? 'shorts' : 'tops';
  const T: Record<string, { tear: number; poke: number; floatMax: number; poses: number }> = {};
  for (const r of reads) {
    const t = (T[r.body] ??= { tear: 0, poke: 0, floatMax: 0, poses: 0 }); t.poses++; t.poke += r.pokeBySlot[slot] ?? 0;
    for (const g of r.garments) if (want.test(g.mesh)) { t.tear += g.tear; t.floatMax = Math.max(t.floatMax, g.float); }
  }
  console.log('TOTAL', JSON.stringify({ side, what, ...(what === 'football' && side === 'before' ? { note: 'before = top_bonds (the Meshy pack is not attached headless)' } : {}), byBody: T }));
})();
