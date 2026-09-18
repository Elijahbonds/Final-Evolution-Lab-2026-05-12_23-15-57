// THE HOST'S SIDE OF THE WIRE (2026-09-13).
//
// Mission Phase B. A frame arrives, and three things have to happen before a mode ever sees it:
//   1. it has to BE a frame (decode, or ignore);
//   2. it has to be NEWER than what that slot already sent (SeqGate — the channel is unordered on purpose);
//   3. it has to become FelInput, because that is the only vocabulary the twenty-odd modes speak.
//
// Step 3 is why this exists as its own module rather than living in host.ts: a remote pad and a local pad
// must be indistinguishable to a mode. The same `{t:'stick'}` / `{t:'button'}` events, the same edge
// latching, the same everything — so 3PT does not contain one line of code that knows whether the player is
// holding a controller in the room or a phone in the next one.
//
// EDGES, NOT LEVELS. A frame is a snapshot of what is held. Modes need press and release, so this keeps the
// previous frame per slot and emits only what changed — which is also what makes a dropped frame harmless:
// the next one re-states the whole truth.

import type { FelInput } from '@/lib/babylon/core/InputBus';
import { decodePadFrame, hasButton, SeqGate, LatencyTracker, WIRE_BUTTONS, type PadFrame, type WireButton } from './wire';

/** A canonical button's FelInput identity. The four directions are a d-pad; the rest are buttons. */
const DPAD: Partial<Record<WireButton, 'up' | 'down' | 'left' | 'right'>> = {
  UP: 'up', DOWN: 'down', LEFT: 'left', RIGHT: 'right',
};
const FEL_BTN: Partial<Record<WireButton, 'A' | 'B' | 'X' | 'Y' | 'L1' | 'R1' | 'SELECT' | 'START'>> = {
  A: 'A', B: 'B', X: 'X', Y: 'Y', L1: 'L1', R1: 'R1', SELECT: 'SELECT', START: 'START',
};

/** Below this a stick is centred. Matches the local pad path so remote and local feel the same. */
export const HOST_STICK_EPSILON = 0.02;

export interface HostInputOpts {
  /** Where the canonical events go — normally a mode's InputBus.emit. */
  emit: (slot: number, e: FelInput) => void;
  /** Slots above this are ignored. Four players, four slots. */
  maxSlots?: number;
}

export interface LinkStats {
  accepted: number;
  dropped: number;
  dropRate: number;
  jitterMs: number;
  /** Frames per second actually arriving, across all slots. */
  fps: number;
  /** Slots that have sent anything this session. */
  activeSlots: number[];
}

/**
 * Turns the wire into FelInput.
 *
 * One of these per host session. It owns the sequence gate, the per-slot previous frame, and the arrival
 * statistics the debug overlay reads.
 */
export class HostInput {
  private gate = new SeqGate();
  private prev = new Map<number, PadFrame>();
  private latency = new LatencyTracker();
  private firstAt = 0;
  private frames = 0;
  private opts: HostInputOpts;

  constructor(opts: HostInputOpts) { this.opts = opts; }

  /**
   * Feed one raw message from a data channel.
   *
   * Anything that is not a frame returns false WITHOUT counting as a drop: the control channel's JSON also
   * passes through here, and counting it as packet loss would make the overlay lie.
   */
  onMessage(data: ArrayBuffer | Uint8Array | string | null | undefined, now = Date.now()): boolean {
    if (typeof data === 'string' || data == null) return false;
    const frame = decodePadFrame(data);
    if (!frame) return false;
    return this.onFrame(frame, now);
  }

  /** Feed a decoded frame. Returns whether it was applied. */
  onFrame(frame: PadFrame, now = Date.now()): boolean {
    const max = this.opts.maxSlots ?? 4;
    if (frame.slot < 0 || frame.slot >= max) return false;
    if (!this.gate.accept(frame)) return false;

    if (this.firstAt === 0) this.firstAt = now;
    this.frames++;
    this.latency.push(frame.t, now);

    const prev = this.prev.get(frame.slot) ?? null;
    this.emitDiff(frame.slot, prev, frame);
    this.prev.set(frame.slot, frame);
    return true;
  }

  /** Emit only what changed between two frames. */
  private emitDiff(slot: number, a: PadFrame | null, b: PadFrame): void {
    const e = this.opts.emit;
    // sticks: on change, the same rule the local bus follows (a centred pad that re-emits every frame
    // overwrites a held key from another source)
    if (!a || Math.abs(a.lx - b.lx) > HOST_STICK_EPSILON || Math.abs(a.ly - b.ly) > HOST_STICK_EPSILON) {
      e(slot, { t: 'stick', side: 'L', x: b.lx, y: b.ly });
    }
    if (!a || Math.abs(a.rx - b.rx) > HOST_STICK_EPSILON || Math.abs(a.ry - b.ry) > HOST_STICK_EPSILON) {
      e(slot, { t: 'stick', side: 'R', x: b.rx, y: b.ry });
    }
    if (!a || Math.abs(a.trigL - b.trigL) > HOST_STICK_EPSILON) e(slot, { t: 'trigger', side: 'L', value: b.trigL });
    if (!a || Math.abs(a.trigR - b.trigR) > HOST_STICK_EPSILON) e(slot, { t: 'trigger', side: 'R', value: b.trigR });

    for (const name of WIRE_BUTTONS) {
      const was = a ? hasButton(a, name) : false;
      const is = hasButton(b, name);
      if (was === is) continue;
      const dir = DPAD[name];
      if (dir) e(slot, { t: 'dpad', dir, pressed: is });
      else {
        const btn = FEL_BTN[name];
        if (btn) e(slot, { t: 'button', btn, pressed: is });
      }
    }
  }

  /**
   * A slot has gone.
   *
   * RELEASES EVERYTHING IT WAS HOLDING, which is the bug a naive disconnect always has: a phone that dies
   * mid-press leaves its button latched down forever, and the character sprints into a wall until someone
   * restarts the game. Then forgets the sequence, so a rejoining client starting from 1 is not judged
   * against its old counter.
   */
  release(slot: number): void {
    const prev = this.prev.get(slot);
    if (prev) {
      const zero: PadFrame = { ...prev, lx: 0, ly: 0, rx: 0, ry: 0, buttons: 0, trigL: 0, trigR: 0 };
      this.emitDiff(slot, prev, zero);
    }
    this.prev.delete(slot);
    this.gate.reset(slot);
  }

  stats(now = Date.now()): LinkStats {
    const span = this.firstAt ? now - this.firstAt : 0;
    return {
      accepted: this.gate.accepted,
      dropped: this.gate.dropped,
      dropRate: this.gate.dropRate,
      jitterMs: Math.round(this.latency.jitterMs()),
      fps: Math.round(LatencyTracker.rate(this.frames, span)),
      activeSlots: [...this.prev.keys()].sort(),
    };
  }

  reset(): void {
    this.gate.resetAll();
    this.prev.clear();
    this.latency.clear();
    this.firstAt = 0;
    this.frames = 0;
  }
}
