// start — when the run started, three ways (SPRINT-SPEED, 2026-10-25).
//
//   (a) "Go" from this phone      goPlan: "On your marks", "Set", then a random hold and the Go beep. The run starts AT
//                                 the Go, as a starter's gun does, so the time INCLUDES the athlete's reaction (gates
//                                 started by the athlete's own first movement do not): every result says which. The
//                                 phone at the finish line is `distanceM` from the athlete, so the beep reaches them
//                                 distance ÷ 343 m/s later (0.12 s over 40 yd): goStart adds that, and the browser's
//                                 own output delay when it reports one.
//   (b) first movement in frame   detectOnset: the body point's stillness is measured, and the first frame it leaves
//                                 that stillness for good is found; then the run's first frames are fitted as a body
//                                 starting from rest (displacement ∝ (t − t0)², so √displacement is a straight line in
//                                 t) and t0 is that line's zero — earlier than the frame that crossed the threshold,
//                                 which is how far the body had already moved.
//   (c) another phone             lib/sprint/sync.ts: the start phone's Go or first movement, on this phone's clock.
//
// Pure.
import { SOUND_MPS, sr } from './PROPOSED-sprint';
import type { Pt } from './geometry';

export type StartKind = 'go' | 'movement' | 'phone';

export interface StartRead {
  kind: StartKind;
  /** The start (ms, the frames' clock). */
  t: number;
  /** ±1 SD (ms). */
  sdMs: number;
  /** The time includes the athlete's reaction to the Go. */
  reactionIncluded: boolean;
}

// ── (a) the Go ──

export interface GoPlan {
  /** Seconds from the tap: "On your marks", "Set", "Go". */
  marksS: number;
  setS: number;
  goS: number;
}

/** The calls' timing: marks now, set 2.5 s later, then a hold the athlete cannot predict. */
export function goPlan(rand: () => number = Math.random): GoPlan {
  const lo = sr('sprint.goHoldMinS'), hi = sr('sprint.goHoldMaxS');
  const hold = lo + (hi - lo) * Math.min(1, Math.max(0, rand()));
  return { marksS: 0, setS: 2.5, goS: 2.5 + Math.round(hold * 1000) / 1000 };
}

/**
 * The start from the Go: when the beep left the phone (`goAt`, ms), the output delay the browser reported (or null), and
 * how far the athlete stood from the phone (m; 0 when the phone is at the start).
 */
export function goStart(o: { goAt: number; outputLatencyMs: number | null; distanceM: number }): StartRead {
  const travelMs = (Math.max(0, o.distanceM) / SOUND_MPS) * 1000;
  const lat = o.outputLatencyMs !== null && Number.isFinite(o.outputLatencyMs) && o.outputLatencyMs >= 0 ? o.outputLatencyMs : 0;
  const latSd = o.outputLatencyMs === null ? sr('sprint.audioLatencySdMs') : 2;
  const travelSd = o.distanceM > 0 ? (sr('sprint.startDistanceSdM') / SOUND_MPS) * 1000 : 0;
  return { kind: 'go', t: o.goAt + lat + travelMs, sdMs: Math.hypot(latSd, travelSd), reactionIncluded: true };
}

// ── (b) first movement ──

export interface PointSample { t: number; p: Pt | null }

export type OnsetResult = ({ ok: true } & StartRead & { stillSd: number; frameMs: number }) | { ok: false; why: string };

/**
 * The first movement of a body that stood still in frame. `aspect` puts x and y in picture heights. `from` (ms): only
 * samples at or after it (the arming tap).
 */
