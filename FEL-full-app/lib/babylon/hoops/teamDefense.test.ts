// lane/hoops-round2 HOP-03: the 3v3 switch on a screen and the double team — pure rules, then the mode's wiring.
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TeamDefense, teamDTune, DOUBLE_AFTER_SEC, DOUBLE_MAX_SEC, DOUBLE_COOLDOWN_SEC, SWITCH_COOLDOWN_SEC, type TeamDView, type XZ } from './teamDefense';
import { openFeel, closeFeel } from '@/tests/helpers/feelOverrides';

afterEach(() => closeFeel());
const rim: XZ = { x: 0, z: 0 };
const dt = 1 / 60;
const view = (o: Partial<TeamDView>): TeamDView => ({ marks: [0, 1, 2], defenders: [{ x: 0, z: 7 }, { x: -4, z: 5 }, { x: 4, z: 5 }], attackers: [{ x: 0, z: 8 }, { x: -4, z: 6 }, { x: 4, z: 6 }], handler: 0, rim, ...o });
const run = (td: TeamDefense, sec: number, v: TeamDView) => { const out = []; for (let i = 0; i < Math.round(sec / dt); i++) out.push(td.step(dt, v)); return out; };

describe('the switch on a screen', () => {
  // attacker 1 plants on defender 0 (who guards the handler, attacker 0); defender 1 (attacker 1's man) is near the ball
  const pick = view({ defenders: [{ x: 0, z: 6.9 }, { x: -0.9, z: 7.4 }, { x: 4, z: 5 }], attackers: [{ x: -1.0, z: 8.3 }, { x: -0.5, z: 7.2 }, { x: 4, z: 6 }] });   // he comes off the pick: his man is stuck behind it
  it('the screener\'s man takes the ball, the screened man takes the screener — a swap, nobody unmarked', () => {
    const td = new TeamDefense(); const s = td.step(dt, pick);
    expect(s.event).toEqual({ kind: 'switch', a: 0, b: 1 });
    expect([...s.marks]).toEqual([1, 0, 2]);
    expect([...s.marks].sort()).toEqual([0, 1, 2]);
  });
  it('one per cooldown: the swap back cannot come straight after', () => {
    const td = new TeamDefense(); const s = td.step(dt, pick);
    const again = run(td, SWITCH_COOLDOWN_SEC - 0.1, { ...pick, marks: s.marks });
    expect(again.some((x) => x.event?.kind === 'switch')).toBe(false);
  });
  it('no pick, no switch; a helper too far, no switch', () => {
    const td = new TeamDefense();
    expect(run(td, 1, view({})).some((x) => x.event?.kind === 'switch')).toBe(false);
    const far = { ...pick, defenders: [pick.defenders[0], { x: -3.5, z: 9.5 }, pick.defenders[2]] };
    expect(new TeamDefense().step(dt, far).event).toBeNull();
  });
  it('the A/B off is the release\'s defence', () => {
    openFeel({ 'hoops.switchOnScreenOn': 0 });
    expect(new TeamDefense().step(dt, pick).event).toBeNull();
  });
});

describe('the double team', () => {
  // the handler deep in the paint, his man on him, the other two at home
  const deep = view({ attackers: [{ x: 0.5, z: 1.8 }, { x: -4, z: 6 }, { x: 4, z: 6 }], defenders: [{ x: 0.4, z: 1.0 }, { x: -3.6, z: 5 }, { x: 3, z: 4 }] });
  it(`comes after ${DOUBLE_AFTER_SEC} s deep, from the nearest other defender, and he plays the handler`, () => {
    const td = new TeamDefense();
    const steps = run(td, DOUBLE_AFTER_SEC + 0.1, deep);
    const first = steps.findIndex((x) => x.event?.kind === 'double');
    expect(first * dt).toBeGreaterThanOrEqual(DOUBLE_AFTER_SEC - dt);
    expect(steps[first].event).toEqual({ kind: 'double', by: 2, on: 0 });
    expect([...steps[first].play]).toEqual([0, 1, 0]);
    expect([...steps[first].marks]).toEqual([0, 1, 2]);   // the base marks never change for a double
  });
  it('ends on the pass out (the doubler\'s man is the open read), then cools down', () => {
    const td = new TeamDefense(); run(td, DOUBLE_AFTER_SEC + 0.1, deep);
    const passed = td.step(dt, { ...deep, handler: null });
    expect(passed.event).toEqual({ kind: 'release', by: 2, why: 'pass' });
    expect([...passed.play]).toEqual([0, 1, 2]);
    expect(run(td, DOUBLE_COOLDOWN_SEC - 0.2, deep).some((x) => x.event?.kind === 'double')).toBe(false);
  });
  it(`lasts at most ${DOUBLE_MAX_SEC} s`, () => {
    const td = new TeamDefense();
    const steps = run(td, DOUBLE_AFTER_SEC + DOUBLE_MAX_SEC + 0.2, deep);
    expect(steps.some((x) => x.event?.kind === 'release' && x.event.why === 'time')).toBe(true);
  });
  it('never on the perimeter; never with the A/B off', () => {
    expect(run(new TeamDefense(), 3, view({})).some((x) => x.event?.kind === 'double')).toBe(false);
    openFeel({ 'hoops.doubleTeamOn': 0 });
    expect(teamDTune().doubleOn).toBe(false);
    expect(run(new TeamDefense(), 3, deep).some((x) => x.event?.kind === 'double')).toBe(false);
  });
});

describe('ThreeVThreeMode wiring', () => {
  const src = readFileSync(join(__dirname, '../modes/ThreeVThreeMode.ts'), 'utf8');
  it('steps the team defence after the scram switch and plays its marks', () => {
    expect(src).toMatch(/const td = teamD\.step\(dt, \{ marks, defenders: foePositions\(\), attackers: allyPositions\(\), handler: hIdx, rim: RIM \}\)/);
    expect(src).toMatch(/defenderBrains\[i\]\.setMark\(td\.play\[i\]\)/);
    expect(src.indexOf('const td = teamD.step(')).toBeGreaterThan(src.indexOf('const next = scramSwitch('));
  });
});
