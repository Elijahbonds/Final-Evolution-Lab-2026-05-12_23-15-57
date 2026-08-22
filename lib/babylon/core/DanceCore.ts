// DanceCore — the rhythm engine behind Dance mode.
//
// M28 shipped ChoreographyEngine, which already had the right judging model
// (beat grid, ±40/90/200 ms windows, combo scoring). Two things kept it from
// being shippable: it is welded to CharacterAnimator, so none of the timing
// can be tested without a rig; and nothing ever generated a routine to feed
// it. This is that engine's arithmetic, extracted so it can be RUN, plus the
// routine generator it was missing.
//
// The judging windows and point values are deliberately IDENTICAL to M28's
// so behaviour is preserved rather than quietly re-tuned:
//   PERFECT ≤ 40 ms · 300   GREAT ≤ 90 ms · 200   GOOD ≤ 200 ms · 100
//   combo adds 5 × combo per hit
//
// Babylon-free and animator-free on purpose — same reasoning as RallyCore.
// The mode owns the rig; this owns the clock.

export type Judgement = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';

export const JUDGE_WINDOWS: { label: Judgement; maxDelta: number; points: number }[] = [
  { label: 'PERFECT', maxDelta: 0.04, points: 300 },
  { label: 'GREAT', maxDelta: 0.09, points: 200 },
  { label: 'GOOD', maxDelta: 0.20, points: 100 },
];

/** Beyond this a tap is a miss and a queued step expires. */
export const MISS_AFTER = 0.20;

export interface DanceStep {
  clipId: string;
  beat: number;
  holdBeats: number;
  mirrored: boolean;
}

export interface DanceClip {
  id: string;
  name: string;
  beats: number;
  category: 'toprock' | 'footwork' | 'freeze' | 'power' | 'wave' | 'bounce' | 'transition';
  difficulty: 1 | 2 | 3;
}

/** Same eight entries M28 defined. Ids resolve through danceClips.ts. */
export const DANCE_LIBRARY: DanceClip[] = [
  { id: 'dance_toprock_basic', name: 'Top Rock', beats: 4, category: 'toprock', difficulty: 1 },
  { id: 'dance_bounce_two_step', name: 'Two Step', beats: 4, category: 'bounce', difficulty: 1 },
  { id: 'dance_wave_arm', name: 'Arm Wave', beats: 2, category: 'wave', difficulty: 2 },
  { id: 'dance_footwork_six', name: 'Six Step', beats: 8, category: 'footwork', difficulty: 2 },
  { id: 'dance_freeze_baby', name: 'Baby Freeze', beats: 2, category: 'freeze', difficulty: 3 },
  { id: 'dance_power_windmill', name: 'Windmill', beats: 8, category: 'power', difficulty: 3 },
  { id: 'dance_trans_spin', name: 'Spin', beats: 2, category: 'transition', difficulty: 1 },
  { id: 'dance_bounce_shoulder', name: 'Shoulder Bop', beats: 4, category: 'bounce', difficulty: 1 },
];

export const beatDuration = (bpm: number): number => 60 / Math.max(1, bpm);

// ── routine generation ────────────────────────────────────────────────────

export interface RoutineOptions {
  bars: number;
  /** 1 = easy (difficulty-1 clips, on-beat), 3 = hard (all clips, syncopation). */
  difficulty: 1 | 2 | 3;
  beatsPerBar?: number;
  /** Deterministic when supplied — the same seed must yield the same routine,
   *  or a "retry" button silently hands the player a different chart. */
  seed?: number;
}

/** Small deterministic PRNG. Math.random() would make routines unrepeatable,
 *  which breaks retry, breaks sharing a chart, and breaks these tests. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a routine that fills `bars` bars without overlapping steps.
 *
 * Steps are laid down sequentially and each consumes its own clip length, so
 * a routine can never ask the dancer to start a windmill halfway through a
 * six-step. That constraint is why this is generated rather than hand-listed.
 */
export function generateRoutine(o: RoutineOptions): DanceStep[] {
  const beatsPerBar = o.beatsPerBar ?? 4;
  const totalBeats = o.bars * beatsPerBar;
  const rnd = mulberry32(o.seed ?? 1);

  const pool = DANCE_LIBRARY.filter((c) => c.difficulty <= o.difficulty);
  if (pool.length === 0) return [];

  const steps: DanceStep[] = [];
  let beat = 0;
  while (beat < totalBeats) {
    const remaining = totalBeats - beat;
    const fits = pool.filter((c) => c.beats <= remaining);
    if (fits.length === 0) break;
    const clip = fits[Math.floor(rnd() * fits.length)];

    // Off-beat entries only at difficulty 3, and only when there is room.
    const syncopate = o.difficulty >= 3 && rnd() < 0.25 && remaining > clip.beats;
    const at = syncopate ? beat + 0.5 : beat;

    steps.push({
      clipId: clip.id,
      beat: at,
      holdBeats: clip.beats,
      mirrored: rnd() < 0.35,
    });
    beat = at + clip.beats;
  }
  return steps;
}

