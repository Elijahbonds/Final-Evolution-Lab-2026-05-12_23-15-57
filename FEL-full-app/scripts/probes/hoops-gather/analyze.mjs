// hoops-gather: the numbers, from the raw frames ./trials.mjs wrote (no browser).
//
//   node scripts/probes/hoops-gather/analyze.mjs <gather-*.json> [more.json …] [--md] [--trials] [--worst N]
//   node scripts/probes/hoops-gather/analyze.mjs --selftest        (the analyser against a synthetic trial with known answers)
//
// Per trial, from the press (the first drawn frame that could answer it) to the release or the end of the escape:
//   pick       frames from the press to the ball being parented to a hand (the dribble let go of it: ballRig.gatherBallToHand)
//   phase      where the bounce was on the press frame: the ball's height (m) and vertical speed (m/s), and the phase asked for
//   gap        the ball's SURFACE to the nearer PALM (hand bone + 8 cm along forearm → hand, as hoops-gap/page.js measures it), cm, on
//              the pick frame, and the frames until it is seated (≤ 5 cm); ballStep = the most the ball moves in one frame while it
//              is eased in (cm); up = its fastest climb (m/s); yank = picked below 0.45 m and lifted ≥ 0.3 m inside 6 frames
//   handShare  of the gap closed between the pick and the seat, the share the HAND closed (in the root's frame): 1 = the hand went
//              to the ball, 0 = the ball flew to a still hand
//   arm        hard pops (gameplay-clean/popCount.mjs, the counter's own rule: a pop ≥ 600°/s and ≥ 3.5× its ±6-frame median, events
//              within 10 frames grouped, HARD ≥ 1500°/s) on the 18 recorded bones over [press − 20, release + 20]; and every
//              shoulder / arm / forearm / hand turn > 25° in one frame (the audit's bar), with the bone and the clips around it
//   feet       the planted foot's slide (cm a frame: low within 5 cm of this trial's 5th-percentile foot height, the lower foot,
//              not rising) over the same window: p90, max, frames over 3 cm
//   rise       press → release (ms); the ball's biggest re-drop after it started up (cm: a second dip is a hitch); the root's speed at
//              the press and its lowest before the release
//   escape     (an escape trial) the move the log names, the gap at its catch, and the separation from the nearest defender:
//              at the press and 0.8 s later (m)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countPops, qang } from '../gameplay-clean/popCount.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));

const PALM_M = 0.08, BALL_R = 0.12;
const r1 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };
const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export function palmOf(fr, side) {
  const h = side === 'L' ? fr.lh : fr.rh, f = side === 'L' ? fr.lfa : fr.rfa; if (!h || !f) return null;
  const dx = h[0] - f[0], dy = h[1] - f[1], dz = h[2] - f[2]; const L = Math.hypot(dx, dy, dz) || 1;
  return [h[0] + dx / L * PALM_M, h[1] + dy / L * PALM_M, h[2] + dz / L * PALM_M];
}
export function gapOf(fr, side) { const p = palmOf(fr, side); return p && fr.b ? d3(fr.b, p) - BALL_R : null; }
export function gapMin(fr) { const a = gapOf(fr, 'L'), b = gapOf(fr, 'R'); return a === null ? b : b === null ? a : Math.min(a, b); }
const ARM = /Shoulder|Arm|Hand/;

