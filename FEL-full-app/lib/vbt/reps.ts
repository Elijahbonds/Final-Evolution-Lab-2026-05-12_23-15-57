// lib/vbt/reps.ts — VBT (2026-10-25): a set's track → its reps (eccentric, pause, concentric, lockout) and their speeds.
//
// SEGMENTATION. A candidate is a run of samples rising faster than V_EDGE whose peak reaches V_PEAK_MIN; two runs split by
// a sticking point (a dip for under MERGE_GAP_MS with the bar not dropping more than MERGE_DROP_M) are one rep. Its
// BOTTOM is the lowest smoothed point since the previous rep's top, its TOP the highest before the next candidate. The
// edges are read where the bar is δ off the bottom / top (δ = the larger of EDGE_MIN_M, EDGE_ROM_SHARE of the range and
// 3 SD of the smoothed position — above the jitter, so a noisy pause never stretches a rep) and carried to zero speed
// under a constant acceleration (Δt = 2δ / v): exact for a bar that starts and stops smoothly, and no threshold trims or
// pads the rep. A range under the lift's minRomM is not a rep at all (a re-grip, the walk-out); a range under
// PARTIAL_SHARE of the set's own range is a PARTIAL: listed, not counted, and left out of the velocity loss. The
// eccentric is the fall from the previous top to this bottom, edged the same way; the pause is the gap between them,
// and a pause under BOUNCE_MS after a lowering is a bounce.
//
// METRICS (docs/VBT-BENCHMARK.md §2): MCV = range ÷ concentric time; PV = the peak smoothed upward speed; MPV = the
// mean up to the first moment after the peak that the bar decelerates faster than gravity (a < −g), else the MCV;
// velocity loss = (the fastest counted rep so far − this rep) ÷ the fastest, in %.
//
// THE ± (95 %, every number is an estimate): the position jitter through the smoothing (√2·σ/√n over the time), the
// frame clock at both edges (a period/√6), the ruler's own SD, and — for a hand or a joint standing in for the load —
// POSE_BAR_SD. No band is a validity claim: that waits for the pilot (docs/VBT-BENCHMARK.md T6).
//
// Pure.
import type { Lift } from './lifts';
import { framePeriodMs, halfWindowMs, kinematics, median, type Kin } from './signal';
import { BOUNCE_MS, EDGE_MIN_M, EDGE_ROM_SHARE, G, MERGE_DROP_M, MERGE_GAP_MS, PARTIAL_SHARE, POSE_BAR_SD, V_EDGE, V_PEAK_MIN } from './thresholds';
import type { Track } from './track';

export interface Rep {
  /** 1-based, over every rep found (partials included). */
  index: number;
  counted: boolean;
  partial: boolean;
  /** The concentric's start and end (lockout) on the camera's clock (ms). */
  startT: number;
  endT: number;
  /** The eccentric before it (ms), its duration and mean speed (m/s, positive), or nulls (a deadlift's first pull). */
  eccStartT: number | null;
  eccMs: number | null;
  eccMcv: number | null;
  pauseMs: number | null;
  bounce: boolean;
  romM: number;
  mcv: number;
  pv: number;
  mpv: number;
  propulsiveMs: number;
  /** ± (95 %) of each speed, m/s. */
  mcvPm: number;
  pvPm: number;
  mpvPm: number;
  /** Against the fastest counted rep before it (%); null for the first counted rep and for partials. */
  lossPct: number | null;
}

export interface SetRead {
  reps: Rep[];
  counted: number;
  partials: number;
  /** Fastest and last counted MCV, and the set's velocity loss (%). */
  bestMcv: number | null;
  lastMcv: number | null;
  meanMcv: number | null;
  bestPv: number | null;
  lossPct: number | null;
  /** The pose rate the set was read at (frames/s). */
  fps: number;
}

