import { describe, expect, it } from 'vitest';
import { ABANDON_MS, RETEST_PAUSE_MS, ScreenRunner, mergeRetest, retestLine, type RunnerState } from './screenRunner';
import { FULL_SCREEN, MODIFIED_SCREEN } from './screen';
import type { FramingFrame, FramingPoint } from './framing';

/** A shot. `facing` decides whether the face is visible, which is how back-on is told from square-on. */
function shot(facing: 'front' | 'back' | 'side' = 'front'): FramingFrame {
  const ss = facing === 'side' ? 0.05 : 0.16, hs = 0.12, v = 0.95;
  const faceVis = facing === 'front' ? 0.95 : 0.05;
  const L: FramingPoint[] = [];
  const put = (i: number, x: number, y: number, vis = v) => { L[i] = { x, y, visibility: vis }; };
  put(0, 0.5, 0.10, faceVis); put(2, 0.48, 0.09, faceVis); put(5, 0.52, 0.09, faceVis);
  put(11, 0.5 - ss / 2, 0.20); put(12, 0.5 + ss / 2, 0.20);
  put(23, 0.5 - hs / 2, 0.52); put(24, 0.5 + hs / 2, 0.52);
  put(25, 0.5 - hs / 2, 0.70); put(26, 0.5 + hs / 2, 0.70);
  put(27, 0.5 - hs / 2, 0.90); put(28, 0.5 + hs / 2, 0.90);
  return { landmarks: L, present: true };
}
const NOTHING: FramingFrame = { landmarks: [], present: false };

/**
 * One shot ticked every `step` ms from `from` until the runner leaves the phase it is in for one of `until` (or `to`).
 * MIRROR-COACH P3 follow-up review (2026-09-28): a tick adds at most STATION_THRESHOLDS.clock.maxTickMs, and a gap of
 * ABANDON_MS is an absence — so a single tick "well past the hold" (these tests' old shorthand, and a render loop paused
 * in a hidden tab) no longer finishes a station. They tick at a frame rate now.
 */
function steady(r: ScreenRunner, f: FramingFrame | ((view: 'front' | 'back' | 'side') => FramingFrame), from: number, to: number, step = 100,
  until: readonly RunnerState['phase'][] = ['retest', 'stationDone', 'complete']): { s: RunnerState; t: number } {
  let s!: RunnerState, t = from;
  for (; t <= to; t += step) {
    s = r.tick(typeof f === 'function' ? f(r.station?.view ?? 'front') : f, t);
    if (until.includes(s.phase)) break;
  }
  return { s, t };
}

describe('running the screen', () => {
  it('opens facing AWAY, because the Playbook starts at the heels', () => {
    const r = new ScreenRunner('modified');
    const s = r.tick(shot('front'), 0);          // facing the camera is the wrong way for station one
    expect(s.station?.view).toBe('back');
    expect(s.phase).toBe('positioning');
    expect(s.say).toMatch(/turn all the way around/i);
  });

  it('the clock only runs on a good shot', () => {
    const r = new ScreenRunner('modified');
    r.tick(shot('back'), 0);
    const holding = r.tick(shot('back'), 4000);
    expect(holding.phase).toBe('holding');
    const before = holding.remainingSec;
    const lost = r.tick(NOTHING, 6000);           // out of frame: the clock stops
    expect(lost.phase).toBe('positioning');
    expect(lost.remainingSec).toBeCloseTo(before, 1);
  });

  it('stepping out PAUSES the station; disappearing restarts it', () => {
    const r = new ScreenRunner('modified');
    r.tick(shot('back'), 0);
    r.tick(shot('back'), 5000);                   // 5 s banked
    const brief = r.tick(NOTHING, 6000);
    expect(brief.remainingSec).toBeLessThan(r.station!.holdSec);   // still banked
    const gone = r.tick(NOTHING, 6000 + ABANDON_MS + 1);
    expect(gone.remainingSec).toBe(r.station!.holdSec);            // back to the top
  });

  it('completing a station moves to the next one and asks for the new view', () => {
    const r = new ScreenRunner('modified');
    // MIRROR-COACH P3 (2026-09-26): the hold now ends in a grade. This hand-built shot has no heel points, so the heel
    // line is not readable: the station gets its ONE retest, and then moves on with the check kept as not read.
    // (Held at 10 frames a second since the follow-up's review: one tick at 60 s used to be "well past the hold".)
    const first = steady(r, shot('back'), 0, 60_000);
    expect(first.s.phase).toBe('retest');
    const done = steady(r, shot('back'), first.t + RETEST_PAUSE_MS + 1, first.t + 60_000);
    expect(done.s.phase).toBe('stationDone');
    expect(done.s.grades.map((g) => [g.checkId, g.status])).toEqual([['heelLine', 'unreadable']]);
    expect(done.s.results).toEqual([]);
    const next = r.tick(shot('back'), done.t + 100);   // still facing away: wrong for the front station
    expect(next.station?.view).toBe('front');
    expect(next.say).toMatch(/face the camera|square-on/i);
  });

  it('keeps the results the caller records, in order', () => {
    const r = new ScreenRunner('modified');
    r.record({ checkId: 'heelLine', grade: 'fail', side: 'right', source: 'camera' });
    r.record({ checkId: 'hipLevel', grade: 'stable', source: 'camera' });
    const s = r.tick(shot('back'), 0);
    expect(s.results.map((x) => x.checkId)).toEqual(['heelLine', 'hipLevel']);
  });

  it('runs out of stations and says so', () => {
    const r = new ScreenRunner('modified');
    // the right view at every station, 10 frames a second (it ticked every 40 s before the follow-up's review)
    const { s, t } = steady(r, (view) => shot(view), 0, 900_000, 100, ['complete']);
    expect(s.phase).toBe('complete');
    const end = r.tick(shot('front'), t + 100);
    expect(end.phase).toBe('complete');
    expect(end.say).toMatch(/screen done/i);
  });
});

