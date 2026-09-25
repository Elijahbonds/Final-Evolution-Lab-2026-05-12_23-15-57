// MOVEMENT PLAY P3 (2026-09-24): the body channels — the four facts that need history (inJump, stride, the hands-up
// START hold, the hands-down latch release), on hand-built reads so every edge sits exactly where the rule says.
// The fixtures and the scripted streams run through them in the step-2 gate (bodyGate.test.ts).
import { describe, it, expect } from 'vitest';
import {
  ChannelReader, ABSORB_MS, FLIGHT_GIVE_UP_MS, JUMP_GUARD_MS, OVERHEAD_GAP_MS, STRIDE_ZERO_MS, type BodyChannels,
} from './bodyChannels';
import { MAX_FLIGHT_MS, type BodyEvent, type BodyRead, type WristRead } from './BodyReader';

const wrist = (overhead: boolean): WristRead => ({
  x: 0.5, y: overhead ? 0.1 : 0.6, heightM: overhead ? 2.1 : 1.0, rel: { x: 0, y: overhead ? 0.6 : -0.5, z: 0 },
  vRel: null, vWorld: null, overhead,
});
interface Opt { air?: boolean | null; up?: boolean | [boolean, boolean]; present?: boolean; calibrated?: boolean; tracking?: boolean }
function rd(t: number, o: Opt = {}): BodyRead {
  if (o.present === false) {
    return {
      t, present: false, conf: null, calibrated: o.calibrated ?? true, tracking: false, rulers: null, hip: null, feet: null,
      airborne: null, knee: null, wrist: null, elbowDeg: null, lean: null, squat: null, yaw: null,
    };
  }
  const [l, r] = Array.isArray(o.up) ? o.up : [!!o.up, !!o.up];
  const calibrated = o.calibrated ?? true;
  return {
    t, present: true, conf: 0.9, calibrated, tracking: o.tracking ?? calibrated, rulers: null,
    hip: { x: 0.5, y: 0.55, heightM: 0.95, vy: 0 }, feet: null, airborne: o.air === undefined ? false : o.air, knee: null,
    wrist: { L: wrist(l), R: wrist(r) }, elbowDeg: null, lean: { sideSw: 0, trunkDeg: 0, trunkFwdDeg: 0 }, squat: 0, yaw: null,
  };
}
const takeoff = (t: number, seen: number): BodyEvent => ({ kind: 'takeoff', t, seen, feet: 'two', foot: 'both', v0: 2.2, predictedHeightM: 0.25 });
const land = (t: number, seen: number): BodyEvent => ({ kind: 'land', t, seen, flightMs: 450, heightM: 0.25, firstFoot: 'both' });
const step = (t: number, foot: 'L' | 'R' = 'L'): BodyEvent => ({ kind: 'step', t, seen: t, foot, cadenceHz: null });
const lost = (t: number): BodyEvent => ({ kind: 'lost', t, seen: t, lastSeen: t - 300 });
const found = (t: number): BodyEvent => ({ kind: 'found', t, seen: t, goneMs: 400 });

/** One frame (no events unless given). */
const st = (c: ChannelReader, read: BodyRead, events: BodyEvent[] = []): BodyChannels => c.step(read, events);

/** Steps at `hz` from t0, each told on its own frame; returns the channels after the last and its instant. */
function jog(c: ChannelReader, t0: number, hz: number, n: number): { ch: BodyChannels; last: number } {
  let ch = st(c, rd(t0), [step(t0)]);
  let t = t0;
  for (let i = 1; i < n; i++) { t = t0 + (i * 1000) / hz; ch = st(c, rd(t), [step(t, i % 2 ? 'R' : 'L')]); }
  return { ch, last: t };
}

