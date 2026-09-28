// fightGrade — the fight read against its truth (movement play P7, 2026-09-25): the gate's numbers (lib/pose/fightGate.test.ts)
// and FIGHT.md's (scripts/body/fight.mts), one copy.
//
//   a take (room joints + labels) ──synthesize(cell)──▶ PoseFrame[] behind a still stand ──BodyReader──▶ fight events
//                                  ──fightTruth──▶ the true instants                 ──match──▶ per class P / R, onset error
//
// A CELL is one camera condition of the grid: fps, latency (±15 ms jitter), noise scale, motion blur, a seed, and the
// dropouts (2 % dropped, 1 % missed, a 150 ms hole every ~3 s). MATCHING: an event and a truth of the same family within
// ±MATCH_MS of the truth's onset, nearest first. Right class and side = TP; wrong class = FN for the truth's class AND FP
// for the event's (the confusion); unmatched = FP. A MISFIRE (the cut line's word) is an event a mode would take with no
// truth of its family inside [onset − 100, onset + 250] ms — in a negative take, any event a mode would take at all. An
// event MATCHED to a truth of its family (within ±MATCH_MS) is that truth's answer, never a misfire: how far its onset
// strays is G2's number (the onset error), not G3's.
// A guard held again after a punch (up, not a raise) and a guard coming down are the guard's STATE, not graded in a
// positive take; in a negative take a guard up is a misfire like anything else.
// Pure: no DOM, no fs.
import { synthesize, renderFrame, makeCamera, DEFAULT_NOISE, DEFAULT_BLUR, mulberry32, type JointClip, type NoiseSpec, type SynthOptions } from './synth';
import { holdStill, dropout } from './streamKit';
import { calibrate } from './calibrate';
import { BodyReader, type BodyEvent } from './BodyReader';
import { fightTruth, type FightLabel, type GtFight } from './fightTruth';
import type { FightEvent } from './fightReader';
import type { PoseFrame } from './landmarks';

export const MATCH_MS = 150;
/** Events this soon (ms) after the stand → take splice are the splice, not the take: ungraded. */
export const FIGHT_SPLICE_MS = 300;
/** Truth this close (ms) to the take's end is ungraded: its motion may finish after the last frame. */
export const FIGHT_END_MS = 250;
/** Seconds of still stand held before a take (the space check's calibration). */
export const FIGHT_STAND_SEC = 1.2;
/** A 150 ms visibility hole every this many seconds, on average (the grid's dropouts). */
export const HOLE_EVERY_SEC = 3;
export const HOLE_MS = 150;

export interface FightTake {
  name: string;
  role: 'positive' | 'negative';
  /** real = eye-labelled capture; scripted = fightKit; spliced = real singles joined at real spacing. */
  source: 'real' | 'scripted' | 'spliced';
  clip: JointClip;
  labels: FightLabel[];
  /** The guard is up throughout (a fighting stance), unlabelled: a guard held is its truth, a RAISE is not. */
  guardHeld?: boolean;
  /** Families not graded on this take — neither truth nor misfire — because the stream cannot say (the room model moved
   *  a capture's feet: its steps are artefacts). */
  ungraded?: readonly string[];
  /** The stance's lead as the eye (a fixture) or the script gave it — what names a straight a jab or a cross in the truth;
   *  'square' (the eye saw no lead): the orthodox default, the left straight the jab, mirrored or not. Absent: the stance
   *  rule on the clean ankles (fightTruth.leadTrack), the rule the reader itself runs — which could not see the reader's
   *  own stance mistakes (the review, 2026-09-26). */
  lead?: 'L' | 'R' | 'square';
}
export interface FightCell { fps: number; latencyMs: number; noise: number; blur: boolean; seed: number; holes?: boolean }
export const cellName = (c: FightCell) => `${c.fps}fps ${c.latencyMs}ms n${c.noise}${c.blur ? ' blur' : ''} s${c.seed}`;

const FIGHT_KINDS = new Set(['blow', 'legKick', 'guard', 'evade', 'fightStep', 'turn']);
export const isFight = (e: BodyEvent): e is FightEvent => FIGHT_KINDS.has(e.kind);

