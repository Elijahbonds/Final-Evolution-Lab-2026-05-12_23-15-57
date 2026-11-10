// hoops-p05: is the rig deterministic? Compare the driver's JSON from runs of ONE build, seed and config.
//   node determinism.mjs <run1.json> <run2.json> [run3.json ...]
// Compares, against the first run: the frame count; the sequence (every log line with its frame); the pops and severe pops per body and
// the planted-foot slide (when the run recorded motion); and the per-frame trace (page.js: the root / ball digest, the drawn-bone digest,
// the random numbers drawn in a frame and outside one). Prints the first frame that differs and which of the four moved first, with the
// log lines around it on both runs. Exit 0 = identical on every count, 1 = not.
import fs from 'node:fs';
const files = process.argv.slice(2);
if (files.length < 2) { console.error('usage: node determinism.mjs <run1.json> <run2.json> [...]'); process.exit(2); }
const runs = files.map((f) => ({ f, R: JSON.parse(fs.readFileSync(f, 'utf8')) }));
// The sequence: every log line with its frame. Lines logged ON THE SAME FRAME are compared as a set (sorted): the order inside one frame
// is the order async callbacks resolved in — the announcer's lines are logged when each clip's playback promise settles (ModeMic
// logCue, after VoiceKit.playEx), which follows the audio decode, not the game (seed 7: the same three lines on frame 7 of every run, in
// three orders). The raw order is still compared and reported (`order`).
// THE ANNOUNCER is compared apart from the game: its lines' WORDS come from a director seeded with a random number drawn when its voice
// files finish decoding (ModeMic.load, after the go, at a wall-timed point in the out-of-frame stream), so the same moment can be called
// with another line (3v3 seed 7: crowd_a on frame 7, "Here we go now!" / "This is the one!"). The game sequence leaves [MIC] lines out;
// who spoke on which frame is still compared (micWho), and differing words are reported, not hidden.
const isMic = (m) => /^\[MIC\]/.test(m);
const micWho = (R) => (R.log || []).filter((l) => isMic(l.m)).map((l) => `${l.f} ${l.m.split(':')[0].replace(/\b(crowd|hooper)_[a-z]\b/, '$1')}`).sort();   // the ROLE (crowd_c -> crowd: which crowd voice is the seed's pick too)
const seqOf = (R) => { const by = new Map(); for (const l of (R.log || []).filter((x) => !isMic(x.m))) { if (!by.has(l.f)) by.set(l.f, []); by.get(l.f).push(l.m); } return [...by.entries()].sort((a, b) => a[0] - b[0]).flatMap(([f, ms]) => ms.sort().map((m) => `${f} ${m}`)); };
const rawSeqOf = (R) => (R.log || []).map((l) => `${l.f} ${l.m}`);
const hash = (a) => { let h = 2166136261; for (const s of a) { const x = String(s); for (let i = 0; i < x.length; i++) h = Math.imul(h ^ x.charCodeAt(i), 16777619) >>> 0; h = Math.imul(h ^ 10, 16777619) >>> 0; } return h.toString(16).padStart(8, '0'); };
const motion = (R) => { const P = (R.analysis && R.analysis.perBody) || (R.heroMotion ? { me: R.heroMotion } : null); if (!P) return null; const o = {}; for (const [id, b] of Object.entries(P)) o[id] = `${b.pops}/${b.severe} slide ${b.slideP90Cm}`; return o; };
const row = ({ f, R }) => { const T = R.trace || { n: 0, root: [], bone: [], rf: [], rl: [] }; return { file: f.split('/').slice(-1)[0], frames: R.frames ?? null, startFrame: R.startFrame ?? null, logLines: (R.log || []).length, seq: hash(seqOf(R)), order: hash(rawSeqOf(R)), mic: hash(micWho(R)), micWords: hash((R.log || []).filter((l) => isMic(l.m)).map((l) => `${l.f} ${l.m}`).sort()), root: hash(T.root), bone: hash(T.bone), rand: `${T.rf[T.n - 1] ?? '-'}/${T.rl[T.n - 1] ?? '-'}`, lateReq: (R.lateRequests || []).length, poss: (R.poss || []).map((p) => `${p.side}:${p.f0}-${p.f1}`).join(' '), motion: JSON.stringify(motion(R)), errors: (R.pageErrors || []).length + (R.hgErrors || []).length }; };
const rows = runs.map(row);
console.log('run                                          frames start log  seq      order    root     bone     rand(in/out) lateReq errors');
for (const r of rows) console.log(`${r.file.slice(0, 44).padEnd(44)} ${String(r.frames).padEnd(6)} ${String(r.startFrame).padEnd(5)} ${String(r.logLines).padEnd(4)} ${r.seq} ${r.order} ${r.root} ${r.bone} ${r.rand.padEnd(12)} ${r.lateReq}       ${r.errors}`);
for (const r of rows) console.log(`  ${r.file.slice(0, 44)}: possessions ${r.poss || '-'}; pops/severe + slide p90 cm per body ${r.motion}`);
let same = true, partial = false;
const A = runs[0].R, TA = A.trace || { n: 0 };
for (let k = 1; k < runs.length; k++) {
  const Bn = runs[k].R, TB = Bn.trace || { n: 0 }; const n = Math.min(TA.n, TB.n);
  let first = -1, what = [];
  for (let i = 0; i < n; i++) { const d = []; if (TA.root[i] !== TB.root[i]) d.push('root/ball'); if (TA.bone[i] !== TB.bone[i]) d.push('bones'); if (TA.rf[i] !== TB.rf[i]) d.push('random in frame'); if (TA.rl[i] !== TB.rl[i]) d.push('random outside a frame'); if (d.length) { first = i; what = d; break; } }
  const sa = seqOf(A), sb = seqOf(Bn); let ls = -1; for (let i = 0; i < Math.max(sa.length, sb.length); i++) if (sa[i] !== sb[i]) { ls = i; break; }
  const ident = first < 0 && TA.n === TB.n && ls < 0 && rows[0].motion === rows[k].motion && rows[0].frames === rows[k].frames;
  if ((A.cutByWall || Bn.cutByWall) && first < 0) {   // a run stopped by its wall cap: only the frames both have can be compared
    const la = seqOf({ log: (A.log || []).filter((l) => l.f <= n) }), lb = seqOf({ log: (Bn.log || []).filter((l) => l.f <= n) });
    const okLog = la.length === lb.length && la.every((x, i) => x === lb[i]);
    console.log(`\n${rows[k].file} vs ${rows[0].file}: ${okLog ? 'IDENTICAL' : 'trace identical, LOG DIFFERS'} over the ${n} frames both ran (a run was cut by its wall cap; pops not compared)`);
    if (!okLog) same = false; partial = true; continue;
  }
  const micNote = rows[0].mic !== rows[k].mic ? ' — the ANNOUNCER called on other frames (not the same calls)' : rows[0].micWords !== rows[k].micWords ? ' — the announcer made the same calls on the same frames with other VOICES or WORDS (its seed: see isMic)' : '';
  if (rows[0].mic !== rows[k].mic) same = false;
  if (ident) { const ord = rows[0].order === rows[k].order; console.log(`\n${rows[k].file} vs ${rows[0].file}: IDENTICAL over ${TA.n} frames (trace, game sequence, pops)${ord ? '' : ' — the log lines inside a frame came in another order (async callbacks; see seqOf)'}${micNote}`); continue; }
  same = false;
  console.log(`\n${rows[k].file} vs ${rows[0].file}: DIFFERENT`);
  if (TA.n !== TB.n) console.log(`  trace length ${TA.n} vs ${TB.n}`);
  if (first >= 0) {
    const f = first + 1;   // the trace's index i is frame i + 1 (the frame counter is bumped before the trace is taken)
    console.log(`  first trace difference at frame ${f}: ${what.join(', ')}`);
    const v = (T, i) => (T.v ? T.v.slice(i * 6, i * 6 + 6).join(' ') : '');
    for (let i = Math.max(0, first - 2); i <= Math.min(n - 1, first + 2); i++) console.log(`    f${i + 1}  A rand ${TA.rf[i]}/${TA.rl[i]} [me x z | foe x z | ball y | me yaw] ${v(TA, i)}   B rand ${TB.rf[i]}/${TB.rl[i]} ${v(TB, i)}`);
    for (const [nm, R] of [['A', A], ['B', Bn]]) { console.log(`  ${nm} log around it:`); for (const l of (R.log || []).filter((x) => x.f >= f - 40 && x.f <= f + 6)) console.log(`    ${l.f} ${l.m.slice(0, 150)}`); }
    for (const [nm, R] of [['A', A], ['B', Bn]]) { const st = ((R.rand && R.rand.stacks) || []).filter((x) => x[0] >= f - 2 && x[0] <= f + 1); if (st.length) { console.log(`  ${nm} random draws on frames ${f - 2}..${f + 1}:`); for (const x of st.slice(0, 40)) console.log(`    f${x[0]} ${x[1]} ${x[2]}`); } }
  }
  if (ls >= 0) console.log(`  first log difference at line ${ls}:\n    A ${sa[ls] ?? '(none)'}\n    B ${sb[ls] ?? '(none)'}`);
  if (rows[0].motion !== rows[k].motion) console.log(`  pops differ:\n    A ${rows[0].motion}\n    B ${rows[k].motion}`);
}
for (const { f, R } of runs) if ((R.lateRequests || []).length) console.log(`\n${f.split('/').slice(-1)[0]}: requests made after the go (a load that lands on a wall-chosen frame):\n` + R.lateRequests.slice(0, 20).map((x) => `  +${x[0]} ms ${x[1]}`).join('\n'));
console.log(same ? (partial ? '\nIDENTICAL SO FAR (a run was cut short: not a full proof)' : '\nDETERMINISTIC: every run identical') : '\nNOT DETERMINISTIC');
process.exit(same ? 0 : 1);
