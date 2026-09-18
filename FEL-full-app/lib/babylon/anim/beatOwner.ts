// beatOwner — the ONE OWNER of a body that lives on a base loop and fires one-shot BEATS (ANIM-READABILITY creative,
// 2026-09-07). The carnival events, the carnival hub party-goers and the dancer all play a loop (a stance, an idle, a
// dance step) and punctuate it with one-shots (a strike, a hit react, a launch, a stumble). Every one of them used to call
// animator.play() from two or three places with neverBindPose's onEnd chain doing the settling, and the chain is what
// jumbled them: it fires when the animator STOPS a one-shot too (Babylon raises a group's end observable from stop()), so a
// one-shot cut by the next clip replayed the base loop from INSIDE the animator's fade handler — which replaced the clip
// that had just started. Measured on the dancer: the previous step's chained idle cut the next step 0.05 s after it began,
// and the body idled through half the routine (2.5 s of idle_stand per lost step); on the carnival trick gauntlet the
// per-frame loop play cut the bail to 0.08 s.
//
// The owner passes its OWN onEnd for every beat, ignores the callback when it cut the beat itself (token guard), and
// settles a finished beat into whatever loop the body asked for LAST — so a loop requested during a beat is not lost, it
// is where the beat lands. Same discipline as BoardAnimTree / CombatAnimTree for bodies too simple to need a state tree.

import type { CharacterAnimator } from './CharacterAnimator';

export interface LoopOpts { fadeSec?: number; speedRatio?: number }
export interface BeatOpts extends LoopOpts {
  /** Fires when the beat ENDS on its own (never when the owner cut it). */
  onSettle?: () => void;
}

export class BeatOwner {
  private base: string | null = null;
  private baseOpts: Required<LoopOpts> = { fadeSec: 0.15, speedRatio: 1 };
  private shot: string | null = null;
  private token = 0;
  constructor(private animator: CharacterAnimator) {}

  /** The loop the body settles into. Per-frame safe (the animator dedupes a same-clip loop); never cuts a beat in
   *  flight — the beat settles into the NEW loop when it ends. */
  loop(clip: string, o: LoopOpts = {}): void {
    this.base = clip;
    this.baseOpts = { fadeSec: o.fadeSec ?? 0.15, speedRatio: o.speedRatio ?? 1 };
    if (this.shot) return;
    this.animator.play(clip, { loop: true, ...this.baseOpts });
  }

  /** A one-shot beat. Settles into the base loop on its natural end; a beat the owner cuts (a newer beat, `settle()`) is
   *  ignored when its end observable fires. A beat already in flight restarts (a mashed hit react hits again). */
  beat(clip: string, o: BeatOpts = {}): void {
    const tok = ++this.token;
    this.shot = clip;
    this.animator.play(clip, {
      loop: false, fadeSec: o.fadeSec ?? 0.1, speedRatio: o.speedRatio ?? 1, restart: true,
      onEnd: () => {
        if (this.token !== tok) return;   // cut by a newer beat / settle — Babylon raises the end from stop()
        this.shot = null;
        o.onSettle?.();
        if (this.base) this.animator.play(this.base, { loop: true, ...this.baseOpts });
      },
    });
  }

  /** A beat is in flight. */
  get busy(): boolean { return this.shot !== null; }
  /** The beat in flight, if any. */
  get current(): string | null { return this.shot; }
  /** The loop the body settles into. */
  get baseLoop(): string | null { return this.base; }

  /** Cut the beat now and return to the loop (a hit lands mid-swing). */
  settle(fadeSec?: number): void {
    if (!this.shot) return;
    this.token++;
    this.shot = null;
    if (this.base) this.animator.play(this.base, { loop: true, fadeSec: fadeSec ?? this.baseOpts.fadeSec, speedRatio: this.baseOpts.speedRatio });
  }

  reset(): void { this.token++; this.shot = null; this.base = null; }
}
