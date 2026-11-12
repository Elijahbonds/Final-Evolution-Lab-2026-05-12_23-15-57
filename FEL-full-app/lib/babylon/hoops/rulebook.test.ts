// hoops-p09 ONE RULEBOOK: the rules the play audit asked for, pinned — a green open release always goes in; the contest and the distance
// only narrow the window; a masher never out-shoots a competent player; a move's outcome has no random term; the AI shoots through the
// same model; a mistimed dunk press never pays less than no press; the AI closes out on a jump-shot gather. Each knob's OFF value puts
// the old behaviour back (pinned here too).
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Vector3 } from '@babylonjs/core';
import { resetFeelForTests, setFeelOverride, setFeelSession, setFeelUser } from '../../feel-panel/feel';
import {
  skillVerdict, offsetForGrade, readTheMan, manReadFrom, pressFloored, jumpGreenScale, aiTimingSigmaSec, insideChance, erf,
  JUMP_GREEN_SCALE, FREE_FINISH_CONTEST, MOVE_LEAN_MPS, MOVE_COMMIT_MPS, AI_TIMING_ROOKIE_MS, AI_TIMING_PRO_MS, AI_TIMING_ELITE_MS,
} from './rulebook';
import { meterFor, makeAtOffset, expectedMake, aiRelease, heroSkillVerdict, rimFromRelease, normalQuantile } from '../core/SharedShot';
import { ShotMeter, SHOT_QUALITY_PCT, DefenderBrain, type ShotStyle } from '../core/BasketballCore';
import { resolveHandleMove, CHAIN_IDLE, MOVES_UNLOCKED_GATE, BASELINE_HANDLE, type DefenderRead } from '../core/HandleSystem';
import { SHOWTIME_PCT } from '../core/ShowtimeDunk';
import { trickPctFor } from '../core/GameDunks';
import { STICK_TRICK } from '../core/DunkTrickStick';
import { MAKE_RADIUS } from '../core/RimDecides';

const knob = (id: string, v: number): void => { setFeelUser(true); setFeelSession(null); setFeelOverride(id, v); };
afterEach(() => resetFeelForTests());

const JUMP: ShotStyle[] = ['jumper', 'fadeaway'];
const FINISH: ShotStyle[] = ['layup', 'floater', 'hook', 'reverse', 'fingerRoll', 'scoop', 'spinLayup', 'hangLayup'];
let seed = 11; const rnd = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

