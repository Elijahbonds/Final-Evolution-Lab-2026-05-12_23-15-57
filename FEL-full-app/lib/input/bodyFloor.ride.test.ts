// MOVEMENT PLAY P8 (2026-09-26): the floor's ride kinds on hand-built packets (bodyFloor.test's pattern), so every edge sits
// where the rule says: the carve / wheel / bank / trim / pitch axes (ON / OFF, the dwell, the ramp, held through a jump,
// unread = 0), the grip / spread / high-knees triggers, the kart's drift hold on a hop into a turned wheel, Free Run's own
// cadence band. The real streams: lib/pose/rideGate.test.ts; the models they drive: lib/babylon/core/rideBody.gate.test.ts.
import { describe, it, expect } from 'vitest';
import {
  BodyFloor, CARVE_ON, CARVE_OFF, CARVE_FULL, RIDE_DWELL_MS, TRIM_ON, TRIM_FULL, WHEEL_ON_DEG, WHEEL_OFF_DEG, WHEEL_FULL_DEG,
  BANK_ON_DEG, PITCH_ON_DEG, HIGH_KNEES_DRIVE, HIGH_KNEES_HZ, HIGH_KNEES_ON_MS, HIGH_KNEES_OFF_MS, DRIFT_ON, DRIFT_OFF_MS, DRIFT_GRIP_MS,
  RACE_OPEN_MS, RACE_GO_MS,
} from './bodyFloor';
import { GO_AT, ROCKET_EARLIEST, ROCKET_LATEST } from '@/lib/babylon/racing/RaceStart';
import { RIDE_ROWS_ON } from './rideProfiles';
import type { BodyOut, BodyPacket } from '@/lib/babylon/core/InputBus';
import type { BodyEvent, BodyRead } from '@/lib/pose/BodyReader';
import type { BodyChannels } from '@/lib/pose/bodyChannels';
import { NO_RIDE, type RideRead } from '@/lib/pose/rideReader';

const ROW = Object.fromEntries(RIDE_ROWS_ON.map((p) => [p.key, p]));

function read(t: number, air = false): BodyRead {
  return {
    t, present: true, conf: 0.9, calibrated: true, tracking: true, rulers: null, hip: { x: 0.5, y: 0.55, heightM: 0.95, vy: 0 },
    feet: { L: { heightM: air ? 0.12 : 0, contact: !air }, R: { heightM: air ? 0.12 : 0, contact: !air } } as BodyRead['feet'],
    airborne: air, knee: null, wrist: null, elbowDeg: null, lean: { sideSw: 0, trunkDeg: 0, trunkFwdDeg: 0 }, squat: air ? null : 0, yaw: null,
  };
}
const side = { kind: 'side' as const, lead: 'L' as const, yawDeg: -45, n: { x: 0.7, z: 0.7 }, b: { x: 0.7, z: -0.7 }, neutral: 0, t: 0 };
const ride = (o: Partial<RideRead> = {}): RideRead => ({ ...NO_RIDE, ...o } as RideRead);
const pk = (t: number, r: Partial<RideRead>, ch: Partial<BodyChannels> = {}, events: BodyEvent[] = [], air = false): BodyPacket =>
  ({ read: read(t, air), events, channels: { inJump: false, stride: null, handsUpMs: 0, handsDownMs: 0, ride: ride(r), ...ch }, arrivedAt: t + 66 });
const takeoff = (t: number): BodyEvent => ({ kind: 'takeoff', t: t - 100, seen: t, feet: 'two', foot: 'both', v0: 2.4, predictedHeightM: 0.29 });
const go = (f: BodyFloor, p: BodyPacket): BodyOut[] => f.step(p, p.arrivedAt, false);
const sticks = (o: BodyOut[]) => o.filter((e) => e.t === 'stick').map((e) => (e.t === 'stick' ? [e.x, e.y] : []));
const trigs = (o: BodyOut[]) => o.filter((e) => e.t === 'trigger').map((e) => (e.t === 'trigger' ? e.value : NaN));
const buttons = (o: BodyOut[]) => o.filter((e) => e.t === 'button').map((e) => (e.t === 'button' ? `${e.btn}${e.pressed ? '+' : '-'}` : ''));

