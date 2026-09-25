import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { restPose, moveJoints, synthesize, type Joints, type JointClip, type PoseFixture } from '../pose/synth';
import { BodyReader } from '../pose/BodyReader';
import { holdStill } from '../pose/streamKit';
import type { PoseFrame } from '../pose/landmarks';
import { DancePerformance } from '../babylon/core/DanceCore';
import type { Limb } from '../babylon/core/bodyTargets';
import {
  DrillRunner, RESTART_PHASE_MS, DRILL_ABANDON_MS, PRESENCE_GRACE_MS, NICE_STREAK, measuredSpm,
  type DrillBodyEvent, type LimbPositions, type DrillState, type DrillJudged,
} from './DrillRunner';
import { readerEventToDrill, KNEE_UP_FLEX_DEG, type ReaderEventLike, type ReaderFrameLike } from './fromReader';
import { alternate, repeat, drillTargetCount, type CoachPrompt, type Drill, type DrillPhase, type DrillTarget } from './chart';
import { DRILLS, POGO_BILATERAL, APPROACH_SPM } from './drills';

// ── a small simulated room ───────────────────────────────────────────────────────────────────────────────────────────

const TICK_MS = 1000 / 60;   // the display
const FRAME_MS = 1000 / 30;  // the camera
/** Capture → the app has the frame: the fixtures' latency model (synth latencyMs 66). */
const CAMERA_MS = 66;

interface Sent { ev: DrillBodyEvent; arrive: number }
interface Frame { t: number; pos: LimbPositions }
/** One frame of the body reader's output, as the camera page would hand it over. */
interface ReaderOut { arrive: number; read: ReaderFrameLike; events: ReaderEventLike[]; world?: ReaderFrameLike['world'] }
interface Sim { runner: DrillRunner; says: CoachPrompt[]; judged: DrillJudged[]; hits: DrillJudged[]; last: DrillState; endedAt: number | null }

/** Run a drill: body events delivered when they "arrive", limb frames CAMERA_MS after capture, the reader's output
 *  (read + events) when it arrives, the display ticking. */
function simulate(drill: Drill, o: {
  events?: Sent[]; frames?: Frame[]; reads?: ReaderOut[]; present?: (ms: number) => boolean; endMs?: number; latencyMs?: number;
} = {}): Sim {
  const runner = new DrillRunner(drill, { latencyMs: o.latencyMs ?? 0 });
  const events = [...(o.events ?? [])].sort((a, b) => a.arrive - b.arrive);
  const frames = [...(o.frames ?? [])].sort((a, b) => a.t - b.t);
  const reads = [...(o.reads ?? [])].sort((a, b) => a.arrive - b.arrive);
  const says: CoachPrompt[] = [];
  const judged: Sim['judged'] = [];
  const end = o.endMs ?? 1000 * (drill.phases.reduce((s, p) => s + p.durationSec, 0) + 5);
  let ei = 0, fi = 0, ri = 0;
  let last!: DrillState;
  let endedAt: number | null = null;
  for (let now = 0; now <= end; now += TICK_MS) {
    while (ri < reads.length && reads[ri].arrive <= now) runner.read(reads[ri++]);
    while (ei < events.length && events[ei].arrive <= now) runner.body(events[ei++].ev);
    while (fi < frames.length && frames[fi].t + CAMERA_MS <= now) { runner.limbs(frames[fi].t, frames[fi].pos); fi++; }
    last = runner.tick(now, o.present ? o.present(now) : true);
    says.push(...last.say);
    judged.push(...last.judged);
    if (last.status === 'complete' || last.status === 'abandoned') { endedAt = now; break; }
  }
  return { runner, says, judged, hits: judged.filter((j) => j.label !== 'MISS'), last, endedAt };
}

/** When each phase starts (ms), for a body that never leaves the frame and a drill clock started at 0. */
const phaseStarts = (d: Drill): number[] => {
  let off = 0;
  return d.phases.map((p) => { const s = off; off += p.durationSec * 1000; return s; });
};

/**
 * A player who does every target exactly on its beat, the way the camera side would report it: moves back-dated to
 * when they happened and arriving late (a take-off ~150 ms, a squat's bottom ~400 ms, a penultimate only at the take-off),
 * holds as a rest that began before the cue, touches as limb positions frame by frame. A squat HELD at the bottom is a
 * rest, low, confirmed REST_WINDOW_MS after it began; the reader's own dip for it comes only as the hips rise at the
 * end of the hold, stamped at the lowest sample, and must answer nothing.
 */
function perfectPlayer(d: Drill): { events: Sent[]; frames: Frame[] } {
  const events: Sent[] = [];
  const frames: Frame[] = [];
  const starts = phaseStarts(d);
  d.phases.forEach((p, pi) => {
    const at = (t: DrillTarget) => starts[pi] + t.t * 1000;
    p.targets.forEach((t, i) => {
      const T = at(t);
      const ev = { kind: t.move, ...(t.limb ? { limb: t.limb } : {}), t: T } as DrillBodyEvent;
      switch (t.move) {
        case 'hold': events.push({ ev: { ...ev, t: T - 400 }, arrive: T + 400 }); break;
        case 'squat':
          if (t.holdSec) {
            events.push({ ev: { kind: 'hold', limb: 'feet', depthM: 0.3, t: T - 100 }, arrive: T + 600 + CAMERA_MS });
            events.push({ ev: { kind: 'squat', t: T + 1000 * t.holdSec * 0.6 }, arrive: T + 1000 * t.holdSec + 300 });
          } else events.push({ ev, arrive: T + 400 });
          break;
        case 'penultimate': {
          const off = p.targets.slice(i).find((x) => x.move === 'jump')!;
          events.push({ ev, arrive: at(off) + 100 });
          break;
        }
        case 'touch': {
          const limb: Limb = t.limb === 'hands' ? 'handL' : t.limb!;
          for (let f = T - 150; f <= T + 100; f += FRAME_MS) frames.push({ t: f, pos: { [limb]: { ...t.zone! } } });
          break;
        }
        default: events.push({ ev, arrive: T + 150 });
      }
    });
  });
  return { events, frames };
}

