// improve-camera (phase 8): the numbers from possession.mjs (1v1) and three.mjs (3v3) recordings — the hoops-cam analyzer
// (../hoops-cam/analyze.mjs) plus, for a 3v3 recording, the six:
//   six      share of frames with all six players (feet, middle, head) and the rim on screen inside a 3 % margin; with all six alone;
//            the fewest players fully on screen in any frame; the smallest player's drawn height (median over frames)
//   node analyze.mjs <dir> <tag> [<tag> ...]   (JSON=<file> writes the rows)
// Window: the playing frames from FROM_S (default 1.5 s: the intro is skipped by the first press at 1.0 s and eases out over 0.35 s)
// to the end of the script.
//   camera   turn rate of the look (deg/s) and eye speed (m/s): mean / p95 / max; the spread of the look's heading over the run (deg);
//            cuts (an eye jump > 0.6 m in one frame)
//   framing  share of frames with the hero (feet, middle, head), the rival (same) and the rim all on screen inside a 3 % margin;
//            the hero's drawn height as a share of the screen (median)
//   perf     CPU frame time (ms, p50 / p95), draw calls and active indices per frame (means)
import fs from 'node:fs';
import path from 'node:path';
const [DIR, ...TAGS] = process.argv.slice(2);
const FROM = Number(process.env.FROM_S ?? 1.5);
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const r = (x, d = 2) => (x === null || !isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const inn = (p, m = 0.03) => p && p[2] === 1 && p[0] >= m && p[0] <= 1 - m && p[1] >= m && p[1] <= 1 - m;
const rows = [];
for (const tag of TAGS) {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, `${tag}.json`), 'utf8'));
  const F = (j.frames || []).filter((f) => f.ph === 'playing');
  const replayFrames = F.filter((f) => f.cin).length;
  const W = [];
  // the play camera only: a replay (ReplayDirector, scene.metadata.felCinematic) and the frame either side of one are left out
  { let t0 = null; for (let i = 0; i < F.length; i++) { const f = F[i]; if (t0 === null) t0 = f.t; if (f.t - t0 >= FROM && !f.cin && !F[i - 1]?.cin && !F[i + 1]?.cin) W.push(f); } }
  const turn = [], speed = [], heads = []; let cuts = 0;
  for (let i = 1; i < W.length; i++) {
    const a = W[i - 1].cam, b = W[i].cam; const dt = Math.max(1e-3, W[i].t - W[i - 1].t);
    if (W[i].i !== undefined && W[i].i !== W[i - 1].i + 1) continue;
    if (dt > 0.05 || dt < 0.01) continue;   // a pause, a gap, or the clock held for a photograph
    const fa = [a[3] - a[0], a[4] - a[1], a[5] - a[2]], fb = [b[3] - b[0], b[4] - b[1], b[5] - b[2]];
    const la = Math.hypot(...fa), lb = Math.hypot(...fb);
    const dot = Math.max(-1, Math.min(1, (fa[0] * fb[0] + fa[1] * fb[1] + fa[2] * fb[2]) / (la * lb)));
    turn.push((Math.acos(dot) * 180) / Math.PI / dt);
    const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); speed.push(d / dt); if (d > 0.6) cuts++;
  }
  for (const f of W) heads.push((Math.atan2(f.cam[3] - f.cam[0], f.cam[5] - f.cam[2]) * 180) / Math.PI);
  const hs = heads.map((h) => ((h - heads[0] + 540) % 360) - 180);
  const all = W.filter((f) => inn(f.pMe) && inn(f.pMeHead) && inn(f.pMeFeet) && inn(f.pFoe) && inn(f.pFoeHead) && inn(f.pFoeFeet) && inn(f.pRim)).length;
  const meIn = W.filter((f) => inn(f.pMe) && inn(f.pMeHead) && inn(f.pMeFeet)).length, foeIn = W.filter((f) => inn(f.pFoe) && inn(f.pFoeHead) && inn(f.pFoeFeet)).length, rimIn = W.filter((f) => inn(f.pRim)).length;
  const hh = W.filter((f) => f.pMeHead && f.pMeFeet).map((f) => Math.abs(f.pMeFeet[1] - f.pMeHead[1]));
  const ms = W.map((f) => f.ms).filter((x) => x > 0);
  const chk = W.filter((f) => f.occ); const insideN = chk.filter((f) => f.inside).length; const occN = chk.filter((f) => f.occ.some(Boolean)).length;
  const occWho = [...new Set(chk.flatMap((f) => [f.inside, ...f.occ]).filter(Boolean))].slice(0, 6).join(',');
  const B = W.filter((f) => f.bodies && f.bodies.every(Boolean));
  const bodyIn = (b) => inn(b.feet) && inn(b.mid) && inn(b.head);
  const sixIn = B.filter((f) => f.bodies.every(bodyIn)).length, sixRim = B.filter((f) => f.bodies.every(bodyIn) && inn(f.pRim)).length;
  const fewest = B.length ? Math.min(...B.map((f) => f.bodies.filter(bodyIn).length)) : null;
  const smallH = B.map((f) => Math.min(...f.bodies.map((b) => Math.abs(b.feet[1] - b.head[1]))));
  const six = B.length ? { sixFrames: B.length, sixRimPct: r((100 * sixRim) / B.length, 1), sixPct: r((100 * sixIn) / B.length, 1), fewest, smallH: r(pct(smallH, 0.5), 3) } : {};
  const row = { tag, frames: W.length, ...six, turnMean: r(mean(turn)), turnP95: r(pct(turn, 0.95)), turnMax: r(Math.max(...turn)), headingSpread: r(Math.max(...hs) - Math.min(...hs), 1),
    speedMean: r(mean(speed)), speedP95: r(pct(speed, 0.95)), speedMax: r(Math.max(...speed)), cuts,
    allInPct: r((100 * all) / W.length, 1), meInPct: r((100 * meIn) / W.length, 1), foeInPct: r((100 * foeIn) / W.length, 1), rimInPct: r((100 * rimIn) / W.length, 1), heroH: r(pct(hh, 0.5), 3),
    msP50: r(pct(ms, 0.5)), msP95: r(pct(ms, 0.95)), draws: r(mean(W.map((f) => f.d)), 1), activeIdx: Math.round(mean(W.map((f) => f.ai)) ?? 0),
    replayFrames, clipChecks: chk.length, eyeInside: insideN, viewBlocked: occN, blockers: occWho, hud: [...new Set(W.map((f) => f.hud).filter(Boolean))].join(' '), errors: (j.errors || []).length, fail: j.fail ?? null };
  rows.push(row);
  if (B.length) console.log(`${tag.padEnd(16)} SIX: all six + rim ${row.sixRimPct}%  all six ${row.sixPct}%  fewest ${row.fewest}/6  smallest drawn ${row.smallH} (frames ${B.length})`);
  console.log(`${tag.padEnd(16)} turn ${row.turnMean}/${row.turnP95}/${row.turnMax} deg/s  spread ${row.headingSpread}°  eye ${row.speedMean}/${row.speedP95}/${row.speedMax} m/s cuts ${cuts} | in-frame all ${row.allInPct}% me ${row.meInPct} foe ${row.foeInPct} rim ${row.rimInPct} heroH ${row.heroH} | replay ${replayFrames} | clip ${insideN}/${chk.length} blocked ${occN} ${occWho} | cpu ${row.msP50}/${row.msP95} ms draws ${row.draws} idx ${row.activeIdx} | ${row.hud} err ${row.errors}${row.fail ? ' FAIL ' + row.fail : ''}`);
}
if (process.env.JSON) fs.writeFileSync(process.env.JSON, JSON.stringify(rows, null, 1));
