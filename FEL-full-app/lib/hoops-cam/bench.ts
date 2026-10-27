// lib/hoops-cam/bench.ts — basketball on the camera (BBS, 2026-10-26): the detector and the reads, measured on the
// synthetic court (scene.ts) against its truth. RATES ON DRAWN FRAMES — not a claim about a real gym (copy.ts).
//
//   ball found     frames where the ball is in the picture and the tracker's sighting is within BALL_HIT_PX or
//                  BALL_HIT_R radii of it, over all such frames (and over the flight frames alone);
//   false ball     sightings farther than 3 radii from the ball, or with no ball in the picture, over all sightings;
//   shots found    true shots matched by a read released within MATCH_MS; ghost shots are reads that match none;
//   make/miss      matched shots whose read outcome is the physics' outcome; the reads flagged NOT SURE (the page asks)
//                  are counted apart;
//   dribbles       floor contacts matched within DRIBBLE_MATCH_MS, crossovers matched, the rate's error.
//
// Pure (it films in memory). The full table: scripts/probes/_hoops-cam-bench.mts.
import { BallEye } from './track';
import { ShotReader, type ShotRead } from './shots';
import { rimPx } from './rim';
import { DribbleReader, type DribbleRead } from './dribble';
import { filmFixture, filmDribbles, rimTruth, BALL_R, RIM_R, type Fixture, type DribbleFixture, type ShotTruth, type DribbleTruth } from './scene';
import { ballRange } from './live';

export const BALL_HIT_PX = 3;
export const BALL_HIT_R = 1.2;
export const MATCH_MS = 450;
export const DRIBBLE_MATCH_MS = 120;

export interface ShotBench {
  id: string; name: string; frames: number; ms: number;
  ballFrames: number; ballFound: number; flightFrames: number; flightFound: number; sightings: number; falseBall: number;
  shots: number; makes: number; found: number; ghosts: number; agree: number; unsure: number; unsureAgree: number;
  pairs: { truth: ShotTruth; read: ShotRead | null }[];
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

export function benchShots(fx: Fixture, o: { maxShots?: number } = {}): ShotBench {
  const rim = rimTruth(fx.cam);
  const W = fx.cam.w, H = fx.cam.h;
  const rp = rimPx(rim, W, H);
  const eye = new BallEye({ rRange: ballRange(rp), gPx: 0 });
  const reader = new ShotReader(rp, { w: W, h: H });
  const reads: ShotRead[] = [];
  let frames = 0, ballFrames = 0, ballFound = 0, flightFrames = 0, flightFound = 0, sightings = 0, falseBall = 0;
  const started = Date.now();
  let releases: number[] = [];
  const res = filmFixture(fx, (f) => {
    frames++;
    reader.seePose(f.t, f.pose);
    const obs = eye.see(f.t, f.rgb, f.pose);
    const truth = f.ball && f.ball.visible ? f.ball : null;
    const inFlight = releases.some((r) => f.t >= r && f.t <= r + 2200);
    if (truth) {
      ballFrames++;
      if (inFlight) flightFrames++;
      if (obs && !obs.coast && Math.hypot(obs.x - truth.x, obs.y - truth.y) <= Math.max(BALL_HIT_PX, BALL_HIT_R * truth.r)) { ballFound++; if (inFlight) flightFound++; }
    }
    if (obs && !obs.coast) {
      sightings++;
      if (!truth || Math.hypot(obs.x - truth.x, obs.y - truth.y) > 3 * Math.max(2, truth.r)) falseBall++;
    }
    const r = reader.step(f.t, obs);
    if (r) reads.push(r);
  }, { ...o, onPlan: (shots) => { releases = shots.map((s) => s.releaseT); } });
  const last = reader.flush(res.durationMs);
  if (last) reads.push(last);
  const used = new Set<ShotRead>();
  const pairs = res.shots.map((truth) => {
    const read = reads.find((r) => !used.has(r) && Math.abs(r.t - truth.releaseT) <= MATCH_MS) ?? null;
    if (read) used.add(read);
    return { truth, read };
  });
  const found = pairs.filter((p) => p.read).length;
  const agree = pairs.filter((p) => p.read && p.read.sure && (p.read.outcome === 'make') === p.truth.made).length;
  const unsure = pairs.filter((p) => p.read && !p.read.sure).length;
  const unsureAgree = pairs.filter((p) => p.read && !p.read.sure && (p.read.outcome === 'make') === p.truth.made).length;
  return {
    id: fx.id, name: fx.name, frames, ms: Date.now() - started,
    ballFrames, ballFound, flightFrames, flightFound, sightings, falseBall,
    shots: res.shots.length, makes: res.shots.filter((s) => s.made).length, found, ghosts: reads.length - used.size, agree, unsure, unsureAgree, pairs,
  };
}

/** One row of the table (percentages to one decimal). */
export function shotRow(b: ShotBench) {
  const sure = b.found - b.unsure;
  return {
    id: b.id, shots: b.shots, makes: b.makes,
    ballFoundPct: pct(b.ballFound, b.ballFrames), flightFoundPct: pct(b.flightFound, b.flightFrames), falseBallPct: pct(b.falseBall, b.sightings),
    shotsFoundPct: pct(b.found, b.shots), ghosts: b.ghosts,
    makeMissAgreePct: pct(b.agree, sure), notSure: b.unsure, notSureRightPct: pct(b.unsureAgree, b.unsure),
  };
}

export interface DribbleBench {
  id: string; name: string; frames: number;
  bounces: number; found: number; extra: number; crosses: number; crossFound: number; crossExtra: number;
  rateTrue: number; rateRead: number | null; read: DribbleRead; truth: DribbleTruth[];
}

export function benchDribbles(fx: DribbleFixture): DribbleBench {
  const W = fx.cam.w, H = fx.cam.h;
  const eye = new BallEye({ rRange: { min: 2, max: H * 0.12 }, gPx: 0 });
  const reader = new DribbleReader({ w: W, h: H });
  let frames = 0;
  const res = filmDribbles(fx, (f) => {
    frames++;
    const obs = eye.see(f.t, f.rgb, f.pose);
    reader.step(f.t, obs, f.pose);
  });
  const read = reader.read();
  const truth: DribbleTruth[] = res.bounces;
  const used = new Set<number>();
  let found = 0, crossFound = 0;
  for (const b of truth) {
    const i = read.bounces.findIndex((r, k) => !used.has(k) && Math.abs(r.t - b.t) <= DRIBBLE_MATCH_MS);
    if (i >= 0) { used.add(i); found++; if (b.cross && read.bounces[i].cross) crossFound++; }
  }
  const crosses = truth.filter((b) => b.cross).length;
  const crossRead = read.bounces.filter((b) => b.cross).length;
  const gaps = truth.slice(1).map((b, i) => b.t - truth[i].t).filter((g) => g <= 1300).sort((a, b) => a - b);
  const medGap = gaps.length ? gaps[gaps.length >> 1] : NaN;
  return {
    id: fx.id, name: fx.name, frames, bounces: truth.length, found, extra: read.bounces.length - used.size,
    crosses, crossFound, crossExtra: Math.max(0, crossRead - crossFound),
    rateTrue: Math.round((1000 / medGap) * 100) / 100, rateRead: read.rateHz, read, truth,
  };
}

export function dribbleRow(b: DribbleBench) {
  return {
    id: b.id, bounces: b.bounces, foundPct: pct(b.found, b.bounces), extra: b.extra,
    crossovers: b.crosses, crossFoundPct: pct(b.crossFound, b.crosses), crossExtra: b.crossExtra,
  };
}

/** The ball's radius at the ring's depth, from the ring's half-width (for the size range). */
export const ballAtRim = (hwPx: number) => hwPx * (BALL_R / RIM_R);
