// _idle-read — the dribble AT REST read off a motion-probe record (H3b, owner 2026-10-16: "idle dribbling felt off" — stiff, the
// bounce rhythm wrong, the ball and the hand don't meet, not reading the defense). For the hero's frames with a live dribble and the
// body still (root under 0.3 m/s), from the ball's first top on:
//   clips     the share of those frames in each clip (a handler at rest plays a dribble, not a defender's stance)
//   hz        bounces per second (ball tops)
//   topGap    at each ball top, the ball hand's palm to the ball's surface (cm; 0 = the hand is on the ball — it meets it)
//   handDrop  the ball hand's own drop per bounce (cm; the hand dribbles the ball, it does not hang beside it)
//   handLag   at each ball top, how far the hand's own top is from it (ms; 0 = the hand peaks as it catches the ball)
//   spacing   the root-to-root distance to the rival / his man (m; min and median): a defender ON the handler is inside 0.9
// and under pressure (the rival inside 1.5 m), the HOOPS MOTION plan's phase-9 gates ("Awareness A: eyes/head + shield"):
//   lookDef   the head's forward against his chest (deg, p50 / p90; the gate is p90 ≤ 20)
//   ballFar   the share of frames the ball is on the far side of the hips from him (gate ≥ 0.85)
//   bar       the share with the off forearm between the ball and him (gate ≥ 0.6) — the motion probe's own two reads
//   hipsDrop  the hips' median height at rest unpressured minus pressured (cm; gate ≥ 5)
// The ball hand is the drawn hand nearest the ball at the tops (the rigs are mirrored; its name is not its side).
//   npx tsx scripts/probes/_idle-read.mts <tag dir or rec json>...   (JSON=1 prints the numbers)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

type V3 = [number, number, number];
interface Frame { t: number; ball: V3; B: Record<string, { rp: V3; c: [string, number][]; dh?: Record<'L' | 'R', V3[]>; j?: V3[]; hf?: V3 }>; s?: { po?: string } }
interface Rec { action: string; frames: Frame[]; bodies?: Record<string, string[]> }
const recsOf = (p: string): string[] => statSync(p).isDirectory() ? readdirSync(p).filter((f) => /^rec-.*\.json$/.test(f)).map((f) => join(p, f)) : [p];
const med = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const r2 = (x: number, k = 100) => Math.round(x * k) / k;
const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const BALL_R = 0.12;
const JN = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'];

