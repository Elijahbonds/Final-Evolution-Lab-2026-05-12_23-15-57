import { describe, it, expect } from 'vitest';
import {
  LIMBS, MOVE_KINDS, MOVE_LIMBS, MOVE_WINDOW_SCALE, MOVE_LATE_GRACE_SEC, ZONE_RADIUS_H, SELF_VIEW_ASPECT,
  limbSatisfies, inZone, imageToSelfView, mirrorLimb, mirrorZone, type Limb,
} from './bodyTargets';
import {
  DancePerformance, bodyWindows, bodyWindowFloor, judgeDelta, stepAccepts, isBodyStep, JUDGE_WINDOWS, MISS_AFTER,
  BODY_WINDOW_FLOOR_SEC, type DanceStep,
} from './DanceCore';
import { cueLane, MOVE_GLYPH, MOVE_COLOR } from './danceTracks';

/** A body step at `time` s (the judge runs at 60 BPM here, so a beat is a second). */
const body = (time: number, over: Partial<DanceStep> = {}): DanceStep => ({
  clipId: `s${time}`, beat: time, holdBeats: 0, mirrored: false, move: 'jump', limb: 'feet',
  windowScale: 1, lateGraceSec: 0.25, ...over,
});
const perfWith = (steps: DanceStep[], latencySec = 0) => {
  const p = new DancePerformance(60);
  p.setRoutine(steps);
  p.setBody({ latencySec });
  p.start(0);
  return p;
};

describe('body targets: limbs and zones', () => {
  it('every move names the limbs it can be asked of, and every limb is a real one', () => {
    for (const m of MOVE_KINDS) {
      expect(MOVE_LIMBS[m].length).toBeGreaterThan(0);
      for (const l of MOVE_LIMBS[m]) if (l !== null) expect(LIMBS).toContain(l);
      expect(MOVE_WINDOW_SCALE[m]).toBeGreaterThanOrEqual(1);
      expect(MOVE_LATE_GRACE_SEC[m]).toBeGreaterThanOrEqual(0);
    }
  });

  it('hands: either hand answers "hands"; a two-hand event answers one hand; the other hand does not', () => {
    expect(limbSatisfies('hands', 'handL')).toBe(true);
    expect(limbSatisfies('hands', 'handR')).toBe(true);
    expect(limbSatisfies('handL', 'hands')).toBe(true);
    expect(limbSatisfies('handL', 'handR')).toBe(false);
    expect(limbSatisfies('handL', undefined)).toBe(false);
    expect(limbSatisfies(undefined, 'footR')).toBe(true);
  });

  it('feet are strict: one foot is not a two-foot take-off, two feet are not a single-leg stick', () => {
    expect(limbSatisfies('feet', 'footL')).toBe(false);
    expect(limbSatisfies('footL', 'feet')).toBe(false);
    expect(limbSatisfies('footL', 'footR')).toBe(false);
    expect(limbSatisfies('feet', 'feet')).toBe(true);
  });

  it('mirroring swaps sides and is its own inverse', () => {
    for (const l of LIMBS) expect(mirrorLimb(mirrorLimb(l))).toBe(l);
    expect(mirrorLimb('handL')).toBe('handR');
    expect(mirrorLimb('feet')).toBe('feet');
    expect(mirrorZone({ x: 0.3, y: 0.7, limb: 'kneeL' })).toEqual({ x: 0.7, y: 0.7, limb: 'kneeR' });
  });

  it('the self-view is the camera image mirrored: the player\'s left hand shows on the view\'s left', () => {
    // facing the camera, the subject's left side is on the IMAGE's right (lib/pose/landmarks.ts)
    const leftWristImage = { x: 0.62, y: 0.4 };
    expect(imageToSelfView(leftWristImage.x, leftWristImage.y).x).toBeCloseTo(0.38, 9);
  });

  it('a zone is round on screen: its radius is in frame heights, x scaled by the aspect', () => {
    const z = { x: 0.5, y: 0.5 };
    expect(inZone(z, 0.5, 0.5 + ZONE_RADIUS_H * 0.99)).toBe(true);
    expect(inZone(z, 0.5, 0.5 + ZONE_RADIUS_H * 1.01)).toBe(false);
    expect(inZone(z, 0.5 + (ZONE_RADIUS_H * 0.99) / SELF_VIEW_ASPECT, 0.5)).toBe(true);
    expect(inZone(z, 0.5 + ZONE_RADIUS_H * 0.99, 0.5)).toBe(false);   // the same numbers sideways are further on screen
  });

  it('a zone step judges on the aspect it is given: a portrait frame (3:4) is not the 4:3 default', () => {
    const touch = body(1, { move: 'touch', limb: 'handL', zone: { x: 0.5, y: 0.5, limb: 'handL' } });
    const hit = { move: 'touch' as const, limb: 'handL' as const, x: 0.57, y: 0.5 };
    expect(stepAccepts(touch, hit)).toBe(false);          // 0.07 × 4/3 = 0.093 frame heights: outside
    expect(stepAccepts(touch, hit, 3 / 4)).toBe(true);    // 0.07 × 3/4 = 0.053: inside
    const p = perfWith([touch]);
    p.setBody({ aspect: 3 / 4 });
    expect(p.hitBody(1, hit)).toBe('PERFECT');
  });

  it('no move asks for a limb no event carries: a dip names none, a rest names what bears the weight', () => {
    expect(MOVE_LIMBS.squat).toEqual([null]);
    for (const m of MOVE_KINDS) expect(MOVE_LIMBS[m], m).not.toContain('hips');
  });
});

