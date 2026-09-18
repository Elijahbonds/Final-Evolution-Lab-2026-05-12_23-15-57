// _navmesh-holes — sample each gameplay rectangle on its baked navmesh; any uncovered sample is a snag.
import { readFileSync } from 'node:fs';
import navMod from '../../lib/babylon/core/NavBounds';
const { NavBounds } = navMod as unknown as typeof import('../../lib/babylon/core/NavBounds');
const RECTS: Record<string, [number, number, number, number]> = {   // x0, z0, x1, z1 — the area the mode plays on
  'venice-blue-court': [-7, 0.5, 7, 14], dojo: [-4.5, -4.5, 4.5, 4.5], 'soccer-stadium': [-9, -9, 9, 8], 'baseball-park': [-5, -6, 5, 3],
  'tennis-court': [-6, -4.5, 6, 4.5], 'venice-skatepark': [-7, -7, 7, 7], 'surf-break': [-8, -8, 8, 9], 'mountain-slope': [-7, -9, 7, 9], 'gymnastics-gym': [-4.5, -4.5, 4.5, 4],
};
for (const [key, [x0, z0, x1, z1]] of Object.entries(RECTS)) {
  const nb = new NavBounds(JSON.parse(readFileSync(`public/models/navmesh/${key}.json`, 'utf8')));
  let n = 0, miss = 0; const holes: string[] = [];
  for (let x = x0; x <= x1; x += 0.5) for (let z = z0; z <= z1; z += 0.5) { n++; if (!nb.contains(x, z)) { miss++; if (holes.length < 4) holes.push(`${x},${z}`); } }
  console.log(`${key.padEnd(18)} ${n} samples, ${miss} uncovered (${(100 * miss / n).toFixed(1)}%)${miss ? '  e.g. ' + holes.join(' ') : ''}`);
}
