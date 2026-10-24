// lane/hoops-shot-content (2026-10-20): the line's scene half on a node rig (tests/helpers/hoopsNodeRig) — the dead-ball setup, the trip
// end to end, the continuation, the score, and the make rate the iron gives a release (RimDecides: P(made) == the meter's grade).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TransformNode, Vector3 } from '@babylonjs/core';
vi.mock('../audio/SoundKit', () => ({ SoundKit: { play: () => undefined } }));
vi.mock('../visual/EffectsKit', () => ({ EffectsKit: { burst: () => undefined } }));
import { FreeThrowLine, FT_LANE_SPOTS, type FreeThrowHost, type FtBody } from './FreeThrowLine';
import { FREE_THROW_M } from './FreeThrows';
import { SHOT_QUALITY_PCT } from './BasketballCore';
import { yawTo } from './Biomech';
import { hoopsNodeRig, type HoopsNodeRig } from '../../../tests/helpers/hoopsNodeRig';

const RIM = new Vector3(0, 3.05, -0.6), RIM_FLOOR = new Vector3(0, 0, -0.6), OUT = new Vector3(0, 0, 1);
let rig: HoopsNodeRig | null = null;
afterEach(() => { rig?.dispose(); rig = null; vi.restoreAllMocks(); });

function setup(opts: { others?: number; endAt?: number } = {}) {
  rig = hoopsNodeRig('right');
  vi.spyOn(console, 'info').mockImplementation(() => undefined);   // (the line logs every beat; 800 trips below)
  const r = rig;
  const plays: string[] = [];
  const tree: FtBody['tree'] = { beat: (c) => { plays.push(`beat ${c}`); }, hold: (c) => { plays.push(`hold ${c}`); }, release: () => { plays.push('release'); } };
  const shooter: FtBody = { root: r.root, skeleton: r.sk, animator: { durationOf: () => 0.9, clipNames: new Set<string>() } as never, tree, carry: r.carry, hand: () => 'LeftHand' };
  const others: FtBody[] = Array.from({ length: opts.others ?? 0 }, (_, i) => ({ root: new TransformNode(`o${i}`, r.scene), skeleton: r.sk, animator: shooter.animator, tree, carry: null, hand: () => 'LeftHand' as const }));
  let down = false, score = 0; const banners: string[] = []; const placed: { at: Vector3; yaw: number }[] = [];
  const host: FreeThrowHost = {
    scene: r.scene, ball: r.ball as never, rim: RIM, rimFloor: RIM_FLOOR, out: OUT, tag: 'TEST',
    shooter: () => shooter, others: () => others,
    place: (b, p, yaw) => { b.root.position.copyFrom(p); b.root.rotationQuaternion = null; b.root.rotation.y = yaw; if (b === shooter) placed.push({ at: p.clone(), yaw }); },
    held: () => down, tickBodies: () => undefined, hud: () => undefined, banner: (t) => { banners.push(t); }, camera: () => undefined,
    score: (n) => { score += n; return opts.endAt !== undefined && score >= opts.endAt; }, meter3d: () => null,
  };
  const line = new FreeThrowLine(host);
  /** One trip at 60 Hz: press at 'ready', let go when the meter reaches `letGo01` (default: a frame and a half before the green's centre —
   *  the release grades on the frame after the button comes up, so it lands on the centre). */
  const play = (letGo01?: number, maxSec = 30) => {
    let t = 0;
    while (line.active && t < maxSec) {
      const m = line.seq.meter;
      if (line.seq.phase === 'ready') down = true;
      if (line.seq.phase === 'rising' && m.t >= (letGo01 ?? m.greenCenter01 - 1.5 / 60 / m.durationSec) - 1e-9) down = false;
      if (line.seq.phase !== 'ready' && line.seq.phase !== 'rising') down = false;
      line.update(1 / 60); r.frame(0, 0, false); t += 1 / 60;
    }
    return t;
  };
  return { line, host, shooter, others, plays, banners, placed, play, score: () => score };
}

describe('the dead-ball setup', () => {
  it('puts the shooter on the stripe (4.19 m out from the rim) facing the rim, the ball in his hand, everybody else on the lane', () => {
    const T = setup({ others: 5 });
    T.line.start(2, () => undefined, 'test');
    expect(T.line.active).toBe(true);
    T.line.update(1 / 60);
    const spot = RIM_FLOOR.add(OUT.scale(FREE_THROW_M));
    expect(Vector3.Distance(T.placed[0].at, spot)).toBeLessThan(1e-6);
    expect(T.placed[0].yaw).toBeCloseTo(yawTo(spot, RIM_FLOOR), 6);
    expect(rig!.ball.parent).toBeTruthy();   // in a hand
    // the lane: each body on its spot, none of them inside 2 m of the shooter, none on the stripe
    T.others.forEach((b, i) => {
      const [x, z] = FT_LANE_SPOTS[i];
      expect(b.root.position.x).toBeCloseTo(x, 6); expect(b.root.position.z).toBeCloseTo(RIM_FLOOR.z + z, 6);
      expect(Vector3.Distance(b.root.position, spot)).toBeGreaterThan(2);
    });
  });
});

