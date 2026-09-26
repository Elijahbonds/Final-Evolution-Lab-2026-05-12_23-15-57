import { describe, expect, it } from 'vitest';
import { ABANDON_MS, ScreenRunner } from './screenRunner';
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
    const done = r.tick(shot('back'), 60_000);    // well past the hold
    expect(done.phase).toBe('stationDone');
    const next = r.tick(shot('back'), 60_100);    // still facing away: wrong for the front station
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
