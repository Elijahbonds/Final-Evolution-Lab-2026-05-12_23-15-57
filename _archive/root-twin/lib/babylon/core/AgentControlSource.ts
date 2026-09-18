// AgentControlSource — lets an AI agent occupy a player slot.
//
// The important design point: this implements the EXISTING `ControlSource`
// interface from PlayerSlot.ts (M48/M50). It is a sibling of
// LocalInputSource and AISource, not a special case bolted onto the game.
// That means agent-driven play runs through identical game code to
// human-driven play — movement, shot meter, passing, defense all read the
// same `Intent` shape. A test that drives a parallel path proves the
// parallel path works; this drives the real one.
//
// It also means the multiplayer story stays intact: an agent is simply
// another thing that can fill a slot, exactly as NetworkInputSource will be.
//
// TIMING MODEL
// Agents think in "do X for 300ms", the game thinks in per-frame intents.
// push() enqueues a timed intent; poll() drains it against real frame dt, so
// an agent's request survives frame-rate variation instead of being consumed
// in one tick. Edge-triggered flags (action/pass/steal/strike) fire exactly
// once — the same contract LocalInputSource honours — so a 300ms `pass`
// cannot become 18 passes.

import type { ControlSource, Intent } from './PlayerSlot';

/** Superset of `Intent` with the combat verbs karate needs. Modes that do
 *  not understand a field simply ignore it. */
export interface AgentIntent extends Intent {
  guard: boolean;
  strike: string | null;
}

const NEUTRAL: AgentIntent = {
  moveX: 0, moveY: 0, sprint: false, action: false, actionHeld: 0,
  pass: false, steal: false, guard: false, strike: null,
};

interface Queued { intent: Partial<AgentIntent>; remainingMs: number }

export class AgentControlSource implements ControlSource {
  private queue: Queued[] = [];
  private current: Queued | null = null;
  /** Edges already delivered for the current queued item. */
  private firedEdges = new Set<string>();

  /** Enqueue an intent to hold for `ms`. Calls are serialised in order, so
   *  an agent can script a combo without waiting on each step. */
  push(intent: Partial<AgentIntent>, ms = 250): void {
    this.queue.push({ intent, remainingMs: Math.max(16, ms) });
  }

  /** Drop everything pending and go neutral — an agent's emergency stop. */
  clear(): void {
    this.queue = [];
    this.current = null;
    this.firedEdges.clear();
  }

  /** True when the agent still has queued work. */
  get busy(): boolean { return this.queue.length > 0 || this.current !== null; }

  poll(dt: number): AgentIntent {
    // dt arrives in seconds from the harness; guard against a stalled tab
    // handing us a multi-second dt that would flush the whole queue at once.
    const stepMs = Math.min(100, Math.max(0, dt * 1000));

    if (!this.current) {
      this.current = this.queue.shift() ?? null;
      this.firedEdges.clear();
    }
    if (!this.current) return { ...NEUTRAL };

    const src = this.current.intent;
    const out: AgentIntent = { ...NEUTRAL };

    // Continuous fields: held for the whole duration.
    if (typeof src.moveX === 'number') out.moveX = clamp(src.moveX);
    if (typeof src.moveY === 'number') out.moveY = clamp(src.moveY);
    if (typeof src.actionHeld === 'number') out.actionHeld = clamp01(src.actionHeld);
    out.sprint = src.sprint ?? Math.hypot(out.moveX, out.moveY) > 0.85;
    out.guard = src.guard ?? false;

    // Edge fields: delivered on exactly one frame, matching LocalInputSource.
    for (const key of ['action', 'pass', 'steal'] as const) {
      if (src[key] && !this.firedEdges.has(key)) { out[key] = true; this.firedEdges.add(key); }
    }
    if (src.strike && !this.firedEdges.has('strike')) {
      out.strike = src.strike; this.firedEdges.add('strike');
    }

    this.current.remainingMs -= stepMs;
    if (this.current.remainingMs <= 0) { this.current = null; this.firedEdges.clear(); }
    return out;
  }

  dispose(): void { this.clear(); }
}

function clamp(v: number): number { return Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0; }
function clamp01(v: number): number { return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0; }

// WIRING (per mode that supports intent play):
//   import { AgentControlSource } from '../core/AgentControlSource';
//   import { agentBridge } from '../core/AgentBridge';
//
//   const agentCtl = new AgentControlSource();
//   // Give the agent the local slot when the bridge is enabled, otherwise
//   // keep the human source. One line, and no other game code changes.
//   const localSource = agentBridge() ? agentCtl : localInput;
//   agentBridge()?.attach({ scene: ctx.scene, modeId: 'onevone', control: agentCtl,
//                           getScore: () => score, getHero: () => vecOf(hero.position) });