// MIRROR-COACH P1 (2026-09-25): the harness built every runner as 'modified' and posted the picker's value, so a
// "Full" screen was stored over modified stations. The runner now says which screen it is running, and that is what
// gets posted.
describe('the runner carries the screen it runs', () => {
  it('a full runner says full and walks the full screen\'s stations', () => {
    const r = new ScreenRunner('full');
    expect(r.screen).toBe('full');
    expect(r.tick(shot('back'), 0).screen).toBe('full');
    const seen = new Set<string>();
    let t = 0;
    for (let i = 0; i < 4000 && !seen.has('done'); i++) {
      const st = r.tick(shot(r.station?.view ?? 'front'), (t += 250));
      if (st.station) seen.add(st.station.id);
      if (st.phase === 'complete') { seen.add('done'); expect(st.screen).toBe('full'); }
    }
    for (const s of FULL_SCREEN) expect(seen.has(s.id)).toBe(true);
  });

  it('a modified runner says modified and never visits a full-only station', () => {
    const r = new ScreenRunner('modified');
    expect(r.tick(shot('back'), 0).screen).toBe('modified');
    const ids = new Set(MODIFIED_SCREEN.map((s) => s.id));
    let t = 0;
    for (let i = 0; i < 4000; i++) {
      const st = r.tick(shot(r.station?.view ?? 'front'), (t += 250));
      if (st.station) expect(ids.has(st.station.id)).toBe(true);
      if (st.phase === 'complete') { expect(st.screen).toBe('modified'); break; }
    }
  });
});

// ── MIRROR-COACH P3 (2026-09-26): the stations are graded from the hold ─────────────────────────────────────────────
// Bodies from P1's harness (lib/mirror/fixtures/stations.ts: built in 3-D, filmed through the app's virtual webcam).
import { JITTER, STATION_ASPECT, dimmed, film, shifted, singleLegClip, standClip, standPose, toBack, toSide } from './fixtures/stations';
import { LEFT_HEEL, LEFT_KNEE, RIGHT_HEEL, RIGHT_KNEE } from '@/lib/pose/landmarks';
import { RETEST_HINT } from './stationGraders';
import { scoreScreen } from './screen';
import type { PoseFrame } from '@/lib/babylon/nexus/neuro-mirror/pose/mediapipe-adapter';

const back = (sec = 14) => film(standClip(toBack(standPose()), sec));
const frontOf = (o: Parameters<typeof standPose>[0] = {}, sec = 16) => film(standClip(standPose(o), sec));
/** Only the heel points dim — the framing check (which does not read heels) still passes the shot. */
const dimHeels = (frames: PoseFrame[]) => frames.map((f) => ({
  ...f, landmarks: f.landmarks.map((l, i) => (i === LEFT_HEEL || i === RIGHT_HEEL ? { ...l, visibility: 0.2 } : l)),
}));

/** Tick the runner through `frames` from clock `t0` until a station ends (or the frames run out). */
function drive(r: ScreenRunner, frames: readonly PoseFrame[], t0: number): { states: RunnerState[]; t: number } {
  const states: RunnerState[] = [];
  let t = t0;
  for (const f of frames) {
    t = t0 + f.timestampMs;
    const s = r.tick(f, t);
    states.push(s);
    if (s.phase === 'stationDone' || s.phase === 'complete' || s.phase === 'retest') break;
  }
  return { states, t: t + 34 };
}
const last = (d: { states: RunnerState[] }) => d.states[d.states.length - 1];

