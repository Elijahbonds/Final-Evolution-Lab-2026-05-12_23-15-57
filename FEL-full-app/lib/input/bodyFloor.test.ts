// MOVEMENT PLAY P3 (2026-09-24): the body floor — each rule of plan §4.1 on hand-built packets, so every edge sits
// exactly where the rule says. The real streams (the 12 fixtures, the ducks, the scripted jumps and jogs) run through
// it in the gate (bodyGate.test.ts); what the bus does with its output is arbiter / InputBus.body.
import { describe, it, expect } from 'vitest';
import {
  BodyFloor, CROUCH_DEAD, FLOOR_RELEASE_MS, HOP_CLEAR_MS, LEAN_OFF_SW, LEAN_ON_SW, OVERHEAD_STRIKE_MS, PEAK_HOLD_MS, PULSE_MS, STEP_SWING_MS, quantise,
} from './bodyFloor';
import { BODY_PROFILES, sessionOnly, type BodyProfile } from './bodyProfiles';
import type { BodyOut, BodyPacket } from '@/lib/babylon/core/InputBus';
import type { BodyEvent, BodyRead, WristRead } from '@/lib/pose/BodyReader';
import type { BodyChannels } from '@/lib/pose/bodyChannels';

const SKATE = BODY_PROFILES.skateboard, FREERUN = BODY_PROFILES.freerun, SPRINT = BODY_PROFILES.sprint, VS = BODY_PROFILES['karate-vs'];
/** A crouch with no hop (no P3 row has one; a P5+ mode that claims the take-off would). */
const CROUCH_ONLY: BodyProfile = { ...SKATE, key: 'crouch_only', modeId: 'crouch_only', bindings: [{ from: 'squat', to: 'RT', verb: 'PUMP' }] };

interface Rd { cal?: boolean; track?: boolean; side?: number | null; squat?: number | null; air?: boolean | null; present?: boolean; lift?: 'L' | 'R'; up?: 'both' | 'L' }
function read(t: number, o: Rd = {}): BodyRead {
  const present = o.present ?? true;
  const air = o.air === undefined ? false : o.air;
  const foot = (f: 'L' | 'R') => (air || o.lift === f ? { heightM: 0.12, contact: false } : { heightM: 0, contact: true });
  const wr = (overhead: boolean): WristRead => ({ x: 0.5, y: overhead ? 0.1 : 0.6, heightM: overhead ? 2 : 1, rel: { x: 0, y: overhead ? 0.6 : -0.5, z: 0 }, vRel: null, vWorld: null, overhead });
  return {
    t, present, conf: present ? 0.9 : null, calibrated: o.cal ?? true, tracking: present && (o.track ?? (o.cal ?? true)), rulers: null,
    hip: present ? { x: 0.5, y: 0.55, heightM: 0.95, vy: 0 } : null, feet: present ? { L: foot('L'), R: foot('R') } : null, airborne: present ? air : null, knee: null,
    wrist: present && o.up ? { L: wr(true), R: wr(o.up === 'both') } : null, elbowDeg: null,
    lean: present ? { sideSw: o.side ?? 0, trunkDeg: 0, trunkFwdDeg: 0 } : null,
    squat: present ? (o.squat === undefined ? (air ? null : 0) : o.squat) : null, yaw: null,
  };
}
const CH: BodyChannels = { inJump: false, stride: null, handsUpMs: 0, handsDownMs: 0 };
const pk = (t: number, o: Rd = {}, ch: Partial<BodyChannels> = {}, events: BodyEvent[] = []): BodyPacket =>
  ({ read: read(t, o), events, channels: { ...CH, ...ch }, arrivedAt: t + 66 });
const takeoff = (t: number): BodyEvent => ({ kind: 'takeoff', t: t - 100, seen: t, feet: 'two', foot: 'both', v0: 2.4, predictedHeightM: 0.29 });
const step = (t: number, foot: 'L' | 'R'): BodyEvent => ({ kind: 'step', t, seen: t, foot, cadenceHz: 3 });
const punch = (t: number): BodyEvent => ({ kind: 'punch', t, seen: t, hand: 'R', speed: 3 });
const kick = (t: number): BodyEvent => ({ kind: 'kick', t, seen: t, foot: 'R', speed: 3 });

