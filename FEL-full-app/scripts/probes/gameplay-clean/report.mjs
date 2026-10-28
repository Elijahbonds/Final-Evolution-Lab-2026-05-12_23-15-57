// gameplay-clean: the audit's per-mode table from audit.mjs's JSON. node report.mjs <dir> [tag] [--json]
// Grades (G / A / R) per check; the thresholds are written here, next to the table they make.
import fs from 'node:fs';
import path from 'node:path';

const [DIR, TAG = 'base'] = process.argv.slice(2);
const rows = fs.readdirSync(DIR).filter((f) => f.endsWith(`-${TAG}.json`)).map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')))
  .sort((a, b) => a.mode.localeCompare(b.mode));

const g = (v, green, amber) => (v === null || v === undefined || Number.isNaN(v) ? '–' : v <= green ? 'G' : v <= amber ? 'A' : 'R');
const max = (a) => (a.length ? Math.max(...a) : null);
const RIG_ERR = /status of 501|Unsupported method|status of 404 \(File not found\)/;   // the static server: no POST /api/analytics, a missing optional file

export function grade(r) {
  if (r.fail || r.bootFail) return { boot: 'R', note: r.fail || r.bootFail };
  const play = r.play ?? [];
  const words = max(play.map((s) => s.words + (s.gui?.words ?? 0)));
  const small = max(play.map((s) => s.small + (s.gui?.small ?? 0)));
  const over = max(play.map((s) => s.overlaps));
  const lowC = max(play.map((s) => s.lowContrast));
  const errs = (r.errors ?? []).filter((e) => !RIG_ERR.test(e));
  const answered = r.pressCount ? r.pressAnswered / r.pressCount : null;
  const out = {
    pops: g(r.popsPerMin, 1, 6),
    pose: g(Math.max(r.tposeFrames ?? 0, r.restPoseFrames ?? 0), 0, 30),
    skate: r.skate ? 'n/a' : r.skateMed == null ? '–' : g(r.skateMed, 0.15, 0.4),
    occl: r.heroHiddenPct == null ? '–' : (() => { const a = g(r.heroHiddenPct, 2, 8); const b = r.heroInFramePct == null ? 'G' : r.heroInFramePct >= 95 ? 'G' : r.heroInFramePct >= 80 ? 'A' : 'R'; return a === 'R' || b === 'R' ? 'R' : a === 'A' || b === 'A' ? 'A' : 'G'; })(),
    cam: g((r.camCutsAfterIntro ?? 0) / Math.max(0.1, (r.playFrames ?? 0) / 3600), 2, 6),
    hud: (() => { const w = g(words, 25, 45), s = g(small, 0, 10), o = over ? 'A' : 'G', c = lowC > 2 ? 'A' : 'G';
      return [w, s, o, c].includes('R') ? 'R' : [w, s, o, c].includes('A') ? 'A' : 'G'; })(),
    perf: g(r.phoneCpuMsP95, 33.4, 50),
    draws: r.drawsMax == null ? '–' : r.drawsMax > 600 ? 'R' : r.drawsMean > 400 ? 'A' : 'G',
    load: g(r.readyS, 15, 30),
    errors: errs.length ? (errs.some((e) => /pageerror|TypeError|ReferenceError|FAILED|Cannot/.test(e)) ? 'R' : 'A') : 'G',
    input: answered == null ? '–' : answered >= 0.6 && (r.respMsMed ?? 999) <= 100 ? 'G' : answered >= 0.3 && (r.respMsMed ?? 999) <= 200 ? 'A' : 'R',
    stuck: r.noPlay ? 'R' : g(r.longestStillS, 4, 8),
    pause: r.pause?.state === 'resumed' ? 'G' : r.pause?.state === 'pending' ? '–' : 'R',
    words, small, over, lowC, errs,
  };
  return out;
}

const lines = [];
lines.push('| mode | boot→READY s | pops/min | T/rest | skate m/s | hero hidden % · in frame % | cam snaps (after intro) | HUD words · <12px · overlaps · low-contrast | phone CPU p50/p95 ms | draws mean/max | press→response ms (answered) | longest still s | pause | errors |');
lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  const k = grade(r);
  if (k.boot === 'R') { lines.push(`| ${r.mode} | **R** ${k.note} |||||||||||||`); continue; }
  const c = (x, s) => `${x} ${s}`;
  lines.push(`| ${r.mode} | ${c(k.load, r.readyS)} | ${c(k.pops, r.popsPerMin)} | ${c(k.pose, `${r.tposeFrames}/${r.restPoseFrames}`)} | ${k.skate === 'n/a' ? 'n/a' : c(k.skate, r.skateMed)} | ${c(k.occl, `${r.heroHiddenPct} · ${r.heroInFramePct}`)} | ${c(k.cam, r.camCutsAfterIntro)} | ${c(k.hud, `${k.words} · ${k.small} · ${k.over} · ${k.lowC}`)} | ${c(k.perf, `${r.phoneCpuMsP50}/${r.phoneCpuMsP95}`)} | ${c(k.draws, `${r.drawsMean}/${r.drawsMax}`)} | ${c(k.input, `${r.respMsMed} (${r.pressAnswered}/${r.pressCount})`)} | ${c(k.stuck, r.longestStillS)} | ${c(k.pause, r.pause?.state ?? '')} | ${c(k.errors, k.errs.length)} |`);
}
if (process.argv.includes('--json')) console.log(JSON.stringify(rows.map((r) => ({ mode: r.mode, ...grade(r) }))));
else console.log(lines.join('\n'));
