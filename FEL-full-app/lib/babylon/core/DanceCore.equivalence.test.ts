// DanceCore equivalence: movement play phase 9 must not change BUTTON play.
//
// Phase 9 rewrote DancePerformance.update()'s expiry (every pending step now expires on its own clock), taught hit() to
// pass over body steps, and added hitBody / consumedEarly / begun, body windows and a late grace; the cue lane gained a
// `move` on every cue. This file drives the live core and a frozen copy of the pre-P9 one
// (tests/fixtures/dance-pre-p9/DanceCore.base.ts, byte-for-byte 7ee51e4e) with the SAME presses on the SAME clock and
// requires the same answer at every step: each hit()'s judgement, every onJudged / onStepFired callback (label, points,
// combo, which step, the signed delta, and the score the mode reads inside the callback), score / combo / maxCombo /
// counts / running after every call, peekNext and upcoming after every frame, the cue lane, and the final result
// (stars and accuracy compared with Object.is).
//
// The input covers every shipped track at every difficulty, the player's exported-song path (routineFromGroove), and
// stress charts (ties, unsorted input, overlapping windows, a step on beat 0, an empty chart), under seeded player
// models (perfect, jitter inside and outside every window, window edges, presses landing EXACTLY on the core's edges in
// float arithmetic, misses, double and same-instant presses, presses between steps, a held key's auto-repeat, mashing, a
// beat-grid bot, noise), frame clocks of 8–50 ms with long hitches, a frozen audio clock, a pause that drops input and
// frames landing exactly on each step's fire and expiry instants, three ways a press is stamped (its own time, the
// frame's audio time, the audio render quantum), both orders of input and update, quitting, GO AGAIN on the same
// instance, and presses before start(). Half the runs also feed the new core stray body events and a body timing, which
// a press-only chart must ignore.
//
// Two differences are real and pinned, not waved through (see their tests at the bottom):
//   1. start(0): the old peekNext/upcoming tested `!this.started`, so a chart started at exactly t = 0 showed no
//      upcoming step until one fired (the drills run on their own clock from 0; DanceMode never starts at 0: its
//      startAt is the audio clock + a four-beat count-in). The new core shows them. Judging is identical either way.
//   2. Re-entry: the old update() advanced nextIdx AFTER onStepFired, so upcoming() called from inside onStepFired
//      listed the firing step twice. No consumer does that (DanceMode's playStep only plays a clip).

import { describe, it, expect } from 'vitest';
import * as NEW from './DanceCore';
import * as OLD from '@/tests/fixtures/dance-pre-p9/DanceCore.base';
import { DANCE_TRACKS, cueLane } from './danceTracks';
import { cueLane as oldCueLane } from '@/tests/fixtures/dance-pre-p9/danceTracks.base';
import { routineFromGroove, type DrumRole, type GrooveHit } from '../music/DanceExport';
import { LIMBS, MOVE_KINDS, type BodyHit } from './bodyTargets';

type Step = NEW.DanceStep;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (rnd: () => number): number => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

// Exact boundaries. A random clock never lands a frame or a press ON a comparison's edge (`<` vs `<=` differ only
// there), so the edge clock and the exactEdges player solve for float instants where the core's own arithmetic gives
// the edge exactly, and one ulp either side.
const F64 = new Float64Array(1), I64 = new BigInt64Array(F64.buffer);
function nextUp(x: number): number {
  if (x === 0) return Number.MIN_VALUE;
  F64[0] = x; I64[0] += x > 0 ? 1n : -1n;
  return F64[0];
}
const nextDown = (x: number): number => -nextUp(-x);
/** A float near `guess` for which rel(v) === target in IEEE arithmetic, searched over its neighbours; null if none. */
function exactly(guess: number, rel: (v: number) => number, target: number): number | null {
  let lo = guess, hi = guess;
  for (let k = 0; k < 64; k++) {
    if (rel(lo) === target) return lo;
    if (rel(hi) === target) return hi;
    lo = nextDown(lo); hi = nextUp(hi);
  }
  return null;
}

/** Deep equality with Object.is on every leaf: -0 vs 0 and NaN count, and a missing field is not undefined. */
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

// ── the charts ───────────────────────────────────────────────────────────────────────────────────────────────────────

interface Chart { id: string; bpm: number; steps: Step[]; shipped: boolean }

const lib = NEW.DANCE_LIBRARY;
const mk = (beats: number[], hold = 1): Step[] =>
  beats.map((beat, i) => ({ clipId: lib[i % lib.length].id, beat, holdBeats: hold, mirrored: i % 3 === 0 }));