describe('inJump', () => {
  it('starts at a take-off told late and ends at land + ABSORB_MS', () => {
    const c = new ChannelReader();
    // the feet unread (airborne null): only the events say there was a jump
    expect(st(c, rd(1000, { air: null })).inJump).toBe(false);
    expect(st(c, rd(1100, { air: null })).inJump).toBe(false);
    expect(st(c, rd(1267, { air: null }), [takeoff(1000, 1267)]).inJump).toBe(true);   // told 267 ms after it happened
    expect(st(c, rd(1500, { air: null })).inJump).toBe(true);
    expect(st(c, rd(1600, { air: null }), [land(1500, 1600)]).inJump).toBe(true);
    expect(st(c, rd(1500 + ABSORB_MS - 1, { air: null })).inJump).toBe(true);
    expect(st(c, rd(1500 + ABSORB_MS, { air: null })).inJump).toBe(false);
  });
  it('an airborne read starts it before the take-off is told; the touch-down before the landing is told does not end it', () => {
    const c = new ChannelReader();
    expect(st(c, rd(1000)).inJump).toBe(false);
    expect(st(c, rd(1033, { air: true })).inJump).toBe(true);
    expect(st(c, rd(1283, { air: true }), [takeoff(1020, 1283)]).inJump).toBe(true);
    expect(st(c, rd(1500)).inJump).toBe(true);           // down, the landing told LAND_SETTLE_MS later
    expect(st(c, rd(1600), [land(1500, 1600)]).inJump).toBe(true);
    expect(st(c, rd(1749)).inJump).toBe(true);
    expect(st(c, rd(1750)).inJump).toBe(false);
  });
  it('a double-float that never became a take-off ends at the first grounded read, with no absorb (a jog keeps its steps)', () => {
    const c = new ChannelReader();
    expect(st(c, rd(1000, { air: true })).inJump).toBe(true);
    expect(st(c, rd(1033, { air: true })).inJump).toBe(true);
    expect(st(c, rd(1066), [step(1060)]).inJump).toBe(false);
  });
  it('is held through a flight lost at the top of the frame; found back on the floor (no landing made up) it ends after the absorb', () => {
    const c = new ChannelReader();
    st(c, rd(1000, { air: true }));
    st(c, rd(1100, { air: true }), [takeoff(990, 1100)]);
    for (let t = 1133; t < 1500; t += 33) expect(st(c, rd(t, { present: false })).inJump).toBe(true);
    expect(st(c, rd(1500, { present: false }), [lost(1433)]).inJump).toBe(true);
    expect(st(c, rd(1520), [found(1520)]).inJump).toBe(true);
    expect(st(c, rd(1520 + ABSORB_MS - 1)).inJump).toBe(true);
    expect(st(c, rd(1520 + ABSORB_MS)).inJump).toBe(false);
    // found still in the air: flies on until its landing
    const d = new ChannelReader();
    st(d, rd(1100, { air: true }), [takeoff(990, 1100)]);
    st(d, rd(1300, { present: false }));
    expect(st(d, rd(1400, { air: true }), [found(1400)]).inJump).toBe(true);
    expect(st(d, rd(1600)).inJump).toBe(true);
    expect(st(d, rd(1700), [land(1600, 1700)]).inJump).toBe(true);
    expect(st(d, rd(1850)).inJump).toBe(false);
  });
  it('found with the feet unread: the flight is dropped on the first later frame that reads them on the floor (the reader\'s `resumed`)', () => {
    // review 2026-09-24: only the found frame itself was looked at, so this held inJump to the give-up (~1.45 s)
    const c = new ChannelReader();
    st(c, rd(1100, { air: true }), [takeoff(1000, 1100)]);
    st(c, rd(1300, { present: false }), [lost(1233)]);
    expect(st(c, rd(1400, { air: null }), [found(1400)]).inJump).toBe(true);   // back, feet unread: still flying
    expect(st(c, rd(1433, { air: null })).inJump).toBe(true);
    expect(st(c, rd(1466)).inJump).toBe(true);           // feet read, on the floor: dropped here, the absorb runs
    expect(st(c, rd(1466 + ABSORB_MS - 1)).inJump).toBe(true);
    expect(st(c, rd(1466 + ABSORB_MS)).inJump).toBe(false);
    // …and read in the air instead, it flies on to its landing
    const d = new ChannelReader();
    st(d, rd(1100, { air: true }), [takeoff(1000, 1100)]);
    st(d, rd(1300, { present: false }), [lost(1233)]);
    st(d, rd(1400, { air: null }), [found(1400)]);
    expect(st(d, rd(1433, { air: true })).inJump).toBe(true);
    expect(st(d, rd(1600)).inJump).toBe(true);           // a later touch-down is the landing's to tell, not a drop
    expect(st(d, rd(1700), [land(1600, 1700)]).inJump).toBe(true);
    expect(st(d, rd(1600 + ABSORB_MS)).inJump).toBe(false);
  });
  it('found past MAX_FLIGHT_MS: dropped at the found frame, as the reader drops it (resetMotion)', () => {
    const c = new ChannelReader();
    st(c, rd(1100, { air: true }), [takeoff(1000, 1100)]);
    st(c, rd(1300, { present: false }), [lost(1233)]);
    const back = 1000 + MAX_FLIGHT_MS + 50;               // under FLIGHT_GIVE_UP_MS: the give-up has not fired yet
    expect(back - 1000).toBeLessThan(FLIGHT_GIVE_UP_MS);
    expect(st(c, rd(back, { air: null }), [found(back)]).inJump).toBe(true);
    expect(st(c, rd(back + ABSORB_MS)).inJump).toBe(false);
  });
  it('an unconfirmed float lost with the body is dropped with it (the reader forgets an unconfirmed flight)', () => {
    const c = new ChannelReader();
    expect(st(c, rd(1000, { air: true })).inJump).toBe(true);
    expect(st(c, rd(1033, { present: false })).inJump).toBe(true);   // gone, not yet lost: held
    expect(st(c, rd(1300, { present: false }), [lost(1233)]).inJump).toBe(false);
  });
  it('a take-off the reader never landed is given up past its longest flight', () => {
    const c = new ChannelReader();
    st(c, rd(1100, { air: null }), [takeoff(1000, 1100)]);
    expect(st(c, rd(1000 + FLIGHT_GIVE_UP_MS)).inJump).toBe(true);
    const t = 1000 + FLIGHT_GIVE_UP_MS + 1;
    expect(st(c, rd(t)).inJump).toBe(true);              // given up: the absorb still runs out from here
    expect(st(c, rd(t + ABSORB_MS)).inJump).toBe(false);
  });
});

