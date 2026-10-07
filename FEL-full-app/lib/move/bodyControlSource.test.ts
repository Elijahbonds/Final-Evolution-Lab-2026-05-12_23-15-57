// HOOPS BODY (2026-10-07, Mirror & coaching Phase 7) — 1v1 / 3v3 by body through the BodyControlSource, on the recorded
// takes (lib/pose/__fixtures__: the jump shots, the jog, the shuffle, the punches, the dunks) and SYNTHESIZED streams
// (lib/move/hoopsStreams: crossovers, swipes, sit-downs, a hand up — no recorded take has them). The chain is the harness's:
// the claimed events into see() (the mode's onBody), the latest frame into poll() at render ticks, the mode's own shot
// meter started and released the way OneVOneMode / ThreeVThreeMode do it. No camera, no scene, no video.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ShotMeter, type ShotQuality } from '@/lib/babylon/core/BasketballCore';
import { isPumpFake } from '@/lib/babylon/core/HoopsMoves';
import { LocalInputSource, type Intent } from '@/lib/babylon/core/PlayerSlot';
import type { BodyView } from '@/lib/babylon/core/ModeHarness';
import type { FelInput } from '@/lib/babylon/core/InputBus';
import { StickHandleReader, stickMoveFor } from '@/lib/babylon/core/StickHandle';
import { bodySeamFor } from '@/lib/babylon/core/bodySeam';
import { bodyButtonAction, bodyPlayOffer } from '@/lib/move/bodyPlayChoice';
import { standFrame, STAND_SEC, SPLICE_MS } from '@/lib/pose/grade';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { bodyPackets, type StreamPacket } from '@/lib/pose/seamReplay';
import { crouch, hold, holdStill, jogBeat, script, type Beat } from '@/lib/pose/streamKit';
import { synthesize, type PoseFixture } from '@/lib/pose/synth';
import {
  BodyControlSource, COURT_BODY, MergedControlSource, mergeIntent, neutralIntent, BODY_TURBO_HZ, type CourtRole,
} from './bodyControlSource';
import { bodyShotQuality } from './hoopsBody';
import { REST, crossoverBeat, handUpBeat, shotBeat, sitBeat, swipeBeat } from './hoopsStreams';

const ROOT = join(__dirname, '..', '..');
const FX = join(ROOT, 'lib/pose/__fixtures__');
const load = (n: string) => JSON.parse(readFileSync(join(FX, `${n}.json`), 'utf8')) as PoseFixture;
const OWNER_STAND = load('stand_still').frames[70];
/** A recorded take with its stand before it, the stand → take splice cut out (the gates' convention: SPLICE_MS). */
function take(name: string): PoseFrame[] {
  const fx = load(name);
  const st = standFrame(fx, fx.source.kind === 'deepmotion' ? OWNER_STAND : undefined);
  const lead = holdStill(st.frame, { sec: STAND_SEC, fps: fx.settings.synth.fps, beforeT: fx.frames[0].t });
  const t0 = fx.frames[0].t;
  return [...lead, ...fx.frames.filter((f) => f.t >= t0 + SPLICE_MS)];
}
const shoot = (beats: Beat[], seed = 17): PoseFrame[] => synthesize(script(beats), { seed, fps: 30 }).frames;

interface Run {
  intents: Intent[];
  /** Counts of each edge / hold over the run. */
  n: Record<string, number>;
  shots: { quality: ShotQuality; meterSec: number; pump: boolean }[];
  flicks: FelInput[];
  crossovers: number;
  took: number;
}

/**
 * The harness and the mode, minus the scene: each packet's CLAIMED events into see() at the packet's arrival, a 60 Hz render
 * tick polling the source (the mode's update order: the slot polls first, then the meter starts on a squeeze and runs,
 * and an `action` releases it — or its end does, the brick).
 */