function groove(bars: number, perBeat: number, roleAt: (i: number, beat: number) => DrumRole | null): GrooveHit[] {
  const hits: GrooveHit[] = [];
  for (let i = 0; i < bars * 4 * perBeat; i++) {
    const beat = i / perBeat;
    const role = roleAt(i, beat);
    if (role) hits.push({ beat, role, weight: 1 + (i % 3) });
  }
  return hits;
}
const HOUSE = groove(12, 2, (i, b) => (i % 2 ? 'hat' : b % 2 === 1 ? 'snare' : 'kick'));
const BUSY_ROLES: (DrumRole | null)[] = [
  'kick', 'hat', 'snare', 'hat', 'other', 'kick', null, 'snare', 'hat', 'kick', 'hat', 'snare', 'other', null, 'kick', 'hat',
];
const BUSY = groove(8, 4, (i) => BUSY_ROLES[i % BUSY_ROLES.length]);

const CHARTS: Chart[] = [];
for (const t of DANCE_TRACKS) {
  for (const d of [1, 2, 3] as const) {
    CHARTS.push({
      id: `${t.id}@d${d}${d === t.difficulty ? ' (shipped)' : ''}`, bpm: t.bpm, shipped: true,
      steps: NEW.generateRoutine({ bars: t.bars, difficulty: d, seed: t.seed }),
    });
  }
}
for (const d of [1, 2, 3] as const) {
  CHARTS.push({ id: `export:house@d${d}`, bpm: 124, shipped: false, steps: routineFromGroove(HOUSE, 12 * 4, d, 0x40a5e) });
  CHARTS.push({ id: `export:busy@d${d}`, bpm: 140, shipped: false, steps: routineFromGroove(BUSY, 8 * 4, d, 0xb05) });
}
const cypher = DANCE_TRACKS.find((t) => t.id === 'cypher')!;
CHARTS.push(
  // DanceCore.mash.test's routine: a step every second at 120 BPM
  { id: 'mash-routine', bpm: 120, shipped: false,
    steps: Array.from({ length: 16 }, (_, i) => ({ clipId: 'step', beat: i * 2, holdBeats: 1, mirrored: false })) },
  // ties and unsorted input: setRoutine's sort must keep equal beats in input order in both; one clip the lane can't name
  { id: 'ties-unsorted', bpm: 100, shipped: false,
    steps: [...mk([4, 0, 2, 2, 6, 6, 6, 1, 8, 8, 12, 9.5, 9.5]), { clipId: 'not_a_clip', beat: 2, holdBeats: 2, mirrored: true }] },
  // a step every 0.15 s: windows (±0.2 s) overlap, so several steps are pending at once
  { id: 'dense-200bpm', bpm: 200, shipped: false, steps: mk(Array.from({ length: 64 }, (_, i) => i * 0.5), 0.5) },
  // press steps written explicitly as move 'tap' (the old core never read `move`)
  { id: 'tap-tagged', bpm: cypher.bpm, shipped: false,
    steps: NEW.generateRoutine({ bars: cypher.bars, difficulty: cypher.difficulty, seed: cypher.seed })
      .map((s) => ({ ...s, move: 'tap' as const })) },
  { id: 'single-beat0', bpm: 96, shipped: false, steps: mk([0], 4) },
  { id: 'empty', bpm: 96, shipped: false, steps: [] },
);

// ── the players ──────────────────────────────────────────────────────────────────────────────────────────────────────

interface Timeline { times: number[]; holds: number[]; bd: number; startAt: number; endAt: number }
type Model = (tl: Timeline, rnd: () => number) => number[];

const EDGES = [0, 0.04, 0.09, 0.2, 0.0399999, 0.04000001, 0.0899999, 0.09000001, 0.1999999, 0.20000001];
const every = (from: number, to: number, dt: number): number[] => {
  const out: number[] = [];
  for (let t = from; t <= to; t += dt) out.push(t);
  return out;
};

