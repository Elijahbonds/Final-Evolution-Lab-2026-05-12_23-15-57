// _hoops-h4 — PHASE 4 (2026-09-29, plan §5 "The instrument"): the handles' metrics for _hoops-motion-probe.mts, PURE (no browser, no fs),
// so tests/probes/hoops-h4.test.ts can feed them synthetic frames built from lib/babylon/anim/handlePaths.ts — the negative controls the
// plan asks for before any gate is read (§5.2).
//
// Additive, like 3a's h3 and 3b's h3b. Every read is off the recorded DRAWN pose (the joints' world positions after every layer), in
// the PELVIS frame: the hip line's normal, oriented to agree with the root's facing (3a's pelvisSide — the feet's heel→toe line is noise
// on a run). "Lateral" is the ball's offset from the Hips joint along the athlete's right; "forward" along the pelvis normal.
//
// §5.2, THE FLAGS: phases 1–3's `underLegs` ("the ball below the knees within 0.22 × 0.3 m of the hips") and `behindBack` ("z < −0.15 at
// 0.45–1.4 m") read NOISE — base2 flagged hero_1v1_drive underLegs and behindBack 5/5, the in-and-out underLegs 5/5 — because a low
// bounce in front passes the first and a ball held back on a turn the second. They are replaced by `between` and `behind` below; the old
// reads are kept beside them (flagsV1) so the replacement can be checked on the same recordings.

export const JN = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'] as const;
export const J = Object.fromEntries(JN.map((n, i) => [n, i])) as Record<(typeof JN)[number], number>;
export const RIM: [number, number, number] = [0, 3.05, -0.6];
/** The body frame as the recorder stores it (the probe's BodyFrame, the fields h4 reads). */
export interface H4Body { rp: number[]; rq: number[] | null; rr: number[]; j: (number[] | null)[]; c: ([string, number] | [string, number, number])[] }
export interface H4Frame { t: number; B: Record<string, H4Body>; ball?: number[]; bb?: string; bh?: string; br?: boolean; s: Record<string, unknown> }
export interface H4Mark { t: number; msg: string }

/** Ball radius (every hoops ball). */
export const BALL_R = 0.12;
/** A lateral sign change counts once the ball is this far past the midline on the new side (the recorder's noise and a ball riding the
 *  midline — a two-hand hold at the chest through a pivot read 2 "crossings" at 0.03 in the 4a smoke — are not crossings; a real crossing
 *  goes ≥ 0.3 m past it, plan G5). */
export const CROSS_BAND = 0.05;
/** between: the floor contact within this of the feet's polygon, with a crossing within BETWEEN_CROSS_MS of it … */
export const BETWEEN_MARGIN = 0.05, BETWEEN_CROSS_MS = 120;
/** A floor contact is a bounce's lowest frame within this of the floor (plan: r + 0.03; measured on handlePaths' between path at 60 fps: a
 *  5 m/s bounce's nearest frames are 0.031 and 0.038 m off the floor, so r + 0.03 missed the bounce the test was built to find). */
export const FLOOR_CONTACT_M = 0.08;
/** … and no further than this in front of the hips (assumption, not in the plan: a crossover's floor contact is ≥ 0.3 m in front of the
 *  body — the plan's front path puts it at 0.36 — and a running stride's lead foot can put that point inside the two feet's hull). */
export const BETWEEN_MAX_AHEAD = 0.25;
/** behind: the crossing ≥ this far behind the line through the hip joints, at a height in [BEHIND_Y_LO, BEHIND_Y_HI] (plan §5.1). */
export const BEHIND_Z = -0.10, BEHIND_Y_LO = 0.3, BEHIND_Y_HI = 1.3;
/** The spin's planted sweep (HoopsMoves.SPIN_SEC) and the gather window after it (OneVOneMode SPIN_GATHER_SEC). */
export const H4_SPIN_SEC = 0.6, H4_SPIN_GATHER_SEC = 0.45;

type V = [number, number, number];
const sub = (a: number[], b: number[]): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: number[]) => Math.hypot(a[0], a[1], a[2]);
const r3 = (x: number) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : x);
const r1 = (x: number) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : x);
const pctl = (a: number[], p: number) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const clipName = (n: string) => n.replace(/(_c\d+)+$/, '').replace(/\s*\(.*\)$/, '');
const wrap = (d: number) => { let x = d; while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };

export function yawOf(b: H4Body): number { if (b.rq) { const [x, y, z, w] = b.rq; return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + x * x)); } return b.rr[1]; }
/** The pelvis frame: the Hips joint, the forward (the hip line's normal agreeing with the root's facing) and the athlete's right. */
export function pelvisFrame(b: H4Body): { hips: V; mid: V; fwd: V; right: V } | null {
  const h = b.j[J.Hips], lu = b.j[J.LeftUpLeg], ru = b.j[J.RightUpLeg]; if (!h || !lu || !ru) return null;
  const ax = ru[0] - lu[0], az = ru[2] - lu[2], l = Math.hypot(ax, az); if (l < 1e-4) return null;
  let fx = az / l, fz = -ax / l; const y = yawOf(b); if (fx * Math.sin(y) + fz * Math.cos(y) < 0) { fx = -fx; fz = -fz; }
  return { hips: [h[0], h[1], h[2]], mid: [(lu[0] + ru[0]) / 2, (lu[1] + ru[1]) / 2, (lu[2] + ru[2]) / 2], fwd: [fx, 0, fz], right: [fz, 0, -fx] };
}
/** The ball in the pelvis frame: lateral (+ right) and forward from the Hips joint, forward from the hip LINE, the height over the root. */
export function ballLocal(b: H4Body, ball: number[]): { lat: number; fwd: number; fwdLine: number; y: number } | null {
  const pf = pelvisFrame(b); if (!pf) return null;
  const d = sub(ball, pf.hips), dm = sub(ball, pf.mid);
  return { lat: d[0] * pf.right[0] + d[2] * pf.right[2], fwd: d[0] * pf.fwd[0] + d[2] * pf.fwd[2], fwdLine: dm[0] * pf.fwd[0] + dm[2] * pf.fwd[2], y: ball[1] - b.rp[1] };
}

/** Who has the ball this frame (moved here from the probe, unchanged): the body whose hand it is parented to, or — on a dribble, where the
 *  carry places the ball in world space — the carrier the mode reports. '' = loose or in flight. */