describe('the shot: the release decides', () => {
  it('AN OPEN GREEN RELEASE ALWAYS GOES IN — every style, every distance, anywhere inside the green', () => {
    for (const style of [...JUMP, ...FINISH]) for (const d of [1.2, 3, 4.5, 6.75, 7.5, 8.5]) {
      const m = meterFor(style, 0, d);
      const h = m.greenHalfSec;
      for (const f of [-0.999, -0.7, -0.35, 0, 0.2, 0.5, 0.999]) expect(makeAtOffset(style, 0, d, f * h), `${style} ${d} m at ${f} of the green`).toBe(1);
    }
  });
  it('a contested green goes in too: the contest made it NARROWER, it did not shave the make', () => {
    for (const style of JUMP) for (const c of [0.3, 0.6, 1]) expect(makeAtOffset(style, c, 6.75, 0)).toBe(1);
  });
  it('a jump shot released outside the green misses, early or late, open or not — no draw', () => {
    for (const style of JUMP) for (const c of [0, 0.5, 1]) {
      const h = meterFor(style, c, 6.75).greenHalfSec;
      for (const f of [1.05, 1.5, 3]) { expect(makeAtOffset(style, c, 6.75, -f * h)).toBe(0); expect(makeAtOffset(style, c, 6.75, f * h)).toBe(0); }
    }
  });
  it('the one sentence: the contest and the distance only ever shrink the green (monotonic, in ms)', () => {
    for (const style of JUMP) {
      let prev = Infinity;
      for (const c of [0, 0.25, 0.5, 0.75, 1]) { const h = meterFor(style, c, 6.75).greenHalfSec; expect(h).toBeLessThanOrEqual(prev + 1e-12); prev = h; }
      prev = Infinity;
      for (const d of [1.5, 3, 4.5, 6, 7.5, 9]) { const h = meterFor(style, 0, d).greenHalfSec; expect(h).toBeLessThanOrEqual(prev + 1e-12); prev = h; }
    }
  });
  it('ships at today\'s width (1); the proposal 0.62 makes an open jumper green about 70 ms (it was 105 to 117)', () => {
    const ms = (d: number): number => 2 * meterFor('jumper', 0, d).greenHalfSec * 1000;
    expect(JUMP_GREEN_SCALE).toBe(1);
    expect(ms(4.5)).toBeGreaterThan(112); expect(ms(4.5)).toBeLessThan(122);   // today's 117
    knob('hoops.jumpGreenScale', 0.62);
    expect(ms(4.5)).toBeGreaterThan(65); expect(ms(4.5)).toBeLessThan(76);
    expect(ms(6.75)).toBeGreaterThan(60); expect(ms(6.75)).toBeLessThan(70);
  });
  it('an uncontested finish goes in however it was timed; a contested one needs the green', () => {
    for (const style of FINISH) {
      expect(makeAtOffset(style, FREE_FINISH_CONTEST - 0.01, 1.5, 0.4)).toBe(1);   // 400 ms late, nobody on him
      expect(makeAtOffset(style, 0.8, 1.5, 0.4)).toBe(0);
    }
  });
  it('a brick is a miss whatever else is true', () => {
    expect(skillVerdict({ quality: 'brick', offsetSec: 0, halfSec: 0.05, finish: false, contest: 0 }).made).toBe(false);
  });
  it('a grade and an offset can never disagree (offsetForGrade)', () => {
    const h = 0.03;
    expect(Math.abs(offsetForGrade('perfect', 0.5, h))).toBeLessThanOrEqual(h);
    expect(Math.abs(offsetForGrade('good', 0, h))).toBeLessThanOrEqual(h);
    expect(offsetForGrade('early', 0, h)).toBeLessThan(-h);
    expect(offsetForGrade('late', 0, h)).toBeGreaterThan(h);
    expect(offsetForGrade('held', 0, h)).toBeGreaterThan(h);
  });
  it('the release window reads the contest AT THE RELEASE: a closeout during the gather narrows it', () => {
    const m = meterFor('jumper', 0.3, 6.75);
    const calm = heroSkillVerdict('good', 0.8 * m.greenHalfSec, { style: 'jumper', meterHalfSec: m.greenHalfSec, releaseContest: 0.3, distM: 6.75 });
    const closed = heroSkillVerdict('good', 0.8 * m.greenHalfSec, { style: 'jumper', meterHalfSec: m.greenHalfSec, releaseContest: 0.9, distM: 6.75 });
    expect(calm.made).toBe(true); expect(closed.made).toBe(false); expect(closed.halfSec).toBeLessThan(calm.halfSec);
  });
  it('the ring shows what the release decided: a make inside the make radius, a miss outside it, every time', () => {
    const RIM = new Vector3(0, 3.05, 0), to = new Vector3(0, 0, 6);
    for (let i = 0; i < 300; i++) {
      const c = rnd() * 3, made = c <= 1;
      const v = rimFromRelease(RIM, to, made, c, 0.6, { short: 0.4 }, rnd);
      expect(v.made).toBe(made);
      if (made) expect(v.radial).toBeLessThanOrEqual(MAKE_RADIUS); else expect(v.radial).toBeGreaterThan(MAKE_RADIUS);
    }
  });
  it('OFF (hoops.skillShotOn 0, hoops.jumpGreenScale 1): the old grade table and the old green, exactly', () => {
    knob('hoops.jumpGreenScale', 1);
    const old = new ShotMeter(); old.start(0, 'jumper', 0);
    expect(meterFor('jumper', 0, 1.5).greenHalfWidth01).toBeCloseTo(old.greenHalfWidth01, 12);
    expect(jumpGreenScale('jumper')).toBe(1);
    expect(makeAtOffset('jumper', 0, 1.5, 0, false)).toBeCloseTo(Math.min(0.98, SHOT_QUALITY_PCT.perfect * 0.95), 12);
  });
});

