// MUSIC-SUITE P2 (2026-09-25): the Cypher's song clock, its schedulers and its tap. See SongClock.ts for what P1
// measured and why each rule exists. Node only: StemBand and KitPulse run on the P1 clock-only Web Audio stand-in
// (lib/babylon/music/fakeWebAudio.ts), with their sources wrapped here so a test can see what was started, when (on
// the context's clock at the moment start() was called), and what a pause took back.

import { describe, it, expect } from 'vitest';
import {
  SongClock, plan16ths, gridIndexAt, tapLatencySec, triggerTap, danceTap, PAST_SLACK_SEC, MAX_OUTPUT_LATENCY_SEC,
  type TriggerLatch,
} from './SongClock';
import { StemBand, CATEGORY_STEM, type StemCategory } from './StemBand';
import { KitPulse, kitPattern } from './KitPulse';
import { FakeAudioContext } from '../music/fakeWebAudio';
import { KEY_SPACE_DOWN } from '../core/StartWake';
import type { FelInput } from '../core/InputBus';
import { DancePerformance, MISS_AFTER, beatDuration, type DanceStep } from '../core/DanceCore';

// ── the clock ─────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('SongClock: song time is the audio clock with the pauses taken out', () => {
  it('runs on the audio clock until paused', () => {
    const c = new SongClock();
    expect(c.song(0)).toBe(0);
    expect(c.song(12.5)).toBe(12.5);
    expect(c.audio(12.5)).toBe(12.5);
    expect(c.paused).toBe(false);
    expect(c.pausedTotal).toBe(0);
    expect(c.accepting(3)).toBe(true);
  });

  it('pause holds it; resume carries on from the same song time, the gap in pausedTotal', () => {
    const c = new SongClock();
    expect(c.pause(10)).toBe(true);
    expect(c.pause(11)).toBe(false);                      // already held
    expect(c.song(10)).toBe(10);
    expect(c.song(14.9)).toBe(10);                        // the song does not move while the audio clock runs on
    expect(c.accepting(12)).toBe(false);
    expect(c.resume(15)).toBe(15);                        // no count back: the song is at the pause point at once
    expect(c.song(15)).toBe(10);
    expect(c.song(16)).toBe(11);
    expect(c.pausedTotal).toBe(5);
    expect(c.audio(11)).toBe(16);                         // the schedulers' mapping, exact while running
    expect(c.resume(17)).toBeNull();                      // not paused
  });

  it('a count back in resumes the song ONE BAR early and reaches the pause point one bar after the resume', () => {
    const c = new SongClock();
    const bar = 4 * beatDuration(96);                     // 2.5 s
    c.pause(20);
    const back = c.resume(25, bar)!;
    expect(back).toBe(27.5);
    expect(c.song(25)).toBeCloseTo(17.5, 12);             // the bar before the pause point, replayed
    expect(c.song(27.5)).toBeCloseTo(20, 12);
    expect(c.song(28)).toBeCloseTo(20.5, 12);
    expect(c.pausedTotal).toBeCloseTo(7.5, 12);           // 5 s paused + the 2.5 s bar counted back in
    expect(c.countingBack(26)).toBe(true);
    expect(c.countingBack(27.5)).toBe(false);
    expect(c.countBackLeft(26)).toBeCloseTo(1.5, 12);
    expect(c.countBackLeft(28)).toBe(0);
    // taps: closed through the replayed bar, open again one judge window before the pause point
    expect(c.accepting(25)).toBe(false);
    expect(c.accepting(27.2, MISS_AFTER)).toBe(false);
    expect(c.accepting(27.3, MISS_AFTER)).toBe(true);
    expect(c.accepting(27.4)).toBe(false);
    expect(c.accepting(27.5)).toBe(true);
  });

  it('a pause during the count back in re-arms the same count back in (the song never walks backwards)', () => {
    const c = new SongClock();
    c.pause(20);
    c.resume(25, 2);                                      // song 18 at audio 25
    c.pause(26);                                          // mid count back: song 19, but the pause point stays 20
    expect(c.song(30)).toBe(20);
    c.resume(40, 2);
    expect(c.song(40)).toBe(18);
    expect(c.song(42)).toBe(20);
    // and a pause after the count back in holds where the song really is
    c.pause(43);
    expect(c.song(50)).toBe(21);
  });

  it('a count back of 0, a negative or a non-number just carries on', () => {
    for (const back of [0, -3, NaN, Infinity]) {
      const c = new SongClock();
      c.pause(5);
      c.resume(9, back);
      expect(c.song(9)).toBe(5);
      expect(c.countingBack(9)).toBe(false);
    }
  });

  it('the judge sees no MISS burst across a 5 s pause (P1: the raw audio clock expired every step that passed)', () => {
    const bpm = 96, bd = beatDuration(bpm), startAt = 10;
    const steps: DanceStep[] = Array.from({ length: 40 }, (_, i) => ({ clipId: `s${i}`, beat: i, holdBeats: 1, mirrored: false }));
    const run = (useClock: boolean): { counts: DancePerformance['counts']; burst: number } => {
      const clock = new SongClock();
      const p = new DancePerformance(bpm);
      p.setRoutine(steps);
      p.start(startAt);
      const stepTimes = steps.map((s) => startAt + s.beat * bd);
      let si = 0, burst = 0;
      for (let a = startAt; a < startAt + 40 * bd + 8; a += 1 / 60) {
        if (a >= 20 && a < 25) {                          // START: the harness runs no update() and hands over no input
          if (useClock && !clock.paused) clock.pause(a);
          if (!useClock) while (si < stepTimes.length && stepTimes[si] <= a) si++;   // beats the player could not tap
          continue;
        }
        if (useClock && clock.paused) clock.resume(a, 4 * bd);
        const song = useClock ? clock.song(a) : a;
        // the player taps each beat as it sounds (its song time mapped to audio time), once the room takes taps again
        while (si < stepTimes.length && (useClock ? clock.audio(stepTimes[si]) : stepTimes[si]) <= a) {
          if (!useClock || clock.accepting(a, MISS_AFTER)) p.hit(song);
          si++;
        }
        const before = p.counts.MISS;
        p.update(song);
        burst = Math.max(burst, p.counts.MISS - before);
      }
      return { counts: { ...p.counts }, burst };
    };
    const raw = run(false), held = run(true);
    // the raw clock: the song ran on through the pause, and the 8 steps in it expired together on the first frame back
    expect(raw.counts.MISS).toBe(8);
    expect(raw.burst).toBe(8);
    // the song clock: nothing was missed, and no frame judged more than nothing
    expect(held.counts.MISS).toBe(0);
    expect(held.burst).toBe(0);
    expect(held.counts.PERFECT).toBe(40);
  });
});

