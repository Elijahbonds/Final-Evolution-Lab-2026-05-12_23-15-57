// move-feel / analyze — reads feel-ext.mjs's run JSON(s) and prints the per-test table (lane/move-feel, 2026-11-12).
//   node scripts/probes/move-feel/analyze.mjs <run.json> [<run.json> ...] [--md] [--series <out.json>]
// Per test (a stick timeline on the real mode, every drawn frame): the root's speed (its own step × 60), the onset (2 cm), 90 % of the
// pace a segment settles at, the stop (under 0.15 m/s; metres slid), the turn (frames until the travel is within 10° of where the stick
// points ON THE COURT — the stick is camera-relative, so the wish is rebuilt each frame from the camera's flat axes as camRel does), how
// far a CONSTANT stick's court direction turned while it was held (the camera orbiting), the camera's yaw rate and follow distance, the
// hero's drift on screen, and page.js's own pops and planted-foot slide over the same frames (by anim state). --series writes the
// per-frame speed / slide / camera rows ./sheet.py charts.
//   node analyze.mjs --selftest      the analyser on a synthetic run with known answers
import fs from 'node:fs';

const C = { f: 0, x: 1, z: 2, yaw: 3, lfx: 4, lfy: 5, lfz: 6, rfx: 7, rfy: 8, rfz: 9, cx: 10, cy: 11, cz: 12, fx: 13, fy: 14, fz: 15, fov: 16, ndx: 17, ndy: 18, sx: 19, sy: 20, tb: 21 };
const R2D = 180 / Math.PI;
const wrap = (a) => { while (a > 180) a -= 360; while (a < -180) a += 360; return a; };
const pct = (a, p) => { const s = a.filter((v) => Number.isFinite(v)).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const r2 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

export function analyseTest(t) {
  const R = t.rows; const n = R.length; if (n < 3) return { name: t.name, frames: n };
  const sp = new Array(n).fill(0), hd = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) { const dx = R[i][C.x] - R[i - 1][C.x], dz = R[i][C.z] - R[i - 1][C.z]; sp[i] = Math.hypot(dx, dz) * 60; hd[i] = Math.atan2(dx, dz) * R2D; }
  // the stick's wish on the court: the camera's flat forward f and right r (LH: r = (f.z, -f.x)); stick +y is DOWN, so forward = -sy
  const wish = (i) => { const fx = R[i][C.fx], fz = R[i][C.fz]; const L = Math.hypot(fx, fz) || 1; const f = [fx / L, fz / L], r = [f[1], -f[0]]; const mx = R[i][C.sx], my = -R[i][C.sy]; return [f[0] * my + r[0] * mx, f[1] * my + r[1] * mx]; };
  const camYaw = (i) => Math.atan2(R[i][C.fx], R[i][C.fz]) * R2D;
  const marks = t.ev.filter((e) => typeof e[1] === 'string' && !/^(clips|state|err) /.test(e[1])).map(([f, m]) => ({ f, m, i: R.findIndex((row) => row[C.f] > f) }));   // the first frame drawn after the mark was sent
  const segs = marks.map((mk, k) => ({ ...mk, end: k + 1 < marks.length ? marks[k + 1].i : n }));
  const out = { name: t.name, side: t.side, frames: n, segs: {} };
  for (const s of segs) {
    if (s.i < 0) continue;
    const S = { from: s.i, to: s.end };
    const stick = [R[s.i][C.sx], R[s.i][C.sy]]; const held = Math.hypot(...stick) > 0.05;
    const p0 = [R[Math.max(0, s.i - 1)][C.x], R[Math.max(0, s.i - 1)][C.z]];
    if (held) {
      const on = R.slice(s.i, s.end).findIndex((row) => Math.hypot(row[C.x] - p0[0], row[C.z] - p0[1]) > 0.02); S.onsetF = on >= 0 ? on + 1 : null;
      const seg = sp.slice(s.i, s.end); const settle = seg.slice(-10).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(10, seg.length)); S.settleMps = r2(settle);
      const k90 = seg.findIndex((v) => v >= 0.9 * settle); S.to90ms = k90 >= 0 ? Math.round((k90 + 1) * 1000 / 60) : null;
      S.peakMps = r2(Math.max(...seg)); S.minMps = r2(Math.min(...seg.slice(1)));
      // the turn: frames until the travel is within 10° of the stick's court direction (moving > 0.5 m/s)
      const errs = []; for (let i = s.i; i < s.end; i++) { const w = wish(i); if (sp[i] > 0.5) errs.push(Math.abs(wrap(hd[i] - Math.atan2(w[0], w[1]) * R2D))); else errs.push(180); }
      const kin = errs.findIndex((e) => e < 10); S.within10ms = kin >= 0 ? Math.round((kin + 1) * 1000 / 60) : null;
      S.errEndDeg = r2(errs.slice(-6).reduce((a, b) => a + b, 0) / Math.min(6, errs.length));
      // a CONSTANT stick: how far its court direction turned while held (the camera orbiting), and the travel's own turn
      const w0 = wish(s.i), w1 = wish(s.end - 1); S.wishTurnDeg = r2(wrap(Math.atan2(w1[0], w1[1]) * R2D - Math.atan2(w0[0], w0[1]) * R2D));
      const a = Math.min(s.end - 1, s.i + 20), b = s.end - 1; S.travelTurnDeg = r2(Number.isFinite(hd[a]) && Number.isFinite(hd[b]) ? wrap(hd[b] - hd[a]) : null);
      S.camTurnDeg = r2(wrap(camYaw(s.end - 1) - camYaw(s.i)));
      // the largest one-frame speed change (m/s²) inside the segment
      let acc = 0, dec = 0; for (let i = s.i + 1; i < s.end; i++) { const d = (sp[i] - sp[i - 1]) * 60; acc = Math.max(acc, d); dec = Math.max(dec, -d); }
      S.maxAccel = Math.round(acc); S.maxDecel = Math.round(dec);
    } else {
      const seg = sp.slice(s.i, s.end); const k = seg.findIndex((v) => v < 0.15); S.stopMs = k >= 0 ? Math.round((k + 1) * 1000 / 60) : null;
      const e = k >= 0 ? s.i + k : s.end - 1; S.stopM = r2(Math.hypot(R[e][C.x] - p0[0], R[e][C.z] - p0[1])); S.fromMps = r2(sp[Math.max(1, s.i - 1)]);
    }
    out.segs[s.m] = S;
  }
  // the camera over the test
  const cyr = []; for (let i = 1; i < n; i++) cyr.push(Math.abs(wrap(camYaw(i) - camYaw(i - 1))) * 60);
  const camD = R.map((row) => Math.hypot(row[C.cx] - row[C.x], row[C.cz] - row[C.z]));
  const ndx = R.map((row) => row[C.ndx]), ndy = R.map((row) => row[C.ndy]);
  out.camera = { yawP50: r2(pct(cyr, 0.5)), yawP99: r2(pct(cyr, 0.99)), yawMax: r2(Math.max(...cyr)), distMin: r2(Math.min(...camD)), distMax: r2(Math.max(...camD)), heroNdcXRange: r2(Math.max(...ndx) - Math.min(...ndx)), heroNdcYRange: r2(Math.max(...ndy) - Math.min(...ndy)), fovMin: r2(Math.min(...R.map((r) => r[C.fov])) * R2D), fovMax: r2(Math.max(...R.map((r) => r[C.fov])) * R2D) };
  // states and clips by frame (for the slide and pop breakdown)
  const stateAt = (f) => { let s = '-'; for (const e of t.ev) { if (e[0] > f) break; if (/^state /.test(e[1])) s = e[1].slice(6); } return s; };
  const slides = (t.slideAll || []).map(([f, foot, mm, rootMm]) => ({ f, foot, cm: mm / 10, rootCm: rootMm / 10, st: stateAt(f) }));
  const byState = {}; for (const s of slides) (byState[s.st] ||= []).push(s.cm);
  out.slide = { p90Cm: t.slideP90Cm, planted: t.plantedFrames, skates5cm: t.skates, byState: Object.fromEntries(Object.entries(byState).map(([k, v]) => [k, { n: v.length, p90Cm: r2(pct(v, 0.9)), maxCm: r2(Math.max(...v)) }])) };
  // the skate ratio over moving frames: the planted foot's travel over the root's (0 = glued, 1 = the foot slides as fast as the body)
  const mv = slides.filter((s) => s.rootCm > 0.8); out.slide.skateRatioMoving = mv.length ? r2(mv.reduce((a, s) => a + s.cm, 0) / mv.reduce((a, s) => a + s.rootCm, 0)) : null;
  out.pops = { n: t.pops, severe: t.severe, perMin: r2(t.pops / (n / 3600)), list: (t.popList || []).slice(0, 12).map(([f, b, d]) => `${b} ${d}°/s @${f} ${stateAt(f)}`) };
  out.pageCamera = t.camera;
  out.series = { sp: sp.map(r2), slide: Array.from({ length: n }, (_, i) => { const f = R[i][C.f]; const s = slides.filter((q) => q.f === f); return s.length ? r2(Math.max(...s.map((q) => q.cm))) : null; }), camYawRate: [0, ...cyr.map(r2)], marks: segs.filter((s) => s.i >= 0).map((s) => [s.i, s.m]), f0: R[0][C.f] };
  return out;
}

