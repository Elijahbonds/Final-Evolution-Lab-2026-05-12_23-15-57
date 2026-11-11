// SWITCH-ON (2026-11-10): the inertial blend is on by default in the six modes the rig measured it better in (anim.inertialModesOn,
// default 1), and only there; 0 puts those modes back on the linear crossfade exactly (applyInertialBlend never touches the animator).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ANIM_INERTIAL_MODES_ON, ANIM_INERTIAL_MIN_HALF_LIFE_SEC, applyInertialBlend, inertialHalfLife, inertialOn } from './inertialize';
import { FEEL_STORAGE_KEY, resetFeelForTests, setFeelSession, setFeelUser } from '../../feel-panel/feel';
import { feelSessionBlock } from '../../feel-panel/sessionGate';

class FakeStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
const g = globalThis as { window?: unknown };
let ls: FakeStorage;
beforeEach(() => { resetFeelForTests(); ls = new FakeStorage(); g.window = { localStorage: ls }; });
afterEach(() => { resetFeelForTests(); delete g.window; });
const knobs = (o: Record<string, number>) => { ls.m.set(FEEL_STORAGE_KEY, JSON.stringify(o)); setFeelUser(true); setFeelSession(feelSessionBlock('/play/karate', '?playtest=1')); };
const spy = () => { const calls: string[] = []; return { calls, a: { setBlendMode: (m: 'linear' | 'inertial') => { calls.push(m); } } }; };

describe('anim.inertialModesOn', () => {
  it('defaults: on for the measured modes; the global switch stays off; the shortest half-life 0.045 s', () => {
    expect(ANIM_INERTIAL_MODES_ON).toBe(1);
    expect(inertialOn()).toBe(false);
    expect(ANIM_INERTIAL_MIN_HALF_LIFE_SEC).toBe(0.045);
    expect(inertialHalfLife(0.06)).toBeCloseTo(0.045, 9);   // 0.5 × 0.06 = 0.03 → floored
    expect(inertialHalfLife(0.18)).toBeCloseTo(0.09, 9);    // above the floor: AF-1's 0.5 × fade
    expect(inertialHalfLife(0)).toBe(0);                    // a hard cut stays a cut
  });
  it('a measured mode switches its hero to inertial; any other mode is untouched', () => {
    const m = spy(); expect(applyInertialBlend(m.a, 'measured')).toBe(true); expect(m.calls).toEqual(['inertial']);
    const o = spy(); expect(applyInertialBlend(o.a)).toBe(false); expect(o.calls).toEqual([]);
  });
  it('0 puts the measured modes back on the linear crossfade exactly: the animator is never touched', () => {
    knobs({ 'anim.inertialModesOn': 0 });
    const m = spy(); expect(applyInertialBlend(m.a, 'measured')).toBe(false); expect(m.calls).toEqual([]);
  });
  it('the global anim.inertial still turns every wired mode on', () => {
    knobs({ 'anim.inertial': 1, 'anim.inertialModesOn': 0 });
    const o = spy(); expect(applyInertialBlend(o.a)).toBe(true); expect(o.calls).toEqual(['inertial']);
  });
  it('exactly the six measured modes opt in (karate, karate VS, showdown, mixed combat, duel, skateboard)', () => {
    const dir = join(__dirname, '../modes');
    const opted = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
      .filter((f) => /applyInertialBlend\([^)]*'measured'\)/.test(readFileSync(join(dir, f), 'utf8'))).sort();
    expect(opted).toEqual(['DuelMode.ts', 'KarateEndlessMode.ts', 'KarateVSMode.ts', 'MixedCombatMode.ts', 'ShowdownMode.ts', 'SkateRunMode.ts']);
  });
});