function run(packets: readonly StreamPacket[], role: CourtRole | ((t: number) => CourtRole), opts: { gatherSec?: number; hand?: 'Left' | 'Right' } = {}): Run {
  const claims = new Set<string>(COURT_BODY.claims);
  let cur: BodyView | null = null;
  let now = packets[0]?.arrivedAt ?? 0;
  const meter = new ShotMeter();
  let shooting = false;
  const flicks: FelInput[] = [];
  const roleAt = typeof role === 'function' ? role : () => role;
  const src = new BodyControlSource({
    role: () => roleAt(now), view: () => cur, meter: () => (shooting ? meter : null), hand: () => opts.hand ?? 'Right',
    emit: (e) => flicks.push(e), now: () => now,
  });
  const out: Run = { intents: [], n: {}, shots: [], flicks, crossovers: 0, took: 0 };
  const dt = 1 / 60;
  const tick = (): void => {
    const i = src.poll(dt);
    out.intents.push(i);
    for (const k of ['sprint', 'turbo', 'action', 'pass', 'steal', 'jump', 'contest', 'intense'] as const) if (i[k]) out.n[k] = (out.n[k] ?? 0) + 1;
    if (i.actionHeld > 0.02) out.n.held = (out.n.held ?? 0) + 1;
    if (Math.abs(i.moveX) > 0.1) out.n.moveX = (out.n.moveX ?? 0) + 1;
    if (Math.abs(i.moveY) > 0.1) out.n.moveY = (out.n.moveY ?? 0) + 1;
    if (!shooting && i.actionHeld > 0.02) { shooting = true; meter.start(0, 'jumper', opts.gatherSec ?? 0.25); }
    if (shooting) {
      const t = meter.update(dt);
      if (i.action || t >= 1) {
        out.shots.push({ quality: meter.release(), meterSec: t * meter.durationSec, pump: i.action && isPumpFake(t * meter.durationSec) });
        shooting = false;
      }
    }
  };
  for (const p of packets) {
    while (now + dt * 1000 <= p.arrivedAt) { now += dt * 1000; tick(); }
    now = Math.max(now, p.arrivedAt);
    cur = { read: p.read, channels: p.channels, arrivedAt: p.arrivedAt, lagMs: p.arrivedAt - p.read.t };
    for (const ev of p.events) if (claims.has(ev.kind) && src.see(ev, cur)) out.took++;
  }
  for (let k = 0; k < 90; k++) { now += dt * 1000; tick(); }
  out.crossovers = src.crossovers;
  return out;
}

// ── button play is unchanged ─────────────────────────────────────────────────────────────────────────────────────

describe('with no body, the merge IS the pad (button play unchanged)', () => {
  it('a neutral body hands back every field of the pad\'s Intent, optional ones as the pad left them', () => {
    const pads: Intent[] = [
      neutralIntent(),
      { moveX: 0.05, moveY: -0.04, sprint: false, action: false, actionHeld: 0, pass: false, steal: false },
      { moveX: 1, moveY: 0, sprint: true, turbo: true, action: true, actionHeld: 0, pass: true, steal: true, jump: true, contest: false, intense: true, brace: true, glass: false, screen: true, takeCharge: true, passFake: false },
      { moveX: -0.3, moveY: 0.8, sprint: false, action: false, actionHeld: 1, pass: false, steal: false, contest: true },
    ];
    for (const p of pads) expect(mergeIntent(p, neutralIntent())).toEqual(p);
  });

  it('the hero\'s merged source polls the same Intents as the bare pad, press for press, with nobody in frame', () => {
    const script: FelInput[][] = [
      [{ t: 'stick', side: 'L', x: 0.7, y: -0.7 }], [{ t: 'trigger', side: 'R', value: 0.9 }],
      [{ t: 'button', btn: 'X', pressed: true }], [], [{ t: 'button', btn: 'X', pressed: false }],
      [{ t: 'button', btn: 'A', pressed: true }], [{ t: 'button', btn: 'A', pressed: false }],
      [{ t: 'button', btn: 'Y', pressed: true }], [{ t: 'trigger', side: 'L', value: 1 }], [{ t: 'button', btn: 'B', pressed: true }],
      [{ t: 'stick', side: 'L', x: 0, y: 0 }], [{ t: 'button', btn: 'R1', pressed: true, src: 'key' }],
    ];
    for (const view of [null, { read: { t: 0, present: false } } as unknown as BodyView]) {
      const bare = new LocalInputSource(), padHalf = new LocalInputSource();
      const merged = new MergedControlSource(padHalf, new BodyControlSource({ role: () => 'offense', view: () => view, meter: () => null }));
      for (const step of script) {
        for (const e of step) { bare.feed(e); padHalf.feed(e); }
        const a = bare.poll(), b = merged.poll(1 / 60);
        // the hold reads (contest, passFake) come off performance.now(): compare the press-made fields
        expect({ ...b, contest: undefined, passFake: undefined }).toEqual({ ...a, contest: undefined, passFake: undefined });
      }
    }
  });

  it('the pad\'s stick wins when it is pushed; the body\'s steers only a resting pad stick', () => {
    const body: Intent = { ...neutralIntent(), moveX: 0.6, moveY: 0.9 };
    expect(mergeIntent({ ...neutralIntent(), moveX: -1, moveY: 0 }, body)).toMatchObject({ moveX: -1, moveY: 0 });
    expect(mergeIntent(neutralIntent(), body)).toMatchObject({ moveX: 0.6, moveY: 0.9 });
  });
});