describe('the carve (skate / snow / surf x)', () => {
  it(`engages past CARVE_ON (${CARVE_ON}) after the ${RIDE_DWELL_MS} ms dwell, ramps from CARVE_OFF to full at ${CARVE_FULL}, lets go under CARVE_OFF`, () => {
    const f = new BodyFloor(ROW.skateboard);
    const st = { stance: side, steerSign: 1 as const };
    const D = RIDE_DWELL_MS;
    expect(go(f, pk(0, { ...st, carve: CARVE_ON + 0.01 }))).toEqual([]);
    expect(go(f, pk(D - 1, { ...st, carve: CARVE_ON + 0.01 }))).toEqual([]);                       // inside the dwell
    const on = sticks(go(f, pk(D, { ...st, carve: CARVE_ON + 0.01 })));
    expect(on.length).toBe(1);
    expect(on[0][0]).toBeGreaterThan(0);
    expect(sticks(go(f, pk(D + 33, { ...st, carve: CARVE_FULL + 0.05 })))).toEqual([[1, 0]]);
    expect(sticks(go(f, pk(D + 66, { ...st, carve: (CARVE_ON + CARVE_OFF) / 2 })))[0][0]).toBeGreaterThan(0);   // hysteresis: still on
    expect(sticks(go(f, pk(D + 100, { ...st, carve: CARVE_OFF - 0.005 })))).toEqual([[0, 0]]);
  });
  it('a flicker under the dwell never steers; the steer sign turns a right lead\'s toe into a left turn', () => {
    const f = new BodyFloor(ROW.skateboard);
    const out: BodyOut[] = [];
    for (let t = 0; t < 2000; t += 33) out.push(...go(f, pk(t, { stance: side, carve: (t / 33) % 4 < 2 ? 0.12 : 0 })));   // 66 ms on, 66 off
    expect(out).toEqual([]);
    const g = new BodyFloor(ROW.skateboard);
    for (let t = 0; t <= 200; t += 33) go(g, pk(t, { stance: { ...side, lead: 'R' }, steerSign: -1, carve: 0.2 }));
    expect(sticks(go(g, pk(233, { stance: { ...side, lead: 'R' }, steerSign: -1, carve: 0.3 })))[0][0]).toBe(-1);
  });
  it('held through a jump (the grounded value), and unread is 0 — never a guess', () => {
    const f = new BodyFloor(ROW.skateboard);
    for (let t = 0; t <= 133; t += 33) go(f, pk(t, { stance: side, carve: 0.3 }));
    expect(go(f, pk(166, { stance: side, carve: -0.3 }, { inJump: true }, [], true)).filter((e) => e.t === 'stick')).toEqual([]);   // held
    expect(sticks(go(f, pk(200, { stance: side, carve: null })))).toEqual([[0, 0]]);
  });
});

describe('surf\'s trim (y) and the wings\' pitch (y)', () => {
  it(`surf: compressing past TRIM_ON (${TRIM_ON}/s) drops in (−y), extending climbs (+y); full at ${TRIM_FULL}`, () => {
    const f = new BodyFloor(ROW.surf);
    for (let t = 0; t <= 66; t += 33) go(f, pk(t, { stance: side, trimRate: 1.2 }));
    const a = sticks(go(f, pk(100, { stance: side, trimRate: 1.2 })));
    expect(a[0][1]).toBeLessThan(0);
    expect(sticks(go(f, pk(133, { stance: side, trimRate: -TRIM_FULL })))).toEqual([[0, 1]]);
  });
  it('aero: raised wings climb (+y), lowered dive (−y), past PITCH_ON after the dwell; folded wings read nothing', () => {
    const f = new BodyFloor(ROW.aeroaces);
    const w = (pitchDeg: number | null, on = true) => ({ wings: { on, bankDeg: 0, pitchDeg } });
    expect(go(f, pk(0, w(PITCH_ON_DEG + 4))).filter((e) => e.t === 'stick')).toEqual([]);
    expect(sticks(go(f, pk(RIDE_DWELL_MS, w(PITCH_ON_DEG + 4))))[0][1]).toBeGreaterThan(0);
    expect(sticks(go(f, pk(RIDE_DWELL_MS + 33, w(null, false))))).toEqual([[0, 0]]);
  });
});

