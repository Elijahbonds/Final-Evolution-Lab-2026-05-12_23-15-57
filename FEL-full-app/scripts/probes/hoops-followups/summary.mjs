// hoops-followups: one line per run of perf3v3.sh's sweep files.   node summary.mjs <outDir> [tag prefix ...]
import fs from 'node:fs';
const [dir, ...want] = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => /^sweep-.*\.jsonl$/.test(f)).sort();
for (const f of files) {
  const tag = f.slice(6, -6);
  if (want.length && !want.some((w) => tag.startsWith(w))) continue;
  for (const line of fs.readFileSync(`${dir}/${f}`, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(line);
    if (!r.ok) { console.log(`${tag.padEnd(12)} FAILED ${r.note}`); continue; }
    const w = (r.worstFrames ?? [])[0] ?? {};
    const bakes = (r.bakeFramesAll ?? []).map((b) => `g${b.g}:${b.draws}/${b.shadowDraws} ${b.why}`).join(', ');
    console.log(`${tag.padEnd(12)} draws p50 ${r.draws} max ${r.drawsMax} (all frames ${r.drawsMaxAll}) · shadow p50 ${r.shadowDraws} max ${r.shadowDrawsMax} · worst i${w.i} g${w.g} ${w.draws}/${w.shadowDraws} cache ${w.cacheState} bakedHere ${w.bakedHere} swapped ${w.swapped} · START at cache ${r.cacheAtStart} · 1st frame ${JSON.stringify(r.firstFrame)} · bakes: ${bakes || 'none'} · before the recorder: ${r.earlyPlayFrames ?? '-'} play frames, max ${r.earlyPlayDrawsMax ?? '-'}, bakes ${(r.earlyBakes ?? []).map((b) => `${b.phase}:${b.draws}/${b.shadowDraws} ${b.why}`).join(', ') || 'none'} · meshes max ${r.meshesMax} · work p50 ${Math.round(r.workP50)} · calib ${r.calibMs?.toFixed?.(1)}`);
  }
}
