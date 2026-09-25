// MOVEMENT PLAY P3 (2026-09-24): the body session — the plan's §4.2 and §4.3 tables on hand-built packets: presence,
// the hands-up START per phase (and nothing while playing, owner call 3), the latch, the lost pause and exactly who it
// may pause (P3 Z5), both graces, the stall watchdog against a hidden tab, and the final packet. The real streams run
// through it in the gate (lib/input/bodyGate.test.ts).
// The step-2 review added: a START hold must begin in the phase it fires in; a tap / pad resume makes a hand the
// driver; the deadline runs on the arrival clock; every exit from 'playing' releases; and a pin on each guard that no
// other test would miss (seen, the final packet's latch, a second stall, the watchdog's render floor).
import { describe, it, expect } from 'vitest';
import {
  BodySession, START_HOLD_MS, HANDS_DOWN_MS, LOST_PAUSE_MS, AIR_LOST_PAUSE_MS, STALL_MS, STALL_TICKS, STALL_RENDER_MS, TICK_GAP_MS,
  PRESENT_HOLD_MS,
  type SessionStep,
} from './BodySession';
import type { BodyPacket } from './InputBus';
import type { ModePhase } from './ModeHarness';
import { MAX_FLIGHT_MS, type BodyEvent, type BodyRead, type WristRead } from '@/lib/pose/BodyReader';
import { ChannelReader, JUMP_GUARD_MS, OVERHEAD_GAP_MS, type BodyChannels } from '@/lib/pose/bodyChannels';

interface Rd { cal?: boolean; track?: boolean; present?: boolean; air?: boolean }
function read(t: number, o: Rd = {}): BodyRead {
  const present = o.present ?? true;
  return {
    t, present, conf: present ? 0.9 : null, calibrated: o.cal ?? true, tracking: present && (o.track ?? (o.cal ?? true)), rulers: null,
    hip: null, feet: null, airborne: present ? !!o.air : null, knee: null, wrist: null, elbowDeg: null, lean: null, squat: null, yaw: null,
  };
}
const pk = (t: number, o: Rd = {}, ch: Partial<BodyChannels> = {}): BodyPacket =>
  ({ read: read(t, o), events: [], channels: { inJump: false, stride: null, handsUpMs: 0, handsDownMs: 0, ...ch }, arrivedAt: t });
const gone = (t: number): BodyPacket => pk(t, { present: false });
const final = (t: number): BodyPacket => ({ ...gone(t), final: true });
const bound = () => new BodySession({ drives: true, overheadIsPlay: false });
/** Packets every 33 ms from t0 to t1 (exclusive), each through step() at its own time. */
function feed(s: BodySession, phase: ModePhase, t0: number, t1: number, make: (t: number) => BodyPacket): SessionStep[] {
  const out: SessionStep[] = [];
  for (let t = t0; t < t1; t += 33) out.push(s.step(phase, make(t), t));
  return out;
}
const intents = (steps: SessionStep[]) => steps.flatMap((x) => x.intents);
/** A render loop from t0 to t1 at `hz`, with the last packet at `lastPacketAt`: the first release or intent and when. */
function ticks(s: BodySession, phase: ModePhase, t0: number, t1: number, lastPacketAt: number, hz = 60): { at: number; step: SessionStep } | null {
  for (let t = t0; t <= t1; t += 1000 / hz) {
    const x = s.tick(phase, t, lastPacketAt);
    if (x.intents.length || x.release) return { at: t, step: x };
  }
  return null;
}
/** Both hands held up since `from` (capture ms): handsUpMs grows with the frame's own time, as the channels count it. */
const upSince = (from: number) => (t: number) => pk(t, {}, { handsUpMs: Math.max(0, t - from) });
const down = (t: number) => pk(t, {}, { handsDownMs: 400 });
/** The first frame (and its intents) at which a hold feeding from t0 fires, or null. */
function holdFires(s: BodySession, phase: ModePhase, t0: number, t1: number, from = t0): { t: number; intents: string[] } | null {
  for (let t = t0; t < t1; t += 33) {
    const x = s.step(phase, upSince(from)(t), t);
    if (x.intents.length) return { t, intents: x.intents };
  }
  return null;
}