const mini = (targets: DrillTarget[], over: Partial<DrillPhase> = {}): Drill => ({
  id: 'mini', name: 'Mini', blurb: '', checks: [],
  source: { book: 'playbook', chapter: 6, section: 'Drill 3: The Safe Landing Check' },
  phases: [{
    id: 'p', name: 'P', durationSec: 20, presence: 'required', cue: 'go', targets,
    prompts: [{ t: 0, id: 'coach.drill.intro' }], ...over,
  }],
});

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, '..', 'pose', '__fixtures__', `${name}.json`), 'utf8')) as PoseFixture;
const side = (f: 'left' | 'right'): 'footL' | 'footR' => (f === 'left' ? 'footL' : 'footR');

// ── every drill, played perfectly ────────────────────────────────────────────────────────────────────────────────────

describe('a perfect player scores every drill: the charts are playable as written', () => {
  for (const d of DRILLS) {
    it(d.id, () => {
      const { runner, says } = simulate(d, perfectPlayer(d));
      const r = runner.result();
      expect(r.status).toBe('complete');
      expect(r.counts).toEqual({ PERFECT: drillTargetCount(d), GREAT: 0, GOOD: 0, MISS: 0 });
      const holds = d.phases.flatMap((p) => p.targets).filter((t) => t.holdSec).length;
      expect(r.phases.reduce((n, p) => n + p.holds.held, 0)).toBe(holds);
      expect(r.phases.reduce((n, p) => n + p.holds.broken, 0)).toBe(0);
      expect(r.accuracy).toBe(drillTargetCount(d) ? 1 : null);
      // every chart line, in order (the coach's reactive lines may sit between them)
      const chart = d.phases.flatMap((p) => p.prompts.map((x) => x.id));
      expect(says.filter((x) => !['coach.drill.nice', 'coach.drill.faster', 'coach.drill.slower'].includes(x))).toEqual(chart);
      for (const p of r.phases) {
        expect(p.attempts).toBe(1);
        if (p.targets === 0) expect(p.accuracy).toBeNull();       // a guided phase or a rest is unread, not 0
        if (p.cadence) expect(p.cadence.stats.fault).toBe(0);
      }
    });
  }
});

// ── the owner's streams (lib/pose/__fixtures__ ground truth as body events) ─────────────────────────────────────────