describe('the runner grades each station from the frames its hold clock ran on', () => {
  it('records from the GOOD frames only — the frames spent getting into position are not graded', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    // two seconds facing the wrong way (front, for the heels station), then the right way
    const wrong = drive(r, frontOf({}, 2), 0);
    expect(wrong.states.every((s) => s.phase === 'positioning')).toBe(true);
    const d = drive(r, back(14), wrong.t);
    const end = last(d);
    expect(end.phase).toBe('stationDone');
    const heel = end.grades[0];
    expect(heel.checkId).toBe('heelLine');
    expect(heel.status).toBe('pass');
    const held = d.states.filter((s) => s.phase === 'holding').length;
    expect(heel.frames).toBe(held + 1);                   // every tick the clock ran on, the last one included
    expect(heel.frames).toBeLessThan(wrong.states.length + held + 1);
    expect(end.results).toEqual([expect.objectContaining({ checkId: 'heelLine', grade: 'stable', source: 'camera' })]);
  });

  it('a repeated camera frame (same timestamp) is one frame', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const frames = back(14);
    let s: RunnerState | null = null;
    for (const f of frames) {
      s = r.tick(f, f.timestampMs);
      if (s.phase !== 'holding') break;
      s = r.tick(f, f.timestampMs);                        // the same camera frame again (a display tick with no new frame)
      if (s.phase !== 'holding') break;
    }
    expect(s!.phase).toBe('stationDone');
    const held = frames.findIndex((f) => f.timestampMs >= 12_000) + 1;
    expect(s!.grades[0].frames).toBeLessThanOrEqual(held);
  });

  it('grades the MEDIAN over the hold, not the last frame', () => {
    const toFront = (clean: boolean) => {
      const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
      const h = drive(r, back(14), 0);
      // 14 s hold: 12 s of one body, then the last 2.5 s the other
      const a = frontOf(clean ? {} : { shoulderUp: { side: 'left', cm: 5 } }, 12);
      const b = frontOf(clean ? { shoulderUp: { side: 'left', cm: 5 } } : {}, 4).map((f) => ({ ...f, timestampMs: f.timestampMs + 12_000 }));
      const d = drive(r, [...a, ...b], h.t);
      return last(d).grades.find((g) => g.checkId === 'shoulderLevel')!;
    };
    expect(toFront(true).status).toBe('pass');            // the raised shoulder only at the end: not what the hold saw
    expect(toFront(false).status).toBe('flag');           // raised for most of it: flagged, whatever the last frame was
    expect(toFront(false).side).toBe('left');
  });

  it('an unreadable station gets ONE retest, then is recorded as not read — never a pass, and no loop', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const first = drive(r, dimHeels(back(14)), 0);
    const offer = last(first);
    expect(offer.phase).toBe('retest');
    expect(offer.say).toBe(retestLine(offer.stations[0].grades));
    expect(offer.say).toContain(RETEST_HINT.lowVisibility);
    expect(offer.stations[0]).toMatchObject({ stationId: 'heels', attempts: 1, retesting: true });
    expect(offer.results).toEqual([]);
    // the line is given its moment: the clock does not run while it is said
    const pause = r.tick(back(1)[0], first.t + RETEST_PAUSE_MS / 2);
    expect(pause.phase).toBe('retest');
    expect(pause.remainingSec).toBe(r.station!.holdSec);
    const second = drive(r, dimHeels(back(14)), first.t + RETEST_PAUSE_MS);
    const end = last(second);
    expect(end.phase).toBe('stationDone');
    expect(second.states.filter((s) => s.phase === 'retest').length).toBe(0);   // the pause is over, and no second offer
    expect(end.grades).toEqual([expect.objectContaining({ checkId: 'heelLine', status: 'unreadable', reason: 'lowVisibility' })]);
    expect(end.results).toEqual([]);
    expect(end.stations[0]).toMatchObject({ attempts: 2, retesting: false });
    expect(r.station?.id).toBe('frontStack');
  });

  it('a retest that reads the station keeps what it read', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const first = drive(r, dimHeels(back(14)), 0);
    expect(last(first).phase).toBe('retest');
    const end = last(drive(r, back(16), first.t + RETEST_PAUSE_MS));
    expect(end.grades[0]).toMatchObject({ checkId: 'heelLine', status: 'pass' });
    expect(end.results.map((x) => x.checkId)).toEqual(['heelLine']);
    expect(end.stations[0]).toMatchObject({ attempts: 2, retesting: false });
  });

  it('per check, a retest cannot throw away what the first run read', () => {
    const readable = { checkId: 'shoulderLevel' as const, status: 'pass' as const, value: 0.01, unit: 'ratio' as const, frames: 400, readableFrames: 400, note: 'Shoulders read level.', stationId: 'frontStack' };
    const lost = { ...readable, status: 'unreadable' as const, value: null, readableFrames: 3, note: 'Not read.', reason: 'noBody' as const };
    const knee1 = { ...lost, checkId: 'kneeWindow' as const };
    const knee2 = { ...readable, checkId: 'kneeWindow' as const };
    expect(mergeRetest([readable, knee1], [lost, knee2])).toEqual([readable, knee2]);
  });

  // MIRROR-COACH P3 review (2026-09-26): the retest kept the retest's read of every check it read, so a first-run FLAG on
  // one check came back a pass when an unrelated check was unreadable and the athlete stood more carefully the second time
  it('per check, the worse readable read is kept: a first-run flag survives a retest pass', () => {
    const base = { unit: 'ratio' as const, frames: 400, readableFrames: 400, stationId: 'frontStack', uncertainty: 0.005, spread: 0.02 };
    const hipFlag = { ...base, checkId: 'hipLevel' as const, status: 'flag' as const, value: 0.12, side: 'left' as const, note: 'Your left hip read higher.' };
    const hipPass = { ...hipFlag, status: 'pass' as const, value: 0.01, note: 'Hips read level.' };
    delete (hipPass as { side?: unknown }).side;
    const kneeLost = { ...base, checkId: 'kneeWindow' as const, status: 'unreadable' as const, value: null, readableFrames: 3, note: 'Not read.', reason: 'lowVisibility' as const };
    const kneePass = { ...base, checkId: 'kneeWindow' as const, status: 'pass' as const, value: 0.05, note: 'Knees read over the line.' };
    const shFlag = { ...base, checkId: 'shoulderLevel' as const, status: 'flag' as const, value: 0.12, side: 'left' as const, note: 'x' };
    const shPass = { ...shFlag, status: 'pass' as const, value: 0.01 };
    // the review's case: first [knee flag, hip unreadable, shoulder flag], retest [knee pass, hip unreadable, shoulder pass]
    const kneeFlag = { ...kneePass, status: 'flag' as const, value: 0.7 };
    const hipLost = { ...kneeLost, checkId: 'hipLevel' as const };
    expect(mergeRetest([kneeFlag, hipLost, shFlag], [kneePass, hipLost, shPass]).map((g) => `${g.checkId}:${g.status}`))
      .toEqual(['kneeWindow:flag', 'hipLevel:unreadable', 'shoulderLevel:flag']);
    // the other one: first [hip flag, knee unreadable], retest [hip pass, knee pass] → [hip flag, knee pass]
    expect(mergeRetest([hipFlag, kneeLost], [hipPass, kneePass])).toEqual([hipFlag, kneePass]);
    // a retest's flag over a first pass; a tie keeps the retest's read
    expect(mergeRetest([hipPass], [hipFlag])).toEqual([hipFlag]);
    expect(mergeRetest([hipPass], [{ ...hipPass, value: 0.02 }])[0].value).toBe(0.02);
  });

  it('end to end: a hip flag on the first run, the knees unreadable, survives a clean retest', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const h = drive(r, back(14), 0);
    expect(r.station?.id).toBe('frontStack');
    const dimKnees = (frames: PoseFrame[]) => frames.map((f) => ({
      ...f, landmarks: f.landmarks.map((l, i) => (i === LEFT_KNEE || i === RIGHT_KNEE ? { ...l, visibility: 0.2 } : l)),
    }));
    const first = drive(r, dimKnees(frontOf({ hipDrop: { side: 'right', cm: 5 } }, 16)), h.t);
    const offer = last(first);
    expect(offer.phase).toBe('retest');
    expect(offer.stations[1].grades.map((g) => `${g.checkId}:${g.status}`)).toEqual(['kneeWindow:unreadable', 'hipLevel:flag', 'shoulderLevel:pass']);
    const end = last(drive(r, frontOf({}, 16), first.t + RETEST_PAUSE_MS));
    expect(end.phase).toBe('stationDone');
    const fs = end.grades.filter((g) => g.stationId === 'frontStack');
    expect(fs.map((g) => `${g.checkId}:${g.status}`)).toEqual(['kneeWindow:pass', 'hipLevel:flag', 'shoulderLevel:pass']);
    expect(end.results).toContainEqual(expect.objectContaining({ checkId: 'hipLevel', grade: 'fail', side: 'left' }));
  });

  it('the phone turned mid-hold: the frames carry the aspect they were taken at, and the station reads cameraMoved', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const h = drive(r, back(14), 0);
    const frames = frontOf({}, 16);
    const half = Math.floor(frames.length / 2);
    const a = drive(r, frames.slice(0, half), h.t);
    expect(last(a).phase).toBe('holding');
    r.setAspect(1 / STATION_ASPECT);                       // the harness re-reads the video's size every frame
    const b = drive(r, frames.slice(half), h.t);
    const end = last(b);
    expect(['retest', 'stationDone']).toContain(end.phase);
    const fs = end.stations[1].grades;
    expect(fs.every((g) => g.status === 'unreadable' && g.reason === 'cameraMoved')).toBe(true);
    expect(end.say).toContain(RETEST_HINT.cameraMoved);
  });

  it('skipping the retest keeps the check as not read and moves on', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const first = drive(r, dimHeels(back(14)), 0);
    expect(last(first).phase).toBe('retest');
    r.skipRetest();
    const s = r.tick(back(1)[0], first.t);
    expect(s.station?.id).toBe('frontStack');
    expect(s.grades).toEqual([expect.objectContaining({ checkId: 'heelLine', status: 'unreadable' })]);
    expect(s.stations[0]).toMatchObject({ attempts: 1, retesting: false });
    r.skipRetest();                                        // nothing pending: a no-op
    expect(r.station?.id).toBe('frontStack');
  });

  it('a clean athlete through the whole modified screen: every camera check read, nothing flagged, no retest', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const byStation: Record<string, () => PoseFrame[]> = {
      heels: () => film(standClip(toBack(standPose()), 14), JITTER(3)),
      frontStack: () => film(standClip(standPose(), 16), JITTER(4)),
      breath: () => film(standClip(standPose(), 10), JITTER(5)),
      profile: () => film(standClip(toSide(standPose()), 12), JITTER(6)),
      wobbleL: () => film(singleLegClip({ stance: 'left', settleSec: 1, holdSec: 34 }), JITTER(7)),
      wobbleR: () => film(singleLegClip({ stance: 'right', settleSec: 1, holdSec: 34 }), JITTER(8)),
    };
    let t = 0, s: RunnerState | null = null, retests = 0;
    for (let guard = 0; guard < 20 && r.station; guard++) {
      const d = drive(r, byStation[r.station.id](), t);
      t = d.t; s = last(d);
      retests += d.states.filter((x) => x.phase === 'retest').length;
    }
    expect(s!.phase).toBe('complete');
    expect(retests).toBe(0);
    expect(s!.grades.map((g) => `${g.checkId}:${g.status}`)).toEqual([
      'heelLine:pass', 'kneeWindow:pass', 'hipLevel:pass', 'shoulderLevel:pass', 'headFloat:pass', 'singleLeg:pass', 'singleLeg:pass',
    ]);
    expect(s!.results.filter((x) => x.checkId === 'singleLeg').map((x) => x.side)).toEqual(['left', 'right']);
    const summary = scoreScreen('modified', s!.results);
    expect(summary.graded).toBe(true);
    expect(summary.movementFlags).toBe(0);
    expect(summary.notMeasured).toEqual([]);              // every camera check came back
  });

  it('a body that steps half out of the shot mid-hold pauses the clock, and the frames out of shot are not graded', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const a = back(5), gone = shifted(back(3), 0.52).map((f) => ({ ...f, timestampMs: f.timestampMs + 5_000 }));
    const b = back(12).map((f) => ({ ...f, timestampMs: f.timestampMs + 8_000 }));
    const d = drive(r, [...a, ...gone, ...b], 0);
    const end = last(d);
    expect(end.phase).toBe('stationDone');
    expect(d.states.some((s) => s.phase === 'positioning')).toBe(true);
    expect(end.grades[0].status).toBe('pass');
    expect(end.grades[0].frames).toBe(d.states.filter((s) => s.phase === 'holding').length + 1);
    void dimmed;
  });
});

