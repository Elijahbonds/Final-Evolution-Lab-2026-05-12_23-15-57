// baseballSlots — BASEBALL-FEEL (2026-10-23): which slot of anim/baseballTree each body is in, driven ONLY by the game's
// events (baseballGame.ts BaseballView) and the game clock. Pure: no Babylon, no Math.random, no wall clock, so the suite
// plays a seeded innings headless and reads the slot sequence (baseballFeel*.test.ts).
//
// Spec §2 (slot → firing event), as wired here. The pitcher is also the fielder this view has (no other fielder body):
//   pitcher  idle (before the first pitch, after the end) · windup (between pitches: the set, holding idle_stand)
//            pitch_release (the delivery; the side-arm on a slider) ·
//            field_routine (closing in: strafe toward the ball's side, then the routine take) → throw   [a fly out, a double]
//            field_dive → throw                                                                          [a single]
//   batter   stance · swing_contact / swing_power · run (baseball_run ×1.0 on a hit; the ×0.7 trot after a homer)
//            slide (the runner is within SLIDE_SEC of the base while a throw is in the air) · celebrate (a homer, a run
//            scored) · dejected (strike three, a caught fly out)
// Spec §3 (timing): contact plays at SWING_SPEED.contact (Derby's 1.7) and power at least as fast; contact cuts the beat at
// clip t 0.42 and blends back to the stance; power plays to t 0.55, holds the last frame POWER_HOLD_SEC, then the bat runs
// its BAT_RECOVER_SEC return. The hit-stop is emitted when the swing clip reaches its contact key (t 0.3).
// §4 (bat visibility): batVisible is true only in stance, swing_contact and swing_power (the recovery is the stance).

import type { BaseballAnimInput, BaseballAnimState } from '../anim/baseballTree';
import { CLIP_ALIASES } from '../anim/clipAliases';
import { chooseBaseballClip } from '../anim/baseballTree';
import { BAT_RECOVER_SEC, BAT_SWING_SEC } from '../anim/authored/baseball';
import type { BaseballPitch, SwingGrade, SwingKind } from './baseballGame';

export type SwingWeight = 'contact' | 'power';

/** Where each swing stops on the swing clip's clock (s). Contact checks short of the follow-through; power finishes it. */
export const SWING_STOP_T: Readonly<Record<SwingWeight, number>> = { contact: 0.42, power: BAT_SWING_SEC };
/** The swing clip's contact key (authored/baseball): the hit-stop starts here. */
export const CONTACT_KEY_T = 0.3;
/** TUNE: the requested swing speed. Contact starts at Derby's 1.7 (precisionModes swing); power ≥ contact. */
export const SWING_SPEED: Readonly<Record<SwingWeight, number>> = { contact: 1.7, power: 1.7 };
/** TUNE: hit-stop per contact (ms). Order is the contract: contact < power ≤ homer, all ≤ HIT_STOP_CAP_MS. */
export const HIT_STOP_MS = { contact: 35, power: 50, homer: 60 } as const;
export const HIT_STOP_CAP_MS = 120;

/** TUNE: beat lengths on the game clock (s). */
export const BEAT_SEC = {
  contactBlend: 0.18, celebrate: 1.6, trot: 2.0, dejected: 1.2,
  powerHold: 0.25,   // PROVISIONAL: Gameplay to review
  close: 0.6, fieldRoutine: 0.9, fieldDive: 0.7, throw: 0.8, slide: 0.6,
} as const;
/** TUNE: home to the base the hit earns, at a sprint (s). */
export const RUN_TO_BASE_SEC = { single: 3.2, double: 6.8 } as const;   // PROVISIONAL: Gameplay to review
/** TUNE: a throw is "incoming" from its release (the end of the throw beat) for this long. */
export const THROW_FLIGHT_SEC = 1.6;   // PROVISIONAL: Gameplay to review
/** The pitcher's hold after the release before he settles into the set. */
export const PITCH_HOLD_SEC = 1.3;

export function swingWeightFor(kind: SwingKind): SwingWeight {
  return kind === 'homer' || kind === 'double' ? 'power' : 'contact';
}

/** The hit-stop a contact earns (ms). */
export function hitStopFor(kind: SwingKind): number {
  return kind === 'homer' ? HIT_STOP_MS.homer : swingWeightFor(kind) === 'power' ? HIT_STOP_MS.power : HIT_STOP_MS.contact;
}

/** The speed the swing clip really plays at: the requested SWING_SPEED × the slot clip's alias multiplier
 *  (baseball_swing_full ×1.0, baseball_contact_drive ×1.1). */
