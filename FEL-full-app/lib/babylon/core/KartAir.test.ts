import { describe, expect, it } from 'vitest';
import {
  BAIL_BELOW, KART_AIR_G, KART_TRICKS, MIN_TRICK_AIR, biggestFitting, boostEarnFor,
  idleAir, kartTrickFor, launch, startTrick, stepAir, type KartAirState,
} from './KartAir';
import { basePts } from './BoardTricks';

const RAMPS = { kicker: 9, jump: 15, gap: 18 };

// heldTrickDir is SCREEN convention: +y is 'down'. So 'up' (NOSE LIFT) is y = -1 and 'down' (BACK FLIP) is y = +1.

/** Fly a launch to the ground, asking for a trick on the first frame if one is given. */
function fly(
  state: KartAirState,
  opts: { dt?: number; yawErrorDeg?: number; trick?: [number, number, 'A' | 'B' | 'X' | 'Y'] } = {},
) {
  const dt = opts.dt ?? 1 / 60;
  let s = state;
  if (opts.trick) s = startTrick(s, opts.trick[0], opts.trick[1], opts.trick[2]);
  for (let i = 0; i < 600 && s.airborne; i++) {
    // clearance goes negative once the arc has come back down
    const next = stepAir(s, dt, {
      groundClearance: s.height > 0.05 || s.t < dt * 1.5 ? 1 : -1,
      yawErrorDeg: opts.yawErrorDeg ?? 0,
    });
    s = next;
  }
  return s;
}

