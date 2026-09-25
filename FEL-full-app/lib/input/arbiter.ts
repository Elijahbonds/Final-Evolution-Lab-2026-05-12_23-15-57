// BodyArbiter — the body and a hand on the same game at once (movement play P3, 2026-09-24).
//
// The body is a fifth input source, and the other four were never told about it: a seated pad sends its trigger
// EVERY frame (it has to: DunkDuel starts the run on an RT event and the hoops slot's turboSeen reads it), so a crouch
// that pulled RT was overwritten 60 times a second by a resting pad's 0 (P3 row bug 3). Rather than change what the
// pad sends, the pad's value is FOLDED with the body's, and every other channel is composed the same careful way:
//
//   L stick   per axis. A thumb past AXIS_OWN owns that axis; otherwise the body's value shows through. A pad pushing
//             y and a body leaning x both work.
//   R stick   the body never writes it.
//   triggers  pad seated: pollPads delivers foldTrigger's event every frame — the pad's exact value while the body
//             pulls no deeper, so the pad stream is byte-for-byte what it was. A deeper body pull rides the next pad
//             frame (≤ 16 ms), unless a body press comes first (it flushes the change ahead of itself, see flush()); a
//             let-go goes out at once, so a release sent just before a pause reaches the mode still playing.
//             No pad: a Space ramp / touch hold / Controller Link charge is rewritten to max(it, body) while the body
//             pulls; a body change goes out as max(the last external value, body), tagged, on change.
//   buttons,  body presses are PULSES (the floor presses then releases ~60 ms later). A pulse is skipped when the bus
//   d-pad     says a pad or a key already holds that button, and its release is dropped when such a hold began during
//             the pulse (that hold owns the release now). Touch and Controller Link edges are not tracked: the last
//             writer wins, as it always has.
//
// WHOSE EVENT IT IS (review, 2026-09-24). `src: 'body'` is what the READY gate (isWakeInput), the harness's retry /
// resume guards and the play evidence read to tell the body from a hand, so a value the body made must carry it even
// when a hand's event carried it there. The rules:
//   • an event the body CAUSED (a floor output, a flush) is the body's, whatever share of a hand it carries;
//   • a hand's event is the body's when the value delivered is the body's: a trigger (pad frame or no-pad rewrite)
//     where the body pulls deeper than the hand, an L stick whose hand owns no axis (a thumb back at rest while the body
//     leans). A hand that owns an axis owns its event: one tag cannot split a vector, and the hand wins the tie.
// Measured before this: a seated pad at rest under a 0.7 crouch delivered an UNTAGGED 0.7 every frame, and a thumb
// back at rest under a 0.6 lean an untagged (0.6, 0) — both woke a READY game (isWakeInput) with nobody pressing.
//
// Z1 (the zero-regression contract's first line): while the body holds nothing, external() returns the very event it
// was given and foldTrigger the pad's own, so with no body published the bus is the bus it was (the golden).
// Pure: no DOM. The bus owns one and asks it about every event.
import type { BodyOut, FelButton, FelInput } from '@/lib/babylon/core/InputBus';

export const AXIS_OWN = 0.2;
type PadDir = 'up' | 'down' | 'left' | 'right';
export type HoldKey = `b:${FelButton}` | `d:${PadDir}`;
type Side = 'L' | 'R';
type TriggerEvent = Extract<FelInput, { t: 'trigger' }>;
interface Vec { x: number; y: number }
const SIDES: readonly Side[] = ['L', 'R'];

const keyOf = (e: Extract<FelInput, { t: 'button' | 'dpad' }>): HoldKey => (e.t === 'button' ? `b:${e.btn}` : `d:${e.dir}`);