describe('presence', () => {
  it(`none or final = off; uncalibrated = calibrating; tracked (or within ${PRESENT_HOLD_MS} ms of it) = present; otherwise absent`, () => {
    const s = bound();
    expect(s.tick('ready', 0, -Infinity).presence).toBe('off');
    expect(s.step('ready', pk(0, { cal: false }), 0).presence).toBe('calibrating');
    expect(s.step('ready', gone(33), 33).presence).toBe('absent');
    expect(s.step('ready', pk(66), 66).presence).toBe('present');
    expect(s.step('ready', pk(99, { track: false }), 99).presence).toBe('present');                        // a missed frame
    expect(s.step('ready', gone(66 + PRESENT_HOLD_MS), 66 + PRESENT_HOLD_MS).presence).toBe('present');
    expect(s.step('ready', gone(66 + PRESENT_HOLD_MS + 1), 66 + PRESENT_HOLD_MS + 1).presence).toBe('absent');   // gone
    expect(s.step('ready', final(400), 400)).toEqual({ release: true, intents: [], latched: false, presence: 'off', handsUp01: 0 });
    // the hold is forgotten with the source: a new source's first untracked frame is nobody
    expect(s.step('ready', gone(410), 410).presence).toBe('absent');
    // and a capture clock that went back (a probe feed played again from its start) holds nothing
    s.step('ready', pk(5000), 5000);
    expect(s.step('ready', gone(33), 33).presence).toBe('absent');
  });

  it(`a camera that stops sending sees nobody: after ${STALL_MS} ms of rendering without a packet, 'present' is 'absent' in every phase, and back with the frames`, () => {
    for (const phase of ['ready', 'paused', 'playing'] as const) {
      const s = bound();
      s.step(phase, pk(0), 0);
      expect(s.step(phase, upSince(0)(400), 400)).toMatchObject({ presence: 'present' });
      // rendering on, no frames: the last frame's presence (and its ring) stand until the camera is silent…
      let t = 416;
      for (; t - 400 <= STALL_MS; t += 16) expect(s.tick(phase, t, 400).presence, `${phase} ${t}`).toBe('present');
      // …then nobody, and no hold (the pause line reads "Step back into frame", the Body card says absent)
      expect(s.tick(phase, t, 400)).toMatchObject({ presence: 'absent', handsUp01: 0 });
      // the frames come back: the body is seen again at once (the pause line gets its ring back, plan §4.2)
      expect(s.step(phase, pk(t + 16), t + 16).presence).toBe('present');
    }
    // a hidden tab is not a silent camera: too few ticks since the packet keeps the presence
    const h = bound();
    h.step('paused', pk(0), 0);
    for (let k = 0; k < STALL_TICKS - 1; k++) expect(h.tick('paused', 5000 + k * 16, 0).presence).toBe('present');
  });
});

