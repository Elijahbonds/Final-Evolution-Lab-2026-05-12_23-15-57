// _navmesh-ascii — print a navmesh as a 0.5 m grid (# walkable, . not), z rows top = +z.
import { readFileSync } from 'node:fs';
import navMod from '../../lib/babylon/core/NavBounds';
const { NavBounds } = navMod as unknown as typeof import('../../lib/babylon/core/NavBounds');
const [key, r = '8'] = process.argv.slice(2); const R = Number(r);
const nb = new NavBounds(JSON.parse(readFileSync(`public/models/navmesh/${key}.json`, 'utf8')));
console.log(`${key}  x ${-R}..${R} (cols), z ${R}..${-R} (rows), 0.5 m cells`);
for (let z = R; z >= -R; z -= 0.5) { let row = ''; for (let x = -R; x <= R; x += 0.5) row += nb.contains(x, z) ? '#' : '.'; console.log((z % 2 === 0 ? String(z).padStart(4) : '    ') + ' ' + row); }
