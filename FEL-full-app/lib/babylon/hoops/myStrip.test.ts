// hoops-play (2026-11-21): ONE RULE FOR THE STRIP, BOTH WAYS (knob hoops.myStripHandOn). My poke on a 1v1 / 3v3 handler lands only when my
// hand can get to his ball by the AI's own strip rule (aiStripLands: reach, his body's shield, the ball off the palm; a bump jars it loose),
// on top of the exposure read. Off = the exposure read alone, exactly as before.
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { aiStripLands, myBumpOpens, myStripHandOk, MY_STRIP_HAND_ON, STRIP_REACH_M } from './steals';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';

const knob = (v: number): void => { setFeelUser(true); setFeelSession(null); setFeelOverride('hoops.myStripHandOn', v); };
afterEach(() => resetFeelForTests());

// me at the origin facing +z; the handler 0.8 m in front of me (in on him)
const ME = { x: 0, z: 0 }, HIM = { x: 0, z: 0.8 };
const nearBall = { x: 0.35, y: 0.5, z: 0.5 };     // dribbled on my side of him, low: in reach, nothing between
const farBall = { x: 0.05, y: 0.5, z: 1.15 };     // in the hand away from me, in reach: his body is on the line my hand travels
const highNear = { x: 0.35, y: 1.0, z: 0.5 };    // in his palm at the top of the dribble
const outOfReach = { x: 0.4, y: 0.5, z: 1.6 };    // past my reach (1.65 m)

describe('myStripHandOk — the AI strip rule from my side', () => {
  it('ships on', () => { expect(MY_STRIP_HAND_ON).toBe(1); });
  it('on: a low ball on my side of him, in reach, can be stripped', () => { knob(1); expect(myStripHandOk(ME, HIM, nearBall)).toBe(true); });
  it('on: a ball in his far hand is shielded by his body', () => {
    knob(1);
    const r = aiStripLands(ME, HIM, farBall);
    expect(r.reach).toBeLessThan(STRIP_REACH_M);
    expect(r.clear).toBeLessThan(0.25);
    expect(myStripHandOk(ME, HIM, farBall)).toBe(false);
  });
  it('on: a ball past my reach is not mine', () => {
    knob(1);
    expect(Math.hypot(outOfReach.x, outOfReach.z)).toBeGreaterThan(STRIP_REACH_M);
    expect(myStripHandOk(ME, HIM, outOfReach)).toBe(false);
  });
  it('on: a ball in his palm holds, unless a bump has jarred it loose', () => {
    knob(1);
    expect(myStripHandOk(ME, HIM, highNear)).toBe(false);
    expect(myStripHandOk(ME, HIM, highNear, true)).toBe(true);
  });
  it('off: the hand check never refuses (the exposure read alone, as before)', () => {
    knob(0);
    for (const b of [nearBall, farBall, highNear, outOfReach]) expect(myStripHandOk(ME, HIM, b)).toBe(true);
  });
});

describe('myBumpOpens — the bump window, the same both ways', () => {
  it('on: only a contact the handler caused (he ran into me) opens my strip window', () => {
    knob(1); expect(myBumpOpens(true)).toBe(true); expect(myBumpOpens(false)).toBe(false);
  });
  it('off: any hard contact opens it, as before', () => { knob(0); expect(myBumpOpens(true)).toBe(true); expect(myBumpOpens(false)).toBe(true); });
});

describe('both modes ask it at my poke', () => {
  const read = (f: string): string => fs.readFileSync(path.join(__dirname, '..', 'modes', f), 'utf8');
  it('1v1: the poke connects only with handOk (and handOk is myStripHandOk from my root to his ball)', () => {
    const s = read('OneVOneMode.ts');
    expect(s).toMatch(/const handOk = myStripHandOk\(me\.root\.position, foe\.root\.position, ballWorld\(\), bumpAge <= BUMP_STRIP_WINDOW_SEC\);/);
    expect(s).toMatch(/dec\.phase !== 'gather' && dec\.phase !== 'check' && handOk\) \{/);
  });
  it('both: the bump window opens through myBumpOpens, with who caused the contact', () => {
    expect(read('OneVOneMode.ts')).toMatch(/\(defPhase === 'check' \|\| defPhase === 'drive'\) && myBumpOpens\(c\.attacker === 'foe'\)\) bumpAge = 0;/);
    expect(read('ThreeVThreeMode.ts')).toMatch(/\(attacker === me \|\| victim === me\) && myBumpOpens\(attacker === driver\)\) bumpAge = 0;/);
  });
  it('3v3: a read that connects is withdrawn when my hand cannot get to his ball', () => {
    const s = read('ThreeVThreeMode.ts');
    expect(s).toMatch(/if \(strip\.connects && !myStripHandOk\(me\.char\.root\.position, driver\.char\.root\.position, ballWorld\(\), bumpAge <= BUMP_STRIP_WINDOW_SEC\)\) strip\.connects = false;\n\s+if \(strip\.connects\) \{ driveStolen = true;/);
  });
});
