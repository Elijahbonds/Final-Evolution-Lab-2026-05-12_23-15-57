/**
 * lib/anim/avatar-driver.ts
 * =========================
 * M7a — bridge between the pure AnimDirectorFSM and a live rigged avatar.
 *
 * The director decides WHICH logical clip must play this frame; this driver
 * translates that into concrete `AvatarHandle.play()` calls against whatever
 * clips the loaded GLB actually ships (via CLIP_ALIASES / resolveConcreteClip).
 *
 * It is intentionally decoupled from THREE: it targets a minimal structural
 * interface (`DriveTarget`) so it can be unit-tested with a mock handle and
 * reused by any 3D scene component.
 *
 * Key behaviours:
 *   • A looping clip that is already the active clip is NOT re-triggered
 *     (prevents the mixer from restarting the loop every frame — that is what
 *     caused sliding/stutter).
 *   • An action (one-shot) clip is played once with clampWhenFinished; when it
 *     finishes the driver falls back to the current locomotion/idle clip
 *     (blend-back, never T-pose / snap).
 *   • resolveConcreteClip guarantees a valid concrete clip whenever the GLB
 *     has any clips at all.
 */

import type { AnimDecision } from './state-machine';
import { resolveConcreteClip } from './clip-registry';

export interface PlayOpts {
  loop?: boolean;
  timeScale?: number;
  fadeIn?: number;
  clampWhenFinished?: boolean;
  onFinish?: () => void;
}

/** Minimal structural subset of AvatarHandle the driver needs. */
export interface DriveTarget {
  clipNames: string[];
  play: (name: string, opts?: PlayOpts) => unknown;
  /**
   * Optional live playback-rate update for the already-running clip — lets the
   * driver stride-sync locomotion (adjust cadence as speed varies) WITHOUT
   * restarting the loop every frame. Omitted on mock targets in unit tests.
   */
  setTimeScale?: (name: string, timeScale: number) => void;
}

export class AvatarDriver {
  private target: DriveTarget | null = null;
  /** Concrete clip currently commanded (not necessarily finished). */
  private activeConcrete: string | null = null;
  private activeIsLoop = false;
  /** Logical clip name last decided, for change detection. */
  private lastLogical: string | null = null;
  /** Playback rate last commanded, so stride-sync only pushes real changes. */
  private activeTimeScale = 1;

  attach(target: DriveTarget): void {
    this.target = target;
    this.activeConcrete = null;
    this.activeIsLoop = false;
    this.lastLogical = null;
    this.activeTimeScale = 1;
  }

  get current(): string | null {
    return this.activeConcrete;
  }

  /**
   * Apply an AnimDecision. Returns the concrete clip name that is now playing
   * (or null if no target / no clips). Safe to call every frame.
   */
  apply(decision: AnimDecision): string | null {
    const t = this.target;
    if (!t || t.clipNames.length === 0) return null;

    const logical = decision.clip.name;
    const wantLoop = decision.clip.loop;
    const concrete = resolveConcreteClip(logical, t.clipNames);
    if (!concrete) return this.activeConcrete;

    // Looping clip already active for the same logical intent → do NOT restart
    // it (restarting every frame is what caused the stutter/slide). But DO push
    // a live stride-sync timeScale update when the target velocity changed the
    // playback rate meaningfully — this is what keeps foot cadence matched to
    // speed without re-triggering the loop.
    if (wantLoop && this.activeIsLoop && concrete === this.activeConcrete && logical === this.lastLogical) {
      const ts = decision.clip.speedScale;
      if (t.setTimeScale && Math.abs(ts - this.activeTimeScale) > 0.02) {
        t.setTimeScale(concrete, ts);
        this.activeTimeScale = ts;
      }
      return this.activeConcrete;
    }

    if (wantLoop) {
      t.play(concrete, {
        loop: true,
        timeScale: decision.clip.speedScale,
        fadeIn: 0.18,
      });
      this.activeConcrete = concrete;
      this.activeIsLoop = true;
      this.lastLogical = logical;
      this.activeTimeScale = decision.clip.speedScale;
      return concrete;
    }

    // One-shot action clip. Only (re)start if it's a genuinely new command.
    if (concrete !== this.activeConcrete || this.activeIsLoop || logical !== this.lastLogical) {
      t.play(concrete, {
        loop: false,
        timeScale: decision.clip.speedScale,
        fadeIn: 0.08,
        clampWhenFinished: true,
      });
      this.activeConcrete = concrete;
      this.activeIsLoop = false;
      this.lastLogical = logical;
      this.activeTimeScale = decision.clip.speedScale;
    }
    return concrete;
  }

  reset(): void {
    this.activeConcrete = null;
    this.activeIsLoop = false;
    this.lastLogical = null;
    this.activeTimeScale = 1;
  }
}