// ── the grid ──────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('plan16ths: the schedulers\' 16th grid, never in the past', () => {
  const per16 = 60 / 96 / 4;
  it('queues every 16th inside the lookahead, on the song clock mapped to audio time', () => {
    const plan = plan16ths({ startedAt: 10, next16: 0, per16, songNow: 10, lookahead: 0.25, toAudio: (s) => s + 3, audioNow: 13 });
    expect(plan.slots.map((x) => x.idx)).toEqual([0, 1]);   // 0 and 0.156 s; 0.3125 s is past the lookahead
    expect(plan.slots[1].at).toBeCloseTo(13 + per16, 12);
    expect(plan.next16).toBe(2);
    expect(plan.skipped).toBe(0);
  });

  it('passes over a 16th already behind the clock instead of starting it in the past (a hitch, a returning tab)', () => {
    // the cursor stopped at 16th 4 (song 10.625); the clock is now 2 s on
    const plan = plan16ths({ startedAt: 10, next16: 4, per16, songNow: 12.625, lookahead: 0.25, toAudio: (s) => s, audioNow: 12.625 });
    expect(plan.slots.every((x) => x.at >= 12.625 - PAST_SLACK_SEC)).toBe(true);
    expect(plan.skipped).toBe(gridIndexAt(10, per16, 12.625 - PAST_SLACK_SEC) - 4);
    expect(plan.slots[0].idx).toBe(gridIndexAt(10, per16, 12.625 - PAST_SLACK_SEC));
    expect(plan.next16).toBe(plan.slots[plan.slots.length - 1].idx + 1);
  });

  it('a 16th inside the slack still plays (a hair late beats a hole in the groove)', () => {
    const plan = plan16ths({ startedAt: 10, next16: 0, per16, songNow: 10.005, lookahead: 0.25, toAudio: (s) => s, audioNow: 10.005 });
    expect(plan.slots[0]).toEqual({ idx: 0, at: 10 });
  });

  it('nothing before the grid starts, and nothing from a broken tempo or clock', () => {
    expect(plan16ths({ startedAt: 10, next16: 0, per16, songNow: 9, lookahead: 0.25, toAudio: (s) => s, audioNow: 9 }).slots).toEqual([]);
    expect(plan16ths({ startedAt: 10, next16: 0, per16: 0, songNow: 11, lookahead: 0.25, toAudio: (s) => s, audioNow: 11 }).slots).toEqual([]);
    expect(plan16ths({ startedAt: 10, next16: 0, per16, songNow: NaN, lookahead: 0.25, toAudio: (s) => s, audioNow: 11 }).slots).toEqual([]);
  });

  it('gridIndexAt: the first 16th at or after a song time, 0 before the grid', () => {
    expect(gridIndexAt(10, 0.25, 9)).toBe(0);
    expect(gridIndexAt(10, 0.25, 10)).toBe(0);
    expect(gridIndexAt(10, 0.25, 10.25)).toBe(1);
    expect(gridIndexAt(10, 0.25, 10.26)).toBe(2);
    expect(gridIndexAt(10, 0, 11)).toBe(0);
  });
});