describe('stride', () => {
  it('is null until 4 steps inside 2.5 s, then drive = ramp(hz, 1.2, 3.2)', () => {
    const c = new ChannelReader();
    expect(jog(c, 1000, 2, 3).ch.stride).toBeNull();
    const { ch } = jog(new ChannelReader(), 1000, 2, 4);
    expect(ch.stride!.hz).toBeCloseTo(2, 9);
    expect(ch.stride!.drive).toBeCloseTo(0.4, 9);
    const fast = jog(new ChannelReader(), 1000, 3.5, 5).ch.stride!;
    expect(fast.hz).toBeCloseTo(3.5, 9);
    expect(fast.drive).toBe(1);                           // past STRIDE_FULL_HZ: clamped
    expect(jog(new ChannelReader(), 1000, 1, 6).ch.stride).toBeNull();   // 4 steps take 3 s: no cadence
  });
  it('holds max(500 ms, 1.5 periods) after the last step, fades over 200 ms, and is exactly 0 at STRIDE_ZERO_MS', () => {
    const c = new ChannelReader();
    const { last } = jog(c, 1000, 3.2, 4);                // hold 500 (1.5 periods = 469), fade 500 → 700
    expect(st(c, rd(last + 499)).stride!.drive).toBe(1);
    expect(st(c, rd(last + 600)).stride!.drive).toBeCloseTo(0.5, 9);
    expect(st(c, rd(last + STRIDE_ZERO_MS - 1)).stride!.drive).toBeGreaterThan(0);
    expect(st(c, rd(last + STRIDE_ZERO_MS)).stride!.drive).toBe(0);
    const d = new ChannelReader();
    const j = jog(d, 1000, 2.5, 4);                       // 1.5 periods = 600: the fade is cut to 600 → 700
    expect(st(d, rd(j.last + 600)).stride!.drive).toBeCloseTo(0.65, 9);
    expect(st(d, rd(j.last + 650)).stride!.drive).toBeCloseTo(0.325, 9);
    expect(st(d, rd(j.last + STRIDE_ZERO_MS)).stride!.drive).toBe(0);
  });
  it('runs on the step\'s own instant, not the frame that told it: steps told 80 ms late still reach 0 at the last step + 700', () => {
    const c = new ChannelReader();
    const late = 80, hz = 3.2;
    let last = 0;
    for (let i = 0; i < 5; i++) { last = 1000 + (i * 1000) / hz; st(c, rd(last + late), [{ ...step(last), seen: last + late }]); }
    expect(st(c, rd(last + 499)).stride!.drive).toBe(1);
    expect(st(c, rd(last + 600)).stride!.drive).toBeCloseTo(0.5, 9);   // the fade from the STEP's +500, not the telling's
    expect(st(c, rd(last + STRIDE_ZERO_MS)).stride!.drive).toBe(0);
  });
  it('a body lost on the ground forgets its steps: the first step back is no cadence', () => {
    const c = new ChannelReader();
    const { last } = jog(c, 1000, 3, 5);
    expect(st(c, rd(last + 100)).stride).not.toBeNull();
    st(c, rd(last + 300, { present: false }), [lost(last + 250)]);
    expect(st(c, rd(last + 500), [step(last + 500)]).stride).toBeNull();   // not the old four + this one
  });
  it('the cadence is the last five steps\' (four periods), not everything in the window', () => {
    const c = new ChannelReader();
    let ch: BodyChannels | null = null;
    for (const t of [1000, 1600, 2000, 2250, 2500, 2750, 3000]) ch = st(c, rd(t), [step(t)]);
    expect(ch!.stride!.hz).toBeCloseTo(4, 9);            // 2000 → 3000 in four steps; all seven would read 3 Hz
  });
  it('is held, not faded, through a jump: the clock stops in the air and runs again after the absorb', () => {
    const c = new ChannelReader();
    const { last } = jog(c, 1000, 3.2, 4);
    const t0 = last + 100;
    expect(st(c, rd(t0, { air: true })).stride!.drive).toBe(1);
    st(c, rd(t0 + 250, { air: true }), [takeoff(t0 - 10, t0 + 250)]);
    expect(st(c, rd(t0 + 500)).stride!.drive).toBe(1);   // (a flight + a touch-down 500 ms past the last step)
    expect(st(c, rd(t0 + 600), [land(t0 + 500, t0 + 600)]).stride!.drive).toBe(1);
    const back = t0 + 500 + ABSORB_MS;                    // the first frame out of the jump: 100 ms on the clock still
    const out = st(c, rd(back));
    expect(out.inJump).toBe(false);
    expect(out.stride!.drive).toBe(1);
    expect(st(c, rd(back + 399)).stride!.drive).toBe(1);             // 499 ms on the ground since the step
    expect(st(c, rd(back + 500)).stride!.drive).toBeCloseTo(0.5, 9); // 600
  });
});

