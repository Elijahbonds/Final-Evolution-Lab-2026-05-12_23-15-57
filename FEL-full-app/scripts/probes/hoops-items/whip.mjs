// hoops-items item 6: the behind-the-back's hand whip and the hop step's planted feet, from the hoops-gather trial files (the gather
// recorder keeps, per drawn frame, 18 bones' LOCAL quaternions — page-gather.js BONES — the feet's world points and the active clips).
//   node scripts/probes/hoops-items/whip.mjs <out>/gather-*.json [--kinds=esc_btb,esc_retreat,hop]
//   node scripts/probes/hoops-items/whip.mjs --selftest
// Per trial, over the press −5 … +60 frames:
//   turn   each bone's worst turn in one frame (deg), the frame (from the press) and the clips drawn then; the hands and forearms listed
//   feet   a foot is PLANTED on a frame when its ankle is under 0.12 m on that frame and the one before; its slide is the planar distance it
//          moved between them (cm). p90 and the worst, per trial, over the press … +40 frames (the gather / the move)
import fs from 'node:fs';
/** the recorder's clips: one string, 'name:weight' joined by spaces (an array in the selftest) */
const clipsOf = (x) => (Array.isArray(x) ? x : String(x || '').split(' ').filter(Boolean));
const BONES = ['Hips', 'Spine2', 'Neck', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'Head'];
const deg = (a, b) => { if (!a || !b) return 0; const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]); return 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI; };
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
export function readTrial(tr, floorY = 0) {
  const P = tr.pressF; const fr = (tr.frames || []).filter((x) => x.f >= P - 5 && x.f <= P + 60);
  const worst = BONES.map(() => ({ d: 0, at: null, clips: '' }));
  for (let i = 1; i < fr.length; i++) {
    const a = fr[i - 1], b = fr[i]; if (b.f !== a.f + 1) continue;
    BONES.forEach((n, j) => { const d = deg(a.q[j], b.q[j]); if (d > worst[j].d) worst[j] = { d, at: b.f - P, clips: clipsOf(b.clips).join(' ') }; });
  }
  const slides = { L: [], R: [] };
  for (let i = 1; i < fr.length; i++) {
    const a = fr[i - 1], b = fr[i]; if (b.f !== a.f + 1 || b.f - P < 0 || b.f - P > 40) continue;
    for (const [k, key] of [['L', 'lf'], ['R', 'rf']]) {
      const pa = a[key], pb = b[key]; if (!pa || !pb) continue;
      if (pa[1] - floorY < 0.12 && pb[1] - floorY < 0.12) slides[k].push(Math.hypot(pb[0] - pa[0], pb[2] - pa[2]) * 100);
    }
  }
  const all = [...slides.L, ...slides.R];
  return { kind: tr.spec.kind, phase: tr.spec.phase, turns: Object.fromEntries(BONES.map((n, j) => [n, { deg: +worst[j].d.toFixed(0), at: worst[j].at, clips: worst[j].clips }])),
    slideP90: all.length ? +pct(all, 0.9).toFixed(1) : null, slideMax: all.length ? +Math.max(...all).toFixed(1) : null, planted: all.length };
}
function selftest() {
  // a trial: the right hand turns 120° in one frame at press +20, every other bone still; the left foot planted and sliding 5 cm a frame
  // for frames +1 … +10, then lifted; the right foot planted and still
  const P = 100, frames = [];
  const qz = (dg) => { const r = dg * Math.PI / 360; return [0, 0, Math.sin(r), Math.cos(r)]; };
  for (let f = P - 10; f <= P + 70; f++) {
    const q = BONES.map(() => [0, 0, 0, 1]); if (f >= P + 20) q[10] = qz(120);
    const lx = f <= P + 10 ? (f - P) * 0.05 : 0.5;
    frames.push({ f, q, lf: [lx, f <= P + 10 ? 0.08 : 0.3, 0], rf: [0.3, 0.08, 0], clips: f >= P + 20 ? ['bball_behind_back_left:1.0'] : [] });
  }
  const r = readTrial({ spec: { kind: 'esc_btb', phase: 'any' }, pressF: P, frames });
  const ok = Math.abs(r.turns.RightHand.deg - 120) < 0.5 && r.turns.RightHand.at === 20 && r.turns.LeftHand.deg === 0 && Math.abs(r.slideMax - 5) < 0.01 && r.slideP90 === 5;
  console.log(ok ? `selftest ok ${JSON.stringify({ hand: r.turns.RightHand, p90: r.slideP90, max: r.slideMax })}` : `SELFTEST FAIL ${JSON.stringify(r)}`);
  process.exit(ok ? 0 : 1);
}
if (process.argv[2] === '--selftest') selftest();
else {
  const kindsArg = process.argv.find((a) => a.startsWith('--kinds='));
  const kinds = kindsArg ? new Set(kindsArg.slice(8).split(',')) : null;
  const groups = new Map();
  for (const f of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const tr of j.trials || []) {
      if (!tr.frames || (kinds && !kinds.has(tr.spec.kind))) continue;
      const r = readTrial(tr);
      const key = `${j.mode} ${j.tag} ${r.kind}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(r);
      const top = Object.entries(r.turns).filter(([n]) => /Hand|ForeArm/.test(n)).sort((a, b) => b[1].deg - a[1].deg).slice(0, 2);
      console.log(`${j.mode.padEnd(11)} ${j.tag.padEnd(5)} ${r.kind.padEnd(12)} ${String(r.phase).padEnd(5)} worst arm ${top.map(([n, t]) => `${n} ${t.deg}° @${t.at} [${t.clips.slice(0, 60)}]`).join(' | ')} | feet p90 ${r.slideP90} max ${r.slideMax} cm (${r.planted} planted)`);
    }
  }
  console.log('\nper group: the hands\' and forearms\' worst one-frame turn (median and max over trials), planted-foot slide p90 (median) and worst');
  for (const [k, rs] of groups) {
    const arm = (n) => rs.map((r) => r.turns[n].deg);
    const cols = ['LeftHand', 'RightHand', 'LeftForeArm', 'RightForeArm'].map((n) => `${n} ${pct(arm(n), 0.5)}/${Math.max(...arm(n))}`).join(' · ');
    console.log(`${k.padEnd(36)} n ${rs.length} · ${cols} · feet p90 ${pct(rs.map((r) => r.slideP90 ?? 0), 0.5)} worst ${Math.max(...rs.map((r) => r.slideMax ?? 0))} cm`);
  }
}