// ── StemBand + KitPulse on a fake context ─────────────────────────────────────────────────────────────────────────────

interface Started { at: number; calledAt: number; cancelled: boolean }
/** The P1 fake context with its sources wrapped: every start() records the clock at the call, and a stop(0) followed by
 *  a disconnect() (what cancelFrom does) marks it taken back. */
function watchedCtx(t0: number): { ctx: FakeAudioContext; started: Started[] } {
  const ctx = new FakeAudioContext();
  ctx.currentTime = t0;
  const started: Started[] = [];
  const wrap = <T extends { start(at?: number): void; stop(at?: number): void; disconnect(): void }>(n: T): T => {
    let rec: Started | null = null;
    const start = n.start.bind(n);
    n.start = (at = 0) => { rec = { at, calledAt: ctx.currentTime, cancelled: false }; started.push(rec); start(at); };
    let lastStop: number | undefined;
    n.stop = (at?: number) => { lastStop = at; };
    n.disconnect = () => { if (rec && lastStop === 0) rec.cancelled = true; };
    return n;
  };
  const osc = ctx.createOscillator.bind(ctx), src = ctx.createBufferSource.bind(ctx);
  ctx.createOscillator = () => wrap(osc());
  ctx.createBufferSource = () => wrap(src());
  return { ctx, started };
}
const asCtx = (c: FakeAudioContext) => c as unknown as AudioContext;
const fullBand = (band: StemBand) => {
  for (const cat of Object.keys(CATEGORY_STEM) as StemCategory[]) for (let i = 0; i < 3; i++) band.judge(cat, 'PERFECT');
};
async function loadedKit(ctx: FakeAudioContext, bpm: number, trackId: string): Promise<KitPulse> {
  const kit = new KitPulse(asCtx(ctx), ctx.destination as unknown as AudioNode, bpm, kitPattern(trackId));
  const fetchOk = (async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })) as unknown as typeof fetch;
  expect(await kit.load(fetchOk)).toBe(4);
  return kit;
}

/** Drive a scheduler the way DanceMode does: frames at 60 fps on the song clock, a pause at `pauseAt` (audio) held until
 *  `resumeAt`, then a one-bar count back in. Returns the audio times that were never passed to it. */
function drive(
  ctx: FakeAudioContext, s: { update(n: number): void; cancelFrom(a: number): number; rewind(n: number): void },
  clock: SongClock, from: number, to: number, pause?: { at: number; until: number; bar: number },
): void {
  for (let a = from; a < to; a += 1 / 60) {
    ctx.currentTime = a;
    if (pause && a >= pause.at && a < pause.until) {
      if (!clock.paused) { clock.pause(a); s.cancelFrom(a); }
      continue;
    }
    if (pause && clock.paused) { clock.resume(a, pause.bar); s.rewind(clock.song(a)); }
    s.update(clock.song(a));
  }
}