describe('handsUpMs — the START hold', () => {
  it(`survives a gap of up to ${OVERHEAD_GAP_MS} ms without both hands up (a flicker, or frames that never came) and resets past it`, () => {
    const c = new ChannelReader();
    let ch = st(c, rd(1000, { up: true }));
    for (let t = 1030; t <= 1300; t += 30) ch = st(c, rd(t, { up: true }));
    expect(ch.handsUpMs).toBe(300);
    for (const t of [1330, 1360, 1390]) expect(st(c, rd(t, { up: [true, false] })).handsUpMs).toBe(300);   // held, not grown
    expect(st(c, rd(1300 + OVERHEAD_GAP_MS, { up: true })).handsUpMs).toBe(420);   // the gap counted in the hold
    for (let t = 1450; t <= 1780; t += 30) ch = st(c, rd(t, { up: true }));
    ch = st(c, rd(1800, { up: true }));
    expect(ch.handsUpMs).toBe(800);
    for (const t of [1830, 1860, 1890, 1920]) expect(st(c, rd(t)).handsUpMs).toBe(800);
    expect(st(c, rd(1950)).handsUpMs).toBe(0);           // 150 ms without both hands up
    expect(st(c, rd(1980, { up: true })).handsUpMs).toBe(0);
    expect(st(c, rd(2010, { up: true })).handsUpMs).toBe(30);
    expect(st(c, rd(2200, { up: true })).handsUpMs).toBe(0);   // 190 ms with no frame at all: a new hold
  });
  it('any airborne frame resets it, and it never holds uncalibrated or untracked', () => {
    const c = new ChannelReader();
    let ch = st(c, rd(1000, { up: true }));
    for (let t = 1030; t <= 1600; t += 30) ch = st(c, rd(t, { up: true }));
    expect(ch.handsUpMs).toBe(600);
    expect(st(c, rd(1630, { up: true, air: true })).handsUpMs).toBe(0);
    expect(st(c, rd(1660, { up: true })).handsUpMs).toBe(0);
    expect(st(c, rd(1690, { up: true })).handsUpMs).toBe(30);
    const d = new ChannelReader();
    for (let t = 1000; t <= 2000; t += 30) expect(st(d, rd(t, { up: true, calibrated: false })).handsUpMs).toBe(0);
    for (let t = 2030; t <= 3000; t += 30) expect(st(d, rd(t, { up: true, tracking: false })).handsUpMs).toBe(0);
  });
  it('never holds with the feet unread (airborne null): "on the ground" has to be read, not assumed', () => {
    const c = new ChannelReader();
    for (let t = 1000; t <= 2200; t += 30) expect(st(c, rd(t, { up: true, air: null })).handsUpMs).toBe(0);
  });
  it(`a take-off or landing told during the hold, or within JUMP_GUARD_MS (${JUMP_GUARD_MS}) before it, resets it`, () => {
    const c = new ChannelReader();
    expect(st(c, rd(1000, { up: true }), [land(900, 1000)]).handsUpMs).toBe(0);
    for (let t = 1030; t < 1000 + JUMP_GUARD_MS; t += 30) expect(st(c, rd(t, { up: true })).handsUpMs).toBe(0);
    expect(st(c, rd(1000 + JUMP_GUARD_MS, { up: true })).handsUpMs).toBe(0);   // the hold starts here
    let ch = st(c, rd(1430, { up: true }));
    for (let t = 1460; t <= 1700; t += 30) ch = st(c, rd(t, { up: true }));
    expect(ch.handsUpMs).toBe(300);
    expect(st(c, rd(1730, { up: true }), [takeoff(1600, 1730)]).handsUpMs).toBe(0);   // told during it
    expect(st(c, rd(1760, { up: true })).handsUpMs).toBe(0);
  });
});