/** Step the floor on `now` = the packet's arrive. */
const go = (f: BodyFloor, p: BodyPacket, latched = false): BodyOut[] => f.step(p, p.arrivedAt, latched);
const run = (f: BodyFloor, ps: BodyPacket[]): BodyOut[] => ps.flatMap((p) => go(f, p));
const trigs = (o: BodyOut[]) => o.filter((e) => e.t === 'trigger').map((e) => (e.t === 'trigger' ? e.value : NaN));
const sticks = (o: BodyOut[]) => o.filter((e) => e.t === 'stick').map((e) => (e.t === 'stick' ? [e.x, e.y] : []));

describe('rest, calibration, the profile', () => {
  it('rest emits nothing, in every profile: output is only ever a change from an implicit neutral', () => {
    for (const p of Object.values(BODY_PROFILES)) {
      const f = new BodyFloor(p);
      const out: BodyOut[] = [];
      for (let t = 0; t < 3000; t += 33) out.push(...go(f, pk(t, { side: 0.02 * Math.sin(t), squat: 0.03 })));
      expect(out, p.key).toEqual([]);
    }
  });
  it('nothing before the reader is calibrated and tracking (a lean, a crouch, a hop — all silent)', () => {
    const f = new BodyFloor(SKATE);
    for (let t = 0; t < 600; t += 33) expect(go(f, pk(t, { cal: false, side: 0.9, squat: 0.9 }, {}, [takeoff(t)]))).toEqual([]);
    expect(go(f, pk(633, { cal: true, track: false, side: 0.9, squat: 0.9 }, {}, [takeoff(633)]))).toEqual([]);
    expect(sticks(go(f, pk(666, { side: 0.9 })))).toEqual([[0.75, 0]]);
  });
  it('a session-only profile writes nothing, whatever the body does (P3 Z3)', () => {
    for (const p of [BODY_PROFILES.dunk, BODY_PROFILES.onevone, BODY_PROFILES.who_scene_it, sessionOnly('x')]) {
      const f = new BodyFloor(p);
      const out = run(f, [
        pk(0, { side: 1.2, squat: 1 }), pk(33, { side: -1.2, squat: 0.2 }, { stride: { hz: 3, drive: 1 } }, [step(33, 'L'), punch(33), kick(33)]),
        pk(66, { air: true }, { inJump: true }, [takeoff(66)]),
      ]);
      expect(out.concat(new BodyFloor(p).tick(1e6)), p.key).toEqual([]);
    }
  });
  it('every output carries src: body', () => {
    const f = new BodyFloor(SKATE);
    const out = run(f, [pk(0, { side: 0.8, squat: 0.9 }), pk(33, { air: true }, { inJump: true }, [takeoff(33)]), pk(200, { side: 0 }, { inJump: true })]);
    out.push(...f.tick(1e6), ...f.release());
    expect(out.length).toBeGreaterThan(3);
    for (const e of out) expect(e.src).toBe('body');
  });
});