export function holderOf(f: H4Frame): string {
  if (f.bb) return f.bb;
  if (!f.ball || f.br) return '';
  const s = f.s || {};
  if (typeof s.cr === 'string') return s.cr === 'foeTeam' ? (typeof s.cf === 'string' ? s.cf : '') : s.cr;
  if (typeof s.po === 'string' && s.hh && typeof s.hh === 'object') { const hh = s.hh as Record<string, string>; return s.po === 'mine' ? (hh.me ? 'me' : '') : s.po === 'defense' ? (hh.foe ? 'foe' : '') : ''; }
  if (typeof s.po === 'string' && s.ca) return s.po === 'mine' ? 'me' : s.po === 'defense' ? 'foe' : '';
  return '';
}
export function carrierIs(f: H4Frame, id: string): boolean {
  const s = f.s || {};
  if (typeof s.po === 'string') return id === 'me' ? s.po === 'mine' : id === 'foe' ? s.po === 'defense' : false;
  if (typeof s.cr === 'string') return id === 'me' ? s.cr === 'me' : id.startsWith('mate') ? s.cr === id : id.startsWith('foe') ? s.cr === 'foeTeam' && s.cf === id : false;
  return id === 'me';
}
/** The ball is this body's: in its hand, or on its live dribble. */
const mine = (f: H4Frame, S: string) => !!f.ball && (f.bb === S || (!f.bb && !f.br && carrierIs(f, S) && holderOf(f) === S));
const onDribble = (f: H4Frame, S: string) => !!f.ball && !f.bb && !f.br && carrierIs(f, S) && holderOf(f) === S;
/** The hand the ball is in, 'R' / 'L' (the athlete's): the carry's own (hh) on a dribble; held, the side its hand is drawn on. */
export function handOf(f: H4Frame, S: string): 'R' | 'L' | '' {
  const hh = (f.s as { hh?: Record<string, string> } | undefined)?.hh;
  if (onDribble(f, S) && hh && (hh[S] === 'R' || hh[S] === 'L')) return hh[S] as 'R' | 'L';
  if (f.bb === S && f.B[S]) { const b = f.B[S]; const hand = f.bh === 'L' ? b.j[J.LeftHand] : f.bh === 'R' ? b.j[J.RightHand] : null; if (!hand) return ''; const l = ballLocal(b, hand); return l ? (l.lat >= 0 ? 'R' : 'L') : ''; }
  return '';
}

// ── the crossings (§5.1 crossings, cross.midY / farLat) ─────────────────────────────────────────────────────────────────────────────
export interface H4Crossing { atMs: number; from: 'R' | 'L'; to: 'R' | 'L'; midY: number; fwd: number; fwdLine: number; farLat: number; handBefore: string; handAfter: string }
export function crossingsH4(win: H4Frame[], S: string, A0: number): H4Crossing[] {
  const out: H4Crossing[] = [];
  let side = 0, lastIdx = -1, cur: H4Crossing | null = null;
  const loc = win.map((f) => (mine(f, S) && f.B[S] ? ballLocal(f.B[S], f.ball!) : null));
  for (let i = 0; i < win.length; i++) {
    const l = loc[i];
    if (!l) { side = 0; lastIdx = -1; cur = null; continue; }
    if (cur && Math.sign(l.lat) === (cur.to === 'R' ? 1 : -1)) cur.farLat = Math.max(cur.farLat, Math.abs(l.lat));
    const s = l.lat > CROSS_BAND ? 1 : l.lat < -CROSS_BAND ? -1 : 0;
    if (s === 0) continue;
    if (side !== 0 && s !== side && lastIdx >= 0) {
      // the frame the lateral changed sign, between the last frame on the old side and this one; the height interpolated there
      let k = i; for (let q = lastIdx + 1; q <= i; q++) { const lq = loc[q]; if (lq && Math.sign(lq.lat) === s) { k = q; break; } }
      const a = loc[k - 1] ?? loc[k]!, b = loc[k]!; const u = a && a.lat !== b.lat ? Math.min(1, Math.max(0, a.lat / (a.lat - b.lat))) : 0;
      const lerp = (x: number, y: number) => x + (y - x) * u;
      const tAt = win[k - 1] ? lerp(win[k - 1].t, win[k].t) : win[k].t;
      const after = win.find((f) => f.t >= tAt + 200 && mine(f, S)) ?? win[win.length - 1];
      // the hand BEFORE the crossing started (4a review F5): today's carry flips its hand at the crossing's START (beginCross), and 4b's
      // runMove reports its destination, so the last frame on the old side already names the new hand. The crossing starts where the
      // ball turns in: the frame furthest out on the old side (within the 600 ms before it left that side — a frame-to-frame walk stops
      // on the hips' sway); the hand a frame before that
      let q = lastIdx;
      for (let k = lastIdx; k >= 0 && loc[k] && Math.sign(loc[k]!.lat) === side && win[k].t >= win[lastIdx].t - 600; k--) if (Math.abs(loc[k]!.lat) > Math.abs(loc[q]!.lat)) q = k;
      const before = win.slice(Math.max(0, q - 10), q).reverse().find((f) => handOf(f, S)) ?? win.slice(0, lastIdx + 1).reverse().find((f) => handOf(f, S)) ?? win[lastIdx];
      cur = { atMs: Math.round(tAt - A0), from: side > 0 ? 'R' : 'L', to: s > 0 ? 'R' : 'L', midY: r3(lerp(a.y, b.y)), fwd: r3(lerp(a.fwd, b.fwd)), fwdLine: r3(lerp(a.fwdLine, b.fwdLine)), farLat: r3(Math.abs(l.lat)), handBefore: handOf(before, S), handAfter: handOf(after, S) };
      out.push(cur);
    }
    side = s; lastIdx = i;
  }
  for (const c of out) c.farLat = r3(c.farLat);
  return out;
}

