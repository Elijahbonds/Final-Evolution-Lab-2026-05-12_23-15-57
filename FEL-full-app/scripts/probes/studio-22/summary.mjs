// studio-22 (2026-11-11): the series' table. node scripts/probes/studio-22/summary.mjs <outDir>/<label>
// Reads tasks-<width>[-<tasks>]-run<n>.json and prints, per task and width: done in how many runs, the taps + keys of each run, and the
// notes that differ (Play-test's path, the colour field on screen or not).
import fs from 'node:fs';
import path from 'node:path';
const dir = process.argv[2];
const files = fs.readdirSync(dir).filter((f) => /^tasks-(desktop|phone)(-[a-z_]+)?-run\d+\.json$/.test(f)).sort();
const rows = new Map();
let total = 0, done = 0;
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const r of j.rows) {
    const k = `${r.task}|${r.width}`;
    if (!rows.has(k)) rows.set(k, []);
    rows.get(k).push({ run: j.run, build: j.build, done: r.done, taps: r.taps, keys: r.keys, dead: r.deadEnd, klm: r.klmS, play: r.play, notes: r.notes });
    total++; if (r.done) done++;
  }
}
const runs = new Set(files.map((f) => f.match(/run(\d+)/)[1])).size;
console.log(`${dir}: ${files.length} width-runs, ${runs} run(s); task runs done ${done} of ${total}`);
for (const r of [...new Set(files.map((f) => f.match(/run(\d+)/)[1]))].sort()) {
  let n = 0, d = 0;
  for (const v of rows.values()) for (const x of v) if (String(x.run) === r) { n++; if (x.done) d++; }
  console.log(`  run ${r}: ${d} of ${n}`);
}
const order = ['new', 'firstcourt', 'place', 'arrows', 'ai', 'character', 'script', 'playtest', 'save', 'reopen', 'publish'];
for (const t of order) for (const w of ['desktop', 'phone']) {
  const v = rows.get(`${t}|${w}`); if (!v) continue;
  const ok = v.filter((x) => x.done).length;
  const taps = [...new Set(v.map((x) => `${x.taps}${x.keys ? ` + ${x.keys} key` : ''}`))].join(' / ');
  const extra = v.map((x) => x.play ? `${x.play.how} ${x.play.path.split('?')[0]} ${x.play.framesPerSec ?? '-'} fps pick=${x.play.pick?.source ?? '-'} fixtures=${x.play.studioFixtureNodes ?? '-'} starts=${JSON.stringify((x.play.starts ?? []).map((s) => s && s.playtest))}` : (x.notes.find((n) => /colour field|save state|objects before|graph nodes|Publish passed|Publish refused/.test(n)) ?? '')).filter(Boolean);
  console.log(`${t.padEnd(10)} ${w.padEnd(7)} ${ok}/${v.length} done · taps ${taps}${v.some((x) => x.dead) ? ` · ${[...new Set(v.map((x) => x.dead).filter(Boolean))].join(' | ')}` : ''}${extra.length ? `\n${' '.repeat(19)}${[...new Set(extra)].join('\n' + ' '.repeat(19))}` : ''}`);
}
