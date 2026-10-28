// lane/hoops-reverse (owner 2026-10-23: port PR #311's H3a onto today's hoops). Three things are pinned here:
//   1. THE REVERSAL FIX: a stick thrown straight back now reverses the handler (it used to put him back on the old line after the plant);
//   2. the defaults are TODAY'S game: a scripted session with no reversal in it is, frame for frame, what release did before this lane;
//   3. the H3a preset, applied through the real feel panel (a playtest run only), reproduces #311's own measured numbers.
import { afterEach, describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { DribbleController } from './BasketballCore';
import { CourtMovement, DEFAULT_MOVEMENT, GEARS_HOOPS, type GearTuning } from './CourtMovement';
import {
  H3A_STICK_PRESET, RELEASE_STICK_PRESET, HOOPS_CUT_SEC, HOOPS_GEAR_DOWN_DECEL, HOOPS_HANDLER_TURN_DEG, HOOPS_JERK, HOOPS_JOG_ACCEL, HOOPS_JOG_TAU, HOOPS_KICK_SEC,
  HOOPS_LOAD_SCALE, HOOPS_PLANT_DECEL, HOOPS_REVERSE_DECEL, HOOPS_REVERSE_DEG, HOOPS_SPRINT_ACCEL, HOOPS_SPRINT_TAU, HOOPS_STOP_DECEL_HIGH,
  HOOPS_STOP_DECEL_LOW, HOOPS_TURN_TRUE_ARC, HOOPS_RETREAT_SPEED_K, jerkLimit, turnToward,
} from './HoopsStick';
import { FEEL_KNOB_BY_ID, clampKnob } from '../../feel-panel/knobs';
import { FEEL_STORAGE_KEY, resetFeelForTests, setFeelSession, setFeelUser } from '../../feel-panel/feel';
import { feelSessionBlock } from '../../feel-panel/sessionGate';

const DT = 1 / 60;
type Drive = (t: number) => [number, number, boolean];
/** Step a body `sec` seconds; returns each frame's [vx, vz]. */
function drive(d: { update: (dt: number, x: number, y: number, s: boolean) => unknown; vel: Vector3 }, sec: number, f: Drive, dt = DT): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < Math.round(sec / dt); i++) { const [x, y, s] = f(i * dt); d.update(dt, x, y, s); out.push([d.vel.x, d.vel.z]); }
  return out;
}
const FWD = (sprint = false): Drive => () => [0, -1, sprint];   // stick up = world +z (CourtMovement: -moveY)
const BACK = (sprint = false): Drive => () => [0, 1, sprint];
/** Seconds from the pull-back until the velocity along the old travel (+z) is below -0.05 m/s, or Infinity. */
const flipSec = (tr: [number, number][]) => { const i = tr.findIndex(([, vz]) => vz < -0.05); return i < 0 ? Infinity : (i + 1) * DT; };