// ── between the legs (§5.1 between, hipsDrop) and behind the back (§5.1 behind) ─────────────────────────────────────────────────────────
/** Distance from a point to a convex polygon in the XZ plane (0 inside). */
function distToHull(p: [number, number], pts: [number, number][]): number {
  // the convex hull (monotone chain), then inside / the nearest edge
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: [number, number][] = [], hi: [number, number][] = [];
  for (const q of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of P.slice().reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  const H = lo.slice(0, -1).concat(hi.slice(0, -1));
  if (H.length >= 3 && H.every((a, i) => cross(a, H[(i + 1) % H.length], p) >= 0)) return 0;
  let best = Infinity;
  for (let i = 0; i < H.length; i++) {
    const a = H[i], b = H[(i + 1) % H.length]; const ex = b[0] - a[0], ez = b[1] - a[1]; const l2 = ex * ex + ez * ez || 1e-9;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / l2));
    best = Math.min(best, Math.hypot(p[0] - a[0] - ex * t, p[1] - a[1] - ez * t));
  }
  return H.length === 1 ? Math.hypot(p[0] - H[0][0], p[1] - H[0][1]) : best;
}
export interface H4Between { found: boolean; contacts: number; inStance: number; atMs: number | null; hipsDropM: number | null }
export function betweenH4(win: H4Frame[], S: string, A0: number, crossings: H4Crossing[]): H4Between {
  let contacts = 0, inStance = 0, atMs: number | null = null, found = false;
  for (let i = 1; i < win.length - 1; i++) {
    const f = win[i]; if (!onDribble(f, S) || !win[i - 1].ball || !win[i + 1].ball) continue;
    const b = f.B[S]; const y = f.ball![1] - b.rp[1];
    if (y > BALL_R + FLOOR_CONTACT_M || y > win[i - 1].ball![1] - win[i - 1].B[S]!.rp[1] + 1e-6 || y > win[i + 1].ball![1] - win[i + 1].B[S]!.rp[1] + 1e-6) continue;
    contacts++;
    const pts = [J.LeftFoot, J.RightFoot, J.LeftToeBase, J.RightToeBase].map((k) => b.j[k]).filter((q): q is number[] => !!q).map((q) => [q[0], q[2]] as [number, number]);
    const l = ballLocal(b, f.ball!); if (pts.length < 2 || !l) continue;
    if (distToHull([f.ball![0], f.ball![2]], pts) > BETWEEN_MARGIN || l.fwd > BETWEEN_MAX_AHEAD) continue;
    inStance++;
    const tMs = f.t - A0;
    if (!found && crossings.some((c) => Math.abs(c.atMs - tMs) <= BETWEEN_CROSS_MS)) { found = true; atMs = Math.round(tMs); }
  }
  const hy = (f: H4Frame) => f.B[S]?.j[J.Hips]?.[1];
  const pre = win.filter((f) => f.t >= A0 - 300 && f.t < A0).map(hy).filter((y): y is number => typeof y === 'number');
  const mov = win.filter((f) => f.t >= A0 && f.t <= A0 + 700).map(hy).filter((y): y is number => typeof y === 'number');
  return { found, contacts, inStance, atMs, hipsDropM: pre.length && mov.length ? r3(pre.reduce((a, x) => a + x, 0) / pre.length - Math.min(...mov)) : null };
}
export interface H4Behind { found: boolean; atMs: number | null; zM: number | null; yM: number | null }
export function behindH4(crossings: H4Crossing[]): H4Behind {
  const c = crossings.find((x) => x.fwdLine < BEHIND_Z && x.midY >= BEHIND_Y_LO && x.midY <= BEHIND_Y_HI);
  return c ? { found: true, atMs: c.atMs, zM: c.fwdLine, yM: c.midY } : { found: false, atMs: null, zM: null, yM: null };
}
/** Phases 1–3's reads, kept for the comparison (§5.2): the probe's visual.underLegs / behindBack as they were written. */
export function flagsV1(win: H4Frame[], S: string, A0: number): { underLegs: boolean; behindBack: boolean } {
  let underLegs = false, behindBack = false;
  for (const f of win) {
    if (f.t < A0 - 50 || f.t > A0 + 900 || !f.ball) continue;
    const b = f.B[S]; const kneeY = ((b.j[J.LeftLeg]?.[1] ?? 0.5) + (b.j[J.RightLeg]?.[1] ?? 0.5)) / 2; const h = b.j[J.Hips]; if (!h) continue;
    const fwd = facingFeet(b), rt: V = [fwd[2], 0, -fwd[0]], d = sub(f.ball, h); const lx = d[0] * rt[0] + d[2] * rt[2], lz = d[0] * fwd[0] + d[2] * fwd[2];
    if (f.ball[1] < kneeY + 0.05 && Math.abs(lx) < 0.22 && Math.abs(lz) < 0.3) underLegs = true;
    if (lz < -0.15 && f.ball[1] > 0.45 && f.ball[1] < 1.4 && (f.bb === S || (!f.bb && !f.br))) behindBack = true;
  }
  return { underLegs, behindBack };
}
/** The probe's `facing` (phases 1–2: the feet's heel→toe line), for flagsV1 only. */
function facingFeet(b: H4Body): V {
  const v = [0, 0, 0]; let n = 0;
  for (const sd of ['Left', 'Right'] as const) { const f = b.j[J[`${sd}Foot`]], t = b.j[J[`${sd}ToeBase`]]; if (f && t) { v[0] += t[0] - f[0]; v[2] += t[2] - f[2]; n++; } }
  if (!n) { const y = yawOf(b); return [Math.sin(y), 0, Math.cos(y)]; }
  const l = Math.hypot(v[0], v[2]) || 1; return [v[0] / l, 0, v[2] / l];
}

// ── the body's facing (the hip line's normal, its sign carried frame to frame), unwrapped ─────────────────────────────────────────────
export function facingYaws(win: H4Frame[], S: string): (number | null)[] {
  const out: (number | null)[] = []; let prev: V | null = null, acc = 0, last: number | null = null;
  for (const f of win) {
    const b = f.B[S]; const lu = b?.j[J.LeftUpLeg], ru = b?.j[J.RightUpLeg];
    if (!b || !lu || !ru) { out.push(null); continue; }
    const ax = ru[0] - lu[0], az = ru[2] - lu[2], l = Math.hypot(ax, az) || 1; let n: V = [az / l, 0, -ax / l];
    const ref: V = prev ?? [Math.sin(yawOf(b)), 0, Math.cos(yawOf(b))]; if (n[0] * ref[0] + n[2] * ref[2] < 0) n = [-n[0], 0, -n[2]];
    prev = n; const y = Math.atan2(n[0], n[2]);
    acc = last === null ? y : acc + wrap(y - last); last = y; out.push(acc);
  }
  return out;
}

// ── the spin (§5.1 spin, preFeint) ────────────────────────────────────────────────────────────────────────────────────────────────────
export interface H4Spin { t0Ms: number; turnSpinDeg: number | null; turnTotalDeg: number | null; maxStepDeg: number | null; handAt0: string; handAt1000: string; handChange: boolean | null;
  pivotFoot: string; pivotSlideP90Cm: number | null; pivotSlideMaxCm: number | null; ballHipsP90M: number | null; exitToRimDeg: number | null; finish: boolean; finishAtMs: number | null; preFeint: number; preFeintMarks: number }