describe('body windows: floored for the pose rate', () => {
  it('no body window is narrower than ±50 ms at 30 Hz (1.5 frames), wider at the space check\'s 24 Hz floor', () => {
    expect(bodyWindowFloor(30)).toBeCloseTo(BODY_WINDOW_FLOOR_SEC, 9);
    expect(bodyWindowFloor(24)).toBeCloseTo(1.5 / 24, 9);
    expect(bodyWindowFloor(60)).toBe(BODY_WINDOW_FLOOR_SEC);
    const { windows, missAfter } = bodyWindows(1, 30);
    expect(windows.map((w) => w.label)).toEqual(['PERFECT', 'GREAT', 'GOOD']);
    expect(windows[0].maxDelta).toBe(0.05);                // PERFECT lifted from ±40 ms
    expect(windows[1].maxDelta).toBe(JUDGE_WINDOWS[1].maxDelta);
    expect(missAfter).toBe(MISS_AFTER);
  });
  it('scales for slow moves and stays ordered even when the floor passes a window', () => {
    const squat = bodyWindows(MOVE_WINDOW_SCALE.squat, 30);
    expect(squat.windows[0].maxDelta).toBeCloseTo(0.08, 9);
    expect(squat.missAfter).toBeCloseTo(0.4, 9);
    const slowCam = bodyWindows(1, 5);                     // a 5 Hz stream: 0.3 s floor lifts every window
    for (let i = 1; i < slowCam.windows.length; i++) expect(slowCam.windows[i].maxDelta).toBeGreaterThanOrEqual(slowCam.windows[i - 1].maxDelta);
    expect(slowCam.missAfter).toBeGreaterThanOrEqual(slowCam.windows[2].maxDelta);
  });
  it('judgeDelta with the default windows is the dance judge, unchanged', () => {
    expect(judgeDelta(0.045).label).toBe('GREAT');
    expect(judgeDelta(0.045, bodyWindows().windows).label).toBe('PERFECT');
  });
});

