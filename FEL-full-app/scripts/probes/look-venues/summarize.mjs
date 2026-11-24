// LOOK-VENUES: one table from venue-walk.mts's runs.  node scripts/probes/look-venues/summarize.mjs <outDir> <tag> [crop x0,y0,x1,y1]
//   perf runs (a readout): per place and variant, each run's frame p95, JS (cpu) p95, draws, texture MB, READY and the guard level,
//                          then the median of the runs; the control's spread (max - min of its p95) is the noise band.
//   shot runs (a -c-play.png): the edge metric (edges.mjs) on the crop, per place and variant, each run then the mean.
// Every run's "edges:" line is printed beside it: a run whose line does not match its variant is a failed control.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [dir, tag, crop = '0.02,0.31,0.98,0.65'] = process.argv.slice(2);
if (!dir || !tag) { console.error('usage: summarize.mjs <outDir> <tag> [crop]'); process.exit(2); }
const EDGES = join(dirname(fileURLToPath(import.meta.url)), 'edges.mjs');
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const num = (re, s) => { const m = s?.match(re); return m ? Number(m[1]) : NaN; };
const rows = new Map();
for (const f of readdirSync(dir).filter((x) => x.startsWith(tag + '-') && x.endsWith('.json')).sort()) {
  const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const key = `${j.tier ?? '?'} ${j.id} [${j.variant || 'none'}]`;
  const r = { run: j.run, ready: j.readyS, edges: (j.edges ?? '').replace(/^.*edges: /, ''), crash: j.crash, errors: (j.errors ?? []).length };
  if (j.readout) {
    Object.assign(r, {
      p50: num(/frame p50 ([\d.]+)/, j.readout), p95: num(/p95 ([\d.]+) ms\n/, j.readout + '\n') || num(/frame p50 [\d.]+ p95 ([\d.]+)/, j.readout),
      cpu95: num(/cpu p50 [\d.]+ p95 ([\d.]+)/, j.readout), draws: num(/draws (\d+)/, j.readout), texMB: num(/≈(\d+) MB/, j.readout),
      level: num(/ L(\d)/, j.readout), modeReady: num(/READY ([\d.]+) s \(mode\)/, j.readout),
    });
  }
  const png = join(dir, f.replace(/\.json$/, '-c-play.png'));
  if (existsSync(png)) Object.assign(r, JSON.parse(execFileSync(process.execPath, [EDGES, crop, png], { encoding: 'utf8' }).trim()));
  (rows.get(key) ?? rows.set(key, []).get(key)).push(r);
}
for (const [key, rs] of rows) {
  console.log(`\n${key}`);
  for (const r of rs) {
    const bits = [`r${r.run}`, `ready ${r.ready ?? '-'}`];
    if (r.p95 !== undefined) bits.push(`p95 ${r.p95}`, `p50 ${r.p50}`, `js95 ${r.cpu95}`, `draws ${r.draws}`, `tex ${r.texMB}MB`, `L${r.level}`, `modeREADY ${r.modeReady}`);
    if (r.hardPer10k !== undefined) bits.push(`hard ${r.hardPer10k}`, `energy ${r.energyPerPx}`, `share ${r.hardSharePct}%`);
    bits.push(`| ${r.edges}`, r.crash ? `CRASH ${r.crash}` : '', r.errors ? `errors ${r.errors}` : '');
    console.log('  ' + bits.filter(Boolean).join('  '));
  }
  const agg = (k) => rs.map((r) => r[k]).filter((v) => typeof v === 'number' && Number.isFinite(v));
  const sum = [];
  if (agg('p95').length) { const p = agg('p95'); sum.push(`p95 median ${med(p)} (spread ${Math.round(Math.max(...p) - Math.min(...p))})`, `js95 median ${med(agg('cpu95'))}`, `modeREADY median ${med(agg('modeReady'))}`, `page READY median ${med(agg('ready'))}`, `levels ${agg('level').join('/')}`); }
  if (agg('hardPer10k').length) { const m = (k) => (agg(k).reduce((a, b) => a + b, 0) / agg(k).length).toFixed(2); sum.push(`hard mean ${m('hardPer10k')}`, `energy mean ${m('energyPerPx')}`, `share mean ${m('hardSharePct')}%`); }
  console.log('  => ' + sum.join('  '));
}