const SPIN_CLIP = /spin(?!_layup)/;
/** The spin's own start: the mode's spinning flag rising (1v1 s.sp), else the spin clip's onset (≥ 0.5), at or after the anchor − 100 ms. */
export function spinStart(win: H4Frame[], S: string, A0: number): number | null {
  for (let i = 1; i < win.length; i++) {
    const f = win[i]; if (f.t < A0 - 100) continue;
    if (S === 'me' && f.s?.sp === 1 && win[i - 1].s?.sp !== 1) return f.t;
    const w = (g: H4Frame) => Math.max(0, ...(g.B[S]?.c ?? []).filter((c) => SPIN_CLIP.test(clipName(c[0]))).map((c) => c[1]));
    if (w(f) >= 0.5 && w(win[i - 1]) < 0.5) return f.t;
  }
  return null;
}
export function spinH4(win: H4Frame[], S: string, A0: number, marks: H4Mark[]): H4Spin | null {
  const t0 = spinStart(win, S, A0); if (t0 == null) return null;
  const yaws = facingYaws(win, S);
  const at = (t: number) => { let k = -1; for (let i = 0; i < win.length; i++) if (win[i].t <= t + 1e-6 && yaws[i] != null) k = i; return k; };
  const i0 = at(t0), i1 = at(t0 + H4_SPIN_SEC * 1000), iEnd = at(t0 + 1000);
  const deg = (i: number, j: number) => (i >= 0 && j >= 0 && yaws[i] != null && yaws[j] != null ? r1(((yaws[j]! - yaws[i]!) * 180) / Math.PI) : null);
  let maxStep = 0; for (let i = Math.max(1, i0); i <= iEnd && i < win.length; i++) if (yaws[i] != null && yaws[i - 1] != null) maxStep = Math.max(maxStep, Math.abs(yaws[i]! - yaws[i - 1]!));
  const handNear = (t: number) => { const f = win.filter((g) => Math.abs(g.t - t) <= 120 && handOf(g, S)).sort((a, b) => Math.abs(a.t - t) - Math.abs(b.t - t))[0]; return f ? handOf(f, S) : ''; };
  const h0 = handNear(t0 - 34), h1 = handNear(t0 + 1000);
  // the pivot foot: the foot that travels least over the planted sweep; its slide on the frames it is down
  const span = win.filter((f) => f.t >= t0 && f.t <= t0 + H4_SPIN_SEC * 1000 && f.B[S]);
  const floor = Math.min(...span.flatMap((f) => [f.B[S].j[J.LeftFoot]?.[1] ?? 9, f.B[S].j[J.RightFoot]?.[1] ?? 9]));
  const travel = (k: number) => { let d = 0; for (let i = 1; i < span.length; i++) { const a = span[i - 1].B[S].j[k], b = span[i].B[S].j[k]; if (a && b) d += Math.hypot(b[0] - a[0], b[2] - a[2]); } return d; };
  const pk = travel(J.LeftFoot) <= travel(J.RightFoot) ? J.LeftFoot : J.RightFoot;
  const slides: number[] = [];
  for (let i = 1; i < span.length; i++) { const a = span[i - 1].B[S].j[pk], b = span[i].B[S].j[pk]; if (a && b && b[1] < floor + 0.05) slides.push(Math.hypot(b[0] - a[0], b[2] - a[2])); }
  // the ball to the hips while it is HELD through the sweep (plan G6 "within 0.3 m of the hips": the pull's hold — its release and bounce
  // on the exit side are the pull, not the hold)
  const bh = span.filter((f) => f.bb === S && f.ball && f.B[S].j[J.Hips]).map((f) => len(sub(f.ball!, f.B[S].j[J.Hips]!)));
  // the root's velocity over the 100 ms after the planted sweep, against the line to the rim
  const e0 = win.find((f) => f.t >= t0 + 600 && f.B[S]), e1 = win.find((f) => f.t >= t0 + 700 && f.B[S]);
  let exit: number | null = null;
  if (e0 && e1 && e1.t > e0.t) { const v = sub(e1.B[S].rp, e0.B[S].rp), toRim = sub(RIM, e0.B[S].rp); const vl = Math.hypot(v[0], v[2]), rl = Math.hypot(toRim[0], toRim[2]); if (vl > 0.02 && rl > 0.1) exit = r1((Math.acos(Math.max(-1, Math.min(1, (v[0] * toRim[0] + v[2] * toRim[2]) / (vl * rl)))) * 180) / Math.PI); }
  // spin → finish: a shot, finish or gather start (the mode's flags rising) inside the gather window after the sweep
  const gm = marks.find((m) => m.t >= t0 && /spin gathers/.test(m.msg)); const g0 = gm ? gm.t : t0 + H4_SPIN_SEC * 1000;
  let finishAt: number | null = null;
  for (let i = 1; i < win.length; i++) { const f = win[i], p = win[i - 1]; if (f.t < g0 - 1e-6 || f.t > g0 + H4_SPIN_GATHER_SEC * 1000) continue; const up = (k: string) => f.s?.[k] === 1 && p.s?.[k] !== 1; if (up('sh') || up('fi') || up('ga')) { finishAt = Math.round(f.t - A0); break; } }
  // the rotation's entry feint: an in-and-out / feint clip starting (≥ 0.1) within 300 ms before the spin, and the mode's own move lines
  let preFeint = 0;
  for (let i = 1; i < win.length; i++) { const f = win[i]; if (f.t < t0 - 300 || f.t > t0) continue; const w = (g: H4Frame) => Math.max(0, ...(g.B[S]?.c ?? []).filter((c) => /in_and_out|feint/.test(clipName(c[0]))).map((c) => c[1])); if (w(f) >= 0.1 && w(win[i - 1]) < 0.1) preFeint++; }
  const preFeintMarks = marks.filter((m) => m.t >= t0 - 300 && m.t <= t0 && /HANDLE\] (move )?in_and_out/.test(m.msg) && !/retract/.test(m.msg)).length;
  return { t0Ms: Math.round(t0 - A0), turnSpinDeg: deg(i0, i1), turnTotalDeg: deg(i0, iEnd), maxStepDeg: r1((maxStep * 180) / Math.PI), handAt0: h0, handAt1000: h1, handChange: h0 && h1 ? h0 !== h1 : null,
    pivotFoot: pk === J.LeftFoot ? 'L' : 'R', pivotSlideP90Cm: slides.length ? r1(pctl(slides, 0.9) * 100) : null, pivotSlideMaxCm: slides.length ? r1(Math.max(...slides) * 100) : null,
    ballHipsP90M: bh.length ? r3(pctl(bh, 0.9)) : null, exitToRimDeg: exit, finish: finishAt != null, finishAtMs: finishAt, preFeint, preFeintMarks };
}

// ── the hesi (§5.1 hesi), the in-and-out (§5.1 inout), the shimmy (§5.1 shimmy) ────────────────────────────────────────────────────────
export interface H4Hesi { spine2RiseM: number | null; stillMs: number; stillFromMs: number | null; explodeMs: number | null; peakMps: number | null }
/** The root's planar speed per frame (m/s), with the frame's time. */
function rootSpeeds(win: H4Frame[], S: string): { t: number; v: number }[] {
  const out: { t: number; v: number }[] = [];
  for (let i = 1; i < win.length; i++) { const a = win[i - 1].B[S], b = win[i].B[S]; if (!a || !b) continue; const dt = (win[i].t - win[i - 1].t) / 1000; if (!(dt > 0)) continue; const d = Math.hypot(b.rp[0] - a.rp[0], b.rp[2] - a.rp[2]); if (d > 0.5) continue; out.push({ t: win[i].t, v: d / dt }); }
  return out;
}
export function hesiH4(win: H4Frame[], S: string, A0: number): H4Hesi {
  const sy = (f: H4Frame) => f.B[S]?.j[J.Spine2]?.[1];
  const pre = win.filter((f) => f.t >= A0 - 200 && f.t < A0).map(sy).filter((y): y is number => typeof y === 'number');
  const post = win.filter((f) => f.t >= A0 && f.t <= A0 + 500).map(sy).filter((y): y is number => typeof y === 'number');
  const sp = rootSpeeds(win, S).filter((x) => x.t >= A0 && x.t <= A0 + 1100);
  let best = 0, bestFrom: number | null = null, bestEnd: number | null = null, runFrom: number | null = null;
  for (let i = 0; i < sp.length; i++) {
    if (sp[i].v <= 0.5) { if (runFrom == null) runFrom = sp[i].t; const d = sp[i].t - runFrom; if (d >= best && sp[i].t <= A0 + 800) { best = d; bestFrom = runFrom; bestEnd = sp[i].t; } }
    else runFrom = null;
  }
  let explode: number | null = null;
  if (bestEnd != null) { const e = sp.find((x) => x.t > bestEnd! && x.t <= bestEnd! + 600 && x.v >= 3); if (e) explode = Math.round(e.t - bestEnd); }
  return { spine2RiseM: pre.length && post.length ? r3(Math.max(...post) - pre.reduce((a, x) => a + x, 0) / pre.length) : null, stillMs: Math.round(best), stillFromMs: bestFrom != null ? Math.round(bestFrom - A0) : null, explodeMs: explode, peakMps: sp.length ? r1(Math.max(...sp.map((x) => x.v))) : null };
}
export interface H4InOut { offHandMinM: number | null; excursionM: number | null; outBackMs: number | null; returned: boolean | null }
export function inoutH4(win: H4Frame[], S: string, A0: number): H4InOut {
  const f0 = win.filter((f) => f.t <= A0 && mine(f, S)).pop() ?? win.find((f) => mine(f, S));
  if (!f0) return { offHandMinM: null, excursionM: null, outBackMs: null, returned: null };
  const b0 = f0.B[S]; const L0 = b0.j[J.LeftHand], R0 = b0.j[J.RightHand]; const l0 = ballLocal(b0, f0.ball!);
  if (!L0 || !R0 || !l0) return { offHandMinM: null, excursionM: null, outBackMs: null, returned: null };
  const off = len(sub(f0.ball!, L0)) <= len(sub(f0.ball!, R0)) ? J.RightHand : J.LeftHand;
  const s0 = Math.sign(l0.lat) || 1;
  let offMin = Infinity, exc = 0, inFrom: number | null = null, inTo: number | null = null, returned = false;
  for (const f of win) {
    if (f.t < A0 || f.t > A0 + 500 || !mine(f, S)) continue;
    const b = f.B[S]; const h = b.j[off]; if (h) offMin = Math.min(offMin, len(sub(f.ball!, h)));
    const l = ballLocal(b, f.ball!); if (!l) continue;
    const e = Math.abs(l0.lat) - s0 * l.lat; exc = Math.max(exc, e);
    if (e > 0.05) { if (inFrom == null) inFrom = f.t; inTo = f.t; }
    if (inFrom != null && e <= 0.05) returned = true;
  }
  return { offHandMinM: Number.isFinite(offMin) ? r3(offMin) : null, excursionM: r3(exc), outBackMs: inFrom != null && inTo != null ? Math.round(inTo - inFrom) : null, returned: inFrom != null ? returned : null };
}
export interface H4Shimmy { ampDeg: number | null; hz: number | null; spanMs: number | null; frames: number; extremes: number; endMs: number | null }
/** The shimmy's beat ends at the shot: a finish / gather line, or the mode's shot / finish flag rising, after the anchor (+20 ms). */
export function shimmyEnd(win: H4Frame[], A0: number, postMs: number, marks: H4Mark[] = []): number {
  let end = A0 + postMs;
  const m = marks.find((x) => x.t > A0 + 20 && x.t < end && /MOVE\] finish |SHOT\] gather/.test(x.msg)); if (m) end = m.t;
  for (let i = 1; i < win.length; i++) { const f = win[i], p = win[i - 1]; if (f.t <= A0 + 20 || f.t >= end) continue; if ((f.s?.fi === 1 && p.s?.fi !== 1) || (f.s?.sh === 1 && p.s?.sh !== 1)) { end = f.t; break; } }
  return end;
}
/**
 * The drawn shoulder line (LeftArm → RightArm) against the root's facing, OVER THE SHIMMY'S BEAT only — from the anchor to the shot
 * (shimmyEnd) — its swings: the extremes ≥ 10° off its mean, alternating sides. The amplitude is half of each extreme-to-extreme swing,
 * averaged, and the rate is read only from ≥ 3 of them (one full cycle); the span is from the first to the last frame ≥ 10° off. 4a read the whole window's
 * max − min and a rate off 2 extremes: the hook's one-sided lean plus the hook's own turn read ±19.9° at 2 Hz (4a review F3).
 */