export class BodyArbiter {
  /** The last external L stick (as sent, before any composing), and the body's own L stick. */
  private extL: Vec = { x: 0, y: 0 };
  private bodyL: Vec = { x: 0, y: 0 };
  /** The last L stick the listeners were given (composed or not), so a body change that changes nothing is silent. */
  private outL: Vec | null = null;
  /** The last external R stick, for current(). */
  private extR: Vec = { x: 0, y: 0 };
  /** Triggers: the last RAW external value per side (a pad's own, never the folded one), the body's, the last delivered. */
  private extT: Record<Side, number> = { L: 0, R: 0 };
  private bodyT: Record<Side, number> = { L: 0, R: 0 };
  private outT: Record<Side, number | null> = { L: null, R: null };
  /** Body presses delivered and not yet released. */
  private pulses = new Set<HoldKey>();

  /** isHeld: the bus's own `held` set (pad_* and KEYMAP/arrow keys, whose edges the bus tracks exactly). */
  constructor(private readonly isHeld: (k: HoldKey) => boolean) {}

  /** A non-body event on its way to listeners: returned as-is while body state is neutral (Z1), else composed (§3). */
  external(e: FelInput, padSeated: boolean): FelInput {
    // kept in the signature (the plan's §1.3): nothing on this side needs it yet — the pad's own trigger frames never
    // come through here (foldTrigger hands pollPads the event to deliver), and buttons / the d-pad pass untouched (the
    // pulses are judged in body())
    void padSeated;
    if (e.t === 'stick') {
      if (e.side === 'R') { this.extR = { x: e.x, y: e.y }; return e; }
      this.extL = { x: e.x, y: e.y };
      if (this.bodyL.x === 0 && this.bodyL.y === 0) { this.outL = { x: e.x, y: e.y }; return e; }
      const c = this.composeL();
      this.outL = c;
      // a hand that owns an axis owns its event; a hand that owns none (a thumb back at rest, a released key) delivers
      // the body's lean, and that is the body's event (see WHOSE EVENT IT IS)
      const handOwns = Math.abs(e.x) > AXIS_OWN || Math.abs(e.y) > AXIS_OWN;
      return handOwns ? { ...e, x: c.x, y: c.y } : { ...e, x: c.x, y: c.y, src: 'body' };
    }
    if (e.t === 'trigger') {
      const s = e.side, b = this.bodyT[s];
      this.extT[s] = e.value;
      // the hand pulls at least as deep (or the body pulls nothing): the hand's own event, untouched
      if (!(b > e.value)) { this.outT[s] = e.value; return e; }
      this.outT[s] = b;
      return { ...e, value: b, src: 'body' };   // the body's pull is the value delivered: the body's event
    }
    return e;
  }

  /** A floor output → what to deliver now ([] = skipped, or a deeper trigger pull folded into the next pad frame). */
  body(e: BodyOut, padSeated: boolean): FelInput[] {
    switch (e.t) {
      case 'stick': {
        if (e.side === 'R') return [];   // the body never writes the R stick (P3)
        this.bodyL = { x: e.x, y: e.y };
        const c = this.composeL();
        if (this.outL && this.outL.x === c.x && this.outL.y === c.y) return [];
        this.outL = c;
        return [{ t: 'stick', side: 'L', x: c.x, y: c.y, src: 'body' }];
      }
      case 'trigger': {
        const s = e.side;
        this.bodyT[s] = e.value;
        const v = this.bodyT[s] > 0 ? Math.max(this.extT[s], this.bodyT[s]) : this.extT[s];
        // pad seated: a deeper pull waits for the next pad frame (foldTrigger carries it) — but a LET-GO goes out now.
        // MOVEMENT PLAY P3 (2026-09-24, the step-3 review): the harness lets go of the body and pauses in the same call
        // (a START press, a stalled camera), and the pad frame that would have carried the drop reached a paused game
        // and was dropped. The mode held the crouch through the pause and saw it end on the first frame after the
        // resume, where SkateRun takes a let-go for a charged pop (pumpReleased, 250 ms). The pad's next frame repeats
        // the same value; max is idempotent, so that is harmless.
        if (padSeated && !(v < (this.outT[s] ?? 0))) return [];
        if (this.outT[s] === v) return [];
        this.outT[s] = v;
        return [{ t: 'trigger', side: s, value: v, src: 'body' }];
      }
      case 'button':
      case 'dpad': {
        const k = keyOf(e);
        if (e.pressed) {
          if (this.isHeld(k)) return [];  // a pad or a key holds it: this pulse (and its release) is skipped
          this.pulses.add(k);
          return [...this.flush(padSeated), e];
        }
        if (!this.pulses.delete(k)) return [];   // its press was skipped
        if (this.isHeld(k)) return [];           // a hold began during the pulse: that hold owns the release
        return [...this.flush(padSeated), e];
      }
    }
  }

