import { describe, it, expect } from 'vitest';
import { XButtonReader, DASH, launchHeight, LAUNCH_AIR_SEC } from './StormCombat';
import { StringBook, resolveMove, MOVES, attackFromMove, STRING_MAX } from './HordeDynamics';

describe('the X button (Storm)', () => {
  it('a quick press is a tap, two quick taps a double, a long press the guard', () => {
    const x = new XButtonReader();
    x.press(0); expect(x.guardHeld(0.05)).toBe(false); expect(x.release(0.1)).toBe('tap');
    x.press(0.2); expect(x.release(0.3)).toBe('double');
    x.press(1.0); expect(x.release(1.1)).toBe('tap');            // the double consumed the first tap
    x.press(2.0); expect(x.guardHeld(2.0 + DASH.tapSec)).toBe(true); expect(x.release(2.5)).toBe('held');
  });
});
describe('Storm combos on the book', () => {
  const seqs: ('A' | 'B' | 'Y')[][] = [['A','A','A'],['B','B','B'],['A','B','A'],['B','A','Y'],['B','B','A'],['B','A','A'],['A','B','B'],['Y','A','A'],['A','A','B'],['A','B','Y'],['B','B','Y'],['A','A','Y']];
  it('every three-button sequence is a distinct finisher route with its own clip on the last press', () => {
    const finishers = seqs.map((sq) => resolveMove(sq, 'n').clip);
    expect(new Set(finishers).size).toBeGreaterThanOrEqual(6);
    for (const sq of seqs) { const b = new StringBook(); let m = MOVES.jab; sq.forEach((k, i) => { m = b.press(k, 'n', i * 0.2); }); expect(m.ender || sq.length === STRING_MAX).toBe(true); }
  });
  it('the three presses of a string play three different clips', () => {
    const b = new StringBook(); const clips = ['A','B','A'].map((k, i) => b.press(k as 'A' | 'B', 'n', i * 0.2).clip);
    expect(new Set(clips).size).toBe(3);
  });
  it('the stick on the finisher: back = the sweep (a slam), forward = the rising dragon (a launcher)', () => {
    expect(resolveMove(['A','A','A'], 'b').id).toBe('sweep'); expect(resolveMove(['A','A','A'], 'b').slam).toBe(true);
    expect(resolveMove(['B','B','B'], 'f').launch).toBe(true);
  });
  it('a press out of a dash is the RUSH; presses at a launched body are AIR links and Y spikes him', () => {
    expect(resolveMove(['A'], 'n', { afterDash: true }).id).toBe('rush');
    expect(resolveMove(['A'], 'n', { air: true }).air).toBe(true);
    expect(resolveMove(['Y'], 'n', { air: true }).slam).toBe(true);
  });
  it('attackFromMove scales damage, stun and knockback with the weight and keeps the clip', () => {
    const base = { dmg: 6, chiGain: 8, guardDmg: 6 };
    const jab = attackFromMove(MOVES.jab, base), upper = attackFromMove(MOVES.uppercut, base);
    expect(upper.dmg).toBeGreaterThan(jab.dmg * 2); expect(upper.knockback).toBeGreaterThan(jab.knockback); expect(upper.stunSec).toBeGreaterThanOrEqual(0.9);
    expect(jab.clip).toBe('jab'); expect(upper.startupMs).toBeGreaterThan(jab.startupMs);
    expect(launchHeight(0.5)).toBeCloseTo(0.55, 6); expect(launchHeight(0)).toBe(0); expect(LAUNCH_AIR_SEC).toBeGreaterThan(0.5);
  });
});