describe('the defaults are release (no knob moved)', () => {
  it('every number is today\'s, GEARS_HOOPS is built from them, and the catalogue rows say the same', () => {
    expect([HOOPS_JOG_TAU, HOOPS_SPRINT_TAU, HOOPS_JOG_ACCEL, HOOPS_SPRINT_ACCEL, HOOPS_LOAD_SCALE, HOOPS_GEAR_DOWN_DECEL, HOOPS_STOP_DECEL_LOW, HOOPS_STOP_DECEL_HIGH])
      .toEqual([0.17, 0.15, 15, 24, 0.45, 9, 22, 11]);
    expect(HOOPS_PLANT_DECEL).toBeCloseTo(DEFAULT_MOVEMENT.decel * 1.4, 9);   // the plant: decel × 1.4, as before
    expect(HOOPS_HANDLER_TURN_DEG).toBe(DEFAULT_MOVEMENT.turnRateDegAtSpeed);
    expect([HOOPS_TURN_TRUE_ARC, HOOPS_KICK_SEC, HOOPS_CUT_SEC, HOOPS_JERK]).toEqual([0, 0, 0, 0]);   // H3a's smoothing: off
    expect([HOOPS_REVERSE_DEG, HOOPS_REVERSE_DECEL]).toEqual([135, 47.6]);   // THE FIX: on (assumption: its brake = today's plant)
    expect(GEARS_HOOPS).toMatchObject({ jogTau: 0.17, sprintTau: 0.15, jogAccel: 15, sprintAccel: 24, loadScale: 0.45, gearDownDecel: 9, stopDecelLow: 22, stopDecelHigh: 11 });
  });

  // test changed (hoops-p01): the handler's defaults are now TUNED (GEARS_HANDLER), so "no knob moved" is no longer release — the release
  // stick is RELEASE_STICK_PRESET, one paste on the panel, and this pins that the paste really is release, frame for frame
  it('with RELEASE_STICK_PRESET a session with no reversal in it is, frame for frame, what release did (start, turbo, off, 90° cut, drift, walk, stop, a 120° cross)', () => {
    openPanel(RELEASE_STICK_PRESET);
    // Recorded from origin/lane/finish-release d309b459 (before this lane) with the same script: [frame, vx, vz] every 12th frame.
    const BASE: [number, number, number][] = [[5, 0, 0.9006], [17, 0, 3.259], [29, 0, 4.0351], [41, 0, 4.2601], [53, 0, 4.3254], [65, 0, 5.8821], [77, 0, 6.274], [89, 0, 6.3693], [101, 0, 6.3925], [113, 0, 5.4963], [125, 0, 4.352], [137, 0, 4.352], [149, 1.8262, 3.7005], [161, 4.2866, 0], [173, 4.3331, 0], [185, 3.6482, 2.3508], [197, 3.0689, 3.0689], [209, 2.8623, 1.9082], [221, 1.6213, 1.0809], [233, 0, 0], [245, 0, 0], [257, 0, 0], [269, 0, 0], [281, 0, 0.9006], [293, 0, 3.259], [305, 0, 4.0351], [317, 0, 4.2601], [329, 3.9715, -2.2929], [341, 3.5098, -2.0264], [353, 3.7152, -2.1449], [365, 2.3836, -1.3762], [377, 0, 0], [389, 0, 0]];
    const c120 = Math.cos((120 * Math.PI) / 180), s120 = Math.sin((120 * Math.PI) / 180);
    const script: Drive = (t) => t < 1 ? [0, -1, false] : t < 1.8 ? [0, -1, true] : t < 2.4 ? [0, -1, false]
      : t < 3.0 ? [1, 0, false] : t < 3.4 ? [0.7, -0.7, false] : t < 3.8 ? [0.3, -0.2, false] : t < 4.6 ? [0, 0, false]
      : t < 5.4 ? [0, -1, false] : t < 6.0 ? [s120, -c120, false] : [0, 0, false];
    const tr = drive(new DribbleController(), 6.6, script);
    resetFeelForTests(); delete g.window;
    for (const [i, vx, vz] of BASE) { expect(tr[i][0], `frame ${i} vx`).toBeCloseTo(vx, 3); expect(tr[i][1], `frame ${i} vz`).toBeCloseTo(vz, 3); }
  });

  it('a mode without gears (combat, tennis, football) is untouched: its straight pull-back still steers, as before', () => {
    const m = new CourtMovement(DEFAULT_MOVEMENT);
    drive(m, 1.0, FWD());
    expect(flipSec(drive(m, 1.5, BACK()))).toBe(Infinity);   // (the same lerp bug — out of this lane's scope, recorded in the report)
  });
});

