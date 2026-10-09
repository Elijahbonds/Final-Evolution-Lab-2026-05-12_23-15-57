// HOOPS BODY (2026-10-07, Mirror & coaching Phase 7) — the 3PT by body: the shot read on the body's own clock, on the two
// recorded jump shots (lib/pose/__fixtures__) and on SYNTHESIZED shots (lib/move/hoopsStreams: no recorded take has a
// release at a chosen instant, a one-handed push, or a set shot), the meter placed so its own release() grades it, the
// floor pressing nothing, the card offering body play, and the space a shot needs. No camera, no scene, no video.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ShotMeter } from '@/lib/babylon/core/BasketballCore';
import { PUMP_MAX_SEC as MODE_PUMP_MAX_SEC } from '@/lib/babylon/core/HoopsMoves';
import { bodySeamFor } from '@/lib/babylon/core/bodySeam';
import { BODY_PROFILES } from '@/lib/input/bodyProfiles';
import { bodyButtonAction, bodyPlayOffer } from '@/lib/move/bodyPlayChoice';
import { HEADROOM_JUMP_M } from '@/lib/move/spaceCheck';
import { SET_JUMPER_GREEN } from '@/lib/pose/baseline';
import type { BodyEvent } from '@/lib/pose/BodyReader';
import { standFrame, STAND_SEC, SPLICE_MS } from '@/lib/pose/grade';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { bodyPackets, seamReplay, type StreamPacket } from '@/lib/pose/seamReplay';
import { hold, holdStill, jogBeat, script, crouch } from '@/lib/pose/streamKit';
import { synthesize, type PoseFixture } from '@/lib/pose/synth';
import {
  BodyShot, BODY_RELEASE_GOOD_MS, BODY_RELEASE_TARGET_MS, BODY_TO_METER, HELD_ERR_MS, OPEN_JUMPER_GOOD_SEC, PERFECT_SHARE,
  SET_SHOT_ERR_MS, SHOT_SPACE, THREE_BODY, PUMP_MAX_SEC, PUMP_CLEAR_SEC, bodyShotQuality, meterTFor, type ShotVerdict,
} from './hoopsBody';
import { REST, setShotBeat, shotBeat } from './hoopsStreams';

const ROOT = join(__dirname, '..', '..');
const FX = join(ROOT, 'lib/pose/__fixtures__');
const load = (n: string) => JSON.parse(readFileSync(join(FX, `${n}.json`), 'utf8')) as PoseFixture;
const OWNER_STAND = load('stand_still').frames[70];

/** A recorded take with its stand held before it (the space check's calibration), as the gates read it. */
function take(name: string): { frames: PoseFrame[]; fx: PoseFixture } {
  const fx = load(name);
  const st = standFrame(fx, fx.source.kind === 'deepmotion' ? OWNER_STAND : undefined);
  const lead = holdStill(st.frame, { sec: STAND_SEC, fps: fx.settings.synth.fps, beforeT: fx.frames[0].t });
  return { frames: [...lead, ...fx.frames], fx };
}
const shoot = (beats: Parameters<typeof script>[0], seed = 17): PoseFrame[] => synthesize(script(beats), { seed, fps: 30 }).frames;

/** The 3PT's chain without the scene: the CLAIMED events into BodyShot (the mode's onBody), the capture clock into tick. */
function shotsOf(packets: readonly StreamPacket[], from = -Infinity): { starts: number; verdicts: ShotVerdict[]; took: number } {
  const claims = new Set<string>(THREE_BODY.claims);
  const shot = new BodyShot();
  let starts = 0, took = 0;
  const verdicts: ShotVerdict[] = [];
  for (const p of packets) {
    if (p.read.t < from) continue;
    for (const ev of p.events) {
      if (!claims.has(ev.kind)) continue;
      const a = shot.see(ev);
      if (a.start) starts++;
      if (a.took) took++;
      if (a.verdict) verdicts.push(a.verdict);
    }
    const late = shot.tick(p.read.t);
    if (late) verdicts.push(late);
  }
  return { starts, verdicts, took };
}