const MODELS: Record<string, Model> = {
  perfect: (tl) => [...tl.times],
  tight: (tl, r) => tl.times.map((t) => t + (r() * 2 - 1) * 0.035),
  inWindow: (tl, r) => tl.times.map((t) => t + (r() * 2 - 1) * 0.2),
  edges: (tl, r) => tl.times.map((t) => t + (r() < 0.5 ? -1 : 1) * EDGES[Math.floor(r() * EDGES.length)]),
  outside: (tl, r) => tl.times.map((t) => t + (r() < 0.5 ? -1 : 1) * (0.2 + r() * 0.4)),
  earlyOnly: (tl, r) => tl.times.map((t) => t - (0.1 + r() * 0.2)),
  lateOnly: (tl, r) => tl.times.map((t) => t + 0.1 + r() * 0.2),
  earlyBias: (tl, r) => tl.times.map((t) => t - 0.07 + gauss(r) * 0.05),
  lateBias: (tl, r) => tl.times.map((t) => t + 0.07 + gauss(r) * 0.05),
  sloppy: (tl, r) => tl.times.flatMap((t, i) => {
    const out: number[] = [];
    if (r() >= 0.25) {
      const at = t + gauss(r) * 0.08;
      out.push(at);
      if (r() < 0.15) out.push(at + 0.03 + r() * 0.12);
    }
    const next = tl.times[i + 1] ?? t + tl.bd * 2;
    if (r() < 0.2) out.push(t + (next - t) * (0.3 + r() * 0.4));
    return out;
  }),
  silent: () => [],
  doubles: (tl, r) => tl.times.flatMap((t) => { const at = t + gauss(r) * 0.03; return [at, at + 0.02 + r() * 0.1]; }),
  sameInstant: (tl, r) => tl.times.flatMap((t) => { const at = t + gauss(r) * 0.04; return [at, at]; }),
  between: (tl) => tl.times.map((t, i) => (tl.times[i + 1] !== undefined ? (t + tl.times[i + 1]) / 2 : t + tl.bd)),
  // a held key's auto-repeat, delivered as presses: the down, then 30 Hz after a 0.5 s delay for the step's hold
  holdRepeat: (tl, r) => tl.times.flatMap((t, i) => {
    const at = t + gauss(r) * 0.03;
    return [at, ...every(at + 0.5, at + tl.holds[i], 1 / 30)];
  }),
  masher: (tl) => every(tl.startAt - 0.3, tl.endAt, 0.125),
  beatGrid: (tl) => every(tl.startAt, tl.endAt, tl.bd),
  // presses ON the edges the core compares against: a window edge late or early (the pending-step and upcoming-step
  // paths), one ulp past it, and a wild tap exactly SPAM_LOCK_SEC before an on-time hit
  exactEdges: (tl, r) => tl.times.flatMap((T) => {
    const w = [0.04, 0.09, NEW.MISS_AFTER][Math.floor(r() * 3)];
    const kind = Math.floor(r() * 4);
    if (kind === 3) {
      const wild = exactly(T - NEW.SPAM_LOCK_SEC, (v) => T - v, NEW.SPAM_LOCK_SEC);
      return wild === null ? [T] : [wild, T];
    }
    const at = kind === 1 ? exactly(T - w, (v) => T - v, w) : exactly(T + w, (v) => v - T, w);
    if (at === null) return [T];
    return [kind === 2 ? (r() < 0.5 ? nextUp(at) : nextDown(at)) : at];
  }),
  chaos: (tl, r) => {                                   // presses at random, three a second on average
    const out: number[] = [];
    for (let t = tl.startAt - 0.5; t < tl.endAt; t += -Math.log(1 - r()) / 3) out.push(t);
    return out;
  },
};
const MODEL_NAMES = Object.keys(MODELS);

// ── the clocks ───────────────────────────────────────────────────────────────────────────────────────────────────────

type Clock = 'f60' | 'var' | 'hitch' | 'freeze' | 'pause' | 'edge';
type Stamp = 'exact-inputFirst' | 'exact-updateFirst' | 'frame' | 'quantum';
type Life = 'full' | 'drain' | 'quit' | 'retry' | 'prestart';
type StartKind = 'mode' | 'zero' | 'late';
const CLOCKS: Clock[] = ['f60', 'var', 'hitch', 'freeze', 'pause', 'edge'];
const STAMPS: Stamp[] = ['exact-inputFirst', 'exact-updateFirst', 'frame', 'quantum'];
const LIVES: Life[] = ['full', 'drain', 'quit', 'retry', 'prestart'];
const STARTS: StartKind[] = ['mode', 'zero', 'late'];
/** The Web Audio render quantum at 48 kHz: AudioContext.currentTime moves in steps of this. */
const QUANTUM = 128 / 48000;

/** Frame times from `from` to past `to`, plus the span a pause swallowed (its presses are never delivered). The edge
 *  clock adds, for every step (s0 = its run's start, off = beat × beat duration), the frames where it exactly fires
 *  (now − s0 === off) and exactly reaches its expiry (now − MISS_AFTER === its time), and one ulp either side. */
