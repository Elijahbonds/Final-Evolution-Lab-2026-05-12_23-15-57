// ghost — racing the only rival who is exactly your speed: you, last time.
//
// The second and third gaps the depth pass measured. The racing library had a clock, medals, rivals and a field, and
// no memory: finish a course and the only thing kept was whether the time cleared a medal threshold. You could not
// see WHERE you lost it, and you had nothing to chase on a course you had already beaten. Both of those are what
// keeps people on a track after the gold — a ghost and a split.
//
// THE ONE DECISION THAT MAKES A DELTA HONEST: compare by DISTANCE, not by time.
//
// "You are 0.4s behind" only means something if both laps are measured at the same point on the road. Comparing at
// the same CLOCK time answers a different and useless question — where each car was after nine seconds — and reads
// as noise through a corner where the two lines diverge. So a ghost stores (progress, time) pairs and the live delta
// asks: at the distance I am now, what did my best lap's clock say? That is the number on a real timing screen.
//
// Pure. The mode samples and renders; everything here is arithmetic.

/** One point on a recorded lap: how far round, when, and where — the position is only for drawing it. */
export interface GhostSample {
  /** 0..1 along the course. The axis every comparison is made on. */
  progress: number;
  /** Milliseconds since the lap started. */
  t: number;
  x: number; y: number; z: number;
  /** Heading in radians, so a drawn ghost faces the way it was going. */
  yaw?: number;
}

export interface Ghost {
  courseId: string;
  /** Total lap or race time in ms — what the medal was judged on. */
  timeMs: number;
  samples: GhostSample[];
  /** Which vehicle set it, so the screen can say what you are chasing. */
  vehicleId?: string;
  recordedAtMs: number;
}

/** 20 Hz is plenty for a smooth ghost and keeps a lap under a few hundred samples. */
export const GHOST_HZ = 20;
const GHOST_STEP_MS = 1000 / GHOST_HZ;

/** Records a lap as it is driven. The mode calls `sample` every frame; this thins it to GHOST_HZ. */
export class GhostRecorder {
  private readonly out: GhostSample[] = [];
  private lastMs = -Infinity;

  sample(s: GhostSample): void {
    if (s.t - this.lastMs < GHOST_STEP_MS) return;
    this.lastMs = s.t;
    // progress must never go backwards or the delta lookup breaks; a reversing kart holds its best progress
    const prev = this.out[this.out.length - 1];
    this.out.push(prev && s.progress < prev.progress ? { ...s, progress: prev.progress } : { ...s });
  }

  finish(courseId: string, timeMs: number, vehicleId?: string): Ghost | null {
    if (this.out.length < 2) return null;     // nothing worth replaying
    return { courseId, timeMs, samples: [...this.out], vehicleId, recordedAtMs: Date.now() };
  }

  reset(): void { this.out.length = 0; this.lastMs = -Infinity; }
}

/** Keep the faster of two ghosts. A null on either side loses to a real lap. */
export function fasterGhost(a: Ghost | null, b: Ghost | null): Ghost | null {
  if (!a) return b;
  if (!b) return a;
  return b.timeMs < a.timeMs ? b : a;
}

/** Where the ghost was at a given progress, interpolated. Null when the lap never reached that far. */
export function ghostAtProgress(ghost: Ghost | null, progress: number): GhostSample | null {
  if (!ghost || ghost.samples.length === 0) return null;
  const s = ghost.samples;
  if (progress <= s[0].progress) return s[0];
  if (progress >= s[s.length - 1].progress) return s[s.length - 1];
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid].progress <= progress) lo = mid; else hi = mid;
  }
  const a = s[lo], b = s[hi];
  const span = b.progress - a.progress;
  const f = span <= 1e-9 ? 0 : (progress - a.progress) / span;
  return {
    progress,
    t: a.t + (b.t - a.t) * f,
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    z: a.z + (b.z - a.z) * f,
    yaw: a.yaw,
  };
}

