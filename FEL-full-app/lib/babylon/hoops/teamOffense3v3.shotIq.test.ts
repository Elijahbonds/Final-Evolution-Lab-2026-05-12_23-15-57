// hoops-gap (lane/hoops-gap, owner 2026-11-23 "close the gap"): the rival team's SHOT IQ (`hoops.aiShotIqOn`). Held in front, the
// handler finds the open man before a smothered pull-up, steps back once for room when nobody is open, and at the rim with a body in
// his face kicks it to the man the help left. Off (the default) is the release's order exactly.
import { afterEach, describe, expect, it } from 'vitest';
import { TeamOffense3v3, AI_SHOT_IQ_ON, SMOTHER_M, STEPBACK_SEC, HELP_FACE_M, type TeamView, type HandlerStep } from './teamOffense3v3';
import { AiMover } from '../core/AiMovement';
import { TEAM_READS } from '../modes/threevthreeRules';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';

// (the glued man holds the handler at the top, about 6.3 m out: the pull-up range is opened to 7 m so the pull-up is on the table)
const knob = (v: number): void => { setFeelUser(true); setFeelSession(null); setFeelOverride('hoops.aiShotIqOn', v); setFeelOverride('hoops.rivalPullUpMaxM', 7); };
afterEach(() => resetFeelForTests());

const DT = 1 / 60;
const RIM = { x: 0, z: -0.6 };
const seeded = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
type P = { x: number; z: number };

/** One touch that starts on the attack (no probe, no screen): the handler on an AiMover, a man glued `gap` m in front of him on his
 *  line to the rim, the mates where `mates` puts them, their men where `marks` puts them. */
function attack(o: { gap: number; mates: P[]; marks: P[]; seed?: number; start?: P; maxSec?: number }) {
  const team = new TeamOffense3v3('pro', TEAM_READS, seeded(o.seed ?? 7));
  team.beginPossession(); team.beginTouch({ fresh: false, intent: 'around' });
  const h = { ...(o.start ?? { x: 0.5, z: 5.2 }) };
  const mv = new AiMover(3.8);
  const steps: (HandlerStep & { t: number; rim: number; man: number })[] = [];
  for (let t = 0; t < (o.maxSec ?? 12); t += DT) {
    const dx = RIM.x - h.x, dz = RIM.z - h.z, L = Math.hypot(dx, dz) || 1;
    const g = Math.min(o.gap, Math.max(0.2, L - 0.3));
    const man = { x: h.x + dx / L * g, z: h.z + dz / L * g };
    const s = team.step(DT, { handler: h, handlerVel: mv.vel, mates: o.mates, defenders: [man, ...o.marks], rim: RIM, screen: null } as TeamView);
    const v = mv.track(DT, s.wish).vel;
    h.x += v.x * DT; h.z += v.z * DT;
    steps.push({ ...s, t, rim: Math.hypot(h.x - RIM.x, h.z - RIM.z), man: Math.hypot(man.x - h.x, man.z - h.z) });
    if (s.release || s.pass >= 0) break;
  }
  return { steps, last: steps[steps.length - 1], team };
}
// a mate wide open on the far wing, and one guarded tight in the corner
const OPEN_MATES = [{ x: -5.5, z: 4.5 }, { x: 6.2, z: 0.2 }];
const OPEN_MARKS = [{ x: -1.5, z: 1.5 }, { x: 5.9, z: 0.0 }];
// both mates covered
const SHUT_MARKS = [{ x: -5.2, z: 4.2 }, { x: 5.9, z: 0.0 }];