export function shimmyH4(win: H4Frame[], S: string, A0: number, postMs: number, marks: H4Mark[] = []): H4Shimmy {
  const rel: { t: number; a: number }[] = [];
  const end = shimmyEnd(win, A0, postMs, marks);
  for (const f of win) {
    if (f.t < A0 || f.t > end) continue;
    const b = f.B[S]; const la = b?.j[J.LeftArm], ra = b?.j[J.RightArm]; if (!b || !la || !ra) continue;
    const ax = ra[0] - la[0], az = ra[2] - la[2], l = Math.hypot(ax, az); if (l < 1e-4) continue;
    const y = yawOf(b); const fx = Math.sin(y), fz = Math.cos(y);
    let nx = az / l, nz = -ax / l; if (nx * fx + nz * fz < 0) { nx = -nx; nz = -nz; }
    rel.push({ t: f.t, a: (Math.atan2(fx * nz - fz * nx, fx * nx + fz * nz) * 180) / Math.PI });
  }
  const endMs = Math.round(end - A0);
  if (rel.length < 6) return { ampDeg: null, hz: null, spanMs: null, frames: rel.length, extremes: 0, endMs };
  const mean = rel.reduce((s, x) => s + x.a, 0) / rel.length;
  const dev = rel.map((x) => ({ t: x.t, d: x.a - mean }));
  // the swings: the extremes ≥ 10° off the mean, alternating sides (the largest of each run on one side); the rate is half a cycle per
  // extreme-to-extreme gap, over the span the shoulders are swinging
  const ext: { t: number; d: number }[] = [];
  for (const x of dev) { if (Math.abs(x.d) < 10) continue; const last = ext[ext.length - 1]; if (last && Math.sign(last.d) === Math.sign(x.d)) { if (Math.abs(x.d) > Math.abs(last.d)) ext[ext.length - 1] = x; } else ext.push(x); }
  const big = dev.filter((x) => Math.abs(x.d) >= 10);
  const hz = ext.length >= 3 ? r1((ext.length - 1) / (2 * ((ext[ext.length - 1].t - ext[0].t) / 1000))) : null;
  // the amplitude: half of each swing from one extreme to the next (the mean's offset cancels), averaged
  const amp = ext.length >= 2 ? r1(ext.slice(1).reduce((a, x, i) => a + Math.abs(x.d - ext[i].d), 0) / (2 * (ext.length - 1))) : 0;
  return { ampDeg: amp, hz, spanMs: big.length ? Math.round(big[big.length - 1].t - big[0].t) : 0, frames: rel.length, extremes: ext.length, endMs };
}

// ── the bounce rate after a crossing (U20), the left hand (G14), the latency, the read, the path ───────────────────────────────────────
export interface H4BounceRate { atMs: number; rates: number[]; strideHz: number | null; ratios: number[] }
export function bounceRateH4(win: H4Frame[], S: string, A0: number, crossings: H4Crossing[]): H4BounceRate[] {
  const tops: number[] = [];
  for (let i = 1; i < win.length - 1; i++) { const f = win[i]; if (!onDribble(f, S) || !onDribble(win[i - 1], S) || !onDribble(win[i + 1], S)) continue; if (f.ball![1] > win[i - 1].ball![1] && f.ball![1] >= win[i + 1].ball![1]) tops.push(f.t); }
  // the stride: same-foot touchdowns (up past the floor + 8 cm, down under + 5 cm), the median period
  const ys = win.flatMap((f) => [f.B[S]?.j[J.LeftFoot]?.[1], f.B[S]?.j[J.RightFoot]?.[1]]).filter((y): y is number => typeof y === 'number');
  const floor = ys.length ? pctl(ys, 0.05) : 0.06; const per: number[] = [];
  for (const k of [J.LeftFoot, J.RightFoot]) { let up = false, last: number | null = null; for (const f of win) { const y = f.B[S]?.j[k]?.[1]; if (typeof y !== 'number') continue; if (y > floor + 0.08) up = true; else if (y < floor + 0.05 && up) { up = false; if (last != null && f.t - last > 250 && f.t - last < 1400) per.push(f.t - last); last = f.t; } } }
  const strideHz = per.length ? 1000 / pctl(per, 0.5) : null;
  return crossings.map((c) => {
    const after = tops.filter((t) => t > A0 + c.atMs).slice(0, 3);
    const rates = after.slice(1).map((t, i) => r3(1000 / (t - after[i])));
    return { atMs: c.atMs, rates, strideHz: strideHz != null ? r3(strideHz) : null, ratios: strideHz ? rates.map((r) => r3(r / strideHz)) : [] };
  });
}
export interface H4Left { raw: number; deliberate: number; excluded: number; returns: number; returnsUnasked: number }
/** Left-hand dribble frames (the ball drawn on the athlete's left while on this body's dribble), those the carry had on its left hand
 *  (hh 'L': the move ended there — deliberate), the rest; the carry's L → R changes, and those with no move line in the 400 ms before. */