// ── MIRROR-COACH P3 follow-up (2026-09-28): the side-on dead end ────────────────────────────────────────────────────
// The P3 live proof, row 5: an athlete who stayed facing the camera at the side station saw the clock sit at 10 for the
// 45.6 s the proof watched; the turn cue was said once; no retest, no timeout — and End posted nothing. Every test here
// fails on 42c5e8a0: the runner stayed in 'positioning' forever, said the turn line with no reminder, and had no
// readSoFar(). (Old-code run: see the follow-up's report.)
import { MOVE_ON_LINE, spokenKey } from './screenRunner';
import { STATION_THRESHOLDS } from './stationGraders';
import { TURN_CUE } from './screen';
import { LEFT_FOOT_INDEX, NOSE, RIGHT_FOOT_INDEX } from '@/lib/pose/landmarks';

const W = STATION_THRESHOLDS.wrongView;
const sideOn = (sec = 12) => film(standClip(toSide(standPose()), sec));
/** Nobody in the shot, one frame every 33 ms. */
const nobody = (sec: number) => Array.from({ length: Math.round((sec * 1000) / 33) }, (_, i) => ({ landmarks: [], present: false, timestampMs: i * 33 })) as unknown as PoseFrame[];
/** A clean athlete through heels, front stack and breath: the runner then stands at 'profile', the side station. */
function toProfile(r: ScreenRunner): number {
  let t = 0;
  for (const frames of [back(14), frontOf({}, 16), frontOf({}, 10)]) t = drive(r, frames, t).t;
  expect(r.station?.id).toBe('profile');
  return t;
}
/** Tick every frame (no early stop), returning each state with its clock. */
function feed(r: ScreenRunner, frames: readonly PoseFrame[], t0: number): { at: number; s: RunnerState }[] {
  return frames.map((f) => ({ at: t0 + f.timestampMs, s: r.tick(f, t0 + f.timestampMs) }));
}