describe('scored on the fixture streams\' ground truth', () => {
  const run = fixture('run_in_place');
  const downs = run.gt.steps.filter((s) => s.down).map((s) => ({ t: s.down!.t, limb: side(s.foot) })).sort((a, b) => a.t - b.t);

  it('running in place never scores a pogo: the steps are ignored, not counted as jumps (the old judge took them)', () => {
    const set = POGO_BILATERAL.phases[0];
    const start = set.targets[0].t * 1000;
    const events = downs.map((s) => ({ ev: { kind: 'step' as const, limb: s.limb, t: start + (s.t - downs[0].t) }, arrive: start + (s.t - downs[0].t) + 150 }));
    const { runner, hits } = simulate(POGO_BILATERAL, { events, endMs: 18_000 });
    expect(hits).toHaveLength(0);
    expect(runner.result().phases[0].counts).toEqual({ PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 20 });
    // the press judge the dance mode uses scores the same steps against the same beats
    const pad = new DancePerformance(60);
    pad.setRoutine(set.targets.map((t) => ({ clipId: 'x', beat: t.t, holdBeats: 0, mirrored: false })));
    pad.start(0);
    let padHits = 0;
    for (const e of events) { pad.update(e.ev.t / 1000); if (pad.hit(e.ev.t / 1000) !== 'MISS') padHits++; }
    expect(padHits).toBeGreaterThan(5);
  });

  it('the same run in place scores a step chart at 180 a minute, foot by foot, and reads its cadence', () => {
    const iv = 60 / APPROACH_SPM;
    const first = 6;
    const chart = mini(alternate(first, downs.length, iv, 'L', 'step', 'RUN'), {
      durationSec: 12, cadence: { stepsPerMin: APPROACH_SPM, windows: [[first - 0.5, 11]] },
    });
    const events = downs.map((s) => {
      const t = first * 1000 + (s.t - downs[0].t);
      return { ev: { kind: 'step' as const, limb: s.limb, t }, arrive: t + 150 };
    });
    const { runner } = simulate(chart, { events });
    const p = runner.result().phases[0];
    expect(p.counts.MISS).toBe(0);
    expect(p.counts.PERFECT + p.counts.GREAT).toBeGreaterThanOrEqual(downs.length - 3);   // the CMU runner (143_04) drifts ±70 ms
    expect(p.cadence!.steps).toBe(downs.length);
    expect(p.cadence!.stats.fault).toBe(0);                     // he alternates
    expect(p.cadence!.measuredSpm!).toBeGreaterThan(170);
    expect(p.cadence!.measuredSpm!).toBeLessThan(185);
    expect(p.cadence!.measuredSpm!).toBeCloseTo(measuredSpm(downs.map((d) => d.t))!, 6);
  });

  it('the owner\'s four jumps land a pogo-style chart at their own pace: take-offs judged, landings paired, steps ignored', () => {
    const jumps = fixture('jump_two_foot_low');
    const offs = jumps.gt.jumps.map((j) => j.takeoff.t);
    const period = (offs[offs.length - 1] - offs[0]) / (offs.length - 1) / 1000;
    const first = 6;
    const chart = mini(repeat(first, offs.length, period, { move: 'jump', limb: 'feet', label: 'JUMP' }));
    const shift = (t: number) => first * 1000 + (t - offs[0]);
    const events: Sent[] = [
      ...jumps.gt.jumps.map((j) => ({ ev: { kind: 'jump' as const, limb: 'feet' as const, t: shift(j.takeoff.t) }, arrive: shift(j.takeoff.t) + 150 })),
      ...jumps.gt.jumps.map((j) => ({ ev: { kind: 'land' as const, limb: 'feet' as const, t: shift(j.landing.t) }, arrive: shift(j.landing.t) + 150 })),
      ...jumps.gt.steps.filter((s) => s.down).map((s) => ({ ev: { kind: 'step' as const, limb: side(s.foot), t: shift(s.down!.t) }, arrive: shift(s.down!.t) + 150 })),
    ];
    const { hits: judged, runner } = simulate(chart, { events });
    // the third jump comes 71 ms early against an even beat; the others are within a frame or two
    expect(judged.map((j) => j.label)).toEqual(['PERFECT', 'PERFECT', 'GREAT', 'PERFECT']);
    expect(runner.result().phases[0].counts.MISS).toBe(0);
  });

  it('BodyReader-shaped events map onto drill moves by shape', () => {
    expect(readerEventToDrill({ kind: 'takeoff', t: 5, feet: 'two', foot: 'both' })).toEqual({ kind: 'jump', limb: 'feet', t: 5 });
    expect(readerEventToDrill({ kind: 'takeoff', t: 5, feet: 'one', foot: 'L' })).toEqual({ kind: 'jump', limb: 'footL', t: 5 });
    expect(readerEventToDrill({ kind: 'land', t: 6, firstFoot: 'R' })).toEqual({ kind: 'land', limb: 'footR', t: 6 });
    expect(readerEventToDrill({ kind: 'dip', t: 7 })).toEqual({ kind: 'squat', t: 7 });
    expect(readerEventToDrill({ kind: 'step', t: 8, foot: 'R' })).toEqual({ kind: 'step', limb: 'footR', t: 8 });
    expect(readerEventToDrill({ kind: 'penultimate', t: 9, foot: 'L' })).toEqual({ kind: 'penultimate', limb: 'footL', t: 9 });
    expect(readerEventToDrill({ kind: 'punch', t: 10, hand: 'L' })).toEqual({ kind: 'punch', limb: 'handL', t: 10 });
    expect(readerEventToDrill({ kind: 'kick', t: 11, foot: 'R' })).toEqual({ kind: 'kick', limb: 'footR', t: 11 });
    for (const kind of ['apex', 'reach', 'strike', 'release', 'lost', 'found', 'somethingNew']) expect(readerEventToDrill({ kind, t: 1 })).toBeNull();
  });
});

// ── the clock: in frame, paused, restarted, abandoned ────────────────────────────────────────────────────────────────

describe('the drill clock only runs while the body is in frame', () => {
  const jumps = mini(repeat(6, 5, 2, { move: 'jump', limb: 'feet' }));

  it('does not start until the body is in frame', () => {
    const { last } = simulate(jumps, { present: (ms) => ms > 3000, endMs: 5000 });
    expect(last.status).toBe('running');
    expect(last.drillSec).toBeGreaterThan(1.9);
    expect(last.drillSec).toBeLessThan(2.1);
  });

  it('a dropped frame or two does not pause it', () => {
    const blink = (ms: number) => !(ms > 4000 && ms < 4000 + PRESENCE_GRACE_MS - 50);
    const { last } = simulate(jumps, { present: blink, endMs: 5000 });
    expect(last.status).toBe('running');
    expect(last.drillSec).toBeCloseTo(5, 1);
  });

  it('leaving pauses it where the body was last seen; the chart waits; coming back resumes, and a target due in the absence is still there', () => {
    // gone from 5 s to 8 s (3 s: under the restart). The clock stops at the last tick that saw the body, not
    // PRESENCE_GRACE_MS later, so the jump due at 6 s of drill time comes ~3 s late on the wall clock
    const present = (ms: number) => ms < 5000 || ms > 8000;
    const lastSeen = Math.floor(5000 / TICK_MS - 1e-9) * TICK_MS;       // the last tick before 5 s
    const back = Math.ceil(8000 / TICK_MS + 1e-9) * TICK_MS;           // the first tick after 8 s
    const gone = back - lastSeen;
    const T = 6000 + gone;
    const { runner, hits: judged, last } = simulate(jumps, {
      present, endMs: 10_000,
      events: [
        { ev: { kind: 'jump', limb: 'feet', t: 6000 }, arrive: 6150 },   // while gone: no clock ran, ignored
        { ev: { kind: 'jump', limb: 'feet', t: T }, arrive: T + 150 },
      ],
    });
    expect(judged.map((j) => j.label)).toEqual(['PERFECT']);
    expect(last.drillSec).toBeCloseTo(10 - gone / 1000, 1);
    expect(runner.result().phases[0].attempts).toBe(1);
  });

  it('gone longer than the screen\'s restart rule and the phase starts again from its top', () => {
    const present = (ms: number) => ms < 7000 || ms > 7000 + RESTART_PHASE_MS + 1000;
    const { runner, says } = simulate(jumps, {
      present, endMs: 16_000,
      events: [{ ev: { kind: 'jump', limb: 'feet', t: 6000 }, arrive: 6150 }],    // scored in the first attempt
    });
    const p = runner.result().phases[0];
    expect(p.attempts).toBe(2);
    expect(p.counts.PERFECT).toBe(0);                            // the discarded attempt's hit is not carried over
    expect(says.filter((x) => x === 'coach.drill.intro')).toHaveLength(2);
  });

  it('gone a minute and the drill is abandoned, keeping what finished', () => {
    const present = (ms: number) => ms < 20_000;              // leaves during the first rest, never comes back
    const { runner, last, endedAt } = simulate(POGO_BILATERAL, { present, endMs: 200_000 });
    expect(last.status).toBe('abandoned');
    const r = runner.result();
    expect(r.status).toBe('abandoned');
    expect(r.phases[0].finished).toBe(true);
    expect(r.phases[1].finished).toBe(true);                   // the rest ran without the body
    expect(r.phases[2].finished).toBe(false);
    expect(r.phases[0].counts.MISS).toBe(20);                  // what finished is kept
    // a minute after set 2's clock needed the body (17 s set + 60 s rest), not a minute after they walked off at 20 s
    const set2Start = (17 + 60) * 1000;
    expect(endedAt!).toBeGreaterThanOrEqual(set2Start + DRILL_ABANDON_MS);
    expect(endedAt!).toBeLessThan(set2Start + DRILL_ABANDON_MS + 100);
    expect(last.drillSec).toBeLessThan(17 + 60 + 1);
  });
});