export function leftDribbleH4(win: H4Frame[], S: string, marks: H4Mark[]): H4Left {
  let raw = 0, deliberate = 0, returns = 0, unasked = 0; let prevHand = '';
  for (const f of win) {
    if (!onDribble(f, S)) continue;
    const l = ballLocal(f.B[S], f.ball!); const hand = handOf(f, S);
    if (l && l.lat < -0.03) { raw++; if (hand === 'L') deliberate++; }
    if (prevHand === 'L' && hand === 'R') { returns++; if (!marks.some((m) => m.t <= f.t && m.t >= f.t - 400 && /HANDLE\] |STICK\] /.test(m.msg))) unasked++; }
    if (hand) prevHand = hand;
  }
  return { raw, deliberate, excluded: raw - deliberate, returns, returnsUnasked: unasked };
}
export interface H4Latency { inputMs: number | null; input: string; clipMs: number | null; clip: string; ballMs: number | null; gameMs: number | null; game: string }
const GAME_MOVE = /HANDLE\] (move|size-up|link|retract)|STICK\] |THREAT\] jab|MOVE\] (spin|front pivot|reverse pivot|post up)|post hook/;
/** From the probe's input mark (the anchor's, or the first in the window) to: a clip newly at ≥ 0.1, the ball ≥ 5 cm off where it was, the
 *  mode's own move line. */
export function latencyH4(win: H4Frame[], S: string, A0: number, marks: H4Mark[]): H4Latency {
  const inp = marks.find((m) => m.t >= A0 - 5 && /\[HM-INPUT\]/.test(m.msg)) ?? marks.find((m) => m.t >= A0 - 600 && m.t <= A0 + 200 && /\[HM-INPUT\]/.test(m.msg));
  if (!inp) return { inputMs: null, input: '', clipMs: null, clip: '', ballMs: null, gameMs: null, game: '' };
  const f0 = win.filter((f) => f.t <= inp.t).pop(); const was = new Map((f0?.B[S]?.c ?? []).map((c) => [clipName(c[0]), c[1]]));
  let clipMs: number | null = null, clip = '';
  for (const f of win) { if (f.t <= inp.t) continue; const c = (f.B[S]?.c ?? []).find((x) => x[1] >= 0.1 && (was.get(clipName(x[0])) ?? 0) < 0.1); if (c) { clipMs = Math.round(f.t - inp.t); clip = clipName(c[0]); break; } }
  const l0 = f0 && mine(f0, S) ? ballLocal(f0.B[S], f0.ball!) : null;
  let ballMs: number | null = null;
  if (l0) for (const f of win) { if (f.t <= inp.t || !mine(f, S)) continue; const l = ballLocal(f.B[S], f.ball!); if (l && Math.hypot(l.lat - l0.lat, l.fwd - l0.fwd) > 0.05) { ballMs = Math.round(f.t - inp.t); break; } }
  const g = marks.find((m) => m.t >= inp.t && m.t <= inp.t + 800 && GAME_MOVE.test(m.msg));
  return { inputMs: Math.round(inp.t - A0), input: inp.msg.replace('[HM-INPUT] ', ''), clipMs, clip, ballMs, gameMs: g ? Math.round(g.t - inp.t) : null, game: g ? g.msg.slice(0, 90) : '' };
}
export interface H4Read { defender: string; clip: string; onsetMs: number | null; crossMs: number | null; readMs: number | null }
/** The defender's reaction clip onset (≥ 0.5) against the ball's first crossing after the anchor. */
export function readH4(win: H4Frame[], S: string, A0: number, crossings: H4Crossing[]): H4Read {
  const team = (id: string) => (id === 'me' || id.startsWith('mate') ? 'me' : 'foe');
  const ids = Object.keys(win[0]?.B ?? {}).filter((id) => id !== S && team(id) !== team(S));
  const REACT = /ankle|stumble|slip|contact_react/;
  for (let i = 1; i < win.length; i++) {
    if (win[i].t < A0 - 50) continue;
    for (const id of ids) {
      const w = (g: H4Frame) => Math.max(0, ...(g.B[id]?.c ?? []).filter((c) => REACT.test(clipName(c[0]))).map((c) => c[1]));
      if (w(win[i]) >= 0.5 && w(win[i - 1]) < 0.5) {
        const c = crossings.find((x) => x.atMs >= -50); const clip = clipName((win[i].B[id].c.find((x) => REACT.test(clipName(x[0]))) ?? [''])[0] as string);
        const on = Math.round(win[i].t - A0);
        return { defender: id, clip, onsetMs: on, crossMs: c ? c.atMs : null, readMs: c ? on - c.atMs : null };
      }
    }
  }
  return { defender: '', clip: '', onsetMs: null, crossMs: null, readMs: null };
}
export interface H4Path { frames: number; relMaxM: number | null; relP90M: number | null; worldMaxM: number | null; worldNetMaxM: number | null; worldNetP90M: number | null; rootMps: number | null; moving: boolean; gateM: number | null; over015: number }
/** The ball's step per frame while this body has it on both frames: against the hips (rel), in the world (raw), and in the world less
 *  the root's own step (U8's world figure). A window is MOVING when the root averages > 1 m/s over the anchor's first 500 ms; the gate
 *  reads rel on a moving window and world on a standing one (owner Q10, 2026-09-26). */
export function pathH4(win: H4Frame[], S: string, A0: number): H4Path {
  const rel: number[] = [], world: number[] = [], net: number[] = [];
  for (let i = 1; i < win.length; i++) {
    const f = win[i], p = win[i - 1]; if (!mine(f, S) || !mine(p, S) || !f.B[S] || !p.B[S]) continue;
    const h1 = f.B[S].j[J.Hips], h0 = p.B[S].j[J.Hips]; if (!h1 || !h0) continue;
    const rs = Math.hypot(f.B[S].rp[0] - p.B[S].rp[0], f.B[S].rp[2] - p.B[S].rp[2]); if (rs > 0.5) continue;
    const w = len(sub(f.ball!, p.ball!)); world.push(w); net.push(w - rs); rel.push(len(sub(sub(f.ball!, h1), sub(p.ball!, h0))));
  }
  const sp = rootSpeeds(win, S).filter((x) => x.t >= A0 && x.t <= A0 + 500);
  const rootMps = sp.length ? sp.reduce((a, x) => a + x.v, 0) / sp.length : null;
  const moving = rootMps != null && rootMps > 1.0;
  const relMax = rel.length ? Math.max(...rel) : null, worldMax = world.length ? Math.max(...world) : null;
  const gate = moving ? relMax : worldMax;
  return { frames: rel.length, relMaxM: relMax != null ? r3(relMax) : null, relP90M: rel.length ? r3(pctl(rel, 0.9)) : null, worldMaxM: worldMax != null ? r3(worldMax) : null,
    worldNetMaxM: net.length ? r3(Math.max(...net)) : null, worldNetP90M: net.length ? r3(pctl(net, 0.9)) : null, rootMps: rootMps != null ? r3(rootMps) : null, moving, gateM: gate != null ? r3(gate) : null,
    over015: (moving ? rel : world).filter((x) => x > 0.15).length };
}