describe('the lean (L stick x)', () => {
  it(`engages at ${LEAN_ON_SW} sw, lets go under ${LEAN_OFF_SW}, ramps from the OFF line to full at 1.1, both ways`, () => {
    const f = new BodyFloor(SKATE);
    const xs = (side: number, t: number) => sticks(go(f, pk(t, { side })));
    expect(xs(0.34, 0)).toEqual([]);                        // under ON: nothing
    expect(xs(0.36, 33)).toEqual([[0.1, 0]]);                // ramp(0.36) = 0.098 → 0.1
    expect(xs(0.30, 66)).toEqual([[0, 0]]);                  // still engaged (≥ OFF), 0.024 → 0
    expect(xs(0.34, 100)).toEqual([[0.05, 0]]);              // engaged: no need to pass ON again
    expect(xs(0.27, 133)).toEqual([[0, 0]]);                 // under OFF: let go
    expect(xs(0.34, 166)).toEqual([]);                       // …and 0.34 is under ON again
    expect(xs(-0.63, 200)).toEqual([[-0.45, 0]]);
    expect(xs(-1.4, 233)).toEqual([[-1, 0]]);
  });
  it('is quantised: jitter inside one step of 0.05 sends nothing', () => {
    const f = new BodyFloor(SKATE);
    expect(sticks(go(f, pk(0, { side: 0.608 })))).toEqual([[0.4, 0]]);
    for (let t = 33; t < 1000; t += 33) expect(go(f, pk(t, { side: 0.608 + 0.015 * Math.sin(t) }))).toEqual([]);
    expect(quantise(-0.001)).toBe(0);
    expect(Object.is(quantise(-0.001), -0)).toBe(false);
    expect(quantise(0.15000000000000002)).toBe(0.15);
  });
  it('holds its last grounded value through a jump (a jump never moves the stick) and follows again after', () => {
    const f = new BodyFloor(SKATE);
    expect(sticks(go(f, pk(0, { side: 0.8 })))).toEqual([[0.65, 0]]);
    for (let t = 33; t < 600; t += 33) expect(sticks(go(f, pk(t, { side: -0.9 + t / 1000, air: true }, { inJump: true })))).toEqual([]);
    expect(sticks(go(f, pk(633, { side: 0 }, { inJump: true })))).toEqual([]);   // down, the absorb still in the jump
    expect(sticks(go(f, pk(666, { side: 0 })))).toEqual([[0, 0]]);
  });
  it('never writes y: a lean profile leaves the other axis to the hand', () => {
    const f = new BodyFloor(SKATE);
    const out = run(f, [pk(0, { side: 1 }, { stride: { hz: 3, drive: 1 } }), pk(33, { side: -1 }, { stride: { hz: 3, drive: 1 } })]);
    for (const [, y] of sticks(out)) expect(y).toBe(0);
  });
});

describe('the cadence (L stick y)', () => {
  it('y = −stride.drive (forward), 0 without a cadence, held through a jump, x never written', () => {
    const f = new BodyFloor(FREERUN);
    expect(go(f, pk(0, { side: 0.9 }))).toEqual([]);                          // no cadence yet, and no lean binding
    expect(sticks(go(f, pk(33, {}, { stride: { hz: 2.7, drive: 0.74 } })))).toEqual([[0, -0.75]]);
    expect(sticks(go(f, pk(66, { air: true }, { inJump: true, stride: { hz: 2.7, drive: 0.2 } })))).toEqual([]);
    expect(sticks(go(f, pk(99, {}, { stride: { hz: 2.7, drive: 0.5 } })))).toEqual([[0, -0.5]]);
    expect(sticks(go(f, pk(133, {}, { stride: null })))).toEqual([[0, 0]]);
  });
});