export function swingSpeedRatio(w: SwingWeight): number {
  const clip = chooseBaseballClip({ pitching: false, windingUp: false, releasing: false, batting: true, swinging: w, fielding: 'none', throwing: false, running: false, sliding: false }).clip;
  return SWING_SPEED[w] * (CLIP_ALIASES[clip]?.[1] ?? 1);
}

/** Bat shown for the batter in these slots only (§4); never on pitcher or fielder bodies. */
export const BAT_SHOWN_STATES: readonly BaseballAnimState[] = ['stance', 'swing_contact', 'swing_power'];
export function batVisibleFor(state: BaseballAnimState): boolean { return BAT_SHOWN_STATES.includes(state); }

export interface SwingBeatLog { state: BaseballAnimState; weight: SwingWeight; speedRatio: number; stopT: number }

type Phase = 'swing' | 'hold' | 'recover' | 'blend' | null;
type Beat = { input: Partial<BaseballAnimInput>; sec: number; phase?: Phase };

const REST: BaseballAnimInput = {
  pitching: false, windingUp: false, releasing: false, batting: false, swinging: null,
  fielding: 'none', throwing: false, running: false, sliding: false,
};

class BodyBeats {
  private queue: Beat[] = [];
  private t = 0;
  /** Bumped on every new beat, so the view re-fires a beat identical to the last one (two strikeouts in a row). */
  seq = 0;
  set(...beats: Beat[]): void { this.queue = beats; this.t = 0; this.seq++; }
  then(...beats: Beat[]): void { if (this.queue.length === 0) this.seq++; this.queue.push(...beats); }
  /** Seconds until the queue runs out. */
  remaining(): number { return this.queue.reduce((a, b) => a + b.sec, 0) - this.t; }
  tick(dt: number): void {
    if (!this.queue.length) return;
    this.t += dt;
    while (this.queue.length && this.t >= this.queue[0].sec) { this.t -= this.queue[0].sec; this.queue.shift(); this.seq++; if (!this.queue.length) this.t = 0; }
  }
  head(): { beat: Beat; t: number } | null { return this.queue.length ? { beat: this.queue[0], t: this.t } : null; }
}

export interface SlotFrame {
  batter: BaseballAnimInput; pitcher: BaseballAnimInput;
  batterSeq: number; pitcherSeq: number;
  /** The bat line's clock: seconds on the swing clip's own clock (held at the stop, then the recovery); null = the load. */
  batSec: number | null;
  /** §4: the batter's bat is drawn this frame. */
  batVisible: boolean;
  /** §3: the swing clip reached its contact key this frame — the hit-stop for this kind starts now. */
  hitStop: SwingKind | null;
  /** §3: power is in its hold — the view parks the clip on its last frame. */
  powerHold: boolean;
}

export class BaseballSlots {
  private batter = new BodyBeats();
  private pitcher = new BodyBeats();
  private pitcherOn = false;
  private swingW: SwingWeight = 'contact';
  private pendingHit: SwingKind | null = null;
  private lastKind: SwingKind | null = null;
  readonly swingLog: SwingBeatLog[] = [];

  constructor(readonly releaseSec: number) {}

  /** The delivery starts (the game's windup event): the release clip plays from its own leg lift. */
  windup(pitch?: BaseballPitch): void {
    this.pitcherOn = true;
    this.pitcher.set({ input: { releasing: true, sideArm: pitch?.label === 'SLD' }, sec: PITCH_HOLD_SEC });
  }

  swing(g: SwingGrade): void {
    const w = swingWeightFor(g.kind);
    this.swingW = w; this.pendingHit = null; this.lastKind = g.kind;
    const speed = swingSpeedRatio(w);
    const swinging = { batting: true, swinging: w, swingSpeed: SWING_SPEED[w] } as const;
    const swingSec = SWING_STOP_T[w] / speed;
    if (w === 'contact') {
      this.batter.set({ input: swinging, sec: swingSec, phase: 'swing' }, { input: { batting: true }, sec: BEAT_SEC.contactBlend, phase: 'blend' });
    } else {
      this.batter.set(
        { input: swinging, sec: swingSec, phase: 'swing' },
        { input: swinging, sec: BEAT_SEC.powerHold, phase: 'hold' },
        { input: { batting: true }, sec: BAT_RECOVER_SEC, phase: 'recover' },
      );
    }
    this.swingLog.push({ state: w === 'power' ? 'swing_power' : 'swing_contact', weight: w, speedRatio: speed, stopT: SWING_STOP_T[w] });
  }