// ── the name against what the body did (§5.1 nameOk, G11) ─────────────────────────────────────────────────────────────────────────────
export interface H4Name { move: string; expect: string; ok: boolean | null; why: string; clip: string; clipOk: boolean | null; line: string }
const MOVE_LINE = /HANDLE\] (move \w+|\w+ chain)|HANDLE\] size-up|HANDLE\] link stepback|THREAT\] jab|MOVE\] (spin|front pivot|reverse pivot)|post hook .*shimmy/;
/** Which move the window is: the mode's move line at or after the anchor (1v1 '[1V1-HANDLE] move X …', 3v3 '[3V3-HANDLE] X chain …',
 *  the stick's size-up / step-back / jab lines), else the anchor clip. A SWEEP input's window prefers the spin / roll line over the
 *  rotation's entry flick (an in-and-out 17 ms after the input: 4a review F2); moveLine reports what was read. */
export function moveLine(marks: H4Mark[], A0: number, anchorClip: string): H4Mark | undefined {
  // the first move line at or after the anchor (an input-mark anchor: what the game made of that input), else the one just before it (a
  // clip anchor: the clip crosses 0.5 a fade after the mode's line)
  const inWin = marks.filter((x) => x.t >= A0 && x.t <= A0 + 700 && MOVE_LINE.test(x.msg));
  const sweep = /sweep/.test(anchorClip) || marks.some((x) => Math.abs(x.t - A0) <= 5 && /\[HM-INPUT\] sweep/.test(x.msg));
  return (sweep ? inWin.find((x) => /spin|steezo/.test(x.msg)) : undefined) ?? inWin[0] ?? marks.filter((x) => x.t >= A0 - 150 && x.t < A0 && MOVE_LINE.test(x.msg)).pop();
}
export function playedMove(marks: H4Mark[], A0: number, anchorClip: string): string {
  const m = moveLine(marks, A0, anchorClip);
  if (m) {
    const mv = /HANDLE\] move (\w+)/.exec(m.msg)?.[1] ?? /HANDLE\] (\w+) chain/.exec(m.msg)?.[1];
    if (mv) return mv;
    if (/size-up (\S+)/.test(m.msg)) return 'size_up:' + /size-up (\S+)/.exec(m.msg)![1];
    if (/link stepback/.test(m.msg)) return 'stepback';
    if (/jab/.test(m.msg)) return 'jab';
    if (/spin/.test(m.msg)) return 'spin';
    if (/pivot/.test(m.msg)) return 'pivot';
    if (/shimmy/.test(m.msg)) return 'shimmy';
  }
  return anchorClip.replace(/^bball_(mc_)?/, '');
}
/** The hoops loops and holds: a clip the body is IN, not a move it plays. */
const LOOP_CLIP = /dribble_(idle|walk|jog|run)|idle_stand|defend_|backpedal|strafe|carry_|post_up|stance|_loop$|^bball_(mc_)?(walk|jog|run|sprint)/;
/** The move clip of the window (4a review F2: G11 reads the CLIP, plan §5.1): the first non-loop clip crossing 0.5 at or after the anchor
 *  (− 50 ms; + 700), and every one after it in the window. */
export function moveClipsAfter(win: H4Frame[], S: string, A0: number, postMs: number): string[] {
  const out: string[] = [];
  for (let i = 1; i < win.length; i++) {
    const f = win[i]; if (f.t < A0 - 50 || f.t > A0 + Math.min(700, postMs)) continue;
    const was = new Map((win[i - 1].B[S]?.c ?? []).map((c) => [clipName(c[0]), c[1]]));
    for (const c of f.B[S]?.c ?? []) { const n = clipName(c[0]); if (c[1] >= 0.5 && (was.get(n) ?? 0) < 0.5 && !LOOP_CLIP.test(n) && !out.includes(n)) out.push(n); }
  }
  return out;
}
/** The clip family each move's clip must be (the expectation table's clip half): a jab playing bball_hesi, a shimmy playing bball_hesi, a
 *  spin entered through a feint clip are G11 fails whatever the body did. */
export const CLIP_FAMILY: readonly [RegExp, RegExp][] = [
  [/double_cross/, /double_cross/], [/shammgod/, /shammgod/], [/between/, /between/], [/behind|momentum_btb|steezo/, /behind/],
  [/crossover|momentum_cross/, /crossover/], [/snatch/, /snatch/], [/hesi/, /hesi/], [/in_and_out|slip_slide/, /in_and_out|feint/],
  [/yoyo/, /yoyo/], [/^spin$|(^|_)spin$/, /spin/], [/jab/, /jab/], [/stepback/, /stepback/], [/shimmy/, /shimmy/], [/pivot/, /pivot/],
];
/** The window's move clip for the name check: the first move clip after the anchor that is not an EARLIER input's (HOOPS MOTION 4b review
 *  F2: a move asked while another runs plays its clip when its BALL starts, so the between queued 150 ms before a Shammgod's input plays its
 *  clip after that input). An earlier input is a mode move line logged in the second before the anchor; a clip of ITS move's family (and not
 *  of this move's) is skipped. A clip nobody asked for before the anchor — the rotation's entry flick's in-and-out, 17 ms after a sweep —
 *  still counts against the move. */