describe('both hands up = START', () => {
  it(`wakes a READY game ${START_HOLD_MS} ms into the hold (once calibrated) and resumes a paused one, once per hold`, () => {
    const s = bound();
    s.step('ready', down(0), 0);
    const w = holdFires(s, 'ready', 33, 2000);
    expect(w!.intents).toEqual(['wake']);
    expect(w!.t - 33).toBeGreaterThanOrEqual(START_HOLD_MS);
    expect(w!.t - 33).toBeLessThan(START_HOLD_MS + 33);
    expect(intents(feed(s, 'ready', w!.t + 33, w!.t + 1500, upSince(33)))).toEqual([]);   // the same hold: once
    s.step('paused', down(2000), 2000);                                                      // hands down: re-armed
    const r = holdFires(s, 'paused', 2033, 4000);
    expect(r!.intents).toEqual(['resume']);
    expect(r!.t - 2033).toBeLessThan(START_HOLD_MS + 33);
  });
  it('not before the reader is calibrated', () => {
    const s = bound();
    s.step('ready', pk(0, { cal: false }), 0);
    expect(intents(feed(s, 'ready', 33, 2000, (t) => pk(t, { cal: false }, { handsUpMs: t - 33 })))).toEqual([]);
  });
  it('does NOTHING while playing (owner call 3), nor in error, ended, loading or the countdown', () => {
    for (const phase of ['playing', 'error', 'ended', 'loading', 'countdown'] as ModePhase[]) {
      const s = bound();
      s.step(phase, down(0), 0);
      expect(intents(feed(s, phase, 33, 3000, upSince(33))), phase).toEqual([]);
    }
  });
  it('a hold must BEGIN in the phase it fires in: arms already up at a pause, at READY or on a new session\'s first frame are raised again', () => {
    // up through 'playing' past the hold, a pad START pauses at 1500: no resume on the pause's first packet, nor later
    const s = bound();
    feed(s, 'playing', 0, 1500, upSince(0));
    expect(intents(feed(s, 'paused', 1500, 4000, upSince(0))), 'held from playing').toEqual([]);
    expect(s.step('paused', upSince(0)(4000), 4000).handsUp01, 'no ring for it').toBe(0);
    s.step('paused', down(4033), 4033);
    const r = holdFires(s, 'paused', 4066, 6000);
    expect(r!.intents).toEqual(['resume']);
    expect(r!.t - 4066).toBeGreaterThanOrEqual(START_HOLD_MS);
    // loading → ready with the arms up the whole time
    const l = bound();
    feed(l, 'loading', 0, 1000, upSince(0));
    expect(intents(feed(l, 'ready', 1000, 3000, upSince(0))), 'held from loading').toEqual([]);
    // GO AGAIN: a new session (the same camera, so the same count) whose first frame is READY with the arms long up
    const g = bound();
    expect(intents(feed(g, 'ready', 5000, 7000, upSince(2000))), 'a celebration').toEqual([]);
    g.step('ready', down(7000), 7000);
    expect(holdFires(g, 'ready', 7033, 9000)!.intents).toEqual(['wake']);
  });
  it('the ring shows the hold\'s progress in READY and PAUSED only', () => {
    const s = bound();
    s.step('ready', down(0), 0);
    expect(s.step('ready', upSince(0)(400), 400).handsUp01).toBe(0.5);
    s.step('paused', down(500), 500);
    expect(s.step('paused', upSince(500)(700), 700).handsUp01).toBe(0.25);
    s.step('playing', down(800), 800);
    expect(s.step('playing', upSince(800)(1200), 1200).handsUp01).toBe(0);
    s.step('ready', down(1300), 1300);
    expect(s.step('ready', upSince(1300)(6300), 6300).handsUp01).toBe(1);
  });
  it(`latches after a body START until both hands have been down ${HANDS_DOWN_MS} ms`, () => {
    const s = bound();
    s.step('ready', down(0), 0);
    expect(s.step('ready', upSince(0)(START_HOLD_MS), START_HOLD_MS).latched).toBe(true);
    expect(s.step('playing', upSince(0)(START_HOLD_MS + 33), START_HOLD_MS + 33).latched).toBe(true);
    expect(s.step('playing', pk(900, {}, { handsDownMs: HANDS_DOWN_MS - 1 }), 900).latched).toBe(true);
    expect(s.step('playing', pk(933, {}, { handsDownMs: HANDS_DOWN_MS }), 933).latched).toBe(false);
    expect(s.step('playing', pk(966), 966).latched).toBe(false);
    // a tap START latches nothing
    expect(bound().step('playing', pk(0), 0).latched).toBe(false);
  });
  it('a final packet (Body off, recalibrate) drops the latch: the source that starts again presses once it calibrates', () => {
    const s = bound();
    s.step('ready', down(0), 0);
    expect(s.step('ready', upSince(0)(START_HOLD_MS), START_HOLD_MS).latched).toBe(true);
    s.step('playing', final(900), 900);
    expect(s.step('playing', pk(1000, {}, { handsDownMs: 0 }), 1000).latched).toBe(false);
  });
});

