// LOCOMOTION Phase 2 — move graph rules (2026-09-12).
import { describe, it, expect } from 'vitest';
import { MOVES, stepMove, IDLE_MACHINE, moveForGesture, BUFFER_MS } from '../../lib/locomotion/moves/MoveGraph';
import type { MoveMachine } from '../../lib/locomotion/moves/MoveGraph';

describe('a move only fires from its entry states', () => {
  it('no move interrupts a plant', () => {
    for (const id of Object.keys(MOVES) as Array<keyof typeof MOVES>) {
      expect(MOVES[id].entryStates).not.toContain('plant');
    }
  });
  it('a crossover refuses to fire from a plant', () => {
    const r = stepMove(IDLE_MACHINE, { gesture: 'flick_left', state: 'plant', dtMs: 16 });
    expect(r.started).toBeNull();
    expect(r.refused).toBe('wrong_state');
  });
  it('a hesitation needs real speed - it cannot fire from idle', () => {
    expect(stepMove(IDLE_MACHINE, { gesture: 'flick_back', state: 'idle', dtMs: 16 }).refused).toBe('wrong_state');
    expect(stepMove(IDLE_MACHINE, { gesture: 'flick_back', state: 'jog', dtMs: 16 }).started).toBe('hesitation');
  });
});

describe('chains are authored, never emergent', () => {
  it('chains only into declared moves, inside the cancel window', () => {
    let m: MoveMachine = stepMove(IDLE_MACHINE, { gesture: 'flick_left', state: 'jog', dtMs: 16 }).machine;
    // advance into the crossover's cancel window [120, 320]
    m = stepMove(m, { gesture: null, state: 'jog', dtMs: 150 }).machine;
    const ok = stepMove(m, { gesture: 'half_circle_back', state: 'jog', dtMs: 16 });
    expect(ok.started).toBe('between_the_legs');
  });
  it('refuses a chain the record does not declare', () => {
    let m: MoveMachine = stepMove(IDLE_MACHINE, { gesture: 'flick_forward_sprint', state: 'jog', dtMs: 16 }).machine;
    m = stepMove(m, { gesture: null, state: 'jog', dtMs: 100 }).machine;
    // attack_step chains into nothing
    const r = stepMove(m, { gesture: 'flick_left', state: 'jog', dtMs: 16 });
    expect(r.started).toBeNull();
    expect(r.refused).toBe('not_chainable');
  });
  it('input before the cancel window opens is dropped, not queued forever', () => {
    const m: MoveMachine = stepMove(IDLE_MACHINE, { gesture: 'flick_left', state: 'jog', dtMs: 16 }).machine;
    const early = stepMove(m, { gesture: 'half_circle_back', state: 'jog', dtMs: 10 });
    expect(early.started).toBeNull();
    expect(early.refused).toBe('outside_cancel_window');
    expect(early.machine.buffered).toBeNull();
  });
});

describe('moves cost momentum', () => {
  it('every move except a size-up costs speed', () => {
    for (const id of Object.keys(MOVES) as Array<keyof typeof MOVES>) {
      if (id === 'size_up') continue;
      expect(MOVES[id].momentumCost).toBeGreaterThan(0);
    }
  });
  it('three chained crossovers visibly cost speed', () => {
    let speed = 6.4;
    let m: MoveMachine = IDLE_MACHINE;
    for (let i = 0; i < 3; i++) {
      const r = stepMove(m, { gesture: 'flick_left', state: 'jog', dtMs: 16 });
      if (r.started) speed *= (1 - r.momentumCost);
      m = stepMove(r.machine, { gesture: null, state: 'jog', dtMs: 400 }).machine;   // let it finish
    }
    expect(speed).toBeLessThan(6.4 * 0.6);
  });
});

describe('the gesture vocabulary', () => {
  it('maps every gesture in the brief', () => {
    expect(moveForGesture('flick_left')).toBe('crossover');
    expect(moveForGesture('flick_back')).toBe('hesitation');
    expect(moveForGesture('half_circle_back')).toBe('between_the_legs');
    expect(moveForGesture('quarter_circle_away')).toBe('behind_the_back');
    expect(moveForGesture('hold_no_move')).toBe('size_up');
    expect(moveForGesture('flick_forward_sprint')).toBe('attack_step');
  });
  it('declares a 150ms buffer window', () => { expect(BUFFER_MS).toBe(150); });
  it('a hand switch is declared per move, not inferred', () => {
    expect(MOVES.crossover.handSwitch).toBe(true);
    expect(MOVES.attack_step.handSwitch).toBe(false);
  });
});