describe('judging body steps: only the matching move and limb scores', () => {
  it('a press step (no move, or tap) takes any input, a body step takes only its own move', () => {
    const press: DanceStep = { clipId: 'x', beat: 0, holdBeats: 1, mirrored: false };
    expect(isBodyStep(press)).toBe(false);
    expect(isBodyStep({ ...press, move: 'tap' })).toBe(false);
    expect(stepAccepts(press, null)).toBe(true);
    expect(stepAccepts(press, { move: 'punch', limb: 'handL' })).toBe(true);
    const jump = body(1);
    expect(stepAccepts(jump, null)).toBe(false);
    expect(stepAccepts(jump, { move: 'punch', limb: 'handL' })).toBe(false);
    expect(stepAccepts(jump, { move: 'jump', limb: 'footL' })).toBe(false);
    expect(stepAccepts(jump, { move: 'jump', limb: 'feet' })).toBe(true);
  });

  it('a press cannot score a body target (it is a wild tap), and the target still waits for the body', () => {
    const p = perfWith([body(1)]);
    p.update(1);
    expect(p.hit(1)).toBe('MISS');                          // the old judge scored this PERFECT
    expect(p.counts.PERFECT).toBe(0);
    expect(p.hitBody(1.01, { move: 'jump', limb: 'feet' })).toBe('PERFECT');
  });

  it('the wrong move, or the wrong limb, is ignored: no score, no cost, no broken combo', () => {
    const p = perfWith([body(1, { move: 'punch', limb: 'handL' }), body(2, { move: 'punch', limb: 'handL' })]);
    p.update(1);
    expect(p.hitBody(1, { move: 'punch', limb: 'handL' })).toBe('PERFECT');
    const before = { score: p.score, combo: p.combo };
    p.update(2);
    expect(p.hitBody(2, { move: 'jump', limb: 'feet' })).toBeNull();
    expect(p.hitBody(2, { move: 'punch', limb: 'handR' })).toBeNull();
    expect({ score: p.score, combo: p.combo }).toEqual(before);
    expect(p.hitBody(2.01, { move: 'punch', limb: 'hands' })).toBe('PERFECT');   // both hands include the left
    expect(p.combo).toBe(2);
  });

  it('a zone target needs the limb IN the zone: no position, or outside, does not score', () => {
    const zone = { x: 0.28, y: 0.78, limb: 'handL' as Limb };
    const p = perfWith([body(1, { move: 'touch', limb: 'handL', zone })]);
    p.update(1);
    expect(p.hitBody(1, { move: 'touch', limb: 'handL' })).toBeNull();
    expect(p.hitBody(1, { move: 'touch', limb: 'handL', x: 0.5, y: 0.78 })).toBeNull();
    expect(p.hitBody(1, { move: 'touch', limb: 'handL', x: 0.3, y: 0.8 })).toBe('PERFECT');
  });

  it('camera latency: an event stamped late by the latency judges on time; without the offset it reads late', () => {
    const late = 0.12;
    const withOffset = perfWith([body(1)], late);
    withOffset.update(1.2);
    expect(withOffset.hitBody(1 + late, { move: 'jump', limb: 'feet' })).toBe('PERFECT');
    const without = perfWith([body(1)]);
    without.update(1.2);
    expect(without.hitBody(1 + late, { move: 'jump', limb: 'feet' })).toBe('GOOD');
  });

  it('the ±50 ms floor: a body 45 ms late is PERFECT where a press 45 ms late is GREAT', () => {
    const p = perfWith([body(1)]);
    p.update(1.05);
    expect(p.hitBody(1.045, { move: 'jump', limb: 'feet' })).toBe('PERFECT');
    const pad = new DancePerformance(60);
    pad.setRoutine([{ clipId: 'x', beat: 1, holdBeats: 1, mirrored: false }]);
    pad.start(0); pad.update(1.05);
    expect(pad.hit(1.045)).toBe('GREAT');
  });

  it('a back-dated event arriving after the window still scores inside the late grace, and not after it', () => {
    // the take-off happened 0.15 s late but the reader only knew it 0.2 s after that
    const p = perfWith([body(1)]);
    p.update(1.35);                                          // past MISS_AFTER (0.2) but inside + lateGrace 0.25
    expect(p.counts.MISS).toBe(0);
    expect(p.hitBody(1.15, { move: 'jump', limb: 'feet' })).toBe('GOOD');
    const noGrace = perfWith([body(1, { lateGraceSec: 0 })]);
    noGrace.update(1.35);
    expect(noGrace.counts.MISS).toBe(1);
    expect(noGrace.hitBody(1.15, { move: 'jump', limb: 'feet' })).toBeNull();
  });

  it('a press step still expires at MISS_AFTER beside body steps that wait longer', () => {
    const p = perfWith([body(1, { lateGraceSec: 1.5, move: 'penultimate', limb: 'footR' }), { clipId: 'tap', beat: 1.1, holdBeats: 1, mirrored: false }]);
    p.update(1.35);
    expect(p.counts.MISS).toBe(1);                           // the tap expired; the penultimate waits
    expect(p.hitBody(1.02, { move: 'penultimate', limb: 'footR' })).toBe('PERFECT');
  });

  it('an early press passes over an unfired body step to the press step behind it, which then never fires again', () => {
    // 60 BPM from 10: a jump at 11.0, a press step at 11.15, a press 150 ms early. hit()'s early path looked only at
    // steps[nextIdx] (the jump, which no press answers) and called it a wild tap: MISS, -20 and the spam lock.
    const jump = body(1);
    const tap: DanceStep = { clipId: 'tap', beat: 1.15, holdBeats: 1, mirrored: false };
    const mixed = new DancePerformance(60), alone = new DancePerformance(60);
    mixed.setRoutine([jump, tap]); alone.setRoutine([tap]);
    mixed.start(10); alone.start(10);
    const fired: string[] = [];
    mixed.onStepFired = (s) => fired.push(s.clipId);
    mixed.update(10.95); alone.update(10.95);
    expect(alone.hit(11)).toBe('GOOD');
    expect(mixed.hit(11)).toBe('GOOD');
    expect(mixed.score).toBe(105);                          // GOOD 100 + a combo of 1 × 5, no wild-tap cost
    expect([mixed.score, mixed.combo, mixed.counts]).toEqual([alone.score, alone.combo, alone.counts]);
    expect(fired).toEqual(['tap']);
    expect(mixed.upcoming(11).map((u) => u.step.clipId)).toEqual([jump.clipId]);   // the taken press is off the lane
    expect(mixed.peekNext(11)?.step).toBe(jump);
    // and no spam lock: a PERFECT press 0.21 s later (inside SPAM_LOCK_SEC) is not capped at GOOD
    const lock = new DancePerformance(60);
    lock.setRoutine([jump, tap, { clipId: 'tap2', beat: 1.2, holdBeats: 1, mirrored: false }]);
    lock.start(10); lock.update(10.95);
    expect(lock.hit(11)).toBe('GOOD');
    lock.update(11.21);
    expect(lock.hit(11.21)).toBe('PERFECT');
    // the jump still fires on time and waits for the body; the press step it passed over does not fire again
    mixed.update(11.2);
    expect(fired).toEqual(['tap', jump.clipId]);
    expect(mixed.hitBody(11.02, { move: 'jump', limb: 'feet' })).toBe('PERFECT');
    mixed.update(13);
    expect(mixed.counts).toEqual({ PERFECT: 1, GREAT: 0, GOOD: 1, MISS: 0 });
    expect(fired).toEqual(['tap', jump.clipId]);
  });

  it('a press judges a mixed chart\'s press steps exactly as it judges the same chart without its body steps', () => {
    // Seeded mixed charts (press steps and body targets interleaved, ties included) against the same chart with the
    // body steps taken out, with the same presses on the same frame clock, both orders of press and frame. The mixed
    // run also gets body events answering (and missing) its body targets. Every press, every press-step judgement and
    // every wild tap must come out the same: label, points, which step and the signed delta.
    const rng = (seed: number) => {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    const MOVES: { move: DanceStep['move']; limb?: Limb }[] = [
      { move: 'jump', limb: 'feet' }, { move: 'punch', limb: 'handR' }, { move: 'squat' }, { move: 'step', limb: 'footL' },
    ];
    type Row = [string, number, string | null, number | null];
    let presses = 0, passedOver = 0, pressJudged = 0;
    for (let seed = 1; seed <= 240; seed++) {
      const rnd = rng(seed * 2654435761);
      const bpm = [60, 96, 124, 200][seed % 4];
      const bd = 60 / bpm;
      const steps: DanceStep[] = [];
      let beat = rnd() < 0.3 ? 0 : 0.5;
      for (let i = 0; i < 28; i++) {
        const tie = rnd() < 0.1;
        if (!tie) beat += [0.25, 0.5, 0.5, 1, 1, 2][Math.floor(rnd() * 6)] * (rnd() < 0.2 ? 0.3 + rnd() : 1);
        if (rnd() < 0.45) {
          const m = MOVES[Math.floor(rnd() * MOVES.length)];
          steps.push(body(beat, { clipId: `b${i}`, move: m.move, limb: m.limb, windowScale: 1 + Math.floor(rnd() * 2) }));
        } else {
          steps.push({ clipId: `p${i}`, beat, holdBeats: 1, mirrored: false, ...(rnd() < 0.2 ? { move: 'tap' as const } : {}) });
        }
      }
      const pressSteps = steps.filter((s) => !isBodyStep(s));
      const startAt = [0, 3.7, 1000.25][seed % 3];
      const end = startAt + (beat + 2) * bd;
      const pressTimes: number[] = [];
      for (const s of steps) {
        const t = startAt + s.beat * bd;
        if (isBodyStep(s)) { if (rnd() < 0.35) pressTimes.push(t + (rnd() - 0.3) * 0.3); }       // a press near a body target
        else if (rnd() < 0.85) pressTimes.push(t + (rnd() - 0.5) * 0.5 + (rnd() < 0.5 ? -0.1 : 0)); // near its own step
      }
      for (let k = 0; k < 6; k++) pressTimes.push(startAt - 0.3 + rnd() * (end - startAt));      // noise
      pressTimes.sort((a, b) => a - b);
      const bodyEvents = steps.filter((s) => isBodyStep(s) && rnd() < 0.7).map((s) => ({
        t: startAt + s.beat * bd + (rnd() - 0.5) * 0.3,
        hit: { move: s.move!, ...(s.limb ? { limb: s.limb } : {}) },
      })).sort((a, b) => a.t - b.t);
      const updateFirst = seed % 2 === 0;

      const mixed = new DancePerformance(bpm), alone = new DancePerformance(bpm);
      mixed.setRoutine(steps); alone.setRoutine(pressSteps);
      const mRows: Row[] = [], aRows: Row[] = [];
      const row = (label: string, points: number, step?: DanceStep, deltaMs?: number): Row =>
        [label, points, step?.clipId ?? null, deltaMs ?? null];
      mixed.onJudged = (label, points, _c, step, deltaMs) => { if (!step || !isBodyStep(step)) mRows.push(row(label, points, step, deltaMs)); };
      alone.onJudged = (label, points, _c, step, deltaMs) => { aRows.push(row(label, points, step, deltaMs)); };
      mixed.start(startAt); alone.start(startAt);
      let pi = 0, bi = 0;
      for (let f = startAt - 0.5; f < end + 1; f += 1 / 60 + (rnd() < 0.05 ? rnd() * 0.2 : 0)) {
        if (updateFirst) { mixed.update(f); alone.update(f); }
        while (pi < pressTimes.length && pressTimes[pi] <= f) {
          const t = pressTimes[pi++];
          const internals = mixed as unknown as { steps: DanceStep[]; nextIdx: number };
          const nextIdx = internals.nextIdx, before = mRows.length;
          const got = mixed.hit(t);
          expect(got, `seed ${seed}: press at ${t}`).toBe(alone.hit(t));
          presses++;
          // taken out of chart order: a step past nextIdx, behind an unfired body step (or a step already taken)
          const took = mRows[before]?.[2];
          if (got !== 'MISS' && took && internals.steps.findIndex((s) => s.clipId === took) > nextIdx) passedOver++;
        }
        if (!updateFirst) { mixed.update(f); alone.update(f); }
        while (bi < bodyEvents.length && bodyEvents[bi].t <= f) { const e = bodyEvents[bi++]; mixed.hitBody(e.t, e.hit); }
      }
      expect(mRows, `seed ${seed}`).toEqual(aRows);
      pressJudged += aRows.length;
    }
    expect(presses).toBeGreaterThan(3000);
    expect(pressJudged).toBeGreaterThan(3000);
    expect(passedOver).toBeGreaterThan(100);                 // the path the fix opened: a press taken out of chart order
    console.info(`[mixed-chart presses] 240 charts: ${presses} presses, ${pressJudged} press judgements, `
      + `${passedOver} early presses taken out of chart order, 0 differences from the press-only chart`);
  });

  it('an early hit takes an upcoming step, even out of chart order, and that step never fires again', () => {
    const p = perfWith([body(1, { move: 'jump', limb: 'feet' }), body(1.05, { move: 'punch', limb: 'handR' })]);
    const fired: string[] = [];
    p.onStepFired = (s) => fired.push(s.move!);
    p.update(0.9);
    expect(p.hitBody(1.04, { move: 'punch', limb: 'handR' })).toBe('PERFECT');   // the second step, before either fired
    expect(p.upcoming(0.9).map((u) => u.step.move)).toEqual(['jump']);
    p.update(1.1);
    expect(fired).toEqual(['punch', 'jump']);
    expect(p.hitBody(1.08, { move: 'jump', limb: 'feet' })).toBe('GREAT');
    p.update(3);
    expect(p.counts).toEqual({ PERFECT: 1, GREAT: 1, GOOD: 0, MISS: 0 });
  });

  it('one event scores one step: the nearest of two jumps, and the other stays for its own event', () => {
    const p = perfWith([body(1), body(1.5)]);
    p.update(1.3);
    expect(p.hitBody(1.3, { move: 'jump', limb: 'feet' })).toBe('GOOD');    // 0.2 from 1.5, 0.3 from 1: the second
    expect(p.hitBody(1.3, { move: 'jump', limb: 'feet' })).toBeNull();      // the first is out of reach now
    p.update(2);
    expect(p.counts.MISS).toBe(1);
  });

  it('slow moves get their scaled window: a squat bottom 0.3 s off is still GOOD', () => {
    const p = perfWith([body(2, { move: 'squat', limb: undefined, windowScale: MOVE_WINDOW_SCALE.squat })]);
    p.update(2.3);
    expect(p.hitBody(2.3, { move: 'squat' })).toBe('GOOD');
  });
});

describe('the cue lane carries body targets', () => {
  it('a body step becomes a cue with its move, limb, zone and hold; a dance step is a tap', () => {
    const zone = { x: 0.72, y: 0.78, limb: 'handR' as Limb };
    const lane = cueLane([
      { time: 10.5, step: body(0, { move: 'touch', limb: 'handR', zone, label: 'RIGHT CONE' }) },
      { time: 11, step: body(0, { move: 'land', limb: 'footL', holdSec: 2 }) },
      { time: 11.2, step: { clipId: 'dance_toprock_basic', beat: 0, holdBeats: 4, mirrored: false } },
    ], 10);
    expect(lane[0]).toMatchObject({ move: 'touch', name: 'RIGHT CONE', limb: 'handR', zone, glyph: MOVE_GLYPH.touch, color: MOVE_COLOR.touch });
    expect(lane[1]).toMatchObject({ move: 'land', name: 'LAND', limb: 'footL', holdSec: 2 });
    expect(lane[1].zone).toBeUndefined();
    expect(lane[2]).toMatchObject({ move: 'tap', glyph: 'TR' });
    expect(lane[2].zone).toBeUndefined();
  });
});