export function analyseTrial(tr, bones) {
  let F = tr.frames || [];
  // the trial ends at the first CUT after the press: a root that jumps > 0.5 m in a frame (a reset) or the possession leaving me
  { const p0 = F.findIndex((x) => x.f >= tr.pressF); if (p0 > 0) for (let i = p0 + 1; i < F.length; i++) { const a = F[i].r, b = F[i - 1].r; if (Math.hypot(a[0] - b[0], a[2] - b[2]) > 0.5 || (F[i].poss && F[p0].poss && F[i].poss !== F[p0].poss)) { F = F.slice(0, i); break; } }
    for (let i = p0 - 1; i > 0; i--) { const a = F[i].r, b = F[i - 1].r; if (Math.hypot(a[0] - b[0], a[2] - b[2]) > 0.5) { F = F.slice(i); break; } } }
  const out = { kind: tr.spec?.kind, phaseAsked: tr.spec?.phase, phaseHit: tr.phaseHit, dist: tr.distAtPress, notes: tr.notes || [] };
  if (!F.length) return { ...out, failed: tr.failed || 'no frames' };
  const ix = F.findIndex((x) => x.f >= tr.pressF); if (ix < 1) return { ...out, failed: 'press not in frames' };
  const P = F[ix];
  // what the mode did with the press (its own log line)
  const L = (tr.log || []).filter((l) => l[0] >= tr.pressF - 2);
  const moveLine = L.find((l) => /drive contest (dunk|poster|standing)|\[(1V1|3V3)-(MOVE|SHOT)\] (gather|footwork|finish)|\[(1V1|3V3)-DUNK\]|PAUSIN|\] dunk |startDunk|\[(1V1|3V3)-(STICK|HANDLE)\] (move|stick)/i.test(l[1]))
    || L.find((l) => /\[(1V1|3V3)-(MOVE|SHOT|STICK|HANDLE|DUNK)\]/.test(l[1]) && !/guard hand crosses/.test(l[1]));
  out.did = moveLine ? moveLine[1].replace(/^\[[^\]]+\] /, '').slice(0, 70) : '(no move line)';
  out.didF = moveLine ? moveLine[0] - tr.pressF : null;
  // the bounce at the press
  // (the bounce is read on the last frame drawn BEFORE the press could be answered: on the press frame the mode has already acted)
  const B0 = F[ix - 1], pv = F[Math.max(0, ix - 2)];
  out.ballY = B0.b ? r2(B0.b[1]) : null; out.ballVy = B0.b && pv.b ? r2((B0.b[1] - pv.b[1]) * 60) : null;
  out.heldAtPress = B0.hold === 'L' || B0.hold === 'R';
  // the phase the press MET (measured, whatever was asked): held, or the bounce's top band (≥ 0.85 m), floor band (≤ 0.35 m), falling, rising
  out.phaseAt = out.heldAtPress ? 'held' : out.ballY === null ? '?' : out.ballY >= 0.85 ? 'top' : out.ballY <= 0.35 ? 'floor' : out.ballVy < 0 ? 'down' : 'up';
  out.gapAtPressCm = r1(gapMin(B0) * 100);
  // the pick-up
  let pk = -1; for (let i = ix; i < F.length; i++) if (F[i].hold === 'L' || F[i].hold === 'R') { pk = i; break; }
  if (out.heldAtPress) { let k = ix - 1; while (k > 0 && (F[k - 1].hold === 'L' || F[k - 1].hold === 'R')) k--; out.heldSinceF = F[k].f - tr.pressF; }
  if (pk >= 0) {
    const K = F[pk]; out.pickF = K.f - tr.pressF; out.pickHand = K.hold; out.pickBallY = r2(K.b[1]);
    // (hoops-gather G1) how far the picking palm went DOWN to the ball between the press and the pick (the hand meeting the ball)
    { const a = palmOf(F[ix - 1], K.hold), b = palmOf(K, K.hold); out.handDownCm = a && b ? r1((a[1] - b[1]) * 100) : null; }
    out.gapAtPickCm = r1(gapOf(K, K.hold) * 100);
    let seat = -1, stepMax = 0, upMax = 0, stepAt = null;
    for (let i = pk; i < Math.min(F.length, pk + 40); i++) {
      const x = F[i]; if (!(x.hold === 'L' || x.hold === 'R')) break;
      const g = gapOf(x, x.hold); if (seat < 0 && g !== null && g <= 0.05) seat = i;
      if (i > pk && F[i - 1].b && x.b) { const s = d3(x.b, F[i - 1].b); if (s > stepMax) { stepMax = s; stepAt = x.f - tr.pressF; } upMax = Math.max(upMax, (x.b[1] - F[i - 1].b[1]) * 60); }
      if (seat >= 0 && i > seat + 4) break;
    }
    out.seatF = seat >= 0 ? F[seat].f - tr.pressF : null; out.ballStepMaxCm = r1(stepMax * 100); out.ballStepAtF = stepAt; out.ballUpMaxMps = r2(upMax);
    const lift6 = F[Math.min(F.length - 1, pk + 6)].b[1] - K.b[1];
    out.yank = K.b[1] < 0.45 && lift6 >= 0.3;
    out.gapTrailCm = F.slice(pk, pk + 10).map((x) => r1(gapMin(x) * 100));
    if (seat > pk) {   // who closed the gap: the hand or the ball (root frame)
      const loc = (v, x) => [v[0] - x.r[0], v[1] - x.r[1], v[2] - x.r[2]];
      const S = F[seat]; const bK = loc(K.b, K), pK = loc(palmOf(K, K.hold), K), pS = loc(palmOf(S, K.hold), S), bS = loc(S.b, S);
      const handClosed = Math.max(0, d3(bK, pK) - d3(bK, pS)), ballMoved = d3(bS, bK);
      out.handShare = r2(handClosed / Math.max(1e-6, handClosed + ballMoved));
    }
  }
  // the release (the ball leaves the hand after the pick)
  let rel = -1; if (pk >= 0) for (let i = pk + 1; i < F.length; i++) if (F[i].hold === '-' && (F[i - 1].hold === 'L' || F[i - 1].hold === 'R')) { rel = i; break; }
  out.releaseMs = rel >= 0 ? Math.round((F[rel].f - tr.pressF) * 1000 / 60) : null;
  if (pk >= 0) {   // a second dip: after the ball started up from its pick, the most it falls again before the release
    let top = -Infinity, reDrop = 0; const end = rel >= 0 ? rel : Math.min(F.length, pk + 60);
    let started = false; for (let i = pk + 1; i < end; i++) { const y = F[i].b[1]; if (y > F[i - 1].b[1] + 0.005) started = true; if (started) { top = Math.max(top, y); reDrop = Math.max(reDrop, top - y); } }
    out.reDropCm = r1(reDrop * 100);
    let pathMax = 0; for (let i = pk + 1; i < end; i++) pathMax = Math.max(pathMax, d3(F[i].b, F[i - 1].b)); out.heldPathMaxCm = r1(pathMax * 100);
  }
  const sp = (i) => (i > 0 ? Math.hypot(F[i].r[0] - F[i - 1].r[0], F[i].r[2] - F[i - 1].r[2]) * 60 : 0);
  out.speedAtPress = r2(sp(ix)); { const end = rel >= 0 ? rel : Math.min(F.length - 1, ix + 40); let lo = Infinity; for (let i = ix; i <= end; i++) lo = Math.min(lo, sp(i)); out.speedMinToRelease = r2(lo); }
  // the window for the body reads
  // the body window starts 2 frames before the press: what the APPROACH's dribble did (the auto hand change, the run loop's own pops — the
  // audit's sinker 1) is not the gather's, and is reported apart (approachHard: the 20 frames before)
  { const A = F.slice(Math.max(1, ix - 22), ix - 1); const ci = new Map(); const cl = []; const AA = A.map((x) => { if (!ci.has(x.clips)) { ci.set(x.clips, cl.length); cl.push(x.clips); } return { t: x.t / 1000, ph: 'playing', q: x.q, r: x.r, c: ci.get(x.clips) }; }); out.approachHard = A.length > 14 ? countPops(AA, cl, bones).hard.length : null; }
  const w0 = Math.max(1, ix - 8), w1 = Math.min(F.length - 1, (rel >= 0 ? rel : ix + 60) + 20);
  const W = F.slice(w0, w1 + 1); const clipIdx = new Map(); const clips = [];
  const FF = W.map((x) => { if (!clipIdx.has(x.clips)) { clipIdx.set(x.clips, clips.length); clips.push(x.clips); } return { t: x.t / 1000, ph: 'playing', q: x.q, r: x.r, c: clipIdx.get(x.clips) }; });
  const pc = countPops(FF, clips, bones);
  out.hardPops = pc.hard.filter((e) => W[e.i].f >= tr.pressF - 2).length; out.pops = pc.pops.length;
  out.pressHard = pc.hard.filter((e) => W[e.i].f >= tr.pressF - 2 && W[e.i].f <= tr.pressF + 6).length;   // the dribble → gather blend itself
  out.hardList = pc.hard.filter((e) => W[e.i].f >= tr.pressF - 2).slice(0, 4).map((e) => ({ at: W[e.i].f - tr.pressF, peakDegS: e.peak, bones: [...e.bones].join('+'), from: e.from.slice(0, 60), to: e.to.slice(0, 60) }));
  let worst = null; let over25 = 0;
  for (let i = 1; i < W.length; i++) for (let b = 0; b < bones.length; b++) {
    if (!ARM.test(bones[b]) || W[i].f < tr.pressF - 2) continue; const a = qang(W[i].q[b], W[i - 1].q[b]); if (a === null) continue;
    if (a > 25) over25++;
    if (!worst || a > worst.deg) worst = { deg: r1(a), bone: bones[b], at: W[i].f - tr.pressF, from: W[i - 1].clips.slice(0, 70), to: W[i].clips.slice(0, 70) };
  }
  out.armOver25 = over25; out.armWorst = worst;
  // feet
  const fy = []; for (const x of F) { if (x.lf) fy.push(x.lf[1]); if (x.rf) fy.push(x.rf[1]); }
  const floorY = pct(fy, 0.05) ?? 0.06; const slides = [];
  for (let i = w0; i <= w1; i++) {
    const x = F[i], p = F[i - 1]; if (!p) continue;
    for (const [a, o] of [['lf', 'rf'], ['rf', 'lf']]) {
      if (!x[a] || !p[a]) continue; const y = x[a][1];
      if (y < floorY + 0.05 && (!x[o] || y <= x[o][1]) && !(y - p[a][1] > 0.002)) { const sl = Math.hypot(x[a][0] - p[a][0], x[a][2] - p[a][2]); if (sl < 0.5) slides.push(sl); }   // (a foot that moves half a metre in a frame is a reset, not a slide)
    }
  }
  out.slideP90Cm = r1((pct(slides, 0.9) ?? 0) * 100); out.slideMaxCm = r1(Math.max(0, ...slides) * 100); out.slideOver3 = slides.filter((s) => s > 0.03).length;
  // escapes: separation from the nearest defender
  if (tr.spec?.escape) {
    const sep = (x) => (x.foe ? Math.hypot(x.foe[0] - x.r[0], x.foe[1] - x.r[2]) : null);
    const sep2 = (x) => (x.foe2 ? Math.hypot(x.foe2[0] - x.r[0], x.foe2[1] - x.r[2]) : null);
    const at = F[Math.min(F.length - 1, ix + 48)];
    out.sepAtPress = r2(sep(P)); out.sepAfter08 = r2(sep(at)); out.sepGain = out.sepAtPress !== null && out.sepAfter08 !== null ? r2(out.sepAfter08 - out.sepAtPress) : null;
    if (tr.spec?.trap) { out.trapped = !!tr.trapped; out.sep2AtPress = r2(sep2(P)); out.sep2After08 = r2(sep2(at)); out.stillHas = at.hold !== 'O'; }
    // the move's root travel over the 0.8 s and its direction against the nearest defender (away = +)
    { const dx = at.r[0] - P.r[0], dz = at.r[2] - P.r[2]; out.travel08 = r2(Math.hypot(dx, dz)); }
    // the move's own catch: the hand gap at its worst over the move (the ball is the carry's: a path, not parented)
    const g = F.slice(ix, Math.min(F.length, ix + 45)).map((x) => gapMin(x)).filter((v) => v !== null);
    out.moveGapMaxCm = r1(Math.max(...g) * 100);
    const lines = (tr.log || []).filter((l) => l[0] >= tr.pressF - 1 && /\[(1V1|3V3)-(STICK|HANDLE|MOVE)\]/.test(l[1]) && !/guard hand crosses/.test(l[1]));
    out.did = lines.length ? lines[0][1].replace(/^\[[^\]]+\] /, '').slice(0, 70) : out.did;
  }
  return out;
}

