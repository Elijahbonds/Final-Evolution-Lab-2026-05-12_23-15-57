// IMPROVE-AUDIT: the measurement table for docs/IMPROVE-10-PHASE-AUDIT.md from walk.mts's JSON files.
//   node table.mjs <dir> [<dir> ...]     (every *-phone-*.json and *-desktop-*.json under them; medians over the samples)
import fs from 'node:fs';
import path from 'node:path';
const rows = new Map();
for (const dir of process.argv.slice(2)) for (const f of fs.readdirSync(dir)) {
  if (!/\.json$/.test(f) || !/-(phone|desktop)-/.test(f)) continue;
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (!d.tier) continue;
  const k = `${d.id}|${d.tier}`; if (!rows.has(k)) rows.set(k, []); rows.get(k).push(d);
}
const med = (a) => { const v = a.filter((x) => typeof x === 'number').sort((x, y) => x - y); if (!v.length) return '–'; const m = v[Math.floor((v.length - 1) / 2)]; return v.length > 1 ? `${m} (${v[0]}–${v[v.length - 1]})` : `${m}`; };
const s = (ms) => (typeof ms === 'number' ? Math.round(ms / 100) / 10 : null);
const out = ['| Screen | Tier | n | Errors (page / console / failed req) | FCP s | LCP s | CLS | Ready s | fps in play (rig) | Sounds in 8 s of play | Bed | Taps < 44 px | Words before scrolling | Ways on (links) | Canvas share |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
const order = ['home', 'try', 'signup', 'login', 'play', 'onevone', 'threevthree', 'dunk', 'threepoint', 'tennis', 'venice', 'coast', 'adventure', 'creator', 'closet', 'train', 'today-drill', 'train-library', 'train-build', 'train-progress', 'train-jumps', 'workout', 'party', 'studio'];
for (const id of order) for (const tier of ['phone', 'desktop']) {
  const a = rows.get(`${id}|${tier}`); if (!a) continue;
  const e = a.map((d) => `${(d.errors || []).length}/${(d.consoleErrors || []).length}/${(d.failed || []).length}`);
  const beds = [...new Set(a.flatMap((d) => d.audioBeds || []))].map((b) => ({ 900: 'stadium', 500: 'ocean', 1400: 'wind', 220: 'dojo' }[b] || b)).join(', ');
  out.push(`| ${a[0].path} | ${tier} | ${a.length} | ${[...new Set(e)].join(' · ')} | ${med(a.map((d) => s(d.nav?.fcp)))} | ${med(a.map((d) => s(d.nav?.lcp)))} | ${med(a.map((d) => d.nav?.cls))} | ${med(a.map((d) => s(d.readyMs)))} | ${med(a.map((d) => d.play?.fps))} | ${med(a.map((d) => d.play?.soundsInPlay))} | ${beds || '–'} | ${med(a.map((d) => (d.screen?.small || []).filter((x) => !/\(chrome\)/.test(x)).length))} | ${med(a.map((d) => d.screen?.wordsFold))} | ${med(a.map((d) => d.screen?.linksOut))} | ${med(a.map((d) => d.canvas?.share))} |`);
}
console.log(out.join('\n'));
