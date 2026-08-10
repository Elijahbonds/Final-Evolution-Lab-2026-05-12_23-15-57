// PlayerSlot — the multiplayer-READY abstraction 1v1/3v3 basketball is built
// on. Every body on the court (you, AI teammates, AI defenders) is driven by
// a `ControlSource` that produces the same small `Intent` shape every frame.
// Today only two sources exist: local input and AI. That is a deliberate,
// honest scope decision — this repo has zero visibility into whatever
// backend Abacus runs (is there a WebSocket/game-server layer? matchmaking?
// a room model?), and shipping guessed netcode against unknown
// infrastructure would be worse than not shipping it. What IS shippable
// today, and is most of the real engineering work regardless of transport:
// every piece of basketball game logic (movement, shooting, passing,
// defense) reads intent from a `ControlSource`, never from the input bus or
// an AI decision tree directly. Wiring a real second human into a slot is
// then "implement NetworkInputSource against your transport," not "rewrite
// the game."

import { Vector3 } from '@babylonjs/core';
import type { FelInput } from './InputBus';

export interface Intent {
  moveX: number; moveY: number;        // -1..1, already deadzoned
  sprint: boolean;
  action: boolean;                     // shoot/dunk trigger, edge-detected by the caller
  actionHeld: number;                  // 0..1 — shot-meter charge while held
  pass: boolean;                       // edge-detected
  steal: boolean;                      // edge-detected (defensive slot)
}

const NEUTRAL: Intent = { moveX: 0, moveY: 0, sprint: false, action: false, actionHeld: 0, pass: false, steal: false };

export interface ControlSource {
  /** Called once per frame; must return a fresh object (caller may mutate flags to consume edges). */
  poll(dt: number): Intent;
  dispose?(): void;
}

// ── Local human input. Modes already receive input via the harness's
//    `onInput(ctx, e)` callback (every mode this project ships uses this
//    pattern) — LocalInputSource plugs into that exact seam via feed(e),
//    rather than inventing a separate subscription API on InputBus. ──────
export class LocalInputSource implements ControlSource {
  private moveX = 0; private moveY = 0;
  private actionDown = false; private actionEdge = false; private held = 0;
  private passEdge = false; private stealEdge = false;

  /** Call from the mode's onInput(ctx, e) for every event. */
  feed(e: FelInput): void {
    if (e.t === 'stick' && e.side === 'L') { this.moveX = e.x; this.moveY = e.y; }
    if (e.t === 'trigger' && e.side === 'R') {
      this.held = e.value;
      if (e.value === 0 && this.actionDown) { this.actionEdge = true; this.actionDown = false; }
      if (e.value > 0.02) this.actionDown = true;
    }
    if (e.t === 'button' && e.pressed && e.btn === 'B') this.passEdge = true;
    if (e.t === 'button' && e.pressed && e.btn === 'X') this.stealEdge = true;
  }

  poll(): Intent {
    const out: Intent = {
      moveX: this.moveX, moveY: this.moveY,
      sprint: Math.hypot(this.moveX, this.moveY) > 0.85,
      action: this.actionEdge, actionHeld: this.held,
      pass: this.passEdge, steal: this.stealEdge,
    };
    this.actionEdge = false; this.passEdge = false; this.stealEdge = false;
    return out;
  }
}

// ── AI (used for every teammate/defender today; the same interface a real
//    opponent's network stream would implement) ──────────────────────────
export interface AIBehavior {
  decide(dt: number, self: Vector3, ball: Vector3, hoop: Vector3, allies: Vector3[], foes: Vector3[]): Intent;
}
export class AISource implements ControlSource {
  constructor(private self: Vector3, private world: {
    ball: () => Vector3; hoop: () => Vector3; allies: () => Vector3[]; foes: () => Vector3[];
  }, private brain: AIBehavior) {}
  poll(dt: number): Intent {
    return this.brain.decide(dt, this.self, this.world.ball(), this.world.hoop(), this.world.allies(), this.world.foes());
  }
}

// ── Network stub — the integration seam. NOT wired to any transport. A real
//    implementation reads Intent frames off whatever channel Abacus's
//    backend provides (WebSocket room, WebRTC data channel, polling REST —
//    the Intent shape above is transport-agnostic on purpose) and should
//    interpolate/extrapolate between received frames the way any netcode
//    does. Until that transport exists, this returns neutral input so a
//    slot assigned to it is inert rather than broken. */
export class NetworkInputSource implements ControlSource {
  private latest: Intent = { ...NEUTRAL };
  /** Call this from your transport's onmessage handler with the peer's Intent. */
  receive(intent: Intent): void { this.latest = intent; }
  poll(): Intent { return this.latest; }
}

/** One court body = one slot: a ControlSource + the character it drives.
 *  Game logic (DribbleController, ShotMeter, PassSystem) reads slot.intent
 *  every frame and never cares whether it came from a thumb, an AI, or the
 *  network. */
export class PlayerSlot {
  intent: Intent = { ...NEUTRAL };
  constructor(public id: string, public source: ControlSource, public isLocalHero: boolean) {}
  poll(dt: number): void { this.intent = this.source.poll(dt); }
  dispose(): void { this.source.dispose?.(); }
}