describe('the crouch (the trigger)', () => {
  it('tracks the squat down past the dead band, and holds its peak on the way back up', () => {
    const f = new BodyFloor(SKATE);
    const v = [0.2, CROUCH_DEAD, 0.5, 0.9, 1, 0.7, 0.4, 0.2].map((squat, i) => trigs(go(f, pk(i * 33, { squat }))));
    expect(v).toEqual([[], [], [0.25], [1], [], [], [], []]);
  });
  it('a 10 cm duck (squat 0.26–0.29) pulls nothing', () => {
    const f = new BodyFloor(SKATE);
    for (let t = 0; t < 1500; t += 33) expect(go(f, pk(t, { squat: 0.26 + 0.03 * Math.abs(Math.sin(t)) }))).toEqual([]);
  });
  it('THE HOP: the A goes first and the trigger drops to 0 in the same step, after it — and stays 0 until the jump is over', () => {
    const f = new BodyFloor(SKATE);
    run(f, [pk(0, { squat: 0.8 }), pk(33, { squat: 0.4 }), pk(66, { squat: 0.1 })]);
    go(f, pk(100, { air: true }, { inJump: true }));
    const out = go(f, pk(133, { air: true }, { inJump: true }, [takeoff(133)]));
    expect(out).toEqual([
      { t: 'button', btn: 'A', pressed: true, src: 'body' },
      { t: 'trigger', side: 'R', value: 0, src: 'body' },
    ]);
    // the landing's absorb is not a pump: grounded and deep, still in the jump → 0 …
    for (let t = 400; t < 650; t += 33) expect(trigs(go(f, pk(t, { squat: 0.8 }, { inJump: true })))).toEqual([]);
    // … nor once the jump is over while that crouch lasts, dipping a frame under the band on its way down …
    expect(trigs(run(f, [pk(666, { squat: 0.8 }), pk(700, { squat: 0.34 }), pk(733, { squat: 0.6 }), pk(766, { squat: 0.2 }), pk(800, { squat: 0.1 })]))).toEqual([]);
    // … until it has been stood out of for HOP_CLEAR_MS: a NEW crouch tracks from 0
    expect(trigs(run(f, [pk(766 + HOP_CLEAR_MS, { squat: 0.1 }), pk(900, { squat: 0.8 })]))).toEqual([0.8]);
  });
  it('the hold drops after PEAK_HOLD_MS under the dead band on the floor when no hop comes (a crouch and a stand)', () => {
    const f = new BodyFloor(SKATE);
    expect(trigs(go(f, pk(0, { squat: 0.9 })))).toEqual([1]);
    let t = 33, dropAt = NaN;
    for (; t < 1200; t += 33) { const v = trigs(go(f, pk(t, { squat: 0.1 }))); if (v.length) { expect(v).toEqual([0]); dropAt = t; break; } }
    expect(dropAt - 33).toBeGreaterThanOrEqual(PEAK_HOLD_MS);
    expect(dropAt - 33).toBeLessThan(PEAK_HOLD_MS + 34);
  });
  it('air time does not count toward the drop (a null squat in the air holds), and a return into the crouch restarts the clock', () => {
    const f = new BodyFloor(SKATE);
    go(f, pk(0, { squat: 0.9 }));
    run(f, [pk(33, { squat: 0.1 }), pk(233, { squat: 0.1 })]);                // 200 ms under
    for (let t = 266; t < 900; t += 33) expect(trigs(go(f, pk(t, { air: true, squat: null })))).toEqual([]);   // floating: holds
    expect(trigs(go(f, pk(933, { squat: 0.5 })))).toEqual([]);                // back into it (under the peak): clock reset
    expect(trigs(run(f, [pk(966, { squat: 0.1 }), pk(966 + PEAK_HOLD_MS - 10, { squat: 0.1 })]))).toEqual([]);
    expect(trigs(go(f, pk(966 + PEAK_HOLD_MS, { squat: 0.1 })))).toEqual([0]);
  });
  it('never rises in a jump (the airborne float before a take-off is told, the absorb after)', () => {
    const f = new BodyFloor(SKATE);
    expect(trigs(run(f, [pk(0, { squat: 0.6 }, { inJump: true }), pk(33, { squat: 0.9 }, { inJump: true })]))).toEqual([]);
    expect(trigs(go(f, pk(66, { squat: 0.6 })))).toEqual([0.45]);
    expect(trigs(go(f, pk(100, { squat: 0.9 }, { inJump: true })))).toEqual([]);   // holds 0.45, never 1
  });
  it('a hop lost before its take-off is told: the release lets go, and the landing\'s crouch it is found in is no pump', () => {
    const f = new BodyFloor(SKATE);
    expect(trigs(run(f, [pk(0, { squat: 0.8 }), pk(33, { squat: 0.4 })]))).toEqual([0.8]);
    go(f, pk(66, { air: true }, { inJump: true }));                       // off the floor, the take-off not told yet
    expect(trigs(run(f, [pk(100, { present: false }), pk(133, { present: false }), pk(166, { present: false })]))).toEqual([0]);
    // found on the floor deep in the landing (no take-off, no landing told: the reader drops a flight it lost)
    expect(trigs(run(f, [pk(300, { squat: 0.8 }), pk(333, { squat: 0.6 }), pk(366, { squat: 0.2 })]))).toEqual([]);
    // stood out of it: a new crouch tracks from 0
    expect(trigs(run(f, [pk(366 + HOP_CLEAR_MS, { squat: 0.1 }), pk(600, { squat: 0.8 })]))).toEqual([0.8]);
  });
  it('a profile with a crouch and no hop lets go at the jump', () => {
    const f = new BodyFloor(CROUCH_ONLY);
    expect(trigs(go(f, pk(0, { squat: 0.9 })))).toEqual([1]);
    expect(trigs(go(f, pk(33, { air: true }, { inJump: true })))).toEqual([0]);
  });
});

