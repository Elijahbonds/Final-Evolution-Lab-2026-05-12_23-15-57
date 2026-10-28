// lane/hoops-round2 HOP-02: the hoops defenders react late by tier (420 / 220 / 120 ms) — perception, nothing else.
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Vector3 } from '@babylonjs/core';
import { ReactionLens, ReactiveDefender, aiReactMs, tierReactionMs, AI_REACT_ROOKIE_MS, AI_REACT_PRO_MS, AI_REACT_ELITE_MS } from './reaction';
import { DefenderBrain } from '../core/BasketballCore';
import { TIERS } from '../core/Difficulty';
import { openFeel, closeFeel } from '@/tests/helpers/feelOverrides';

afterEach(() => closeFeel());

/** A handler who runs +x at 3 m/s, then reverses at `flipAt` (s). */
const handlerAt = (t: number, flipAt: number) => (t < flipAt ? 3 * t : 3 * flipAt - 3 * (t - flipAt));

describe('the tier table', () => {
  it('the knob defaults are Difficulty\'s reactionMs, the owner\'s 420 / 220 / 120', () => {
    expect([AI_REACT_ROOKIE_MS, AI_REACT_PRO_MS, AI_REACT_ELITE_MS]).toEqual([420, 220, 120]);
    expect(TIERS.map((t) => tierReactionMs(t))).toEqual([420, 220, 120]);
    expect(TIERS.map((t) => aiReactMs(t))).toEqual([420, 220, 120]);
  });
  it('a playtest override moves it; a ranked / head-to-head run cannot (feel() is closed there)', () => {
    openFeel({ 'hoops.aiReactRookieMs': 600 });
    expect(aiReactMs('rookie')).toBe(600);
    expect(aiReactMs('pro')).toBe(220);
    closeFeel();
    expect(aiReactMs('rookie')).toBe(420);
  });
});

describe('ReactionLens — a change is seen `delay` late, a steady run is not', () => {
  it('tracks a steady run with no lag (dead reckoning)', () => {
    const lens = new ReactionLens(); const p = new Vector3();
    let seen = 0;
    for (let i = 0; i <= 120; i++) { const t = i / 60; p.set(3 * t, 0, 0); seen = lens.see(t, 0.42, [p])[0].x; }
    expect(Math.abs(seen - 3 * 2)).toBeLessThan(0.02);
  });
  for (const [name, d] of [['rookie', 0.42], ['pro', 0.22], ['elite', 0.12]] as const) {
    it(`${name}: a reversal reaches the seen point ${d * 1000} ms late`, () => {
      const lens = new ReactionLens(); const p = new Vector3(); const flip = 1.0;
      let firstBack = -1, prev = -Infinity;
      for (let i = 0; i <= 150; i++) {
        const t = i / 60; p.set(handlerAt(t, flip), 0, 0);
        const x = lens.see(t, d, [p])[0].x;
        if (t > flip && firstBack < 0 && x < prev - 1e-6) firstBack = t;
        prev = x;
      }
      // the seen point keeps going until the reversal is `d` old (± a frame and the velocity span)
      expect(firstBack - flip).toBeGreaterThan(d - 0.02);
      expect(firstBack - flip).toBeLessThan(d + 0.13);
    });
  }
  it('a snap (a reset to the check) is seen at once, not walked to', () => {
    const lens = new ReactionLens(); const p = new Vector3();
    for (let i = 0; i < 60; i++) lens.see(i / 60, 0.42, [p.set(i / 60, 0, 0)]);
    const out = lens.see(1, 0.42, [p.set(-5, 0, 3)])[0];
    expect(out.x).toBeCloseTo(-5, 6); expect(out.z).toBeCloseTo(3, 6);
  });
  it('0 delay is the live point', () => {
    const lens = new ReactionLens(); const p = new Vector3(1, 2, 3);
    expect(lens.see(0, 0, [p])[0].equals(p)).toBe(true);
  });
});

describe('ReactiveDefender — the brain decides on what it perceived', () => {
  /** When the handler the inner brain is SHOWN first comes back after a reversal at 1.0 s. */
  const seenTurn = (tier: 'rookie' | 'pro' | 'elite') => {
    let shown = 0, prev = -Infinity, turned = -1; let tNow = 0;
    const spy = { decide: (_dt: number, _s: Vector3, _b: Vector3, _h: Vector3, _a: Vector3[], foes: Vector3[]) => { shown = foes[0].x; return { moveX: 0, moveY: 0, sprint: false, action: false, actionHeld: 0, pass: false, steal: false }; } };
    const rd = new ReactiveDefender(spy); rd.setTier(tier);
    for (let i = 0; i <= 150; i++) {
      tNow = i / 60; const h = new Vector3(handlerAt(tNow, 1.0), 0, 5);
      rd.decide(1 / 60, new Vector3(), h.clone(), new Vector3(), [], [h]);
      if (tNow > 1.0 && turned < 0 && shown < prev - 1e-6) turned = tNow;
      prev = shown;
    }
    return turned - 1.0;
  };
  it('the handler it is shown reverses 420 / 220 / 120 ms after he did', () => {
    const r = seenTurn('rookie'), p = seenTurn('pro'), e = seenTurn('elite');
    expect(r).toBeGreaterThan(0.40); expect(r).toBeLessThan(0.55);
    expect(p).toBeGreaterThan(0.20); expect(p).toBeLessThan(0.35);
    expect(e).toBeGreaterThan(0.10); expect(e).toBeLessThan(0.25);
  });
  it('wraps the real DefenderBrain (its own body and its teammates are not delayed)', () => {
    const brain = new DefenderBrain(0.6, null, () => 0.99); const rd = new ReactiveDefender(brain); rd.setTier('rookie');
    const self = new Vector3(0, 0, 3); const ally = new Vector3(2, 0, 3);
    let allySeen: Vector3 | null = null;
    const spy = new ReactiveDefender({ decide: (_dt, s, _b, _h, a) => { allySeen = a[0]; expect(s).toBe(self); return brain.decide(1 / 60, s, new Vector3(0, 1, 5), new Vector3(), a, [new Vector3(0, 0, 5)]); } });
    spy.decide(1 / 60, self, new Vector3(0, 1, 5), new Vector3(), [ally], [new Vector3(0, 0, 5)]);
    expect(allySeen).toBe(ally);
    const it = rd.decide(1 / 60, self, new Vector3(0, 1, 5), new Vector3(), [], [new Vector3(0, 0, 5)]);
    expect(Number.isFinite(it.moveX) && Number.isFinite(it.moveY)).toBe(true);
  });
});

describe('the modes wire it', () => {
  const one = readFileSync(join(__dirname, '../modes/OneVOneMode.ts'), 'utf8');
  const three = readFileSync(join(__dirname, '../modes/ThreeVThreeMode.ts'), 'utf8');
  it('1v1: the rival\'s DefenderBrain is polled through a ReactiveDefender, set to the run\'s tier', () => {
    expect(one).toMatch(/foeLens = new ReactiveDefender\(foeBrain = new DefenderBrain\(/);
    expect(one).toMatch(/foeLens\?\.setTier\(runTier\(\)\)/);
  });
  it('3v3: every defender brain is polled through its lens, set at load and at TAP TO START', () => {
    expect(three).toMatch(/new ReactiveDefender\(brain\); rd\.setTier\(runTierNow\)/);
    expect(three).toMatch(/new AISource\(char\.root\.position, world, aiSource \?\? brain\)/);
    expect(three).toMatch(/for \(const r of reactives\) r\.setTier\(tier\)/);
  });
});