function selftest() {
  // a synthetic run: from rest, 1 m/s² for 30 frames then 4 m/s; the camera turning 1° a frame; the stick (1, 0)
  const rows = []; let x = 0, v = 0; const ev = [[99, 'go']];
  for (let i = 0; i < 90; i++) { v = i < 30 ? Math.min(4, v + 8 / 60) : 4; x += v / 60; const cy = i * Math.PI / 180; rows.push([100 + i, x, 0, 0, x, 0.05, 0, x, 0.3, 0, x, 2, -6, Math.sin(cy), 0, Math.cos(cy), 0.8, 0, 0, 1, 0, 0]); }
  const a = analyseTest({ name: 'self', side: 'off', rows, ev, slideAll: [], popList: [], pops: 0, severe: 0 });
  const g = a.segs.go; const ok = [g.settleMps === 4, Math.abs(g.camTurnDeg - 89) < 0.01, g.onsetF === 5, g.to90ms === 450, g.wishTurnDeg === 89];   // closed form: x_i = 0.1333·(i+1)(i+2)/120 m, 2 cm past row 0 at row 4 (onset 5 frames); v ≥ 3.6 at row 26 (27 frames, 450 ms); the constant stick's court direction turns with the camera
  console.log(JSON.stringify(g), ok); process.exit(ok.every(Boolean) ? 0 : 1);
}

