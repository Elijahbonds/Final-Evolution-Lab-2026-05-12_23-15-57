// smoothKeys — slow-in / slow-out for pose clips (DUNK MOTION pass, phase 2, 2026-09-23).
//
// THE ROBOT. Owner: "the body movement looks unnatural". An authored dunk clip is 3–7 poses, and Babylon interpolates
// a rotation between two keys LINEARLY (a slerp at constant speed). So every joint leaves a pose at full speed, travels
// at that one speed, and stops dead on the next pose, where it changes speed and direction on a single frame. Every
// joint also reaches every pose at the same instant. That is the textbook robot: no slow-in / slow-out, no arcs through
// the poses, and the velocity breaking on every key (the phase-1 baseline measured SPARC −3.9 … −5.5 and 16–49
// one-frame pops a dunk).
//
// This resamples a bone's keys as a CUBIC in joint space (non-uniform Catmull-Rom on the hemisphere-aligned quaternion,
// renormalised), every 1/fps seconds. It passes through every authored pose, keeps the velocity continuous across it,
// and eases where the motion turns round. Three rules keep it honest:
//   · a key where a component REVERSES (an extreme) gets zero slope on that component, so a pose is reached, never
//     overshot (a hand authored AT the rim does not swing past it);
//   · every other slope is limited to 3× the smaller neighbouring secant (Fritsch–Carlson), so an uneven key spacing
//     cannot bulge a segment;
//   · a key marked HOLD gets zero slope everywhere: an accent (the top of a wind-up, the cock-back before the hammer).
// It works in joint space on purpose: a joint rotating smoothly is how a limb swings, and it draws the arcs animators
// ask for. A straight line through Cartesian hand targets is how a robot arm moves.
//
// Captures (the DeepMotion takes) are already dense but carry the estimator's frame-to-frame jitter; `prefilter`
// runs a [1 2 1] pass over the keys first.
//
// Pure: plain numbers in and out, no Babylon.

export type Q4 = [number, number, number, number];
export interface QuatKey { t: number; q: Q4 }
export interface ScalarKey { t: number; v: number }
export interface SmoothOpts {
  /** Output sample rate (keys per second). */
  fps: number;
  /** The clip's length: samples run 0 … duration inclusive. */
  duration: number;
  /** Key times (seconds) that ease to a stop — zero slope in and out. Matched to ±1 ms. */
  holds?: number[];
  /** [1 2 1] smoothing passes over the keys before the spline (0 = none). Ends are kept. */
  prefilter?: number;
}

const dot4 = (a: Q4, b: Q4) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const norm4 = (a: Q4): Q4 => { const l = Math.hypot(a[0], a[1], a[2], a[3]) || 1; return [a[0] / l, a[1] / l, a[2] / l, a[3] / l]; };

/** Keys in time order, one per time (the last wins), each quaternion on the same hemisphere as the one before it. */
export function alignQuatKeys(keys: QuatKey[]): QuatKey[] {
  const byT = new Map<number, Q4>();
  for (const k of [...keys].sort((a, b) => a.t - b.t)) byT.set(k.t, [...k.q] as Q4);
  const out = [...byT.entries()].map(([t, q]) => ({ t, q }));
  for (let i = 1; i < out.length; i++) if (dot4(out[i].q, out[i - 1].q) < 0) out[i].q = out[i].q.map((c) => -c) as Q4;
  return out;
}

/** Slopes for one channel: non-uniform Catmull-Rom, zero at reversals and holds, Fritsch–Carlson limited. */
function slopes(t: number[], p: number[], hold: boolean[]): number[] {
  const n = t.length; const m = new Array(n).fill(0);
  if (n < 2) return m;
  const sec = (i: number) => (p[i + 1] - p[i]) / Math.max(1e-6, t[i + 1] - t[i]);
  for (let i = 0; i < n; i++) {
    if (hold[i]) { m[i] = 0; continue; }
    if (i === 0) { m[i] = sec(0); continue; }
    if (i === n - 1) { m[i] = sec(n - 2); continue; }
    const a = sec(i - 1), b = sec(i);
    if (a * b <= 0) { m[i] = 0; continue; }
    const ha = t[i] - t[i - 1], hb = t[i + 1] - t[i];
    let s = (a * hb + b * ha) / (ha + hb);
    const cap = 3 * Math.min(Math.abs(a), Math.abs(b));
    if (Math.abs(s) > cap) s = Math.sign(s) * cap;
    m[i] = s;
  }
  // the end slopes follow the same no-overshoot rule: an end key never pulls the curve past its neighbour
  if (n >= 2) {
    const s0 = sec(0), s1 = sec(n - 2);
    if (!hold[0] && Math.abs(m[0]) > 3 * Math.abs(s0)) m[0] = Math.sign(m[0]) * 3 * Math.abs(s0);
    if (!hold[n - 1] && Math.abs(m[n - 1]) > 3 * Math.abs(s1)) m[n - 1] = Math.sign(m[n - 1]) * 3 * Math.abs(s1);
  }
  return m;
}

