// IMPROVE (2026-10-06, docs/IMPROVEMENTS-2026-10-05.md § Golf): the five-hole loop's pure reads, and the source guards
// that keep the mode on them.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PAR_BANDS, parForDistance, loopHole, loopSeed, loopWindAngle, LOOP_PIN_X_MAX, LOOP_PIN_Z_MAX, LOOP_TEE,
  stickPathErr, STICK_PATH_DEAD, rhythmAfter, obDrop, inBounds, LOOP_BOUNDS, rotateAbout, TimerBag, BannerChannel, MeterHudGate,
} from './GolfLoop';

/** The live card (precisionModes GOLF_PAR), read from the source so this file does not load the modes. */
const SRC = readFileSync(path.join(__dirname, '../modes/precisionModes.ts'), 'utf8');
const GOLF_PAR = /export const GOLF_PAR = \[([\d, ]+)\] as const;/.exec(SRC)![1].split(',').map(Number);
const golfSection = SRC.slice(SRC.indexOf('export const GolfMode'), SRC.indexOf('export const DerbyMode'));

describe('#2 the course: a hole is as long as its par says, and the loop changes every round', () => {
  it('the bands and the read agree, and the bands rise with par', () => {
    for (const par of [3, 4, 5] as const) {
      const [lo, hi] = PAR_BANDS[par];
      expect(parForDistance(lo)).toBe(par); expect(parForDistance(hi)).toBe(par); expect(parForDistance((lo + hi) / 2)).toBe(par);
    }
    expect(PAR_BANDS[3][1]).toBeLessThan(PAR_BANDS[4][0]); expect(PAR_BANDS[4][1]).toBeLessThan(PAR_BANDS[5][0]);
  });
  it('every hole of the live card, on any seed, is the length of its par and inside the pin box', () => {
    for (let seed = 0; seed < 400; seed++) {
      GOLF_PAR.forEach((par, i) => {
        const h = loopHole(par, seed, i + 1);
        expect(parForDistance(h.distM), `seed ${seed} hole ${i + 1}`).toBe(par);
        expect(Math.abs(h.x)).toBeLessThanOrEqual(LOOP_PIN_X_MAX);
        expect(h.z).toBeLessThanOrEqual(LOOP_PIN_Z_MAX);
        expect(h.z).toBeGreaterThan(LOOP_TEE.z + 15);   // the green (r 6) never reaches the tee
        expect(inBounds(h)).toBe(true);
      });
    }
  });
  it('the old formula is what this replaced: its hole-1 par 3 was 30 m and its hole-4 par 3 was 33 m', () => {
    const old = (r: number) => ({ x: ((r * 53) % 21) - 10, z: 26 + ((r * 31) % 13) });
    const len = (r: number) => Math.hypot(old(r).x - LOOP_TEE.x, old(r).z - LOOP_TEE.z);
    expect(parForDistance(len(1))).not.toBe(GOLF_PAR[0]);   // control: the read DOES catch the mismatch the item named
    expect(parForDistance(len(4))).not.toBe(GOLF_PAR[3]);
  });
  it('same seed, same course; another seed, another course; the wind heading moves with the seed', () => {
    expect(loopHole(4, 1234, 2)).toEqual(loopHole(4, 1234, 2));
    const a = GOLF_PAR.map((p, i) => loopHole(p, 1, i + 1)), b = GOLF_PAR.map((p, i) => loopHole(p, 2, i + 1));
    expect(a.some((h, i) => Math.hypot(h.x - b[i].x, h.z - b[i].z) > 0.5)).toBe(true);
    expect(loopWindAngle(1, 1)).not.toBeCloseTo(loopWindAngle(1, 2), 2);
    expect(loopSeed(5_000)).toBe(5); expect(loopSeed(5_000)).not.toBe(loopSeed(9_000));
  });
});

describe('#1 the stick swing has a path', () => {
  it('straight inside the dead zone, a full curve at the rim, signed by side', () => {
    expect(stickPathErr(0)).toBe(0); expect(stickPathErr(STICK_PATH_DEAD)).toBe(0); expect(stickPathErr(-0.15)).toBe(0);
    expect(stickPathErr(1)).toBe(1); expect(stickPathErr(-1)).toBe(-1);
    expect(stickPathErr(0.6)).toBeCloseTo(0.5, 5);
    expect(stickPathErr(0.4)).toBeGreaterThan(0); expect(stickPathErr(0.4)).toBeLessThan(stickPathErr(0.7));
    expect(stickPathErr(Number.NaN)).toBe(0);
  });
  it('the mode strikes with it — never the old hard 0', () => {
    expect(golfSection).not.toContain('strike(ctx, backswing, 0)');
    expect(golfSection).toContain('strike(ctx, backswing, stickPathErr(pathPeakX))');
  });
});

describe('#12 rhythm decays on a bad strike', () => {
  it('a clean strike builds, a hook / slice halves (it emptied), the gauge stays 0..100', () => {
    expect(rhythmAfter(0, 0)).toBe(35); expect(rhythmAfter(80, 0.1)).toBe(100);
    expect(rhythmAfter(100, 0.6)).toBe(50); expect(rhythmAfter(70, -1)).toBe(35); expect(rhythmAfter(0, 1)).toBe(0);
    expect(rhythmAfter(rhythmAfter(100, 1), 0)).toBeGreaterThanOrEqual(70);   // one clean strike gets a full gauge back in rhythm
  });
});