describe('the START hold on the real channels (the jump guard)', () => {
  const wrist = (overhead: boolean): WristRead => ({ x: 0.5, y: 0.1, heightM: 2, rel: { x: 0, y: 0.6, z: 0 }, vRel: null, vWorld: null, overhead });
  const armsUp = (t: number, air = false): BodyRead => ({ ...read(t, { air }), wrist: { L: wrist(true), R: wrist(true) } });
  it(`a take-off or landing told inside the hold starts it over: no wake until a full ${START_HOLD_MS} ms after the guard`, () => {
    const s = bound(), c = new ChannelReader();
    const told = 627;                                      // the frame that tells the landing
    const land: BodyEvent = { kind: 'land', t: 580, seen: told, flightMs: 330, heightM: 0.13, firstFoot: 'both' };
    let wokeAt = NaN;
    for (let t = 0; t <= 2500 && Number.isNaN(wokeAt); t += 33) {
      const r = armsUp(t, t >= 250 && t < 580);             // a jump with the arms up: airborne 250–580
      const ch = c.step(r, t === told ? [land] : []);
      const x = s.step('ready', { read: r, events: [], channels: ch, arrivedAt: t }, t);
      if (x.intents.includes('wake')) wokeAt = t;
    }
    expect(wokeAt).toBeGreaterThanOrEqual(told + JUMP_GUARD_MS + START_HOLD_MS);
    expect(wokeAt).toBeLessThan(told + JUMP_GUARD_MS + START_HOLD_MS + 67);
  });
  it('the step-4a review: one missed detection inside a hands-up hold is not a body gone — the line and the ring agree', () => {
    // ChannelReader keeps the hold through a gap of up to OVERHEAD_GAP_MS; the presence must too, or the pause line
    // swaps to "Step back into frame" and back (and READY's card jumps) while the ring keeps filling
    expect(PRESENT_HOLD_MS).toBe(OVERHEAD_GAP_MS);
    const s = bound(), c = new ChannelReader();
    const frame = (t: number, seen = true): BodyPacket => {
      const r = seen ? armsUp(t) : read(t, { present: false });
      return { read: r, events: [], channels: c.step(r, []), arrivedAt: t };
    };
    s.step('paused', frame(0), 0);
    const steps: SessionStep[] = [];
    for (let k = 1; k <= 20; k++) steps.push(s.step('paused', frame(k * 33, k !== 10), k * 33));   // frame 10 missed
    expect(steps[9].handsUp01).toBeGreaterThan(0);                                                 // the hold counts through it…
    expect(steps.map((x) => x.presence)).toEqual(Array(20).fill('present'));                     // …and so does the presence
    // a real absence (longer than the hold forgives) drops both together
    const lost = 20 * 33 + OVERHEAD_GAP_MS + 1;
    expect(s.step('paused', frame(lost, false), lost)).toMatchObject({ presence: 'absent', handsUp01: 0 });
  });
  it('the latest counted input decides who is playing: the body, then a hand, then the body again', () => {
    const s = bound();
    s.begin(0, 'external');
    feed(s, 'playing', 0, 300, (t) => pk(t));
    s.noteInput('body', 100); s.noteInput('external', 200);
    feed(s, 'playing', 300, 600, gone);
    expect(ticks(s, 'playing', 600, 2500, 600)).toBeNull();            // the hand came last: no pause
    feed(s, 'playing', 2500, 2800, (t) => pk(t));
    s.noteInput('body', 2790);
    feed(s, 'playing', 2800, 3000, gone);
    expect(ticks(s, 'playing', 3000, 5000, 3000)!.step.intents).toEqual(['pause-lost']);
  });
});

