// hoops-audit-play (2026-11-12): one table over the gameplay-clean counter's runs of the hoops routes (gc-hold.sh / mash-audit.mjs out
// dir): per mode and player, the hard pops a minute and what they were, the skate, the presses answered, the longest still stretch,
// root jumps, camera cuts after the intro, the errors — and, from mash-audit's tapped play log, the makes, misses, blocks, steals and
// calls the mode logged.
//   node scripts/probes/hoops-audit/summary.mjs <outDir> [--md]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const [dir] = process.argv.slice(2);
const MD = process.argv.includes('--md');
if (!dir) { console.error('usage: node summary.mjs <outDir> [--md]'); process.exit(2); }
const rows = [];
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && !x.endsWith('-play.json')).sort()) {
  const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (r.fail) { rows.push({ run: f.replace('.json', ''), fail: r.fail }); continue; }
  const playF = path.join(dir, f.replace('.json', '-play.json'));
  // the tapped log: audit.mjs saves the page's __S (with mash-audit's log in it) in its raw recording; the -play.json is the fallback
  const rawF = path.join(dir, f.replace('.json', '-raw.json.gz'));
  let play = null;
  try { if (fs.existsSync(rawF)) { const S = JSON.parse(zlib.gunzipSync(fs.readFileSync(rawF)).toString()).S; if (S && S.log) play = { presses: S.presses ?? null, log: S.log }; } } catch { /* an unreadable recording: no play columns */ }
  if (!play && fs.existsSync(playF)) play = JSON.parse(fs.readFileSync(playF, 'utf8'));
  const L = play ? play.log.map((x) => x[1]) : [];
  const n = (re) => L.filter((m) => re.test(m)).length;
  const ev = play ? {
    rimYes: n(/-RIM\] ring YES/), rimNo: n(/-RIM\] ring no/),
    blocks: n(/BLOCK|swat read.*HIT|SWATTED|blocked/i), steals: n(/STEAL|strip.*lands|stole|PICKED/i), refs: n(/-REF\]/), boards: n(/-BOARD\]/),
    refused: n(/\[REFUSE|refuse/i), lines: L.length,
  } : null;
  rows.push({
    run: f.replace('.json', ''), playS: r.playS, frames: r.playFrames, partial: r.partial ?? null,
    hardPerMin: r.hardPopsPerMin, hard: r.hardPopEvents, topTransitions: (r.hardPopTransitions || []).slice(0, 3),
    worst: (r.popEventEx || []).slice(0, 2),
    skateMed: r.skateMed, skateP90: r.skateP90, rootJumps: r.rootJumps, tpose: r.tposeFrames,
    camCutsAfterIntro: r.camCutsAfterIntro, answered: `${r.pressAnswered}/${r.pressCount}`, respMed: r.respMsMed, respP90: r.respMsP90,
    longestStillS: r.longestStillS, ended: r.ended, readyS: r.readyS, cpuP95: r.cpuMsP95, drawsMean: r.drawsMean,
    errors: (r.errors || []).filter((e) => !/404|501/.test(e)).length, presses: play?.presses ?? null, play: ev,
  });
}
if (!MD) { for (const r of rows) console.log(JSON.stringify(r)); process.exit(0); }
console.log('| run | play s | hard pops /min (n) | top hard-pop transitions | skate med / p90 | presses answered, median ms | longest still s | root jumps | cuts | makes / misses (log) |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  if (r.fail) { console.log(`| ${r.run} | fail: ${r.fail} |||||||||`); continue; }
  console.log(`| ${r.run} | ${r.playS}${r.partial ? ' (partial)' : ''} | ${r.hardPerMin} (${r.hard}) | ${r.topTransitions.join('; ').replace(/\|/g, '/')} | ${r.skateMed} / ${r.skateP90} | ${r.answered}, ${r.respMed} | ${r.longestStillS} | ${r.rootJumps} | ${r.camCutsAfterIntro} | ${r.play ? `${r.play.rimYes} / ${r.play.rimNo}` : '-'} |`);
}
