// rideGrade — the ride controls against their labels (movement play P8, 2026-09-26): the gate's numbers (lib/pose/
// rideGate.test.ts) and the report's (scripts/body/ride.mts → p8/RIDE.md), one implementation (grade.ts's pattern).
//
// A labelled stream (lib/pose/rideStreams) is shot under a camera condition, read (BodyReader → ChannelReader + the ride
// read), and replayed through the seam with each P8 row it concerns (seamReplay, 'playing' held: what the MODE received).
// What is graded (PLAN-P8 §8.4):
//   continuous  carve / wheel / bank / pitch / trim on the bus's stick: SEGMENT RECALL (the right sign at the class's
//               threshold inside its window), PRECISION (every non-zero span ≥ 150 ms overlaps a same-sign truth or an
//               allowed window), per-frame SIGN agreement past onset + 200 ms, the median |value| per class, LATENCY;
//   events      pop (the hop's button), hopTurn (the drift's hold), grab and quarter (the ride read's own transitions —
//               what every mode's RideIntents takes), push (a kick-push step), stride (a step with a lift behind it),
//               high knees (the trigger), dip: precision / recall inside [from − 100, to + 350 + lag], hand / edge /
//               direction accuracy;
//   rest        on a negative stream after the stance: the carve before the dead band (max, p99 in CARVE_ON units),
//               and EVERYTHING emitted must be nothing (a floor output of any kind outside an allowed window, a grab, a
//               quarter, a push, a dip).
// Pure: no DOM, no fs.
import type { PoseFrame } from './landmarks';
import { bodyPackets, seamReplay, type SeamEmitted, type SeamReplay, type StreamPacket } from './seamReplay';
import { shoot, type RideCondition, type RideControl, type RideSeg, type RideStream } from './rideStreams';
import { CARVE_ON } from './rideReader';
import type { BodyProfile } from '../input/bodyProfiles';
import type { BodyEvent } from './BodyReader';
import type { BodyView } from '../babylon/core/ModeHarness';
import { KickPush, RideIntents } from '../babylon/core/rideBody';

export interface RideRun {
  stream: RideStream;
  cond: RideCondition;
  frames: PoseFrame[];
  packets: StreamPacket[];
  replays: Record<string, SeamReplay>;
}

/** Shoot, read and replay a stream with the given rows (keyed by row key). */
export function rideRun(stream: RideStream, cond: RideCondition, rows: readonly BodyProfile[]): RideRun {
  const frames = shoot(stream, cond).frames;
  const packets = bodyPackets(frames);
  const replays: Record<string, SeamReplay> = {};
  for (const p of rows) replays[p.key] = seamReplay(packets, { profile: p, phase: 'playing', name: stream.name });
  return { stream, cond, frames, packets, replays };
}

// ── what the mode received ───────────────────────────────────────────────────────────────────────────────────────

export interface Sample { t: number; at: number; x: number; y: number; rt: number; held: Set<string> }
/** The mode's held state after each bus event, on the capture clock. */
export function trace(r: SeamReplay): Sample[] {
  const s: Sample = { t: -Infinity, at: -Infinity, x: 0, y: 0, rt: 0, held: new Set() };
  const out: Sample[] = [];
  for (const b of r.bus) {
    const e = b.e;
    if (e.t === 'stick' && e.side === 'L') { s.x = e.x; s.y = e.y; }
    else if (e.t === 'trigger' && e.side === 'R') s.rt = e.value;
    else if (e.t === 'button' || e.t === 'dpad') { const k = e.t === 'button' ? `b:${e.btn}` : `d:${e.dir}`; if (e.pressed) s.held.add(k); else s.held.delete(k); }
    out.push({ ...s, t: b.t, at: b.at, held: new Set(s.held) });
  }
  return out;
}
/** The held state at capture time t. */
export function at(tr: readonly Sample[], t: number): Sample {
  let last: Sample = { t: -Infinity, at: -Infinity, x: 0, y: 0, rt: 0, held: new Set() };
  for (const s of tr) { if (s.t > t) break; last = s; }
  return last;
}
const presses = (r: SeamReplay, key: string): SeamEmitted[] =>
  r.bus.filter((b) => (b.e.t === 'button' ? `b:${b.e.btn}` : b.e.t === 'dpad' ? `d:${b.e.dir}` : '') === key && (b.e as { pressed?: boolean }).pressed);