describe('the wrong view ends (MIRROR-COACH P3 follow-up): a spaced reminder, then not read, one retest, move on', () => {
  it('facing the camera at the side station: the turn is said again every remindMs, and at endMs the station ends NOT READ (wrongView) with its one retest', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const t0 = toProfile(r);
    const d = drive(r, frontOf({}, 40), t0);                 // stays facing the camera
    const offer = last(d);
    const waiting = d.states.slice(0, -1);
    expect(offer.phase).toBe('retest');                      // on 42c5e8a0: 'positioning', for all 40 s
    expect(waiting.every((s) => s.phase === 'positioning' && s.say === TURN_CUE.side)).toBe(true);
    // the reminder: the same line, asked for again twice (at ~7 s and ~14 s) — not every frame
    const keys = [...new Set(waiting.map(spokenKey))];
    expect(keys).toHaveLength(Math.ceil(W.endMs / W.remindMs));   // said at 0, 7 and 14 s
    expect(waiting.length).toBeGreaterThan(500);                  // ~600 frames, three things said
    const firstReminder = waiting.findIndex((s) => s.sayAgain > waiting[0].sayAgain);
    const frames = frontOf({}, 40);
    expect(frames[firstReminder].timestampMs).toBeGreaterThanOrEqual(W.remindMs - 100);
    expect(frames[firstReminder].timestampMs).toBeLessThan(W.remindMs + 100);
    // at endMs of wrong view: not read, reason wrongView, and the ONE retest — whose line says the turn
    expect(offer.phase).toBe('retest');
    expect(frames[d.states.length - 1].timestampMs).toBeGreaterThanOrEqual(W.endMs - 100);
    expect(frames[d.states.length - 1].timestampMs).toBeLessThan(W.endMs + 100);
    expect(offer.stations.find((x) => x.stationId === 'profile')).toMatchObject({ attempts: 1, retesting: true });
    expect(offer.stations.find((x) => x.stationId === 'profile')!.grades).toEqual([
      expect.objectContaining({ checkId: 'headFloat', status: 'unreadable', reason: 'wrongView', value: null, stationId: 'profile' }),
    ]);
    expect(offer.say).toBe(retestLine(offer.stations[3].grades, { fix: TURN_CUE.side }));
    expect(offer.say).toContain(TURN_CUE.side);
    // the runner's own end grades no frame (frames 0) — how a reader tells it from a grader's 'wrongView'
    expect(offer.stations[3].grades[0]).toMatchObject({ frames: 0, readableFrames: 0 });
    expect(offer.stations[3]).toMatchObject({ held: false });
  });

  it('still facing the camera through the retest: kept as not read, and the screen MOVES ON — in about 2 × endMs + the retest line, not forever', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const t0 = toProfile(r);
    const first = drive(r, frontOf({}, 40), t0);
    expect(last(first).phase).toBe('retest');
    const second = drive(r, frontOf({}, 40), first.t + RETEST_PAUSE_MS);
    const end = last(second);
    expect(end.phase).toBe('stationDone');
    expect(end.say).toBe(MOVE_ON_LINE);
    expect(second.states.filter((s) => s.phase === 'retest')).toHaveLength(0);        // no second retest, no loop
    expect(r.station?.id).toBe('wobbleL');
    expect(end.grades.find((g) => g.checkId === 'headFloat')).toMatchObject({ status: 'unreadable', reason: 'wrongView' });
    expect(end.stations.find((x) => x.stationId === 'profile')).toMatchObject({ attempts: 2, retesting: false });
    expect(end.results.map((x) => x.checkId)).not.toContain('headFloat');             // unreadable is never a result
    expect(second.t - t0).toBeLessThan(2 * W.endMs + RETEST_PAUSE_MS + 1000);
  });

  it('turning round during the retest reads the station: the retest\'s read is kept', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const t0 = toProfile(r);
    const first = drive(r, frontOf({}, 40), t0);
    const end = last(drive(r, sideOn(12), first.t + RETEST_PAUSE_MS));
    expect(end.phase).toBe('stationDone');
    expect(end.grades.find((g) => g.checkId === 'headFloat')).toMatchObject({ status: 'pass' });
    expect(end.results.map((x) => x.checkId)).toContain('headFloat');
    expect(end.stations.find((x) => x.stationId === 'profile')).toMatchObject({ attempts: 2 });
  });

  it('only the wrong view counts: out of the shot still PAUSES a station (P1), and a right-view STRETCH resets the wait', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    let t = toProfile(r);
    // 40 s with nobody in the shot: no end, no reminder
    const away = feed(r, nobody(40), t);
    expect(away.every(({ s }) => s.phase === 'positioning')).toBe(true);
    expect(new Set(away.map(({ s }) => s.sayAgain)).size).toBe(1);
    t = away[away.length - 1].at + 34;
    // wrong for 15 s, right for 2 s, wrong for 15 s: never endMs in one stretch, so never ended. (It was right for 1 s — 30
    // frames, 967 ms — until the follow-up's review: a turn is W.resetAfterMs of consecutive right-view frames now.)
    const a = feed(r, frontOf({}, 15), t);
    t = a[a.length - 1].at + 34;
    const b = feed(r, sideOn(2), t);
    expect(b.some(({ s }) => s.phase === 'holding')).toBe(true);
    t = b[b.length - 1].at + 34;
    const c = feed(r, frontOf({}, 15), t);
    expect([...a, ...c].every(({ s }) => s.phase === 'positioning')).toBe(true);
    t = c[c.length - 1].at + 34;
    // then they turn and hold it: read on the first attempt, no retest
    const end = last(drive(r, sideOn(12), t));
    expect(end.phase).toBe('stationDone');
    expect(end.grades.find((g) => g.checkId === 'headFloat')).toMatchObject({ status: 'pass' });
    expect(end.stations.find((x) => x.stationId === 'profile')).toMatchObject({ attempts: 1 });
  });

  it('spokenKey: the same line asked for again is a new thing to say; the same state is not', () => {
    expect(spokenKey({ say: TURN_CUE.side, sayAgain: 1 })).not.toBe(spokenKey({ say: TURN_CUE.side, sayAgain: 0 }));
    expect(spokenKey({ say: TURN_CUE.side, sayAgain: 1 })).toBe(spokenKey({ say: TURN_CUE.side, sayAgain: 1 }));
    expect(spokenKey({ say: 'a', sayAgain: 0 })).not.toBe(spokenKey({ say: 'b', sayAgain: 0 }));
  });
});

describe('End posts what was read so far (MIRROR-COACH P3 follow-up): readSoFar()', () => {
  it('stuck at the side station after three stations: the four camera checks already read are there to post', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const t0 = toProfile(r);
    feed(r, frontOf({}, 5), t0);                              // facing the wrong way, and they press End
    const so = r.readSoFar();
    expect(so.screen).toBe('modified');
    expect(so.grades.map((g) => `${g.checkId}:${g.status}`)).toEqual(['heelLine:pass', 'kneeWindow:pass', 'hipLevel:pass', 'shoulderLevel:pass']);
    expect(so.results.map((x) => x.checkId)).toEqual(['heelLine', 'kneeWindow', 'hipLevel', 'shoulderLevel']);
  });

  it('a station waiting on its one retest counts with its first run\'s grades (what skipRetest would keep) — its unreadable check is no result', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const h = drive(r, back(14), 0);
    const dimKnees = (frames: PoseFrame[]) => frames.map((f) => ({
      ...f, landmarks: f.landmarks.map((l, i) => (i === LEFT_KNEE || i === RIGHT_KNEE ? { ...l, visibility: 0.2 } : l)),
    }));
    expect(last(drive(r, dimKnees(frontOf({ hipDrop: { side: 'right', cm: 5 } }, 16)), h.t)).phase).toBe('retest');
    const so = r.readSoFar();
    expect(so.grades.map((g) => `${g.checkId}:${g.status}`)).toEqual(['heelLine:pass', 'kneeWindow:unreadable', 'hipLevel:flag', 'shoulderLevel:pass']);
    expect(so.results.map((x) => `${x.checkId}:${x.grade}`)).toEqual(['heelLine:stable', 'hipLevel:fail', 'shoulderLevel:stable']);
  });

  it('nothing finished: nothing read (the harness posts nothing — no empty run is stored)', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    feed(r, back(5), 0);
    expect(r.readSoFar()).toEqual({ screen: 'modified', results: [], grades: [], stations: [] });
  });
});

