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
    r.tick(shot('back'), 0);
    // MIRROR-COACH P3 (2026-09-26): the hold now ends in a grade. This hand-built shot has no heel points, so the heel
    // line is not readable: the station gets its ONE retest, and then moves on with the check kept as not read.
    const first = r.tick(shot('back'), 60_000);   // well past the hold
    expect(first.phase).toBe('retest');
    r.tick(shot('back'), 60_000 + RETEST_PAUSE_MS + 1);
    const done = r.tick(shot('back'), 130_000);
    expect(done.phase).toBe('stationDone');
    expect(done.grades.map((g) => [g.checkId, g.status])).toEqual([['heelLine', 'unreadable']]);
    expect(done.results).toEqual([]);
    const next = r.tick(shot('back'), 130_100);   // still facing away: wrong for the front station
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
    let t = 0;
    for (let i = 0; i < 40; i++) {
      const view = r.station?.view ?? 'front';
      const s = r.tick(shot(view), t);
      t += 40_000;
      if (s.phase === 'complete') break;
    }
    const end = r.tick(shot('front'), t);
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
