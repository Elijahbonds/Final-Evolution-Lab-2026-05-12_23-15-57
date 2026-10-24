// lane/hoops-shot-content (2026-10-20): the free-throw rules and the line's clock, without a scene.
import { describe, expect, it } from 'vitest';
import { judge, rule } from './Ref';
import { SHOT_QUALITY_PCT, ShotMeter } from './BasketballCore';
import { distanceGreenFactor } from './ShotWindow';
import { FREE_THROW_M, FREE_THROW_POINTS, FT_TIMING, FreeThrowSequence, freeThrowLabel, freeThrowPct, freeThrowsFor, startLineMeter, FT_DIST_NARROW_01, type FtEvent } from './FreeThrows';

const me = { offense: 'me', shooter: 'me', fouled: 'me' } as const;

describe('how many free throws a call is worth', () => {
  it('a foul on a missed two is two shots, on a missed three is three, an and-one is one', () => {
    expect(freeThrowsFor(judge('shooting_foul', me), false)).toBe(2);
    expect(freeThrowsFor(judge('shooting_foul', me), true)).toBe(3);
    expect(freeThrowsFor(judge('and_one', me), false)).toBe(1);
    expect(freeThrowsFor(judge('and_one', me), true)).toBe(1);   // the basket counted: still one
  });
  it('every other call is worth no shots (the ball, as before), and no call is none', () => {
    for (const id of ['charge', 'blocking_foul', 'loose_ball_foul', 'reach_in', 'out_of_bounds', 'three_seconds', 'goaltending'] as const) {
      expect(freeThrowsFor(judge(id, me), false), id).toBe(0);
      expect(freeThrowsFor(judge(id, me), true), id).toBe(0);
    }
    expect(freeThrowsFor(null, false)).toBe(0);
    expect(freeThrowsFor(undefined, true)).toBe(0);
  });
  it('reads the HANDBOOK for the base (the ref owns what a foul is)', () => {
    expect(freeThrowsFor({ id: 'shooting_foul', shots: rule('shooting_foul').shots }, false)).toBe(rule('shooting_foul').shots);
    expect(freeThrowsFor({ id: 'and_one', shots: rule('and_one').shots }, false)).toBe(rule('and_one').shots);
  });
  it('one point a make; the stripe is the real 4.19 m', () => {
    expect(FREE_THROW_POINTS).toBe(1);
    expect(FREE_THROW_M).toBeCloseTo(4.19, 2);
  });
});

describe("the line's meter and make chance (no new numbers)", () => {
  it('is the full uncontested jumper window exactly — no distance narrowing at the line (owner 2026-10-24)', () => {
    // the owner's decision: a free throw is easier than a jumper from the same spot, so #391's distance rule is not applied here
    const line = new ShotMeter(); startLineMeter(line);
    const open = new ShotMeter(); open.start(0, 'jumper', 0);
    expect(FT_DIST_NARROW_01).toBe(0);
    expect(line.durationSec).toBe(open.durationSec);
    expect(line.greenCenter01).toBe(open.greenCenter01);
    expect(line.greenHalfWidth01).toBe(open.greenHalfWidth01);
    // the survey's numbers: 0.72 s, green at 0.62 ± 0.09 (≈ ±65 ms)
    expect(line.durationSec).toBeCloseTo(0.72, 6);
    expect(line.greenCenter01).toBeCloseTo(0.62, 6);
    expect(line.greenHalfWidth01 * line.durationSec * 1000).toBeCloseTo(64.8, 1);
    // …and wider than the hero's own jumper from the stripe (what the knob's 1 would give: ≈ ±59 ms)
    const jumper = new ShotMeter(); jumper.start(0, 'jumper', 0); jumper.narrowBy(distanceGreenFactor(FREE_THROW_M, 'jumper'));
    expect(jumper.greenHalfWidth01 * jumper.durationSec * 1000).toBeCloseTo(59.1, 1);
    expect(line.greenHalfWidth01).toBeGreaterThan(jumper.greenHalfWidth01);
  });
  it("a release's make chance is the meter's own grade, nothing on top", () => {
    for (const q of ['perfect', 'good', 'early', 'late', 'brick', 'held'] as const) expect(freeThrowPct(q)).toBe(SHOT_QUALITY_PCT[q]);
  });
});