// ── MIRROR-COACH P3 follow-up (2026-09-28): face and feet unseen is not a wrong view ────────────────────────────────
describe('the head float with the face and feet unseen', () => {
  const FACE_FEET = new Set([NOSE, LEFT_HEEL, RIGHT_HEEL, LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX]);
  const FEET = new Set([LEFT_HEEL, RIGHT_HEEL, LEFT_FOOT_INDEX, RIGHT_FOOT_INDEX]);
  /** The face and feet only DIM: every point still inside the shot. */
  const unseen = (frames: PoseFrame[]) => frames.map((f) => ({ ...f, landmarks: f.landmarks.map((l, i) => (FACE_FEET.has(i) ? { ...l, visibility: 0.35 } : l)) }));
  /** The face dim and the feet below the bottom of the image (the ankles still in: the framing check passes it). */
  const feetOut = (frames: PoseFrame[]) => frames.map((f) => ({
    ...f, landmarks: f.landmarks.map((l, i) => (i === NOSE ? { ...l, visibility: 0.35 } : FEET.has(i) ? { ...l, y: 1.03 } : l)),
  }));

  // CHANGED ON PURPOSE (MIRROR-COACH P3 follow-up review, 2026-09-28): this body's face and feet are all INSIDE the shot,
  // only dimmed (visibility 0.35), and the follow-up told it "Step back so your head and your feet are both in the
  // shot." — which makes a dim body smaller and fixes no light. Dim only is 'lowVisibility', and the retest says the light.
  it('a side-on body whose face and near foot are only DIM: lowVisibility and the light hint — not "a different view", not "step back"', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const t0 = toProfile(r);
    const offer = last(drive(r, unseen(sideOn(12)), t0));
    expect(offer.phase).toBe('retest');                     // the framing check passed it as side-on: the hold ran
    const g = offer.stations.find((x) => x.stationId === 'profile')!.grades[0];
    expect(g).toMatchObject({ checkId: 'headFloat', status: 'unreadable', reason: 'lowVisibility' });
    expect(g.note).not.toMatch(/different view/);
    expect(offer.say).toContain(RETEST_HINT.lowVisibility);
    expect(offer.say).not.toContain(RETEST_HINT.faceFeetUnseen);
    expect(offer.say).not.toContain(RETEST_HINT.wrongView);
  });

  it('the feet OUTSIDE the shot (the face dim): faceFeetUnseen and the step-back hint', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const t0 = toProfile(r);
    const offer = last(drive(r, feetOut(sideOn(12)), t0));
    expect(offer.phase).toBe('retest');
    const g = offer.stations.find((x) => x.stationId === 'profile')!.grades[0];
    expect(g).toMatchObject({ checkId: 'headFloat', status: 'unreadable', reason: 'faceFeetUnseen' });
    expect(offer.say).toContain(RETEST_HINT.faceFeetUnseen);
  });
});

// ── MIRROR-COACH P3 follow-up REVIEW (2026-09-28) ──────────────────────────────────────────────────────────────────────
// The review's probes (bundled against the worktree modules, no dev server) found the follow-up's bound did not hold for
// a body that flickers across the side-on line, a shot that never comes good for another reason, or one late frame; a
// grader's own 'wrongView' answered with the turn cue; "That one wasn't read" over a station that read two of its three
// checks; and End's cards drawn from state that left out a pending retest. Each test below fails on the follow-up's diff.
import { HEAD_TURNED_HINT, type StationGrade } from './stationGraders';
import { NEXT_LINE, PART_READ_LINE, moveOnLine } from './screenRunner';
import { checkFraming } from './framing';

const W2 = STATION_THRESHOLDS.wrongView;
const STALL = STATION_THRESHOLDS.stalled;
const CLOCK = STATION_THRESHOLDS.clock;

/** At the side station, facing the camera, with ONE side-on frame every `everyMs` (a lucky frame on a ~50° turn). */
function flicker(everyMs: number, forMs: number) {
  const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
  let t = toProfile(r);
  const front = frontOf({}, 1)[0], side = sideOn(1)[0];
  expect(checkFraming(front, 'side').worst).toBe('turned');
  expect(checkFraming(side, 'side').ok).toBe(true);
  const start = t, states: RunnerState[] = [];
  let lastGood = -Infinity;
  for (; t < start + forMs; t += 33) {
    const good = t - lastGood >= everyMs;
    if (good) lastGood = t;
    const s = r.tick({ ...(good ? side : front), timestampMs: t }, t);
    states.push(s);
    if (s.phase === 'retest') break;
  }
  return { r, states, endedAfterMs: t - start };
}