describe('the wheel (kart x) and the wings\' bank (aero x)', () => {
  it(`the wheel: steer only while gripped, past ${WHEEL_ON_DEG}° after the dwell, full at ${WHEEL_FULL_DEG}°, off under ${WHEEL_OFF_DEG}°`, () => {
    const f = new BodyFloor(ROW.velocitykart);
    const wh = (deg: number | null, grip = true) => ({ wheel: { grip, angleDeg: deg, since: 0 } });
    expect(go(f, pk(0, wh(30))).filter((e) => e.t === 'stick')).toEqual([]);
    expect(sticks(go(f, pk(RIDE_DWELL_MS, wh(30))))[0][0]).toBeGreaterThan(0);
    expect(sticks(go(f, pk(RIDE_DWELL_MS + 33, wh(-WHEEL_FULL_DEG - 5))))).toEqual([[-1, 0]]);
    expect(sticks(go(f, pk(RIDE_DWELL_MS + 66, wh(WHEEL_OFF_DEG - 1))))).toEqual([[0, 0]]);
    // let go of the wheel: the axis is unread (0), whatever the arms do
    const g = new BodyFloor(ROW.velocitykart);
    const out: BodyOut[] = [];
    for (let t = 0; t < 1000; t += 33) out.push(...go(g, pk(t, wh(40, false))));
    expect(sticks(out)).toEqual([]);
  });
  it(`the wings' bank past ${BANK_ON_DEG}° turns (right wing down = right), only while the wings are out`, () => {
    const f = new BodyFloor(ROW.aeroaces);
    expect(go(f, pk(0, { wings: { on: true, bankDeg: -20, pitchDeg: 0 } })).filter((e) => e.t === 'stick')).toEqual([]);
    expect(sticks(go(f, pk(RIDE_DWELL_MS, { wings: { on: true, bankDeg: -20, pitchDeg: 0 } })))[0][0]).toBeLessThan(0);
  });
});

describe('the ride triggers', () => {
  it('the kart\'s grip is the gas (RT 1 while gripped, held through a hop); the plane\'s spread wings are its gas', () => {
    const f = new BodyFloor(ROW.velocitykart);
    const g = { wheel: { grip: true, angleDeg: 0, since: 0 } };
    expect(trigs(go(f, pk(0, g)))).toEqual([1]);
    expect(trigs(go(f, pk(33, { wheel: { grip: false, angleDeg: null, since: 0 } }, { inJump: true }, [], true)))).toEqual([]);   // held in the air
    expect(trigs(go(f, pk(66, { wheel: { grip: false, angleDeg: null, since: 0 } })))).toEqual([0]);
    const a = new BodyFloor(ROW.aeroaces);
    expect(trigs(go(a, pk(0, { wings: { on: true, bankDeg: 0, pitchDeg: 0 } })))).toEqual([1]);
  });
  it(`Free Run's high knees: the knee ≥ ${HIGH_KNEES_DRIVE} thigh at a running stride, on after ${HIGH_KNEES_ON_MS} ms, off after ${HIGH_KNEES_OFF_MS} ms; a jog's knees never`, () => {
    const f = new BodyFloor(ROW.freerun);
    const knees = (drive: number) => ({ kneeDrive: drive, kneeDriveRecent: drive >= 0.5, running: true, stepHz: 3.4, kneeHz: 3.4 });
    const strideCh = { stride: { hz: 3.4, drive: 1 } };
    const out: BodyOut[] = [];
    for (let t = 0; t <= 133; t += 33) out.push(...go(f, pk(t, knees(0.8), strideCh)));
    expect(trigs(out)).toEqual([]);
    expect(trigs(go(f, pk(166, knees(0.8), strideCh)))).toEqual([1]);
    // the knees drop at 200: the trigger lets go at the first packet HIGH_KNEES_OFF_MS later, not before
    const off: [number, number[]][] = [];
    for (let t = 200; t <= 600; t += 33) off.push([t, trigs(go(f, pk(t, knees(0.3), strideCh)))]);
    const at = off.filter(([, v]) => v.length);
    expect(at.map(([, v]) => v)).toEqual([[0]]);
    expect(at[0][0]).toBe(off.find(([t]) => t - 200 >= HIGH_KNEES_OFF_MS)![0]);
    const j = new BodyFloor(ROW.freerun);
    const jo: BodyOut[] = [];
    for (let t = 0; t < 2000; t += 33) jo.push(...go(j, pk(t, knees(0.45), strideCh)));
    expect(trigs(jo)).toEqual([]);
  });
  it(`review fix: high knees read the KNEE rate (the rate at each of the last two real steps, the lower) — the run's own rate at ${HIGH_KNEES_HZ}+ with the knee rate under it is no SPRINT`, () => {
    const f = new BodyFloor(ROW.freerun);
    const out: BodyOut[] = [];
    // CMU 91_19 at 15 fps (seed 41): knees to the hip, the run's rate 2.56 at one step off a pair told 100 ms apart, less at the next
    for (let t = 0; t < 2000; t += 33) out.push(...go(f, pk(t, { kneeDrive: 0.9, kneeDriveRecent: true, running: true, stepHz: 2.56, kneeHz: 2.18 }, { stride: { hz: 2.56, drive: 1 } })));
    expect(trigs(out)).toEqual([]);
  });
});

