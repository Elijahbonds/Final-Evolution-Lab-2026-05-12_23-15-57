// dunk-next phase 1 — the flight as a four-beat bar (docs/DUNK-NEXT.md). The rules a player meets in the air: which presses are
// ON THE BEAT, what the beats are worth, what a PERFECT FLIGHT is, and the strip the HUD draws.
import { describe, it, expect } from 'vitest';
import {
  BEAT_ORDER, BEAT_T, BEAT_TOL_SEC, BEAT_EXEC_EACH, BEAT_EXEC_MAX, PERFECT_FLIGHT_STYLE,
  trickBeats, gradeTrickPress, beatsCrossed, flightFlow, encodeBeatStrip, decodeBeatStrip, type BeatMark, type BeatStrip,
} from './DunkBeats';
import { DUNK_TRICKS, SPIN_720, CUE_BEAT_T, cueFireAt, cueLastAt, cueVerdict } from './DunkSystem';
import { EASTBAY_TIMING } from '../anim/authored/timing';
import { dunkCard, type DunkAttemptFacts } from './DunkCard';

const T = (id: string) => DUNK_TRICKS.find((t) => t.id === id)!;

describe('the bar', () => {
  it('is the cue table\'s three beats and the slam\'s NOW!, in order and accelerating toward the rim', () => {
    expect(BEAT_ORDER).toEqual(['rise', 'hang', 'preSlam', 'slam']);
    expect(BEAT_T.rise).toBe(CUE_BEAT_T.rise);
    expect(BEAT_T.hang).toBe(CUE_BEAT_T.hang);
    expect(BEAT_T.preSlam).toBe(CUE_BEAT_T.preSlam);
    expect(BEAT_T.slam).toBe(EASTBAY_TIMING.extend);
    for (let i = 1; i < BEAT_ORDER.length; i++) expect(BEAT_T[BEAT_ORDER[i]]).toBeGreaterThan(BEAT_T[BEAT_ORDER[i - 1]]);
  });
  it('the tolerance is narrower than half the tightest gap, so a press is never on two beats', () => {
    const gaps = BEAT_ORDER.slice(1).map((b, i) => BEAT_T[b] - BEAT_T[BEAT_ORDER[i]]);
    expect(BEAT_TOL_SEC * 2).toBeLessThan(Math.min(...gaps));
  });
  it('a frame crossing a beat reports it once; a hitch crossing two reports both', () => {
    expect(beatsCrossed(0.29, 0.31)).toEqual(['rise']);
    expect(beatsCrossed(0.31, 0.32)).toEqual([]);
    expect(beatsCrossed(0.69, 1.01)).toEqual(['hang', 'preSlam']);
    expect(beatsCrossed(1.2, 1.25)).toEqual(['slam']);
    expect(beatsCrossed(0.5, 0.5)).toEqual([]);
    expect(beatsCrossed(0.8, 0.4)).toEqual([]);
  });
});

describe('a trick\'s beats', () => {
  it('are its cue window, fire beat through last — every trick in the vocabulary, and the 720', () => {
    for (const t of [...DUNK_TRICKS, SPIN_720]) {
      const beats = trickBeats(t);
      expect(beats.length, t.id).toBeGreaterThan(0);
      expect(CUE_BEAT_T[beats[0]]).toBe(cueFireAt(t));
      expect(CUE_BEAT_T[beats[beats.length - 1]]).toBe(cueLastAt(t));
    }
    expect(trickBeats(T('windmill'))).toEqual(['rise', 'hang']);
    expect(trickBeats(T('hideseek'))).toEqual(['rise', 'hang', 'preSlam']);
    expect(trickBeats(T('tomahawk'))).toEqual(['hang', 'preSlam']);
  });
});

describe('grading a trick press', () => {
  it('ON THE BEAT either side of any beat the trick may fire on', () => {
    const w = T('windmill');
    for (const t of [CUE_BEAT_T.rise - BEAT_TOL_SEC + 0.001, CUE_BEAT_T.rise, CUE_BEAT_T.rise + BEAT_TOL_SEC - 0.001]) {
      expect(gradeTrickPress(w, t)).toMatchObject({ grade: 'onbeat', beat: 'rise' });
    }
    expect(gradeTrickPress(w, CUE_BEAT_T.hang + 0.03)).toMatchObject({ grade: 'onbeat', beat: 'hang' });
  });
  it('the tolerance is the edge: one hair past it is not on the beat', () => {
    const w = T('windmill');
    expect(gradeTrickPress(w, CUE_BEAT_T.rise - BEAT_TOL_SEC - 0.002).grade).toBe('early');
    expect(gradeTrickPress(w, CUE_BEAT_T.rise + BEAT_TOL_SEC + 0.002).grade).toBe('off');
  });
  it('EARLY is the old arming, unchanged: before the fire beat and outside the tolerance, it fires on that beat', () => {
    const g = gradeTrickPress(T('tomahawk'), CUE_BEAT_T.rise);   // a hang trick pressed on the RISE is not on ITS beat
    expect(g).toMatchObject({ grade: 'early', beat: 'hang' });
    expect(cueVerdict(T('tomahawk'), CUE_BEAT_T.rise)).toBe('early');
  });
  it('OFF THE BEAT is inside the window between beats — placed after the beat it passed', () => {
    expect(gradeTrickPress(T('hideseek'), 0.5)).toMatchObject({ grade: 'off', beat: 'rise' });
    expect(gradeTrickPress(T('hideseek'), 0.85)).toMatchObject({ grade: 'off', beat: 'hang' });
  });
  it('a wider (TV) tolerance takes a later press', () => {
    const late = CUE_BEAT_T.hang + BEAT_TOL_SEC * 1.2;
    expect(gradeTrickPress(T('windmill'), late).grade).toBe('off');
    expect(gradeTrickPress(T('windmill'), late, BEAT_TOL_SEC * 1.35).grade).toBe('onbeat');
  });
  it('never says ON THE BEAT for a beat outside the trick\'s own window', () => {
    for (const t of DUNK_TRICKS) for (const b of ['rise', 'hang', 'preSlam'] as const) {
      const g = gradeTrickPress(t, CUE_BEAT_T[b]);
      if (g.grade === 'onbeat') expect(trickBeats(t)).toContain(g.beat);
      else expect(trickBeats(t)).not.toContain(b);
    }
  });
  it('a bad tolerance falls back to the tuned one rather than grading everything', () => {
    expect(gradeTrickPress(T('windmill'), 0.5, NaN).grade).toBe('off');
    expect(gradeTrickPress(T('windmill'), 0.5, -1).grade).toBe('off');
  });
});

