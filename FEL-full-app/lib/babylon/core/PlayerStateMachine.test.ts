import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { PlayerStateMachine, blendClip, facingFor, ALL_STATES, type PlayerState, type PlayerStateInputs } from './PlayerStateMachine';

const idleInputs: PlayerStateInputs = { hasBall: false, moving: false, gathering: false, shooting: false, dunking: false, passing: false, landing: false };

describe('PlayerStateMachine — phase 4 (idle, dribble, gather, shoot, pass, dunk, land)', () => {
  it('starts idle', () => {
    expect(new PlayerStateMachine().state).toBe('idle');
  });

  it('every declared state is reachable from idle through the legal graph (no orphan added to the union type)', () => {
    // breadth-first over the machine's own transitions, driven by inputs crafted to hit each target in turn
    const m = new PlayerStateMachine();
    const want: Record<PlayerState, Partial<PlayerStateInputs>> = {
      idle: {},
      dribble: { hasBall: true, moving: true },
      gather: { gathering: true },
      shoot: { shooting: true },
      pass: { passing: true },
      dunk: { dunking: true },
      land: { landing: true },
    };
    const seen = new Set<PlayerState>(['idle']);
    // idle → dribble → idle → gather → idle → shoot → land → idle → pass → idle → dunk → land → idle
    const path: PlayerState[] = ['dribble', 'idle', 'gather', 'idle', 'shoot', 'land', 'idle', 'pass', 'idle', 'dunk', 'land', 'idle'];
    for (const target of path) {
      const r = m.update({ ...idleInputs, ...want[target] });
      expect(r.rejected, `${m.state} → ${target} should be legal on this path`).toBeNull();
      seen.add(r.state);
    }
    for (const s of ALL_STATES) expect(seen.has(s), `${s} was never reached`).toBe(true);
  });

  it('entered fires on exactly the one frame a transition happens — holding the same inputs never double-fires', () => {
    const m = new PlayerStateMachine();
    const r1 = m.update({ ...idleInputs, shooting: true });
    expect(r1.entered).toBe(true);
    expect(r1.state).toBe('shoot');
    // the SAME shooting-press held across several frames must not re-enter 'shoot' each frame (the "no
    // double-fires or pops" guarantee — a mode hanging its one release animation off `entered` plays it once)
    const r2 = m.update({ ...idleInputs, shooting: true });
    const r3 = m.update({ ...idleInputs, shooting: true });
    expect(r2.entered).toBe(false);
    expect(r3.entered).toBe(false);
    expect(r2.state).toBe('shoot');
    expect(r3.state).toBe('shoot');
  });

  it('an illegal jump is rejected and the machine holds its current state rather than popping to it', () => {
    const m = new PlayerStateMachine();   // idle
    // idle has no direct edge to 'land' in the graph (you only land OUT of a shot/dunk/pass) — a snapshot that
    // claims landing with nothing having fired first is the "pop" the graph exists to catch.
    const r = m.update({ ...idleInputs, landing: true });
    expect(r.rejected).toBe('land');
    expect(r.entered).toBe(false);
    expect(m.state).toBe('idle');
  });

  it('a full shot round-trips idle → gather → shoot → land → idle cleanly', () => {
    const m = new PlayerStateMachine();
    expect(m.update({ ...idleInputs, gathering: true }).state).toBe('gather');
    expect(m.update({ ...idleInputs, shooting: true }).state).toBe('shoot');
    expect(m.update({ ...idleInputs, landing: true }).state).toBe('land');
    expect(m.update({ ...idleInputs }).state).toBe('idle');
  });

  it('a pump fake cancels the gather back to dribble, never straight to land (no state skipped)', () => {
    const m = new PlayerStateMachine();
    m.update({ ...idleInputs, gathering: true });
    expect(m.state).toBe('gather');
    const cancelled = m.update({ ...idleInputs, hasBall: true, moving: true });
    expect(cancelled.state).toBe('dribble');
    expect(cancelled.entered).toBe(true);
    // from gather, land is not a legal next state without shoot/dunk having actually fired
    const g2 = new PlayerStateMachine(); g2.update({ ...idleInputs, gathering: true });
    const bad = g2.update({ ...idleInputs, landing: true });
    expect(bad.rejected).toBe('land');
  });

  it('reset() snaps the state with no graph check, for a possession reset', () => {
    const m = new PlayerStateMachine();
    m.update({ ...idleInputs, dunking: true });
    expect(m.state).toBe('dunk');
    m.reset('idle');
    expect(m.state).toBe('idle');
  });

  it('dunk outranks every other simultaneous input (priority order), and commitments outrank merely carrying the ball', () => {
    const m = new PlayerStateMachine();
    expect(m.update({ hasBall: true, moving: true, gathering: true, shooting: true, dunking: true, passing: true, landing: true }).state).toBe('dunk');
    const m2 = new PlayerStateMachine();
    expect(m2.update({ hasBall: true, moving: true, gathering: true, shooting: true, dunking: false, passing: false, landing: false }).state).toBe('shoot');
  });
});

describe('blendClip — phase 4 animation blending (state + speed → clip)', () => {
  it('idle and dribble are distinct clips, and a slow dribble does not snap to the sprint loop', () => {
    expect(blendClip('idle', 0).clip).toBe('bball_idle');
    expect(blendClip('dribble', 0.2).clip).toBe('bball_dribble_loop');
    expect(blendClip('dribble', 0.9).clip).toBe('bball_dribble_run');
  });
  it('every declared state resolves to a clip (no state falls through undefined)', () => {
    for (const s of ALL_STATES) expect(typeof blendClip(s, 0.5).clip).toBe('string');
  });
  it('weight is always in 0..1', () => {
    for (const s of ALL_STATES) for (const sp of [0, 0.3, 0.6, 1]) {
      const w = blendClip(s, sp).weight;
      expect(w).toBeGreaterThanOrEqual(0); expect(w).toBeLessThanOrEqual(1);
    }
  });
});

describe('facingFor — phase 4 facing cue', () => {
  it('a body in motion faces its velocity; a stationary body keeps its last facing', () => {
    expect(facingFor(new Vector3(0, 0, 1), 1.5)).toBeCloseTo(0, 5);           // +z = yaw 0
    expect(facingFor(new Vector3(1, 0, 0), 1.5)).toBeCloseTo(Math.PI / 2, 5); // +x = yaw 90°
    expect(facingFor(new Vector3(0, 0, 0), 1.5)).toBeCloseTo(1.5, 5);
  });
});