// ── the plan's rules ─────────────────────────────────────────────────────────────────────────────────────────────

const JUMPS = ['jumpshot', 'jumpshot_dribble', 'jump_two_foot_low', 'jump_two_foot_high', 'jump_one_foot_runup', 'dunk_elijah_two_foot', 'dunk_elijah_one_foot', 'dunk_approach_two_foot'];
const dipStream = (): PoseFrame[] => shoot([hold(REST, 1.2), [0.7, (t) => crouch(REST, 0.25 * Math.sin(Math.PI * t / 0.7))], hold(REST, 0.6),
  [0.7, (t) => crouch(REST, 0.18 * Math.sin(Math.PI * t / 0.7))], hold(REST, 1)]);

describe('no turbo from a dip, no pass from a jump', () => {
  it('a dip, a squat held, and every recorded jump: no turbo, no sprint (offence and defence)', () => {
    const streams: [string, PoseFrame[]][] = [
      ['two dips', dipStream()], ['a squat held', shoot([hold(REST, 1.2), sitBeat(0.3, 2.5), hold(REST, 0.5)])],
      ...['jumpshot', 'jumpshot_dribble', 'jump_two_foot_low', 'jump_two_foot_high'].map((n) => [n, take(n)] as [string, PoseFrame[]]),
    ];
    for (const [name, frames] of streams) {
      for (const role of ['offense', 'defense'] as const) {
        const r = run(bodyPackets(frames), role);
        expect(r.n.turbo ?? 0, `${name} ${role}`).toBe(0);
        expect(r.n.sprint ?? 0, `${name} ${role}`).toBe(0);
      }
    }
  });

  it('no take, jump or otherwise, ever passes — the pass is the pad\'s alone', () => {
    for (const name of [...JUMPS, 'run_in_place', 'shuffle_lateral', 'punch_kick']) {
      for (const role of ['offense', 'defense'] as const) expect(run(bodyPackets(take(name)), role).n.pass ?? 0, `${name} ${role}`).toBe(0);
    }
  });
});

// ── offence ──────────────────────────────────────────────────────────────────────────────────────────────────────

describe('offence: the drive is running in place, the turbo its cadence', () => {
  it('a jog drives forward without the turbo; running hard is the turbo', () => {
    const jog = run(bodyPackets(shoot([hold(REST, 1.2), jogBeat(REST, 3, 2.6, 0.2)])), 'offense');
    expect(jog.n.moveY ?? 0).toBeGreaterThan(60);
    expect(jog.n.turbo ?? 0).toBe(0);
    const sprint = run(bodyPackets(shoot([hold(REST, 1.2), jogBeat(REST, 3, 3.8, 0.2)])), 'offense');
    expect(sprint.n.turbo ?? 0).toBeGreaterThan(60);
    expect(sprint.n.sprint ?? 0).toBeGreaterThan(60);
    expect(BODY_TURBO_HZ).toBeGreaterThan(2.8);   // TUNED: a jog (2.2–2.8 steps/s) is not the turbo
    // forward is +y in Intent space (CourtMovement: +Y = up-stick = away from the camera)
    expect(Math.max(...jog.intents.map((i) => i.moveY))).toBeGreaterThan(0.3);
  });

  it('the shuffle steps sideways; a jog\'s drift does not steer the drive', () => {
    expect(run(bodyPackets(take('shuffle_lateral')), 'offense').n.moveX ?? 0).toBeGreaterThan(20);
    expect(run(bodyPackets(take('run_in_place')), 'offense').n.moveX ?? 0).toBe(0);
  });

  it('standing still says nothing at all', () => {
    for (const role of ['offense', 'defense'] as const) {
      const r = run(bodyPackets(take('stand_still')), role);
      expect(r.n, role).toEqual({});
      expect(r.took).toBe(0);
    }
  });
});