function frameTimes(
  clock: Clock, rnd: () => number, from: number, to: number, marks: { s0: number; off: number }[],
): { times: number[]; drop: [number, number] | null } {
  const times: number[] = [];
  const span = Math.max(0.5, to - from);
  const hitches = clock === 'hitch' ? [[from + span * 0.3, 0.8], [from + span * 0.7, 2.5]] : [];
  const pauseAt = clock === 'pause' ? from + span * (0.35 + rnd() * 0.3) : Infinity;
  let drop: [number, number] | null = null;
  let hi = 0, frozen = 0;
  let t = from + rnd() * (1 / 60);                       // the first playing frame lands somewhere after startAt
  while (t <= to) {
    times.push(t);
    let dt = clock === 'f60' ? 1 / 60 : 0.008 + rnd() * 0.042;
    if (clock === 'freeze') {
      if (frozen > 0) { frozen--; dt = 0; } else if (rnd() < 0.02) { frozen = 3 + Math.floor(rnd() * 10); dt = 0; }
    }
    if (hi < hitches.length && t + dt >= hitches[hi][0]) { dt += hitches[hi][1]; hi++; }
    if (t < pauseAt && t + dt >= pauseAt) { drop = [t, t + dt + 4]; dt += 4; }
    t += dt;
  }
  times.push(t);
  if (clock === 'edge') {
    const extra: number[] = [];
    for (const { s0, off } of marks) {
      const T = s0 + off;
      for (const v of [exactly(T, (x) => x - s0, off), exactly(T + NEW.MISS_AFTER, (x) => x - NEW.MISS_AFTER, T)]) {
        if (v !== null && v >= from && v <= to) extra.push(nextDown(v), v, nextUp(v));
      }
    }
    return { times: [...times, ...extra].sort((a, b) => a - b), drop };
  }
  return { times, drop };
}

// ── one run: both cores, the same input ──────────────────────────────────────────────────────────────────────────────

interface Run { chart: Chart; model: string; clock: Clock; stamp: Stamp; life: Life; start: StartKind; bodyNoise: boolean; seed: number }
interface Tally {
  runs: number; frames: number; presses: number; judged: number; fired: number; bodyEvents: number;
  comparisons: number; differences: number; zeroStartFrames: number; zeroStartDiffers: number;
}
const newTally = (): Tally => ({
  runs: 0, frames: 0, presses: 0, judged: 0, fired: 0, bodyEvents: 0, comparisons: 0, differences: 0,
  zeroStartFrames: 0, zeroStartDiffers: 0,
});

/** The old core's peekNext/upcoming with its `!this.started` gate stepped over at a start of exactly 0: `started`
 *  becomes an object that is truthy and adds as 0, so the OLD code computes its own started ≠ 0 branch. */
function oldUngated<T>(o: OLD.DancePerformance, fn: () => T): T {
  const x = o as unknown as { started: unknown };
  if (x.started !== 0) return fn();
  x.started = { valueOf: () => 0 };
  try { return fn(); } finally { x.started = 0; }
}