export function detectOnset(samples: readonly PointSample[], aspect: number, from = -Infinity): OnsetResult {
  const s = samples.filter((x) => x.t >= from && x.p && Number.isFinite(x.p.x) && Number.isFinite(x.p.y)) as { t: number; p: Pt }[];
  const still = Math.max(3, Math.round(sr('sprint.stillFrames')));
  if (s.length < still + 3) return { ok: false, why: 'The athlete was not in the picture, standing still, before the start.' };
  const frameMs = (s[s.length - 1].t - s[0].t) / (s.length - 1);
  const k = sr('sprint.onsetK'), minD = sr('sprint.onsetMin'), sustain = Math.max(1, Math.round(sr('sprint.onsetSustain')));
  // the stillness: grows while the point stays inside it, so a long wait is measured on all of it
  let n = still;
  const stats = (m: number) => {
    let cx = 0, cy = 0;
    for (let i = 0; i < m; i++) { cx += s[i].p.x * aspect; cy += s[i].p.y; }
    cx /= m; cy /= m;
    let v = 0;
    for (let i = 0; i < m; i++) v += (s[i].p.x * aspect - cx) ** 2 + (s[i].p.y - cy) ** 2;
    return { cx, cy, sd: Math.sqrt(v / Math.max(1, m - 1) / 2) };
  };
  let st = stats(n);
  const disp = (i: number) => Math.hypot(s[i].p.x * aspect - st.cx, s[i].p.y - st.cy);
  const thr = () => Math.max(k * st.sd, minD);
  let j = -1;
  for (let i = n; i < s.length; i++) {
    if (disp(i) <= thr()) {
      if (i === n && i < s.length - 1) { n = i + 1; st = stats(n); }
      continue;
    }
    let held = true;
    for (let q = 1; q < sustain; q++) if (!s[i + q] || disp(i + q) <= thr()) held = false;
    if (held) { j = i; break; }
  }
  if (j < 0) return { ok: false, why: 'No start was seen: the athlete did not move off the mark in the picture.' };
  // the way it went: the mean position over the next onsetFitMs, from the stillness
  const fitMs = sr('sprint.onsetFitMs');
  const ahead = s.filter((x, i) => i >= j && x.t <= s[j].t + fitMs);
  const mx = ahead.reduce((q, x) => q + x.p.x * aspect, 0) / ahead.length - st.cx;
  const my = ahead.reduce((q, x) => q + x.p.y, 0) / ahead.length - st.cy;
  const ml = Math.hypot(mx, my) || 1;
  const along = (i: number) => ((s[i].p.x * aspect - st.cx) * mx + (s[i].p.y - st.cy) * my) / ml;
  // from rest: displacement ∝ (t − t0)², so √displacement is straight in t. Fit the frames from the threshold to
  // onsetFitMs past it (at least sustain + 2), on the along-the-run displacement only (the up-down jitter adds nothing)
  const pts: { t: number; r: number }[] = [];
  for (let i = j; i < s.length && (pts.length < sustain + 2 || s[i].t <= s[j].t + fitMs); i++) {
    const d = along(i);
    if (d > 0) pts.push({ t: s[i].t, r: Math.sqrt(d) });
  }
  const m = pts.length;
  const tb = pts.reduce((q, p) => q + p.t, 0) / m, rb = pts.reduce((q, p) => q + p.r, 0) / m;
  let stt = 0, str = 0;
  for (const p of pts) { stt += (p.t - tb) ** 2; str += (p.t - tb) * (p.r - rb); }
  const slope = stt > 0 ? str / stt : 0;
  const prevT = s[j - 1]?.t ?? s[j].t - frameMs;
  let t0 = slope > 0 ? tb - rb / slope : prevT;
  // never after the frame that crossed the threshold, never before the stillness ended by more than onsetFitMs
  t0 = Math.min(s[j].t, Math.max(prevT - fitMs, t0));
  let rss = 0;
  for (const p of pts) rss += (p.r - (rb + slope * (p.t - tb))) ** 2;
  const resSd = m > 2 ? Math.sqrt(rss / (m - 2)) : 0;
  const fitSd = slope > 0 && stt > 0 ? (resSd / slope) * Math.sqrt(1 / m + (t0 - tb) ** 2 / stt) : frameMs;
  const sdMs = Math.hypot(fitSd, frameMs / Math.sqrt(12));
  return { ok: true, kind: 'movement', t: t0, sdMs, reactionIncluded: false, stillSd: st.sd, frameMs };
}
