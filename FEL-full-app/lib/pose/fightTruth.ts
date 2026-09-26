// fightTruth — the ground truth of a fight stream (movement play P7, 2026-09-25): WHAT happened comes from the label (the
// eye on a contact sheet, or the script that made it), WHEN it happened from the clean source joints, by the same rules
// the reader uses on the noisy stream (lib/pose/fightReader.ts):
//
//   blow      onset = where the wrist's speed relative to its shoulder first reaches ONSET_SHARE (25 %) of its run's peak,
//             searched back from the peak and interpolated; peak = the fastest instant
//   legKick   onset = the knee's rise: its height relative to its hip rising past KNEE_RISE_V, searched back from the kick's
//             fastest ankle instant (relative to the hips); peak = that instant
//   guard     raise = the instant the SECOND wrist entered the guard zone; drop = the first one out
//   evade     slip = 25 % of the peak sideways speed of the nose relative to the hips; duck = 25 % of the nose's peak fall
//   fightStep onset = 25 % of the leading foot's peak speed across the floor
//   turn      onset = 25 % of the shoulder line's peak yaw rate
//
// So an onset error measures only what the camera adds (noise, rate, filtering, blur), never a second definition.
// Pure: no DOM, no fs.
import { bodyPoints, type JointClip, type Joints, type V3 } from './synth';
import {
  NOSE, LEFT_EAR, RIGHT_EAR, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_WRIST, RIGHT_WRIST, LEFT_HIP, RIGHT_HIP,
} from './landmarks';

export type Hand = 'L' | 'R';
/** The share of a run's peak speed its onset is placed at. */
export const ONSET_SHARE = 0.25;
/** A knee rising this fast (m/s, relative to its hip) has begun a kick. */
export const KNEE_RISE_V = 0.8;
/** Every rate on the clean joints is taken over ±this (ms): the reader's VEL_HALF_MS. */
export const TRUTH_HALF_MS = 33;

/** The stance: the lead is the foot nearer the camera by at least LEAD_DEPTH_M, held LEAD_HOLD_MS; a square stance keeps
 *  the lead it had (orthodox, 'L', to begin with). The reader's rule (fightReader.LEAD_*). */
export const LEAD_DEPTH_M = 0.08;
export const LEAD_HOLD_MS = 300;

/** The lead at every frame of a clean clip, by the stance rule on the ankles' depth (Foot joints, room z). */
export function leadTrack(clip: JointClip, start: Hand = 'L'): Hand[] {
  const fps = clip.fps, hold = Math.max(1, Math.round((LEAD_HOLD_MS / 1000) * fps));
  let lead = start, run: Hand | null = null, n = 0;
  return clip.frames.map((j) => {
    const d = j.LeftFoot[2] - j.RightFoot[2];
    const says: Hand | null = d >= LEAD_DEPTH_M ? 'L' : d <= -LEAD_DEPTH_M ? 'R' : null;
    if (says && says === run) n++; else { run = says; n = says ? 1 : 0; }
    if (run && n >= hold) lead = run;
    return lead;
  });
}

/** The knee's rise is looked for this far (ms) back from the kick's fastest instant, through dips of the rate under the
 *  line no longer than KICK_RISE_GAP_MS (a jittery rate dips for a frame). */
export const KICK_RISE_MS = 600;
export const KICK_RISE_GAP_MS = 50;
/**
 * A kick's onset: going back from the fastest instant `pk`, the EARLIEST up-crossing of `KNEE_RISE_V` by the knee's rising
 * rate before it has stayed under the line longer than KICK_RISE_GAP_MS (or KICK_RISE_MS is reached); interpolated (ms).
 * null when the knee never rose past the line. The reader and the truth run this same rule.
 */