// ── the ride read's own events (what the modes' RideIntents take) ────────────────────────────────────────────────

export interface ReadEvents {
  /** t: the capture instant; at: when the page had it (the packet's arrival) */
  quarters: { t: number; at: number; dir: 'fs' | 'bs'; side: 'L' | 'R' }[];
  grabs: { on: number; at: number; off: number; hand: 'lead' | 'rear'; edge: 'toe' | 'heel' | null }[];
  pushes: { t: number; at: number }[];
  dips: { t: number; at: number }[];
  stanceAt: number | null;
  stance: { kind: string; lead: string | null } | null;
}
const viewOf = (p: StreamPacket): BodyView => ({ read: p.read, channels: p.channels, arrivedAt: p.arrivedAt, lagMs: p.arrivedAt - p.read.t });
export function readEvents(packets: readonly StreamPacket[]): ReadEvents {
  const out: ReadEvents = { quarters: [], grabs: [], pushes: [], dips: [], stanceAt: null, stance: null };
  let seq = 0;
  let g: ReadEvents['grabs'][number] | null = null;
  const dip = new RideIntents();
  const push = new KickPush();
  for (const p of packets) {
    const r = p.channels.ride;
    if (!r) continue;
    if (r.stance && out.stanceAt === null) { out.stanceAt = p.read.t; out.stance = { kind: r.stance.kind, lead: r.stance.lead }; }
    const q = r.turn.quarter;
    if (q && q.seq !== seq) { seq = q.seq; out.quarters.push({ t: q.t, at: p.arrivedAt, dir: q.dir, side: q.side }); }
    // (an unread frame is no news: a hand held down through a missed detection or a blink is one grab)
    if (p.read.tracking && r.grab && !g) { g = { on: p.read.t, at: p.arrivedAt, off: Infinity, hand: r.grab.hand, edge: r.grab.edge }; out.grabs.push(g); }
    if (p.read.tracking && !r.grab && g) { g.off = p.read.t; g = null; }
    // (a kick-push steps twice — down to the ground and back on the board: KickPush takes one per push, as skate does)
    for (const ev of p.events) if (ev.kind === 'step' && push.take(ev as Extract<BodyEvent, { kind: 'step' }>, viewOf(p))) out.pushes.push({ t: ev.t, at: p.arrivedAt });
    for (const it of dip.poll(viewOf(p), { airborne: false })) if (it.kind === 'dip') out.dips.push({ t: p.read.t, at: p.arrivedAt });
  }
  return out;
}

// ── the grades ───────────────────────────────────────────────────────────────────────────────────────────────────

export type Axis = 'x' | 'y';
export const CONTROL_AXIS: Partial<Record<RideControl, Axis>> = { carve: 'x', wheel: 'x', bank: 'x', pitch: 'y', trim: 'y' };

export interface ContinuousGrade {
  segs: number; hits: number;
  /** per segment: the median |value| over its hold, the latency (ms from the window's start to the first right-signed
   *  value at the threshold; null = missed) and the share of its non-zero frames with the right sign. */
  per: { level: number | undefined; sign: number; medAbs: number; latencyMs: number | null; signShare: number | null }[];
  spans: number; spansOk: number;
}
/**
 * A continuous control on one row's replay. A segment HITS when the mode's value on `axis` reaches `threshold` with the
 * segment's sign inside [from, to]. A SPAN is a stretch (≥ 150 ms) of non-zero value on that axis after `gradeFrom`: it is
 * OK when it overlaps a same-signed segment of that control (or an allowed window).
 */