describe('one frame is not a turn: the wrong-view wait resets only after a right-view stretch', () => {
  it.each([3000, 8000])('one side-on frame every %i ms: the station still ends at endMs of wrong view, with its reminders (it never ended)', (every) => {
    const { states, endedAfterMs } = flicker(every, 10 * 60_000);
    const offer = states[states.length - 1];
    expect(offer.phase).toBe('retest');                                    // on the follow-up: 'positioning' after 10 min
    expect(endedAfterMs).toBeLessThan(W2.endMs + 2000);                    // endMs of turned frames, give or take the lucky ones
    expect(offer.stations.find((x) => x.stationId === 'profile')!.grades[0]).toMatchObject({ reason: 'wrongView', frames: 0 });
    expect(offer.say).toContain(TURN_CUE.side);
    expect(Math.max(...states.map((s) => s.sayAgain)) - states[0].sayAgain).toBe(Math.ceil(W2.endMs / W2.remindMs) - 1);   // 7 s, 14 s
  });

  it('a right-view stretch shorter than resetAfterMs does not reset it; one as long does', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    let t = toProfile(r);
    const wrong = (ms: number) => { const a = feed(r, frontOf({}, ms / 1000), t); t = a[a.length - 1].at + 34; return a; };
    const right = (ms: number) => { const b = feed(r, sideOn(ms / 1000), t); t = b[b.length - 1].at + 34; return b; };
    wrong(12_000); right(500);                                              // half a second side-on: not a turn
    const c = wrong(9_000);                                                 // 12 + 9 > endMs: ended
    expect(c.some(({ s }) => s.phase === 'retest')).toBe(true);
    const r2 = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    t = toProfile(r2);
    const w1 = feed(r2, frontOf({}, 12), t); t = w1[w1.length - 1].at + 34;
    const ok = feed(r2, sideOn((W2.resetAfterMs + 300) / 1000), t); t = ok[ok.length - 1].at + 34;
    const w2 = feed(r2, frontOf({}, 9), t);
    expect(w2.every(({ s }) => s.phase === 'positioning')).toBe(true);     // the stretch reset it
  });
});

describe('the station-level backstop (STATION_THRESHOLDS.stalled): a shot that never comes good ends, for the reason the camera saw most', () => {
  it('side-on but off-centre after facing the camera: ends NOT READ as out of the shot, and the retest says "Move to the middle" — not the turn', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    let t = toProfile(r);
    const offCentre = shifted(sideOn(1), 0.3)[0];
    expect(checkFraming(offCentre, 'side').worst).toBe('offCentre');
    const facing = feed(r, frontOf({}, 15), t);                             // 15 s facing the camera
    t = facing[facing.length - 1].at + 34;
    let s!: RunnerState;
    const start = t;
    for (; t < start + 60_000; t += 33) { s = r.tick({ ...offCentre, timestampMs: t }, t); if (s.phase === 'retest') break; }
    expect(s.phase).toBe('retest');                                         // the review's case ended as 'wrongView' after 81 s
    expect(t - start + 15_000).toBeLessThan(STALL.endMs + 1000);            // stalled.endMs of frames the clock refused
    const g = s.stations.find((x) => x.stationId === 'profile')!.grades[0];
    expect(g).toMatchObject({ status: 'unreadable', reason: 'outOfFrame', frames: 0 });
    expect(s.say).toBe(retestLine([g], { fix: 'Move to the middle of the shot.' }));
    expect(s.say).not.toContain(TURN_CUE.side);
  });

  it('a dim room at the front stack: ends NOT READ (lowVisibility) with the light fix, its one retest, then moves on — never a loop', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const h = drive(r, back(14), 0);
    expect(r.station?.id).toBe('frontStack');
    const dim = dimmed(frontOf({}, 1), 0.5)[0];
    expect(checkFraming(dim, 'front').worst).toBe('dim');
    const run = (from: number) => {
      let s!: RunnerState, t = from;
      for (; t < from + 2 * STALL.endMs; t += 33) { s = r.tick({ ...dim, timestampMs: t }, t); if (s.phase !== 'positioning') break; }
      return { s, t };
    };
    const first = run(h.t);
    expect(first.s.phase).toBe('retest');
    expect(first.t - h.t).toBeGreaterThanOrEqual(STALL.endMs - 100);
    expect(first.s.stations[1].grades.map((g) => `${g.checkId}:${g.reason}`)).toEqual(['kneeWindow:lowVisibility', 'hipLevel:lowVisibility', 'shoulderLevel:lowVisibility']);
    expect(first.s.say).toContain('More light');
    const second = run(first.t + RETEST_PAUSE_MS + 34);
    expect(second.s.phase).toBe('stationDone');
    expect(second.s.say).toBe(MOVE_ON_LINE);
    expect(r.station?.id).toBe('breath');
    expect(second.s.stations[1]).toMatchObject({ attempts: 2, retesting: false, held: false });
  });

  it('nobody in the shot never ends a station (P1: leaving pauses it) — not in twice the backstop', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const t = toProfile(r);
    const away = feed(r, nobody((2 * STALL.endMs) / 1000), t);
    expect(away.every(({ s }) => s.phase === 'positioning')).toBe(true);
  });
});

describe('one tick adds at most a frame (STATION_THRESHOLDS.clock); a gap as long as ABANDON_MS is an absence', () => {
  it('a second "turned" tick 25 s after the first (the render loop paused) does not end the station, and says no reminder it skipped', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const t = toProfile(r);
    const front = frontOf({}, 1)[0];
    const a = r.tick({ ...front, timestampMs: t }, t);
    const b = r.tick({ ...front, timestampMs: t + 25_000 }, t + 25_000);
    expect(a.phase).toBe('positioning');
    expect(b.phase).toBe('positioning');                                    // on the follow-up: 'retest', at once
    expect(b.sayAgain).toBe(a.sayAgain);
    // and the wait still runs from the frames that follow: endMs of them ends it
    const rest = feed(r, frontOf({}, 40), t + 25_034);
    const endAt = rest.findIndex(({ s }) => s.phase === 'retest');
    expect(endAt).toBeGreaterThan(0);
    expect(rest[endAt].at - (t + 25_034)).toBeGreaterThanOrEqual(W2.endMs - 100);
  });

  it('good frames far apart bank at most maxTickMs each; a gap of ABANDON_MS starts the hold again', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const b = back(1)[0];
    r.tick(b, 0);
    const s1 = r.tick(b, 4000);                                             // 4 s later: one frame's worth, not 4 s
    expect(r.station!.holdSec - s1.remainingSec).toBeCloseTo(CLOCK.maxTickMs / 1000, 5);
    const s2 = r.tick(b, 4000 + ABANDON_MS);                                // an absence: back to the top
    expect(s2.remainingSec).toBe(r.station!.holdSec);
  });
});

