// hoops-play: what happened in flow-ext.mjs runs, from the modes' own log lines. Per run and summed: my shots and makes, the rival's,
// steals each way, fouls by kind, handle moves and how many beat the man, the rival's possessions and how they ended.
//   node scripts/probes/hoops-play/events.mjs <run.json> [...]
import fs from 'node:fs';
const files = process.argv.slice(2);
const count = (L, re) => L.filter((l) => re.test(l.m)).length;
const rows = [];
for (const f of files) {
  const r = JSON.parse(fs.readFileSync(f, 'utf8')); const L = r.log || []; const T = r.mode === 'onevone' ? '1V1' : '3V3';
  const row = { run: f.split('/').pop().replace(/^ext-|\.json$/g, ''), sec: +((r.flowRows || []).length / 60).toFixed(0), score: '' };
  const R = r.flowRows || []; if (R.length) row.score = `${R[R.length - 1][5]}-${R[R.length - 1][6]}`;
  if (T === '1V1') {
    row.myShots = count(L, /\[1V1-DEF\] my release/); row.myMakes = count(L, /\[1V1-DEF\] my release .* made true/);
    row.rivShots = count(L, /\[1V1-DEF\] rival release|\[1V1-DEF\] rival dunk|rival throws it down/i); row.rivMakes = count(L, /\[1V1-RIM\] rival shot IN/);
    row.aiStrips = count(L, /strip by the ai/); row.myStrips = count(L, /strip by me/);
    row.fouls = count(L, /\[1V1-REF\] (reach_in|hand_check|blocking|charge|shooting|foul)/);
    row.moves = count(L, /\[1V1-HANDLE\] move \w+ chain/); row.breaks = count(L, /ankle break|BIT ON THE HESI/);
  } else {
    row.myShots = count(L, /\[3V3-RIM\] release /); row.mateShots = count(L, /\[3V3-RIM\] mate release/); row.rivShots = count(L, /\[3V3-RIM\] rival release/);
    row.rivMakes = count(L, /\[3V3-RIM\] rival shot IN/);
    row.aiStrips = count(L, /strip by the ai|STOLEN|picked off/i); row.moves = count(L, /\[3V3-HANDLE\] move \w+/); row.breaks = count(L, /ankle break|bite /);
    row.fouls = count(L, /\[3V3-REF\] (reach_in|hand_check|blocking|charge|shooting|foul)/);
  }
  row.ft = r.freeThrows ?? 0;
  rows.push(row);
}
const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
console.log(keys.join('\t'));
for (const r of rows) console.log(keys.map((k) => r[k] ?? '').join('\t'));
const sum = {}; for (const k of keys) if (typeof rows[0]?.[k] === 'number') sum[k] = rows.reduce((a, r) => a + (r[k] || 0), 0);
console.log('sum\t' + keys.slice(1).map((k) => sum[k] ?? '').join('\t'));