describe('offence: the jumper, graded on the body\'s clock and placed on the mode\'s own meter', () => {
  it('the recorded jump shots: one squeeze, one release, in the window — never the brick, never a pump fake', () => {
    for (const name of ['jumpshot', 'jumpshot_dribble']) {
      const r = run(bodyPackets(take(name)), 'offense');
      expect(r.shots, name).toHaveLength(1);
      expect(r.n.action ?? 0, name).toBe(1);
      expect(['perfect', 'good'], name).toContain(r.shots[0].quality);
      expect(r.shots[0].pump, name).toBe(false);
    }
  });

  it('the meter grades what the body did: early, on time and late synthesized releases', () => {
    const q = [-0.3, -0.12, 0.1].map((off) => {
      const s = shotBeat({ releaseVsApexSec: off });
      const r = run(bodyPackets(shoot([hold(REST, 1.2), s.beat, hold(REST, 0.6)])), 'offense');
      expect(r.shots, `off ${off}`).toHaveLength(1);
      return r.shots[0].quality;
    });
    expect(q[0]).toBe('early');
    expect(['perfect', 'good']).toContain(q[1]);
    expect(q[2]).toBe('late');
  });

  it('the same shot whatever the camera\'s lag (40–250 ms), and with a gather or none', () => {
    const frames = take('jumpshot');
    const base = run(bodyPackets(frames), 'offense').shots[0].quality;
    for (const lag of [40, 120, 250]) {
      const laggy = frames.map((f, i) => ({ ...f, arrive: f.t + lag + ((i * 37) % 60) }));
      for (const gatherSec of [0, 0.3]) expect(run(bodyPackets(laggy), 'offense', { gatherSec }).shots[0].quality, `lag ${lag} gather ${gatherSec}`).toBe(base);
    }
    expect(base).toBe(bodyShotQuality(-170 - -120));   // the take's read: 170 ms before its apex
  });

  it('a jump with no release goes up held (late), not a brick off the meter\'s end before the body could say', () => {
    const r = run(bodyPackets(take('jump_two_foot_low')), 'offense');
    expect(r.shots.length).toBeGreaterThan(0);
    for (const s of r.shots) expect(s.quality).toBe('late');
  });
});

describe('offence: the crossover is a low hand carried across, standing', () => {
  it('four synthesized crossovers are four, each the mode\'s own crossover off its dribble stick (either ball hand)', () => {
    for (const hand of ['Right', 'Left'] as const) {
      const X = crossoverBeat(4);
      const r = run(bodyPackets(shoot([hold(REST, 1.2), X.beat])), 'offense', { hand });
      expect(r.crossovers, hand).toBe(4);
      const reader = new StickHandleReader();
      const moves = r.flicks.flatMap((e, k) => (e.t === 'stick' ? reader.feed(e.x, e.y, k * 0.01) : []))
        .map((g) => stickMoveFor(g, { speed01: 0, pressured: false, sprint: false, hand })?.move);
      expect(moves, hand).toEqual(['crossover', 'crossover', 'crossover', 'crossover']);
    }
  });

  it('no crossover out of arm swings: the jog, the shuffle, the jumps, the dunks\' run-ups, the punches', () => {
    for (const name of [...JUMPS, 'run_in_place', 'shuffle_lateral', 'punch_kick', 'stand_still']) {
      expect(run(bodyPackets(take(name)), 'offense').crossovers, name).toBe(0);
    }
  });

  it('on defence a low hand across is nothing', () => {
    expect(run(bodyPackets(shoot([hold(REST, 1.2), crossoverBeat(3).beat])), 'defense').crossovers).toBe(0);
  });
});

