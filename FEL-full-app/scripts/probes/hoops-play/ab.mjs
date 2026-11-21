// hoops-play: knobs OFF against ON over flow-ext.mjs runs — the pooled reads each fix is judged on, per side, with every run's own value.
//   node scripts/probes/hoops-play/ab.mjs <run.json> [...]        (a run is ON when its FEEL has the knob at 1; KNOB=<id> picks the knob,
//                                                                    default hoops.myStripHandOn)
// Reads (from the modes' own log lines and flow-ext's rows):
//   steals / rival possession, steals / poke, reach fouls / poke   — fix 1 (hoops.myStripHandOn)
//   rival shots a minute, rival makes, my shots a minute            — what the AI gets to do with the ball
//   boards: stalls (the 4 s guard), miss → board (median)           — fix 2 (hoops.rivalChaseBoardOn)
//   teleports a minute, possessions, score margin a minute
import fs from 'node:fs';
const KNOB = process.env.KNOB ?? 'hoops.myStripHandOn';
const files = process.argv.slice(2);
const q = (a, k) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(k * (s.length - 1)))]; };
const r2 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 100) / 100);
const missRe = /\[(1V1|3V3)-RIM\] (left|right|front|back|side_iron|front_iron|back_iron|airball)/i;
const endRe = /\[(1V1|3V3)-BOARD\] (.* secures it|nobody came down|PUTBACK|TIP-IN)|\[3V3-OFF\] board →/;
const runs = [];
for (const f of files) {
  const r = JSON.parse(fs.readFileSync(f, 'utf8')); const R = r.flowRows || []; if (!R.length) continue;
  const T = r.mode === 'onevone' ? '1V1' : '3V3'; const L = r.log || []; const min = R.length / 3600;
  const c = (re) => L.filter((l) => re.test(l.m)).length;
  let rivPoss = 0, s0 = 0; for (let i = 1; i <= R.length; i++) if (i === R.length || R[i][7] !== R[i - 1][7]) { if (R[s0][7] === 2) rivPoss++; s0 = i; }
  let tele = 0; for (let i = 1; i < R.length; i++) { const a = Math.hypot(R[i][1] - R[i - 1][1], R[i][2] - R[i - 1][2]), b = Math.hypot(R[i][3] - R[i - 1][3], R[i][4] - R[i - 1][4]); if ((a > 0.5 || b > 0.5) && !R[i][8]) tele++; }
  const boards = []; let lastMiss = -1e9;
  for (let k = 0; k < L.length; k++) {
    if (!missRe.test(L[k].m) || L[k].f - lastMiss < 30) continue; lastMiss = L[k].f;
    const e = L.slice(k + 1).find((l) => endRe.test(l.m) || missRe.test(l.m) || /REF\] out_of_bounds|resetPossession/.test(l.m));
    if (!e || !endRe.test(e.m)) continue;
    boards.push({ sec: (e.f - L[k].f) / 60, stall: /nobody/.test(e.m) });
  }
  const on = (r.feel && r.feel[KNOB] !== undefined) ? r.feel[KNOB] >= 0.5 : null;
  runs.push({
    run: f.split('/').pop().replace(/^ext-|\.json$/g, ''), on, min,
    pokes: r.bot?.pokes ?? 0,
    steals: c(/strip by me|drive-by steal|parry-vault/), readSteals: c(/strip by me/),
    fouls: c(new RegExp(`\\[${T}-REF\\] reach_in(?! \\(their)`)),
    rivPoss, rivShots: c(T === '1V1' ? /\[1V1-DEF\] rival release|\[1V1-DUNK\] rival|rival throws it down/i : /\[3V3-RIM\] rival release|\[3V3-DUNK\] rival/),
    rivMakes: c(new RegExp(`\\[${T}-RIM\\] rival shot IN`)),
    myShots: c(T === '1V1' ? /\[1V1-DEF\] my release/ : /\[3V3-RIM\] release /),
    looseFouls: c(/loose_ball_foul/),
    boards: boards.length, stalls: boards.filter((b) => b.stall).length, boardSecs: boards.map((b) => b.sec),
    tele, margin: (R[R.length - 1][5] - R[R.length - 1][6]),
  });
}
const sides = [['OFF', runs.filter((x) => x.on === false)], ['ON', runs.filter((x) => x.on === true)], ['(no FEEL)', runs.filter((x) => x.on === null)]];
const S = (a, k) => a.reduce((s, x) => s + x[k], 0);
for (const [name, a] of sides) {
  if (!a.length) continue;
  const m = S(a, 'min'); const bs = a.flatMap((x) => x.boardSecs);
  console.log(`${name.padEnd(9)} runs ${a.length} (${(m).toFixed(1)} min)  steals/rivPoss ${r2(S(a, 'steals') / S(a, 'rivPoss'))} (${S(a, 'steals')}/${S(a, 'rivPoss')}; read ${S(a, 'readSteals')})  steals/poke ${r2(S(a, 'steals') / S(a, 'pokes'))}  reach fouls/poke ${r2(S(a, 'fouls') / S(a, 'pokes'))}` +
    `  rival shots/min ${r2(S(a, 'rivShots') / m)} (${S(a, 'rivShots')}, made ${S(a, 'rivMakes')})  my shots/min ${r2(S(a, 'myShots') / m)}  boards ${S(a, 'boards')} stalls ${S(a, 'stalls')} miss→board med ${r2(q(bs, 0.5))} s  loose-ball fouls ${S(a, 'looseFouls')}` +
    `  teleports/min ${r2(S(a, 'tele') / m)}  margin/min ${r2(S(a, 'margin') / m)}`);
  for (const x of a) console.log(`    ${x.run.padEnd(28)} steals ${x.steals}/${x.rivPoss} pokes ${x.pokes} fouls ${x.fouls} rivShots ${x.rivShots} (in ${x.rivMakes}) myShots ${x.myShots} boards ${x.boards} stalls ${x.stalls} [${x.boardSecs.map((s) => s.toFixed(1)).join(' ')}] margin ${x.margin}`);
}
