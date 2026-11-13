// hoops-builder phase B (owner 2026-11-12): the wiring's reads. Rating 50 (TODAY_TUNING) returns every input UNCHANGED — the same
// object where one is passed — so a rated-off, rating-free or default run plays today's numbers exactly; the edges are the bands; a
// rating-free, agent, guest, slow or broken run never reads the athlete.
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  TODAY_RUN, athleteFromView, loadRatedTuning, ratedBlocker, ratedFinishContest, ratedGreenRelease, ratedGreenStart, ratedLookScale,
  ratedManRead, ratedRelease, ratedSpeedScale, ratedStealRange, type RatedRun,
} from './ratedPlay';
import { NEUTRAL_RATINGS, TODAY_TUNING, tuningFor, type HoopsTuning } from './ratings';
import { ShotMeter } from '../core/BasketballCore';
import { releaseHalfSec } from '../core/SharedShot';
import { readTheMan, MOVE_LEAN_MPS, type ManRead } from './rulebook';
import { reachTop, reachGap, type Blocker } from './blocks';
import { COMPETITIVE_PARAMS } from '../core/playFrame';
import { resultsAction, startCardLink } from '../../creator/hoops/links';

const T = TODAY_TUNING;
const at = (r: Partial<typeof NEUTRAL_RATINGS>, heightIn = 76): HoopsTuning => tuningFor({ ratings: { ...NEUTRAL_RATINGS, ...r }, position: 'wing', heightIn }, { ratingFree: false });

describe('rating 50 is today: every read returns its input unchanged', () => {
  it('speed, slide, poke, finish contest, green', () => {
    expect(ratedSpeedScale(T, false)).toBe(1); expect(ratedSpeedScale(T, true)).toBe(1);
    expect(ratedStealRange(1.6, T)).toBe(1.6);
    for (const c of [0, 0.2, 0.5, 1]) for (const st of ['jumper', 'layup', 'floater', 'fadeaway'] as const) expect(ratedFinishContest(c, st, T)).toBe(c);
    expect(ratedGreenRelease('jumper', T)).toBe(1); expect(ratedGreenRelease('layup', T)).toBe(1);
    const m = new ShotMeter(); m.start(0.3, 'jumper', 0); const half = m.greenHalfWidth01;
    ratedGreenStart(m, 'jumper', T); expect(m.greenHalfWidth01).toBe(half);
  });

  it('the blocker, the release and the man read are the same objects', () => {
    const b: Blocker = { x: 1, z: 2, jumpAge: 0.1, handsUp: true };
    expect(ratedBlocker(b, T)).toBe(b);
    const p = { x: 0, y: 2.3, z: 1 };
    expect(ratedRelease(p, T)).toBe(p);
    const r: ManRead = { closingMps: 0, lateralMps: 0.55, offBalance: false, moveSide: 'left' };
    expect(ratedManRead(r, T)).toBe(r);
  });

  it('the hero is drawn at the standard frame unless the run is rated', () => {
    expect(ratedLookScale(TODAY_RUN)).toBe(1);
    for (const why of ['ratingFree', 'agent', 'off', 'guest', 'failed'] as const) expect(ratedLookScale({ tuning: T, heightIn: 80, why })).toBe(1);
    expect(ratedLookScale({ tuning: at({}, 80), heightIn: 80, why: 'rated' })).toBeCloseTo(1.04, 12);
    expect(ratedLookScale({ tuning: at({}, 72), heightIn: 72, why: 'rated' })).toBeCloseTo(0.96, 12);
  });

  it('the release judge with ratingGreen 1 is today\'s releaseHalfSec', () => {
    const w = { style: 'jumper' as const, meterHalfSec: 0.05, releaseContest: 0.3, distM: 5 };
    expect(releaseHalfSec({ ...w, ratingGreen: 1 })).toBe(releaseHalfSec(w));
  });
});