describe('hoops/teamOffense3v3 shot IQ (hoops.aiShotIqOn)', () => {
  it('ships off', () => { expect(AI_SHOT_IQ_ON).toBe(0); });

  it('off: held in front with a man open, he can still pull up into the man (the release\'s order)', () => {
    knob(0);
    const runs = [1, 2, 3, 4, 5, 6].map((seed) => attack({ gap: 1.0, mates: OPEN_MATES, marks: OPEN_MARKS, seed }));
    expect(runs.some((r) => r.steps.some((s) => s.gather === 'pullup') && r.last.pass < 0)).toBe(true);
  });

  it('on: held in front with a man open, the ball goes to him — never a pull-up into the man', () => {
    knob(1);
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = attack({ gap: 1.0, mates: OPEN_MATES, marks: OPEN_MARKS, seed });
      expect(r.last.pass, `seed ${seed}`).toBe(0);
      expect(r.steps.some((s) => s.gather === 'pullup'), `seed ${seed}`).toBe(false);
    }
  });

  it('on: nobody open and his man in his chest — one step-back for room, then the pull-up from further off him', () => {
    knob(1);
    const r = attack({ gap: 1.0, mates: OPEN_MATES, marks: SHUT_MARKS, seed: 3 });
    const stepAt = r.steps.findIndex((s) => s.action === 'stepback');
    const g = r.steps.findIndex((s) => s.gather === 'pullup');
    expect(stepAt).toBeGreaterThanOrEqual(0);
    expect(r.steps[stepAt].man).toBeLessThan(SMOTHER_M);
    expect(g).toBeGreaterThan(stepAt);
    expect(r.steps[g].t - r.steps[stepAt].t).toBeCloseTo(STEPBACK_SEC, 1);
    expect(r.steps.filter((s) => s.action === 'stepback').length).toBe(1);   // once a touch
    // the step goes away from his man: further from the rim at the gather than where it started
    expect(r.steps[g].rim).toBeGreaterThan(r.steps[stepAt].rim);
  });

  it('on: at the rim with the help in his face, the kick to the man the help left; with nobody there, the finish', () => {
    knob(1);
    // the help: a body stood under the rim on his line; his own man trailing behind (a blow-by)
    const help = (h: P): P[] => [{ x: 0, z: 0.9 }, { x: h.x + 1.2, z: h.z + 1.2 }];
    const team = new TeamOffense3v3('pro', TEAM_READS, seeded(5));
    team.beginPossession(); team.beginTouch({ fresh: false, intent: 'around' });
    const h = { x: 0.3, z: 4.0 }; const mv = new AiMover(3.8); let last: HandlerStep | null = null;
    for (let t = 0; t < 6; t += DT) {
      const s = team.step(DT, { handler: h, handlerVel: mv.vel, mates: OPEN_MATES, defenders: [...help(h), { x: 5.9, z: 0.0 }], rim: RIM, screen: null });
      const v = mv.track(DT, s.wish).vel; h.x += v.x * DT; h.z += v.z * DT; last = s;
      if (s.release || s.pass >= 0 || s.gather) break;
    }
    expect(last!.pass).toBe(0);
    expect(Math.hypot(h.x - 0, h.z - 0.9)).toBeLessThan(HELP_FACE_M + 0.6);
    // the same drive with the knob off goes up at the rim (no kick at the gather)
    knob(0);
    const t2 = new TeamOffense3v3('pro', TEAM_READS, seeded(5));
    t2.beginPossession(); t2.beginTouch({ fresh: false, intent: 'around' });
    const h2 = { x: 0.3, z: 4.0 }; const mv2 = new AiMover(3.8); let sawRim = false;
    for (let t = 0; t < 6; t += DT) {
      const s = t2.step(DT, { handler: h2, handlerVel: mv2.vel, mates: OPEN_MATES, defenders: [...help(h2), { x: 5.9, z: 0.0 }], rim: RIM, screen: null });
      const v = mv2.track(DT, s.wish).vel; h2.x += v.x * DT; h2.z += v.z * DT;
      if (s.gather === 'rim') sawRim = true;
      if (s.release || s.pass >= 0) break;
    }
    expect(sawRim).toBe(true);
  });
});