describe('the pulses', () => {
  it('a take-off is one A pulse, released on the first step or tick at least PULSE_MS later — and only while tracking', () => {
    const f = new BodyFloor(SKATE);
    expect(go(f, pk(0, { air: true }, { inJump: true }, [takeoff(0)]))).toEqual([{ t: 'button', btn: 'A', pressed: true, src: 'body' }]);
    expect(f.tick(66 + PULSE_MS - 1)).toEqual([]);
    expect(f.tick(66 + PULSE_MS)).toEqual([{ t: 'button', btn: 'A', pressed: false, src: 'body' }]);
    expect(f.tick(1e6)).toEqual([]);
    // released by a packet when that comes first
    go(f, pk(500, { air: true }, { inJump: true }, [takeoff(500)]));
    expect(go(f, pk(500 + PULSE_MS, { air: true }, { inJump: true }))).toEqual([{ t: 'button', btn: 'A', pressed: false, src: 'body' }]);
    // a take-off told on a frame the body is not tracked on presses nothing
    expect(go(f, pk(900, { track: false }, { inJump: true }, [takeoff(900)]))).toEqual([]);
  });
  it('a step is the d-pad by foot (L ◀, R ▶) — once per lift of that foot off the floor, none in the air', () => {
    const sp = new BodyFloor(SPRINT);
    const d = (o: BodyOut[]) => o.filter((e) => e.t === 'dpad' && e.pressed).map((e) => (e.t === 'dpad' ? e.dir : ''));
    go(sp, pk(-100, { lift: 'L' }));
    expect(d(go(sp, pk(0, {}, {}, [step(0, 'L')])))).toEqual(['left']);
    go(sp, pk(200, { lift: 'R' }));
    expect(d(go(sp, pk(333, {}, {}, [step(333, 'R')])))).toEqual(['right']);
    expect(d(go(sp, pk(400, {}, {}, [step(400, 'R')])))).toEqual([]);          // no new lift: a second "step" is not a stride
    go(sp, pk(500, { lift: 'L' }));
    expect(d(go(sp, pk(666, { air: true }, { inJump: true }, [step(666, 'L')])))).toEqual([]);
    // a foot that never left the floor (the calf raise's heels coming down) is no stride; nor a lift long gone
    const cr = new BodyFloor(SPRINT);
    expect(d(run(cr, [pk(0), pk(33, {}, {}, [step(33, 'L')])]))).toEqual([]);
    go(cr, pk(100, { lift: 'R' }));
    expect(d(go(cr, pk(100 + STEP_SWING_MS + 1, {}, {}, [step(100 + STEP_SWING_MS + 1, 'R')])))).toEqual([]);
    // a jump's feet off the floor are the jump's, not a stride's swing: the landing's first foot down is no step
    const jp = new BodyFloor(SPRINT);
    run(jp, [pk(0), pk(33, { air: true }, { inJump: true }), pk(66, { air: true }, { inJump: true }), pk(100, { air: true }, { inJump: true })]);
    expect(d(run(jp, [pk(133), pk(400, {}, {}, [step(400, 'L')]), pk(433, {}, {}, [step(433, 'R')])]))).toEqual([]);
  });
  it('a punch and a kick are A and B — never in the air, never out of a jump\'s gather (judged at the strike\'s own instant)', () => {
    const vs = new BodyFloor(VS);
    const b = (o: BodyOut[]) => o.filter((e) => e.t === 'button' && e.pressed).map((e) => (e.t === 'button' ? e.btn : ''));
    expect(b(go(vs, pk(0, {}, {}, [punch(0)])))).toEqual(['A']);
    expect(b(go(vs, pk(333, {}, {}, [kick(333)])))).toEqual(['B']);
    expect(b(go(vs, pk(666, { air: true }, { inJump: true }, [punch(666), kick(666)])))).toEqual([]);
    // a jump's arm swing read as a punch at squat 0.51 at the bottom of the gather, told a frame later as the hips rise
    // through 0.34 (under the band on the telling frame: the strike's own instant decides)
    run(vs, [pk(1400, { squat: 0.1 }), pk(1433, { squat: 0.3 }), pk(1466, { squat: 0.45 }), pk(1500, { squat: 0.51 })]);
    expect(b(go(vs, pk(1533, { squat: 0.34 }, {}, [punch(1500)])))).toEqual([]);
    // …and the other way: a swing read above the band (0.2), told as the body drops into a gather (0.45 on this frame)
    run(vs, [pk(2400, { squat: 0.02 }), pk(2433, { squat: 0.2 })]);
    expect(b(go(vs, pk(2466, { squat: 0.45 }, {}, [kick(2433)])))).toEqual([]);
    expect(b(go(vs, pk(3000, { squat: 0.2 }, {}, [punch(2990)])))).toEqual(['A']);   // upright again: fine
  });
  it('a stance HELD low strikes: a jab and a kick off a bent supporting leg from 16–25 cm down are A and B (the step-2 review)', () => {
    const b = (o: BodyOut[]) => o.filter((e) => e.t === 'button' && e.pressed).map((e) => (e.t === 'button' ? e.btn : ''));
    for (const sq of [CROUCH_DEAD, 0.41, 0.52, 0.65]) {
      const vs = new BodyFloor(VS);
      for (let t = 0; t < 600; t += 33) go(vs, pk(t, { squat: sq + 0.03 * Math.sin(t) }));   // settled, jittering
      expect(b(go(vs, pk(633, { squat: sq }, {}, [punch(600)]))), `squat ${sq}`).toEqual(['A']);
      expect(b(go(vs, pk(933, { squat: sq + 0.02 }, {}, [kick(900)]))), `squat ${sq}`).toEqual(['B']);
    }
    // a bounce that never crouches (a boxer's bounce under the band) moves as much as a gather and strikes too
    const bx = new BodyFloor(VS);
    run(bx, [pk(0, { squat: 0 }), pk(33, { squat: 0.3 }), pk(66, { squat: 0.05 })]);
    expect(b(go(bx, pk(100, { squat: 0.3 }, {}, [punch(66)])))).toEqual(['A']);
  });
  it(`no strike out of both arms coming down from overhead (within ${OVERHEAD_STRIKE_MS} ms): a hands-up while playing does nothing`, () => {
    const b = (o: BodyOut[]) => o.filter((e) => e.t === 'button' && e.pressed).map((e) => (e.t === 'button' ? e.btn : ''));
    const vs = new BodyFloor(VS);
    run(vs, [pk(0, { up: 'both' }), pk(33, { up: 'both' }), pk(66, { up: 'both' })]);
    expect(b(go(vs, pk(166, {}, {}, [punch(133), punch(133)])))).toEqual([]);                 // on the way down
    expect(b(go(vs, pk(66 + OVERHEAD_STRIKE_MS, {}, {}, [kick(66 + OVERHEAD_STRIKE_MS)])))).toEqual([]);
    expect(b(go(vs, pk(100 + OVERHEAD_STRIKE_MS, {}, {}, [punch(67 + OVERHEAD_STRIKE_MS)])))).toEqual(['A']);
    // one hand up (an uppercut finishing high, a raised guard) is not the hands-up
    const one = new BodyFloor(VS);
    go(one, pk(0, { up: 'L' }));
    expect(b(go(one, pk(66, {}, {}, [punch(33)])))).toEqual(['A']);
  });
  it('a second press of a key still pulsing releases the first (press / release stay paired)', () => {
    const vs = new BodyFloor(VS);
    go(vs, pk(0, {}, {}, [punch(0)]));
    expect(go(vs, pk(20, {}, {}, [punch(20)]))).toEqual([
      { t: 'button', btn: 'A', pressed: false, src: 'body' }, { t: 'button', btn: 'A', pressed: true, src: 'body' },
    ]);
  });
});