describe('#4 the OB drop is on the shot line, inside where it left', () => {
  const onLine = (a: { x: number; z: number }, b: { x: number; z: number }, p: { x: number; z: number }) => Math.abs((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x)) / Math.hypot(b.x - a.x, b.z - a.z);
  it('out the side: dropped 2 m in from where the line crossed x 28', () => {
    const lie = { x: 0, z: 0.6 }, rest = { x: 40, z: 30.6 };
    const d = obDrop(lie, rest);
    expect(inBounds(d)).toBe(true); expect(onLine(lie, rest, d)).toBeLessThan(1e-6);
    const cross = Math.hypot(28 - lie.x, (28 / 40) * 30) ;
    expect(Math.hypot(d.x - lie.x, d.z - lie.z)).toBeCloseTo(cross - 2, 5);
  });
  it('over the back: dropped short of the fence, on the line — not 14 m in front of the pin', () => {
    const lie = { x: 2, z: 20 }, rest = { x: 4, z: 52 };
    const d = obDrop(lie, rest);
    expect(d.z).toBeCloseTo(LOOP_BOUNDS.zMax - 2 * (32 / Math.hypot(2, 32)), 3);
    expect(onLine(lie, rest, d)).toBeLessThan(1e-6);
  });
  it('a shot struck from inside the margin and barely out plays again from its lie — never past the crossing', () => {
    const lie = { x: 27.5, z: 10 }, rest = { x: 29, z: 10 };
    expect(obDrop(lie, rest)).toEqual(lie);
  });
  it('a lie that is somehow out is clamped in (the guard, not the rule)', () => {
    expect(inBounds(obDrop({ x: 40, z: 60 }, { x: 50, z: 70 }))).toBe(true);
  });
});

describe('#13 rotateAbout turns a point with the mode\'s yaw', () => {
  it('a quarter turn of yaw takes +z to +x about the centre', () => {
    const o = rotateAbout({ x: 1, z: 11 }, 1, 1, Math.PI / 2, { x: 0, z: 0 });
    expect(o.x).toBeCloseTo(11, 9); expect(o.z).toBeCloseTo(1, 9);
    const back = rotateAbout(o, 1, 1, -Math.PI / 2, { x: 0, z: 0 });
    expect(back.x).toBeCloseTo(1, 9); expect(back.z).toBeCloseTo(11, 9);
  });
});

describe('#10 / #11 timers and the banner channel', () => {
  afterEach(() => { vi.useRealTimers(); });
  it('a newer flash is not wiped by the older one\'s clear', () => {
    vi.useFakeTimers();
    const shown: string[] = []; const bag = new TimerBag(); const ch = new BannerChannel(bag, (t) => shown.push(t));
    ch.flash('FLICK', 400);
    vi.advanceTimersByTime(200); ch.flash('RING! +10', 700);
    vi.advanceTimersByTime(300);   // t 500: the FLICK clear would have fired here
    expect(shown.at(-1)).toBe('RING! +10');
    vi.advanceTimersByTime(500);   // t 1000: the RING's own clear (at 900) has
    expect(shown.at(-1)).toBe('');
    expect(bag.pending).toBe(0);
  });
  it('cancel() keeps a held banner up; clear() drops everything pending', () => {
    vi.useFakeTimers();
    const shown: string[] = []; const bag = new TimerBag(); const ch = new BannerChannel(bag, (t) => shown.push(t));
    ch.flash('TURBINE', 500); ch.cancel(); shown.push('OUT OF BOUNDS');
    vi.advanceTimersByTime(1000);
    expect(shown.at(-1)).toBe('OUT OF BOUNDS');
    let fired = 0; bag.later(() => fired++, 100); bag.later(() => fired++, 2000);
    expect(bag.pending).toBe(2); bag.clear(); vi.advanceTimersByTime(3000);
    expect(fired).toBe(0); expect(bag.pending).toBe(0);
  });
  it('the golf mode schedules nothing past its bag, and dispose ends it and clears the bag', () => {
    expect(golfSection).not.toMatch(/\bsetTimeout\(/);
    const dispose = golfSection.slice(golfSection.indexOf('dispose() {'));
    expect(dispose).toMatch(/ended = true; timers\.clear\(\)/);
  });
});

describe('#9 / #17 the frame: one camera update while aiming, the meter pushed only when it moved', () => {
  it('no trailing zero-velocity camera update in golf', () => {
    expect(golfSection).not.toContain('camDirector.update(me.root.position, Vector3.Zero(), holePos)');
  });
  it('the gate pushes everything first, then only what changed, and nothing when nothing did', () => {
    const g = new MeterHudGate();
    expect(g.next(50, 0.5, 'power', null, 30)).toEqual({ power: 50, meterT: 0.5, swingPhase: 'power', powerLock: null, meterCarry: 30 });
    expect(g.next(50, 0.5, 'power', null, 30)).toBeNull();
    expect(g.next(51, 0.512, 'power', null, 30)).toEqual({ power: 51, meterT: 0.512 });
    expect(g.next(51, 0.512, 'accuracy', 51, 30)).toEqual({ swingPhase: 'accuracy', powerLock: 51 });
    g.reset();
    expect(g.next(51, 0.512, 'accuracy', 51, 30)).toEqual({ power: 51, meterT: 0.512, swingPhase: 'accuracy', powerLock: 51, meterCarry: 30 });
  });
});
