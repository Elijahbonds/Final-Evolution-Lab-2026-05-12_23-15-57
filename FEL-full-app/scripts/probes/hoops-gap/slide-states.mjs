// hoops-p05: WHICH STATE IS A SLIDE FRAME IN? Reads a driver JSON recorded with POP_LIST=1 POSS_MOTION=1 (or an input run with POP_LIST=1)
// and files every planted-foot frame of one body (the rig's planted test: page.js analyse) under the state it was drawn in.
//   node slide-states.mjs <run.json> [body=me] [--list N]
// The state is the hero's tree state and the clip the mode holds over it (1v1's seam: result.states), else the clips playing (result.clips).
// Per state: planted frames, the share of them sliding over 3 cm, the slide's median / p90 (cm a frame), the root's median step (cm a
// frame), and the foot's median height over the body's floor (cm) — a "planted" foot 5 cm up is footGlide's lift, not a foot on the floor.
// Then what the gate would read with each state's frames taken out (which states hold the p90 up).
import fs from 'node:fs';
const args = process.argv.slice(2); const file = args[0]; const body = args.find((a, i) => i > 0 && !a.startsWith('--')) || 'me';
const listN = args.includes('--list') ? Number(args[args.indexOf('--list') + 1] || 30) : 0;
if (!file) { console.error('usage: node slide-states.mjs <run.json> [body] [--list N]'); process.exit(2); }
const R = JSON.parse(fs.readFileSync(file, 'utf8'));
const A = R.analysis || {}; const P = (A.perBody || {})[body] || (body === 'me' ? R.heroMotion : null);
if (!P || !P.slideAll) { console.error(`no slideAll for ${body}: record with POP_LIST=1 (and POSS_MOTION=1 on a poss run)`); process.exit(2); }
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
const r1 = (x) => (x === null ? '-' : (Math.round(x * 10) / 10).toFixed(1));
// the state at a frame: the last change at or before it
const states = (R.states || []).map((x) => ({ f: x[0], s: x[2] ? `${x[1]} + ${x[2]}` : x[1] }));
const clips = (R.clips || []).filter((x) => x[1] === body).map((x) => ({ f: x[0], s: x[2].replace(/:[0-9.]+/g, '').split(' ').slice(0, 2).join('+') || '(none)' }));
const at = (list, f) => { let lo = 0, hi = list.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (list[m].f <= f) { r = m; lo = m + 1; } else hi = m - 1; } return r < 0 ? '(before the log)' : list[r].s; };
const useStates = body === 'me' && states.length > 0;
const rows = P.slideAll.map(([f, foot, mm, rootMm, yMm, yoMm]) => ({ f, foot, cm: mm / 10, root: rootMm / 10, y: yMm / 10, yo: yoMm / 10, st: useStates ? at(states, f) : at(clips, f), clip: at(clips, f) }));
// the travel against the facing on each planted frame (the trace: the root's x, z and yaw every frame since the go) — which way the body
// was going while that foot slid: fwd (within 45 deg of the chest), side, back; and how fast
const TV = R.trace && R.trace.v && R.trace.v.length >= 12 ? R.trace.v : null;
if (TV && body === 'me') for (const r of rows) {
  const j = r.f; if (j < 1 || (j + 1) * 6 > TV.length) continue;
  const dx = TV[j * 6] - TV[(j - 1) * 6], dz = TV[j * 6 + 1] - TV[(j - 1) * 6 + 1], yaw = TV[j * 6 + 5];
  const sp = Math.hypot(dx, dz) * 60; if (sp < 0.3) { r.dir = 'still'; r.sp = sp; continue; }
  let a = Math.atan2(dx, dz) - yaw; a = ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  const d = Math.abs(a) * 180 / Math.PI; r.deg = Math.round(a * 180 / Math.PI); r.sp = sp;
  r.dir = d < 45 ? 'fwd' : d > 135 ? 'back' : a > 0 ? 'side-R' : 'side-L';
}
const all = rows.map((r) => r.cm);
console.log(`${file.split('/').slice(-1)[0]} — ${body}: ${rows.length} planted frames, slide p50 ${r1(pct(all, 0.5))} / p90 ${r1(pct(all, 0.9))} cm a frame (the rig's own p90: ${P.slideP90Cm}); over 3 cm: ${rows.filter((r) => r.cm > 3).length} (${r1(100 * rows.filter((r) => r.cm > 3).length / Math.max(1, rows.length))} %)`);
console.log(`state by: ${useStates ? 'the tree state (+ the held clip)' : 'the clips playing'}`);
const by = new Map(); for (const r of rows) { if (!by.has(r.st)) by.set(r.st, []); by.get(r.st).push(r); }
const tab = [...by.entries()].map(([st, a]) => ({ st, n: a.length, over: a.filter((r) => r.cm > 3).length, p50: pct(a.map((r) => r.cm), 0.5), p90: pct(a.map((r) => r.cm), 0.9), root: pct(a.map((r) => r.root), 0.5), y: pct(a.map((r) => r.y), 0.5), without: pct(rows.filter((r) => r.st !== st).map((r) => r.cm), 0.9) })).sort((a, b) => b.over - a.over);
console.log('state'.padEnd(46) + 'planted  >3cm   p50   p90  root/f  footUp  p90 without it');
for (const t of tab) console.log(`${t.st.slice(0, 45).padEnd(46)}${String(t.n).padStart(6)} ${String(t.over).padStart(6)} ${r1(t.p50).padStart(5)} ${r1(t.p90).padStart(5)} ${r1(t.root).padStart(6)} ${r1(t.y).padStart(7)} ${r1(t.without).padStart(8)}`);
if (TV && body === 'me') {
  console.log('\nby state and travel (against the chest): planted, over 3 cm, slide p90 cm, the root speed p50 m/s, the travel angle p50 (deg, + = body-right)');
  const by2 = new Map(); for (const r of rows) { const k = `${r.st} | ${r.dir || '?'}`; if (!by2.has(k)) by2.set(k, []); by2.get(k).push(r); }
  for (const [k, a] of [...by2.entries()].sort((x, y) => y[1].filter((r) => r.cm > 3).length - x[1].filter((r) => r.cm > 3).length)) console.log(`  ${k.slice(0, 60).padEnd(60)} ${String(a.length).padStart(5)} ${String(a.filter((r) => r.cm > 3).length).padStart(5)} ${r1(pct(a.map((r) => r.cm), 0.9)).padStart(6)} ${r1(pct(a.map((r) => r.sp || 0), 0.5)).padStart(5)} ${String(pct(a.filter((r) => r.deg !== undefined).map((r) => r.deg), 0.5) ?? '-').padStart(5)}`);
}
// an input run's defence-movement cases (drive.mjs TESTS=defmove): the slide inside each case's own window
if (R.tests && R.tests.defmove && R.tests.defmove.length) {
  console.log('\ndefence-movement cases: planted, over 3 cm, slide p50 / p90 cm a frame, the root p50 cm a frame, the states seen (frames)');
  for (const t of R.tests.defmove) { const a = rows.filter((r) => r.f >= t.f0 && r.f <= t.f1); const nm = `${t.dir}${t.turbo ? ' turbo' : ''}${t.hand ? ' + hand ' + t.hand : ''}`; console.log(`  ${nm.padEnd(26)} ${String(a.length).padStart(4)} ${String(a.filter((r) => r.cm > 3).length).padStart(4)} ${r1(pct(a.map((r) => r.cm), 0.5)).padStart(5)} ${r1(pct(a.map((r) => r.cm), 0.9)).padStart(5)} ${r1(pct(a.map((r) => r.root), 0.5)).padStart(5)}  ${Object.entries(t.states || {}).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(', ')}`); }
}
// how much of the over-3 cm set is a foot held up (footGlide's lift) against a foot on the floor
const over = rows.filter((r) => r.cm > 3);
console.log(`over 3 cm: ${over.filter((r) => r.y >= 3).length} with the foot 3 cm or more over the floor (lifted, moving with the body), ${over.filter((r) => r.y < 3).length} with it on the floor`);
if (listN) { console.log('\nthe worst frames: frame foot slide root/f footUp otherUp state | clips'); for (const r of [...rows].sort((a, b) => b.cm - a.cm).slice(0, listN)) console.log(`  ${r.f} ${r.foot ? 'R' : 'L'} ${r1(r.cm)} ${r1(r.root)} ${r1(r.y)} ${r1(r.yo)} ${r.st} | ${r.clip}`); }
