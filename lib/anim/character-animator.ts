/**
 * lib/anim/character-animator.ts — Phase 1 deliverable C: CharacterAnimator.
 *
 * Wraps a THREE.AnimationMixer + action map with a clean play/queue API that
 * ALWAYS cross-fades (never hard-cuts) and NEVER leaves the rig in bind pose:
 *   - play(clip, { loop, blendSeconds, speed }) cross-fades from whatever is
 *     running (min 0.15s blend).
 *   - a missing requested clip logs console.error and plays the explicit idle
 *     clip instead (or, if idle is also missing, the first available clip).
 *   - queue(clip, opts) chains a follow-up clip when the current one-shot
 *     finishes (attack -> recovery).
 *
 * Decision logic (chooseClip / blend floor) is imported from clip-select.ts so
 * it is unit-tested headlessly; this class only does the THREE wiring.
 */
import * as THREE from 'three';
import {
  chooseClip,
  resolveBlendSeconds,
  resolveSpeed,
  type ClipChoice,
} from './clip-select';

export interface PlayOpts {
  loop?: boolean;
  blendSeconds?: number;
  speed?: number;
  clampWhenFinished?: boolean;
  onFinish?: () => void;
}

interface QueuedItem {
  clip: string;
  opts: PlayOpts;
}

export class CharacterAnimator {
  readonly mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private clips = new Map<string, THREE.AnimationClip>();
  private idleClip: string;
  private current: string | null = null;
  private queued: QueuedItem | null = null;
  private finishHandler: ((e: any) => void) | null = null;

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[], idleClip: string) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const c of clips) {
      this.clips.set(c.name, c);
      this.actions.set(c.name, this.mixer.clipAction(c));
    }
    this.idleClip = idleClip;
    this.finishHandler = () => {
      if (this.queued) {
        const q = this.queued;
        this.queued = null;
        this.play(q.clip, q.opts);
      } else {
        // one-shot ended with nothing queued: settle to idle, never bind pose
        this.play(this.idleClip, { loop: true });
      }
    };
    this.mixer.addEventListener('finished', this.finishHandler);
  }

  get availableClips(): string[] {
    return Array.from(this.actions.keys());
  }

  get currentClip(): string | null {
    return this.current;
  }

  /** Resolve requested->actual clip without side effects (exposed for tests/HUD). */
  resolve(requested: string): ClipChoice {
    return chooseClip(requested, this.availableClips, this.idleClip);
  }

  play(requested: string, opts: PlayOpts = {}): ClipChoice {
    const choice = this.resolve(requested);
    if (choice.didFallback) {
      console.error(
        `[CharacterAnimator] clip "${requested}" missing (${choice.reason}); playing "${choice.clip}" instead — rig will NOT bind-pose.`,
      );
    }
    const action = this.actions.get(choice.clip);
    if (!action) {
      console.error(`[CharacterAnimator] no action for "${choice.clip}" — rig has no clips.`);
      return choice;
    }
    const blend = resolveBlendSeconds(opts.blendSeconds);
    const speed = resolveSpeed(opts.speed);
    const loop = opts.loop ?? true;

    action.reset();
    action.enabled = true;
    action.setEffectiveTimeScale(speed);
    action.setEffectiveWeight(1);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = opts.clampWhenFinished ?? !loop;

    // cross-fade from the currently running action (never hard-cut)
    const prev = this.current ? this.actions.get(this.current) : null;
    if (prev && prev !== action) {
      action.play();
      prev.crossFadeTo(action, blend, false);
    } else if (!prev) {
      action.fadeIn(blend);
      action.play();
    } else {
      // replaying same clip: just play
      action.play();
    }

    this.current = choice.clip;
    // remember per-play finish callback
    if (opts.onFinish) {
      const onFin = (e: any) => {
        if (e.action === action) {
          this.mixer.removeEventListener('finished', onFin);
          opts.onFinish?.();
        }
      };
      this.mixer.addEventListener('finished', onFin);
    }
    return choice;
  }

  /**
   * Live-update the current action's playback rate WITHOUT restarting it. Used
   * by the locomotion lane to stride-sync cadence as speed varies.
   */
  setSpeed(speed: number): void {
    if (!this.current) return;
    const a = this.actions.get(this.current);
    if (a) a.setEffectiveTimeScale(resolveSpeed(speed));
  }

  /** Chain a follow-up clip to play when the current one-shot finishes. */
  queue(clip: string, opts: PlayOpts = {}): void {
    this.queued = { clip, opts };
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  dispose(): void {
    if (this.finishHandler) this.mixer.removeEventListener('finished', this.finishHandler);
    this.mixer.stopAllAction();
    this.actions.clear();
    this.clips.clear();
  }
}