/** The class an event is graded as (null = the guard's state, not graded in a positive take). */
export function eventClass(e: FightEvent): string | null {
  switch (e.kind) {
    case 'blow': return e.form === 'straight' ? e.name : `${e.name}${e.hand}`;
    case 'legKick': return e.form;
    case 'guard': return e.up && e.raise ? 'raise' : null;
    case 'evade': return e.form === 'slip' ? `slip${e.side}` : 'duck';
    case 'fightStep': return e.dir;
    case 'turn': return null;   // read only behind the spin opt-in: graded on its own stream
  }
}
export function truthClass(g: GtFight): string {
  switch (g.kind) {
    case 'blow': return g.name === 'jab' || g.name === 'cross' ? g.name : `${g.name}${g.hand}`;
    case 'evade': return g.name === 'slip' ? `slip${g.hand}` : 'duck';
    default: return g.name;
  }
}
/** Would a mode take it? (Every fight event but a turn, which only the spin opt-in reads, and a guard coming down.) */
export const taken = (e: FightEvent): boolean => e.kind !== 'turn' && !(e.kind === 'guard' && !e.up);

/** The frame of the take the stand is made from: the first whose held copy calibrates (facing, whole, still). */
export function standIndex(clip: JointClip, fps: number): number {
  const cam = makeCamera();
  const tryAt = (i: number) => {
    const j = clip.frames[i];
    const { image, world } = renderFrame(cam, j, clip.foot);
    const f: PoseFrame = { t: 0, present: true, image: image.map((l) => ({ ...l, v: 0.95 })), world };
    return calibrate(holdStill(f, { sec: 0.8, fps, beforeT: 0 })).ok;
  };
  for (let i = 0; i < Math.min(clip.frames.length, clip.fps * 3); i += Math.max(1, Math.round(clip.fps / 10))) if (tryAt(i)) return i;
  return 0;
}

export interface FightStream {
  frames: PoseFrame[];
  gt: GtFight[];
  /** Capture ms of the take's first graded instant (the splice + FIGHT_SPLICE_MS) and its last (end − FIGHT_END_MS). */
  from: number;
  to: number;
}
/** A take under one camera condition: a still stand, then the take (from its stand frame on), and its truth. */
export function fightStream(take: FightTake, cell: FightCell): FightStream {
  const s0 = standIndex(take.clip, cell.fps);
  const clip: JointClip = s0 > 0 ? { ...take.clip, frames: take.clip.frames.slice(s0) } : take.clip;
  const shift = s0 / take.clip.fps;
  const labels = take.labels.filter((l) => l.at >= shift).map((l) => ({ ...l, at: l.at - shift }));
  const noise: NoiseSpec = Object.fromEntries(Object.entries(DEFAULT_NOISE).map(([k, v]) => [k, k === 'depthScale' ? v : v * cell.noise])) as unknown as NoiseSpec;
  const opt: SynthOptions = {
    fps: cell.fps, seed: cell.seed, noise, latencyMs: cell.latencyMs, latencyJitterMs: 15, dropRate: 0.02, missRate: 0.01,
    blur: cell.blur ? DEFAULT_BLUR : false, t0: 0,
  };
  const syn = synthesize(clip, opt);
  let frames = syn.frames;
  if (cell.holes !== false) {
    const rand = mulberry32(cell.seed * 7919 + 13);
    const dur = frames.length ? frames[frames.length - 1].t : 0;
    for (let at = 400 + rand() * HOLE_EVERY_SEC * 1000; at < dur; at += HOLE_EVERY_SEC * 1000 * (0.5 + rand())) frames = dropout(frames, at, at + HOLE_MS);
  }
  const standPose = synthesize({ fps: clip.fps, frames: [clip.frames[0], clip.frames[0]], foot: clip.foot }, { noise: false, dropRate: 0, missRate: 0, fps: 30 }).frames[0];
  const stand = holdStill(standPose, { sec: FIGHT_STAND_SEC, fps: cell.fps, beforeT: 0, seed: cell.seed + 101, noise, latencyMs: cell.latencyMs });
  const gt = fightTruth(clip, labels, { t0: 0, lead: take.lead === 'square' ? 'L' : take.lead ?? null });
  const end = frames.length ? frames[frames.length - 1].t : 0;
  return { frames: [...stand, ...frames], gt, from: FIGHT_SPLICE_MS, to: end - FIGHT_END_MS };
}

/** The reader over a stream: its fight events (and when each was told, and when that frame reached the app). */
export interface ToldEvent { e: FightEvent; arrive: number }
export function readFight(frames: readonly PoseFrame[], debug?: (msg: string) => void): ToldEvent[] {
  const r = new BodyReader(debug ? { fightDebug: debug } : {});
  const out: ToldEvent[] = [];
  for (const f of frames) {
    const { events } = r.read(f);
    for (const e of events) if (isFight(e)) out.push({ e, arrive: f.arrive ?? f.t });
  }
  return out;
}