describe('a trip, end to end', () => {
  it('two shots: the routine, the set, the hold, the release; one point per make; the continuation once, after the last shot', () => {
    const T = setup();
    let conts = 0;
    T.line.start(2, () => { conts++; }, 'test');
    const sec = T.play();
    expect(T.line.active).toBe(false);
    expect(conts).toBe(1);
    expect(T.score()).toBe(T.line.seq.made);
    expect(T.plays.filter((p) => p === 'beat bball_pullup_gather')).toHaveLength(2);   // the set, each shot
    expect(T.plays.filter((p) => p === 'hold jumpshot')).toHaveLength(2);              // the set shot, paced to the green
    expect(T.plays.filter((p) => p.startsWith('beat bball_follow_through'))).toHaveLength(2);
    expect(T.banners.filter((b) => /^FREE THROW \d OF 2$/.test(b))).toEqual(['FREE THROW 1 OF 2', 'FREE THROW 2 OF 2']);
    // the whole trip is a few seconds of dead ball (setup + 2 × (routine + set + rise + flight + result))
    expect(sec).toBeGreaterThan(5); expect(sec).toBeLessThan(10);
  });

  it('after(): a shooting foul runs the trip then the continuation; a non-shooting call runs the continuation at once (the old flow)', () => {
    const T = setup();
    const order: string[] = [];
    T.line.after('charge', false, () => order.push('charge cont'));
    expect(order).toEqual(['charge cont']);
    expect(T.line.active).toBe(false);
    T.line.after('shooting_foul', true, () => order.push('foul cont'));
    expect(T.line.active).toBe(true);
    expect(T.line.seq.total).toBe(3);                       // a fouled three shoots three
    T.play();
    expect(order).toEqual(['charge cont', 'foul cont']);
    T.line.after('and_one', false, () => order.push('and-one cont'));
    expect(T.line.seq.total).toBe(1);
    T.play();
    expect(order.at(-1)).toBe('and-one cont');
    T.line.after(null, false, () => order.push('no call'));
    expect(order.at(-1)).toBe('no call');
  });

  it('a free throw that ends the game stops the trip there and never runs the continuation', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.0001);   // the iron says yes to a green release
    const T = setup({ endAt: 1 });
    let conts = 0;
    T.line.start(2, () => { conts++; }, 'test');
    T.play();
    expect(T.score()).toBe(1);
    expect(conts).toBe(0);
    expect(T.line.active).toBe(false);
  });

  it('cancel() drops a trip without its continuation', () => {
    const T = setup();
    let conts = 0;
    T.line.start(2, () => { conts++; }, 'test');
    for (let i = 0; i < 30; i++) T.line.update(1 / 60);
    T.line.cancel();
    expect(T.line.active).toBe(false);
    T.play();
    expect(conts).toBe(0);
  });
});

describe('the iron answers the meter: P(made) == the release grade (no odds of its own)', () => {
  // seeded: 400 one-shot trips at each grade; the make rate within 3.5 sigma of SHOT_QUALITY_PCT
  for (const [label, letGo, grade] of [['green', undefined, 'perfect'], ['early', 0.35, 'early']] as const) {
    it(`${label} releases make ${(SHOT_QUALITY_PCT[grade] * 100).toFixed(0)} % of the time`, () => {
      let seed = 12345;
      vi.spyOn(Math, 'random').mockImplementation(() => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; });
      const T = setup();
      const N = 400; let made = 0; const grades = new Set<string>();
      for (let i = 0; i < N; i++) {
        T.line.start(1, () => undefined, 'stat');
        T.play(letGo);
        made += T.line.seq.made;
        grades.add(T.line.log.find((l) => l.startsWith('release'))!.split(' ')[1]);
      }
      expect([...grades]).toEqual([grade]);
      const p = SHOT_QUALITY_PCT[grade], sigma = Math.sqrt(p * (1 - p) / N);
      expect(Math.abs(made / N - p)).toBeLessThan(3.5 * sigma + 1e-9);
    });
  }
});