function simulate(r: Run, tally: Tally): string | null {
  const rnd = mulberry32(r.seed);
  const bd = NEW.beatDuration(r.chart.bpm);
  const startAt = r.start === 'zero' ? 0 : r.start === 'late' ? 3600 + rnd() : 6 + rnd() * 24 + 4 * bd;

  const stepsN: Step[] = r.chart.steps.map((s) => ({ ...s }));
  const stepsO = r.chart.steps.map((s) => ({ ...s })) as OLD.DanceStep[];
  const idxN = new Map<object, number>(stepsN.map((s, i) => [s, i]));
  const idxO = new Map<object, number>(stepsO.map((s, i) => [s, i]));
  const n = new NEW.DancePerformance(r.chart.bpm);
  const o = new OLD.DancePerformance(r.chart.bpm);
  n.setRoutine(stepsN);
  o.setRoutine(stepsO);
  if (r.bodyNoise) n.setBody({ latencySec: 0.3, poseHz: 24, aspect: 0.75 });

  const evN: unknown[][] = [], evO: unknown[][] = [];
  n.onStepFired = (s) => evN.push(['fired', idxN.get(s)]);
  o.onStepFired = (s) => evO.push(['fired', idxO.get(s)]);
  // the mode reads perf.score inside onJudged (DanceMode's banner), so the callback-time state is part of the answer
  n.onJudged = (l, p, c, s, d) => evN.push(['judged', l, p, c, s ? idxN.get(s) : -1, d, n.score, n.combo, n.maxCombo]);
  o.onJudged = (l, p, c, s, d) => evO.push(['judged', l, p, c, s ? idxO.get(s) : -1, d, o.score, o.combo, o.maxCombo]);

  let op = 0;
  let begun = false;                                                          // start() has been called
  const where = (what: string) =>
    `${r.chart.id} · ${r.model} · ${r.clock}/${r.stamp}/${r.life}/${r.start}${r.bodyNoise ? '/body' : ''} · seed ${r.seed} · op ${op} · ${what}`;
  const snap = (p: NEW.DancePerformance | OLD.DancePerformance) =>
    [p.score, p.combo, p.maxCombo, p.counts.PERFECT, p.counts.GREAT, p.counts.GOOD, p.counts.MISS, p.running];
  const check = (what: string, a: unknown, b: unknown): string | null => {
    tally.comparisons++;
    return same(a, b) ? null : `${where(what)}: new ${JSON.stringify(a)} vs old ${JSON.stringify(b)}`;
  };
  const drainEvents = (): string | null => {
    for (const e of evN) { if (e[0] === 'judged') tally.judged++; else tally.fired++; }
    const bad = check('callbacks', evN, evO);
    evN.length = 0; evO.length = 0;
    return bad;
  };
  const afterCall = (): string | null => drainEvents() ?? check('state', snap(n), snap(o));
  const view = (up: { time: number; step: object }[], idx: Map<object, number>) => up.map((u) => [idx.get(u.step), u.time]);

  const hit = (t: number): string | null => {
    op++; tally.presses++;
    const jn = n.hit(t), jo = o.hit(t);
    return check('hit()', jn, jo) ?? afterCall();
  };
  const frame = (t: number): string | null => {
    op++; tally.frames++;
    n.update(t); o.update(t);
    const bad = afterCall();
    if (bad) return bad;
    const pkN = n.peekNext(t), upN = n.upcoming(t, 6);
    let pkO = o.peekNext(t), upO = o.upcoming(t, 6);
    if (begun && (o as unknown as { started: number }).started === 0) {   // pinned difference 1
      tally.zeroStartFrames++;
      const pk1 = oldUngated(o, () => o.peekNext(t)), up1 = oldUngated(o, () => o.upcoming(t, 6));
      if (!same(view(up1, idxO), view(upO, idxO)) || !same(pk1 && view([pk1], idxO), pkO && view([pkO], idxO))) tally.zeroStartDiffers++;
      pkO = pk1; upO = up1;
    }
    const b2 = check('peekNext()', pkN && view([pkN], idxN), pkO && view([pkO], idxO))
      ?? check('upcoming()', view(upN, idxN), view(upO, idxO));
    if (b2) return b2;
    // the cue lane: the same upcoming list into both lanes; a press cue gains `move: 'tap'` and nothing else changes
    const laneN = cueLane(upN, t), laneO = oldCueLane(upN, t);
    return check('cueLane()', laneN, laneO.map((c) => ({ ...c, move: 'tap' })));
  };

  const timeline = (s0: number, e: number): Timeline => {
    const sorted = [...r.chart.steps].sort((a, b) => a.beat - b.beat);
    return { times: sorted.map((s) => s0 + s.beat * bd), holds: sorted.map((s) => s.holdBeats * bd), bd, startAt: s0, endAt: e };
  };
  const b0 = check('totalBeats', n.totalBeats, o.totalBeats);
  if (b0) return b0;
  const songEnd = (s0: number) => s0 + (n.totalBeats + 1) * bd + 0.05;       // DanceMode: finish once songBeat > totalBeats + 1
  const lastStep = (s0: number) => s0 + (r.chart.steps.length ? Math.max(...r.chart.steps.map((s) => s.beat)) : 0) * bd;
  let end = r.life === 'drain' ? Math.max(songEnd(startAt), lastStep(startAt) + 1) : songEnd(startAt);
  const span = end - startAt;
  const quitAt = r.life === 'quit' ? startAt + span * (0.4 + rnd() * 0.2) : Infinity;
  const retryAt = r.life === 'retry' ? startAt + span * (0.3 + rnd() * 0.2) : Infinity;
  if (r.life === 'quit') end = quitAt + 2;                                    // two seconds of presses after stop()

  let presses = MODELS[r.model](timeline(startAt, end), rnd).filter((t) => t < retryAt);
  let restart = Infinity;
  if (r.life === 'retry') {
    restart = retryAt + 4 * bd;                                               // GO AGAIN on the same instance
    end = songEnd(restart);
    presses = presses.concat(MODELS[r.model](timeline(restart, end), rnd).filter((t) => t >= retryAt));
  }
  presses.sort((a, b) => a - b);

  // before start(): the cores have a chart and no clock. DanceMode drops count-in presses; the prestart life delivers them.
  op++;
  const pre = check('peekNext() before start', n.peekNext(startAt), o.peekNext(startAt))
    ?? check('upcoming() before start', view(n.upcoming(startAt), idxN), view(o.upcoming(startAt), idxO));
  if (pre) return pre;
  let pi = 0;
  if (r.life === 'prestart') {
    const early = [startAt - 0.9, startAt - 0.15, startAt - 0.01, ...presses.filter((t) => t < startAt)].sort((a, b) => a - b);
    for (const t of early) { const bad = hit(t) ?? frame(t); if (bad) return bad; }
  }
  while (pi < presses.length && presses[pi] < startAt) pi++;
  n.start(startAt); o.start(startAt);
  begun = true;
  const st = afterCall();
  if (st) return st;

  const marks = [startAt, ...(r.life === 'retry' ? [restart] : [])]
    .flatMap((s0) => r.chart.steps.map((s) => ({ s0, off: s.beat * bd })));
  const { times, drop } = frameTimes(r.clock, rnd, startAt, end, marks);
  const bodyTimes = r.bodyNoise ? every(startAt, end, 0.5).map((t) => t + rnd() * 0.5) : [];
  let bi = 0;
  let retried = false, quit = false;
  for (const f of times) {
    const batch: number[] = [];
    while (pi < presses.length && presses[pi] <= f) {
      const t = presses[pi++];
      if (!drop || t <= drop[0] || t >= drop[1]) batch.push(t);
    }
    const stamp = (t: number) => (r.stamp === 'frame' ? f : r.stamp === 'quantum' ? Math.floor(t / QUANTUM) * QUANTUM : t);
    if (r.stamp === 'exact-updateFirst') { const bad = frame(f); if (bad) return bad; }
    for (const t of batch) { const bad = hit(stamp(t)); if (bad) return bad; }
    if (r.stamp !== 'exact-updateFirst') { const bad = frame(f); if (bad) return bad; }

    // a camera left on during button play: body events on a press chart answer nothing and change nothing
    while (bi < bodyTimes.length && bodyTimes[bi] <= f) {
      op++; tally.bodyEvents++;
      const ev: BodyHit = { move: MOVE_KINDS[Math.floor(rnd() * MOVE_KINDS.length)] };
      if (rnd() < 0.8) ev.limb = LIMBS[Math.floor(rnd() * LIMBS.length)];
      if (rnd() < 0.5) { ev.x = rnd(); ev.y = rnd(); }
      const got = n.hitBody(bodyTimes[bi++], ev, { latencyCorrected: rnd() < 0.5 });
      const bad = check('hitBody() on a press chart', got, null) ?? afterCall();
      if (bad) return bad;
    }

    if (!quit && f >= quitAt) { quit = true; n.stop(); o.stop(); const bad = afterCall(); if (bad) return bad; }
    if (!retried && f >= retryAt) {
      retried = true;
      n.start(restart); o.start(restart);
      const bad = afterCall();
      if (bad) return bad;
    }
  }

  op++;
  n.stop(); o.stop();
  const last = times[times.length - 1] + 1;
  n.update(last); o.update(last);                                             // a stopped core ignores its clock
  const fin = afterCall()
    ?? check('result()', n.result(), o.result())
    ?? check('unplayed', (n as unknown as { unplayed: number }).unplayed, (o as unknown as { unplayed: number }).unplayed);
  if (fin) return fin;
  tally.runs++;
  return null;
}