/** (new) The peak's wider fit is at most this half-window (ms): wider would flatten a fast rep's peak at 30 fps. */
export const PV_HALF_MAX_MS = 110;

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r1 = (x: number) => Math.round(x * 10) / 10;

interface Span { i0: number; i1: number }

/** Runs where the bar rises faster than V_EDGE, peaking over V_PEAK_MIN, sticking points merged. */
function upwardRuns(k: readonly Kin[]): Span[] {
  const runs: Span[] = [];
  let i = 0;
  while (i < k.length) {
    if (k[i].vy <= V_EDGE) { i++; continue; }
    const i0 = i;
    while (i + 1 < k.length && k[i + 1].vy > V_EDGE) i++;
    runs.push({ i0, i1: i });
    i++;
  }
  const merged: Span[] = [];
  for (const r of runs) {
    const prev = merged[merged.length - 1];
    if (prev) {
      const gap = k[r.i0].t - k[prev.i1].t;
      let lowest = Infinity;
      for (let j = prev.i1; j <= r.i0; j++) lowest = Math.min(lowest, k[j].y);
      if (gap <= MERGE_GAP_MS && lowest >= k[prev.i1].y - MERGE_DROP_M) { prev.i1 = r.i1; continue; }
    }
    merged.push({ ...r });
  }
  return merged.filter((s) => { let pk = 0; for (let j = s.i0; j <= s.i1; j++) pk = Math.max(pk, k[j].vy); return pk >= V_PEAK_MIN; });
}

const argExt = (k: readonly Kin[], lo: number, hi: number, sign: 1 | -1): number => {
  let b = lo;
  for (let j = lo; j <= hi; j++) if (sign * k[j].y > sign * k[b].y) b = j;
  return b;
};

/**
 * Where the bar crosses `level` between indices `from` and `to` (walking `dir`), carried to zero speed: the time (ms)
 * the motion began (dir +1, leaving `level − δ`) or ended (dir −1, arriving at `level + δ`) and the speed at the crossing.
 */
function crossing(k: readonly Kin[], from: number, to: number, level: number, rising: boolean, kv: readonly Kin[] = k): { t: number; v: number } | null {
  const step = from <= to ? 1 : -1;
  for (let j = from; j !== to; j += step) {
    const a = k[j], b = k[j + step];
    const above = (p: Kin) => (rising ? p.y >= level : p.y <= level);
    if (!above(a) && above(b)) {
      const f = (level - a.y) / ((b.y - a.y) || 1e-12);
      // the speed there from `kv` (the wider fit: a derivative is the noisiest thing read here)
      return { t: a.t + (b.t - a.t) * f, v: Math.abs(kv[j].vy + (kv[j + step].vy - kv[j].vy) * f) };
    }
  }
  return null;
}