// ── holds, landings, latency, touches, the coach ─────────────────────────────────────────────────────────────────────

describe('holds, landings, latency, touches and the coach', () => {
  it('a stuck landing is held; a step during it breaks it; the second foot settling does not', () => {
    const d = mini([
      { t: 6, move: 'land', limb: 'feet', holdSec: 2 },
      { t: 10, move: 'land', limb: 'feet', holdSec: 2 },
    ]);
    const { runner } = simulate(d, {
      events: [
        { ev: { kind: 'land', limb: 'feet', t: 6000 }, arrive: 6150 },
        { ev: { kind: 'step', limb: 'footR', t: 6080 }, arrive: 6230 },    // the settle: not a break
        { ev: { kind: 'land', limb: 'feet', t: 10_000 }, arrive: 10_150 },
        { ev: { kind: 'step', limb: 'footL', t: 11_000 }, arrive: 11_150 }, // stepped out of it
      ],
    });
    expect(runner.result().phases[0].holds).toEqual({ held: 1, broken: 1 });
  });

  it('a hold target is on time when the body was already in position, late when it settles after the cue', () => {
    const d = mini([
      { t: 6, move: 'hold', limb: 'footL', holdSec: 2 },
      { t: 12, move: 'hold', limb: 'footR', holdSec: 2 },
    ]);
    const events: Sent[] = [
      { ev: { kind: 'hold', limb: 'footL', t: 4000 }, arrive: 4800 },     // on the left foot two seconds early
      { ev: { kind: 'step', limb: 'footL', t: 9000 }, arrive: 9150 },
      { ev: { kind: 'hold', limb: 'footR', t: 12_300 }, arrive: 13_100 }, // settled 0.3 s after the cue
    ];
    // a hold event answers nothing by itself: it is credited on the tick, on time or as late as the settling was
    const direct = new DrillRunner(d);
    direct.tick(0, true);
    direct.tick(5000, true);
    expect(direct.body(events[0].ev)).toBeNull();
    const sim = simulate(d, { events });
    expect(sim.hits.map((j) => j.label)).toEqual(['PERFECT', 'GREAT']);
    const r = sim.runner.result().phases[0];
    expect(r.counts.PERFECT).toBe(1);
    expect(r.counts.GREAT).toBe(1);                                         // 0.3 s late on a ×5 window
    expect(r.meanDeltaMs).toBeNull();                                       // a hold cannot be early: it is no habit
  });

  it('a two-foot landing a frame apart is two-footed; one foot alone answers only a single-leg stick', () => {
    const d = mini([
      { t: 6, move: 'land', limb: 'feet', holdSec: 1 },
      { t: 10, move: 'land', limb: 'footL', holdSec: 1 },
      { t: 14, move: 'land', limb: 'feet', holdSec: 1 },
    ]);
    const { hits: judged, runner } = simulate(d, {
      events: [
        { ev: { kind: 'land', limb: 'footL', t: 6000 }, arrive: 6150 },
        { ev: { kind: 'step', limb: 'footR', t: 6040 }, arrive: 6190 },     // the second foot 40 ms later
        { ev: { kind: 'land', limb: 'footL', t: 10_000 }, arrive: 10_150 },  // alone: the stick
        { ev: { kind: 'step', limb: 'footR', t: 13_960 }, arrive: 14_100 },  // the second foot FIRST, 40 ms before …
        { ev: { kind: 'land', limb: 'footL', t: 14_000 }, arrive: 14_150 },  // … the landing it pairs with
      ],
    });
    expect(judged.map((j) => j.label)).toEqual(['PERFECT', 'PERFECT', 'PERFECT']);
    expect(runner.result().phases[0].counts.MISS).toBe(0);
    const alone = simulate(mini([{ t: 6, move: 'land', limb: 'feet', holdSec: 1 }]), {
      events: [{ ev: { kind: 'land', limb: 'footL', t: 6000 }, arrive: 6150 }],
    });
    expect(alone.runner.result().phases[0].counts.MISS).toBe(1);
  });

  it('camera latency: a player 100 ms behind the display scores PERFECT once the latency is set', () => {
    const d = mini(repeat(6, 4, 1, { move: 'punch', limb: 'handR' }));
    const events = [6, 7, 8, 9].map((s) => ({ ev: { kind: 'punch' as const, limb: 'handR' as const, t: s * 1000 + 100 }, arrive: s * 1000 + 250 }));
    expect(simulate(d, { events }).hits.map((j) => j.label)).toEqual(['GOOD', 'GOOD', 'GOOD', 'GOOD']);
    expect(simulate(d, { events, latencyMs: 100 }).hits.map((j) => j.label)).toEqual(['PERFECT', 'PERFECT', 'PERFECT', 'PERFECT']);
  });

  it('touches from limb positions: arrive early and wait = on time; pass through early = early; wrong hand = nothing', () => {
    const zone = { x: 0.28, y: 0.78 };
    const d = mini([
      { t: 6, move: 'touch', limb: 'handL', zone },
      { t: 9, move: 'touch', limb: 'handL', zone },
      { t: 12, move: 'touch', limb: 'handL', zone },
    ]);
    const frames: Frame[] = [];
    for (let f = 5700; f <= 6300; f += FRAME_MS) frames.push({ t: f, pos: { handL: zone } });                      // waits there
    for (let f = 8820; f <= 8880; f += FRAME_MS) frames.push({ t: f, pos: { handL: zone } });                      // through, early
    for (let f = 8890; f <= 9300; f += FRAME_MS) frames.push({ t: f, pos: { handL: { x: 0.6, y: 0.4 } } });
    for (let f = 11_700; f <= 12_300; f += FRAME_MS) frames.push({ t: f, pos: { handR: zone } });                 // wrong hand
    const { hits: judged, runner } = simulate(d, { frames });
    expect(judged).toHaveLength(2);
    expect(judged[0].label).toBe('PERFECT');
    expect(judged[1].deltaMs).toBeLessThan(-90);
    expect(runner.result().phases[0].counts.MISS).toBe(1);
  });

  it('the coach: "nice" after a clean streak, "faster" when the steps drag, never on top of a chart line', () => {
    const streak = mini(repeat(6, NICE_STREAK, 0.6, { move: 'punch', limb: 'handL' }));
    const events = streak.phases[0].targets.map((t) => ({ ev: { kind: 'punch' as const, limb: 'handL' as const, t: t.t * 1000 }, arrive: t.t * 1000 + 150 }));
    expect(simulate(streak, { events }).says).toContain('coach.drill.nice');

    const slow = mini([], { cadence: { stepsPerMin: 180, windows: [[5, 15]] } });
    const iv = 60_000 / 150;                                    // 150 a minute against 180
    const steps = Array.from({ length: 12 }, (_, k) => ({
      ev: { kind: 'step' as const, limb: (k % 2 ? 'footR' : 'footL') as Limb, t: 6000 + k * iv }, arrive: 6150 + k * iv,
    }));
    const r = simulate(slow, { events: steps });
    expect(r.hits).toHaveLength(0);                            // a cadence window scores no targets of its own
    expect(r.says).toContain('coach.drill.faster');
    expect(r.says).not.toContain('coach.drill.slower');
    expect(r.runner.result().phases[0].cadence!.measuredSpm).toBeCloseTo(150, 6);
  });

  it('the lane shows the phase\'s next targets with their moves while it runs', () => {
    const d = mini([{ t: 6, move: 'jump', limb: 'feet', label: 'POGO' }, { t: 7, move: 'touch', limb: 'handL', zone: { x: 0.3, y: 0.5 } }]);
    const { last } = simulate(d, { endMs: 5000 });
    expect(last.cues.map((c) => c.move)).toEqual(['jump', 'touch']);
    expect(last.cues[0].name).toBe('POGO');
    expect(last.cues[1].zone).toEqual({ x: 0.3, y: 0.5, limb: 'handL' });
    expect(last.cues[0].in).toBeCloseTo(1, 1);
  });
});