describe('review fix (2026-09-26): the race\'s count — a body racer\'s gas taken early waits for GO, one taken on "2" is the rocket', () => {
  const grip = (on: boolean) => ({ wheel: { grip: on, angleDeg: on ? 0 : null, since: 0 } });
  /** The floor's RT against the count: frames every 33 ms from the wake (begin() then its first packet), gripped from `gripAt`. */
  const race = (key: 'velocitykart' | 'aeroaces', gripAt: number, begin = true) => {
    const f = new BodyFloor(ROW[key]);
    if (begin) f.begin();
    const rt: { t: number; v: number }[] = [];
    for (let t = 0; t <= 5000; t += 33) {
      const on = t >= gripAt;
      const r = key === 'velocitykart' ? grip(on) : { wings: { on, bankDeg: on ? 0 : null, pitchDeg: on ? 0 : null } };
      for (const v of trigs(go(f, pk(t, r)))) rt.push({ t, v });
    }
    return rt;
  };
  it(`the constants are the count's own: the window opens ${(GO_AT - ROCKET_EARLIEST) * 1000} ms after the wake (+100 ms margin), GO at ${GO_AT * 1000}`, () => {
    expect(RACE_OPEN_MS).toBe((GO_AT - ROCKET_EARLIEST) * 1000 + 100);
    expect(RACE_GO_MS).toBe(GO_AT * 1000);
    expect(RACE_OPEN_MS).toBeLessThan((GO_AT - ROCKET_LATEST) * 1000);
  });
  for (const key of ['velocitykart', 'aeroaces'] as const) {
    it(`${key}: taken at once (1.1 s, the arms dropped onto it) → held at 0 until GO, then the gas: a normal start, never the burnout`, () => {
      const rt = race(key, 1100);
      expect(rt[0]).toEqual({ t: rt[0].t, v: 1 });
      expect(rt[0].t).toBeGreaterThanOrEqual(RACE_GO_MS);
      expect(rt[0].t).toBeLessThan(RACE_GO_MS + 40);
    });
    it(`${key}: taken on "2" (2.0 s) → the gas at once: the rocket, earned`, () => {
      const rt = race(key, 2000);
      expect(rt[0].v).toBe(1);
      expect(rt[0].t).toBeGreaterThanOrEqual(2000);
      expect(rt[0].t).toBeLessThan(2040);
    });
    it(`${key}: taken early, let go and taken again on "2" → the second take passes`, () => {
      const f = new BodyFloor(ROW[key]);
      f.begin();
      const on = (t: number) => (t >= 800 && t < 1400) || t >= 2000;
      const rt: { t: number; v: number }[] = [];
      for (let t = 0; t <= 4000; t += 33) {
        const r = key === 'velocitykart' ? grip(on(t)) : { wings: { on: on(t), bankDeg: 0, pitchDeg: 0 } };
        for (const v of trigs(go(f, pk(t, r)))) rt.push({ t, v });
      }
      expect(rt.filter((x) => x.v === 1).map((x) => x.t)[0]).toBeGreaterThanOrEqual(2000);
      expect(rt.filter((x) => x.v === 1).map((x) => x.t)[0]).toBeLessThan(2040);
    });
  }
  it('only the first begin() is the wake: a resume (a second begin) holds nothing; a floor never begun holds nothing', () => {
    const f = new BodyFloor(ROW.velocitykart);
    f.begin();
    for (let t = 0; t <= 4000; t += 33) go(f, pk(t, grip(false)));
    f.begin();   // a resume mid-race
    expect(trigs(go(f, pk(4033, grip(true))))).toEqual([1]);
    expect(race('velocitykart', 0, false)[0]).toEqual({ t: 0, v: 1 });
  });
  it('the boards\' and Free Run\'s triggers have no count', () => {
    const f = new BodyFloor(ROW.freerun);
    f.begin();
    const out: BodyOut[] = [];
    for (let t = 0; t <= 300; t += 33) out.push(...go(f, pk(t, { kneeDrive: 0.9, kneeDriveRecent: true, running: true, stepHz: 3.4, kneeHz: 3.4 }, { stride: { hz: 3.4, drive: 1 } })));
    expect(trigs(out)).toEqual([1]);
  });
});

