import { bake } from '../../avatar/kit-fit/bake';
import { readdirSync } from 'node:fs';
const S = process.argv[2], pub = `${S}/p0/models`;
for (const f of ['fel-kit-male', 'fel-kit-female', 'fel-kit-male.mobile', 'fel-kit-female.mobile']) { const r = bake(`${pub}/candidates/${f}.glb`, `${S}/bake/${f}.glb`); console.log(f, r.rig.slice(0, 12), r.garments.map((g) => `${g.mesh}#${g.prim}:${g.verts}`).join(' ')); }
for (const f of readdirSync(`${pub}/rivals`).filter((x) => x.endsWith('.glb'))) { const r = bake(`${pub}/rivals/${f}`, `${S}/bake/rivals/${f}`); console.log(f, r.garments.filter((g) => g.slot === 'shorts').map((g) => `${g.mesh} ${JSON.stringify(g.legs)}`).join(' ')); }
