// hoops-p03 (1v1/3v3 phase 3): their 3v3 offence on bodies — the take-back, the probe, the screen, the swing, the attack, the tell; the
// budget keeps a possession from hanging; the tiers differ in what the team does.
import { describe, expect, it } from 'vitest';
import { TeamOffense3v3, TEAM_TIER, TEAM_OFFENSE_ON, TEAM_GATHER_TELL_SEC, RIVAL_TAKE_BACK_M, RIVAL_BUDGET_SEC, type TeamView, type HandlerStep } from './teamOffense3v3';
import { AiMover } from '../core/AiMovement';
import { TEAM_READS } from '../modes/threevthreeRules';

const DT = 1 / 60;
const RIM = { x: 0, z: -0.6 };
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
type P = { x: number; z: number };

/** A possession: the handler on an AiMover (as the mode moves him), his mates still, my defenders placed by `def`. */
function play(tier: 'rookie' | 'pro' | 'elite', o: { start?: P; def?: (h: P, t: number) => P[]; mates?: P[]; screen?: (t: number) => TeamView['screen']; seed?: number; maxSec?: number } = {}) {
  const team = new TeamOffense3v3(tier, TEAM_READS, seeded(o.seed ?? 7));
  team.beginPossession(); team.beginTouch({ fresh: true, intent: 'around' });
  const h = { ...(o.start ?? { x: 1, z: 2.5 }) };
  const mv = new AiMover(3.8);
  const mates = o.mates ?? [{ x: -5, z: 4 }, { x: 5, z: 4 }];
  const steps: (HandlerStep & { t: number; rim: number })[] = [];
  let maxAcc = 0; let pv = { x: 0, z: 0 };
  for (let t = 0; t < (o.maxSec ?? 20); t += DT) {
    const defenders = o.def ? o.def(h, t) : [{ x: h.x, z: h.z - 1.2 }];
    const s = team.step(DT, { handler: h, handlerVel: mv.vel, mates, defenders, rim: RIM, screen: o.screen ? o.screen(t) : null });
    const v = mv.track(DT, s.wish).vel;
    h.x += v.x * DT; h.z += v.z * DT;
    if (t > 0.05) maxAcc = Math.max(maxAcc, Math.hypot(v.x - pv.x, v.z - pv.z) / DT);
    pv = { x: v.x, z: v.z };
    steps.push({ ...s, t, rim: Math.hypot(h.x - RIM.x, h.z - RIM.z) });
    if (s.release || s.pass >= 0) break;
  }
  return { team, steps, h, maxAcc, last: steps[steps.length - 1] };
}
const front = (gap: number) => (h: P): P[] => { const dx = RIM.x - h.x, dz = RIM.z - h.z, L = Math.hypot(dx, dz) || 1; return [{ x: h.x + dx / L * gap, z: h.z + dz / L * gap }]; };

describe('hoops/teamOffense3v3', () => {
  it('ships on', () => { expect(TEAM_OFFENSE_ON).toBe(true); });
  it('a fresh possession in the paint is taken back beyond the arc first, then probed', () => {
    const r = play('pro', { start: { x: 1, z: 1.5 }, def: () => [{ x: 9, z: 12 }], mates: [] });
    const firstProbe = r.steps.find((s) => s.phase === 'probe');
    expect(r.steps.some((s) => s.phase === 'clear')).toBe(true);
    expect(firstProbe!.rim).toBeGreaterThanOrEqual(RIVAL_TAKE_BACK_M - 0.05);
  });
  it('the handler is a body: no frame accelerates past the mover\'s 33 m/s² (the gate is 34)', () => {
    for (const tier of ['rookie', 'pro', 'elite'] as const) for (const seed of [1, 2, 3]) {
      const r = play(tier, { seed, def: front(1.6) });
      expect(r.maxAcc, `${tier} ${seed}`).toBeLessThanOrEqual(33.01);
    }
  });
  it('an unguarded possession ends at the rim: the gather is the tell, then the release', () => {
    const r = play('pro', { def: () => [{ x: 9, z: 12 }], mates: [] });
    const g = r.steps.find((s) => s.gather);
    expect(g?.gather).toBe('rim');
    expect(r.last.release).toBe(true);
    expect(r.last.t - g!.t).toBeCloseTo(TEAM_GATHER_TELL_SEC, 1);
    expect(r.last.rim).toBeLessThan(2.2);
    // the seams' gather read: k crosses 1 − tell / driveSec (driveSec 1) exactly at the gather
    const before = r.steps.filter((s) => !s.gather && s.phase !== 'gather' && s.phase !== 'done');
    expect(Math.max(...before.map((s) => s.k))).toBeLessThan(1 - TEAM_GATHER_TELL_SEC);
  });
  it('a possession never hangs: the budget sends him (a body in front the whole way still ends in a shot or a pass)', () => {
    for (const tier of ['rookie', 'pro', 'elite'] as const) {
      const r = play(tier, { def: front(1.1), mates: [], maxSec: 25 });
      expect(r.last.release || r.last.pass >= 0, tier).toBe(true);
      expect(r.last.t, tier).toBeLessThan(RIVAL_BUDGET_SEC * TEAM_TIER[tier].budgetK + 4);
    }
  });
  it('the screen: called at the end of a probe, he waits for the plant and comes off the screener\'s hip', () => {
    let calls = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      let called = -1;
      const screen = (t: number): TeamView['screen'] => (called < 0 ? null : { idx: 0, phase: t - called > 1.0 ? 'set' : 'approach', at: { x: 0.9, z: 7.0 } });
      const team = new TeamOffense3v3('elite', TEAM_READS, seeded(seed)); team.beginPossession(); team.beginTouch({ fresh: false, intent: 'around' });
      const h = { x: 0, z: 8 }; const mv = new AiMover(3.8); let sawUse = false;
      for (let t = 0; t < 12; t += DT) {
        const s = team.step(DT, { handler: h, handlerVel: mv.vel, mates: [{ x: 0.9, z: 7 }, { x: 5, z: 4 }], defenders: [{ x: h.x + 0.3, z: h.z - 1.3 }, { x: 4, z: 3 }], rim: RIM, screen: screen(t) });
        if (s.callScreen >= 0) { calls++; called = t; }
        if (s.phase === 'use') sawUse = true;
        const v = mv.track(DT, s.wish).vel; h.x += v.x * DT; h.z += v.z * DT;
        if (s.release || s.pass >= 0) break;
      }
      if (called >= 0) expect(sawUse || team.actions.includes('crossover')).toBe(true);
    }
    expect(calls).toBeGreaterThan(0);
  });
  it('the tiers differ in what the team does: an elite team screens more and passes more than a rookie one', () => {
    expect(TEAM_TIER.elite.screenChance).toBeGreaterThan(TEAM_TIER.rookie.screenChance);
    expect(TEAM_TIER.elite.passes).toBeGreaterThan(TEAM_TIER.rookie.passes);
    expect(TEAM_TIER.rookie.readsScreen).toBe(false);
    expect(TEAM_TIER.elite.readsScreen).toBe(true);
  });
  it('a pass is counted against the tier\'s passes', () => {
    const t = new TeamOffense3v3('rookie', TEAM_READS); t.beginPossession();
    expect(t.passesLeft).toBe(TEAM_TIER.rookie.passes);
    t.notePass();
    expect(t.passesLeft).toBe(TEAM_TIER.rookie.passes - 1);
    expect(t.actions).toContain('swing_pass');
  });
});