// ── the reader's own output: its events AND its per-frame read (fromReader FrameMoves) ──────────────────────────────

/** A stream through the body reader, each frame's read and events arriving on its latency model, shifted by shiftMs,
 *  after a 1.5 s still stand the reader calibrates on. */
function throughReader(frames: PoseFrame[], shiftMs: number): ReaderOut[] {
  const r = new BodyReader();
  const stand = holdStill(frames.find((f) => f.present)!, { sec: 1.5, fps: 30, beforeT: frames[0].t });
  return [...stand, ...frames].map((f) => {
    const { read, events } = r.read(f);
    return {
      arrive: (f.arrive ?? f.t + CAMERA_MS) + shiftMs,
      read: { ...read, t: read.t + shiftMs },
      events: events.map((e) => ({ ...e, t: e.t + shiftMs })),
    };
  });
}

/** Two-foot pogos in place: the rest pose bounced ballistically, a stiff 3 cm give at each contact (120 fps source). */
function pogoClip(contactSec: number, flightSec: number, n: number, leadSec: number): JointClip {
  const fps = 120, base = restPose(), g = 9.81, v0 = (g * flightSec) / 2, period = contactSec + flightSec;
  const feet = new Set(['LeftFoot', 'LeftToe', 'RightFoot', 'RightToe']);
  const frames: Joints[] = [];
  for (let k = 0; k < (leadSec + n * period + 1) * fps; k++) {
    const t = k / fps;
    let lift = 0, give = 0;
    if (t >= leadSec && t < leadSec + n * period) {
      const u = (t - leadSec) % period;
      if (u < contactSec) give = 0.03 * Math.sin((Math.PI * u) / contactSec);
      else lift = v0 * (u - contactSec) - 0.5 * g * (u - contactSec) ** 2;
    }
    const j = moveJoints(base, [0, lift, 0]);
    for (const name of Object.keys(j) as (keyof Joints)[]) {
      if (!give || feet.has(name)) continue;
      const share = name === 'LeftLeg' || name === 'RightLeg' ? 0.5 : 1;
      j[name] = [j[name][0], j[name][1] - give * share, j[name][2]];
    }
    frames.push(j);
  }
  return { fps, frames };
}

