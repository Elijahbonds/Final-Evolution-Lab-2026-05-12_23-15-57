import { describe, expect, it } from 'vitest';
import {
  footballWindow, freeRunWindow, runPose, RUN_POSTURE, RUN_LEGS,
  FOOTBALL_INPUT_IDLE, FREERUN_INPUT_IDLE, runBank, RUN_BANK_MAX,
  type FootballPostureInput, type FreeRunPostureInput,
} from './RunPosture';

const F = (o: Partial<FootballPostureInput> = {}): FootballPostureInput => ({ ...FOOTBALL_INPUT_IDLE, ...o });
const R = (o: Partial<FreeRunPostureInput> = {}): FreeRunPostureInput => ({ ...FREERUN_INPUT_IDLE, ...o });

describe('RunPosture — the football resolver', () => {
  it('pre-snap is SET, not an idle: low, coiled, reading the front', () => {
    expect(footballWindow(F())).toBe('set');
    expect(RUN_POSTURE.set.eyes).toBe(1);
    expect(RUN_POSTURE.set.lean).toBeGreaterThan(10);
  });
  it('after the snap a moving runner CARRIES; a still one idles', () => {
    expect(footballWindow(F({ presnap: false, speed01: 0.9 }))).toBe('carry');
    expect(footballWindow(F({ presnap: false, speed01: 0 }))).toBe('idle');
  });
  it('a move beats the truck beats the carry; the tackle and the celebrate beat everything', () => {
    expect(footballWindow(F({ presnap: false, speed01: 1, move: 'juke', trucking: true }))).toBe('juke');
    expect(footballWindow(F({ presnap: false, speed01: 1, trucking: true }))).toBe('truck');
    expect(footballWindow(F({ presnap: true, downed: true }))).toBe('tackled');
    expect(footballWindow(F({ presnap: true, celebrating: true }))).toBe('celebrate');
    expect(footballWindow(F({ downed: true, celebrating: true }))).toBe('tackled');
  });
  it('a tackled body is handed back to the clip', () => {
    expect(RUN_POSTURE.tackled.weight).toBe(0);
    expect(RUN_LEGS.tackled.weight).toBe(0);
  });
  it('the truck lowers a shoulder INTO the contact', () => {
    expect(RUN_POSTURE.truck.forward).toBeGreaterThan(8);
    expect(RUN_POSTURE.truck.lean).toBeGreaterThan(15);
  });
  it('the juke sells with the hips while the chest stays on the line', () => {
    expect(RUN_POSTURE.juke.chestAim).toBeGreaterThan(0.8);
    expect(RUN_POSTURE.juke.hipYawKeep).toBeLessThan(0.6);
  });
});

describe('RunPosture — the freerun resolver', () => {
  it('the ground speed bands: idle → jog → run → sprint', () => {
    expect(freeRunWindow(R({ speed01: 0 }))).toBe('idle');
    expect(freeRunWindow(R({ speed01: 0.2 }))).toBe('jog');
    expect(freeRunWindow(R({ speed01: 0.5 }))).toBe('run');
    expect(freeRunWindow(R({ speed01: 0.95 }))).toBe('sprint');
  });
  it('the states own the body: wallrun / slide / air / trick', () => {
    expect(freeRunWindow(R({ state: 'wallrun', speed01: 1 }))).toBe('wallrun');
    expect(freeRunWindow(R({ state: 'slide', speed01: 1 }))).toBe('slide');
    expect(freeRunWindow(R({ state: 'air', speed01: 1 }))).toBe('air');
    expect(freeRunWindow(R({ state: 'air', tricking: true }))).toBe('trick');
  });
  it('DOWN is the clip’s, and the last of it is the get-up', () => {
    expect(freeRunWindow(R({ state: 'down' }))).toBe('down');
    expect(freeRunWindow(R({ state: 'down', rising: true }))).toBe('rise');
    expect(RUN_POSTURE.down.weight).toBe(0);
  });
  it('the landing beat outranks the run under it, and the vault outranks the stride', () => {
    expect(freeRunWindow(R({ landing: true, speed01: 1 }))).toBe('land');
    expect(freeRunWindow(R({ vaulting: true, speed01: 1 }))).toBe('vault');
    expect(freeRunWindow(R({ landing: true, vaulting: true }))).toBe('land');
  });
  it('the trick leaves the aim alone; the air keeps the eyes on the landing', () => {
    expect(RUN_POSTURE.trick.chestAim).toBe(0);
    expect(RUN_POSTURE.air.eyes).toBe(1);
  });
});

describe('RunPosture — shared', () => {
  it('the run loops keep their own feet; the set, the air and the land do not', () => {
    for (const w of ['jog', 'run', 'sprint', 'carry', 'juke', 'truck'] as const) expect(RUN_LEGS[w].weight).toBe(0);
    expect(RUN_LEGS.land.weight).toBe(1);
    expect(RUN_LEGS.land.footPitch).toBe(0);        // heels down through the absorb
    expect(RUN_LEGS.air.footPitch).toBeLessThan(0); // toes pointed in the air
  });
  it('every window has a leg pose and legal weights', () => {
    for (const w of Object.keys(RUN_POSTURE) as (keyof typeof RUN_POSTURE)[]) {
      expect(RUN_LEGS[w]).toBeDefined();
      expect(RUN_POSTURE[w].weight).toBeGreaterThanOrEqual(0);
      expect(RUN_POSTURE[w].weight).toBeLessThanOrEqual(1);
      expect(RUN_POSTURE[w].chestAim).toBeLessThanOrEqual(1);
    }
    expect(runPose('carry').pose).toBe(RUN_POSTURE.carry);
  });
  it('the cut banks with the turn, capped well under a board’s', () => {
    expect(runBank(0, 1)).toBe(0);
    expect(Math.abs(runBank(50, 1))).toBeCloseTo(RUN_BANK_MAX, 9);
    expect(runBank(-50, 1)).toBeCloseTo(-RUN_BANK_MAX, 9);
    expect(runBank(5, 0)).toBe(0);
  });
});