export function gradeContinuous(run: RideRun, rowKey: string, control: RideControl, threshold = 0.1): ContinuousGrade {
  const axis = CONTROL_AXIS[control]!;
  const r = run.replays[rowKey], tr = trace(r);
  const segs = run.stream.segs.filter((s) => s.control === control);
  const val = (s: Sample) => (axis === 'x' ? s.x : s.y);
  const out: ContinuousGrade = { segs: segs.length, hits: 0, per: [], spans: 0, spansOk: 0 };
  const lastT = run.packets[run.packets.length - 1]?.read.t ?? 0;
  for (const seg of segs) {
    const sign = seg.sign ?? 1;
    const inWin = tr.filter((s) => s.t >= seg.from && s.t <= seg.to);
    // the held value over the window, sampled every 33 ms (the state between events counts)
    const samples: number[] = [];
    for (let t = seg.from + 300; t <= seg.to - 300; t += 33) samples.push(val(at(tr, t)));
    const nz = samples.filter((v) => v !== 0);
    const first = inWin.find((s) => Math.sign(val(s)) === sign && Math.abs(val(s)) >= threshold);
    const hit = !!first || (Math.sign(val(at(tr, seg.from))) === sign && Math.abs(val(at(tr, seg.from))) >= threshold);
    if (hit) out.hits++;
    const abs = samples.map((v) => Math.abs(v)).sort((a, b) => a - b);
    out.per.push({
      level: seg.level, sign, medAbs: abs.length ? abs[abs.length >> 1] : 0,
      // LATENCY is the ARRIVAL (the page's clock, the camera's lag in it) minus the truth's instant (capture clock: the
      // synth's t0 is 0 on both)
      latencyMs: first ? first.at - (seg.engage ?? seg.onset ?? seg.from) : hit ? 0 : null,
      signShare: nz.length ? nz.filter((v) => Math.sign(v) === sign).length / nz.length : null,
    });
  }
  // spans of non-zero value
  const allow = run.stream.allow?.[control] ?? [];
  let from: number | null = null, sgn = 0;
  const close = (end: number) => {
    if (from === null) return;
    if (end - from >= 150) {
      out.spans++;
      const ok = segs.some((s) => (s.sign ?? 1) === sgn && s.from <= end && s.to >= from!) || allow.some(([a, b]) => a <= end && b >= from!);
      if (ok) out.spansOk++;
    }
    from = null;
  };
  for (let t = run.stream.gradeFrom; t <= lastT + 200; t += 16) {
    const v = val(at(tr, t));
    if (v !== 0 && from === null) { from = t; sgn = Math.sign(v); }
    else if (v !== 0 && Math.sign(v) !== sgn) { close(t); from = t; sgn = Math.sign(v); }
    else if (v === 0 && from !== null) close(t);
  }
  close(lastT + 200);
  return out;
}

export interface EventGrade { truth: number; found: number; matched: number; extra: number; latencies: number[]; named: number; namedOk: number }
/** Events (instants) against the stream's segments of `control`: matched inside [from − 100, to + 350 + lag]. */
export function gradeEvents(run: RideRun, control: RideControl, instants: readonly { t: number; at?: number; ok?: (seg: RideSeg) => boolean }[]): EventGrade {
  const lag = run.cond.latencyMs;
  const segs = run.stream.segs.filter((s) => s.control === control);
  const used = new Set<RideSeg>();
  const out: EventGrade = { truth: segs.length, found: instants.length, matched: 0, extra: 0, latencies: [], named: 0, namedOk: 0 };
  for (const e of instants) {
    const seg = segs.find((s) => !used.has(s) && e.t >= s.from - 100 && e.t <= s.to + 350 + lag);
    if (!seg) {
      const allowed = (run.stream.allow?.[control] ?? []).some(([a, b]) => e.t >= a && e.t <= b);
      if (!allowed && e.t >= run.stream.gradeFrom) out.extra++;
      continue;
    }
    used.add(seg); out.matched++;
    out.latencies.push((e.at ?? e.t) - (seg.engage ?? seg.onset ?? seg.from));
    if (e.ok) { out.named++; if (e.ok(seg)) out.namedOk++; }
  }
  return out;
}