/** Run a sequence on 60 Hz frames. `press(t)`: is Square down at the trip's time t. `iron(shot)`: the result of each shot. */
function run(n: number, press: (t: number, phase: string) => boolean, iron: (shot: number) => boolean, maxSec = 30) {
  const s = new FreeThrowSequence(); const evs: (FtEvent & { at: number })[] = [];
  let t = 0;
  for (const e of s.start(n)) evs.push({ ...e, at: 0 });
  const dt = 1 / 60;
  while (s.active && t < maxSec) {
    t += dt;
    for (const e of s.step(dt, press(t, s.phase))) evs.push({ ...e, at: t });
    if (s.phase === 'flight') s.landed(iron(s.shot));
  }
  return { s, evs, t };
}

describe('a trip to the line, as a clock', () => {
  it('two shots: setup → routine → set → ready → rise → release → result, twice, then done with the tally', () => {
    let downAt = -1;
    const press = (t: number, ph: string): boolean => {
      if (ph === 'ready' && downAt < 0) downAt = t;
      if (ph === 'rising' || ph === 'ready') return downAt >= 0 && t - downAt < 0.44;   // let go 0.44 s after the press (the green)
      downAt = -1; return false;
    };
    const { s, evs } = run(2, press, (shot) => shot === 0);
    expect(evs.map((e) => e.kind)).toEqual(['setup', 'routine', 'set', 'ready', 'rise', 'release', 'next', 'routine', 'set', 'ready', 'rise', 'release', 'done']);
    expect(s.made).toBe(1); expect(s.total).toBe(2); expect(s.lastMade).toBe(false);
    const done = evs.at(-1)!; expect(done).toMatchObject({ kind: 'done', made: 1, total: 2, lastMade: false });
    // the beats land where FT_TIMING says (±1 frame)
    const at = (k: string, i = 0) => evs.filter((e) => e.kind === k)[i].at;
    expect(at('routine')).toBeCloseTo(FT_TIMING.setupSec, 1);
    expect(at('set') - at('routine')).toBeCloseTo(FT_TIMING.routineSec, 1);
    expect(at('ready') - at('set')).toBeCloseTo(FT_TIMING.setSec, 1);
    expect(at('routine', 1) - at('release', 0)).toBeCloseTo(FT_TIMING.resultSec, 1);
  });

  it('a release 0.446 s after the press is in the green (the jumper meter, uncontested); 0.30 s is early; holding to the end is a brick', () => {
    const grade = (holdSec: number) => {
      let downAt = -1;
      const { evs } = run(1, (t, ph) => { if (ph === 'ready' && downAt < 0) downAt = t; return downAt >= 0 && (ph === 'ready' || ph === 'rising') && t - downAt < holdSec; }, () => true);
      return (evs.find((e) => e.kind === 'release') as { quality: string }).quality;
    };
    expect(['perfect', 'good']).toContain(grade(0.446));
    expect(grade(0.30)).toBe('early');
    expect(grade(5)).toBe('brick');
  });

  it('three shots on a fouled three; a made one each time tallies three', () => {
    let downAt = -1;
    const { s, evs } = run(3, (t, ph) => { if (ph === 'ready' && downAt < 0) downAt = t; if (ph === 'ready' || ph === 'rising') return t - downAt < 0.446; downAt = -1; return false; }, () => true);
    expect(evs.filter((e) => e.kind === 'release')).toHaveLength(3);
    expect(s.made).toBe(3); expect(s.lastMade).toBe(true);
  });

  it('a button still DOWN from the play the foul interrupted does not shoot the first free throw — it must come up at the line', () => {
    // held the whole time: never fires
    const held = run(1, () => true, () => true, 8);
    expect(held.evs.map((e) => e.kind)).not.toContain('rise');
    expect(held.s.phase).toBe('ready');
    // held through the setup, let go, pressed again: fires
    let phase2 = 0;
    const later = run(1, (t, ph) => { if (ph !== 'ready') return true; phase2 += 1 / 60; return phase2 > 0.2 && phase2 < 0.6; }, () => true);
    expect(later.evs.map((e) => e.kind)).toContain('release');
  });

  it('nothing to shoot: done at once; cancel() abandons a trip without a done', () => {
    const s = new FreeThrowSequence();
    expect(s.start(0)).toEqual([{ kind: 'done', made: 0, total: 0, lastMade: false }]);
    expect(s.active).toBe(false);
    s.start(2); expect(s.active).toBe(true);
    s.cancel(); expect(s.active).toBe(false);
    expect(s.step(1, false)).toEqual([]);
  });

  it('labels the shot "FREE THROW 1 OF 2"', () => {
    expect(freeThrowLabel(0, 2)).toBe('FREE THROW 1 OF 2');
    expect(freeThrowLabel(2, 3)).toBe('FREE THROW 3 OF 3');
  });
});