describe('handsDownMs — the latch release', () => {
  it('counts both wrists continuously below the head line; one hand up or no body resets it', () => {
    const c = new ChannelReader();
    expect(st(c, rd(1000, { up: true })).handsDownMs).toBe(0);
    expect(st(c, rd(1030)).handsDownMs).toBe(0);
    expect(st(c, rd(1100)).handsDownMs).toBe(70);
    expect(st(c, rd(1280)).handsDownMs).toBe(250);
    expect(st(c, rd(1310, { up: [false, true] })).handsDownMs).toBe(0);
    expect(st(c, rd(1340)).handsDownMs).toBe(0);
    expect(st(c, rd(1370, { present: false })).handsDownMs).toBe(0);
    expect(st(c, rd(1400)).handsDownMs).toBe(0);
    expect(st(c, rd(1430)).handsDownMs).toBe(30);
  });
});

describe('reset', () => {
  it('forgets the jump, the stride and both holds', () => {
    const c = new ChannelReader();
    jog(c, 1000, 3, 5);
    st(c, rd(2400, { up: true })); st(c, rd(2900, { up: true }));
    st(c, rd(3000, { air: true }), [takeoff(2990, 3000)]);
    c.reset();
    expect(st(c, rd(3033))).toEqual({ inJump: false, stride: null, handsUpMs: 0, handsDownMs: 0 });
  });
});