describe('StemBand and KitPulse never schedule in the past', () => {
  const bpm = 96, bd = beatDuration(bpm), per16 = bd / 4;

  it('StemBand across a 2.5 s frame hitch: no start behind the clock (the old loop started every missed 16th at once)', () => {
    const { ctx, started } = watchedCtx(100);
    const band = new StemBand(asCtx(ctx), ctx.destination as unknown as AudioNode, bpm);
    fullBand(band);
    band.start(100);
    for (let a = 100; a < 102; a += 1 / 60) { ctx.currentTime = a; band.update(a); }
    ctx.currentTime = 104.5;                              // a hitch: no frame for 2.5 s, and no pause either
    band.update(104.5);
    for (let a = 104.5; a < 106; a += 1 / 60) { ctx.currentTime = a; band.update(a); }
    expect(started.length).toBeGreaterThan(40);
    expect(started.filter((x) => x.at < x.calledAt - PAST_SLACK_SEC)).toEqual([]);
    expect(band.skipped).toBeGreaterThan(0);              // the hitch's 16ths were passed over, not stacked
  });

  it('StemBand through a pause: the lookahead is taken back, nothing sounds in the gap, the count back replays the bar on the grid', () => {
    const { ctx, started } = watchedCtx(100);
    const clock = new SongClock();
    const band = new StemBand(asCtx(ctx), ctx.destination as unknown as AudioNode, bpm);
    band.setClock((s) => clock.audio(s));
    fullBand(band);
    band.start(100);
    // paused at 105.2: the 16th at 105.3125 (hats + bass) is already queued in the 0.25 s lookahead
    drive(ctx, band, clock, 100, 115, { at: 105.2, until: 110, bar: 4 * bd });
    const heard = started.filter((x) => !x.cancelled);
    expect(started.filter((x) => x.cancelled).map((x) => x.at)).toContain(105.3125);   // taken back
    expect(heard.filter((x) => x.at > 105.22 && x.at < 110)).toEqual([]);    // silence while paused
    expect(started.filter((x) => x.at < x.calledAt - PAST_SLACK_SEC)).toEqual([]);
    // after the resume every note sits on the song's 16th grid, mapped through the clock (nothing drifted)
    for (const x of heard.filter((y) => y.at >= 110)) {
      const k = (x.at - clock.pausedTotal - 100) / per16;
      expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
    }
    // the count back in replayed the bar before the pause point: the first note after the resume is on song time
    // 105.2 − one bar's grid, one 16th or less after 110
    expect(heard.some((x) => x.at >= 110 && x.at - 110 <= per16 + 1e-9)).toBe(true);
  });

  it('KitPulse through a pause in the count-in: the queued clicks are taken back; after the resume none lands behind the clock', async () => {
    const { ctx, started } = watchedCtx(50);
    const clock = new SongClock();
    const kit = await loadedKit(ctx, bpm, 'cypher');
    kit.setClock((s) => clock.audio(s));
    kit.countIn(clock.audio(50), 4);                      // four clicks queued at 50, 50.625, 51.25, 51.875
    kit.start(50 + 4 * bd);
    ctx.currentTime = 50.7;
    kit.update(clock.song(50.7));
    clock.pause(50.7);
    expect(kit.cancelFrom(50.7)).toBeGreaterThanOrEqual(2);                 // the last two clicks at least
    expect(started.filter((x) => !x.cancelled && x.at > 50.7)).toEqual([]);
    clock.resume(60, 0);
    kit.start(clock.song(60) + 4 * bd);                  // DanceMode re-arms the count-in from the top
    kit.countIn(60, 4);
    drive(ctx, kit, clock, 60, 66);
    expect(started.filter((x) => x.at < x.calledAt - PAST_SLACK_SEC)).toEqual([]);
    expect(started.filter((x) => !x.cancelled && x.at > 50.7 && x.at < 60)).toEqual([]);
  });

  it('KitPulse through a pause mid-song and a returning tab: nothing in the gap, nothing in the past', async () => {
    const { ctx, started } = watchedCtx(200);
    const clock = new SongClock();
    const kit = await loadedKit(ctx, 112, 'battle');
    kit.setClock((s) => clock.audio(s));
    kit.start(200);
    drive(ctx, kit, clock, 200, 230, { at: 204, until: 224, bar: 4 * beatDuration(112) });   // a 20 s hidden tab
    expect(started.filter((x) => x.at < x.calledAt - PAST_SLACK_SEC)).toEqual([]);
    expect(started.filter((x) => !x.cancelled && x.at > 204.02 && x.at < 224)).toEqual([]);
    expect(started.filter((x) => !x.cancelled && x.at >= 224).length).toBeGreaterThan(40);
  });

  it('dispose takes back what was queued (the room leaves, its lookahead does not play on)', () => {
    const { ctx, started } = watchedCtx(10);
    const band = new StemBand(asCtx(ctx), ctx.destination as unknown as AudioNode, bpm);
    fullBand(band);
    band.start(10);
    band.update(10.1);
    band.dispose();
    expect(started.filter((x) => x.at >= 10.1 && !x.cancelled)).toEqual([]);
    const n = started.length;
    band.update(11);
    expect(started.length).toBe(n);
  });
});

