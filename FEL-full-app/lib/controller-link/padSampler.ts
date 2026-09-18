// THE PAD SAMPLER — what a phone sends when it is being a controller (2026-09-13).
//
// Mission Phase B: "A physical controller connects to the PAD device over Bluetooth; the PAD device forwards
// CANONICAL ACTIONS, not raw button state."
//
// That sentence is the whole design. The phone owns the mapping problem, because the phone is the device the
// controller is actually paired to — it is the one that can see `gamepad.id` and know it is a Switch Pro. So
// the pad reads its controller through the Phase A profile layer (lib/input/profiles.ts) and puts CANONICAL
// buttons on the wire. The host never learns what hardware is in the room, and does not need to: four people
// on four different controllers all send the same sixteen bytes.
//
// It also means a host running an old build and a pad running a new one still agree, because the contract
// between them is the canonical vocabulary rather than a vendor's button order.
//
// TOUCH FALLBACK. A phone with no controller attached is still a pad — the same frame, filled from the
// on-screen layout instead. One wire format, so the host has no idea which it is talking to and no code path
// that only works for one of them.
//
// Pure: no timers, no sockets. `sample()` is called by whatever loop the page runs.

import { readPad, profileFor, type PadLike } from '@/lib/input/profiles';
import { applyRemap, readRemap } from '@/lib/input/remap';
import { encodePadFrame, packButtons, type PadFrame, type WireButton, PAD_FRAME_BYTES } from './wire';

/** What the on-screen controls are currently reporting. All optional: a touch layout is per mode. */
export interface TouchState {
  lx?: number; ly?: number; rx?: number; ry?: number;
  trigL?: number; trigR?: number;
  buttons?: Partial<Record<WireButton, boolean>>;
}

export const NO_TOUCH: TouchState = {};

/**
 * The pad's own clock.
 *
 * Frames carry ms since the PAD's session epoch, in a uint32 — that is ~49 days, so it cannot overflow in a
 * session, and starting from a session epoch rather than the unix epoch keeps the number small and keeps a
 * device's wall clock off the wire.
 */
export class PadClock {
  private t0: number;
  constructor(now = Date.now()) { this.t0 = now; }
  ms(now = Date.now()): number { return Math.max(0, Math.round(now - this.t0)); }
}

export interface SampleOpts {
  slot: number;
  /** The gamepad this phone has attached, if any. */
  pad?: PadLike | null;
  /** The on-screen controls, for a phone with no controller. */
  touch?: TouchState;
  /** Milliseconds since the pad's session epoch. */
  t: number;
}

/**
 * Build one canonical frame.
 *
 * A physical controller WINS over touch when both are present — if someone has picked up a controller, that
 * is the thing they are using, and a stray thumb resting on the screen must not fight it. The exception is
 * additive: a touch button held while a controller is attached still counts, because a phone propped up with
 * an on-screen START is a real way people play.
 */
export function sampleFrame(seq: number, o: SampleOpts): PadFrame {
  const touch = o.touch ?? NO_TOUCH;
  let lx = touch.lx ?? 0, ly = touch.ly ?? 0, rx = touch.rx ?? 0, ry = touch.ry ?? 0;
  let trigL = touch.trigL ?? 0, trigR = touch.trigR ?? 0;
  const pressed: Partial<Record<WireButton, boolean>> = { ...(touch.buttons ?? {}) };

  if (o.pad) {
    // THE MAPPING HAPPENS HERE, ON THE PHONE — the host receives canonical buttons and never sees a vendor
    const profile = profileFor(o.pad);
    const c = applyRemap(readPad(o.pad, profile), readRemap(profile.id));
    if (Math.hypot(c.lx, c.ly) > Math.hypot(lx, ly)) { lx = c.lx; ly = c.ly; }
    if (Math.hypot(c.rx, c.ry) > Math.hypot(rx, ry)) { rx = c.rx; ry = c.ry; }
    trigL = Math.max(trigL, c.triggers.L);
    trigR = Math.max(trigR, c.triggers.R);
    for (const b of ['A', 'B', 'X', 'Y', 'L1', 'R1', 'SELECT', 'START', 'LS', 'RS'] as const) {
      if (c.buttons[b]) pressed[b] = true;
    }
    if (c.dpad.up) pressed.UP = true;
    if (c.dpad.down) pressed.DOWN = true;
    if (c.dpad.left) pressed.LEFT = true;
    if (c.dpad.right) pressed.RIGHT = true;
  }

  return { slot: o.slot, seq: seq & 0xffff, lx, ly, rx, ry, buttons: packButtons(pressed), trigL, trigR, t: o.t };
}

/**
 * Should this frame be sent?
 *
 * At 60 Hz a resting pad sends 60 identical frames a second saying "nothing is happening". Skipping those is
 * most of the bandwidth for free — but NOT all of them: a link that goes silent is indistinguishable from a
 * link that has died, so an unchanged pad still sends a keepalive at KEEPALIVE_HZ. That is the difference
 * between "idle" and "gone", and the host needs it to decide whether to pause.
 */
export const KEEPALIVE_MS = 250;
/** Axis movement smaller than this is noise, not a change. */
export const AXIS_EPSILON = 0.012;   // just over one quantisation step (1/127)

export function frameChanged(a: PadFrame | null, b: PadFrame): boolean {
  if (!a) return true;
  if (a.buttons !== b.buttons) return true;
  if (Math.abs(a.lx - b.lx) > AXIS_EPSILON || Math.abs(a.ly - b.ly) > AXIS_EPSILON) return true;
  if (Math.abs(a.rx - b.rx) > AXIS_EPSILON || Math.abs(a.ry - b.ry) > AXIS_EPSILON) return true;
  if (Math.abs(a.trigL - b.trigL) > AXIS_EPSILON || Math.abs(a.trigR - b.trigR) > AXIS_EPSILON) return true;
  return false;
}

export function shouldSend(prev: PadFrame | null, next: PadFrame, sinceLastSendMs: number): boolean {
  return frameChanged(prev, next) || sinceLastSendMs >= KEEPALIVE_MS;
}

/**
 * The sender: holds the sequence counter and the reusable buffer so the hot path allocates nothing.
 *
 * `send` is injected, so this works over a data channel, over a WebSocket fallback, or over a test double.
 */
export class PadSender {
  private seq = 0;
  private prev: PadFrame | null = null;
  private lastSentAt = -Infinity;
  private buf = new Uint8Array(PAD_FRAME_BYTES);
  sent = 0;
  skipped = 0;

  constructor(private send: (bytes: Uint8Array) => void) {}

  /** Sample and send if it is worth sending. Returns the frame if it went, null if it was skipped. */
  tick(o: SampleOpts, nowMs = o.t): PadFrame | null {
    const next = sampleFrame(this.seq + 1, o);
    if (!shouldSend(this.prev, next, nowMs - this.lastSentAt)) { this.skipped++; return null; }
    this.seq = (this.seq + 1) & 0xffff;
    next.seq = this.seq;
    this.prev = next;
    this.lastSentAt = nowMs;
    this.sent++;
    this.send(encodePadFrame(next, this.buf));
    return next;
  }

  reset(): void { this.seq = 0; this.prev = null; this.lastSentAt = -Infinity; this.sent = 0; this.skipped = 0; }
}