describe('the reader\'s per-frame read: landings, pogos, holds, knees', () => {
  it('the owner\'s two-foot landings answer a two-foot target and not a single-leg stick once the frames pair the feet', () => {
    // Measured 2026-09-24 on the reader's events alone: the reader calls a landing two-footed only with the second foot
    // inside one frame (LAND_BOTH_MS 34); the owner's second foot is 0–108 ms behind, so it called 4 of these 7
    // one-footed, and it never tells that foot as a step, so nothing paired it: 3 of 7 answered "both feet" and 4 of 7
    // answered a RIGHT-FOOT STICK they were not. (Not pinned here: the reader is its own lane's to improve.)
    const SHIFT = 5000;
    const score = (limb: Limb) => {
      let n = 0;
      for (const name of ['jump_two_foot_low', 'jump_two_foot_high']) {
        const f = fixture(name);
        const stream = throughReader(f.frames, SHIFT);
        const d = mini(f.gt.jumps.map((j) => ({ t: (j.landing.t + SHIFT) / 1000, move: 'land' as const, limb })), { durationSec: 12 });
        n += simulate(d, { reads: stream }).hits.length;
      }
      return n;
    };
    // with the frames: all but one (its second foot 100 ms behind even at the crossing, on LAND_PAIR_SEC's line)
    const both = score('feet');
    expect(both).toBeGreaterThanOrEqual(6);
    expect(score('footR') + score('footL')).toBeLessThanOrEqual(7 - both);
  });

  it('low pogos score from the frames\' contacts, under the reader\'s 250 ms jump floor', () => {
    // 0.25 s flights (~8 cm) at two a second, the chart's POGO_SEC. Measured 2026-09-24: the reader's own take-offs
    // scored none of these ten (not pinned: the reader is its own lane's to improve)
    const syn = synthesize(pogoClip(0.25, 0.25, 10, 2), { seed: 1 });
    const offs = syn.gt.flights.map((j) => j.takeoff.t);
    expect(offs).toHaveLength(10);
    const SHIFT = 4000;
    const stream = throughReader(syn.frames, SHIFT);
    const d = mini(offs.map((t) => ({ t: (t + SHIFT) / 1000, move: 'jump' as const, limb: 'feet' as const })), { durationSec: 12 });
    const read = simulate(d, { reads: stream });
    expect(read.hits.length).toBeGreaterThanOrEqual(9);
    expect(read.hits.every((h) => Math.abs(h.deltaMs!) <= 60)).toBe(true);
    // and running in place is still no pogo, frames or not
    const run = fixture('run_in_place');
    const runChart = mini(Array.from({ length: 6 }, (_, k) => ({ t: 6 + k * 0.5, move: 'jump' as const, limb: 'feet' as const })), { durationSec: 12 });
    expect(simulate(runChart, { reads: throughReader(run.frames, 5000) }).hits).toHaveLength(0);
  });
});

/** Hand-made BodyRead frames (30 fps): feet contacts and heights, hips, knees; standing = both feet down, hips 0.95 m. */
interface Pose { L?: boolean; R?: boolean; hip?: number; x?: number; kneeL?: number; kneeR?: number }
function readsOf(fromMs: number, toMs: number, pose: (t: number) => Pose): ReaderOut[] {
  const out: ReaderOut[] = [];
  for (let t = fromMs; t < toMs; t += FRAME_MS) {
    const p = pose(t);
    const foot = (down: boolean | undefined) => ({ heightM: down === false ? 0.12 : 0, contact: down !== false });
    out.push({
      arrive: t + CAMERA_MS, events: [],
      read: {
        t, tracking: true, rulers: { hipHeightM: 0.95, mPerX: 4 }, hip: { x: p.x ?? 0.5, heightM: p.hip ?? 0.95 },
        feet: { L: foot(p.L), R: foot(p.R) }, knee: { L: { drive: p.kneeL ?? 0 }, R: { drive: p.kneeR ?? 0 } },
      },
    });
  }
  return out;
}

