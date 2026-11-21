// hoops-play: reads flow-ext.mjs runs (one or more JSON files) and prints the flow of each game:
//   · baskets, and per basket the DEAD TIME from the frame the score changed to the first live frame after it: the hero (offence) or
//     the rival with the ball (defence) moving under 1 m/s → over 1 m/s after the bodies were put on the check spots. Split into the
//     banner beat (score → the first replay frame or the reset), the replay (cinematic frames), the check (reset → live).
//   · teleports (a body's root > 0.5 m in one frame) a minute; the share of the run that is live play (phase playing, no replay, not
//     inside a basket's dead time); the bodies' closest approach and the frames under 0.6 m (the recorder's overlap read).
//   node scripts/probes/hoops-play/flow.mjs <run.json> [<run.json> …] [--json]
import fs from 'node:fs';
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const asJson = process.argv.includes('--json');
const q = (a, k) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(k * (s.length - 1)))]; };
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
const out = [];
for (const f of files) {
  const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  const R = r.flowRows || [];
  if (!R.length) { out.push({ file: f, error: 'no flow rows' }); continue; }
  // columns: frame, hx, hz, fx, fz, score, foeScore, possCode, cine, playing, banner
  const n = R.length;
  const sp = (i, ax, az) => (i > 0 ? Math.hypot(R[i][ax] - R[i - 1][ax], R[i][az] - R[i - 1][az]) * 60 : 0);
  const tele = []; for (let i = 1; i < n; i++) { if (sp(i, 1, 2) > 30 || sp(i, 3, 4) > 30) tele.push(i); }   // > 0.5 m in a frame
  const baskets = [];
  for (let i = 1; i < n; i++) {
    const d0 = R[i][5] - R[i - 1][5], d1 = R[i][6] - R[i - 1][6];
    if (d0 > 0 || d1 > 0) baskets.push({ i, who: d0 > 0 ? 'me' : 'them', pts: d0 > 0 ? d0 : d1 });
  }
  const dead = [];
  for (const b of baskets) {
    const nextB = baskets.find((x) => x.i > b.i + 30); const lim = nextB ? nextB.i : n;
    // the reset: the first teleport outside a replay (a replay plays recorded motion back, which reads as teleports too) that comes
    // after the replay, if there was one
    let lastCine = -1; for (let k = b.i; k < lim; k++) { if (R[k][8]) lastCine = k; else if (lastCine >= 0 && k > lastCine + 1) break; }
    const reset = tele.find((t) => t > b.i && t < lim && !R[t][8] && !R[t - 1][8] && t > lastCine);
    if (reset == null) { dead.push({ ...b, reset: null }); continue; }
    let cineF = 0; let firstCine = null;
    for (let k = b.i; k < reset; k++) if (R[k][8]) { cineF++; if (firstCine == null) firstCine = k; }
    // live: after the reset, the first frame the hero or the rival with the ball moves over 1 m/s, sustained 3 frames
    let live = null;
    for (let k = reset + 2; k < lim - 3; k++) {
      const ok = (j) => (sp(j, 1, 2) > 1 || sp(j, 3, 4) > 1) && !R[j][8] && R[j][9];
      if (ok(k) && ok(k + 1) && ok(k + 2)) { live = k; break; }
    }
    dead.push({ ...b, reset, banner: r2(((firstCine ?? reset) - b.i) / 60), replay: r2(cineF / 60), check: live == null ? null : r2((live - reset) / 60), total: live == null ? null : r2((live - b.i) / 60) });
  }
  const deadSet = new Set(); for (const d of dead) if (d.total != null) for (let k = d.i; k < d.i + d.total * 60; k++) deadSet.add(k);
  let liveF = 0; for (let i = 0; i < n; i++) if (R[i][9] && !R[i][8] && !deadSet.has(i)) liveF++;
  const poss = []; let s0 = 0; for (let i = 1; i <= n; i++) { if (i === n || R[i][7] !== R[i - 1][7]) { poss.push((i - s0) / 60); s0 = i; } }
  const tot = dead.filter((d) => d.total != null).map((d) => d.total);
  // BOARDS (from the log): a miss (the ring's "out" / "OFF THE … IRON" / "SHORT" / "airball" line) → the board's end (secured, a stall,
  // or the 3v3 race's "board →"). A stall is the mode's 4 s guard: "nobody came down with it".
  const L = r.log || [];
  const missRe = /\[(1V1|3V3)-RIM\] (left|right|front|back|long|short|airball|.*IRON|.*SHORT|.*AIRBALL)/i;
  const endRe = /\[(1V1|3V3)-BOARD\] (.* secures it|nobody came down|PUTBACK|TIP-IN)|\[3V3-OFF\] board →/;
  const boards = [];
  for (let k = 0; k < L.length; k++) {
    if (!missRe.test(L[k].m)) continue;
    if (boards.length && L[k].f - boards[boards.length - 1].f < 30) continue;   // one miss, several ring lines
    const e = L.slice(k + 1).find((l) => endRe.test(l.m) || missRe.test(l.m));
    if (!e || missRe.test(e.m)) { boards.push({ f: L[k].f, sec: null, how: 'unresolved' }); continue; }
    boards.push({ f: L[k].f, sec: r2((e.f - L[k].f) / 60), how: /nobody/.test(e.m) ? 'stall' : /secures/.test(e.m) ? 'secured' : /board →/.test(e.m) ? 'race' : 'putback' });
  }
  const bsec = boards.filter((b) => b.sec != null).map((b) => b.sec);
  const row = {
    file: f.split('/').pop(), mode: r.mode, seed: r.seed, feel: r.feel, frames: n, sec: r2(n / 60), endedBy: r.endedBy ?? 'frames',
    score: `${R[n - 1][5]}-${R[n - 1][6]}`, baskets: baskets.length,
    deadMedS: r2(q(tot, 0.5)), deadMaxS: r2(q(tot, 1)), deadMeanS: r2(tot.length ? tot.reduce((a, b) => a + b, 0) / tot.length : null),
    bannerMed: r2(q(dead.filter((d) => d.banner != null).map((d) => d.banner), 0.5)), replayTotalS: r2(dead.reduce((a, d) => a + (d.replay || 0), 0)), checkMed: r2(q(dead.filter((d) => d.check != null).map((d) => d.check), 0.5)),
    teleportsPerMin: r2(tele.length / (n / 3600)), livePct: r2(liveF / n * 100), possMedS: r2(q(poss, 0.5)), possessions: poss.length,
    overlap: r.analysis ? r.analysis.overlap : null, dead,
    boards: boards.length, boardStalls: boards.filter((b) => b.how === 'stall').length, boardMedS: r2(q(bsec, 0.5)), boardMaxS: r2(q(bsec, 1)), boardStallS: r2(boards.filter((b) => b.how === 'stall').reduce((a, b) => a + b.sec, 0)), boardList: boards,
  };
  out.push(row);
}
if (asJson) console.log(JSON.stringify(out, null, 1));
else for (const o of out) {
  if (o.error) { console.log(o.file, o.error); continue; }
  console.log(`${o.file}  ${o.mode} s${o.seed} ${o.sec}s ${o.endedBy}  score ${o.score}  baskets ${o.baskets}  dead med ${o.deadMedS}s max ${o.deadMaxS}s (banner ${o.bannerMed} replay total ${o.replayTotalS} check ${o.checkMed})  teleports/min ${o.teleportsPerMin}  live ${o.livePct}%  poss med ${o.possMedS}s n ${o.possessions}  overlap ${JSON.stringify(o.overlap)}`);
  for (const d of o.dead) console.log(`   basket f${d.i} ${d.who} +${d.pts}: banner ${d.banner} replay ${d.replay} check ${d.check} total ${d.total}`);
  console.log(`   boards ${o.boards}: stalls ${o.boardStalls} (${o.boardStallS} s)  miss → board med ${o.boardMedS} s max ${o.boardMaxS} s   ${o.boardList.map((b) => `f${b.f}:${b.how}${b.sec ?? ''}`).join(' ')}`);
}