describe('the edges reach the game', () => {
  it('speed 90: ×1.06; defense 90 on defense: × the slide too', () => {
    expect(ratedSpeedScale(at({ speed: 90 }), false)).toBeCloseTo(1.06, 12);
    expect(ratedSpeedScale(at({ speed: 90, defense: 90 }), true)).toBeCloseTo(1.06 * 1.06, 12);
    expect(ratedSpeedScale(at({ defense: 90 }), false)).toBe(1);
  });

  it('shooting 90 widens a jump shot\'s meter and its judge by 10 %; a finish is untouched; 40 narrows', () => {
    const m = new ShotMeter(); m.start(0, 'jumper', 0); const half = m.greenHalfWidth01;
    ratedGreenStart(m, 'jumper', at({ shooting: 90 })); expect(m.greenHalfWidth01).toBeCloseTo(half * 1.1, 12);
    const n = new ShotMeter(); n.start(0, 'jumper', 0); ratedGreenStart(n, 'jumper', at({ shooting: 40 })); expect(n.greenHalfWidth01).toBeCloseTo(half * 0.975, 12);
    const l = new ShotMeter(); l.start(0, 'layup', 0); const lh = l.greenHalfWidth01; ratedGreenStart(l, 'layup', at({ shooting: 90 })); expect(l.greenHalfWidth01).toBe(lh);
    const w = { style: 'jumper' as const, meterHalfSec: 1, releaseContest: 0, distM: 5 };   // a wide shown meter: the judge's own window decides
    expect(releaseHalfSec({ ...w, ratingGreen: 1.1 }) / releaseHalfSec(w)).toBeCloseTo(1.1, 12);
  });

  it('finishing 90: a finish\'s contest ×0.85; a jump shot\'s is untouched', () => {
    expect(ratedFinishContest(0.6, 'layup', at({ finishing: 90 }))).toBeCloseTo(0.51, 12);
    expect(ratedFinishContest(0.6, 'jumper', at({ finishing: 90 }))).toBe(0.6);
  });

  it('handle 90: a defender drifting 0.55 m/s the wrong way is beaten (today he holds at < 0.6)', () => {
    const r: ManRead = { closingMps: 0, lateralMps: 0.55, offBalance: false, moveSide: 'left' };
    expect(MOVE_LEAN_MPS).toBe(0.6);
    expect(readTheMan(r).beat).toBe(false);
    expect(readTheMan(ratedManRead(r, at({ handle: 90 }))).beat).toBe(true);
    expect(readTheMan(ratedManRead({ ...r, lateralMps: 0.5 }, at({ handle: 90 }))).beat).toBe(false);   // 0.51 is the line
  });

  it('defense 90 at 6\'8": the block reaches 0.04 + 0.06 m higher; the release rises 0.06 m', () => {
    const b: Blocker = { x: 0, z: 0, jumpAge: Infinity, handsUp: true };
    const t = at({ defense: 90 }, 80);
    expect(reachTop(ratedBlocker(b, t)) - reachTop(b)).toBeCloseTo(0.1, 12);
    const ball = { x: 0, y: 2.5, z: 0 };   // 0.1 m over the standing reach: out of reach today, touched now
    expect(reachGap(b, ball)).toBeGreaterThan(0.09);
    expect(reachGap(ratedBlocker(b, t), ball)).toBeCloseTo(0, 9);
    expect(ratedRelease({ x: 0, y: 2.3, z: 0 }, t).y).toBeCloseTo(2.36, 12);
    expect(ratedStealRange(1.6, t)).toBeCloseTo(1.68, 12);
  });
});