// ── latency ───────────────────────────────────────────────────────────────────────────────────────────────────────────

describe('tapLatencySec: the calibration, else outputLatency', () => {
  it('a saved calibration wins — including a saved 0', () => {
    expect(tapLatencySec(75, 0.04)).toBeCloseTo(0.075, 12);
    expect(tapLatencySec(0, 0.2)).toBe(0);
    expect(tapLatencySec(-50, 0.2)).toBeCloseTo(-0.05, 12);
  });
  it('no calibration: the context\'s outputLatency, sane values only', () => {
    expect(tapLatencySec(null, 0.042)).toBeCloseTo(0.042, 12);
    expect(tapLatencySec(null, 3)).toBe(MAX_OUTPUT_LATENCY_SEC);
    for (const v of [undefined, NaN, -0.1, 0, Infinity]) expect(tapLatencySec(null, v)).toBe(0);
  });
  it('a corrupt saved value is clamped, never trusted as a second', () => {
    expect(tapLatencySec(9000, 0)).toBe(MAX_OUTPUT_LATENCY_SEC);
    expect(tapLatencySec(NaN, 0.03)).toBeCloseTo(0.03, 12);
  });
});

// ── the tap ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Feed a stream of inputs through danceTap; returns how many taps it judged. */
function taps(events: FelInput[], start: TriggerLatch = 'up'): { n: number; latch: TriggerLatch } {
  let latch = start, n = 0;
  for (const e of events) { const r = danceTap(latch, e); latch = r.latch; if (r.tap) n++; }
  return { n, latch };
}
const R = (value: number): FelInput => ({ t: 'trigger', side: 'R', value });
const frames = (secs: number, fn: (t: number) => number): FelInput[] =>
  Array.from({ length: Math.round(secs * 60) }, (_, i) => R(fn((i + 1) / 60)));