describe('kart air', () => {
  describe('boost buys air, and air buys tricks', () => {
    it.each([
      ['kicker cold', RAMPS.kicker, 26, false],
      ['kicker boosting', RAMPS.kicker, 35, true],
      ['jump cold', RAMPS.jump, 26, false],
      ['jump boosting', RAMPS.jump, 35, true],
      ['gap boosting', RAMPS.gap, 35, true],
    ])('%s gives the air the physics says it does', (_n, pitchDeg, speed) => {
      const s = launch(idleAir(), { speed, pitchDeg, boosting: speed > 30 });
      const expected = (2 * speed * Math.sin((pitchDeg * Math.PI) / 180)) / KART_AIR_G;
      expect(s.airSec).toBeCloseTo(expected, 3);
      expect(s.airborne).toBe(true);
    });

    it('a cold kicker gives a hop with nothing to throw', () => {
      const s = launch(idleAir(), { speed: 26, pitchDeg: RAMPS.kicker, boosting: false });
      expect(s.airSec).toBeLessThan(MIN_TRICK_AIR + 0.1);
      expect(biggestFitting(s.airSec)).toBeNull();
    });

    it('the SAME kicker with the boost lit becomes a trick', () => {
      const cold = launch(idleAir(), { speed: 26, pitchDeg: RAMPS.kicker, boosting: false });
      const hot = launch(idleAir(), { speed: 35, pitchDeg: RAMPS.kicker, boosting: true });
      expect(hot.airSec).toBeGreaterThan(cold.airSec);
      expect(biggestFitting(hot.airSec)).not.toBeNull();
      expect(biggestFitting(hot.airSec)!.id).toBe('kart_nose');
    });

    it('the big rotations only ever fit off a boosted jump or gap', () => {
      const flip = KART_TRICKS.find((t) => t.id === 'kart_backflip')!;
      const coldJump = launch(idleAir(), { speed: 26, pitchDeg: RAMPS.jump, boosting: false });
      const hotGap = launch(idleAir(), { speed: 35, pitchDeg: RAMPS.gap, boosting: true });
      expect(coldJump.airSec).toBeLessThan(flip.airSec);
      expect(hotGap.airSec).toBeGreaterThanOrEqual(flip.airSec);
    });

    it('a faster kart out of the garage can throw more, with no special case', () => {
      const starter = launch(idleAir(), { speed: 26, pitchDeg: RAMPS.jump, boosting: false });
      const quick = launch(idleAir(), { speed: 32, pitchDeg: RAMPS.jump, boosting: false });
      const a = biggestFitting(starter.airSec), b = biggestFitting(quick.airSec);
      expect(basePts(b!)).toBeGreaterThanOrEqual(basePts(a!));
    });
  });

  describe('asking for a trick', () => {
    it('gives you the one you asked for', () => {
      const { trick } = kartTrickFor('right', 'B', 1.2);
      expect(trick?.id).toBe('kart_spin360');
    });

    it('refuses rather than quietly handing over a smaller one', () => {
      // the whole point: a player who flicked for a FULL SPIN must not be given a HALF SPIN they cannot tell apart
      const { trick, refusal } = kartTrickFor('right', 'B', 0.6);
      expect(trick).toBeNull();
      expect(refusal).toMatch(/NOT ENOUGH AIR FOR FULL SPIN/);
    });

    it('says NO AIR when there was never a jump', () => {
      expect(kartTrickFor('up', 'B', 0.1).refusal).toBe('NO AIR');
    });

    it('answers an unbound combination with nothing rather than a refusal', () => {
      const { trick, refusal } = kartTrickFor('left', 'A', 1.5);
      expect(trick).toBeNull();
      expect(refusal).toBeNull();
    });

    it('will not start a second trick on top of the first', () => {
      let s = launch(idleAir(), { speed: 35, pitchDeg: RAMPS.gap, boosting: true });
      s = startTrick(s, 0, -1, 'B');
      expect(s.trick?.id).toBe('kart_nose');
      s = startTrick(s, -1, 0, 'B');
      expect(s.refusal).toBe('ALREADY IN A TRICK');
      expect(s.trick?.id).toBe('kart_nose');
    });

    it('refuses on the ground', () => {
      expect(startTrick(idleAir(), 0, -1, 'B').refusal).toBe('NOT IN THE AIR');
    });

    it('judges by the air REMAINING, not the air it started with', () => {
      let s = launch(idleAir(), { speed: 35, pitchDeg: RAMPS.gap, boosting: true });
      const flip = KART_TRICKS.find((t) => t.id === 'kart_backflip')!;
      expect(s.airSec).toBeGreaterThanOrEqual(flip.airSec);
      // burn most of the arc, then ask for the biggest trick
      for (let i = 0; i < 40; i++) s = stepAir(s, 1 / 60, { groundClearance: 1, yawErrorDeg: 0 });
      s = startTrick(s, 0, 1, 'Y');
      expect(s.trick).toBeNull();
      expect(s.refusal).toMatch(/NOT ENOUGH AIR/);
    });
  });

  describe('landing', () => {
    it('a straight landing with no trick is clean and worth nothing on its own', () => {
      const s = fly(launch(idleAir(), { speed: 26, pitchDeg: RAMPS.jump, boosting: false }));
      expect(s.airborne).toBe(false);
      expect(s.landed?.clean01).toBeGreaterThan(0.9);
      expect(s.landed?.pts).toBe(0);
      expect(s.landed?.trick).toBeNull();
    });

    it('a completed trick landed straight scores', () => {
      const s = fly(launch(idleAir(), { speed: 35, pitchDeg: RAMPS.gap, boosting: true }),
                    { trick: [0, -1, 'B'] });
      expect(s.landed?.trick?.id).toBe('kart_nose');
      expect(s.landed?.bailed).toBe(false);
      expect(s.landed?.pts).toBeGreaterThan(0);
      expect(s.landed?.progress01).toBeCloseTo(1, 1);
    });

    it('coming down sideways costs the landing even with the trick finished', () => {
      const straight = fly(launch(idleAir(), { speed: 35, pitchDeg: RAMPS.gap, boosting: true }),
                           { trick: [0, -1, 'B'] });
      const sideways = fly(launch(idleAir(), { speed: 35, pitchDeg: RAMPS.gap, boosting: true }),
                           { trick: [0, 1, 'B'], yawErrorDeg: 40 });
      expect(sideways.landed!.clean01).toBeLessThan(straight.landed!.clean01);
      expect(sideways.landed!.pts).toBeLessThan(straight.landed!.pts);
    });

    it('a trick still turning at touchdown is a bail', () => {
      // ask for the backflip off air that cannot finish it: startTrick refuses, so force the mid-trick case
      let s = launch(idleAir(), { speed: 35, pitchDeg: RAMPS.gap, boosting: true });
      s = startTrick(s, 0, 1, 'Y');
      expect(s.trick?.id).toBe('kart_backflip');
      // land it early
      const landed = stepAir({ ...s, t: 0.2, height: 0, vy: -6 }, 1 / 60, { groundClearance: -1, yawErrorDeg: 0 });
      expect(landed.landed?.bailed).toBe(true);
      expect(landed.landed!.progress01).toBeLessThan(BAIL_BELOW);
    });
  });

  describe('it grades against the shared boost, never its own currency', () => {
    it('a big trick earns the big award', () => {
      const s = fly(launch(idleAir(), { speed: 40, pitchDeg: RAMPS.gap, boosting: true }),
                    { trick: [1, 0, 'B'] });
      expect(s.landed?.trick?.id).toBe('kart_spin360');
      expect(boostEarnFor(s.landed!)?.what).toBe('trickBig');
    });

    it('a small trick earns the small one', () => {
      const s = fly(launch(idleAir(), { speed: 35, pitchDeg: RAMPS.kicker, boosting: true }),
                    { trick: [0, -1, 'B'] });
      expect(boostEarnFor(s.landed!)?.what).toBe('trickSmall');
    });

    it('a bail earns nothing', () => {
      let s = launch(idleAir(), { speed: 35, pitchDeg: RAMPS.gap, boosting: true });
      s = startTrick(s, 0, 1, 'Y');
      const landed = stepAir({ ...s, t: 0.2, height: 0, vy: -6 }, 1 / 60, { groundClearance: -1, yawErrorDeg: 0 });
      expect(boostEarnFor(landed.landed!)).toBeNull();
    });

    it('a clean landing off a real jump is worth something even with no trick', () => {
      const s = fly(launch(idleAir(), { speed: 26, pitchDeg: RAMPS.jump, boosting: false }));
      expect(boostEarnFor(s.landed!)?.what).toBe('landingClean');
    });

    it('a scrappy no-trick landing is worth nothing', () => {
      const s = fly(launch(idleAir(), { speed: 26, pitchDeg: RAMPS.jump, boosting: false }),
                    { yawErrorDeg: 50 });
      expect(boostEarnFor(s.landed!)).toBeNull();
    });
  });

  describe('the trick table', () => {
    it('is four readable tricks, all seated-plausible', () => {
      expect(KART_TRICKS).toHaveLength(4);
      for (const t of KART_TRICKS) {
        expect(t.discipline).toBe('kart');
        expect(t.kind).toBe('air');
        expect(t.grab).toBe('none');       // a driver is strapped in; there is nothing to grab
        expect(t.airSec).toBeGreaterThanOrEqual(MIN_TRICK_AIR);
      }
    });

    it('costs more air the harder it gets', () => {
      const byAir = [...KART_TRICKS].sort((a, b) => a.airSec - b.airSec);
      const byHard = [...KART_TRICKS].sort((a, b) => a.difficulty - b.difficulty);
      expect(byAir.map((t) => t.id)).toEqual(byHard.map((t) => t.id));
    });

    it('binds each trick to a distinct stick-and-button', () => {
      const combos = KART_TRICKS.map((t) => `${t.dir}/${t.btn}`);
      expect(new Set(combos).size).toBe(combos.length);
    });
  });
});