export function controlCheck(o) {
  // THE CONTROL: this analyser's palm gap at each dribble top against the hoops-gap recorder's own (page.js apexList) on the same frames
  const C = o.control; if (!C) return null;
  const by = new Map(C.idle.frames.map((x) => [x.f, x]));
  const pairs = [];
  // (page.js labels a recorded frame HG.f0 + i, but its record i = 0 is drawn on HG.f0 + 1 — HG.frame is incremented before record() —
  // so its frame N is this recorder's N + 1. Measured: with the +1 the two agree to 0.05 cm at every top; without it, up to 13 cm.)
  for (const [fRig, body, hand, cm] of C.hgBall.apexList || []) { const f = fRig + 1; const x = by.get(f); if (!x || body !== 'me') continue; const mine = gapOf(x, hand); if (mine !== null) pairs.push([f, cm, r1(mine * 100)]); }
  const diffs = pairs.map((p) => Math.abs(p[1] - p[2]));
  return { tops: pairs.length, maxDiffCm: r2(Math.max(0, ...diffs)), pairs: pairs.slice(0, 8), rigPops: C.hgMe?.pops ?? null, rigSlideP90Cm: C.hgMe?.slideP90Cm ?? null };
}

function selftest() {
  // a synthetic trial: standing, the ball falling to the floor, pressed at the bottom; parented 2 frames later 60 cm off the palm, eased
  // in over 8 frames; the right forearm turns 40° in one frame at +5; the left foot slides 4 cm on a planted frame at +3
  const bones = ['Hips', 'LeftArm', 'RightForeArm'];
  const qz = (deg) => { const h = deg * Math.PI / 360; return [0, 0, Math.sin(h), Math.cos(h)]; };
  const F = [];
  for (let k = -30; k <= 60; k++) {
    const f = 1000 + k; const hand = [0.3, 0.95, 0], fa = [0.3, 1.2, 0];   // palm = hand + 8 cm down = (0.3, 0.87, 0)
    let b, hold = '-';
    if (k < 2) b = [0.3, Math.max(0.12, 0.87 - 0.02 * (k + 30)), 0];
    else { hold = 'R'; const u = Math.min(1, (k - 2) / 8); b = [0.3, 0.27 + (0.87 + BALL_R - 0.27) * u, 0]; }
    const lfx = k === 3 ? 0.04 : k > 3 ? 0.04 : 0;
    F.push({ f, t: f * 1000 / 60, ph: 'playing', r: [0, 0, 0], q: [qz(0), qz(0), qz(k >= 5 ? 40 : 0)], lh: [-0.3, 0.95, 0], rh: hand, lfa: [-0.3, 1.2, 0], rfa: fa, lf: [lfx - 0.15, 0.06, 0], rf: [0.15, 0.09, 0], b, hold, clips: k >= 5 ? 'b' : 'a', foe: [0, 2] });
  }
  const t = analyseTrial({ spec: { kind: 'synthetic', phase: 'floor' }, pressF: 1000, frames: F, log: [[1000, '[1V1-SHOT] gather jumper']] }, bones);
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
  ok(t.pickF === 2, `pick 2 frames after the press (got ${t.pickF})`);
  ok(Math.abs(t.gapAtPickCm - 48) < 1, `gap at the pick 48 cm (0.87 − 0.27 − 0.12; got ${t.gapAtPickCm})`);
  ok(t.seatF === 7, `seated 7 frames after the press (the gap ≤ 5 cm once the centre is within 17 cm of the palm: 0.27 + 0.72·5/8 = 0.72 m; got ${t.seatF})`);
  ok(t.yank === true, 'picked below 0.45 m and lifted fast: a yank');
  ok(t.armWorst && t.armWorst.deg === 40 && t.armWorst.bone === 'RightForeArm' && t.armWorst.at === 5, `the 40° forearm frame at +5 (got ${JSON.stringify(t.armWorst)})`);
  ok(t.hardPops === 1, `one hard pop event (got ${t.hardPops})`);
  ok(t.slideMaxCm === 4, `the 4 cm planted slide (got ${t.slideMaxCm})`);
  ok(t.handShare === 0, `the hand did not move: handShare 0 (got ${t.handShare})`);
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) { selftest(); process.exit(); }
  const md = args.includes('--md'); const showTrials = args.includes('--trials');
  const files = args.filter((a) => a.endsWith('.json'));
  const rows = []; const controls = [];
  for (const f of files) {
    const o = JSON.parse(fs.readFileSync(f, 'utf8'));
    const cc = controlCheck(o); if (cc) controls.push({ file: path.basename(f), mode: o.mode, ...cc });
    if (o.control) rows.push({ mode: o.mode, ...analyseTrial(o.control.idle, o.bones), kind: 'control-idle' });
    for (const tr of o.trials) rows.push({ mode: o.mode, file: path.basename(f), ...analyseTrial(tr, o.bones) });
  }
  if (showTrials) for (const r of rows) console.log(JSON.stringify(r));
  // the table: per mode × kind (× phase for the gathers)
  const groups = new Map();
  for (const r of rows) { if (r.failed) continue; const k = `${r.mode}|${r.kind}|${r.phaseAt ?? '-'}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const med = (a) => { const v = a.filter((x) => x !== null && x !== undefined && Number.isFinite(x)); return v.length ? pct(v, 0.5) : null; };
  const mx = (a) => { const v = a.filter((x) => x !== null && x !== undefined && Number.isFinite(x)); return v.length ? Math.max(...v) : null; };
  const head = ['mode', 'kind', 'phase', 'n', 'did (first)', 'ball y @press', 'press→pick f', 'gap @pick cm', 'seat f', 'ball step max cm', 'yank', 'hand share', 'hard pops (press blend)', 'arm >25°/frame', 'worst arm °/frame', 'slide p90 / max cm', 'press→release ms', 're-drop cm'];
  const lines = [];
  for (const [k, rs] of [...groups.entries()].sort()) {
    const [mode, kind, phase] = k.split('|');
    const w = rs.reduce((a, r) => (r.armWorst && (!a || r.armWorst.deg > a.deg) ? r.armWorst : a), null);
    lines.push([mode, kind, phase, rs.length, rs[0].did?.slice(0, 34), r2(med(rs.map((r) => r.ballY))), med(rs.map((r) => r.pickF)), r1(mx(rs.map((r) => r.gapAtPickCm))), mx(rs.map((r) => r.seatF)), r1(mx(rs.map((r) => r.ballStepMaxCm))), rs.filter((r) => r.yank).length, r2(med(rs.map((r) => r.handShare))), `${rs.reduce((a, r) => a + (r.hardPops || 0), 0)} (${rs.reduce((a, r) => a + (r.pressHard || 0), 0)})`, rs.reduce((a, r) => a + (r.armOver25 || 0), 0), w ? `${w.deg} ${w.bone}` : null, `${r1(med(rs.map((r) => r.slideP90Cm)))} / ${r1(mx(rs.map((r) => r.slideMaxCm)))}`, med(rs.map((r) => r.releaseMs)), r1(mx(rs.map((r) => r.reDropCm)))]);
  }
  if (md) { console.log('| ' + head.join(' | ') + ' |'); console.log('|' + head.map(() => '---').join('|') + '|'); for (const l of lines) console.log('| ' + l.map((x) => (x === null || x === undefined ? '—' : x)).join(' | ') + ' |'); }
  else { console.log(head.join('\t')); for (const l of lines) console.log(l.join('\t')); }
  const esc = rows.filter((r) => /^(esc|trap)_/.test(r.kind) && !r.failed);
  if (esc.length) { console.log('\nescapes:'); for (const r of esc) console.log(`  ${r.mode} ${r.kind}: ${r.did} | sep ${r.sepAtPress} → ${r.sepAfter08} (${r.sepGain})${r.sep2AtPress != null ? ` 2nd ${r.sep2AtPress} → ${r.sep2After08}${r.trapped ? '' : ' (no double came)'}` : ''} | travel ${r.travel08} m | move gap max ${r.moveGapMaxCm} cm | hard ${r.hardPops} | worst arm ${r.armWorst?.deg} ${r.armWorst?.bone} | slide p90 ${r.slideP90Cm} max ${r.slideMaxCm}`); }
  if (controls.length) { console.log('\ncontrol (this analyser vs the hoops-gap recorder at the dribble tops, same frames):'); for (const c of controls) console.log('  ' + JSON.stringify(c)); }
  const failed = rows.filter((r) => r.failed); if (failed.length) console.log(`\n${failed.length} trial(s) failed: ` + failed.map((r) => `${r.kind}:${r.failed}`).join(', '));
}

// ── --pooled: the doc's two tables, every valid trial of every file pooled (a trial whose press found no live ball to pick is left out)
export function pooled(rows) {
  const ok = rows.filter((r) => !r.failed && !/^(esc|trap)_|control/.test(r.kind) && r.pickF !== undefined && r.pickF !== null);
  const med = (a) => { const v = a.filter((x) => x !== null && x !== undefined && Number.isFinite(x)); return v.length ? pct(v, 0.5) : null; };
  const mx = (a) => { const v = a.filter((x) => x !== null && x !== undefined && Number.isFinite(x)); return v.length ? Math.max(...v) : null; };
  const line = (rs) => ({ n: rs.length, gapMed: r1(med(rs.map((r) => r.gapAtPickCm))), gapMax: r1(mx(rs.map((r) => r.gapAtPickCm))), seatMed: med(rs.map((r) => r.seatF)), seatMax: mx(rs.map((r) => r.seatF)), unseated: rs.filter((r) => r.seatF === null || r.seatF === undefined).length, yank: rs.filter((r) => r.yank).length, handShareMed: r2(med(rs.map((r) => r.handShare))), handDownMed: r1(med(rs.map((r) => r.handDownCm))), pickMed: med(rs.map((r) => r.pickF)), pickMax: mx(rs.map((r) => r.pickF)),
    hard: rs.reduce((a, r) => a + (r.hardPops || 0), 0), pressHard: rs.reduce((a, r) => a + (r.pressHard || 0), 0), over25: rs.reduce((a, r) => a + (r.armOver25 || 0), 0), armWorst: r1(mx(rs.map((r) => r.armWorst?.deg))), slideP90: r1(med(rs.map((r) => r.slideP90Cm))), slideMax: r1(mx(rs.map((r) => r.slideMaxCm))), relMed: med(rs.map((r) => r.releaseMs)), reDropMed: r1(med(rs.map((r) => r.reDropCm))), reDropMax: r1(mx(rs.map((r) => r.reDropCm))) });
  const by = (key) => { const m = new Map(); for (const r of ok) { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return [...m.entries()].sort().map(([k, rs]) => ({ k, ...line(rs) })); };
  return { byPhase: by((r) => `${r.mode}|${r.phaseAt}`), byKind: by((r) => `${r.mode}|${r.kind}`), all: line(ok) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--pooled')) {
  const rows = []; for (const f of process.argv.slice(2).filter((a) => a.endsWith('.json'))) { const o = JSON.parse(fs.readFileSync(f, 'utf8')); for (const tr of o.trials) rows.push({ mode: o.mode, ...analyseTrial(tr, o.bones) }); }
  const P = pooled(rows); const cols = ['k', 'n', 'gapMed', 'gapMax', 'seatMed', 'seatMax', 'unseated', 'yank', 'handShareMed', 'handDownMed', 'pickMed', 'pickMax', 'hard', 'pressHard', 'over25', 'armWorst', 'slideP90', 'slideMax', 'relMed', 'reDropMed', 'reDropMax'];
  for (const [name, t] of [['by phase', P.byPhase], ['by kind', P.byKind]]) { console.log(`\n${name}\n` + cols.join('\t')); for (const x of t) console.log(cols.map((c) => x[c] ?? '—').join('\t')); }
  console.log('\nall', JSON.stringify(P.all));
}
