// hoops-p01 (1v1 / 3v3 ten-phase pass, phase 1 "controls that answer"): the handler's stick gates, on the real DribbleController at
// 60 fps (the headless half of scripts/probes/hoops-gap's stick / stopLine tests; the rig reads the same numbers in the browser).
// The bands are the hoops-audit's proposal (docs/HOOPS-GOAL-GAP.md C5), not owner numbers — assumption, recorded in the lane's report.
import { afterEach, describe, expect, it } from 'vitest';
import { DribbleController } from '../../core/BasketballCore';
import { CourtMovement, DEFAULT_MOVEMENT, GEARS_HOOPS } from '../../core/CourtMovement';
import { RELEASE_STICK_PRESET } from '../../core/HoopsStick';
import { FEEL_STORAGE_KEY, resetFeelForTests, setFeelSession, setFeelUser } from '../../../feel-panel/feel';
import { feelSessionBlock } from '../../../feel-panel/sessionGate';

const DT = 1 / 60;
type Body = { update: (dt: number, x: number, y: number, s: boolean) => unknown; vel: { x: number; z: number } };
const g = globalThis as { window?: unknown };
function openPanel(o: Record<string, number>): void {
  resetFeelForTests();
  const m = new Map<string, string>([[FEEL_STORAGE_KEY, JSON.stringify(o)]]);
  g.window = { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } } };
  setFeelUser(true); setFeelSession(feelSessionBlock('/play/onevone', '?playtest=1'));
}

/** The rig's stick test: from a standstill, the stick full sideways — the frames until the root has moved 2 cm and until 90 % of the pace;
 *  then the stick thrown straight back — the frames until the body runs the new way at half that pace. */
function stick(sprint: boolean) {
  const d = new DribbleController(); let x = 0, onset = -1; const sp: number[] = [];
  for (let i = 1; i <= 120; i++) { d.update(DT, 1, 0, sprint); x += d.vel.x * DT; if (onset < 0 && x > 0.02) onset = i; sp.push(Math.hypot(d.vel.x, d.vel.z)); }
  const pace = sp.at(-1)!; const to90 = sp.findIndex((v) => v >= 0.9 * pace) + 1;
  let rev = -1; for (let i = 1; i <= 120 && rev < 0; i++) { d.update(DT, -1, 0, sprint); if (-d.vel.x > 0.5 * pace) rev = i; }
  return { onset, to90, rev, pace };
}
/** The rig's stopLine: run straight for `sec`, let go of everything — the seconds to under 0.15 m/s and the metres slid. */
function stop(body: Body, sprint: boolean, sec: number) {
  for (let i = 0; i < Math.round(sec / DT); i++) body.update(DT, 1, 0, sprint);
  let m = 0;
  for (let i = 1; i <= 120; i++) { body.update(DT, 0, 0, false); m += Math.hypot(body.vel.x, body.vel.z) * DT; if (Math.hypot(body.vel.x, body.vel.z) < 0.15) return { sec: i * DT, m }; }
  return { sec: Infinity, m };
}

describe('the ball handler answers the stick (phase-1 gates, the defaults)', () => {
  afterEach(() => { resetFeelForTests(); delete g.window; });
  it('onset: the root moves 2 cm within 2 frames of the press (release 4)', () => {
    expect(stick(false).onset).toBeLessThanOrEqual(2);
    expect(stick(true).onset).toBeLessThanOrEqual(2);
  });
  it('90 % of the jog\'s pace within 0.25 s (release 0.45 s)', () => {
    expect(stick(false).to90 * DT).toBeLessThanOrEqual(0.25 + 1e-9);
  });
  it('stop from a jog ≤ 0.25 s and ≤ 0.6 m; from a sprint ≤ 0.35 s and ≤ 1.0 m (release 0.42 s / 1.40 m)', () => {
    const jog = stop(new DribbleController(), false, 1.0), sprint = stop(new DribbleController(), true, 1.6);
    expect(jog.sec).toBeLessThanOrEqual(0.25); expect(jog.m).toBeLessThanOrEqual(0.6);
    expect(sprint.sec).toBeLessThanOrEqual(0.35); expect(sprint.m).toBeLessThanOrEqual(1.0);
  });
  it('a reversal from a jog runs the new way at half the pace within 0.22 s (release 0.45 s)', () => {
    expect(stick(false).rev * DT).toBeLessThanOrEqual(0.22);
  });
  it('a reversal from a sprint is a retreat (the owner\'s 0.7-of-a-jog backpedal): half the SPRINT pace is never reached — a finding, pinned', () => {
    expect(stick(true).rev).toBe(-1);
  });
  it('one paste puts release back: RELEASE_STICK_PRESET misses every one of these gates exactly as release did', () => {
    openPanel(RELEASE_STICK_PRESET);
    const s = stick(false);
    expect([s.onset, s.to90, s.rev]).toEqual([4, 27, 27]);
    const sp = stop(new DribbleController(), true, 1.6);
    expect(sp.sec).toBeCloseTo(25 / 60, 6);
  });
  it('the dunk approach (GEARS_HOOPS, another lane\'s mode) is untouched: its stop is release\'s', () => {
    const a = stop(new CourtMovement({ ...DEFAULT_MOVEMENT, gears: GEARS_HOOPS }) as unknown as Body, true, 1.6);
    expect(a.sec).toBeCloseTo(25 / 60, 6);
  });
  it('the step-back\'s committed hop still glides on the release stop (its travel is the move\'s separation)', () => {
    const hop = (h: DribbleController) => { h.stepBack(0, 1, false); let m = 0; for (let i = 0; i < 18; i++) { h.update(DT, 0, -1, false); m += Math.hypot(h.vel.x, h.vel.z) * DT; } return m; };   // the 0.3 s commit
    const now = hop(new DribbleController());
    openPanel(RELEASE_STICK_PRESET);
    expect(now).toBeCloseTo(hop(new DribbleController()), 6);
  });
});