describe('the lost pause — only the body that is playing', () => {
  /** A bound mode in play, the body driving (its evidence last), seen until 990, then gone. */
  function driving(o: { drives?: boolean; driver?: 'body' | 'external' | null; air?: boolean } = {}) {
    const s = new BodySession({ drives: o.drives ?? true, overheadIsPlay: false });
    s.begin(0, 'external');
    feed(s, 'playing', 0, 1000, (t) => pk(t, { air: o.air && t > 900 }));
    if (o.driver !== null) s.noteInput(o.driver ?? 'body', 950);
    const lastSeen = 990;
    s.step('playing', pk(lastSeen, { air: o.air }), lastSeen);
    const steps = feed(s, 'playing', 1023, 1400, gone);   // the reader's absent frames, then the camera keeps sending them
    return { s, lastSeen, steps };
  }
  it(`pauses at lastSeen + ${LOST_PAUSE_MS} ms: release first, then pause-lost`, () => {
    const { s, lastSeen, steps } = driving();
    expect(intents(steps)).toEqual([]);
    const hit = ticks(s, 'playing', 1400, 4000, 1400);
    expect(hit!.step.release).toBe(true);
    expect(hit!.step.intents).toEqual(['pause-lost']);
    expect(hit!.at - lastSeen).toBeGreaterThanOrEqual(LOST_PAUSE_MS);
    expect(hit!.at - lastSeen).toBeLessThan(LOST_PAUSE_MS + 17);
  });
  it(`last seen in the air: the grace is ${AIR_LOST_PAUSE_MS} ms, the reader's longest flight + 200 (a jump out of the top of the frame comes back)`, () => {
    expect(AIR_LOST_PAUSE_MS).toBe(MAX_FLIGHT_MS + 200);
    const { s, lastSeen } = driving({ air: true });
    const hit = ticks(s, 'playing', 1400, 4000, 1400);
    expect(hit!.step.intents).toEqual(['pause-lost']);
    expect(hit!.at - lastSeen).toBeGreaterThanOrEqual(AIR_LOST_PAUSE_MS);
    expect(hit!.at - lastSeen).toBeLessThan(AIR_LOST_PAUSE_MS + 17);
  });
  it('a body back before the deadline cancels it', () => {
    const { s } = driving();
    expect(s.step('playing', pk(2000), 2000).intents).toEqual([]);          // back at 2000: the deadline was 990 + 1200
    expect(ticks(s, 'playing', 2000, 2900, 2000)).toBeNull();
    expect(intents(feed(s, 'playing', 2033, 6000, (t) => pk(t)))).toEqual([]);
  });
  it('the deadline runs on the ARRIVAL clock: frames pushed with their fixture t (0–3 s) on a page at 50 s pause on time, not at once', () => {
    const s = bound();
    const PAGE = 50_000;
    const at = (t: number, p: BodyPacket): BodyPacket => ({ ...p, arrivedAt: PAGE + t });
    s.begin(PAGE, 'body');
    for (let t = 0; t < 1000; t += 33) s.step('playing', at(t, pk(t)), PAGE + t);
    const lastArrive = PAGE + 990;
    s.step('playing', at(990, pk(990)), lastArrive);
    for (let t = 1023; t < 1400; t += 33) expect(s.step('playing', at(t, gone(t)), PAGE + t).intents, `${t}`).toEqual([]);
    const hit = ticks(s, 'playing', PAGE + 1400, PAGE + 4000, PAGE + 1400);
    expect(hit!.step.intents).toEqual(['pause-lost']);
    expect(hit!.at - lastArrive).toBeGreaterThanOrEqual(LOST_PAUSE_MS);
    expect(hit!.at - lastArrive).toBeLessThan(LOST_PAUSE_MS + 17);
  });
  it('never pauses a pad player (the hand\'s input came last), a mode the body does not drive, or a body not seen since the wake', () => {
    expect(ticks(driving({ driver: 'external' }).s, 'playing', 1400, 5000, 1400)).toBeNull();
    expect(ticks(driving({ driver: null }).s, 'playing', 1400, 5000, 1400)).toBeNull();          // nobody has played yet
    expect(ticks(driving({ drives: false }).s, 'playing', 1400, 5000, 1400)).toBeNull();
    const s = bound();
    s.noteInput('body', 0);
    s.begin(10, 'body');                                      // a wake / resume with the body already gone
    feed(s, 'playing', 20, 3000, gone);
    expect(ticks(s, 'playing', 3000, 6000, 3000)).toBeNull();
  });
  it('resumed by the body while it is gone again after a tracked run: no pause (the old lost frame is stale) until it is seen again', () => {
    const { s, lastSeen } = driving();
    const first = ticks(s, 'playing', 1400, 4000, 1400);
    expect(first!.at - lastSeen).toBeLessThan(LOST_PAUSE_MS + 17);
    feed(s, 'paused', first!.at, 4000, gone);
    s.begin(4000, 'body');
    // still gone: without `seen` (or with it kept from the last run), the first absent frame re-arms from 990 and pauses at once
    expect(intents(feed(s, 'playing', 4010, 7000, gone))).toEqual([]);
    expect(ticks(s, 'playing', 7000, 9000, 7000)).toBeNull();
    // seen, then gone: armed again, from the new frame
    s.step('playing', pk(9000), 9000);
    feed(s, 'playing', 9033, 9400, gone);
    const again = ticks(s, 'playing', 9400, 12000, 9400);
    expect(again!.step.intents).toEqual(['pause-lost']);
    expect(again!.at - 9000).toBeGreaterThanOrEqual(LOST_PAUSE_MS);
  });
  it('only while playing: a READY or paused game is never paused by a lost body', () => {
    for (const phase of ['ready', 'paused'] as ModePhase[]) {
      const s = bound();
      s.noteInput('body', 0);
      feed(s, phase, 0, 500, (t) => pk(t));
      expect(intents(feed(s, phase, 533, 3000, gone)), phase).toEqual([]);
      expect(ticks(s, phase, 3000, 6000, 3000), phase).toBeNull();
    }
  });
  it('a body START makes the body the driver (begin after a hands-up wake), so it can be paused with no press yet', () => {
    const s = bound();
    s.step('ready', down(0), 0);
    expect(holdFires(s, 'ready', 33, 2000)!.intents).toEqual(['wake']);
    s.begin(900, 'body');
    feed(s, 'playing', 933, 1300, (t) => pk(t, {}, { handsDownMs: 400 }));
    feed(s, 'playing', 1300, 1700, gone);
    expect(ticks(s, 'playing', 1700, 4000, 1700)!.step.intents).toEqual(['pause-lost']);
  });
  it('a tap, key or pad resume makes a HAND the driver: the player who resumed with a pad and walks off is not paused (P3 Z5)', () => {
    const { s } = driving();                                    // the body drove, then was lost
    const lost = ticks(s, 'playing', 1400, 4000, 1400);
    expect(lost!.step.intents).toEqual(['pause-lost']);
    feed(s, 'paused', 2204, 2600, gone);
    s.begin(2600, 'external');                                  // a tap resumes at 2600
    feed(s, 'playing', 2600, 3000, (t) => pk(t));              // seen for 400 ms, no counted input
    feed(s, 'playing', 3000, 3400, gone);                      // then out of the frame
    expect(ticks(s, 'playing', 3400, 7000, 3400)).toBeNull();
    // …until the body plays again: then it is the body's to lose
    feed(s, 'playing', 7000, 7300, (t) => pk(t));
    s.noteInput('body', 7290);
    feed(s, 'playing', 7300, 7700, gone);
    expect(ticks(s, 'playing', 7700, 10000, 7700)!.step.intents).toEqual(['pause-lost']);
  });
  it('found while paused changes the presence only: it never resumes by itself', () => {
    const { s } = driving();
    ticks(s, 'playing', 1400, 4000, 1400);
    const back = feed(s, 'paused', 4000, 7000, (t) => pk(t));
    expect(intents(back)).toEqual([]);
    expect(back[back.length - 1].presence).toBe('present');
  });
});