/** Where the ghost was at a given TIME — what you draw, frame by frame, beside the player. */
export function ghostAtTime(ghost: Ghost | null, tMs: number): GhostSample | null {
  if (!ghost || ghost.samples.length === 0) return null;
  const s = ghost.samples;
  if (tMs <= s[0].t) return s[0];
  if (tMs >= s[s.length - 1].t) return s[s.length - 1];
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid].t <= tMs) lo = mid; else hi = mid;
  }
  const a = s[lo], b = s[hi];
  const span = b.t - a.t;
  const f = span <= 1e-9 ? 0 : (tMs - a.t) / span;
  return {
    progress: a.progress + (b.progress - a.progress) * f,
    t: tMs,
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    z: a.z + (b.z - a.z) * f,
    yaw: a.yaw,
  };
}

/**
 * The live delta, in milliseconds: negative means you are AHEAD of the ghost.
 *
 * Measured at your current distance, which is the whole point — see the note at the top.
 */
export function deltaMs(ghost: Ghost | null, progress: number, tMs: number): number | null {
  const at = ghostAtProgress(ghost, progress);
  if (!at) return null;
  // past the end of the recorded lap there is nothing honest to compare against
  if (progress > ghost!.samples[ghost!.samples.length - 1].progress + 1e-6) return null;
  return tMs - at.t;
}

/** How a delta reads on screen: "-0.42" ahead, "+1.08" behind. */
export function deltaLabel(ms: number | null): string {
  if (ms == null) return '—';
  const s = ms / 1000;
  return `${s <= 0 ? '−' : '+'}${Math.abs(s).toFixed(2)}`;
}

// ── SECTORS ─────────────────────────────────────────────────────────────────

/** A course's sectors are its checkpoints: the timing a driver already understands. */
export interface SectorTimes {
  /** Cumulative ms at each checkpoint, in order. */
  atGate: number[];
  /** Per-sector durations derived from the above. */
  splits: number[];
}

export function sectorsFrom(gateTimesMs: readonly number[]): SectorTimes {
  const atGate = [...gateTimesMs];
  const splits = atGate.map((t, i) => (i === 0 ? t : t - atGate[i - 1]));
  return { atGate, splits };
}

export interface SectorVerdict {
  index: number;
  /** ms against the best lap's same sector. Negative is faster. */
  delta: number;
  /** True when this sector is the fastest you have driven it — the purple split. */
  personalBest: boolean;
}

/**
 * Compare a lap's sectors against the best lap's. A sector the best lap never reached is not judged: an unfinished
 * reference is not a benchmark, and saying "+12.4s" against a lap that stopped there is a lie.
 */
export function judgeSectors(current: SectorTimes, best: SectorTimes | null): SectorVerdict[] {
  if (!best) return current.splits.map((_, i) => ({ index: i, delta: 0, personalBest: true }));
  return current.splits.map((s, i) => {
    const b = best.splits[i];
    if (b == null) return { index: i, delta: 0, personalBest: true };
    return { index: i, delta: s - b, personalBest: s < b };
  });
}

/** The best sector times you have ever driven, taken from any number of laps — the theoretical best lap. */
export function bestSectors(laps: readonly SectorTimes[]): SectorTimes | null {
  if (laps.length === 0) return null;
  const n = Math.max(...laps.map((l) => l.splits.length));
  const splits: number[] = [];
  for (let i = 0; i < n; i++) {
    const have = laps.map((l) => l.splits[i]).filter((x): x is number => typeof x === 'number');
    if (have.length === 0) break;
    splits.push(Math.min(...have));
  }
  const atGate: number[] = [];
  splits.reduce((acc, s) => { const t = acc + s; atGate.push(t); return t; }, 0);
  return { atGate, splits };
}

/** The lap you could drive if you strung your best sectors together. */
export function theoreticalBestMs(laps: readonly SectorTimes[]): number | null {
  const b = bestSectors(laps);
  return b ? b.splits.reduce((a, s) => a + s, 0) : null;
}