if (process.argv[1] && process.argv[1].endsWith('analyze.mjs')) {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) selftest();
  const files = args.filter((a) => a.endsWith('.json') && !a.startsWith('--')); const si = args.indexOf('--series'); const seriesOut = si >= 0 ? args[si + 1] : null;
  const all = {};
  for (const f of files) {
    if (f === seriesOut) continue;
    const j = JSON.parse(fs.readFileSync(f, 'utf8')); const tag = `${j.mode}${j.feel ? '+feel' : ''}:${f.split('/').pop().replace(/\.json$/, '')}`;
    all[tag] = (j.mf?.tests || []).map(analyseTest);
  }
  for (const [tag, tests] of Object.entries(all)) {
    console.log(`\n## ${tag}`);
    for (const t of tests) {
      console.log(`\n${t.name} (${t.side}, ${t.frames} frames)  pops ${t.pops?.n} (${t.pops?.perMin}/min, severe ${t.pops?.severe})  slide p90 ${t.slide?.p90Cm} cm, skate ratio ${t.slide?.skateRatioMoving}  cam yaw p50/p99/max ${t.camera?.yawP50}/${t.camera?.yawP99}/${t.camera?.yawMax} °/s, dist ${t.camera?.distMin}–${t.camera?.distMax} m, fov ${t.camera?.fovMin}–${t.camera?.fovMax}°, hero ndc x range ${t.camera?.heroNdcXRange}`);
      for (const [m, s] of Object.entries(t.segs || {})) console.log(`  ${m.padEnd(8)} ${JSON.stringify(s)}`);
      console.log(`  slide by state ${JSON.stringify(t.slide?.byState)}`);
      if (t.pops?.list?.length) console.log(`  pops: ${t.pops.list.join(' | ')}`);
    }
  }
  if (seriesOut) fs.writeFileSync(seriesOut, JSON.stringify(Object.fromEntries(Object.entries(all).map(([k, ts]) => [k, ts.map((t) => ({ name: t.name, series: t.series, segs: t.segs }))]))));
}