export interface FightMatch { gt: GtFight; ev: ToldEvent | null; cls: string; got: string | null; dOnset: number | null; delay: number | null; total: number | null }
export interface FightGraded {
  matches: FightMatch[];
  /** Events with no truth of their class matched (a wrong class is in `matches` too, as `got`). */
  extra: ToldEvent[];
  /** Taken events with no truth of their family near them: the cut line's misfires. */
  misfires: ToldEvent[];
}

/** Match a stream's events to its truth (see the header). */
export function matchFight(st: FightStream, told0: readonly ToldEvent[], take: Pick<FightTake, 'role' | 'guardHeld' | 'ungraded'>): FightGraded {
  const role = take.role;
  const told = told0.filter((x) => !take.ungraded?.includes(x.e.kind));
  const held = (e: FightEvent) => !!take.guardHeld && e.kind === 'guard' && !e.raise;
  const inTake = told.filter((x) => x.e.t >= st.from && x.e.t <= st.to + FIGHT_END_MS);
  const gts = st.gt.filter((g, i, all) => g.onset >= st.from && g.onset <= st.to
    && !all.slice(0, i).some((o) => o.kind === g.kind && o.name === g.name && o.hand === g.hand && Math.abs(o.onset - g.onset) < 1));
  const used = new Set<ToldEvent>();
  const matches: FightMatch[] = [];
  const graded = (x: ToldEvent) => role === 'positive' ? eventClass(x.e) !== null : taken(x.e) && !held(x.e);
  // the eye's 'any' (a push short of a full punch): whatever blow is read there is consumed, and graded neither way
  for (const g of gts.filter((x) => x.name === 'any')) {
    const c = inTake.find((x) => !used.has(x) && x.e.kind === 'blow' && Math.abs(x.e.t - g.onset) <= MATCH_MS);
    if (c) used.add(c);
  }
  for (const g of [...gts].filter((x) => x.name !== 'any').sort((a, b) => a.onset - b.onset)) {
    const fam = g.kind;
    const cand = inTake.filter((x) => !used.has(x) && x.e.kind === fam && graded(x) && Math.abs(x.e.t - g.onset) <= MATCH_MS)
      .sort((a, b) => Math.abs(a.e.t - g.onset) - Math.abs(b.e.t - g.onset));
    // the right class first, then the nearest of the family
    const want = truthClass(g);
    const c = cand.find((x) => eventClass(x.e) === want) ?? cand[0] ?? null;
    if (c) used.add(c);
    matches.push({
      gt: g, ev: c, cls: want, got: c ? eventClass(c.e) : null,
      dOnset: c ? c.e.t - g.onset : null, delay: c ? c.e.seen - c.e.t : null, total: c ? c.arrive - g.onset : null,
    });
  }
  const extra = inTake.filter((x) => !used.has(x) && graded(x));
  const misfires = inTake.filter((x) => !used.has(x) && taken(x.e) && !held(x.e) && !(role === 'positive' && eventClass(x.e) === null)
    && !st.gt.some((g) => g.kind === x.e.kind && x.e.t >= g.onset - 100 && x.e.t <= g.onset + 250));
  return { matches, extra, misfires };
}

export interface ClassTally { tp: number; fn: number; fp: number; onset: number[]; delay: number[]; total: number[] }
export interface FightTally { classes: Record<string, ClassTally>; confusion: Record<string, Record<string, number>>; misfires: number; takes: number }
export const newTally = (): FightTally => ({ classes: {}, confusion: {}, misfires: 0, takes: 0 });
export function addTally(t: FightTally, g: FightGraded): void {
  const C = (k: string) => (t.classes[k] ??= { tp: 0, fn: 0, fp: 0, onset: [], delay: [], total: [] });
  t.takes++;
  for (const m of g.matches) {
    (t.confusion[m.cls] ??= {})[m.got ?? '—'] = ((t.confusion[m.cls] ??= {})[m.got ?? '—'] ?? 0) + 1;
    if (m.got === m.cls) { const c = C(m.cls); c.tp++; c.onset.push(m.dOnset!); c.delay.push(m.delay!); c.total.push(m.total!); }
    else { C(m.cls).fn++; if (m.got) C(m.got).fp++; }
  }
  for (const x of g.extra) { const k = eventClass(x.e) ?? `${x.e.kind}`; C(k).fp++; }
  t.misfires += g.misfires.length;
}
export const recall = (c: ClassTally) => (c.tp + c.fn ? c.tp / (c.tp + c.fn) : NaN);
export const precision = (c: ClassTally) => (c.tp + c.fp ? c.tp / (c.tp + c.fp) : NaN);
export const pctl = (v: number[], p: number) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };
