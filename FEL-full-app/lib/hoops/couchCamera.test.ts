// COUCH TURNS by CAMERA (lane/hoops-couch, 2026-10-24). Owner: "I was playing the 3PT shoot out … their jumper in front of the
// camera didn't trigger a shot, and only mine did." What the chain does with a SECOND body, on synthesized jump shots (the same
// scripted shot lib/move/hoopsBody.test grades), and what a couch turn changes. Synthesized, not recorded: what this proves is the
// chain (reader → session → shot read), not that a living room reads the same — that is the real-device test's.
//
//   1. The reader is not the blocker: person B's jump read through person A's rulers tells the same take-off, apex, release and
//      landing as through B's own (the floor re-anchors on planted feet, the metre ruler follows the torso, the world landmarks
//      are metric) — so no ruler is retuned here.
//   2. What does block it in one run: A walks out for LOST_PAUSE_MS and the body-driven run pauses; B's whole shot reaches nobody.
//   3. A couch turn: B's own run, B's own stand (the space check's hand-over), and B's jump fires B's shot, banked under B.
import { describe, expect, it } from 'vitest';
import { BodyReader, type BodyEvent } from '@/lib/pose/BodyReader';
import { calibrate, type Calibration } from '@/lib/pose/calibrate';
import { synthesize, type Joints, type V3 } from '@/lib/pose/synth';
import { script } from '@/lib/pose/streamKit';
import { bodyPackets, type StreamPacket } from '@/lib/pose/seamReplay';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { BODY_PROFILES } from '@/lib/input/bodyProfiles';
import { bodySeamFor } from '@/lib/babylon/core/bodySeam';
import { LOST_PAUSE_MS } from '@/lib/babylon/core/BodySession';
import type { ModeDefinition } from '@/lib/babylon/core/ModeHarness';
import { BodyShot, THREE_BODY, type ShotVerdict } from '@/lib/move/hoopsBody';
import { REST, shotBeat } from '@/lib/move/hoopsStreams';
import { recordTurnScore } from '@/lib/party/turns';
import { couchBoard, couchLineup, startCouch } from './couchTurns';

const STAND_S = 2;
/** A body `k` times the rest body's size, moved by `d` (m, the room: +x the camera's left, +z toward it). */
const body = (k: number, d: V3) => (j: Joints): Joints =>
  Object.fromEntries(Object.entries(j).map(([n, p]) => [n, [p[0] * k + d[0], p[1] * k + d[1], p[2] * k + d[2]]])) as Joints;
/** A still stand, then one jump shot (released 120 ms before its apex), then standing again — filmed at 30 fps from t0. */
function shooter(k: number, d: V3, seed: number, t0: number): PoseFrame[] {
  const S = shotBeat({ releaseVsApexSec: -0.12 }), f = body(k, d);
  return synthesize(script([[STAND_S, () => f(REST)], [S.beat[0], (t) => f(S.beat[1](t))], [1.2, () => f(REST)]]), { seed, fps: 30, t0 }).frames;
}
/** The stand's rulers, the way the space check takes them: a still window inside the stand (a missed detection is skipped, as
 *  StillnessGate.add skips it). */
function standCal(frames: PoseFrame[], t0: number): Calibration {
  const r = calibrate(frames.filter((f) => f.present && f.t > t0 + STAND_S * 1000 - 900 && f.t <= t0 + STAND_S * 1000 - 100));
  if (!r.ok) throw new Error(`the stand refused: ${r.why} ${r.detail}`);
  return r.cal;
}
const CLAIMS = new Set<string>(THREE_BODY.claims);
/** The claimed events after `from` (capture clock), and the shots BodyShot (the 3PT's onBody) decides from them. */
function readShots(events: BodyEvent[], ticks: number[], from: number): { kinds: string[]; shots: ShotVerdict[] } {
  const shot = new BodyShot(), shots: ShotVerdict[] = [], kinds: string[] = [];
  for (const ev of events) {
    if (ev.t < from || !CLAIMS.has(ev.kind)) continue;
    kinds.push(ev.kind);
    const a = shot.see(ev);
    if (a.verdict) shots.push(a.verdict);
  }
  for (const t of ticks) { const v = shot.tick(t); if (v) shots.push(v); }
  return { kinds, shots };
}
function readAll(frames: PoseFrame[], cal: Calibration): { events: BodyEvent[]; ticks: number[] } {
  const r = new BodyReader({ autoCalibrate: false, calibration: cal });
  const events: BodyEvent[] = [], ticks: number[] = [];
  for (const f of frames) { const o = r.read(f); events.push(...o.events); ticks.push(o.read.t); }
  return { events, ticks };
}

const A0 = 0;
const A = shooter(1, [0, 0, 0], 17, A0);
const calA = standCal(A, A0);

describe('1. the reader is not the blocker: B read through A\'s rulers', () => {
  const B0 = 10_000;
  for (const [name, k, d] of [
    ['a child (0.8×)', 0.8, [0, 0, 0]],
    ['the same size, 1.2 m further back', 1, [0, 0, -1.2]],
    ['0.85×, 0.6 m further and 0.4 m aside', 0.85, [-0.4, 0, -0.6]],
    ['the same size, 0.5 m nearer', 1, [0, 0, 0.5]],
  ] as [string, number, V3][]) {
    it(name, () => {
      const B = shooter(k, d, 29, B0);
      const viaA = readAll(B, calA), viaB = readAll(B, standCal(B, B0));
      const a = readShots(viaA.events, viaA.ticks, B0 + STAND_S * 1000), b = readShots(viaB.events, viaB.ticks, B0 + STAND_S * 1000);
      expect(a.kinds).toEqual(['takeoff', 'apex', 'release', 'land']);
      expect(a.kinds).toEqual(b.kinds);
      expect(a.shots.map((s) => s.why)).toEqual(['timed']);
      expect(Math.abs(a.shots[0].errMs - b.shots[0].errMs)).toBeLessThan(20);
    });
  }
});