export function riseOnset(ts: readonly number[], rate: readonly (number | null)[], pk: number): number | null {
  let on: number | null = null, underFrom: number | null = null;
  for (let j = pk; j > 0; j--) {
    const a = rate[j - 1], b = rate[j];
    if (a == null || b == null || ts[pk] - ts[j] > KICK_RISE_MS) break;
    if (b >= KNEE_RISE_V && a < KNEE_RISE_V) on = ts[j - 1] + ((KNEE_RISE_V - a) / Math.max(1e-9, b - a)) * (ts[j] - ts[j - 1]);
    if (a < KNEE_RISE_V) { underFrom ??= ts[j]; if (underFrom - ts[j - 1] > KICK_RISE_GAP_MS) break; } else underFrom = null;
  }
  return on;
}

/** The guard zone (the reader's, fightReader.GUARD_*): both wrists up at the face, in front of the shoulders. */
export const GUARD_BELOW_SHOULDER_M = 0.15;
export const GUARD_UNDER_CROWN_M = 0.03;
export const GUARD_FACE_X_M = 0.3;
export const GUARD_FRONT_M = 0.04;
/** The crown line: the ears plus this (m), BodyReader.HEAD_LINE_ABOVE_EARS_M. */
export const CROWN_ABOVE_EARS_M = 0.08;

export type FightLabelKind = 'blow' | 'legKick' | 'guard' | 'evade' | 'fightStep' | 'turn';
/**
 * One labelled event. `at` (s, the clip's clock) is where to look: the sheet's run onset, or a script's start — the
 * instants are found near it. `cls`: straight / hook / uppercut · front / round · raise / drop · slip / duck ·
 * in / out / left / right · turn. `hand`: the striking hand, the kicking or leading foot, the side slipped to.
 */
export interface FightLabel {
  kind: FightLabelKind;
  cls: string;
  hand?: Hand;
  at: number;
  /** How far past `at` (s) the event may peak (default: 0.35; a kick 0.6). */
  span?: number;
  labeller: 'eye' | 'scripted' | 'clip-name' | 'spliced';
  note?: string;
}