describe('danceTap: one physical press is one judged tap', () => {
  it('R2 held 1 s, re-sent every frame, is ONE tap (P1: 57)', () => {
    expect(taps([R(0), ...frames(1, () => 1), R(0)]).n).toBe(1);
  });

  it('R2 pulled three times is three taps; a pull that never comes back under 0.3 is not a new one', () => {
    const pull = [...frames(0.1, () => 1), ...frames(0.1, () => 0)];
    expect(taps([...pull, ...pull, ...pull]).n).toBe(3);
    expect(taps([R(0.6), R(0.4), R(0.35), R(0.9), R(0.31), R(1)]).n).toBe(1);
    expect(taps([R(0.6), R(0.29), R(0.55)]).n).toBe(2);
    expect(taps([R(0.49), R(0.2), R(0.49)]).n).toBe(0);  // never pulled
  });

  it('SPACE held 1 s is ONE tap, on the way DOWN (P1: 23 taps, judged on key-up 114–195 ms late)', () => {
    // InputBus: KEY_SPACE_DOWN on keydown, a depth climbing 0→1 over 1.1 s every frame, 0 on keyup, then A tagged 'space'
    const hold: FelInput[] = [R(KEY_SPACE_DOWN), ...frames(1, (t) => Math.min(1, t / 1.1)), R(0), { t: 'button', btn: 'A', pressed: true, src: 'space' }];
    const first = danceTap('up', hold[0]);
    expect(first.tap).toBe(true);                         // the marker IS the press moment
    expect(taps(hold).n).toBe(1);
    expect(taps(hold).latch).toBe('up');
  });

  it('a quick SPACE tap is one tap, and its key-up A is not a second', () => {
    expect(taps([R(KEY_SPACE_DOWN), R(0.015), R(0), { t: 'button', btn: 'A', pressed: true, src: 'space' }]).n).toBe(1);
  });

  it('two SPACE key-downs are two taps even if the key-up between them was lost', () => {
    expect(taps([R(KEY_SPACE_DOWN), R(0.2), R(KEY_SPACE_DOWN), R(0.1)]).n).toBe(2);
  });

  it('A and B presses tap (pad, J / K, the touch TAP); their releases, L2, sticks and the d-pad do not', () => {
    const ev: FelInput[] = [
      { t: 'button', btn: 'A', pressed: true }, { t: 'button', btn: 'A', pressed: false },
      { t: 'button', btn: 'B', pressed: true }, { t: 'button', btn: 'B', pressed: false },
      { t: 'button', btn: 'X', pressed: true }, { t: 'trigger', side: 'L', value: 1 },
      { t: 'stick', side: 'L', x: 1, y: 0 }, { t: 'dpad', dir: 'left', pressed: true },
    ];
    expect(taps(ev).n).toBe(2);
  });

  it('a trigger held through the count-in (latch already down) or re-sent by the resume does not tap', () => {
    expect(taps(frames(0.5, () => 1), 'pulled').n).toBe(0);
    // the latch read the pull during the count-in; the song's first frames re-send it
    const countIn = taps(frames(0.3, () => 1));
    expect(countIn.n).toBe(1);                            // (the count-in drops it: the room ignores taps there)
    expect(taps(frames(0.5, () => 1), countIn.latch).n).toBe(0);
  });

  it('P2 fix pass: a 0-depth first frame (a coarsened clock) does not free SPACE — a long hold is still ONE tap', () => {
    // review: triggerTap freed 'space' on any value <= 0, so marker → depth 0 → 'up', and the ramp crossing 0.5 at ~0.55 s
    // tapped again (a wild MISS). The key-up's R 0 and its A free it.
    const hold: FelInput[] = [R(KEY_SPACE_DOWN), R(0), ...frames(1, (t) => Math.min(1, t / 1.1)), R(0), { t: 'button', btn: 'A', pressed: true, src: 'space' }];
    expect(taps(hold)).toEqual({ n: 1, latch: 'up' });
    expect(taps([R(KEY_SPACE_DOWN), R(0), R(0), R(0.6), R(0.9)]).n).toBe(1);
    // a quick tap whose key-up came before any depth frame: its A frees the latch, the next press taps
    expect(taps([R(KEY_SPACE_DOWN), R(0), { t: 'button', btn: 'A', pressed: true, src: 'space' }, R(KEY_SPACE_DOWN)])).toEqual({ n: 2, latch: 'space' });
    // a blur mid-hold (InputBus releaseAll sends R 0, no A) after a depth: released, and a pad pull counts again
    expect(taps([R(KEY_SPACE_DOWN), R(0.2), R(0), R(0.6), R(0.1), R(0.7)]).n).toBe(3);
  });

  it('triggerTap is total: every state answers every value', () => {
    for (const st of ['up', 'pulled', 'space', 'spaceDepth'] as TriggerLatch[]) {
      for (const v of [0, KEY_SPACE_DOWN, 0.29, 0.3, 0.5, 1, -1]) {
        const r = triggerTap(st, v);
        expect(['up', 'pulled', 'space', 'spaceDepth']).toContain(r.state);
        expect(typeof r.tap).toBe('boolean');
      }
    }
  });
});