  contact(g: SwingGrade): void {
    this.pendingHit = g.kind;
    const side: 'left' | 'right' = g.offsetSec < 0 ? 'left' : 'right';   // early pulls to the left field line
    const routine = [
      { input: { fielding: 'routine', strafe: side } as Partial<BaseballAnimInput>, sec: BEAT_SEC.close },
      { input: { fielding: 'routine' } as Partial<BaseballAnimInput>, sec: BEAT_SEC.fieldRoutine },
    ];
    const throwBeat = { input: { throwing: true } as Partial<BaseballAnimInput>, sec: BEAT_SEC.throw };
    switch (g.kind) {
      case 'homer':
        this.batter.then({ input: { celebrating: true }, sec: BEAT_SEC.celebrate }, { input: { running: true }, sec: BEAT_SEC.trot });
        break;
      case 'double':
        this.pitcher.set(...routine, throwBeat);
        this.runTo(RUN_TO_BASE_SEC.double, BEAT_SEC.close + BEAT_SEC.fieldRoutine + BEAT_SEC.throw);
        break;
      case 'single':
        this.pitcher.set({ input: { fielding: 'dive' }, sec: BEAT_SEC.fieldDive }, throwBeat);
        this.runTo(RUN_TO_BASE_SEC.single, BEAT_SEC.fieldDive + BEAT_SEC.throw);
        break;
      case 'out':   // the fly ball, caught: the fielder takes it and throws it in; the batter is out
        this.pitcher.set(...routine, throwBeat);
        this.batter.then({ input: { dejected: true }, sec: BEAT_SEC.dejected });
        break;
      default: break;
    }
  }

  /** Runs scored on a hit: the batter celebrates once he is in (a homer already celebrates). */
  scored(_runs: number): void {
    if (this.lastKind === 'homer') return;
    this.batter.then({ input: { celebrating: true }, sec: BEAT_SEC.celebrate });
  }

  strikeout(): void { this.batter.then({ input: { dejected: true }, sec: BEAT_SEC.dejected }); }

  /** The game is over: everyone back to rest. */
  end(): void { this.pitcherOn = false; this.pitcher.set(); }

  /** The batter-runner's run to the base; he slides if he reaches SLIDE range while the throw (released `throwAt` s from
   *  now) is in the air. */
  private runTo(runSec: number, throwAt: number): void {
    const start = this.batter.remaining();
    const slideAt = start + runSec - BEAT_SEC.slide;
    if (slideAt >= throwAt && slideAt <= throwAt + THROW_FLIGHT_SEC) {
      this.batter.then({ input: { running: true, sprint: true }, sec: runSec - BEAT_SEC.slide }, { input: { sliding: true }, sec: BEAT_SEC.slide });
    } else {
      this.batter.then({ input: { running: true, sprint: true }, sec: runSec });
    }
  }

  tick(dt: number): SlotFrame {
    this.batter.tick(dt); this.pitcher.tick(dt);
    const b = this.batter.head(), p = this.pitcher.head();
    let batSec: number | null = null;
    const w = this.swingW;
    switch (b?.beat.phase) {
      case 'swing': batSec = Math.min(b.t * swingSpeedRatio(w), SWING_STOP_T[w]); break;
      case 'hold': batSec = SWING_STOP_T[w]; break;
      case 'blend': batSec = SWING_STOP_T[w]; break;
      case 'recover': batSec = BAT_SWING_SEC + b.t; break;
      default: break;
    }
    let hitStop: SwingKind | null = null;
    if (this.pendingHit && batSec != null && batSec >= CONTACT_KEY_T) { hitStop = this.pendingHit; this.pendingHit = null; }
    const batter: BaseballAnimInput = { ...REST, batting: true, ...(b?.beat.input ?? {}) };
    const pitcher: BaseballAnimInput = { ...REST, pitching: this.pitcherOn, ...(p?.beat.input ?? {}) };
    return {
      batter, pitcher,
      batterSeq: this.batter.seq, pitcherSeq: this.pitcher.seq, batSec,
      batVisible: batVisibleFor(chooseBaseballClip(batter).state),
      hitStop, powerHold: b?.beat.phase === 'hold',
    };
  }
}

/** The two trees the view drives (anim/baseballTree BaseballAnimTree's shape). */
export interface SlotTree { update(i: BaseballAnimInput): BaseballAnimState; reset(): void }

/** Applies a SlotFrame to the trees: a new beat resets its tree first, so a beat identical to the last fires again. */
export class SlotDriver {
  private seqB = -1; private seqP = -1;
  constructor(private readonly batter: SlotTree | null, private readonly pitcher: SlotTree | null) {}
  apply(f: SlotFrame): { batter: BaseballAnimState | null; pitcher: BaseballAnimState | null } {
    if (f.batterSeq !== this.seqB) { this.seqB = f.batterSeq; this.batter?.reset(); }
    if (f.pitcherSeq !== this.seqP) { this.seqP = f.pitcherSeq; this.pitcher?.reset(); }
    return { batter: this.batter?.update(f.batter) ?? null, pitcher: this.pitcher?.update(f.pitcher) ?? null };
  }
}