  /**
   * A seated pad's per-frame trigger (pollPads) → the event to deliver, straight to the listeners: it is already
   * arbitrated, so it never goes back through external() (which would take the folded value for the pad's own, and a
   * body's pull would outlive the pad). The pad's own event, exact, while the body pulls no deeper; the body's
   * (tagged) while it does.
   */
  foldTrigger(side: 'L' | 'R', padT: number): TriggerEvent {
    this.extT[side] = padT;
    const b = this.bodyT[side];
    if (!(b > padT)) { this.outT[side] = padT; return { t: 'trigger', side, value: padT }; }
    this.outT[side] = b;
    return { t: 'trigger', side, value: b, src: 'body' };
  }

  /**
   * Pad seated, a deeper body pull waits for the next pad frame — but a body PRESS goes out at once, so a crouch's
   * peak and the hop's POP told in one camera step reached the mode as [A, RT 0]: the A before the peak, and the peak
   * never (the drop after the A overwrote it before the frame came). Measured on the bus. So a body edge first
   * delivers whatever trigger change it would otherwise overtake: the floor's order survives a seated pad.
   */
  private flush(padSeated: boolean): FelInput[] {
    if (!padSeated) return [];                  // no pad: a body trigger change already went out in order
    const out: FelInput[] = [];
    for (const s of SIDES) {
      const b = this.bodyT[s], p = this.extT[s];
      const v = b > p ? b : p;
      if (v === (this.outT[s] ?? 0)) continue;
      this.outT[s] = v;
      out.push({ t: 'trigger', side: s, value: v, src: 'body' });   // the body's doing: its change, or its let-go
    }
    return out;
  }

  /** Composed sticks + triggers (resync): tagged `src:'body'` where the body is part of the value (a trigger: where the
   *  body pulls deeper than the hand, as foldTrigger and external() tag it). */
  current(): FelInput[] {
    const l = this.composeL();
    const bodyInL = this.bodyL.x !== 0 || this.bodyL.y !== 0;
    const trig = (s: Side): FelInput => {
      const b = this.bodyT[s];
      return b > this.extT[s] ? { t: 'trigger', side: s, value: b, src: 'body' } : { t: 'trigger', side: s, value: this.extT[s] };
    };
    return [
      bodyInL ? { t: 'stick', side: 'L', x: l.x, y: l.y, src: 'body' } : { t: 'stick', side: 'L', x: l.x, y: l.y },
      { t: 'stick', side: 'R', x: this.extR.x, y: this.extR.y },
      trig('L'), trig('R'),
    ];
  }

  reset(): void {
    this.extL = { x: 0, y: 0 }; this.bodyL = { x: 0, y: 0 }; this.outL = null; this.extR = { x: 0, y: 0 };
    this.extT = { L: 0, R: 0 }; this.bodyT = { L: 0, R: 0 }; this.outT = { L: null, R: null };
    this.pulses.clear();
  }

  /** Per axis: |ext| > AXIS_OWN ? ext : (body !== 0 ? body : ext). */
  private composeL(): Vec {
    const axis = (ext: number, body: number): number => (Math.abs(ext) > AXIS_OWN ? ext : body !== 0 ? body : ext);
    return { x: axis(this.extL.x, this.bodyL.x), y: axis(this.extL.y, this.bodyL.y) };
  }
}