describe('THE REVERSAL FIX — a stick thrown straight back reverses the handler', () => {
  it('control: without the fix (no reverseDeg) a pull-back from a jog plants, then runs the OLD way again — the bug, measured', () => {
    const { reverseDeg: _r, ...noFix } = GEARS_HOOPS;
    const m = new CourtMovement({ ...DEFAULT_MOVEMENT, gears: noFix as GearTuning });
    drive(m, 1.5, FWD());
    const tr = drive(m, 1.5, BACK());
    expect(flipSec(tr)).toBe(Infinity);
    expect(tr.at(-1)![1]).toBeGreaterThan(4);   // back up to a full jog the old way
  });
  // (test changed, owner 2026-10-24: this lane's own check read "then the new way at ≥ 0.9 of a jog"; the retreat cap now holds a straight
  // pull-back to hoops.retreatSpeedK of a jog — the cap's own tests are below)
  it('with it (the default): a jog and a sprint both flip inside 0.25 s, and then retreat the new way at the retreat cap', () => {
    for (const sprint of [false, true]) {
      const d = new DribbleController();
      drive(d, 1.5, FWD(sprint));
      const tr = drive(d, 1.5, BACK(sprint));
      expect(flipSec(tr), sprint ? 'sprint' : 'jog').toBeLessThan(0.25);
      expect(tr.at(-1)![1]).toBeLessThan(-DEFAULT_MOVEMENT.maxSpeed * DEFAULT_MOVEMENT.jogFactor * HOOPS_RETREAT_SPEED_K * 0.99);
    }
  });
  it('a stick 140° round is a reversal too (brake through zero, never a slow swing round); 120° is still a turn', () => {
    const at = (deg: number) => { const r = (deg * Math.PI) / 180; return [Math.sin(r), -Math.cos(r)] as const; };   // deg from straight ahead
    const m = new CourtMovement({ ...DEFAULT_MOVEMENT, gears: GEARS_HOOPS });
    drive(m, 1.5, FWD());
    const [x, y] = at(140);
    const tr = drive(m, 0.6, () => [x, y, false]);
    const want = new Vector3(x, 0, -y).normalize();
    expect(Math.min(...tr.map(([vx, vz]) => Math.hypot(vx, vz)))).toBeLessThan(0.3);   // it passes through (nearly) zero
    expect((tr.at(-1)![0] * want.x + tr.at(-1)![1] * want.z) / Math.hypot(...tr.at(-1)!)).toBeGreaterThan(0.99);   // and leaves along the stick
    const n = new CourtMovement({ ...DEFAULT_MOVEMENT, gears: GEARS_HOOPS });
    drive(n, 1.5, FWD());
    const [x2, y2] = at(120);
    expect(Math.min(...drive(n, 0.6, () => [x2, y2, false]).map(([vx, vz]) => Math.hypot(vx, vz)))).toBeGreaterThan(0.5);   // a turn keeps moving
  });
  it('a frame with no time changes nothing and stays finite, in every phase, at the defaults and at the H3a preset (#311\'s zero-dt fix)', () => {
    for (const preset of [false, true]) {
      if (preset) openPanel(H3A_STICK_PRESET);
      const script: [number, number, boolean][] = [
        ...Array(30).fill([0, -1, false]), ...Array(20).fill([0, -1, true]), ...Array(10).fill([1, 0, false]), ...Array(10).fill([0, 1, false]), ...Array(20).fill([0, 0, false]),
      ];
      const d = new DribbleController();
      for (const [x, y, s] of script) {
        d.update(DT, x, y, s);
        const before = d.vel.clone();
        for (let k = 0; k < 3; k++) d.update(0, x, y, s);
        expect(Number.isFinite(d.vel.x) && Number.isFinite(d.vel.z)).toBe(true);
        expect(d.vel.subtract(before).length()).toBeLessThan(1e-9);
      }
      const a = new DribbleController(), b = new DribbleController();
      for (let i = 0; i < 40; i++) { a.update(DT, 0, -1, i > 20); b.update(DT, 0, -1, i > 20); if (i === 25) for (let k = 0; k < 5; k++) b.update(0, 0, -1, true); }
      for (let i = 0; i < 30; i++) { a.update(DT, 0, 0, false); b.update(DT, 0, 0, false); }
      expect(b.vel.subtract(a.vel).length()).toBeLessThan(1e-9);
      resetFeelForTests(); delete g.window;
    }
  });
});

const g = globalThis as { window?: unknown };
function openPanel(o: Record<string, number>, search = '?playtest=1'): void {
  resetFeelForTests();
  const m = new Map<string, string>([[FEEL_STORAGE_KEY, JSON.stringify(o)]]);
  g.window = { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } } };
  setFeelUser(true); setFeelSession(feelSessionBlock('/play/onevone', search));
}