export interface GtFight {
  kind: FightLabelKind;
  /** blow: jab / cross / hook / uppercut; legKick: front / round; guard: raise / drop; evade: slip / duck; fightStep: in /
   *  out / left / right; turn: turn. */
  name: string;
  hand: Hand | null;
  /** The truth's lead hand for a blow (the stance), so a straight is a jab or a cross. */
  lead: Hand | null;
  /** Onset and peak (ms, the stream's capture clock: t0 + s × 1000). */
  onset: number;
  peak: number;
  labeller: FightLabel['labeller'];
  note?: string;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
const J = (h: Hand) => (h === 'L' ? 'Left' : 'Right') as 'Left' | 'Right';

/** A rate series (per s) of a per-frame number, centred over ±TRUTH_HALF_MS. */
function rate(xs: number[], fps: number): number[] {
  const n = xs.length, k = Math.max(1, Math.round((TRUTH_HALF_MS / 1000) * fps));
  return xs.map((_, i) => { const a = Math.max(0, i - k), b = Math.min(n - 1, i + k); return ((xs[b] - xs[a]) * fps) / Math.max(1, b - a); });
}
/** The speed series (m/s) of a per-frame point, centred over ±TRUTH_HALF_MS. */
function speed(ps: V3[], fps: number): number[] {
  const n = ps.length, k = Math.max(1, Math.round((TRUTH_HALF_MS / 1000) * fps));
  return ps.map((_, i) => { const a = Math.max(0, i - k), b = Math.min(n - 1, i + k); return (len(sub(ps[b], ps[a])) * fps) / Math.max(1, b - a); });
}

/**
 * The run's onset: back from `pk` to the first sample at or under `share` of v[pk], interpolated between it and the
 * sample after (in samples, fractional), never before `floor` (the motion's own start: a punch thrown straight out of
 * the last one's way back does not reach back into it). Shared with the reader, which runs it on its own frames.
 */
export function onsetBack(v: readonly number[], pk: number, share = ONSET_SHARE, floor = 0): number {
  const thr = share * v[pk];
  let o = pk;
  while (o > floor && v[o] > thr) o--;
  if (v[o] > thr) return o;
  const d = v[o + 1] - v[o];
  return o + (d > 1e-9 ? (thr - v[o]) / d : 0);
}
/** The same on timed samples: the onset instant (ms). */
export function onsetBackT(ts: readonly number[], v: readonly number[], pk: number, share = ONSET_SHARE, floor = 0): number {
  const u = onsetBack(v, pk, share, floor), i = Math.floor(u), f = u - i;
  return i + 1 < ts.length ? ts[i] + (ts[i + 1] - ts[i]) * f : ts[i];
}

/** The fastest sample of v in [a, b] (indices, clamped). */
function peakIn(v: number[], a: number, b: number): number {
  let pk = Math.max(0, a);
  for (let i = Math.max(0, a); i <= Math.min(v.length - 1, b); i++) if (v[i] > v[pk]) pk = i;
  return pk;
}

/** The 33 points of each frame (room frame), once. */
function pointsOf(clip: JointClip): V3[][] { return clip.frames.map((j) => bodyPoints(j, clip.foot)); }

/** Is each frame's pair of wrists inside the guard zone? [left, right]. */
export function guardZoneOf(p: V3[]): [boolean, boolean] {
  const crown = (p[LEFT_EAR][1] + p[RIGHT_EAR][1]) / 2 + CROWN_ABOVE_EARS_M;
  const shY = (p[LEFT_SHOULDER][1] + p[RIGHT_SHOULDER][1]) / 2, shZ = (p[LEFT_SHOULDER][2] + p[RIGHT_SHOULDER][2]) / 2;
  const nose = p[NOSE];
  const inZone = (w: V3) => w[1] >= shY - GUARD_BELOW_SHOULDER_M && w[1] <= crown - GUARD_UNDER_CROWN_M
    && Math.abs(w[0] - nose[0]) <= GUARD_FACE_X_M && w[2] - shZ >= GUARD_FRONT_M;
  return [inZone(p[LEFT_WRIST]), inZone(p[RIGHT_WRIST])];
}

/** The instants of every label on a clean clip. `t0` = the stream's first capture instant (ms); `lead` overrides the
 *  stance rule (leadTrack) that names a straight a jab or a cross. */
export function fightTruth(clip: JointClip, labels: readonly FightLabel[], opt: { t0?: number; lead?: Hand | null } = {}): GtFight[] {
  const fps = clip.fps, n = clip.frames.length, t0 = opt.t0 ?? 0;
  const ms = (i: number) => t0 + (i / fps) * 1000;
  const F: Joints[] = clip.frames;
  let pts: V3[][] | null = null;
  let leads: Hand[] | null = null;
  const P = () => (pts ??= pointsOf(clip));
  const out: GtFight[] = [];
  for (const l of labels) {
    const a = Math.round(l.at * fps), span = Math.round((l.span ?? (l.kind === 'legKick' ? 0.6 : 0.35)) * fps);
    const lo = Math.max(0, a - Math.round(0.08 * fps)), hi = Math.min(n - 1, a + span);
    const base = { kind: l.kind, hand: l.hand ?? null, labeller: l.labeller, note: l.note };
    if (l.kind === 'blow') {
      const h = l.hand!;
      const rel = F.map((j) => sub(j[`${J(h)}Hand`], j[`${J(h)}Arm`]));
      const v = speed(rel, fps);
      // the motion whose onset is nearest the label's `at` (the sheet printed that onset; a take-wide label's IS an
      // extension's): the speed runs (segmentRuns) and the reach's rises (extensionRuns' turning points) are both candidates
      const runs = [
        ...segmentRuns(v).map((r) => ({ pk: r.pk, on: onsetBack(v, r.pk, ONSET_SHARE, r.a) })),
        ...reachRises(clip, h).map((r) => ({ pk: r.pk, on: onsetBack(v, r.pk, ONSET_SHARE, r.a) })),
      ];
      // a hook's and an uppercut's onset is their DRIVE's (the sweep in, the rise), not their load's (the elbow lifting
      // out, the fist dropping): among the motions starting inside the label's stretch, the one that travels that way
      // furthest; a straight's, the one reaching out furthest; else the nearest
      const sg = h === 'L' ? 1 : -1;
      const inSpan = (r: { on: number }) => r.on >= a - 0.08 * fps && r.on <= a + span;
      const travel = (r: { on: number; pk: number }) => {
        const i0 = Math.max(0, Math.floor(r.on)), i1 = Math.min(n - 1, r.pk + Math.round(0.12 * fps));
        const d = sub(rel[i1], rel[i0]);
        return l.cls === 'hook' ? -sg * d[0] + Math.max(0, d[2]) * (l.note?.includes('wide') ? 1 : 0) : l.cls === 'uppercut' ? d[1] : len(rel[i1]) - len(rel[i0]);
      };
      const byClass = l.cls === 'hook' || l.cls === 'uppercut' || l.cls === 'straight'
        ? runs.filter(inSpan).sort((x, y) => travel(y) - travel(x))[0] : undefined;
      const best = byClass ?? runs.filter((r) => Math.abs(r.on - l.at * fps) <= 0.15 * fps).sort((x, y) => Math.abs(x.on - l.at * fps) - Math.abs(y.on - l.at * fps))[0];
      const pk = best ? best.pk : peakIn(v, lo, hi);
      const on = best ? best.on : onsetBack(v, pk);
      const lead = opt.lead ?? (leads ??= leadTrack(clip))[Math.max(0, Math.min(n - 1, Math.floor(on)))];
      const name = l.cls === 'straight' ? (h === lead ? 'jab' : 'cross') : l.cls;   // 'any': a blow the eye would not name
      out.push({ ...base, name, lead, onset: ms(on), peak: ms(pk) });
    } else if (l.kind === 'legKick') {
      const h = l.hand!;
      const rel = F.map((j) => sub(j[`${J(h)}Foot`], j[`${J(h)}UpLeg`]));
      const v = speed(rel, fps);
      const pk = peakIn(v, lo, hi);
      // the knee's height relative to its hip, rising (the reader's riseOnset rule, on the clean rate)
      const kr = rate(F.map((j) => j[`${J(h)}Leg`][1] - j[`${J(h)}UpLeg`][1]), fps);
      const ts = kr.map((_, i) => (i / fps) * 1000);
      const r = riseOnset(ts, kr, pk);
      const on = r !== null ? (r / 1000) * fps : onsetBack(v, pk);
      out.push({ ...base, name: l.cls, lead: null, onset: ms(on), peak: ms(pk) });
    } else if (l.kind === 'guard') {
      const z = P().map(guardZoneOf);
      let t: number | null = null;
      for (let i = Math.max(1, lo); i <= hi && t === null; i++) {
        const both = z[i][0] && z[i][1], was = z[i - 1][0] && z[i - 1][1];
        if (l.cls === 'raise' && both && !was) t = i;
        if (l.cls === 'drop' && !both && was) t = i;
      }
      if (t !== null) out.push({ ...base, name: l.cls, lead: null, onset: ms(t), peak: ms(t) });
    } else if (l.kind === 'evade') {
      const pp = P();
      const hipMid = (p: V3[]) => mid(p[LEFT_HIP], p[RIGHT_HIP]);
      if (l.cls === 'slip') {
        const lat = pp.map((p) => p[NOSE][0] - hipMid(p)[0]);
        const v = rate(lat, fps).map((x) => Math.abs(x));
        const pk = peakIn(v, lo, hi);
        out.push({ ...base, name: 'slip', lead: null, onset: ms(onsetBack(v, pk)), peak: ms(pk) });
      } else {
        const v = rate(pp.map((p) => p[NOSE][1]), fps).map((x) => Math.max(0, -x));
        const pk = peakIn(v, lo, hi);
        out.push({ ...base, name: 'duck', lead: null, onset: ms(onsetBack(v, pk)), peak: ms(pk) });
      }
    } else if (l.kind === 'fightStep') {
      const h = l.hand!;
      const v = speed(F.map((j) => [j[`${J(h)}Foot`][0], 0, j[`${J(h)}Foot`][2]] as V3), fps);
      const pk = peakIn(v, lo, hi);
      out.push({ ...base, name: l.cls, lead: null, onset: ms(onsetBack(v, pk)), peak: ms(pk) });
    } else {
      const yaw = P().map((p) => { const s = sub(p[LEFT_SHOULDER], p[RIGHT_SHOULDER]); return Math.atan2(-s[2], s[0]); });
      for (let i = 1; i < yaw.length; i++) { while (yaw[i] - yaw[i - 1] > Math.PI) yaw[i] -= 2 * Math.PI; while (yaw[i] - yaw[i - 1] < -Math.PI) yaw[i] += 2 * Math.PI; }
      const v = rate(yaw, fps).map((x) => Math.abs(x));
      const pk = peakIn(v, lo, hi);
      out.push({ ...base, name: 'turn', lead: null, onset: ms(onsetBack(v, pk)), peak: ms(pk) });
    }
  }
  return out.sort((x, y) => x.onset - y.onset);
}

/**
 * Every motion of a speed series, split at its speed minima: each local peak of at least `minPeak`, from the minimum before
 * it to the minimum after, two peaks joined when the dip between them stays above `join` of the smaller (one motion's
 * double hump). A punch out and its way back are two runs; a punch thrown straight out of a retraction is its own run
 * (the first sheets cut runs at a 0.6 m/s crossing and hid both). Indices [a, pk, b].
 */
export function segmentRuns(v: readonly number[], minPeak = 2.0, join = 0.6): { a: number; pk: number; b: number }[] {
  const n = v.length, peaks: number[] = [];
  for (let i = 1; i < n - 1; i++) if (v[i] >= minPeak && v[i] >= v[i - 1] && v[i] > v[i + 1]) peaks.push(i);
  const runs: { a: number; pk: number; b: number }[] = [];
  for (const p of peaks) {
    let a = p; while (a > 0 && v[a - 1] <= v[a]) a--;
    let b = p; while (b < n - 1 && v[b + 1] <= v[b]) b++;
    const last = runs[runs.length - 1];
    if (last && a <= last.b) {
      const dip = Math.min(...v.slice(last.pk, p + 1));
      if (dip > join * Math.min(v[last.pk], v[p])) { if (v[p] > v[last.pk]) last.pk = p; last.b = b; continue; }
    }
    runs.push({ a, pk: p, b });
  }
  return runs;
}

/**
 * Every extension of a hand in [from, to] (s): the wrist's distance from its shoulder rising from a low to a high (turning
 * points with EXT_HYST of the arm's hysteresis) by at least `gain` of the arm, fast (peak speed ≥ minV). The truth's
 * onset is the speed run's (25 % of its peak inside the rise, never before the rise began). A take-wide eye label ("every
 * punch out in this stretch is a straight") made per extension — by the REACH, not by speed runs: 80_10's speed profile
 * dips mid-punch, and runs cut at speed minima split one punch in two or hid it (the first two sheets).
 */
export const EXT_HYST = 0.1;
/** The reach's rises: from each low turning point to the next high (EXT_HYST hysteresis), with the fastest sample
 *  inside, the gain (share of the arm) and the peak speed. */
export function reachRises(clip: JointClip, hand: Hand): { a: number; b: number; pk: number; gain: number; v: number }[] {
  const fps = clip.fps, F = clip.frames, s = J(hand), n = F.length;
  const rel = F.map((j) => sub(j[`${s}Hand`], j[`${s}Arm`]));
  const arm = len(sub(F[0][`${s}ForeArm`], F[0][`${s}Arm`])) + len(sub(F[0][`${s}Hand`], F[0][`${s}ForeArm`]));
  const reach = rel.map((r) => len(r) / arm);
  const v = speed(rel, fps);
  const turns: { i: number; hi: boolean }[] = [];
  let lo = 0, hi = 0, up: boolean | null = null;
  for (let i = 1; i < n; i++) {
    if (reach[i] > reach[hi]) hi = i;
    if (reach[i] < reach[lo]) lo = i;
    if (up !== true && reach[i] - reach[lo] >= EXT_HYST) { turns.push({ i: lo, hi: false }); up = true; hi = i; }
    else if (up !== false && reach[hi] - reach[i] >= EXT_HYST) { turns.push({ i: hi, hi: true }); up = false; lo = i; }
  }
  if (up === true) turns.push({ i: hi, hi: true });
  const out: { a: number; b: number; pk: number; gain: number; v: number }[] = [];
  for (let k = 0; k + 1 < turns.length; k++) {
    const x = turns[k], y = turns[k + 1];
    if (x.hi || !y.hi) continue;
    let pk = x.i; for (let i = x.i; i <= y.i; i++) if (v[i] > v[pk]) pk = i;
    out.push({ a: x.i, b: y.i, pk, gain: reach[y.i] - reach[x.i], v: v[pk] });
  }
  return out;
}
/** A full punch: the reach at its top at least this share of the arm (a shorter push is a pump, a feint: see `partial`). */
export const FULL_REACH = 0.8;
export function extensionRuns(clip: JointClip, hand: Hand, from: number, to: number, o: { minV?: number; gain?: number; partial?: boolean } = {}): number[] {
  const fps = clip.fps, s = J(hand), F = clip.frames;
  const rel = F.map((j) => sub(j[`${s}Hand`], j[`${s}Arm`]));
  const arm = len(sub(F[0][`${s}ForeArm`], F[0][`${s}Arm`])) + len(sub(F[0][`${s}Hand`], F[0][`${s}ForeArm`]));
  const v = speed(rel, fps);
  const gain = o.gain ?? 0.25, minV = o.minV ?? 2.0;
  return reachRises(clip, hand).filter((r) => r.gain >= gain && r.v >= minV && (len(rel[r.b]) / arm >= FULL_REACH) === !o.partial)
    .map((r) => onsetBack(v, r.pk, ONSET_SHARE, r.a) / fps).filter((on) => on >= from && on < to);
}

/** Every kick of a foot in [from, to] (s): an ankle run relative to the hips topping `topM` m off the floor with the leg
 *  straightening past `straight` of its length — the eye's take-wide label, per kick. Returns each run's start (s). */
export function kickRuns(clip: JointClip, foot: Hand, from: number, to: number, o: { minV?: number; topM?: number; straight?: number } = {}): number[] {
  const fps = clip.fps, n = clip.frames.length, F = clip.frames, s = J(foot);
  const rel = F.map((j) => sub(j[`${s}Foot`], j[`${s}UpLeg`]));
  const leg = len(sub(F[0][`${s}Leg`], F[0][`${s}UpLeg`])) + len(sub(F[0][`${s}Foot`], F[0][`${s}Leg`]));
  const v = speed(rel, fps);
  const minV = o.minV ?? 2.0, topM = o.topM ?? 0.5, straight = o.straight ?? 0.85;
  const out: number[] = [];
  for (let i = Math.max(1, Math.round(from * fps)); i < Math.min(n, Math.round(to * fps)); i++) {
    if (!(v[i] > 0.6 && v[i - 1] <= 0.6)) continue;
    let e = i, pk = i, top = 0, st = 0;
    const y0 = F[i][`${s}Foot`][1];
    while (e < n && v[e] > 0.6) { if (v[e] > v[pk]) pk = e; top = Math.max(top, F[e][`${s}Foot`][1]); st = Math.max(st, len(rel[e]) / leg); e++; }
    // a kick OUT: the foot rises from where the run began (its way back down starts high)
    if (v[pk] >= minV && top >= topM && top - y0 >= 0.3 && st >= straight) out.push(i / fps);
    i = e;
  }
  return out;
}