describe('holds, sticks and knees from the frames', () => {
  it('a squat held at the bottom scores from the rest, low; the reader\'s dip (told as the hips rise) answers nothing', () => {
    const d = mini([{ t: 7, move: 'squat', holdSec: 3, label: 'BOTTOM' }], { durationSec: 14 });
    // down over 5–7 s to 0.30 m under standing, still until the hold is done or until `upAt`, then up
    const squat = (upAt: number) => (t: number): Pose => {
      const s = t / 1000;
      const low = 0.65;
      if (s < 5) return {};
      if (s < 7) return { hip: 0.95 - 0.3 * (1 - Math.cos((Math.PI * (s - 5)) / 2)) / 2 };
      if (s < upAt) return { hip: low };
      return { hip: Math.min(0.95, low + 0.2 * (s - upAt)) };
    };
    const dip: Sent = { ev: { kind: 'squat', t: 9500 }, arrive: 10_400 };   // the lowest sample, told once risen 2 cm
    // before: the dip alone comes 3 s after the bottom and is a MISS
    expect(simulate(d, { events: [dip] }).runner.result().phases[0].counts.MISS).toBe(1);
    const held = simulate(d, { reads: readsOf(0, 13_000, squat(10)), events: [dip] });
    expect(held.hits.map((h) => h.label)).toEqual(['PERFECT']);
    expect(held.runner.result().phases[0].holds).toEqual({ held: 1, broken: 0 });
    // up after 1.5 s of the 3: the hold is broken
    const early = simulate(d, { reads: readsOf(0, 13_000, squat(8.5)) });
    expect(early.hits).toHaveLength(1);
    expect(early.runner.result().phases[0].holds).toEqual({ held: 0, broken: 1 });
  });

  it('a one-foot stick is broken by the free foot coming down; inside the pair window it was a two-foot landing', () => {
    const land = (t: number): Sent => ({ ev: { kind: 'land', limb: 'footL', t }, arrive: t + 150 });
    // in the air 5.6–6.0 s, down on the left at 6.0, the right foot down at `rightAt` (ms)
    const flight = (rightAt: number) => (t: number): Pose => (t >= 5600 && t < 6000 ? { L: false, R: false } : t >= 6000 && t < rightAt ? { R: false } : {});
    const stick = mini([{ t: 6, move: 'land', limb: 'footL', holdSec: 2 }], { durationSec: 12 });
    const both = mini([{ t: 6, move: 'land', limb: 'feet', holdSec: 2 }], { durationSec: 12 });
    const run = (d: Drill, rightAt: number) => simulate(d, { reads: readsOf(0, 11_000, flight(rightAt)), events: [land(6000)] });

    const kept = run(stick, 8600);                           // held 2 s on the left, then down
    expect(kept.hits.map((h) => h.label)).toEqual(['PERFECT']);
    expect(kept.runner.result().phases[0].holds).toEqual({ held: 1, broken: 0 });
    const dropped = run(stick, 6800);                        // the right foot down 0.8 s in
    expect(dropped.runner.result().phases[0].holds).toEqual({ held: 0, broken: 1 });
    // the right foot down 1.5 frames after the left: a two-foot landing, so no stick at all, and a two-foot target's hit
    expect(run(stick, 6050).runner.result().phases[0].counts.MISS).toBe(1);
    expect(run(both, 6050).hits.map((h) => h.label)).toEqual(['PERFECT']);
    // before the frames: nothing ever told the free foot's touch-down, so the dropped stick counted as held
    const blind = simulate(stick, { events: [land(6000)] });
    expect(blind.runner.result().phases[0].holds).toEqual({ held: 1, broken: 0 });
  });

  it('a knee driven to hip height scores its own side on time; the other knee answers nothing', () => {
    const d = mini([{ t: 6, move: 'knee', limb: 'kneeL' }, { t: 8, move: 'knee', limb: 'kneeR' }], { durationSec: 12 });
    // the left knee sweeps up through 0.8 of its drive at exactly 6.0 s, and again at 8.0 s (the right never moves)
    const drive = (t: number, at: number) => Math.max(0, Math.min(1, 0.8 + (t - at) / 125));
    const pose = (t: number): Pose => ({ R: false, kneeL: t < 7000 ? drive(t, 6000) : 1 - drive(t, 7200) + drive(t, 8000) });
    const r = simulate(d, { reads: readsOf(0, 11_000, pose) });
    expect(r.hits.map((h) => h.label)).toEqual(['PERFECT']);
    expect(r.hits[0].move).toBe('knee');
    expect(r.runner.result().phases[0].counts.MISS).toBe(1);
  });

  it('a Wall Drive leaning into the wall: the knee is read against the trunk, where the vertical never sees it rise', () => {
    // side-on, the body a ramp at 45°: the standing thigh runs back along it, the driven one square to it. Both put the
    // knee 0.32 m under the hip, so BodyRead.knee.drive reads 0.29 at rest and at the top of the drive alike
    const THIGH = 0.45, LEAN = Math.PI / 4;
    const d = mini([{ t: 6, move: 'knee', limb: 'kneeL' }], { durationSec: 12 });
    const flexAt = (t: number) => Math.max(0, Math.min(90, KNEE_UP_FLEX_DEG + (t - 6000) / 5));   // through 78° at 6.0 s
    const world = (t: number) => {
      const w = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
      const trunk = { x: Math.sin(LEAN) * 0.5, y: -Math.cos(LEAN) * 0.5 };           // hip → shoulders (y down)
      for (const [i, z] of [[11, -0.2], [12, 0.2]] as const) w[i] = { x: trunk.x, y: trunk.y, z };
      for (const [i, z] of [[23, -0.1], [24, 0.1]] as const) w[i] = { x: 0, y: 0, z };
      // the thigh: back along the ramp (standing), rotated forward by the flexion
      const ang = (dir: { x: number; y: number }, rad: number) => ({ x: dir.x * Math.cos(rad) - dir.y * Math.sin(rad), y: dir.x * Math.sin(rad) + dir.y * Math.cos(rad) });
      const down = { x: -Math.sin(LEAN), y: Math.cos(LEAN) };                         // back along the ramp
      const left = ang(down, -(flexAt(t) * Math.PI) / 180);
      w[25] = { x: left.x * THIGH, y: left.y * THIGH, z: -0.1 };
      w[26] = { x: down.x * THIGH, y: down.y * THIGH, z: 0.1 };
      return w;
    };
    const reads = readsOf(0, 11_000, () => ({ R: false, kneeL: 0.29, kneeR: 0.29 }));
    const blind = simulate(d, { reads });
    expect(blind.hits).toHaveLength(0);
    const withWorld = simulate(d, { reads: reads.map((o) => ({ ...o, world: world(o.read.t) })) });
    expect(withWorld.hits.map((h) => h.label)).toEqual(['PERFECT']);
    // the standing leg on the ramp is 0° of flexion, not a knee
    expect(withWorld.runner.result().phases[0].counts.MISS).toBe(0);
  });

  it('a body already at rest when a phase opens is in position for its first hold (the rest is the body\'s, not the phase\'s)', () => {
    const d: Drill = {
      ...mini([]),
      phases: [
        { id: 'a', name: 'A', durationSec: 5, presence: 'required', cue: 'stand', targets: [], prompts: [{ t: 0, id: 'coach.drill.intro' }] },
        { id: 'b', name: 'B', durationSec: 8, presence: 'required', cue: 'hold', targets: [{ t: 3, move: 'hold', limb: 'feet', holdSec: 2 }], prompts: [] },
      ],
    };
    const r = simulate(d, { reads: readsOf(0, 14_000, () => ({})) });   // standing still throughout
    expect(r.hits.map((h) => h.label)).toEqual(['PERFECT']);
    expect(r.runner.result().phases[1].holds).toEqual({ held: 1, broken: 0 });
  });
});