describe('the recorded jump shots: one shot each, graded against their own apex', () => {
  for (const name of ['jumpshot', 'jumpshot_dribble']) {
    it(name, () => {
      const { frames, fx } = take(name);
      const { starts, verdicts } = shotsOf(bodyPackets(frames), fx.frames[0].t + SPLICE_MS);
      expect(starts).toBe(1);
      expect(verdicts).toHaveLength(1);
      const v = verdicts[0];
      expect(v.why).toBe('timed');
      expect(v.jumped).toBe(true);
      expect(v.hand).toBe('R');   // both takes shoot right-handed: the ball hand is the wrist that released
      // the truth: release − apex of the take (CMU 124_05 −106 ms, 06_15 −159 ms); the reader tells it within 80 ms
      const gtRel = fx.gt.wrist.find((w) => w.kind === 'release')!.at.t, gtApex = fx.gt.jumps[0].apex!.t;
      expect(Math.abs(v.lateMs! - (gtRel - gtApex))).toBeLessThan(80);
      // both release on the way up, inside the body's good window (TUNED: the target sits between the two truths)
      expect(['perfect', 'good']).toContain(bodyShotQuality(v.errMs));
    });
  }

  it('the grade is on the capture clock: however late each frame reaches the page, the same shot', () => {
    const { frames, fx } = take('jumpshot');
    const clean = shotsOf(bodyPackets(frames), fx.frames[0].t + SPLICE_MS).verdicts[0];
    for (const lag of [40, 120, 250]) {
      const laggy = frames.map((f, i) => ({ ...f, arrive: f.t + lag + ((i * 37) % 60) }));
      const v = shotsOf(bodyPackets(laggy), fx.frames[0].t + SPLICE_MS).verdicts[0];
      expect(v.errMs, `lag ${lag}`).toBe(clean.errMs);
    }
  });
});

describe('synthesized shots: the release the script made is the release graded', () => {
  const offsets = [-0.3, -0.2, -0.12, -0.05, 0, 0.1];
  const runs = offsets.map((off) => {
    const s = shotBeat({ releaseVsApexSec: off });
    const frames = shoot([hold(REST, 1.2), s.beat, hold(REST, 0.6)]);
    return { off, ...shotsOf(bodyPackets(frames)) };
  });

  it('one shot per jump, timed, the release within a frame and a half of the script', () => {
    for (const r of runs) {
      expect(r.starts, `off ${r.off}`).toBe(1);
      expect(r.verdicts, `off ${r.off}`).toHaveLength(1);
      expect(r.verdicts[0].why).toBe('timed');
      expect(Math.abs(r.verdicts[0].lateMs! - r.off * 1000), `off ${r.off}`).toBeLessThan(50);
    }
  });

  it('later releases grade later, and the window reads early / good / late as the body did it', () => {
    const errs = runs.map((r) => r.verdicts[0].errMs);
    for (let i = 1; i < errs.length; i++) expect(errs[i]).toBeGreaterThan(errs[i - 1]);
    const q = runs.map((r) => bodyShotQuality(r.verdicts[0].errMs));
    expect(q[0]).toBe('early');                          // 300 ms before the top
    expect(['perfect', 'good']).toContain(q[2]);          // 120 ms before: the target
    expect(q[q.length - 1]).toBe('late');                 // 100 ms after the top
  });

  it('the ball hand is whichever wrist releases', () => {
    for (const hand of ['Left', 'Right'] as const) {
      const s = shotBeat({ releaseVsApexSec: -0.12, hand });
      const { verdicts } = shotsOf(bodyPackets(shoot([hold(REST, 1.2), s.beat, hold(REST, 0.6)])));
      expect(verdicts).toHaveLength(1);
      expect(verdicts[0].hand).toBe(hand === 'Left' ? 'L' : 'R');
    }
  });

  it('a set shot (no jump) is a shot, graded short: there is no apex to time it against', () => {
    const s = setShotBeat('Right');
    const { starts, verdicts } = shotsOf(bodyPackets(shoot([hold(REST, 1.2), s.beat, hold(REST, 0.8)])));
    expect(starts).toBe(1);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0].why).toBe('set');
    expect(verdicts[0].errMs).toBe(SET_SHOT_ERR_MS);
    expect(bodyShotQuality(verdicts[0].errMs)).toBe('early');
  });

  it('a jump with no release is the ball held through it: graded late', () => {
    const { frames, fx } = take('jump_two_foot_low');
    const { verdicts } = shotsOf(bodyPackets(frames), fx.frames[0].t + SPLICE_MS);
    expect(verdicts.length).toBeGreaterThan(0);
    for (const v of verdicts) { expect(v.why).toBe('held'); expect(v.errMs).toBe(HELD_ERR_MS); }
  });
});

