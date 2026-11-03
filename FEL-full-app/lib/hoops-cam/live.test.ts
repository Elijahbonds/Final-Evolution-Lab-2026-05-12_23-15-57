import { describe, expect, it } from 'vitest';
import { HoopsLive } from './live';
import { DRIBBLE_FIXTURES, FIXTURES, filmDribbles, filmFixture, rimTruth } from './scene';
import { cleanSession } from './log';

// The page's whole read (HoopsLive) over frames DRAWN by the synthetic court (scene.ts): pixels in, numbers out.
describe('the live read, end to end on drawn frames', () => {
  it('shots: the rim marked, shots read with their spots, then fixed, dropped and added by hand', () => {
    const fx = FIXTURES.find((f) => f.id === 'gym-sideline')!;
    const live = new HoopsLive({ mode: 'shots', rim: null, placement: 'left_baseline', heightM: fx.shooterHeightM, aspect: fx.cam.w / fx.cam.h });
    expect(live.current().status).toBe('no_rim');
    live.setRim(rimTruth(fx.cam));
    const truth = filmFixture(fx, (f) => live.push({ t: f.t, rgb: f.rgb, pose: f.pose }), { maxShots: 3 });
    const v = live.finish(truth.durationMs);
    expect(v.taken).toBe(3);
    expect(v.shots.map((s) => s.made)).toEqual(truth.shots.map((s) => s.made));
    expect(v.shots.filter((s) => s.spot).length).toBeGreaterThanOrEqual(2);
    for (const s of v.shots) if (s.spot) expect(s.spot.distM).toBeGreaterThan(1.5);
    const fixed = live.fix(1, !v.shots[0].made);
    expect(fixed.shots[0]).toMatchObject({ made: !v.shots[0].made, fixed: true, ask: false });
    expect(live.addByHand(true, truth.durationMs).taken).toBe(4);
    expect(live.drop(2).taken).toBe(3);
    const session = live.shotSession('2026-10-26', Date.UTC(2026, 9, 26));
    expect(cleanSession(session)).toEqual(session);
  }, 120_000);

  it('dribbles: counted with crossovers and a rate', () => {
    const fx = DRIBBLE_FIXTURES.find((f) => f.id === 'living-room')!;
    const live = new HoopsLive({ mode: 'dribble', rim: null, placement: 'top', heightM: null, aspect: fx.cam.w / fx.cam.h });
    const truth = filmDribbles(fx, (f) => live.push({ t: f.t, rgb: f.rgb, pose: f.pose }));
    const d = live.current().dribble!;
    expect(d.count).toBeGreaterThanOrEqual(Math.floor(truth.bounces.length * 0.85));
    expect(d.count).toBeLessThanOrEqual(truth.bounces.length + 2);
    expect(d.crossovers).toBeGreaterThanOrEqual(6);
    expect(d.rateHz).toBeGreaterThan(1.5);
    expect(cleanSession(live.dribbleSession('2026-10-26', Date.UTC(2026, 9, 26), 30))).not.toBeNull();
  }, 120_000);
});
