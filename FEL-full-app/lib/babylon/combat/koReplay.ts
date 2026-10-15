// KO REPLAYS (lane/w3-present, wave 3) — WHEN a fight may replay a KO or a ring-out, and what to ask the broadcast kit for. Pure.
//
// The combat modes share the foundation's ReplayDirector (ModeDefinition.replay + ctx.highlight): it records the bodies as
// drawn, holds the mode's update() while it plays (half speed, behind the letterbox), and any press skips it. This file is the
// pacer in front of it, the way racing/raceMoments.ReplayPacer is for a race:
//   · only a REAL finish — a strike KO or a ring-out. Not the bell (TIME: nobody was knocked out), not a fire pit;
//   · NEVER the match-deciding one — the final moment goes straight to the end card, never replayed before it;
//   · at most two a match, and not under reduced motion;
//   · a beat AFTER the finish (the fall has to be in the recording), on the mode's game clock, from the round-over phase only;
//   · the VICTIM is the subject (the camera follows the body that went down).
// Nothing here touches scoring, the round flow or a clock: the mode's own round-over timer is held while the replay plays
// (the harness holds update()) and carries on after it.

import type { ModeContext } from '../core/ModeHarness';

/** What a KO replay shows. */
export const KO_REPLAY = {
  /** Seconds after the finish before the replay is offered: the fall (the drop off the rim) is on the recording by then. */
  delaySec: 0.9,
  ringOutDelaySec: 1.2,
  /** Seconds of the recording shown (it plays at half speed). */
  lastSec: 2.8,
  ringOutLastSec: 3.4,
  maxPerMatch: 2,
} as const;

export type FinishKind = 'ko' | 'ringout' | 'time' | 'hazard';

export interface Finish {
  kind: FinishKind;
  /** This round decides the match: its finish goes to the end card unreplayed. */
  decidesMatch: boolean;
  /** The body that went down: 0 = the player's, 1 = the rival's (the order of the replay's cast). */
  victim: 0 | 1;
}

export interface KoReplayPlan {
  lastSeconds: number;
  /** Which recorded body the cameras follow (the victim). */
  focus: number;
  /** Which angles, in order (a ring-out is shot from the side and from above). */
  angles: Array<'low' | 'side' | 'tight' | 'high' | 'follow'>;
  kind: FinishKind;
}

export class KoReplayCue {
  private n = 0;
  private f: Finish | null = null;
  private left = 0;

  /** Arm the replay for a finish. False = not offered (the reason is the pacer's, see the header). */
  arm(finish: Finish, reduced: boolean): boolean {
    if (this.f) return false;
    if (reduced) return false;
    if (finish.decidesMatch) return false;
    if (finish.kind !== 'ko' && finish.kind !== 'ringout') return false;
    if (this.n >= KO_REPLAY.maxPerMatch) return false;
    this.f = finish;
    this.left = finish.kind === 'ringout' ? KO_REPLAY.ringOutDelaySec : KO_REPLAY.delaySec;
    return true;
  }

  get armed(): boolean { return this.f !== null; }

  /** Every frame the mode is in its round-over beat; `dt` = the mode's game dt. Returns the plan once, when it is due. */
  step(dt: number): KoReplayPlan | null {
    const f = this.f;
    if (!f) return null;
    this.left -= Math.max(0, dt);
    if (this.left > 0) return null;
    this.f = null; this.n++;
    const ring = f.kind === 'ringout';
    return {
      lastSeconds: ring ? KO_REPLAY.ringOutLastSec : KO_REPLAY.lastSec,
      focus: f.victim,
      angles: ring ? ['side', 'high'] : ['low', 'side', 'tight'],
      kind: f.kind,
    };
  }

  /** The round moved on before the replay was due (the watchdog, the next round): drop it. */
  cancel(): void { this.f = null; }
  /** A new match. */
  reset(): void { this.f = null; this.n = 0; }
  get count(): number { return this.n; }
}

/**
 * Play the plan through the broadcast kit (ctx.highlight: the harness holds the mode's update() while it runs, any press skips it).
 * `replay: 1` is on the HUD for the length of it (the host steps its stat band aside and tags the shot REPLAY). The cast the
 * mode names for the director is [player, rival]: `plan.focus` indexes it.
 */
export function playKoReplay(ctx: Pick<ModeContext, 'highlight' | 'setHud'>, plan: KoReplayPlan): void {
  ctx.setHud({ replay: 1 });
  const done = (): void => ctx.setHud({ replay: 0 });
  const p = ctx.highlight?.({ lastSeconds: plan.lastSeconds, focus: plan.focus, angles: plan.angles });
  if (!p) { done(); return; }
  void p.then(done, done);
}