describe('letting go', () => {
  it(`a body untracked under FLOOR_RELEASE_MS holds; at ${FLOOR_RELEASE_MS} ms everything is released, pending pulses too`, () => {
    const f = new BodyFloor(SKATE);
    go(f, pk(0, { side: 0.8, squat: 0.9 }));
    const to = pk(33, { air: true }, { inJump: true }, [takeoff(33)]);   // A pressed, the crouch dropped after it
    go(f, to);
    // frames handed over in a burst (a model catching up): the untracked ones arrive before the A's release is due
    const burst = (t: number): BodyPacket => ({ ...pk(t, { present: false }), arrivedAt: to.arrivedAt + 10 });
    expect(go(f, burst(33 + FLOOR_RELEASE_MS - 1))).toEqual([]);
    expect(go(f, burst(33 + FLOOR_RELEASE_MS))).toEqual([
      { t: 'stick', side: 'L', x: 0, y: 0, src: 'body' }, { t: 'button', btn: 'A', pressed: false, src: 'body' },
    ]);
    expect(go(f, pk(300, { present: false }))).toEqual([]);          // once
    expect(f.tick(1e6)).toEqual([]);
  });
  it('losing the calibration (a recalibrate) and a final packet each release everything', () => {
    const f = new BodyFloor(SKATE);
    run(f, [pk(0, { side: -0.8, squat: 0.9 })]);
    expect(go(f, pk(33, { cal: false }))).toEqual([
      { t: 'stick', side: 'L', x: 0, y: 0, src: 'body' }, { t: 'trigger', side: 'R', value: 0, src: 'body' },
    ]);
    const g = new BodyFloor(SKATE);
    go(g, pk(0, { side: 0.9 }));
    expect(go(g, { ...pk(33), final: true })).toEqual([{ t: 'stick', side: 'L', x: 0, y: 0, src: 'body' }]);
  });
  it('latched (the START pose): one release, then nothing — the hands-down frame after re-emits what the body is doing', () => {
    const f = new BodyFloor(SKATE);
    go(f, pk(0, { side: 0.8 }));
    expect(go(f, pk(33, { side: 0.8, squat: 0.9 }, {}, [takeoff(33)]), true)).toEqual([{ t: 'stick', side: 'L', x: 0, y: 0, src: 'body' }]);
    for (let t = 66; t < 400; t += 33) expect(go(f, pk(t, { side: 0.8, squat: 0.9 }, {}, [takeoff(t)]), true)).toEqual([]);
    expect(go(f, pk(433, { side: 0.8 }))).toEqual([{ t: 'stick', side: 'L', x: 0.65, y: 0, src: 'body' }]);
  });
  it('begin() makes the next frame re-emit the current values; release() zeroes only what is non-zero', () => {
    const f = new BodyFloor(SKATE);
    go(f, pk(0, { side: 0.8, squat: 0.9 }));
    expect(go(f, pk(33, { side: 0.8, squat: 0.9 }))).toEqual([]);
    f.begin();
    expect(go(f, pk(66, { side: 0.8, squat: 0.9 }))).toEqual([
      { t: 'stick', side: 'L', x: 0.65, y: 0, src: 'body' }, { t: 'trigger', side: 'R', value: 1, src: 'body' },
    ]);
    const g = new BodyFloor(SKATE);
    go(g, pk(0, { squat: 0.9 }));
    expect(g.release()).toEqual([{ t: 'trigger', side: 'R', value: 0, src: 'body' }]);
    expect(g.release()).toEqual([]);
  });
});