describe('the stall watchdog, leaving play and the final packet', () => {
  it(`no packet for ${STALL_MS} ms after a tracked one, with ${STALL_TICKS} render ticks since: release, then pause-stall`, () => {
    const s = bound();
    s.noteInput('body', 0);
    feed(s, 'playing', 0, 500, (t) => pk(t));
    const last = 467;
    const hit = ticks(s, 'playing', last + 16, last + 3000, last);
    expect(hit!.step).toMatchObject({ release: true, intents: ['pause-stall'] });
    expect(hit!.at - last).toBeGreaterThan(STALL_MS);
    expect(hit!.at - last).toBeLessThan(STALL_MS + 17);
    expect(ticks(s, 'playing', hit!.at + 16, hit!.at + 3000, last)).toBeNull();   // once
  });
  it('a hidden tab (rendering suspended too) is not a stall: too few ticks since the packet, nor too short a run at 120 Hz', () => {
    const s = bound();
    s.noteInput('body', 0);
    feed(s, 'playing', 0, 500, (t) => pk(t));
    for (let k = 0; k < STALL_TICKS - 1; k++) expect(s.tick('playing', 467 + 5000 + k * 16, 467)).toMatchObject({ release: false, intents: [] });
    // shown again at 120 Hz: 20 ticks are 167 ms, under the render floor — it takes STALL_RENDER_MS of rendering
    const h = bound();
    h.noteInput('body', 0);
    feed(h, 'playing', 0, 500, (t) => pk(t));
    h.tick('playing', 480, 467);                               // rendering, then the tab hides
    const back = 467 + 8000;
    const hit = ticks(h, 'playing', back, back + 2000, 467, 120);
    expect(hit!.step.intents).toEqual(['pause-stall']);
    expect(hit!.at - back).toBeGreaterThanOrEqual(STALL_RENDER_MS);
    expect(hit!.at - back).toBeLessThan(STALL_RENDER_MS + 9);
  });
  it(`a gap of more than ${TICK_GAP_MS} ms between ticks starts the count over`, () => {
    const s = bound();
    s.noteInput('body', 0);
    feed(s, 'playing', 0, 500, (t) => pk(t));
    for (let k = 0; k < 30; k++) s.tick('playing', 500 + k * 16, 467);          // 30 ticks, 464 ms, then hidden
    expect(s.tick('playing', 3000, 467)).toMatchObject({ release: false, intents: [] });   // back: counted from here
  });
  it('a stalled pad player is released but not paused — and a second stall in the same run releases again', () => {
    const s = bound();
    s.noteInput('external', 0);
    feed(s, 'playing', 0, 500, (t) => pk(t));
    expect(ticks(s, 'playing', 483, 3000, 467)!.step).toMatchObject({ release: true, intents: [] });
    feed(s, 'playing', 3000, 3500, (t) => pk(t));              // the camera comes back…
    const second = ticks(s, 'playing', 3483, 6000, 3467);        // …and stalls again
    expect(second!.step).toMatchObject({ release: true, intents: [] });
    expect(second!.at - 3467).toBeGreaterThan(STALL_MS);
  });
  it('the game leaving playing — for paused, ended or error — raises one release (the arbiter holds nothing on the end card)', () => {
    for (const next of ['paused', 'ended', 'error'] as ModePhase[]) {
      const s = bound();
      feed(s, 'playing', 0, 300, (t) => pk(t));
      expect(s.tick(next, 316, 300).release, `${next} (tick)`).toBe(true);
      expect(s.tick(next, 333, 300).release, `${next}: once`).toBe(false);
      const q = bound();
      feed(q, 'playing', 0, 300, (t) => pk(t));
      expect(q.step(next, pk(300), 300).release, `${next} (packet)`).toBe(true);
    }
    // other moves are not an exit from play
    const r = bound();
    expect(r.tick('loading', 0, -Infinity).release).toBe(false);
    expect(r.tick('ready', 16, -Infinity).release).toBe(false);
    expect(r.tick('playing', 33, -Infinity).release).toBe(false);
  });
  it('a final packet (Body switched off, recalibrate) releases and never pauses, not even the body that was playing', () => {
    const s = bound();
    s.noteInput('body', 0);
    feed(s, 'playing', 0, 500, (t) => pk(t));
    expect(s.step('playing', final(500), 500)).toEqual({ release: true, intents: [], latched: false, presence: 'off', handsUp01: 0 });
    expect(ticks(s, 'playing', 516, 5000, 500)).toBeNull();
  });
});