describe('the athlete is read only for a casual run', () => {
  const view = { hoops: { ratings: { speed: 70, handle: 60, shooting: 80, finishing: 50, defense: 45 }, position: 'guard', heightIn: 74 } };
  const ok = vi.fn(async () => ({ ok: true, status: 200, json: async () => view }) as unknown as Response);

  it('a casual run loads the builder\'s ratings', async () => {
    ok.mockClear();
    const r = await loadRatedTuning({}, '?tier=pro', ok as never);
    expect(r.why).toBe('rated'); expect(r.heightIn).toBe(74);
    expect(r.tuning.greenScale).toBeCloseTo(1.075, 12);
    expect(ok).toHaveBeenCalledWith('/api/v1/creator/hoops', { credentials: 'same-origin' });
  });

  it('a rating-free run (every competitive key, or the harness stamp) never asks, and plays today', async () => {
    for (const k of COMPETITIVE_PARAMS) {
      ok.mockClear();
      const r: RatedRun = await loadRatedTuning({}, `?${k}=1`, ok as never);
      expect(r, k).toEqual({ ...TODAY_RUN, why: 'ratingFree' });
      expect(ok).not.toHaveBeenCalled();
    }
    expect((await loadRatedTuning({ felCompetitive: true }, '', ok as never)).why).toBe('ratingFree');
  });

  it('an agent run, a guest, a broken or slow answer: today', async () => {
    expect((await loadRatedTuning({}, '?agent=1', ok as never)).why).toBe('agent');
    const guest = vi.fn(async () => ({ ok: false, status: 401 }) as Response);
    expect(await loadRatedTuning({}, '', guest as never)).toEqual({ ...TODAY_RUN, why: 'guest' });
    const junk = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ hoops: { ratings: { speed: 'x' } } }) }) as unknown as Response);
    expect((await loadRatedTuning({}, '', junk as never)).why).toBe('failed');
    const boom = vi.fn(async () => { throw new Error('offline'); });
    expect((await loadRatedTuning({}, '', boom as never)).why).toBe('failed');
    const never = vi.fn(() => new Promise<Response>(() => {}));
    expect((await loadRatedTuning({}, '', never as never, 20)).why).toBe('failed');
  });

  it('athleteFromView: the route\'s view, or null', () => {
    expect(athleteFromView(view.hoops)).toEqual({ ratings: view.hoops.ratings, position: 'guard', heightIn: 74 });
    expect(athleteFromView({ ratings: { speed: 50 } })).toBeNull();
    expect(athleteFromView(null)).toBeNull();
  });
});

describe('the modes read the hero through these, and only the hero', () => {
  for (const f of ['lib/babylon/modes/OneVOneMode.ts', 'lib/babylon/modes/ThreeVThreeMode.ts']) {
    it(f, () => {
      const s = readFileSync(f, 'utf8');
      for (const call of ['loadRatedTuning(ctx.scene.metadata)', 'ratedSpeedScale(rated.tuning', 'ratedGreenStart(shotMeter', 'ratedGreenRelease(currentShot',
        'ratedFinishContest(contest', 'ratedFinishContest(shotContest', 'ratedStealRange(', 'ratedBlocker({', 'ratedRelease(releaseFrom(ballWorld()',
        'ratedManRead(manReadFrom(me', 'handle = rated.tuning.handle;']) expect(s, call).toContain(call);
      // the drawn height and the standard-frame ball go together
      expect(s).toMatch(/const ballWorld = \(\): Vector3 => \(heroDrawnScaled \? playFrameWorld\(ball\) : ball\.getAbsolutePosition\(\)\)/);
      expect(s).toMatch(/heroDrawnScaled = ratedLookScale\(rated\) !== 1;\n\s+if \(heroDrawnScaled\) applyProportions\(/);
    });
  }
});

describe('the links', () => {
  it('start card: a link in a casual 1v1 / 3v3, the plain fact in a rating-free one, nothing elsewhere', () => {
    expect(startCardLink('onevone', '?tier=pro')).toEqual({ href: '/creator/hoops', label: 'YOUR HOOPS PLAYER →' });
    expect(startCardLink('threevthree', '')).toEqual({ href: '/creator/hoops', label: 'YOUR HOOPS PLAYER →' });
    expect(startCardLink('onevone', '?arena=abc')).toEqual({ href: null, label: 'STANDARD RATINGS IN THIS GAME' });
    expect(startCardLink('dunk', '')).toBeNull();
  });
  it('results card: casual 1v1 / 3v3 only', () => {
    expect(resultsAction('hoops1v1', '')).toEqual([{ id: 'hoops-player', label: 'Your hoops player', href: '/creator/hoops' }]);
    expect(resultsAction('hoops3v3', '?tier=elite')).toHaveLength(1);
    expect(resultsAction('hoops1v1', '?c=xyz')).toBeUndefined();
    expect(resultsAction('threePoint', '')).toBeUndefined();
    expect(readFileSync('components/games/game-shell.tsx', 'utf8')).toContain('extraActions={resultsAction(mode,');
    expect(readFileSync('components/games/boot-splash.tsx', 'utf8')).toContain('<HoopsPlayerLink modeId={props.modeId} />');
  });
});