/** The runs for one chart: every clock × stamp for a shipped track, seven or eight of the 24 for the rest; the life,
 *  the start and the body noise rotate so each chart × model meets all of them. */
function runsFor(chart: Chart, ci: number): Run[] {
  const out: Run[] = [];
  MODEL_NAMES.forEach((model, mi) => {
    const combos = CLOCKS.flatMap((clock) => STAMPS.map((stamp) => ({ clock, stamp })));
    const picked = chart.shipped ? combos : combos.filter((_, k) => (k + mi) % 10 < 3);
    picked.forEach(({ clock, stamp }, k) => {
      out.push({
        chart, model, clock, stamp,
        life: LIVES[(ci + mi + k) % LIVES.length],
        start: STARTS[(ci + 2 * mi + k) % STARTS.length],
        bodyNoise: (ci + mi + k) % 2 === 1,
        seed: (((ci + 1) * 7919) ^ ((mi + 1) * 104729) ^ ((k + 1) * 1299709)) >>> 0,
      });
    });
  });
  return out;
}

const TOTAL = newTally();

describe('DanceCore phase 9: button play is unchanged (differential against the frozen 7ee51e4e core)', () => {
  it('the generator, the windows, the library and the constants are the old ones', () => {
    expect(NEW.JUDGE_WINDOWS).toEqual(OLD.JUDGE_WINDOWS);
    expect([NEW.MISS_AFTER, NEW.WILD_TAP_COST, NEW.SPAM_LOCK_SEC]).toEqual([OLD.MISS_AFTER, OLD.WILD_TAP_COST, OLD.SPAM_LOCK_SEC]);
    expect(NEW.DANCE_LIBRARY).toEqual(OLD.DANCE_LIBRARY);
    for (const bpm of [0, 1, 60, 88, 96, 112, 124, 140, 200, -5]) {
      expect(Object.is(NEW.beatDuration(bpm), OLD.beatDuration(bpm))).toBe(true);
    }
    let charts = 0;
    for (let seed = 0; seed < 300; seed++) {
      for (const difficulty of [1, 2, 3] as const) {
        for (const bars of [1, 3, 12, 16, 33]) {
          for (const beatsPerBar of [undefined, 3]) {
            const opts = { bars, difficulty, seed: seed * 2654435761, beatsPerBar };
            expect(NEW.generateRoutine(opts)).toEqual(OLD.generateRoutine(opts));
            charts++;
          }
        }
      }
    }
    for (const t of DANCE_TRACKS) {
      const opts = { bars: t.bars, difficulty: t.difficulty, seed: t.seed };
      expect(NEW.generateRoutine(opts)).toEqual(OLD.generateRoutine(opts));
    }
    expect(charts).toBe(9000);
  });

  it('judgeDelta with one argument judges every delta as before', () => {
    const deltas = [NaN, Infinity, -Infinity, -0, 0, ...EDGES.flatMap((e) => [e, -e, e + Number.EPSILON, e - Number.EPSILON])];
    for (let d = -0.35; d <= 0.35; d += 0.00005) deltas.push(d);
    for (const d of deltas) expect(NEW.judgeDelta(d)).toEqual(OLD.judgeDelta(d));
    expect(deltas.length).toBeGreaterThan(14000);
  });

  it('result(): the same stars and accuracy for every count mix up to 12 of each (accuracyOf / starsFor is a pure move)', () => {
    const n = new NEW.DancePerformance(96), o = new OLD.DancePerformance(96);
    let mixes = 0;
    for (let p = 0; p <= 12; p++) for (let g = 0; g <= 12; g++) for (let d = 0; d <= 12; d++) for (let m = 0; m <= 12; m++) {
      n.counts = { PERFECT: p, GREAT: g, GOOD: d, MISS: m };
      o.counts = { PERFECT: p, GREAT: g, GOOD: d, MISS: m };
      n.score = o.score = p * 300 + g * 7; n.maxCombo = o.maxCombo = p + g;
      const a = n.result(), b = o.result();
      if (!same(a, b)) throw new Error(`result differs at ${p}/${g}/${d}/${m}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
      mixes++;
    }
    expect(mixes).toBe(13 ** 4);
  });

  for (const [ci, chart] of CHARTS.entries()) {
    it(`same presses, same judgements: ${chart.id} (${chart.steps.length} steps @ ${chart.bpm} BPM)`, () => {
      const tally = newTally();
      const diverged: string[] = [];
      const runs = runsFor(chart, ci);
      for (const r of runs) {
        const bad = simulate(r, tally);
        if (bad) { diverged.push(bad); tally.differences++; }
      }
      for (const k of Object.keys(tally) as (keyof Tally)[]) TOTAL[k] += tally[k];
      expect(diverged.slice(0, 5)).toEqual([]);
      expect(tally.runs).toBe(runs.length);
      if (chart.steps.length) expect(tally.judged).toBeGreaterThan(0);
    });
  }

  it('covered every shipped track at every difficulty, and every model, clock, stamp, life and start', () => {
    const all = CHARTS.flatMap((c, ci) => runsFor(c, ci));
    for (const t of DANCE_TRACKS) for (const d of [1, 2, 3]) expect(all.some((r) => r.chart.id.startsWith(`${t.id}@d${d}`))).toBe(true);
    for (const set of [MODEL_NAMES, CLOCKS, STAMPS, LIVES, STARTS]) {
      for (const v of set) expect(all.some((r) => Object.values(r).includes(v))).toBe(true);
    }
    for (const c of CHARTS.filter((x) => x.shipped)) {
      for (const life of LIVES) for (const start of STARTS) {
        expect(all.some((r) => r.chart === c && r.life === life && r.start === start)).toBe(true);
      }
    }
    // the tally is filled by the chart tests above (vitest runs a file's tests in order)
    expect(TOTAL.runs).toBe(all.length);
    expect(TOTAL.differences).toBe(0);
    console.info(
      `[dance-equivalence] ${CHARTS.length} charts (${CHARTS.filter((c) => c.shipped).length} shipped-track × difficulty) `
      + `× ${MODEL_NAMES.length} models: `
      + `${TOTAL.runs} runs, ${TOTAL.frames} frames, ${TOTAL.presses} presses, ${TOTAL.judged} judgements, ${TOTAL.fired} steps fired, `
      + `${TOTAL.bodyEvents} stray body events, ${TOTAL.comparisons} comparisons, ${TOTAL.differences} differences; `
      + `start(0) frames ${TOTAL.zeroStartFrames} (old cue gate changed the answer on ${TOTAL.zeroStartDiffers})`,
    );
  });

  it('pinned difference 1: a chart started at exactly 0 now shows its upcoming steps; the judging is identical', () => {
    const steps = mk([1, 2, 3, 4]);
    const n = new NEW.DancePerformance(60), o = new OLD.DancePerformance(60);
    n.setRoutine(steps.map((s) => ({ ...s }))); o.setRoutine(steps.map((s) => ({ ...s })));
    // never started: both show nothing
    expect(n.peekNext(0)).toBeNull(); expect(o.peekNext(0)).toBeNull();
    n.start(0); o.start(0);
    n.update(0.5); o.update(0.5);
    expect(o.peekNext(0.5)).toBeNull();                                  // the old gate: `!this.started` at a start of 0
    expect(o.upcoming(0.5)).toEqual([]);
    expect(n.peekNext(0.5)).toMatchObject({ time: 1 });
    expect(n.upcoming(0.5).map((u) => u.time)).toEqual([1, 2, 3, 4]);
    // once a step is pending the old core shows it (and only the pending ones): the new one shows the rest too
    n.update(1.05); o.update(1.05);
    expect(o.upcoming(1.05).map((u) => u.time)).toEqual([1]);
    expect(n.upcoming(1.05).map((u) => u.time)).toEqual([1, 2, 3, 4]);
    // same presses, same judgements
    const labels: string[] = [];
    for (const t of [1.1, 1.9, 2.95, 3.5, 4.3]) { n.update(t); o.update(t); const j = n.hit(t); expect(j).toBe(o.hit(t)); labels.push(j); }
    n.update(6); o.update(6);
    expect(labels).toEqual(['GOOD', 'GOOD', 'GREAT', 'MISS', 'MISS']);   // 100 ms late, 100 ms early, 50 ms early, two wild
    expect(n.result()).toEqual(o.result());
  });

  it('pinned difference 2: upcoming() read from inside onStepFired no longer lists the firing step twice', () => {
    const steps = mk([1, 1.25, 2, 3, 4, 5, 6, 7, 8]);
    const n = new NEW.DancePerformance(60), o = new OLD.DancePerformance(60);
    n.setRoutine(steps.map((s) => ({ ...s }))); o.setRoutine(steps.map((s) => ({ ...s })));
    const seen: { n: number[][]; o: number[][]; np: (number | null)[]; op: (number | null)[] } = { n: [], o: [], np: [], op: [] };
    let now = 0, inUpdate = false;
    n.onStepFired = () => { seen.n.push(n.upcoming(now, 6).map((u) => u.time)); seen.np.push(n.peekNext(now)?.time ?? null); };
    o.onStepFired = () => {
      // the old list, one longer, with the duplicate taken out where update() put it (right after the pending ones)
      const up = o.upcoming(now, 7).map((u) => u.time);
      const pending = (o as unknown as { pending: unknown[] }).pending.length;
      if (inUpdate) {
        expect(up[pending]).toBe(up[pending - 1]);                       // the firing step, twice
        up.splice(pending, 1);
      }
      seen.o.push(up.slice(0, 6));
      seen.op.push(o.peekNext(now)?.time ?? null);
    };
    n.start(0.5); o.start(0.5);
    const press = (t: number) => { now = t; expect(n.hit(t)).toBe(o.hit(t)); };
    const tick = (t: number) => { now = t; inUpdate = true; n.update(t); o.update(t); inUpdate = false; };
    // early presses consume a step from hit() (1.42, 2.4); the rest fire from update(), several in one call at the end
    tick(1.3); press(1.42); tick(1.8); press(2.4); tick(2.6); tick(3.6); press(4.6); tick(6); tick(9.5);
    expect(seen.n.length).toBe(steps.length);
    expect(seen.n).toEqual(seen.o);                                    // otherwise identical, the early-press path included
    expect(seen.np).toEqual(seen.op);                                  // peekNext was never affected
    expect(n.result()).toEqual(o.result());
  });
});