describe('the H3a preset (group "Hoops · movement"): #311\'s tuned stick, through the feel panel', () => {
  afterEach(() => { resetFeelForTests(); delete g.window; });

  it('every preset id is a registered knob, and every value is inside its bounds and on its grid', () => {
    for (const [id, v] of Object.entries(H3A_STICK_PRESET)) {
      const k = FEEL_KNOB_BY_ID.get(id);
      expect(k, id).toBeDefined();
      expect(k!.group).toBe('Hoops · movement');
      expect(clampKnob(k!, v), id).toBe(v);
    }
  });

  /** #311's own measurements (its commit body, scripts/probes/_stick-response.mts), within a frame. */
  const measure = () => {
    const ms = (s: number) => Math.round(s * 1000);
    const jog = drive(new DribbleController(), 1.5, FWD()).map(([x, z]) => Math.hypot(x, z));
    const top = Math.max(...jog);
    const start90 = ms((jog.findIndex((s) => s >= 0.9 * top) + 1) * DT);
    const stopFrom = (sprint: boolean) => { const d = new DribbleController(); drive(d, 1.5, FWD(sprint)); return ms((drive(d, 1.5, () => [0, 0, false]).findIndex(([x, z]) => Math.hypot(x, z) < 0.3) + 1) * DT); };
    return { start90, stopJog: stopFrom(false), stopSprint: stopFrom(true) };
  };
  // test changed (hoops-p01): the closed panel is the handler's TUNED stick now (H3a's start and stops + the first step); release is the paste
  it('closed panel: the handler\'s numbers (start 250 ms, stops 150 / 217 ms — to under 0.3 m/s); RELEASE_STICK_PRESET: release\'s (450, 233 / 400 ms)', () => {
    expect(measure()).toEqual({ start90: 250, stopJog: 150, stopSprint: 217 });
    openPanel(RELEASE_STICK_PRESET);
    expect(measure()).toEqual({ start90: 450, stopJog: 233, stopSprint: 400 });
  });
  it('the preset in a playtest run: #311\'s numbers (start 267 ms, stops 150 / 233 ms), and the reversal still flips', () => {
    openPanel(H3A_STICK_PRESET);
    expect(measure()).toEqual({ start90: 267, stopJog: 150, stopSprint: 233 });
    const d = new DribbleController(); drive(d, 1.5, FWD());
    expect(flipSec(drive(d, 1.5, BACK()))).toBeLessThan(0.3);
  });
  it('the preset smooths the snaps: no one-frame speed jump over 0.6 m/s across a start, turbo, cut, reversal and stop (today 1.13)', () => {
    const script: Drive = (t) => t < 1 ? [0, -1, false] : t < 1.8 ? [0, -1, true] : t < 2.4 ? [0, -1, false] : t < 3.0 ? [1, 0, false] : t < 3.6 ? [-1, 0, false] : [0, 0, false];
    const jump = (tr: [number, number][]) => Math.max(...tr.slice(1).map(([x, z], i) => Math.hypot(x - tr[i][0], z - tr[i][1])));
    expect(jump(drive(new DribbleController(), 4.4, script))).toBeGreaterThan(1.0);
    openPanel(H3A_STICK_PRESET);
    expect(jump(drive(new DribbleController(), 4.4, script))).toBeLessThan(0.6);
  });
  it('a ranked / paid run ignores the device\'s overrides: the defaults\' numbers', () => {
    openPanel(RELEASE_STICK_PRESET, '?ranked=1');   // test changed (hoops-p01): the defaults are the handler's; a release paste is ignored there too
    expect(measure()).toEqual({ start90: 250, stopJog: 150, stopSprint: 217 });
  });
  it('the turn rate knob moves the ball handler only, never the dunk approach (#311 set 720 on the DribbleController alone)', () => {
    // a 90° stick from a jog: the travel's heading 0.1 s later (a 90° stick is no crossover: that needs a reversal of the stick)
    const cut = (m: { update: (dt: number, x: number, y: number, s: boolean) => unknown; vel: Vector3 }) => { drive(m, 1.0, FWD()); const tr = drive(m, 0.1, () => [1, 0, false]); return Math.atan2(tr.at(-1)![0], tr.at(-1)![1]); };
    const approach = () => new CourtMovement({ ...DEFAULT_MOVEMENT, gears: GEARS_HOOPS });   // DunkMode's approachMove: GEARS_HOOPS, no turnRateDeg
    const closed = { handler: cut(new DribbleController()), approach: cut(approach()) };
    openPanel({ 'hoops.handlerTurnDeg': 1080 });
    expect(cut(new DribbleController())).toBeGreaterThan(closed.handler + 0.1);   // the handler turns quicker
    expect(cut(approach())).toBeCloseTo(closed.approach, 9);                      // the dunk approach does not
  });
});