/** The hop's button presses (a row that binds takeoff), on the capture clock. */
export const popPresses = (run: RideRun, rowKey: string, btn = 'A') => presses(run.replays[rowKey], `b:${btn}`).map((b) => ({ t: b.t, at: b.at }));

/** Rest on a negative stream (after gradeFrom): the carve before its dead band, and every output of every row. */
export function restDrift(run: RideRun): { carveMax: number; carveP99: number; outputs: string[] } {
  const carves: number[] = [];
  // (on the ground: the floor holds the stick through a jump, so the carve read in the air never reaches a mode)
  for (const p of run.packets) if (p.read.t >= run.stream.gradeFrom && !p.channels.inJump && p.channels.ride?.carve != null) carves.push(Math.abs(p.channels.ride.carve));
  carves.sort((a, b) => a - b);
  const outputs: string[] = [];
  for (const [key, r] of Object.entries(run.replays)) {
    for (const b of r.bus) {
      if (b.t < run.stream.gradeFrom) continue;
      const e = b.e;
      const control: RideControl | null = e.t === 'trigger' ? (key === 'freerun' ? 'highKnees' : 'crouch') : e.t === 'button' && e.btn === 'A' ? 'pop'
        : e.t === 'button' && e.btn === 'X' ? 'hopTurn' : e.t === 'stick' ? (key === 'surf' && e.x === 0 ? 'trim' : 'carve') : null;
      // (surf's trim is the crouch's rhythm: a crouch's window allows its strokes)
      const wins = [...(control ? run.stream.allow?.[control] ?? [] : []), ...(control === 'trim' ? run.stream.allow?.crouch ?? [] : [])];
      const allowed = control && (wins.some(([a, c]) => b.t >= a && b.t <= c) || run.stream.segs.some((s) => s.control === control && b.t >= s.from - 100 && b.t <= s.to + 600));
      if (e.t === 'stick' && e.x === 0 && e.y === 0) continue;   // a return to neutral is never an output
      if (e.t === 'trigger' && e.value === 0) continue;
      if (e.t === 'button' && !e.pressed) continue;
      if (!allowed) outputs.push(`${key}:${e.t === 'stick' ? `L(${e.x},${e.y})` : e.t === 'trigger' ? `RT ${e.value}` : e.t === 'button' ? e.btn : e.t}@${Math.round(b.t)}`);
    }
  }
  const ev = readEvents(run.packets);
  for (const q of ev.quarters) if (q.t >= run.stream.gradeFrom && !run.stream.segs.some((s) => s.control === 'quarter')) outputs.push(`quarter ${q.dir}@${Math.round(q.t)}`);
  for (const g of ev.grabs) if (g.on >= run.stream.gradeFrom && !run.stream.segs.some((s) => s.control === 'grab')) outputs.push(`grab ${g.hand}/${g.edge}@${Math.round(g.on)}`);
  for (const { t } of ev.pushes) if (t >= run.stream.gradeFrom && !run.stream.segs.some((s) => s.control === 'push')) outputs.push(`push@${Math.round(t)}`);
  for (const { t } of ev.dips) if (t >= run.stream.gradeFrom && !run.stream.segs.some((s) => s.control === 'dip')) outputs.push(`dip@${Math.round(t)}`);
  return { carveMax: carves.length ? carves[carves.length - 1] / CARVE_ON : 0, carveP99: carves.length ? carves[Math.floor(carves.length * 0.99)] / CARVE_ON : 0, outputs };
}

/** p50 / p90 of a list (ms), rounded; null when empty. */
export function pcts(v: readonly number[]): { p50: number; p90: number } | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  return { p50: Math.round(s[Math.floor((s.length - 1) * 0.5)]), p90: Math.round(s[Math.floor((s.length - 1) * 0.9)]) };
}
