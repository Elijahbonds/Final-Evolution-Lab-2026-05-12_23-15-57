// hoops-items item 1: the step-back's press → motion and blend, and the space it buys, from the hoops-gather trial files
// (../hoops-gather/trials.mjs, SET=g3; the gather recorder keeps every drawn frame from 40 before the press).
//   node scripts/probes/hoops-items/stepback.mjs <out>/gather-*.json        one row per escape trial, then the medians per mode / kind
//   node scripts/probes/hoops-items/stepback.mjs --selftest                  a synthetic trial with closed-form answers (the control)
// Per trial (frames at the rig's fixed 1/60 s):
//   rec     the frame the mode logged the stick move (`[1V1|3V3-HANDLE] link stepback` / `move snatch_back`) − the press frame
//   move    the first frame the hero's root travels ≥ 1 cm in a frame AWAY from the rim (the hop's onset) − the press frame
//   v2      the first frame the root's speed away from the rim reaches 2 m/s − the press frame
//   clip5 / clip95   the first frame the step-back's clip (bball_stepback_gather / bball_snatch_back*) is drawn at ≥ 0.05 / ≥ 0.95 weight
//   gap0 / gap48     the nearest defender's planar distance at the press and 48 frames (0.8 s) later; gain = gap48 − gap0
//   late    the log's read: `he bit (…)` / `he is set` / '-' (no read logged)
import fs from 'node:fs';
const RIM = { x: 0, z: -0.6 };
const med = (a) => { const s = a.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
export function readTrial(tr) {
  const P = tr.pressF; const fr = tr.frames || []; const at = (f) => fr.find((x) => x.f === f);
  const f0 = at(P) || fr.find((x) => x.f >= P); if (!f0) return null;
  const awayDir = (r) => { const x = r[0] - RIM.x, z = r[2] - RIM.z; const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
  let move = null, v2 = null, clip5 = null, clip95 = null;
  for (let i = 1; i < fr.length; i++) {
    const a = fr[i - 1], b = fr[i]; if (b.f <= P) continue;
    const [ux, uz] = awayDir(a.r); const d = (b.r[0] - a.r[0]) * ux + (b.r[2] - a.r[2]) * uz;   // m this frame, away from the rim
    if (move == null && d >= 0.01) move = b.f - P;
    if (v2 == null && d * 60 >= 2) v2 = b.f - P;
    const w = Math.max(0, ...(b.clips || []).filter((c) => /stepback_gather|snatch_back/.test(c)).map((c) => +c.split(':').pop()));
    if (clip5 == null && w >= 0.05) clip5 = b.f - P;
    if (clip95 == null && w >= 0.95) clip95 = b.f - P;
  }
  const gap = (x) => (x && x.foe ? Math.hypot(x.foe[0] - x.r[0], x.foe[1] - x.r[2]) : null);
  const g48 = at(P + 48);
  const recL = (tr.log || []).find((l) => l[0] >= P - 1 && /link stepback|move snatch_back/.test(l[1]));
  const readL = (tr.log || []).find((l) => l[0] >= P - 1 && /escape stepback/.test(l[1]));
  const gap0 = gap(f0), gap48 = gap(g48);
  return { kind: tr.spec.kind, rec: recL ? recL[0] - P : null, move, v2, clip5, clip95,
    gap0: gap0 == null ? null : +gap0.toFixed(2), gap48: gap48 == null ? null : +gap48.toFixed(2),
    gain: gap0 != null && gap48 != null ? +(gap48 - gap0).toFixed(2) : null,
    read: readL ? (/he bit/.test(readL[1]) ? 'bit' : 'set') : '-' };
}
function selftest() {
  // a trial: the press at f 100, the stick move logged at 102, the root hops away from the rim from f 103 at 3 m/s, the clip in from f 102
  // over 8 frames, the man standing 1.1 m off on the rim side the whole time
  const frames = []; let x = 0, z = 5; const P = 100;
  for (let f = 60; f <= 180; f++) {
    if (f >= 103 && f < 121) z += 3 / 60;
    const w = f < 102 ? 0 : Math.min(1, (f - 101) / 8);
    frames.push({ f, r: [x, 0, z], foe: [x, 3.9], clips: w > 0 ? [`bball_stepback_gather:${w.toFixed(2)}`] : [] });
  }
  const r = readTrial({ spec: { kind: 'esc_stepback' }, pressF: P, frames, log: [[102, '[3V3-HANDLE] link stepback (chain 1, handle 60)']] });
  const want = { rec: 2, move: 3, v2: 3, clip5: 2, clip95: 9, gap0: 1.1, gap48: +(1.1 + 18 * 3 / 60).toFixed(2) };
  const bad = Object.entries(want).filter(([k, v]) => Math.abs(r[k] - v) > 1e-6);
  console.log(bad.length ? `SELFTEST FAIL ${JSON.stringify(bad)} got ${JSON.stringify(r)}` : `selftest ok ${JSON.stringify(r)}`);
  process.exit(bad.length ? 1 : 0);
}
if (process.argv[2] === '--selftest') selftest();
else {
  const groups = new Map();
  for (const f of process.argv.slice(2)) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const tr of j.trials || []) {
      if (!tr.frames || !/stepback|snatchback/.test(tr.spec.kind)) continue;
      const r = readTrial(tr); if (!r) continue;
      const key = `${j.mode} ${r.kind}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r);
      console.log(`${j.mode.padEnd(11)} ${j.tag.padEnd(8)} ${r.kind.padEnd(20)} rec ${r.rec} move ${r.move} v2 ${r.v2} clip ${r.clip5}/${r.clip95} gap ${r.gap0} → ${r.gap48} (${r.gain >= 0 ? '+' : ''}${r.gain}) read ${r.read}`);
    }
  }
  console.log('\nmedians (frames at 1/60 s; m)');
  for (const [k, rs] of groups) console.log(`${k.padEnd(34)} n ${rs.length}  rec ${med(rs.map((r) => r.rec))}  move ${med(rs.map((r) => r.move))}  v2 ${med(rs.map((r) => r.v2))}  clip ${med(rs.map((r) => r.clip5))}/${med(rs.map((r) => r.clip95))}  gain ${med(rs.map((r) => r.gain))}  (min ${Math.min(...rs.map((r) => r.gain ?? 9))}, max ${Math.max(...rs.map((r) => r.gain ?? -9))})`);
}