// ── defence ──────────────────────────────────────────────────────────────────────────────────────────────────────

describe('defence: slide, sit down, contest, block, steal', () => {
  it('a jump is the block, one per take-off', () => {
    const r = run(bodyPackets(take('jump_two_foot_low')), 'defense');
    expect(r.n.jump ?? 0).toBeGreaterThanOrEqual(3);
    expect(r.n.jump ?? 0).toBeLessThanOrEqual(5);
    expect(r.n.held ?? 0).toBe(0);   // a defender's jump is never a shot
  });

  it('a hand up with the feet down is the contest; lowered slowly it steals nothing', () => {
    const slowDown: Beat = [0.8, (t) => crouch(REST, 0)];
    const r = run(bodyPackets(shoot([hold(REST, 1.2), handUpBeat(1.5), slowDown, hold(REST, 0.5)])), 'defense');
    expect(r.n.contest ?? 0).toBeGreaterThan(30);
    expect(r.n.steal ?? 0).toBe(0);
  });

  it('a reach straight at the ball (the punch take\'s three) is the steal; a swipe down from overhead is not read', () => {
    expect(run(bodyPackets(take('punch_kick')), 'defense').n.steal ?? 0).toBe(3);
    expect(run(bodyPackets(shoot([hold(REST, 1.2), swipeBeat().beat, hold(REST, 0.5)])), 'defense').n.steal ?? 0).toBe(0);
  });

  it('no steal from the arms coming down with a landing or out of a jump\'s arm swing', () => {
    for (const name of ['jump_two_foot_high', 'jump_two_foot_low', 'jumpshot', 'jumpshot_dribble', 'dunk_elijah_two_foot', 'dunk_elijah_one_foot', 'dunk_approach_two_foot']) {
      expect(run(bodyPackets(take(name)), 'defense').n.steal ?? 0, name).toBe(0);
    }
    // the synthesized shots lower the arms toward the lens after the landing (read as reaches): not a steal either
    for (const off of [-0.12, 0.1]) {
      const s = shotBeat({ releaseVsApexSec: off });
      expect(run(bodyPackets(shoot([hold(REST, 1.2), s.beat, hold(REST, 0.6)])), 'defense').n.steal ?? 0, `off ${off}`).toBe(0);
    }
  });

  it('sitting down is intense D; a jump\'s dip and a 10 cm bob are not', () => {
    expect(run(bodyPackets(shoot([hold(REST, 1.2), sitBeat(0.3, 2), hold(REST, 0.5)])), 'defense').n.intense ?? 0).toBeGreaterThan(40);
    for (const name of ['jumpshot', 'jump_two_foot_low']) expect(run(bodyPackets(take(name)), 'defense').n.intense ?? 0, name).toBe(0);
    expect(run(bodyPackets(shoot([hold(REST, 1.2), sitBeat(0.1, 1.5), hold(REST, 0.5)])), 'defense').n.intense ?? 0).toBe(0);
  });

  it('the possession changing mid-shot drops the shot: a defender is never left holding the shot button', () => {
    const frames = take('jumpshot');
    const pk = bodyPackets(frames);
    const flip = pk[Math.floor(pk.length * 0.62)].arrivedAt;
    const r = run(pk, (t) => (t < flip ? 'offense' : 'defense'));
    const after = r.intents.slice(-30);
    expect(after.every((i) => i.actionHeld === 0 && !i.action)).toBe(true);
  });
});

describe('lost from the frame: the body lets go', () => {
  it('no body, or one not tracking: a neutral Intent', () => {
    const src = new BodyControlSource({ role: () => 'defense', view: () => null });
    expect(src.poll(1 / 60)).toEqual({ ...neutralIntent(), jump: false, steal: false });
  });
});

// ── the modes ────────────────────────────────────────────────────────────────────────────────────────────────────