describe('what the runner says: the turn only for its own end, and "not read" only when nothing was', () => {
  it('a grader\'s wrongView at the side station (the head turned from the body — framing passed every frame) keeps the grader\'s hint, not the turn', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const t = toProfile(r);
    const headBack = sideOn(12).map((f) => {
      const L = f.landmarks.map((p) => ({ ...p }));
      const ear = (L[7].z ?? 0) < (L[8].z ?? 0) ? L[7] : L[8];
      L[0] = { ...L[0], x: 2 * ear.x - L[0].x };                           // the nose on the other side of the near ear
      return { ...f, landmarks: L };
    });
    expect(headBack.every((f) => checkFraming(f, 'side').ok)).toBe(true);
    const offer = last(drive(r, headBack, t));
    expect(offer.phase).toBe('retest');
    const g = offer.stations.find((x) => x.stationId === 'profile')!.grades[0];
    expect(g).toMatchObject({ reason: 'wrongView' });
    expect(g.frames).toBeGreaterThan(0);                                    // a grader's read, not the runner's end
    expect(offer.say).toContain(HEAD_TURNED_HINT);
    expect(offer.say).not.toContain(TURN_CUE.side);                         // the follow-up said "Turn side-on…" to somebody side-on
    expect(offer.stations.find((x) => x.stationId === 'profile')).toMatchObject({ held: true });
  });

  it('a retest the athlete never turns for, after a first run that READ two of three checks: "Part of that one was read", and the reads are kept', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const h = drive(r, back(14), 0);
    const dimKnees = (frames: PoseFrame[]) => frames.map((f) => ({
      ...f, landmarks: f.landmarks.map((l, i) => (i === LEFT_KNEE || i === RIGHT_KNEE ? { ...l, visibility: 0.2 } : l)),
    }));
    const a = drive(r, dimKnees(frontOf({ hipDrop: { side: 'right', cm: 5 } }, 16)), h.t);
    expect(last(a).phase).toBe('retest');
    const b = last(drive(r, sideOn(40), a.t + RETEST_PAUSE_MS));          // side-on at a front station: never turns
    expect(b.phase).toBe('stationDone');
    expect(b.say).toBe(PART_READ_LINE);                                     // it said "That one wasn't read."
    expect(b.grades.filter((g) => g.stationId === 'frontStack').map((g) => `${g.checkId}:${g.status}`))
      .toEqual(['kneeWindow:unreadable', 'hipLevel:flag', 'shoulderLevel:pass']);
  });

  it('moveOnLine: all read → "Good", some → "Part of", none → "not read"; a station with nothing to grade by whether its hold ran', () => {
    const g = (status: StationGrade['status']) => ({ checkId: 'hipLevel', status, value: null, unit: 'ratio', frames: 1, readableFrames: 0, note: '' }) as StationGrade;
    expect(moveOnLine([g('pass'), g('flag')], true)).toBe(NEXT_LINE);
    expect(moveOnLine([g('pass'), g('unreadable')], true)).toBe(PART_READ_LINE);
    expect(moveOnLine([g('unreadable')], true)).toBe(MOVE_ON_LINE);
    expect(moveOnLine([], true)).toBe(NEXT_LINE);
    expect(moveOnLine([], false)).toBe(MOVE_ON_LINE);
  });
});

describe('End\'s cards and what the breath station held (readSoFar().stations, StationRecord.held)', () => {
  it('End during a pending retest: the station card is kept as not read, not "retesting" — the same grades End posts', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const h = drive(r, back(14), 0);
    const dimKnees = (frames: PoseFrame[]) => frames.map((f) => ({
      ...f, landmarks: f.landmarks.map((l, i) => (i === LEFT_KNEE || i === RIGHT_KNEE ? { ...l, visibility: 0.2 } : l)),
    }));
    const offer = last(drive(r, dimKnees(frontOf({ hipDrop: { side: 'right', cm: 5 } }, 16)), h.t));
    expect(offer.stations[1]).toMatchObject({ retesting: true });
    expect(offer.grades.map((g) => g.checkId)).toEqual(['heelLine']);       // the last runner state leaves the pending station out
    const so = r.readSoFar();
    expect(so.stations.map((x) => [x.stationId, x.retesting])).toEqual([['heels', false], ['frontStack', false]]);
    expect(so.stations.flatMap((x) => x.grades)).toEqual(so.grades);        // the cards show exactly what is posted
    expect(so.grades.find((g) => g.checkId === 'hipLevel')).toMatchObject({ status: 'flag' });
  });

  it('the breath station is held on a clean run, and NOT held when the runner ended it (a dim room)', () => {
    const clean = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    toProfile(clean);
    expect(clean.readSoFar().stations.find((x) => x.stationId === 'breath')).toMatchObject({ held: true, grades: [] });
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    let t = drive(r, back(14), 0).t;
    t = drive(r, frontOf({}, 16), t).t;
    expect(r.station?.id).toBe('breath');
    const dim = dimmed(frontOf({}, 1), 0.4)[0];
    let s!: RunnerState;
    for (const start = t; t < start + 2 * STALL.endMs; t += 33) { s = r.tick({ ...dim, timestampMs: t }, t); if (s.phase !== 'positioning') break; }
    expect(s.phase).toBe('stationDone');                                    // nothing for the camera: no retest to give
    expect(s.say).toBe(MOVE_ON_LINE);
    expect(s.stations.find((x) => x.stationId === 'breath')).toMatchObject({ held: false, grades: [] });
  });
});

describe('dim all over is dim, not turned — for the waits too', () => {
  it('a body facing the camera in a room so dim the framing check reads its face as turned away: NOT ended as a wrong view — the backstop ends it as lowVisibility, with the light line', () => {
    const r = new ScreenRunner('modified', { aspect: STATION_ASPECT });
    const h = drive(r, back(14), 0);
    const veryDim = dimmed(frontOf({}, 1), 0.4)[0];
    expect(checkFraming(veryDim, 'front').worst).toBe('turned');           // the framing check's own order
    expect(checkFraming(veryDim, 'front').issues).toContain('dim');
    let s!: RunnerState, t = h.t;
    for (const start = t; t < start + 2 * STALL.endMs; t += 33) { s = r.tick({ ...veryDim, timestampMs: t }, t); if (s.phase !== 'positioning') break; }
    expect(s.phase).toBe('retest');
    expect(t - h.t).toBeGreaterThanOrEqual(STALL.endMs - 100);             // not at W.endMs: it is not a wrong view
    expect(s.stations[1].grades.every((g) => g.reason === 'lowVisibility')).toBe(true);
    expect(s.say).toContain('More light');
    expect(s.say).not.toContain(TURN_CUE.front);
  });
});