describe('THE RETREAT CAP (owner 2026-10-24: "a real backpedal is slower than running forward") — hoops.retreatSpeedK 0.7', () => {
  afterEach(() => { resetFeelForTests(); delete g.window; });
  const JOG = DEFAULT_MOVEMENT.maxSpeed * DEFAULT_MOVEMENT.jogFactor;   // 4.352 m/s at a full stick
  const speed = (tr: [number, number][]) => Math.hypot(...tr.at(-1)!);
  /** Run forward (the facing comes round to the run), then hold the stick straight back: the retreat dribble. */
  const retreat = (sprint: boolean) => { const d = new DribbleController(); drive(d, 1.5, FWD(sprint)); const tr = drive(d, 1.5, BACK(sprint)); return { tr, d }; };
  it('a held straight pull-back retreats at no more than 0.7 of a jog (from a jog and with the turbo held), facing kept, after the same flip', () => {
    for (const sprint of [false, true]) {
      const { tr, d } = retreat(sprint);
      expect(speed(tr), sprint ? 'turbo' : 'jog').toBeLessThanOrEqual(HOOPS_RETREAT_SPEED_K * JOG + 1e-9);
      expect(speed(tr)).toBeGreaterThan(HOOPS_RETREAT_SPEED_K * JOG * 0.99);   // it does retreat, at the cap
      expect(tr.at(-1)![1]).toBeLessThan(0);                                   // the new way
      expect(Math.cos(d.facing)).toBeGreaterThan(0.99);                        // the chest still up the court (+z)
      expect(flipSec(tr)).toBeLessThan(0.25);                                  // the reversal itself is unchanged
    }
  });
  it('forward runs, sprints and lateral slides are not capped', () => {
    const fwd = (sprint: boolean) => speed(drive(new DribbleController(), 1.5, FWD(sprint)));
    expect(fwd(false)).toBeCloseTo(JOG, 2);
    expect(fwd(true)).toBeCloseTo(DEFAULT_MOVEMENT.maxSpeed, 2);
    const side = new DribbleController(); drive(side, 1.0, FWD());
    expect(speed(drive(side, 1.2, () => [1, 0, false]))).toBeCloseTo(JOG, 2);   // a 90° stick: a cut, then a full jog the new way
    const slide = new DribbleController();   // a slow slide off a standstill, the stick square to the facing
    expect(speed(drive(slide, 1.2, () => [1, 0, false]))).toBeCloseTo(JOG, 2);
  });
  it('at 1.0 the knob is off: the retreat runs at a full jog (a full sprint on the turbo), exactly as before the cap', () => {
    openPanel({ 'hoops.retreatSpeedK': 1 });
    expect(speed(retreat(false).tr)).toBeCloseTo(JOG, 2);
    expect(speed(retreat(true).tr)).toBeCloseTo(DEFAULT_MOVEMENT.maxSpeed, 2);
    expect(flipSec(retreat(false).tr)).toBeCloseTo(0.117, 2);   // test changed (hoops-p01): 0.217 → 0.117, the reversal's plant brakes through (hoops.reversePlantHold 0)
  });
  it('the dunk approach (CourtMovement with no DribbleController) never reads it', () => {
    openPanel({ 'hoops.retreatSpeedK': 0.3 });
    const m = new CourtMovement({ ...DEFAULT_MOVEMENT, gears: GEARS_HOOPS });
    drive(m, 1.5, FWD());
    expect(speed(drive(m, 1.5, BACK()))).toBeCloseTo(JOG, 2);
  });
});

describe('the helpers', () => {
  it('turnToward with trueArc 0 is exactly the old Vector3.Lerp(dir, want, k).normalize(); with 1 it turns the full k × angle', () => {
    const d = new Vector3(0, 0, 1), w = new Vector3(1, 0, 0), k = 0.2, angle = Math.PI / 2;
    const old = Vector3.Lerp(d, w, k).normalize();
    const a = turnToward(d.clone(), w, angle, k, false);
    expect([a.x, a.y, a.z]).toEqual([old.x, old.y, old.z]);
    const b = turnToward(d.clone(), w, angle, k, true);
    expect(Math.atan2(b.x, b.z)).toBeCloseTo(k * angle, 9);
    expect(Math.atan2(old.x, old.z)).toBeLessThan(k * angle * 0.8);   // the lerp's shortfall on a wide angle
  });
  it('jerkLimit: the acceleration moves at most jerk·dt from last frame\'s; a zero-dt frame returns the speed unchanged', () => {
    expect(jerkLimit(2, 2 + 30 * DT, 0, 900, DT, 60)).toBeCloseTo(2 + 15 * DT, 9);   // wanted +30 m/s², allowed 0 + 900/60 = 15
    expect(jerkLimit(2, 2 - 30 * DT, 10, 900, DT, 60)).toBeCloseTo(2 - 5 * DT, 9);  // from +10 the brake comes on at −5
    expect(jerkLimit(2, 2, 25, 900, 0, 0)).toBe(2);
  });
});
