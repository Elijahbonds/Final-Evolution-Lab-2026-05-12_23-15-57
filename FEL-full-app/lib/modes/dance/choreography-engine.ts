// Choreography engine — routine builder on a beat grid + performance judging.
// GATED BEHIND PHASE 1 animation acceptance (standing-suite passes).
// animator API aligned (fadeSec; mirrored → '<clip>.M' via mirrored-clips.ts).

import type { CharacterAnimator } from '@/lib/babylon/anim/CharacterAnimator';
import type { DanceStep } from '@/lib/creator/creative-card-types';

export interface DanceClip {
  id: string;
  name: string;
  beats: number;
  category: 'toprock' | 'footwork' | 'freeze' | 'power' | 'wave' | 'bounce' | 'transition';
  difficulty: 1 | 2 | 3;
}

export interface Judgement { label: 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS'; points: number }

export class ChoreographyEngine {
  private steps: DanceStep[] = [];
  private startTime = 0;
  private nextIdx = 0;
  private running = false;
  private combo = 0;
  private score = 0;
  private window: { step: DanceStep; time: number }[] = [];
  public onStepFired: ((s: DanceStep) => void) | null = null;
  public onJudged: ((j: Judgement, combo: number) => void) | null = null;

  constructor(private animator: CharacterAnimator, private bpm: number) {}

  setRoutine(steps: DanceStep[]): void {
    this.steps = [...steps].sort((a, b) => a.beat - b.beat);
  }
  private beatDuration(): number { return 60 / this.bpm; }

  start(nowSeconds: number): void {
    this.startTime = nowSeconds;
    this.nextIdx = 0; this.combo = 0; this.score = 0;
    this.window = [];
    this.running = true;
  }
  stop(): void { this.running = false; }

  /** Call every frame with the AUDIO clock (AudioContext.currentTime). */
  update(nowSeconds: number): void {
    if (!this.running) return;
    const elapsed = nowSeconds - this.startTime;
    const bd = this.beatDuration();

    while (this.nextIdx < this.steps.length) {
      const s = this.steps[this.nextIdx];
      const t = s.beat * bd;
      if (elapsed < t) break;
      // mirrored playback resolves to the '<clip>.M' variant (mirrored-clips.ts)
      this.animator.play(s.mirrored ? `${s.clipId}.M` : s.clipId, { fadeSec: 0.12 });
      this.window.push({ step: s, time: this.startTime + t });
      this.onStepFired?.(s);
      this.nextIdx++;
    }
    // Expire un-hit windows as misses
    const cutoff = nowSeconds - 0.2;
    while (this.window.length && this.window[0].time < cutoff) {
      this.window.shift();
      this.combo = 0;
      this.onJudged?.({ label: 'MISS', points: 0 }, 0);
    }
  }

  /** Player tap during performance, on the audio clock. */
  hit(nowSeconds: number): Judgement {
    let bestIdx = -1, bestDelta = Infinity;
    for (let i = 0; i < this.window.length; i++) {
      const d = Math.abs(this.window[i].time - nowSeconds);
      if (d < bestDelta) { bestDelta = d; bestIdx = i; }
    }
    if (bestIdx === -1 || bestDelta > 0.2) {
      this.combo = 0;
      const j: Judgement = { label: 'MISS', points: 0 };
      this.onJudged?.(j, 0);
      return j;
    }
    this.window.splice(bestIdx, 1);
    const j: Judgement =
      bestDelta <= 0.04 ? { label: 'PERFECT', points: 300 } :
      bestDelta <= 0.09 ? { label: 'GREAT', points: 200 } :
      { label: 'GOOD', points: 100 };
    this.combo++;
    this.score += j.points + this.combo * 5;
    this.onJudged?.(j, this.combo);
    return j;
  }

  get currentScore(): number { return this.score; }
  get currentCombo(): number { return this.combo; }
}

/** Clip library — ids resolve via DANCE_ALIASES until the authored pack lands. */
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

/**
 * Fire a routine ONCE as a non-interactive celebration (e.g. after a made dunk).
 * Chains each step on the beat grid via animator.play; mirrored steps resolve to
 * the '<clip>.M' variant (real reflected group — never a T-pose). Returns a
 * cancel fn so a mode can stop it early (skip/replay). No audio clock needed.
 */
export function playRoutineOnce(
  animator: CharacterAnimator,
  steps: DanceStep[],
  bpm: number,
  onDone?: () => void,
): () => void {
  const beat = 60 / bpm;
  const ordered = [...steps].sort((a, b) => a.beat - b.beat);
  const timers: ReturnType<typeof setTimeout>[] = [];
  let cancelled = false;

  ordered.forEach((s) => {
    timers.push(setTimeout(() => {
      if (cancelled) return;
      animator.play(s.mirrored ? `${s.clipId}.M` : s.clipId, { fadeSec: 0.12 });
    }, s.beat * beat * 1000));
  });

  const last = ordered[ordered.length - 1];
  const endMs = last ? (last.beat + Math.max(1, last.holdBeats)) * beat * 1000 : 0;
  timers.push(setTimeout(() => {
    if (cancelled) return;
    animator.play('idle_stand', { loop: true, fadeSec: 0.2 });
    onDone?.();
  }, endMs));

  return () => {
    cancelled = true;
    timers.forEach(clearTimeout);
  };
}