describe('a masher never beats a competent player', () => {
  const masher = (style: ShotStyle, c: number, d: number): number => {
    const m = meterFor(style, c, d); let sum = 0; const N = 400;
    for (let i = 0; i < N; i++) sum += makeAtOffset(style, c, d, ((i + 0.5) / N - m.greenCenter01) * m.durationSec);   // a press anywhere on the bar
    return sum / N;
  };
  it('open and contested, near and deep: a decent timer (45 ms) out-shoots a uniform presser by a wide margin', () => {
    for (const [d, c] of [[4.5, 0], [6.75, 0], [6.75, 0.5], [6.75, 0.8], [4.5, 1]] as const) {
      const decent = expectedMake('jumper', c, d, 0.045), random = masher('jumper', c, d);
      expect(decent, `${d} m contest ${c}`).toBeGreaterThan(random * 2.5);
    }
    expect(masher('jumper', 0, 6.75)).toBeLessThan(0.15);   // the audit's bar: a random presser at or under 15 % on open threes
  });
  it('mistimed presses go in clearly less often than they did (28 to 35 %): a release past the green is a miss', () => {
    for (const q of ['early', 'late'] as const) expect(skillVerdict({ quality: q, offsetSec: q === 'early' ? -0.08 : 0.08, halfSec: 0.035, finish: false, contest: 0 }).made).toBe(false);
  });
});