const mk = (grade: BeatMark['grade'], beat: BeatMark['beat'] = 'rise', label = 'WINDMILL'): BeatMark => ({ beat, label, grade });

describe('what the beats are worth', () => {
  it('nothing for a plain flight, and the old game for a newcomer who only arms', () => {
    expect(flightFlow([], 'ontime')).toMatchObject({ tricks: 0, onBeat: 0, perfect: false, beatExec: 0, flowStyle: 0, label: '' });
    expect(flightFlow([mk('early'), mk('off', 'hang')], 'ontime')).toMatchObject({ onBeat: 0, beatExec: 0, flowStyle: 0, perfect: false });
  });
  it('execution for each trick on its beat, capped', () => {
    expect(flightFlow([mk('onbeat')], 'late').beatExec).toBeCloseTo(BEAT_EXEC_EACH);
    expect(flightFlow([mk('onbeat'), mk('onbeat', 'hang')], 'early').beatExec).toBeCloseTo(BEAT_EXEC_EACH * 2);
    expect(flightFlow([mk('onbeat'), mk('onbeat', 'hang'), mk('onbeat', 'preSlam'), mk('onbeat', 'preSlam')], 'late').beatExec).toBe(BEAT_EXEC_MAX);
  });
  it('PERFECT FLIGHT is every trick on its beat AND the slam on time — and only that', () => {
    const all = [mk('onbeat'), mk('onbeat', 'hang')];
    expect(flightFlow(all, 'ontime')).toMatchObject({ perfect: true, flowStyle: PERFECT_FLIGHT_STYLE, label: 'PERFECT FLIGHT' });
    for (const z of ['early', 'late', 'cue', 'miss', null] as const) expect(flightFlow(all, z).perfect, String(z)).toBe(false);
    expect(flightFlow([mk('onbeat'), mk('off', 'hang')], 'ontime').perfect).toBe(false);
    expect(flightFlow([mk('onbeat'), mk('off', 'hang')], 'ontime').label).toBe('1/2 ON THE BEAT');
  });
});

const facts: DunkAttemptFacts = {
  trickDifficulty: 2.4, runwayDifficulty: 0, propBonus: 0, charge: 1, launchSpeed01: 1,
  styleTier: 3, styleTaps: 0, hype: 0, hang: false, repeat: false, execution01: 0.7,
};

describe('the card reads the beats', () => {
  it('without them it is the card it always was, byte for byte', () => {
    expect(dunkCard({ ...facts, beatExec: 0, flowStyle: 0 })).toEqual(dunkCard(facts));
  });
  it('beats lift execution; a perfect flight lifts style; neither leaves the 0–10 card', () => {
    const base = dunkCard(facts);
    const beats = dunkCard({ ...facts, beatExec: 1.2, flowStyle: 1 });
    expect(beats.execution).toBeCloseTo(base.execution + 1.2);
    expect(beats.style).toBeCloseTo(base.style + 1);
    const top = dunkCard({ ...facts, execution01: 1, styleTier: 8, hype: 100, beatExec: 5, flowStyle: 5 });
    expect(top.execution).toBe(10); expect(top.style).toBe(10);
  });
  it('a nonsense add is ignored, never a NaN on the card', () => {
    const c = dunkCard({ ...facts, beatExec: NaN, flowStyle: -3 });
    expect(c).toEqual(dunkCard(facts));
  });
});

describe('the strip on the wire', () => {
  it('round-trips', () => {
    const s: BeatStrip = { at: 2, marks: [mk('onbeat', 'rise', '360'), mk('off', 'hang', 'LOST & FOUND')], slam: 'ontime', perfect: false };
    expect(decodeBeatStrip(encodeBeatStrip(s))).toEqual(s);
    const empty: BeatStrip = { at: -1, marks: [], slam: null, perfect: false };
    expect(decodeBeatStrip(encodeBeatStrip(empty))).toEqual(empty);
  });
  it('a label can never break the wire', () => {
    const s: BeatStrip = { at: 0, marks: [mk('onbeat', 'rise', 'A|B,C:D')], slam: null, perfect: true };
    const back = decodeBeatStrip(encodeBeatStrip(s))!;
    expect(back.marks[0].label).toBe('A B C D');
    expect(back.perfect).toBe(true);
  });
  it('nothing, or anything malformed, is no strip', () => {
    for (const v of ['', null, undefined, 3, '9|||0', 'x|||0', '0|nope:onbeat:X||0', '0|rise:great:X||0', '0||sideways|0', '0|'] as unknown[]) {
      expect(decodeBeatStrip(v), String(v)).toBeNull();
    }
  });
});
