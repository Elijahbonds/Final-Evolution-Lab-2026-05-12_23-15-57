// improve-hoops phase 3: the A/B table from loadprof.mjs runs — per mode and side, the median (and range) of READY (the harness's own
// mark: the moment the boot splash turns READY), READY as the probe saw it (its next look at the page), the pre-warm's start, and the
// worst frame in the first seconds of play.   node ab-table.mjs <dir>
import fs from 'node:fs'; import path from 'node:path';
const dir = process.argv[2];
const rows = fs.readdirSync(dir).filter((f) => /^(on|off)\d+-\w+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
const fmt = (a) => a.length ? `${(med(a) / 1000).toFixed(1)} (${(Math.min(...a) / 1000).toFixed(1)}–${(Math.max(...a) / 1000).toFixed(1)})` : '-';
console.log('| Mode | Side | n | READY s (harness) | READY s (seen) | Pre-warm starts s | Worst frame, first 4 s of play (s) |');
console.log('|---|---|---|---|---|---|---|');
for (const mode of ['onevone', 'threevthree', 'threepoint', 'tennis']) for (const side of ['off', 'on']) {
  const R = rows.filter((r) => r.mode === mode && r.tag.startsWith(side) && !r.fail && r.marks?.length);
  const ready = R.map((r) => r.marks.find((m) => m[0] === 'ready')?.[2]).filter(Number.isFinite);
  console.log(`| ${mode} | ${side === 'on' ? 'ON (new)' : 'OFF (today)'} | ${R.length} | ${fmt(ready)} | ${fmt(R.map((r) => r.readyAtMs))} | ${fmt(R.map((r) => r.prewarmStartMs))} | ${fmt(R.map((r) => r.play?.worstMs).filter(Number.isFinite))} |`);
}