describe('the kart\'s drift: a hop into a turned wheel', () => {
  // (the wheel gripped a second before these frames: R-F2's DRIFT_GRIP_MS is met unless a test says otherwise)
  const wh = (deg: number, grip = true, since = -1000) => ({ wheel: { grip, angleDeg: deg, since } });
  const turnTo = (f: BodyFloor, deg: number) => { for (let t = 0; t <= 133; t += 33) go(f, pk(t, wh(deg))); };
  it(`holds X from the take-off while the stick is ≥ ${DRIFT_ON}; lets go once it is back near centre for ${DRIFT_OFF_MS} ms`, () => {
    const f = new BodyFloor(ROW.velocitykart);
    turnTo(f, 35);
    expect(buttons(go(f, pk(166, wh(35), {}, [takeoff(166)])))).toEqual(['X+']);
    expect(buttons(go(f, pk(200, wh(35), { inJump: true }, [], true)))).toEqual([]);
    expect(buttons(go(f, pk(800, wh(35))))).toEqual([]);                         // still turned: still sliding
    expect(buttons(go(f, pk(833, wh(0))))).toEqual([]);
    expect(buttons(go(f, pk(833 + DRIFT_OFF_MS, wh(0))))).toEqual(['X-']);
  });
  it('a hop with the wheel near centre is only a hop (no drift); letting go of the wheel lets go of the drift; release() lets go too', () => {
    const f = new BodyFloor(ROW.velocitykart);
    turnTo(f, 10);
    expect(buttons(go(f, pk(166, wh(10), {}, [takeoff(166)])))).toEqual([]);
    const g = new BodyFloor(ROW.velocitykart);
    turnTo(g, 40);
    go(g, pk(166, wh(40), {}, [takeoff(166)]));
    expect(buttons(go(g, pk(400, wh(40, false))))).toEqual(['X-']);
    const h = new BodyFloor(ROW.velocitykart);
    turnTo(h, 40);
    go(h, pk(166, wh(40), {}, [takeoff(166)]));
    expect(buttons(h.release())).toEqual(['X-']);
  });
  it(`R-F2: a hop with the wheel turned but gripped under ${DRIFT_GRIP_MS} ms before the take-off is only a hop (arms that just landed where a wheel would be)`, () => {
    const f = new BodyFloor(ROW.velocitykart);
    for (let t = 0; t <= 133; t += 33) go(f, pk(t, wh(40, true, 0)));
    const tk = takeoff(166);   // told at 166, the feet left at 66: gripped 66 ms before
    expect(buttons(go(f, pk(166, wh(40, true, 0), {}, [tk])))).toEqual([]);
    const g = new BodyFloor(ROW.velocitykart);
    for (let t = 0; t <= 133; t += 33) go(g, pk(t, wh(40, true, 66 - DRIFT_GRIP_MS)));
    expect(buttons(go(g, pk(166, wh(40, true, 66 - DRIFT_GRIP_MS), {}, [tk])))).toEqual(['X+']);   // exactly DRIFT_GRIP_MS: a drift
  });
});

describe('Free Run\'s cadence band', () => {
  it('runs only while the ride read says RUNNING, on the real steps\' own rate; a still stand\'s jittered steps never move it', () => {
    const f = new BodyFloor(ROW.freerun);
    const jitter: BodyOut[] = [];
    for (let t = 0; t < 1500; t += 33) jitter.push(...go(f, pk(t, { running: false, stepHz: null }, { stride: { hz: 3, drive: 1 } })));
    expect(sticks(jitter)).toEqual([]);
    const out = sticks(go(f, pk(1533, { running: true, stepHz: 3.1 }, { stride: { hz: 3, drive: 1 } })));
    expect(out.length).toBe(1);
    expect(out[0][1]).toBeLessThanOrEqual(-0.9);   // forward = −y
    const walk = new BodyFloor(ROW.freerun);
    const w = sticks(go(walk, pk(0, { running: true, stepHz: 1.8 }, { stride: { hz: 1.8, drive: 0.4 } })));
    expect(w.length ? -w[0][1] : 0).toBeLessThan(0.5);
  });
});