const out: Record<string, Record<string, unknown>> = {};
for (const arg of process.argv.slice(2)) for (const file of recsOf(arg)) {
  const rec = JSON.parse(readFileSync(file, 'utf8')) as Rec;
  const fr = rec.frames.filter((f) => f.B.me);
  // at rest: the root under 0.3 m/s (over the frame either side)
  const still = fr.map((f, i) => { const a = fr[Math.max(0, i - 1)], b = fr[Math.min(fr.length - 1, i + 1)]; const dt = (b.t - a.t) / 1000; return dt > 0 && Math.hypot(b.B.me.rp[0] - a.B.me.rp[0], b.B.me.rp[2] - a.B.me.rp[2]) / dt < 0.3; });
  // the ball's tops (a local max, at least 0.4 m over the floor — the dribble, not the held ball's jitter)
  const tops: number[] = [];
  for (let i = 1; i < fr.length - 1; i++) { const y = fr[i].ball[1]; if (y >= fr[i - 1].ball[1] && y > fr[i + 1].ball[1] && y > 0.6 && Math.min(...fr.slice(Math.max(0, i - 30), i).map((f) => f.ball[1])) < 0.4) tops.push(i); }
  if (tops.length < 2) { out[rec.action] = { note: 'no live dribble at rest' }; continue; }
  const from = tops[0];
  const rest = fr.map((_, i) => i >= from && still[i]);
  const hand = (f: Frame, h: 'L' | 'R') => f.B.me.dh?.[h]?.[0];
  const near = (['L', 'R'] as const).map((h) => tops.reduce((s, i) => s + (hand(fr[i], h) ? dist(hand(fr[i], h)!, fr[i].ball) : 9), 0));
  const bh: 'L' | 'R' = near[0] <= near[1] ? 'L' : 'R';
  const clips: Record<string, number> = {}; let n = 0;
  fr.forEach((f, i) => { if (!rest[i]) return; n++; const c = f.B.me.c?.[0]?.[0] ?? '-'; clips[c] = (clips[c] ?? 0) + 1; });
  for (const k of Object.keys(clips)) clips[k] = r2(clips[k] / n);
  const restTops = tops.filter((i) => rest[i]);
  const gaps = restTops.map((i) => { const p = hand(fr[i], bh); return p ? (dist(p, fr[i].ball) - BALL_R) * 100 : NaN; }).filter(Number.isFinite);
  const periods = restTops.slice(1).map((i, k) => (fr[i].t - fr[restTops[k]].t) / 1000).filter((p) => p > 0.25 && p < 1.5);
  // the hand's own drop and its top's lag, per bounce (between two ball tops)
  const drops: number[] = [], lags: number[] = [];
  for (let k = 0; k + 1 < restTops.length; k++) {
    const a = restTops[k], b = restTops[k + 1]; const ys = fr.slice(a, b + 1).map((f) => hand(f, bh)?.[1] ?? NaN);
    if (ys.some((y) => !Number.isFinite(y))) continue;
    drops.push((Math.max(...ys) - Math.min(...ys)) * 100);
    // the hand's top nearest this ball top (within half a bounce either side)
    const half = Math.floor((b - a) / 2), lo = Math.max(0, a - half), hi = Math.min(fr.length - 1, a + half);
    let best = a; for (let i = lo; i <= hi; i++) if ((hand(fr[i], bh)?.[1] ?? -9) > (hand(fr[best], bh)?.[1] ?? -9)) best = i;
    lags.push(fr[best].t - fr[a].t);
  }
  const foe = fr.map((f, i) => (rest[i] && f.B.foe ? Math.hypot(f.B.me.rp[0] - f.B.foe.rp[0], f.B.me.rp[2] - f.B.foe.rp[2]) : NaN)).filter(Number.isFinite);
  // phase 9: under pressure (the rival inside 1.5 m, me at rest with a live dribble)
  const J = (_who: string, name: string) => JN.indexOf(name);   // the record's joints are in the probe's fixed order (_hoops-motion-probe JN)
  const jm = { hips: J('me', 'Hips'), head: J('me', 'Head'), lf: J('me', 'LeftForeArm'), lh: J('me', 'LeftHand'), rf: J('me', 'RightForeArm'), rh: J('me', 'RightHand') }, jf = { hips: J('foe', 'Hips') };
  const looks: number[] = [], hipsP: number[] = [], hipsU: number[] = []; let pressured = 0, far = 0, bar = 0;
  fr.forEach((f, i) => {
    if (!still[i] || !f.B.foe || !f.B.me.j) return; const me = f.B.me, fo = f.B.foe; const d = Math.hypot(me.rp[0] - fo.rp[0], me.rp[2] - fo.rp[2]);
    const hips = me.j[jm.hips]; if (!hips) return;
    if (d > 1.5) { hipsU.push(hips[1]); return; }   // (the reference: any still frame unpressured — the check, before the dribble)
    if (!rest[i]) return;
    pressured++; hipsP.push(hips[1]);
    const fh = fo.j?.[jf.hips] ?? fo.rp; const toD: V3 = [fh[0] - hips[0], 0, fh[2] - hips[2]]; const bd: V3 = [f.ball[0] - hips[0], 0, f.ball[2] - hips[2]];
    if (toD[0] * bd[0] + toD[2] * bd[2] < 0) far++;
    const arms = [{ e: me.j[jm.lf], h: me.j[jm.lh] }, { e: me.j[jm.rf], h: me.j[jm.rh] }].filter((a) => a.e && a.h);
    if (arms.length === 2) { const off = arms.sort((x, y) => dist(y.h, f.ball) - dist(x.h, f.ball))[0]; const mid: V3 = [(off.e[0] + off.h[0]) / 2, (off.e[1] + off.h[1]) / 2, (off.e[2] + off.h[2]) / 2];
      const ab: V3 = [fh[0] - f.ball[0], fh[1] - f.ball[1], fh[2] - f.ball[2]], am: V3 = [mid[0] - f.ball[0], mid[1] - f.ball[1], mid[2] - f.ball[2]]; const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
      const t = L2 > 1e-9 ? Math.max(0, Math.min(1, (am[0] * ab[0] + am[1] * ab[1] + am[2] * ab[2]) / L2)) : 0; const q: V3 = [f.ball[0] + ab[0] * t, f.ball[1] + ab[1] * t, f.ball[2] + ab[2] * t];
      if (dist(mid, q) < 0.35 && t > 0.05 && t < 0.95) bar++; }
    const head = me.j[jm.head]; if (head && me.hf) { const to: V3 = [fo.rp[0] - head[0], fo.rp[1] + 1.25 - head[1], fo.rp[2] - head[2]]; const c = (me.hf[0] * to[0] + me.hf[1] * to[1] + me.hf[2] * to[2]) / (Math.hypot(...me.hf) * Math.hypot(...to)); looks.push((Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI); }
  });
  const p90 = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))]; };
  out[rec.action] = {
    restFrames: n, clips, hz: r2(1 / med(periods)), topGap_cm: r2(med(gaps), 10), topGapMax_cm: r2(Math.max(...gaps), 10),
    handDrop_cm: r2(med(drops), 10), handLag_ms: Math.round(med(lags)), spacingMin_m: r2(Math.min(...foe)), spacingMed_m: r2(med(foe)), ballHand: bh,
    pressured, lookDefP50_deg: Math.round(med(looks)), lookDefP90_deg: Math.round(p90(looks)), ballFar: pressured ? r2(far / pressured) : NaN, bar: pressured ? r2(bar / pressured) : NaN,
    hipsDrop_cm: r2((med(hipsU) - med(hipsP)) * 100, 10),
  };
}
if (process.env.JSON === '1') console.log(JSON.stringify(out));
else for (const [k, v] of Object.entries(out)) { console.log(k); for (const [a, b] of Object.entries(v)) console.log(`  ${a.padEnd(14)} ${typeof b === 'object' ? JSON.stringify(b) : b}`); }
