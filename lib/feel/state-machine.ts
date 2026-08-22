/**
 * lib/feel/state-machine.ts
 * =========================
 * M9 — minimal, mode-agnostic FSM helper for the archetype cores.
 *
 * TypeScript port of the proven engineering-line StateMachine
 * (FEEL_REFERENCE_SPEC §3). States carry enter/exit/update effects;
 * transition RULES live in mode code (modes decide WHEN), which keeps
 * mode rules out of shared code. The machine never allocates during
 * update().
 *
 * NOTE: distinct from lib/anim/state-machine.ts (the AnimDirector clip
 * selector). This is the generic gameplay-phase FSM the cores drive; the
 * anim director consumes the phase this exposes.
 */

export interface FsmState<C = any> {
  enter?: (ctx: C, from: string | null) => void;
  update?: (ctx: C, dt: number) => void;
  exit?: (ctx: C, to: string) => void;
}

export interface StateMachineOpts<C = any> {
  initial: string;
  states: Record<string, FsmState<C>>;
  ctx?: C;
  onTransition?: (from: string, to: string) => void;
}

export class StateMachine<C = any> {
  states: Record<string, FsmState<C>>;
  ctx: C;
  onTransition: ((from: string, to: string) => void) | null;
  current: string;
  timeInState = 0;
  previous: string | null = null;

  constructor({ initial, states, ctx = {} as C, onTransition }: StateMachineOpts<C>) {
    this.states = states;
    this.ctx = ctx;
    this.onTransition = onTransition ?? null;
    this.current = initial;
    states[initial]?.enter?.(ctx, null);
  }

  /** @returns true if the transition happened */
  transition(to: string): boolean {
    if (to === this.current || !this.states[to]) return false;
    const from = this.current;
    this.states[from]?.exit?.(this.ctx, to);
    this.previous = from;
    this.current = to;
    this.timeInState = 0;
    this.states[to]?.enter?.(this.ctx, from);
    if (this.onTransition) this.onTransition(from, to);
    return true;
  }

  /** Advance the active state. Call from the fixed-timestep update. */
  update(dt: number): void {
    this.timeInState += dt;
    this.states[this.current]?.update?.(this.ctx, dt);
  }

  is(name: string): boolean {
    return this.current === name;
  }
}

export default StateMachine;