/** The harness's body path, as ModeHarness runs it: the session steps every packet; a lost pause stops the run until a resume;
 *  the 3PT's onBody sees claimed events only while playing and past the START latch, and its take is noted as body input. */
function oneRun(packets: StreamPacket[]): { paused: boolean; shotsAfter: (t: number) => number } {
  const seam = bodySeamFor({ modeId: 'threepoint', body: { profile: BODY_PROFILES.threepoint }, onBody: () => true } as unknown as ModeDefinition);
  const s = seam.session;
  let phase: 'playing' | 'paused' = 'playing', paused = false;
  s.begin(packets[0].arrivedAt, 'body');
  const shot = new BodyShot(), fired: number[] = [];
  for (const p of packets) {
    const st = s.step(phase, p, p.arrivedAt);
    if (st.intents.includes('pause-lost')) { phase = 'paused'; paused = true; }
    if (st.intents.includes('resume')) { phase = 'playing'; s.begin(p.arrivedAt, 'body'); }
    if (phase !== 'playing' || st.latched) continue;
    for (const ev of p.events) {
      if (!CLAIMS.has(ev.kind)) continue;
      const a = shot.see(ev);
      if (a.took) s.noteInput('body', p.arrivedAt);
      if (a.verdict) fired.push(ev.t);
    }
  }
  return { paused, shotsAfter: (t) => fired.filter((x) => x >= t).length };
}
function handOverStream(gapMs: number): { packets: StreamPacket[]; b0: number } {
  const aEnd = A[A.length - 1].t;
  const gap: PoseFrame[] = [];
  for (let t = aEnd + 33; t < aEnd + gapMs; t += 33) gap.push({ t, present: false, image: [], arrive: t + 66 });
  const b0 = aEnd + gapMs;
  return { packets: bodyPackets([...A, ...gap, ...shooter(0.85, [0.3, 0, -0.5], 29, b0)], { reader: { autoCalibrate: false, calibration: calA } }), b0 };
}

describe('2. in ONE run, the hand-over is what loses B\'s shot', () => {
  it(`A out of the picture for longer than LOST_PAUSE_MS (${LOST_PAUSE_MS} ms): the run pauses and B's jump shot reaches nobody`, () => {
    const { packets, b0 } = handOverStream(2500);
    const r = oneRun(packets);
    expect(r.paused).toBe(true);
    expect(r.shotsAfter(b0)).toBe(0);
  });
  it('a swap quicker than that: B\'s shot fires — but into A\'s run, under A\'s name (one human in the mode)', () => {
    const { packets, b0 } = handOverStream(600);
    const r = oneRun(packets);
    expect(r.paused).toBe(false);
    expect(r.shotsAfter(b0)).toBe(1);
  });
});

describe('3. a couch turn: B\'s own run, B\'s own stand, B\'s own shot', () => {
  it('the hand-over drops A\'s rulers, B\'s stand calibrates, B\'s jump fires a shot in B\'s run, banked under P2', () => {
    let couch = startCouch(couchLineup(2, [], []))!;
    // P1's run: A's stand and shot
    const runA = readAll(A, calA);
    const shotA = readShots(runA.events, runA.ticks, A0 + STAND_S * 1000).shots;
    expect(shotA).toHaveLength(1);
    couch = { ...couch, turns: recordTurnScore(couch.turns, 3) };
    // the hand-over (bodyPlay.handOver → PoseSource.recalibrate): the reader forgets A; the space check passes on B's stand
    const reader = new BodyReader({ autoCalibrate: false, calibration: calA });
    for (const f of A) reader.read(f);
    reader.recalibrate();
    expect(reader.calibration).toBeNull();
    const B0 = A[A.length - 1].t + 3000;
    const B = shooter(0.8, [0.3, 0, -0.5], 41, B0);
    const calB = standCal(B, B0);
    const events: BodyEvent[] = [], ticks: number[] = [];
    for (const f of B) {
      if (f.t > B0 + STAND_S * 1000 - 100 && !reader.calibration) reader.setCalibration(calB);   // the check hands its rulers over
      const o = reader.read(f); events.push(...o.events); ticks.push(o.read.t);
    }
    expect(reader.calibration?.hipHeightM).toBeCloseTo(calB.hipHeightM, 6);
    expect(calB.hipHeightM).toBeLessThan(calA.hipHeightM - 0.1);   // B is the smaller body: their own rulers, not A's
    const shotB = readShots(events, ticks, B0 + STAND_S * 1000);
    expect(shotB.kinds).toEqual(['takeoff', 'apex', 'release', 'land']);
    expect(shotB.shots.map((s) => s.why)).toEqual(['timed']);
    couch = { ...couch, turns: recordTurnScore(couch.turns, 5) };
    expect(couchBoard(couch).map((r) => [r.display, r.score])).toEqual([['P2', 5], ['P1', 3]]);
  });
});
