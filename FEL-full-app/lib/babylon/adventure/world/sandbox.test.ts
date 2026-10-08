// The test yard's layout: authored clean (the rails validate, spawns stand on ground), and the pieces answer the two
// questions the contract asks (how high is the ground; can one point see another).
import { describe, expect, it } from 'vitest';
import { buildSandbox, sandboxWorldSource, validateSandbox, YARD } from './sandbox';
import { clearBetween, groundYOf } from './pieces';
import { sandboxLoadout, sandboxPartner } from './sandboxSetup';
import { emptyAdventureSave, partnerCanCarry } from '../contracts';

describe('the sandbox yard', () => {
  const spec = buildSandbox();

  it('lints clean: the rail loop and its switches validate, every spawn stands on the ground', () => {
    expect(validateSandbox(spec)).toEqual([]);
    const loop = spec.rails.segments.filter((s) => s.id.startsWith('loop.'));
    expect(loop.every((s) => s.next && s.prev)).toBe(true);           // a closed circuit
    expect(spec.rails.segments.find((s) => s.id === 'loop.in')!.switches.some((w) => w.toSegment === 'side')).toBe(true);
    expect(spec.rails.segments.find((s) => s.id === 'side')!.switches.some((w) => w.toSegment === 'loop.in')).toBe(true);
  });

  it('has a long straight, a 15 % slope to a 9 m plateau, run-walls, and a void past the rim', () => {
    expect(groundYOf(spec.pieces, 0, 140)).toBe(0);
    expect(groundYOf(spec.pieces, 30, 60)).toBeCloseTo(4.5);
    expect(groundYOf(spec.pieces, 30, 100)).toBe(9);
    expect(groundYOf(spec.pieces, 7.3, 80)).toBe(5);
    expect(groundYOf(spec.pieces, YARD.maxX + 1, 0)).toBeNull();
    expect(spec.walls).toHaveLength(2);
  });

  it('the gate blocks sight and the way until it opens', () => {
    const src = sandboxWorldSource(spec);
    const a = { x: 0, y: 1, z: 190 }, b = { x: 0, y: 1, z: 205 };
    expect(src.clear(a, b)).toBe(false);
    expect(src.groundY(0, 197)).toBe(5);
    spec.gate.off = true;
    expect(src.clear(a, b)).toBe(true);
    expect(src.groundY(0, 197)).toBe(0);
    spec.gate.off = false;
    expect(clearBetween(spec.pieces, { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 50 })).toBe(true);
  });

  it('lends a partner that rides and flies (or a character that fuses), and a spell book, without touching the save', () => {
    const c = sandboxPartner('creature')!;
    expect(partnerCanCarry(c)).toEqual({ ride: true, fly: true });
    expect(partnerCanCarry(sandboxPartner('character')!)).toEqual({ ride: false, fly: false });
    const save = emptyAdventureSave(0);
    const lo = sandboxLoadout(save, 'wind');
    expect(lo.equipped).toContain('bolt.wind');
    expect(lo.known).toContain('mind.slowTime');
    expect(save.player.spells.known).toEqual([]);
  });
});