export function windowMoveClip(move: string, clips: readonly string[], earlier: readonly string[] = []): string {
  const theirs = (c: string) => clipFamilyOk(move, c) !== true && earlier.some((m) => clipFamilyOk(m, c) === true);
  return clips.find((c) => !theirs(c)) ?? clips[0] ?? '';
}
export function clipFamilyOk(move: string, clip: string): boolean | null {
  if (!clip) return null;
  const su = /^size_up:(.+)$/.exec(move); if (su) return clipName(su[1]) === clip;
  const row = CLIP_FAMILY.find(([mv]) => mv.test(move)); return row ? row[1].test(clip) : null;
}
export function nameOkH4(move: string, m: { crossings: H4Crossing[]; between: H4Between; behind: H4Behind; hesi: H4Hesi; inout: H4InOut; spin: H4Spin | null; shimmy: H4Shimmy; fwdExcursionM: number | null; footOutM: number | null; backStepM: number | null; topsDiffM: number | null }, clip = '', line = ''): H4Name {
  const n = m.crossings.length;
  const clipOk = clipFamilyOk(move, clip);
  // ok: what the body did AND (when the window played a move clip) the clip's family; a clip that is not the move's is a fail by itself
  const T = (expect: string, ok: boolean | null, why: string): H4Name => ({ move, expect, ok: clipOk === false ? false : ok, why: clipOk === false ? `clip ${clip} is not the move's; ${why}` : why, clip, clipOk, line });
  if (/^size_up:/.test(move)) return T('the size-up clip', clipOk, `clip ${clip || '-'}`);   // (first: 'size_up:bball_yoyo' is not a yoyo move)
  if (/double_cross/.test(move)) return T('crossed twice', n === 2, `crossings ${n}`);
  if (/shammgod/.test(move)) return T('pushed out, crossed', n === 1 && (m.fwdExcursionM ?? 0) >= 0.45, `crossings ${n}, forward ${m.fwdExcursionM ?? '-'} m`);
  if (/between/.test(move)) return T('under the legs, crossed', m.between.found, `between ${m.between.found} (contacts in stance ${m.between.inStance}), crossings ${n}`);
  if (/behind|momentum_btb|steezo/.test(move)) return T('behind the back, crossed', m.behind.found, `behind ${m.behind.found}, crossings ${n}`);
  if (/crossover|momentum_cross|snatch/.test(move)) return T('crossed, in front', n >= 1 && !m.between.found && !m.behind.found, `crossings ${n}`);
  if (/hesi/.test(move)) return T('hitch: rose, paused, exploded', (m.hesi.spine2RiseM ?? 0) >= 0.04 && m.hesi.stillMs >= 150 && m.hesi.explodeMs != null && m.hesi.explodeMs <= 300, `Spine2 +${m.hesi.spine2RiseM ?? '-'} m, still ${m.hesi.stillMs} ms, explode ${m.hesi.explodeMs ?? '-'} ms`);
  if (/in_and_out|feint|slip_slide/.test(move)) return T('faked, kept the hand', n === 0 && (m.inout.excursionM ?? 0) >= 0.2, `crossings ${n}, excursion ${m.inout.excursionM ?? '-'} m`);
  if (/yoyo/.test(move)) return T('two tops, no crossing', n === 0 && (m.topsDiffM ?? 0) >= 0.25, `crossings ${n}, tops ${m.topsDiffM ?? '-'} m apart`);
  if (move === 'spin' || /(^|_)spin$/.test(move)) return T('turned, changed hands', (m.spin?.turnSpinDeg != null && Math.abs(m.spin.turnSpinDeg) >= 180) && m.spin?.handChange === true, m.spin ? `turn ${m.spin.turnSpinDeg}°, hand ${m.spin.handAt0}→${m.spin.handAt1000}` : 'no spin');
  if (/jab/.test(move)) return T('jab: the foot out and back', (m.footOutM ?? 0) >= 0.25, `foot out ${m.footOutM ?? '-'} m`);
  if (/stepback/.test(move)) return T('stepped back', (m.backStepM ?? 0) >= 0.6, `back step ${m.backStepM ?? '-'} m`);
  if (/shimmy/.test(move)) return T('shimmy: shoulders ±15°, a full cycle', m.shimmy.extremes >= 3 && (m.shimmy.ampDeg ?? 0) >= 15, `amp ${m.shimmy.ampDeg ?? '-'}° over ${m.shimmy.extremes} swings at ${m.shimmy.hz ?? '-'} Hz`);
  return T('(no expectation)', null, '');
}

// ── everything, for one window ────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface H4 {
  crossings: H4Crossing[]; nCross: number; cross: { midY: number | null; farLat: number | null } ; between: H4Between; behind: H4Behind; flagsV1: { underLegs: boolean; behindBack: boolean };
  spin: H4Spin | null; hesi: H4Hesi; inout: H4InOut; shimmy: H4Shimmy; bounceRate: H4BounceRate[]; leftDribble: H4Left; latency: H4Latency; read: H4Read; path: H4Path;
  fwdExcursionM: number | null; footOutM: number | null; backStepM: number | null; topsDiffM: number | null; moves: string[]; nameOk: H4Name;
}
/** h4 for one window (`win`: the frames of the window, the subject on each; `A0` the anchor; `marks` the recording's marks; `all` the whole
 *  recording's frames with the subject — the bounce rate reads the bounces after a crossing past the window's end: a crossing ~0.2 s in
 *  leaves ~1.6 bounces inside a 1 s window, and the rate needs three tops). */
export function measureH4(win: H4Frame[], S: string, A0: number, marks: H4Mark[], anchorClip: string, postMs: number, all?: H4Frame[]): H4 {
  const crossings = crossingsH4(win, S, A0);
  const between = betweenH4(win, S, A0, crossings), behind = behindH4(crossings);
  const first = crossings.find((c) => c.atMs >= -100) ?? crossings[0];
  // the ball's forward excursion (the Shammgod's push-out), the jab foot, the step-back foot, the yoyo's two tops
  const loc = win.filter((f) => f.t >= A0 && f.t <= A0 + 800 && mine(f, S)).map((f) => ({ f, l: ballLocal(f.B[S], f.ball!) })).filter((x) => x.l);
  const l0 = win.filter((f) => f.t <= A0 && mine(f, S)).map((f) => ballLocal(f.B[S], f.ball!)).filter(Boolean).pop();
  const fwdExc = loc.length && l0 ? r3(Math.max(...loc.map((x) => x.l!.fwd)) - l0.fwd) : null;
  const b0 = win.filter((f) => f.t <= A0).pop()?.B[S];
  const footMove = (dirSign: number) => {
    if (!b0) return null; let best = 0;
    const y = yawOf(b0); const fx = Math.sin(y), fz = Math.cos(y);
    for (const k of [J.LeftFoot, J.RightFoot]) { const p0 = b0.j[k]; if (!p0) continue; for (const f of win) { if (f.t < A0 || f.t > A0 + 600) continue; const p = f.B[S]?.j[k]; if (!p) continue; const d = dirSign === 0 ? Math.hypot(p[0] - p0[0], p[2] - p0[2]) : -((p[0] - p0[0]) * fx + (p[2] - p0[2]) * fz); best = Math.max(best, d); } }
    return r3(best);
  };
  const tops: number[] = [];
  for (let i = 1; i < win.length - 1; i++) { const f = win[i]; if (f.t < A0 || f.t > A0 + 800 || !mine(f, S) || !mine(win[i - 1], S) || !mine(win[i + 1], S)) continue; if (f.ball![1] > win[i - 1].ball![1] && f.ball![1] >= win[i + 1].ball![1]) tops.push(f.ball![1] - f.B[S].rp[1]); }
  const hesi = hesiH4(win, S, A0), inout = inoutH4(win, S, A0), shimmy = shimmyH4(win, S, A0, postMs, marks), spin = spinH4(win, S, A0, marks);
  const moves = marks.filter((m) => m.t >= A0 - 100 && m.t <= A0 + postMs && GAME_MOVE.test(m.msg)).map((m) => `${Math.round(m.t - A0)} ${m.msg.replace(/\(chain.*$/, '').slice(0, 80)}`);
  const base = { crossings, between, behind, hesi, inout, spin, shimmy, fwdExcursionM: fwdExc, footOutM: footMove(0), backStepM: footMove(1), topsDiffM: tops.length >= 2 ? r3(Math.max(...tops) - Math.min(...tops)) : null };
  return {
    ...base, nCross: crossings.length, cross: { midY: first ? first.midY : null, farLat: first ? first.farLat : null }, flagsV1: flagsV1(win, S, A0),
    bounceRate: bounceRateH4(all ?? win, S, A0, crossings), leftDribble: leftDribbleH4(win, S, marks), latency: latencyH4(win, S, A0, marks), read: readH4(win, S, A0, crossings), path: pathH4(win, S, A0),
    moves, nameOk: (() => {
      const mv = playedMove(marks, A0, anchorClip);
      const earlier = marks.filter((m) => m.t < A0 && m.t >= A0 - 1000 && /HANDLE\] move \w+/.test(m.msg)).map((m) => /HANDLE\] move (\w+)/.exec(m.msg)![1]);
      return nameOkH4(mv, base, windowMoveClip(mv, moveClipsAfter(win, S, A0, postMs), earlier), (moveLine(marks, A0, anchorClip)?.msg ?? '').slice(0, 90));
    })(),
  };
}