describe('the AI shoots through the same model', () => {
  it('its release is graded by the same meter and decided by the same rule as mine (same offset, same answer)', () => {
    for (let i = 0; i < 200; i++) {
      const style: ShotStyle = i % 3 === 0 ? 'layup' : 'jumper', c = rnd(), d = style === 'layup' ? 1.4 : 3 + rnd() * 5;
      let drawn = 0; const r = aiRelease({ who: 'pro', style, contest: c, distM: d }, () => { drawn++; return rnd(); });
      expect(drawn).toBe(2);   // its hand: one gaussian (two uniforms), and nothing else
      expect(r.verdict.made).toBe(makeAtOffset(style, c, d, r.offsetSec) === 1);
    }
  });
  it('the levels differ only in the hand: ROOKIE looser than PRO looser than ELITE', () => {
    expect(AI_TIMING_ROOKIE_MS).toBeGreaterThan(AI_TIMING_PRO_MS); expect(AI_TIMING_PRO_MS).toBeGreaterThan(AI_TIMING_ELITE_MS);
    const at = (s: number): number => expectedMake('jumper', 0.5, 6.0, s);
    expect(at(aiTimingSigmaSec('rookie'))).toBeLessThan(at(aiTimingSigmaSec('pro')));
    expect(at(aiTimingSigmaSec('pro'))).toBeLessThan(at(aiTimingSigmaSec('elite')));
  });
  it('a rival behind and forcing it times worse; one protecting a lead a little better (core/Nerve mistake)', () => {
    expect(aiTimingSigmaSec('pro', 1.5)).toBeGreaterThan(aiTimingSigmaSec('pro'));
    expect(aiTimingSigmaSec('pro', 0.7)).toBeLessThan(aiTimingSigmaSec('pro'));
  });
  it('the math the probes integrate with is right (erf, the normal quantile)', () => {
    expect(erf(1)).toBeCloseTo(0.8427008, 6); expect(insideChance(0.03, 0.03)).toBeCloseTo(0.6826895, 5);
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 5);
  });
  it('the modes call it: the 1v1 rival, the 3v3 rivals and my 3v3 teammates release through aiRelease; the old tables are the off path', () => {
    const one = readFileSync('lib/babylon/modes/OneVOneMode.ts', 'utf8'), three = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');
    expect(one).toMatch(/const rRel = aiSharedShotOn\(\) \? aiRelease\(\{ who: runTier\(\)/);
    expect(three).toMatch(/const fRel = aiSharedShotOn\(\) \? aiRelease\(\{ who: runTierNow/);
    expect(three).toMatch(/const mRel = finish === 'shot' && aiSharedShotOn\(\) \? aiRelease\(\{ who: 'mate'/);
    for (const s of [one, three]) expect(s).toMatch(/const skillV = skillShotOn\(\) \? heroSkillVerdict\(quality, shotMeter\.offsetSec/);
  });
});

describe('a move reads the man: no random term', () => {
  const READ: DefenderRead = { present: true, closing: false, set: false, within: true };
  const noDice = (): number => { throw new Error('a roll was asked for'); };
  const man = (lateral: number, closing: number, offBalance = false, side: 'left' | 'right' | null = 'right') => ({ closingMps: closing, lateralMps: lateral, offBalance, moveSide: side });
  it('a crossover going right beats a man moving LEFT across you; a set man holds and the ball is safe — no roll asked', () => {
    const beat = resolveHandleMove('crossover', CHAIN_IDLE, BASELINE_HANDLE, { ...READ, man: man(-(MOVE_LEAN_MPS + 0.1), 0) }, noDice, MOVES_UNLOCKED_GATE);
    expect(beat.broke).not.toBe('none');
    const held = resolveHandleMove('crossover', CHAIN_IDLE, BASELINE_HANDLE, { ...READ, set: true, man: man(0, 0) }, noDice, MOVES_UNLOCKED_GATE);
    expect(held.broke).toBe('none');
  });
  it('moving the SAME way as the move is staying in front: no break', () => {
    expect(resolveHandleMove('crossover', CHAIN_IDLE, BASELINE_HANDLE, { ...READ, man: man(MOVE_LEAN_MPS + 1, 0) }, noDice, MOVES_UNLOCKED_GATE).broke).toBe('none');
  });
  it('committed (coming at you) or off balance: beaten whichever way the move goes', () => {
    for (const side of ['left', 'right', null] as const) {
      expect(readTheMan(man(0, MOVE_COMMIT_MPS + 0.1, false, side)).beat).toBe(true);
      expect(readTheMan(man(0, 0, true, side)).beat).toBe(true);
      expect(readTheMan(man(0, MOVE_COMMIT_MPS - 0.1, false, side)).beat).toBe(false);
    }
  });
  it('the same read gives the same answer every time (1 000 calls, any roll)', () => {
    const r = man(-0.9, 0.3);
    const first = resolveHandleMove('between_legs', CHAIN_IDLE, BASELINE_HANDLE, { ...READ, man: r }, rnd, MOVES_UNLOCKED_GATE).broke;
    for (let i = 0; i < 1000; i++) expect(resolveHandleMove('between_legs', CHAIN_IDLE, BASELINE_HANDLE, { ...READ, man: r }, rnd, MOVES_UNLOCKED_GATE).broke).toBe(first);
  });
  it('the read is taken in MY frame: his velocity across me, by my facing', () => {
    // I face +z (yaw 0, my right is +x); he is 1.2 m in front, moving -x (to my left) at 1 m/s
    const r = manReadFrom({ x: 0, z: 0 }, 0, { x: 0, z: 1.2 }, { x: -1, z: 0 }, false, 'right');
    expect(r.lateralMps).toBeCloseTo(-1, 9); expect(r.closingMps).toBeCloseTo(0, 9);
    expect(readTheMan(r).beat).toBe(true);
    const rr = manReadFrom({ x: 0, z: 0 }, Math.PI, { x: 0, z: -1.2 }, { x: -1, z: 0 }, false, 'right');   // turned around: -x is my RIGHT now
    expect(rr.lateralMps).toBeCloseTo(1, 9); expect(readTheMan(rr).beat).toBe(false);
  });
  it('OFF (hoops.moveReadOn 0): the odds and the roll, as before', () => {
    knob('hoops.moveReadOn', 0);
    let rolled = 0;
    const o = resolveHandleMove('crossover', CHAIN_IDLE, BASELINE_HANDLE, { ...READ, man: man(-2, 0) }, () => { rolled++; return 0.99; }, MOVES_UNLOCKED_GATE);
    expect(rolled).toBe(1); expect(o.broke).toBe('none');
  });
  it('the modes pass the read at every resolve site, and roll only on the knob\'s off path', () => {
    const one = readFileSync('lib/babylon/modes/OneVOneMode.ts', 'utf8'), three = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');
    expect(one.match(/man: foeManRead\(/g)?.length).toBe(2);
    expect(three.match(/man: (?:foe|nfS) \? manReadOf\(/g)?.length).toBe(2);
    for (const s of [one, three]) for (const ln of s.split('\n')) {
      if (/roll\(\) < PUMP_BITE_CHANCE|< odds\)|roll\(\) < odds/.test(ln.replace(/\/\/.*$/, ''))) expect(ln, ln.trim().slice(0, 90)).toMatch(/dice-off: hoops\.moveReadOn 0/);
    }
  });
});

describe('a dunk press never pays less than not pressing', () => {
  it('showtime: early and late are floored at the untimed flush; a green still pays more', () => {
    for (const j of ['early', 'late'] as const) expect(pressFloored(SHOWTIME_PCT[j], SHOWTIME_PCT.none)).toBeGreaterThanOrEqual(SHOWTIME_PCT.none);
    expect(pressFloored(SHOWTIME_PCT.good, SHOWTIME_PCT.none)).toBe(SHOWTIME_PCT.good);
  });
  it('a trick thrown at the wrong moment is paid at least the plain dunk', () => {
    for (const spec of Object.values(STICK_TRICK)) for (const base of [0.6, 0.8, 0.95]) {
      for (const j of ['early', 'late'] as const) expect(pressFloored(trickPctFor(base, spec, j), base)).toBeGreaterThanOrEqual(base);
    }
  });
  it('OFF (hoops.pressFloorOn 0): the old table (early 0.42 against 0.70 untimed)', () => {
    knob('hoops.pressFloorOn', 0);
    expect(pressFloored(SHOWTIME_PCT.early, SHOWTIME_PCT.none)).toBe(0.42);
  });
});

describe('the closeout on the gather', () => {
  const run = (close: boolean): number => {
    const b = new DefenderBrain(0.7, null, () => 0.99);
    const hoop = new Vector3(0, 0, 0), shooter = new Vector3(0, 0, 7.0);
    const self = new Vector3(0, 0, 7.0 - 1.3);
    for (let i = 0; i < 90; i++) {
      b.closeOnGather = close && i >= 13;   // PRO's 220 ms
      const it = b.decide(1 / 60, self, shooter, hoop);
      const sp = it.sprint ? 6.4 : 4.6;
      self.x += it.moveX * sp / 60; self.z += -it.moveY * sp / 60;
    }
    return Math.hypot(self.x - shooter.x, self.z - shooter.z);
  };
  it('the man on a standing shooter steps from arm\'s length to the closeout spot once the gather is read', () => {
    const held = run(false), closed = run(true);
    console.info(`closeout test: held ${held.toFixed(2)} m, closed ${closed.toFixed(2)} m`);
    expect(closed).toBeLessThan(held - 0.12);
    expect(closed).toBeLessThan(0.8 + 0.12);
  });
  it('OFF (hoops.gatherCloseoutOn 0): he holds his spot even when the mode asks', () => {
    knob('hoops.gatherCloseoutOn', 0);
    expect(run(true)).toBeCloseTo(run(false), 9);
  });
});