// ── judging ───────────────────────────────────────────────────────────────

export function judgeDelta(delta: number): { label: Judgement; points: number } {
  const a = Math.abs(delta);
  for (const w of JUDGE_WINDOWS) {
    if (a <= w.maxDelta) return { label: w.label, points: w.points };
  }
  return { label: 'MISS', points: 0 };
}

export interface DanceResult {
  score: number;
  maxCombo: number;
  counts: Record<Judgement, number>;
  /** 0–5. What the results screen shows. */
  stars: number;
  accuracy: number;
}

/**
 * Scores a performance against a routine.
 *
 * Deliberately a class with an explicit clock rather than a `setInterval`:
 * the mode drives it from the AUDIO clock (`AudioContext.currentTime`), not
 * the frame clock. Rhythm judged on requestAnimationFrame drifts against the
 * music on any dropped frame, and players feel that immediately.
 */
export class DancePerformance {
  private steps: DanceStep[] = [];
  private pending: { step: DanceStep; time: number }[] = [];
  private nextIdx = 0;
  private started = 0;
  private bpm: number;

  score = 0;
  combo = 0;
  maxCombo = 0;
  counts: Record<Judgement, number> = { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 };
  running = false;

  /** Fired when a step's animation should play. */
  onStepFired: ((s: DanceStep) => void) | null = null;
  onJudged: ((label: Judgement, points: number, combo: number) => void) | null = null;

  constructor(bpm: number) { this.bpm = bpm; }

  setRoutine(steps: DanceStep[]): void {
    this.steps = [...steps].sort((a, b) => a.beat - b.beat);
  }

  start(now: number): void {
    this.started = now;
    this.nextIdx = 0;
    this.pending = [];
    this.score = 0; this.combo = 0; this.maxCombo = 0;
    this.counts = { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 };
    this.running = true;
  }

  stop(): void { this.running = false; }

  /** Total beats in the routine, including the last step's hold. */
  get totalBeats(): number {
    if (this.steps.length === 0) return 0;
    const last = this.steps[this.steps.length - 1];
    return last.beat + last.holdBeats;
  }

  /** Call every frame with the AUDIO clock. */
  update(now: number): void {
    if (!this.running) return;
    const elapsed = now - this.started;
    const bd = beatDuration(this.bpm);

    while (this.nextIdx < this.steps.length && elapsed >= this.steps[this.nextIdx].beat * bd) {
      const s = this.steps[this.nextIdx];
      this.pending.push({ step: s, time: this.started + s.beat * bd });
      this.onStepFired?.(s);
      this.nextIdx++;
    }

    while (this.pending.length && this.pending[0].time < now - MISS_AFTER) {
      this.pending.shift();
      this.registerMiss();
    }
  }

  private registerMiss(): void {
    this.combo = 0;
    this.counts.MISS++;
    this.onJudged?.('MISS', 0, 0);
  }

  /** Player input on the audio clock. */
  hit(now: number): Judgement {
    let bestIdx = -1, best = Infinity;
    for (let i = 0; i < this.pending.length; i++) {
      const d = Math.abs(this.pending[i].time - now);
      if (d < best) { best = d; bestIdx = i; }
    }
    if (bestIdx === -1 || best > MISS_AFTER) {
      this.registerMiss();
      return 'MISS';
    }
    this.pending.splice(bestIdx, 1);
    const { label, points } = judgeDelta(best);
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.score += points + this.combo * 5;
    this.counts[label]++;
    this.onJudged?.(label, points, this.combo);
    return label;
  }

  /** Steps that were never presented, e.g. the player quit early. */
  private get unplayed(): number {
    return Math.max(0, this.steps.length - (this.nextIdx - this.pending.length));
  }

  result(): DanceResult {
    const judged = this.counts.PERFECT + this.counts.GREAT + this.counts.GOOD + this.counts.MISS;
    const weighted = this.counts.PERFECT * 1 + this.counts.GREAT * 0.75 + this.counts.GOOD * 0.4;
    const accuracy = judged === 0 ? 0 : weighted / judged;
    // Stars are on accuracy, NOT raw score: score scales with routine length,
    // so a long easy chart would out-star a short hard one.
    const stars = accuracy >= 0.95 ? 5 : accuracy >= 0.85 ? 4 : accuracy >= 0.7 ? 3
      : accuracy >= 0.5 ? 2 : accuracy > 0 ? 1 : 0;
    return { score: this.score, maxCombo: this.maxCombo, counts: { ...this.counts }, stars, accuracy };
  }
}