describe('the clock and the result after leaving, and impossible settings', () => {
  it('an abandoned drill scores the phases it finished, not the few hits of the one it was abandoned in', () => {
    const d: Drill = {
      ...mini([]),
      phases: [
        { id: 'a', name: 'A', durationSec: 10, presence: 'required', cue: 'go', targets: repeat(6, 2, 2, { move: 'jump', limb: 'feet' }), prompts: [{ t: 0, id: 'coach.drill.intro' }] },
        { id: 'b', name: 'B', durationSec: 30, presence: 'required', cue: 'go', targets: repeat(3, 10, 2, { move: 'jump', limb: 'feet' }), prompts: [] },
      ],
    };
    const jump = (ms: number): Sent => ({ ev: { kind: 'jump', limb: 'feet', t: ms }, arrive: ms + 150 });
    // phase A: one of its two; phase B: its first three, then gone for good
    const { runner, last } = simulate(d, {
      events: [jump(6000), jump(13_000), jump(15_000), jump(17_000)],
      present: (ms) => ms < 18_000, endMs: 90_000,
    });
    expect(last.status).toBe('abandoned');
    const r = runner.result();
    expect(r.phases[1].counts.PERFECT).toBe(3);             // kept for the record, per phase …
    expect(r.phases[1].finished).toBe(false);
    expect(r.counts).toEqual({ PERFECT: 1, GREAT: 0, GOOD: 0, MISS: 1 });   // … but the drill is scored on A alone
    expect(r.accuracy).toBe(0.5);
  });

  it('an impossible latency or pose rate is refused, not used: the judging is the unmeasured default', () => {
    const d = mini(repeat(6, 4, 1, { move: 'punch', limb: 'handR' }));
    const events = [6, 7, 8, 9].map((s) => ({ ev: { kind: 'punch' as const, limb: 'handR' as const, t: s * 1000 + 100 }, arrive: s * 1000 + 250 }));
    const labels = (o: { latencyMs?: number; poseHz?: number }) => {
      const runner = new DrillRunner(d, o);
      let ei = 0;
      const out: string[] = [];
      for (let now = 0; now <= 25_000; now += TICK_MS) {
        while (ei < events.length && events[ei].arrive <= now) runner.body(events[ei++].ev);
        out.push(...runner.tick(now, true).judged.map((j) => j.label));
      }
      return out;
    };
    const plain = ['GOOD', 'GOOD', 'GOOD', 'GOOD'];
    for (const latencyMs of [NaN, -100, 5000, Infinity]) expect(labels({ latencyMs }), `latency ${latencyMs}`).toEqual(plain);
    for (const poseHz of [0, -30, NaN]) expect(labels({ poseHz }), `rate ${poseHz}`).toEqual(plain);
    const p = new DancePerformance(60);
    p.setBody({ latencySec: 0.1, poseHz: 24, aspect: 0.75 });
    p.setBody({ latencySec: NaN, poseHz: 0, aspect: -1 });
    expect([p.bodyLatencySec, p.poseHz, p.aspect]).toEqual([0.1, 24, 0.75]);
  });

  it('zones are round on the camera frame it was given: a portrait phone\'s frame is 3:4, not the 4:3 default', () => {
    const zone = { x: 0.5, y: 0.5 };
    const d = mini([{ t: 6, move: 'touch', limb: 'handL', zone }]);
    // the hand 0.07 frame-widths to the side: 5 cm-ish on a portrait frame, a zone-radius and a half on a landscape one
    const frames: Frame[] = [];
    for (let f = 5800; f <= 6300; f += FRAME_MS) frames.push({ t: f, pos: { handL: { x: 0.57, y: 0.5 } } });
    const hits = (aspect?: number) => {
      const runner = new DrillRunner(d, aspect === undefined ? {} : { aspect });
      let fi = 0, n = 0;
      for (let now = 0; now <= 10_000; now += TICK_MS) {
        while (fi < frames.length && frames[fi].t + CAMERA_MS <= now) { runner.limbs(frames[fi].t, frames[fi].pos); fi++; }
        n += runner.tick(now, true).judged.filter((j) => j.label !== 'MISS').length;
      }
      return n;
    };
    expect(hits(3 / 4)).toBe(1);
    expect(hits()).toBe(0);
  });
});
