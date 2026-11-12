// hoops-p08: read a scene census (./scene-census.mts) — draws, meshes and texture memory grouped by what they are.
//   node scripts/probes/hoops-p08/census-report.mjs <census-<tag>-<mode>.json> [top]
import fs from 'node:fs';
const [file, topArg] = process.argv.slice(2);
const c = JSON.parse(fs.readFileSync(file, 'utf8'));
const TOP = Number(topArg ?? 25);
/** A mesh's group: the first ancestor that names a thing (a body root, a venue holder), else its own name's stem. */
const group = (m) => {
  const a = m.anc ?? [];
  const body = a.find((n) => /^(onlooker|crowd|rival|foe|mate|me_|hero|char_|npc|__root__|fel_char|body)/i.test(n));
  if (m.skinned) return `skinned: ${a.slice(0, 2).join(' < ') || m.name}`;
  const named = a.find((n) => /^(vb_|venue_props|nexus_venue|venice|venue_|tp_|hoop|court)/i.test(n));
  return named ? `${named.replace(/_\d+$/, '')}` : (body ?? m.name.replace(/[_.\-]?\d+$/g, '').replace(/_(lod\d|primitive\d+)$/i, ''));
};
const g = new Map();
let sum = 0;
for (const m of c.meshes) {
  const k = group(m); const r = g.get(k) ?? { draws: 0, meshes: 0, active: 0, casters: 0, inst: 0, verts: 0, ink: 0 };
  r.draws += m.draws; r.meshes++; if (m.active) r.active++; if (m.caster) r.casters++; if (m.ink) r.ink++; r.inst += m.inst; r.verts += m.verts; g.set(k, r); sum += m.draws;
}
console.log(`${file}\n  worst frame ${c.frameDraws} draws (p50 ${c.drawsP50}; through mesh.render ${sum}, shadow maps ${c.shadowDraws}, other ${c.frameDraws - sum - c.shadowDraws}); active meshes ${c.activeMeshes}; textures ${c.texMb.toFixed(0)} MB; materials ${c.materials}; tier ${c.tier}`);
const rows = [...g.entries()].sort((a, b) => b[1].draws - a[1].draws || b[1].active - a[1].active);
for (const [k, r] of rows.slice(0, TOP)) console.log(`  ${String(r.draws).padStart(4)} draws ${String(r.active).padStart(4)} active ${String(r.casters).padStart(3)} casters ${String(r.ink).padStart(3)} inked  ${k}`);
const tex = [...c.tex].filter((t) => !t.rt).sort((a, b) => b.mb - a.mb);
console.log('  textures (largest):');
for (const t of tex.slice(0, 15)) console.log(`    ${t.mb.toFixed(1).padStart(6)} MB ${t.w}x${t.h} ${t.url}`);
const byFile = new Map();
for (const t of tex) { const f = (t.url.match(/[^/]+\.glb/) ?? [t.url.replace(/#.*/, '').slice(-40) || '(dynamic)'])[0]; byFile.set(f, (byFile.get(f) ?? 0) + t.mb); }
console.log('  textures by file:');
for (const [f, mb] of [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`    ${mb.toFixed(1).padStart(6)} MB ${f}`);