function hermite(p0: number, m0: number, p1: number, m1: number, h: number, u: number): number {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * h * m1;
}

function sampleTimes(o: SmoothOpts): number[] {
  const n = Math.max(1, Math.round(o.duration * o.fps));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(Math.min(o.duration, i / o.fps));
  return out;
}
const isHold = (t: number, holds?: number[]) => !!holds && holds.some((h) => Math.abs(h - t) <= 1e-3);

function prefilterQ(keys: QuatKey[], passes: number): QuatKey[] {
  let k = keys;
  for (let p = 0; p < passes; p++) {
    k = k.map((x, i) => {
      if (i === 0 || i === k.length - 1) return x;
      const a = k[i - 1].q, b = x.q, c = k[i + 1].q;
      return { t: x.t, q: norm4([a[0] + 2 * b[0] + c[0], a[1] + 2 * b[1] + c[1], a[2] + 2 * b[2] + c[2], a[3] + 2 * b[3] + c[3]]) };
    });
  }
  return k;
}

/** A bone's keys resampled as a joint-space cubic every 1/fps s, 0 … duration. Fewer than two keys pass through. */
export function smoothQuatKeys(keys: QuatKey[], o: SmoothOpts): QuatKey[] {
  let k = alignQuatKeys(keys);
  if (k.length < 2) return k;
  if (o.prefilter) k = prefilterQ(k, o.prefilter);
  const t = k.map((x) => x.t), hold = t.map((x) => isHold(x, o.holds));
  const ms = [0, 1, 2, 3].map((c) => slopes(t, k.map((x) => x.q[c]), hold));
  const out: QuatKey[] = [];
  let seg = 0;
  for (const s of sampleTimes(o)) {
    if (s <= t[0]) { out.push({ t: s, q: [...k[0].q] as Q4 }); continue; }
    if (s >= t[t.length - 1]) { out.push({ t: s, q: [...k[k.length - 1].q] as Q4 }); continue; }
    while (seg < t.length - 2 && s > t[seg + 1]) seg++;
    const h = t[seg + 1] - t[seg], u = (s - t[seg]) / h;
    const q = [0, 1, 2, 3].map((c) => hermite(k[seg].q[c], ms[c][seg], k[seg + 1].q[c], ms[c][seg + 1], h, u)) as Q4;
    out.push({ t: s, q: norm4(q) });
  }
  return out;
}

/** The same cubic for a scalar channel (the hips' height). */
export function smoothScalarKeys(keys: ScalarKey[], o: SmoothOpts): ScalarKey[] {
  const byT = new Map<number, number>();
  for (const x of [...keys].sort((a, b) => a.t - b.t)) byT.set(x.t, x.v);
  let k = [...byT.entries()].map(([t, v]) => ({ t, v }));
  if (k.length < 2) return k;
  for (let p = 0; p < (o.prefilter ?? 0); p++) k = k.map((x, i) => (i === 0 || i === k.length - 1 ? x : { t: x.t, v: (k[i - 1].v + 2 * x.v + k[i + 1].v) / 4 }));
  const t = k.map((x) => x.t), v = k.map((x) => x.v), hold = t.map((x) => isHold(x, o.holds));
  const m = slopes(t, v, hold);
  const out: ScalarKey[] = [];
  let seg = 0;
  for (const s of sampleTimes(o)) {
    if (s <= t[0]) { out.push({ t: s, v: v[0] }); continue; }
    if (s >= t[t.length - 1]) { out.push({ t: s, v: v[v.length - 1] }); continue; }
    while (seg < t.length - 2 && s > t[seg + 1]) seg++;
    const h = t[seg + 1] - t[seg], u = (s - t[seg]) / h;
    out.push({ t: s, v: hermite(v[seg], m[seg], v[seg + 1], m[seg + 1], h, u) });
  }
  return out;
}

/** Which clips are built smooth by default: the whole dunk family (the contest, the duel, the hoops game dunks). */
export function smoothByDefault(clipName: string): SmoothOpts['prefilter'] | null {
  if (/^dunk_mc_|^dunk_mocap$/.test(clipName)) return 1;   // a capture: dense keys with estimator jitter
  if (/^dunk_/.test(clipName)) return 0;
  return null;
}