describe('1v1 and 3v3 offer body play through the hero\'s ControlSource', () => {
  it('the card is play, with the readable set\'s lines', () => {
    for (const modeId of ['onevone', 'threevthree']) {
      const seam = bodySeamFor({ modeId, body: COURT_BODY, onBody: () => true });
      expect(seam.drives).toBe(true);
      expect(bodyPlayOffer(seam.card)).toBe('play');
      expect(bodyButtonAction({ ...seam.card, phase: 'ready' }, false)).toBe('begin');
      expect(seam.profile.bindings).toEqual([]);   // the floor presses nothing: the source reads the body
      expect(seam.card.lines.map((l) => l.verb)).toEqual(['DRIVE', 'MOVE / SLIDE', 'CROSSOVER', 'SHOOT', 'BLOCK', 'CONTEST', 'STEAL', 'INTENSE D']);
    expect(seam.card.lines.find((l) => l.verb === 'STEAL')?.move).toBe('Reach at the ball');
    }
  });

  it('the hero slot merges the body into the pad (the agent bridge still replaces both); the role is the possession', () => {
    const one = readFileSync(join(ROOT, 'lib/babylon/modes/OneVOneMode.ts'), 'utf8');
    expect(one).toContain("meSlot = new PlayerSlot('me', agentCtl ?? new MergedControlSource(localSource, bodyCtl), true);");
    expect(one).toContain("role: () => (possession === 'mine' ? 'offense' : 'defense')");
    expect(one).toContain('body: COURT_BODY,');
    expect(one).toContain('bodyCtl?.see(ev, view) ?? false');
    const three = readFileSync(join(ROOT, 'lib/babylon/modes/ThreeVThreeMode.ts'), 'utf8');
    expect(three).toContain("new PlayerSlot('me', agentCtl ?? (bodyCtl ? new MergedControlSource(localSource, bodyCtl) : localSource), true)");
    expect(three).toContain("role: () => (carrierId === 'foeTeam' ? 'defense' : 'offense')");
    expect(three).toContain('body: COURT_BODY,');
    expect(three).toContain('bodyCtl?.see(ev, view) ?? false');
    // teammates stay AI: only the hero's slot takes the body
    expect(three.match(/MergedControlSource\(/g)?.length).toBe(1);
  });
});

// ── minors: body play's own rule (lib/move/bodyPlayGrownUp) holds for 1v1 and 3v3 ─────────────────────────────────
describe('a minor or an unknown age: the 1v1 / 3v3 camera waits for the grown-up step', () => {
  const NOW = new Date('2026-10-07T00:00:00Z');
  async function begin(modeId: string, age: { dobYear?: number | null; band?: '18+' | '13-17' | null }) {
    const { createBodyPlay } = await import('./bodyPlay');
    const { bodyPlayNeedsGrownUp } = await import('./bodyPlayGrownUp');
    const { sessionStore } = await import('@/lib/babylon/core/sessionStore');
    const calls: string[] = [];
    const writer = sessionStore.mount(bodySeamFor({ modeId, body: COURT_BODY, onBody: () => true }).card);
    writer.setPhase('playing');
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
      pauseGame: () => { calls.push('pause'); writer.setPhase('paused'); }, onPageHidden: () => {}, now: () => 0,
      needsGrownUp: () => bodyPlayNeedsGrownUp(age, NOW),
    });
    try {
      const action = await bp.button();   // the header's Body button, mid-game
      return { action, calls: [...calls], grownUp: bp.view().grownUp, ticked: await bp.confirmGrownUp(), after: [...calls] };
    } finally { writer.unmount(); }
  }

  it.each(['onevone', 'threevthree'])('%s, a 13-year-old: no camera and no pause until the grown-up ticks', async (modeId) => {
    const r = await begin(modeId, { dobYear: 2013 });
    expect(r.action).toBe('begin-paused');
    expect(r.calls).toEqual([]);
    expect(r.grownUp).toBe('ask');
    expect(r.ticked).toBe(true);
    expect(r.after).toContain('start');
  });

  it.each(['onevone', 'threevthree'])('%s, age unknown: the same wait', async (modeId) => {
    const r = await begin(modeId, {});
    expect(r.calls).toEqual([]);
    expect(r.grownUp).toBe('ask');
  });
});