describe('nothing that is not a shot starts one', () => {
  const quiet: [string, PoseFrame[]][] = [
    ['stand', shoot([hold(REST, 3)])],
    ['a dip and stand back up', shoot([hold(REST, 1.2), [0.8, (t) => crouch(REST, 0.2 * Math.sin(Math.PI * t / 0.8))], hold(REST, 1)])],
    ['a jog in place', shoot([hold(REST, 1.2), jogBeat(REST, 2.5, 2.7, 0.2)])],
  ];
  for (const name of ['stand_still', 'run_in_place', 'shuffle_lateral']) {
    const { frames, fx } = take(name);
    quiet.push([name, frames.filter((f) => f.t < fx.frames[0].t || f.t >= fx.frames[0].t + SPLICE_MS)]);
  }
  it.each(quiet)('%s: no shot, nothing taken', (_name, frames) => {
    const r = shotsOf(bodyPackets(frames));
    expect(r.starts).toBe(0);
    expect(r.verdicts).toHaveLength(0);
    expect(r.took).toBe(0);
  });
});

describe('the meter: placed so its own release() grades the body\'s error', () => {
  it('the open jumper\'s windows line up: the body\'s ±good is the meter\'s ±good, the perfect its 0.35', () => {
    expect(OPEN_JUMPER_GOOD_SEC * 1000).toBeCloseTo(SET_JUMPER_GREEN.goodMs, 0);
    expect(PERFECT_SHARE).toBe(0.35);
    const at = (err: number) => { const m = new ShotMeter(); m.start(0, 'jumper', 0); m.t = meterTFor(err, m); return m.release(); };
    expect(at(0)).toBe('perfect');
    expect(at(BODY_RELEASE_GOOD_MS * PERFECT_SHARE * 0.9)).toBe('perfect');
    expect(at(-BODY_RELEASE_GOOD_MS * PERFECT_SHARE * 0.9)).toBe('perfect');
    expect(at(BODY_RELEASE_GOOD_MS * 0.95)).toBe('good');
    expect(at(-BODY_RELEASE_GOOD_MS * 0.95)).toBe('good');
    expect(at(BODY_RELEASE_GOOD_MS * 1.1)).toBe('late');
    expect(at(-BODY_RELEASE_GOOD_MS * 1.1)).toBe('early');
    expect(at(HELD_ERR_MS)).toBe('late');
    expect(at(SET_SHOT_ERR_MS)).toBe('early');
    // the pure word and the meter's agree on the open jumper
    for (const e of [-300, -130, -100, -30, 0, 30, 100, 130, 300]) expect(at(e)).toBe(bodyShotQuality(e));
  });

  it('a contested or deep shot narrows the body\'s window with the meter\'s: the same release grades worse', () => {
    const at = (contest: number, err: number) => { const m = new ShotMeter(); m.start(contest, 'jumper', 0); m.t = meterTFor(err, m); return m.release(); };
    expect(at(0, 90)).toBe('good');
    expect(at(0.8, 90)).toBe('late');
  });

  it('never inside the pump-fake window, never at the meter\'s end', () => {
    expect(PUMP_MAX_SEC).toBe(MODE_PUMP_MAX_SEC);   // the mode's number, mirrored
    const m = new ShotMeter(); m.start(0, 'jumper', 0.3);
    const t = meterTFor(-5000, m, PUMP_MAX_SEC + PUMP_CLEAR_SEC);
    expect(t * m.durationSec).toBeGreaterThanOrEqual(PUMP_MAX_SEC + PUMP_CLEAR_SEC - 1e-9);
    expect(meterTFor(5000, m)).toBeLessThan(1);
    expect(BODY_TO_METER).toBeCloseTo(OPEN_JUMPER_GOOD_SEC / (BODY_RELEASE_GOOD_MS / 1000));
    expect(BODY_RELEASE_TARGET_MS).toBeLessThan(0);   // TUNED: the target is before the top (both captures release on the way up)
  });
});