/** A set's track → its reps. */
export function readSet(lift: Lift, track: Track, final = true): SetRead {
  const s = track.samples;
  const fps = s.length > 1 ? Math.round((1000 / framePeriodMs(s.map((x) => x.t))) * 10) / 10 : 0;
  if (s.length < 5) return { reps: [], counted: 0, partials: 0, bestMcv: null, lastMcv: null, meanMcv: null, bestPv: null, lossPct: null, fps };
  const period = framePeriodMs(s.map((x) => x.t));
  const k = kinematics(s);
  // the peak and the propulsive end read a derivative's EXTREME, which jitter inflates (the max of a noisy curve sits
  // above the curve's max): they are read from a twice-as-wide fit
  const kp = kinematics(s, Math.min(2 * halfWindowMs(period), Math.max(halfWindowMs(period), PV_HALF_MAX_MS)));
  const modelSd = track.source === 'pose' ? POSE_BAR_SD : 0;

  type Raw = Omit<Rep, 'index' | 'counted' | 'partial' | 'lossPct'>;
  const raws: Raw[] = [];
  const runs = upwardRuns(k);
  const sdSmooth = (n: number) => track.posSdM / Math.sqrt(Math.max(1, n));
  const MAX_EDGE_MS = 300;
  let prevTop = -1;      // the index of the last counted-or-partial rep's top
  // the last samples' fits are one-sided (they extrapolate): a rep is read only once the bar has held its top for a
  // half-window after it, and the extremes are never taken from that tail
  const H = halfWindowMs(period);
  let last = k.length - 1;
  while (last > 0 && k[last].t > k[k.length - 1].t - H) last--;
  for (const [ri, sp] of runs.entries()) {
    if (sp.i0 >= last) break;
    const lo = prevTop < 0 ? 0 : prevTop;
    const hi = Math.min(last, ri + 1 < runs.length ? runs[ri + 1].i0 : last);
    const bot = argExt(k, lo, sp.i0, -1);
    const top = argExt(k, Math.min(sp.i1, hi), hi, 1);
    // still rising at the newest usable sample: the rep is not over yet (live), unless the set is
    if (!final && top >= last - 1) break;
    // the bottom and top LEVELS: the median of the smoothed points near each extreme (a noisy pause's lowest point is
    // ~1 SD under the bar's real height; the median of the pause is not)
    const levelNear = (lo2: number, hi2: number, ext: number, sign: 1 | -1) => {
      const tol = 2.5 * sdSmooth(k[ext].n);
      const ys: number[] = [];
      for (let j = lo2; j <= hi2; j++) if (sign * (k[ext].y - k[j].y) <= tol) ys.push(k[j].y);
      return ys.length ? median(ys) : k[ext].y;
    };
    const yBot = levelNear(lo, sp.i0, bot, -1);
    const yTop = levelNear(sp.i1, hi, top, 1);
    const romRaw = yTop - yBot;
    if (romRaw < lift.minRomM) continue;
    const delta = Math.max(EDGE_MIN_M, EDGE_ROM_SHARE * romRaw, 3 * sdSmooth(k[bot].n));
    // both edges are found walking OUT from the fastest point, so a noisy pause or hold never moves them
    let mid = bot;
    for (let j = bot; j <= top; j++) if (k[j].vy > k[mid].vy) mid = j;
    const up = crossing(k, mid, bot, yBot + delta, false, kp);
    const down = crossing(k, mid, top, yTop - delta, true, kp);
    if (!up || !down) continue;
    // the carry to zero speed, never more than a quarter of the rep between the crossings (a noisy, near-zero speed
    // at a crossing would otherwise throw an edge a long way out)
    const carryMax = Math.min(MAX_EDGE_MS, 0.25 * (down.t - up.t));
    const startT = up.t - Math.min(carryMax, (2000 * delta) / Math.max(up.v, 1e-3));
    const endT = down.t + Math.min(carryMax, (2000 * delta) / Math.max(down.v, 1e-3));
    const T = (endT - startT) / 1000;
    if (T <= 0) continue;
    const romM = romRaw;
    let pkI = bot;
    for (let j = bot; j <= top; j++) if (kp[j].vy > kp[pkI].vy) pkI = j;
    let pe = -1;
    for (let j = pkI; j <= top; j++) if (kp[j].ay < -G && kp[j].t < endT) { pe = j; break; }
    const mcv = romM / T;
    const propT = pe > 0 ? (kp[pe].t - startT) / 1000 : T;
    const mpv = pe > 0 && propT > 0 ? (kp[pe].y - yBot) / propT : mcv;
    // the lowering before it: from the previous top (or the set's start) down to this bottom
    let eccStartT: number | null = null, eccMs: number | null = null, eccMcv: number | null = null, pauseMs: number | null = null;
    const hiBefore = argExt(k, lo, bot, 1);
    const fall = k[hiBefore].y - yBot;
    if (fall >= lift.minRomM / 2) {
      const dE = Math.max(EDGE_MIN_M, EDGE_ROM_SHARE * fall, 3 * sdSmooth(k[bot].n));
      let fastDown = hiBefore;
      for (let j = hiBefore; j <= bot; j++) if (k[j].vy < k[fastDown].vy) fastDown = j;
      const yHi = levelNear(lo, bot, hiBefore, 1);
      const leave = crossing(k, fastDown, hiBefore, yHi - dE, true, kp);
      const arrive = crossing(k, fastDown, bot, yBot + dE, false, kp);
      if (leave && arrive) {
        eccStartT = leave.t - Math.min(MAX_EDGE_MS, (2000 * dE) / Math.max(leave.v, 1e-3));
        const eccEnd = arrive.t + Math.min(MAX_EDGE_MS, (2000 * dE) / Math.max(arrive.v, 1e-3));
        eccMs = Math.max(1, Math.round(eccEnd - eccStartT));
        eccMcv = r3(fall / (eccMs / 1000));
        pauseMs = Math.max(0, Math.round(startT - eccEnd));
      }
    }

    // the ± (1.96 σ)
    const sS = sdSmooth(Math.min(k[bot].n, k[top].n));
    const sdDisp = Math.SQRT2 * sS;
    // each edge's time: the crossing's own jitter (σ / v) and the carry to zero speed (2δ / v, with v's own σ)
    const sV = track.posSdM * k[Math.min(bot + 1, top)].slopeGain;
    const edgeSd = (v: number) => Math.hypot(sS / Math.max(v, 1e-3), ((2 * delta) / Math.max(v, 1e-3)) * (sV / Math.max(v, 1e-3)));
    const sdT = Math.hypot(period / 1000 / Math.sqrt(6), Math.min(0.15, edgeSd(up.v)), Math.min(0.15, edgeSd(down.v)));
    const rel = Math.hypot(track.ruler.sd, modelSd);
    const band = (v: number, t: number) => 1.96 * Math.hypot(sdDisp / t, (v * sdT) / t, v * rel);
    const pv = kp[pkI].vy;
    raws.push({
      startT, endT, eccStartT, eccMs, eccMcv, pauseMs, bounce: pauseMs != null && pauseMs < BOUNCE_MS,
      romM: r3(romM), mcv: r3(mcv), pv: r3(pv), mpv: r3(mpv), propulsiveMs: Math.round(propT * 1000),
      mcvPm: r3(band(mcv, T)), mpvPm: r3(band(mpv, propT)),
      pvPm: r3(1.96 * Math.hypot(track.posSdM * kp[pkI].slopeGain, pv * rel)),
    });
    prevTop = top;
  }

  const maxRom = Math.max(0, ...raws.map((r) => r.romM));
  const refRom = median(raws.filter((r) => r.romM >= 0.6 * maxRom).map((r) => r.romM));
  let best = 0;
  const reps: Rep[] = raws.map((r, i) => {
    const partial = r.romM < PARTIAL_SHARE * refRom;
    const counted = !partial;
    let lossPct: number | null = null;
    if (counted) {
      if (best > 0) lossPct = r1(Math.max(0, ((best - r.mcv) / best) * 100));
      best = Math.max(best, r.mcv);
    }
    return { ...r, index: i + 1, counted, partial, lossPct };
  });
  return summarise(reps, fps);
}

/** The set's numbers from its reps. */
export function summarise(reps: Rep[], fps: number): SetRead {
  const c = reps.filter((r) => r.counted);
  const bestMcv = c.length ? Math.max(...c.map((r) => r.mcv)) : null;
  const lastMcv = c.length ? c[c.length - 1].mcv : null;
  return {
    reps, counted: c.length, partials: reps.length - c.length, bestMcv, lastMcv,
    meanMcv: c.length ? r3(c.reduce((a, r) => a + r.mcv, 0) / c.length) : null,
    bestPv: c.length ? Math.max(...c.map((r) => r.pv)) : null,
    lossPct: bestMcv && lastMcv != null && c.length > 1 ? r1(Math.max(0, ((bestMcv - lastMcv) / bestMcv) * 100)) : null,
    fps,
  };
}
