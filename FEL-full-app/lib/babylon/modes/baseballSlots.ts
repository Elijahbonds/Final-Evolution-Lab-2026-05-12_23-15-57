// baseballSlots — BASEBALL-FEEL (2026-10-23): which slot of anim/baseballTree each body is in, driven ONLY by the game's
// events (baseballGame.ts BaseballView) and the game clock. Pure: no Babylon, no Math.random, no wall clock, so the suite
// plays a seeded innings headless and reads the slot sequence (baseballFeel.test.ts, BB-10..BB-19).
//
// Every slot is wired to a game event:
//   pitcher  idle (between pitches) · windup (the delivery up to the release) · pitch_release (the release on)
//            field_routine → throw (weak contact: the pop-up he settles under, then the throw)
//            field_dive → throw (a single: the dive at the ball through the box, then the throw)
//   batter   stance (in the box) · swing_contact / swing_power (the press: power on a homer or a double, contact else)
//            run (a single, the trot after a homer) · slide (into second on a double) · celebrate (a homer)
//            dejected (strike three)
// Contact and power have distinct stop points on the swing clip's own clock (BAT_SWING_SEC = 0.55 s): contact checks
// at t = 0.42, power drives through to t = 0.55. Hit-stop: contact < power ≤ homer, all under HIT_STOP_CAP_MS.

import type { BaseballAnimInput, BaseballAnimState } from '../anim/baseballTree';
import { CLIP_ALIASES } from '../anim/clipAliases';
import { chooseBaseballClip } from '../anim/baseballTree';
import type { SwingGrade, SwingKind } from './baseballGame';

export type SwingWeight = 'contact' | 'power';

/** Where each swing stops on the swing clip's clock (s). Contact checks short of the follow-through; power finishes it. */
export const SWING_STOP_T: Readonly<Record<SwingWeight, number>> = { contact: 0.42, power: 0.55 };
/** TUNE: hit-stop per contact (ms). Order is the contract: contact < power ≤ homer, all ≤ HIT_STOP_CAP_MS. */
export const HIT_STOP_MS = { contact: 35, power: 50, homer: 60 } as const;
export const HIT_STOP_CAP_MS = 120;

/** TUNE: beat lengths on the game clock (s). */
export const BEAT_SEC = {
  swing: 0.9, celebrate: 1.6, trot: 2.0, run: 1.1, slide: 0.6, dejected: 1.2, fieldRoutine: 0.9, fieldDive: 0.7, throw: 0.8,
} as const;
/** The pitcher's hold after the release before he settles. */
export const PITCH_HOLD_SEC = 1.3;

export function swingWeightFor(kind: SwingKind): SwingWeight {
  return kind === 'homer' || kind === 'double' ? 'power' : 'contact';
}

/** The hit-stop a contact earns (ms). */
export function hitStopFor(kind: SwingKind): number {
  return kind === 'homer' ? HIT_STOP_MS.homer : swingWeightFor(kind) === 'power' ? HIT_STOP_MS.power : HIT_STOP_MS.contact;
}

/** The speed the swing slot's clip plays at (its alias multiplier: baseball_swing_full ×1.0, baseball_contact_drive ×1.1). */
export function swingSpeedRatio(w: SwingWeight): number {
  const clip = chooseBaseballClip({ pitching: false, windingUp: false, releasing: false, batting: true, swinging: w, fielding: 'none', throwing: false, running: false, sliding: false }).clip;
  return CLIP_ALIASES[clip]?.[1] ?? 1;
}

export interface SwingBeatLog { state: BaseballAnimState; weight: SwingWeight; speedRatio: number; stopT: number }

type Beat = { input: Partial<BaseballAnimInput>; sec: number };

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
  tick(dt: number): void {
    if (!this.queue.length) return;
    this.t += dt;
    while (this.queue.length && this.t >= this.queue[0].sec) { this.t -= this.queue[0].sec; this.queue.shift(); this.seq++; if (!this.queue.length) this.t = 0; }
  }
  head(): { input: Partial<BaseballAnimInput>; t: number } | null { return this.queue.length ? { input: this.queue[0].input, t: this.t } : null; }
}

export interface SlotFrame {
  batter: BaseballAnimInput; pitcher: BaseballAnimInput;
  batterSeq: number; pitcherSeq: number;
  /** The bat line's clock: seconds into the swing clip, held at its stop point (null = the load). */
  batSec: number | null;
}

export class BaseballSlots {
  private batter = new BodyBeats();
  private pitcher = new BodyBeats();
  private swingW: SwingWeight = 'contact';
  readonly swingLog: SwingBeatLog[] = [];

  constructor(readonly releaseSec: number) {}

  windup(): void {
    this.pitcher.set({ input: { pitching: true, windingUp: true }, sec: this.releaseSec }, { input: { releasing: true }, sec: PITCH_HOLD_SEC - this.releaseSec });
  }

  swing(g: SwingGrade): void {
    const w = swingWeightFor(g.kind);
    this.swingW = w;
    this.batter.set({ input: { batting: true, swinging: w }, sec: BEAT_SEC.swing });
    this.swingLog.push({ state: w === 'power' ? 'swing_power' : 'swing_contact', weight: w, speedRatio: swingSpeedRatio(w), stopT: SWING_STOP_T[w] });
  }

  contact(g: SwingGrade): void {
    switch (g.kind) {
      case 'homer': this.batter.then({ input: { celebrating: true }, sec: BEAT_SEC.celebrate }, { input: { running: true }, sec: BEAT_SEC.trot }); break;
      case 'double': this.batter.then({ input: { running: true }, sec: BEAT_SEC.run }, { input: { sliding: true }, sec: BEAT_SEC.slide });
        break;
      case 'single': this.batter.then({ input: { running: true }, sec: BEAT_SEC.run });
        this.pitcher.set({ input: { fielding: 'dive' }, sec: BEAT_SEC.fieldDive }, { input: { throwing: true }, sec: BEAT_SEC.throw }); break;
      case 'out': this.pitcher.set({ input: { fielding: 'routine' }, sec: BEAT_SEC.fieldRoutine }, { input: { throwing: true }, sec: BEAT_SEC.throw }); break;
      default: break;
    }
  }

  strikeout(): void { this.batter.then({ input: { dejected: true }, sec: BEAT_SEC.dejected }); }

  tick(dt: number): SlotFrame {
    this.batter.tick(dt); this.pitcher.tick(dt);
    const b = this.batter.head(), p = this.pitcher.head();
    let batSec: number | null = null;
    if (b?.input.swinging) batSec = Math.min(b.t * swingSpeedRatio(this.swingW), SWING_STOP_T[this.swingW]);
    return {
      batter: { ...REST, batting: true, ...(b?.input ?? {}) },
      pitcher: { ...REST, ...(p?.input ?? {}) },
      batterSeq: this.batter.seq, pitcherSeq: this.pitcher.seq, batSec,
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