describe('the 3PT offers body play, and the floor presses nothing', () => {
  it('the card is play: the READY choice and the Body button begin it', () => {
    const seam = bodySeamFor({ modeId: 'threepoint', body: THREE_BODY, onBody: () => true });
    expect(seam.drives).toBe(true);
    expect(bodyPlayOffer(seam.card)).toBe('play');
    expect(bodyButtonAction({ ...seam.card, phase: 'ready' }, false)).toBe('begin');
    expect(seam.card.lines.map((l) => l.verb)).toEqual(['SHOOT', 'RELEASE']);
    expect(seam.profile.bindings).toEqual([]);
  });

  it('the hoops rows bind nothing: on a jump shot, a jog and a dip the floor sends no press, no trigger, no stick', () => {
    for (const key of ['threepoint', 'onevone', 'threevthree']) {
      const profile = BODY_PROFILES[key];
      expect(profile.bindings, key).toEqual([]);
      for (const name of ['jumpshot', 'run_in_place', 'jump_two_foot_low']) {
        const { frames } = take(name);
        const r = seamReplay(bodyPackets(frames), { profile, phase: 'playing', drives: true });
        expect(r.floor, `${key} ${name}`).toEqual([]);
      }
    }
  });

  it('the mode is wired: the claims, the start, the placement before its own release, the held meter, a reset per ball', () => {
    const src = readFileSync(join(ROOT, 'lib/babylon/modes/ThreePointMode.ts'), 'utf8');
    expect(src).toContain('body: THREE_BODY');
    expect(src).toContain('const act = bodyShot.see(ev);');
    expect(src).toMatch(/shotMeter\.t = meterTFor\(v\.errMs, shotMeter\);[\s\S]{0,200}releaseHold\(ctx\);/);
    expect(src).toContain('if (shotMeter.t >= 1 && !(bodyShotAt >= 0 && bodyShot.pending)) releaseHold(ctx);');
    expect(src).toContain('bodyShot.reset(); bodyShotAt = -1;');
    expect(src).toContain('bodyTick(ctx);');
  });
});

describe('the space a shot needs is the check\'s own arms-overhead headroom', () => {
  it('the recorded shots rise less than the check\'s design jump, and release overhead', () => {
    expect(SHOT_SPACE.jumpM).toBe(HEADROOM_JUMP_M);
    expect(SHOT_SPACE.armsOverhead).toBe(true);
    for (const name of ['jumpshot', 'jumpshot_dribble']) {
      const { frames } = take(name);
      const evs = bodyPackets(frames).flatMap((p) => p.events as BodyEvent[]);
      const apex = evs.find((e): e is Extract<BodyEvent, { kind: 'apex' }> => e.kind === 'apex')!;
      expect(apex.riseM, name).toBeLessThan(HEADROOM_JUMP_M);
      // a release is told only from a wrist over the head line (BodyReader.release): the shot is an arms-overhead move
      expect(evs.some((e) => e.kind === 'release'), name).toBe(true);
    }
  });
});

// ── minors: body play's own rule (lib/move/bodyPlayGrownUp) holds for the hoops games ───────────────────────────────
describe('a minor or an unknown age: the hoops camera waits for the grown-up step', () => {
  const NOW = new Date('2026-10-07T00:00:00Z');
  async function begin(key: string, modeId: string, spec: typeof THREE_BODY, age: { dobYear?: number | null; band?: '18+' | '13-17' | 'under-13' | null }) {
    const { createBodyPlay } = await import('./bodyPlay');
    const { bodyPlayNeedsGrownUp } = await import('./bodyPlayGrownUp');
    const { sessionStore } = await import('@/lib/babylon/core/sessionStore');
    const calls: string[] = [];
    const writer = sessionStore.mount(bodySeamFor({ modeId, body: spec, onBody: () => true }).card);
    writer.setPhase('ready');
    const bp = createBodyPlay({
      source: {
        snapshot: { state: 'idle', detail: '', body: false },
        start: async () => { calls.push('start'); return true; }, stop: () => { calls.push('stop'); },
        listen: () => () => {}, setCalibration: () => {}, recalibrate: () => {},
      },
      service: { status: { state: 'idle', why: null, source: null, model: null, modelWhy: null, camera: null }, onFrame: () => () => {}, onStatus: () => () => {} },
      session: sessionStore,
      storage: { getItem: () => null, setItem: () => {} },
      unlockAudio: () => {}, voice: { load: () => {}, play: () => {}, bank: () => new Set() }, sampleLuma: () => null,
      pauseGame: () => {}, onPageHidden: () => {}, now: () => 0,
      needsGrownUp: () => bodyPlayNeedsGrownUp(age, NOW),
    });
    try {
      const started = await bp.begin(key);
      return { started, calls: [...calls], grownUp: bp.view().grownUp, offer: bodyPlayOffer(sessionStore.view()) };
    } finally { writer.unmount(); }
  }

  it.each([{ dobYear: 2012 }, { band: '13-17' as const }, {}, { dobYear: null }])('the 3PT, %j: offered, but no camera before the tick', async (age) => {
    const r = await begin('threepoint', 'threepoint', THREE_BODY, age);
    expect(r.offer).toBe('play');
    expect(r.started).toBe(false);
    expect(r.calls).toEqual([]);
    expect(r.grownUp).toBe('ask');
  });

  it('a known adult starts it on the tap', async () => {
    const r = await begin('threepoint', 'threepoint', THREE_BODY, { band: '18+', dobYear: 1990 });
    expect(r.started).toBe(true);
    expect(r.calls).toContain('start');
  });
});
