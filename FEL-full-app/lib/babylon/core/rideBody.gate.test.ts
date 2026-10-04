// MOVEMENT PLAY P8 (2026-09-26): the ride read's gate on the REAL game models (PLAN-P8 §8.3 G8 on the cores, G9 FOLLOW,
// G10 PAD UNCHANGED). A labelled stream (lib/pose/rideStreams) is shot under a camera condition, read, and replayed through
// the P8 row (seamReplay: what the mode receives, on the arrival clock); the mode's own pure model then runs on it at 60 Hz —
// the skater's BoardMovement, the kart's stepKart + MiniTurbo, the plane's stepArcade, the real SprintCore and the big-air
// AirSessionCore — and what the MODEL did is graded: the heading drift at rest, the turn's direction and delay, the pop,
// the spin named in the air, the drift and its mini-turbo, the sprint's finish time.
//
// Conditions: seed 41 (a test seed: the thresholds were tuned on 11 / 17 / 23), 30 fps · 80 ms · 1× and the hard corner
// 15 fps · 200 ms · 1.5× noise · the label flip; both with 150 ms holes in the quiet stretches.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Vector3 } from '@babylonjs/core';
import {
  runStream, restStream, leanStream, hopStream, quarterStream, grabStream, wheelStream, wingStream, waveStretchStream, condName,
  realStream, EARLY_TURN_SEC, type RideCondition, type RideStream, type RideTakeFile,
} from '@/lib/pose/rideStreams';
import { rideRun, popPresses, type RideRun } from '@/lib/pose/rideGrade';
import type { StreamPacket } from '@/lib/pose/seamReplay';
import type { BodyEvent } from '@/lib/pose/BodyReader';
import { RIDE_ROWS_ON } from '@/lib/input/rideProfiles';
import { BodyStride, RideIntents, SPIN_EARLY_MS } from './rideBody';
import { spinTrickFor, grabTrickFor } from './rideTricks';
import type { BodyView } from './ModeHarness';
import { SprintCore } from '@/lib/feel/cores/sprint-core';
import { SPRINT_TUNING, SPRINT_SENSORY } from '@/lib/feel/cores/sprint-constants';
import { makeBigAirSession } from '@/lib/feel/cores/big-air-skin';
import type { CadenceQuality } from '@/lib/feel';
import { BoardMovement, SKATE_TUNING } from './BoardMovement';
import { AirControl } from './AirControl';
import { spawnKart, stepKart, driftQuality } from './KartModel';
import { stepMini, noMini } from '../racing/MiniTurbo';
import { spawnArcade, stepArcade, ARCADE_TRAINER } from '../racing/ArcadeFlight';

const EASY: RideCondition = { fps: 30, latencyMs: 80, noise: 1, flip: false, seed: 41, holes: true };
const HARD: RideCondition = { fps: 15, latencyMs: 200, noise: 1.5, flip: true, seed: 41, holes: true };
const CONDS = [EASY, HARD];
const STANCES = [{ theta: 45, lead: 'L' as const }, { theta: 30, lead: 'R' as const }];
const ROW = Object.fromEntries(RIDE_ROWS_ON.map((p) => [p.key, p]));
const DEG = 180 / Math.PI;
/** The sprint's rival runs 13.4 s (SprintMode RIVAL_SPEED) and the race ends 5 s after he finishes (RIVAL_GRACE_SEC). */
const RIVAL_S = 13.4, RACE_ENDS_S = RIVAL_S + 5;

const viewOf = (p: StreamPacket): BodyView => ({ read: p.read, channels: p.channels, arrivedAt: p.arrivedAt, lagMs: p.arrivedAt - p.read.t });
type Step = Extract<BodyEvent, { kind: 'step' }>;

// ── the mode's received stream, applied at 60 Hz on the arrival clock ──────────────────────────────────────────────

interface Held { x: number; y: number; rt: number; lt: number; held: Set<string>; presses: { k: string; at: number }[] }
function follow(run: RideRun, key: string, from: number, to: number, tick: (h: Held, dt: number, now: number) => void): Held {
  const bus = run.replays[key].bus;
  const h: Held = { x: 0, y: 0, rt: 0, lt: 0, held: new Set(), presses: [] };
  let i = 0;
  for (let now = from; now <= to; now += 1000 / 60) {
    while (i < bus.length && bus[i].at <= now) {
      const e = bus[i++].e;
      if (e.t === 'stick' && e.side === 'L') { h.x = e.x; h.y = e.y; }
      else if (e.t === 'trigger') { if (e.side === 'R') h.rt = e.value; else h.lt = e.value; }
      else if (e.t === 'button' || e.t === 'dpad') {
        const k = e.t === 'button' ? `b:${e.btn}` : `d:${e.dir}`;
        if (e.pressed) { h.held.add(k); h.presses.push({ k, at: now }); } else h.held.delete(k);
      }
    }
    tick(h, 1 / 60, now);
  }
  return h;
}
const cache = new Map<string, RideRun>();
function runOf(s: RideStream, c: RideCondition, keys: string[]): RideRun {
  const id = `${s.name}|${condName(c)}|${keys.join(',')}`;
  let r = cache.get(id);
  if (!r) { r = rideRun(s, c, keys.map((k) => ROW[k])); cache.set(id, r); }
  return r;
}

// ── G8 on the real cores ─────────────────────────────────────────────────────────────────────────────────────────

/** The told steps, graded as SprintMode / AirSessionMode grade them (body) or handed to the core raw (the pad's grading). */
function strides(run: RideRun, body: boolean): { at: number; t: number; foot: 'L' | 'R'; q: CadenceQuality | null }[] {
  const g = new BodyStride();
  const out: { at: number; t: number; foot: 'L' | 'R'; q: CadenceQuality | null }[] = [];
  for (const p of run.packets) for (const e of p.events) {
    if (e.kind !== 'step') continue;
    const q = body ? g.grade(e as Step, viewOf(p)) : null;
    if (!body || q) out.push({ at: p.arrivedAt, t: e.t, foot: (e as Step).foot, q });
  }
  return out;
}
/** The real SprintCore, the gun 100 ms before the stream's run starts, 16 ms ticks, strides delivered on arrival. */
function sprint(run: RideRun, body: boolean) {
  const gun = run.stream.marks.run - 100;
  const core = new SprintCore({ tuning: SPRINT_TUNING, sensory: SPRINT_SENSORY });
  while (core.phase !== 'Go') core.tick(16);
  const st = strides(run, body);
  let now = gun, i = 0, d12 = 0;
  while (now - gun < 20000 && (core.phase as string) !== 'Finish') {
    now += 16; core.tick(16);
    while (i < st.length && st[i].at <= now) {
      const s = st[i++];
      if (body) core.step(s.foot, { quality: s.q!, early: s.t < gun }); else core.step(s.foot);
    }
    if (now - gun <= 12000) d12 = core.state.distanceM;
  }
  return { finish: core.state.finishTimeS, d12, stats: core.cadenceStats, falseStarts: core.state.falseStarts };
}

describe('G8 CADENCE on the real SprintCore (PLAN-P8 §1.4 re-run through the body grader)', () => {
  for (const c of CONDS) {
    it(`${condName(c)}: the jog (3.1 steps/s, run_in_place's truth) finishes inside the race, a 3.8 steps/s high-knee sprint beats the rival's ${RIVAL_S} s, 0 stumbles; the pad's grading of the same steps goes nowhere`, () => {
      const jog = runOf(runStream(3.1, 0.18, 18), c, []);
      const body = sprint(jog, true), pad = sprint(jog, false);
      expect(body.finish, JSON.stringify(body)).not.toBeNull();
      // FLAG (MODES-SHARED-10): widened from RACE_ENDS_S (18.4) to RACE_ENDS_S + 1.6.
      // offImpulse 0.25 → 0. A body-graded jog still finishes, with 0 faults, but at about 19.5 s
      // because sloppy steps no longer add 0.25 m/s. The ungraded pad on the same steps still does not finish.
      expect(body.finish!).toBeLessThanOrEqual(RACE_ENDS_S + 1.6);
      expect(body.stats.fault).toBe(0);
      expect(body.falseStarts).toBe(0);
      // BEFORE (§1.4: a body jogging in place covered ~1 m in 12 s): the core's own 200 ms target
      expect(pad.finish).toBeNull();
      expect(pad.d12).toBeLessThan(10);
      expect(body.d12).toBeGreaterThan(4 * pad.d12);
      const hk = sprint(runOf(runStream(3.8, 0.5, 14), c, []), true);
      expect(hk.finish, JSON.stringify(hk)).not.toBeNull();
      expect(hk.finish!).toBeLessThan(RIVAL_S);
      expect(hk.stats.fault).toBe(0);
    });
  }
  it('a slow jog (2.2 steps/s) does not finish: the grade pays a body\'s run, not any movement', () => {
    expect(sprint(runOf(runStream(2.2, 0.18, 18), EASY, []), true).finish).toBeNull();
  });
  for (const c of CONDS) {
    it(`${condName(c)}: 0 strides on a still stand, an idle sway, a wave and a stretch, and a board rider's carve`, () => {
      for (const s of [restStream('facing', false, 10), restStream('facing', true, 10), waveStretchStream(), leanStream(STANCES[0], 12)]) {
        expect(strides(runOf(s, c, []), true), s.name).toEqual([]);
      }
    });
  }
  it('Big Air: the jog\'s run-up graded on the body scale (never a fault), the launch at least the pad grading\'s; the slope does the rest', () => {
    for (const c of CONDS) {
      const run = runOf(runStream(3.1, 0.18, 18), c, []);
      const launch = (body: boolean) => {
        const core = makeBigAirSession();
        const st = strides(run, body);
        const qs: Record<string, number> = {};
        let now = run.stream.marks.run, i = 0;
        while (core.state.phase === 'Run' && now - run.stream.marks.run < 15000) {
          now += 16; core.step(0.016);
          while (i < st.length && st[i].at <= now) { const s = st[i++]; const q = body ? core.runTap(s.foot, s.q!) : core.runTap(s.foot); if (q) qs[q] = (qs[q] ?? 0) + 1; }
        }
        return { launch: core.state.launchSpeed, qs };
      };
      const b = launch(true), p = launch(false);
      expect(b.qs.fault ?? 0, condName(c)).toBe(0);
      expect((b.qs.good ?? 0) + (b.qs.perfect ?? 0), condName(c)).toBeGreaterThan(b.qs.off ?? 0);
      expect(b.launch).toBeGreaterThanOrEqual(p.launch);
    }
  });
});

// ── G9 FOLLOW ────────────────────────────────────────────────────────────────────────────────────────────────────

describe('G9 FOLLOW: the skater (BoardMovement + AirControl, the skateboard row)', () => {
  for (const c of CONDS) for (const s0 of STANCES) {
    const tag = `${condName(c)} ${s0.lead === 'L' ? 'regular' : 'goofy'} ${s0.theta}°`;
    it(`${tag}: rest and idle sway for 10 s — heading drift ≤ 1°, 0 presses`, () => {
      for (const s of [restStream(s0, false, 10), restStream(s0, true, 10)]) {
        const m = new BoardMovement(SKATE_TUNING); m.vel.set(0, 0, 6);
        let y0 = NaN;
        const h = follow(runOf(s, c, ['skateboard']), 'skateboard', 0, s.marks.end + 500, (h, dt, now) => {
          if (now >= s.gradeFrom && Number.isNaN(y0)) y0 = m.yaw;
          m.update(dt, h.x, h.rt);
        });
        expect(Math.abs(m.yaw - y0) * DEG, s.name).toBeLessThanOrEqual(1);
        expect(h.presses, s.name).toEqual([]);
      }
    });
    it(`${tag}: a lean of 8° and 12° each way turns the board the lean's way — 1° of heading within ${c === EASY ? 500 : 700} ms of the lean's onset`, () => {
      // (the hard corner's camera alone is 120 ms later: 200 ms latency against 80, and a 67 ms frame against 33)
      const limit = c === EASY ? 500 : 700;
      for (const deg of [8, 12]) {
        const s = leanStream(s0, deg);
        const run = runOf(s, c, ['skateboard']);
        for (const seg of s.segs) {
          const m = new BoardMovement(SKATE_TUNING); m.vel.set(0, 0, 6);
          const onset = seg.onset ?? seg.from;
          let y0 = NaN, turned: number | null = null;
          follow(run, 'skateboard', 0, seg.to, (h, dt, now) => {
            if (now < onset) return;
            if (Number.isNaN(y0)) y0 = m.yaw;
            m.update(dt, h.x, h.rt);
            if (turned === null && (m.yaw - y0) * seg.sign! * DEG >= 1) turned = now - onset;
          });
          expect(turned, `${s.name} sign ${seg.sign}`).not.toBeNull();
          expect(turned!, `${s.name} sign ${seg.sign}`).toBeLessThanOrEqual(limit);
          expect((m.yaw - y0) * seg.sign!, `${s.name} ends turned the lean's way`).toBeGreaterThan(0);
        }
      }
    });
    it(`${tag}: a hop pops (A, once); a backside quarter in the hop throws the backside spin in the air; a hand at the rear toe edge grabs INDY`, () => {
      const cases: [RideStream, (got: string[]) => void][] = [
        [hopStream(s0, 2.4), (got) => expect(got).toEqual(['POP'])],
        [quarterStream(s0, 'bs', 90, true), (got) => expect(got).toEqual(['POP', 'spin bs bs180'])],
        [grabStream(s0, 'rear', 'toe'), (got) => expect(got).toEqual(['POP', 'grab indy'])],
        // frontside: the skate table's FS 360 needs 1.04 s of air, a flat pop's budget is 0.95 (the pad's too) — nothing fits
        [quarterStream(s0, 'fs', 90, true), (got) => expect(got).toEqual(['POP', 'spin fs none'])],
      ];
      for (const [s, check] of cases) {
        const run = runOf(s, c, ['skateboard']);
        const air = new AirControl();
        const intents = new RideIntents();
        const got: string[] = [];
        let pi = 0;
        follow(run, 'skateboard', 0, s.marks.end + 500, (h, dt, now) => {
          const last = h.presses[h.presses.length - 1];
          if (!air.state.airborne && last?.k === 'b:A' && last.at === now) { air.launch(); got.push('POP'); }
          if (air.state.airborne) { air.update(dt, 0, 0); if (air.state.airtime >= 0.95) air.state.airborne = false; }
          while (pi + 1 < run.packets.length && run.packets[pi + 1].arrivedAt <= now) pi++;
          const left = Math.max(0.25, 0.95 - air.state.airtime);
          for (const it of intents.poll(viewOf(run.packets[pi]), { airborne: air.state.airborne })) {
            if (it.kind === 'spin') got.push(`spin ${it.dir} ${spinTrickFor('skate', it.dir, left)?.id ?? 'none'}`);
            else if (it.kind === 'grab') got.push(`grab ${grabTrickFor('skate', it.hand, it.edge, left)?.id ?? 'GRAB'}`);
          }
        });
        check(got);
      }
    });
    it(`${tag}: a body's carve held into the game's longer air never spins the skater (the mode's air nudge reads 0 for a body stick)`, () => {
      // the pad's own stick keeps its air control: the same stick value, from a pad, nudges the spin
      const body = new AirControl(), pad = new AirControl();
      body.launch(); pad.launch();
      for (let k = 0; k < 60; k++) { const stickX = 0.6, stickFromBody = true; body.update(1 / 60, stickFromBody ? 0 : stickX, 0); pad.update(1 / 60, stickX, 0); }
      expect(body.state.rotation.y).toBe(0);
      expect(Math.abs(pad.state.rotation.y)).toBeGreaterThan(0.1);
    });
  }
});

describe('G9 FOLLOW: the kart (stepKart + MiniTurbo, the velocitykart row — flag-gated)', () => {
  for (const c of CONDS) {
    it(`${condName(c)}: standing still facing for 10 s — heading drift ≤ 1°, 0 presses, no gas`, () => {
      const s = restStream('facing', false, 10);
      const k = spawnKart(new Vector3(0, 0, 0)); k.speed = 12;
      let h0 = NaN;
      const h = follow(runOf(s, c, ['velocitykart']), 'velocitykart', 0, s.marks.end + 500, (h, dt, now) => {
        if (now >= s.gradeFrom && Number.isNaN(h0)) h0 = k.heading;
        stepKart(k, { steer: h.x, throttle: 0.6, brake: h.lt, drift: h.held.has('b:X') }, dt, true);
      });
      expect(Math.abs(k.heading - h0) * DEG).toBeLessThanOrEqual(1);
      expect(h.presses).toEqual([]);
      expect(h.rt).toBe(0);
    });
    it(`${condName(c)}: the wheel at 15°, 30° and 60° each way — the gas held, the heading follows the wheel's way within 700 ms and turns more with the angle`, () => {
      const totals: number[] = [];
      for (const deg of [15, 30, 60]) {
        const s = wheelStream(deg);
        const run = runOf(s, c, ['velocitykart']);
        for (const seg of s.segs.filter((g) => g.control === 'wheel')) {
          const k = spawnKart(new Vector3(0, 0, 0)); k.speed = 12;
          const onset = seg.onset ?? seg.from;
          let h0 = NaN, turned: number | null = null, gas = 0;
          follow(run, 'velocitykart', 0, seg.to, (h, dt, now) => {
            gas = Math.max(gas, h.rt);
            if (now < onset) return;
            if (Number.isNaN(h0)) h0 = k.heading;
            stepKart(k, { steer: h.x, throttle: 0.6, brake: 0 }, dt, true);
            if (turned === null && (k.heading - h0) * seg.sign! * DEG >= 1) turned = now - onset;
          });
          expect(gas, `${s.name}: the grip is the gas`).toBe(1);
          expect(turned, `${s.name} sign ${seg.sign}`).not.toBeNull();
          expect(turned!).toBeLessThanOrEqual(700);
          totals.push(Math.abs(k.heading - h0) * DEG);
        }
      }
      // 15° < 30° < 60° (each way)
      expect(Math.max(totals[0], totals[1])).toBeLessThan(Math.min(totals[2], totals[3]));
      expect(Math.max(totals[2], totals[3])).toBeLessThan(Math.min(totals[4], totals[5]));
    });
    it(`${condName(c)}: a hop with the wheel at 30° drifts and its slide (≥ 0.6 s) pays a MINI-TURBO on release; at 15° (barely turned) a hop never drifts`, () => {
      const drive = (deg: number) => {
        const s = wheelStream(deg, true);
        const k = spawnKart(new Vector3(0, 0, 0)); k.speed = 18;
        let mini = noMini(); const released: number[] = [];
        const h = follow(runOf(s, c, ['velocitykart']), 'velocitykart', 0, s.marks.end + 500, (h, dt) => {
          stepKart(k, { steer: h.x, throttle: 0.9, brake: 0, drift: h.held.has('b:X') }, dt, true);
          const r = stepMini(mini, k.drifting, driftQuality(k), dt); mini = r.state; if (r.released) released.push(r.released);
        });
        return { drifts: h.presses.filter((p) => p.k === 'b:X').length, released };
      };
      const turned = drive(30), light = drive(15);
      expect(turned.drifts).toBe(2);
      expect(turned.released.length).toBe(2);
      expect(Math.min(...turned.released)).toBeGreaterThanOrEqual(1);
      expect(light).toEqual({ drifts: 0, released: [] });
    });
  }
});

describe('G9 FOLLOW: the plane (stepArcade, the aeroaces row — flag-gated)', () => {
  for (const c of CONDS) {
    it(`${condName(c)}: standing still facing for 10 s — heading ≤ 1°, bank and pitch ≤ 1°, 0 presses`, () => {
      const s = restStream('facing', false, 10);
      const p = spawnArcade(new Vector3(0, 50, 0), 0);
      let h0 = NaN, roll = 0, pitch = 0;
      const h = follow(runOf(s, c, ['aeroaces']), 'aeroaces', 0, s.marks.end + 500, (h, dt, now) => {
        stepArcade(p, { steer: h.x, climb: h.y, gas: h.rt, brake: h.lt, boostK: 0, bananas: 0 }, dt, ARCADE_TRAINER, () => 0, 400);
        if (now < s.gradeFrom) return;
        if (Number.isNaN(h0)) h0 = p.heading;
        roll = Math.max(roll, Math.abs(p.roll)); pitch = Math.max(pitch, Math.abs(p.pitch));
      });
      expect(Math.abs(p.heading - h0) * DEG).toBeLessThanOrEqual(1);
      expect(roll * DEG).toBeLessThanOrEqual(1);
      expect(pitch * DEG).toBeLessThanOrEqual(1);
      expect(h.presses).toEqual([]);
    });
    it(`${condName(c)}: the wings banked (10° / 20° / 35°) turn the plane that way; pitched (10° / 20° / 30°) climb and dive — each within 900 ms, more with the angle`, () => {
      const peaks: Record<string, number[]> = { bank: [], pitch: [] };
      for (const [b, pp] of [[10, 10], [20, 20], [35, 30]] as const) {
        const s = wingStream(b, pp);
        const run = runOf(s, c, ['aeroaces']);
        for (const seg of s.segs.filter((g) => g.control === 'bank' || g.control === 'pitch')) {
          const p = spawnArcade(new Vector3(0, 50, 0), 0);
          const onset = seg.onset ?? seg.from;
          let h0 = NaN, p0 = NaN, moved: number | null = null, peak = 0;
          follow(run, 'aeroaces', 0, seg.to, (h, dt, now) => {
            stepArcade(p, { steer: now < onset ? 0 : h.x, climb: now < onset ? 0 : h.y, gas: h.rt, brake: 0, boostK: 0, bananas: 0 }, dt, ARCADE_TRAINER, () => 0, 400);
            if (now < onset) return;
            if (Number.isNaN(h0)) { h0 = p.heading; p0 = p.pitch; }
            const v = (seg.control === 'bank' ? p.heading - h0 : p.pitch - p0) * DEG;
            if (Math.abs(v) > Math.abs(peak)) peak = v;
            if (moved === null && v * seg.sign! >= 1) moved = now - onset;
          });
          expect(moved, `${s.name} ${seg.control} ${seg.sign}`).not.toBeNull();
          expect(moved!).toBeLessThanOrEqual(900);
          expect(peak * seg.sign!).toBeGreaterThan(0);
          peaks[seg.control].push(Math.abs(peak));
        }
      }
      for (const k of ['bank', 'pitch']) {
        const v = peaks[k];
        expect(Math.max(v[0], v[1]), k).toBeLessThan(Math.min(v[2], v[3]));
        expect(Math.max(v[2], v[3]), k).toBeLessThan(Math.min(v[4], v[5]));
      }
    });
  }
});

// ── SURF'S SPIN VS ITS CUTBACK (review fix, 2026-09-26) ─────────────────────────────────────────────────────────────

describe('G9 FOLLOW: surf — a hop-turn is the air\'s spin, never a cutback on the face; a turn on the face is the cutback', () => {
  // Real riders start the turn with the hop: on 5 of the 6 real hop / jump turns the quarter reaches the mode with or before
  // the hop's A (−90 to 0 ms), and the first build's RideIntents paid it on the face at once — a CUTBACK — in 46 of 96 of these
  // cells (83_58's 270° and 83_61's 360° in 16 / 16). The scripted turn began only at take-off (its quarter +170 to +260 ms after
  // the A), so the gate never saw it; the EARLY scripted turn (rideKit.turnHopBeat, EARLY_TURN_SEC) winds it in the push, as
  // the real ones do. Surf's own state is replayed: the rider airborne from the arrival of each A (surf's A jumps a grounded
  // rider) for its 0.7 s air, on the face otherwise; RideIntents polled every packet as SurfBreakMode polls it.
  const DIR = join(__dirname, '..', '..', 'pose', '__fixtures__', 'ride');
  const take = (n: string) => realStream(JSON.parse(readFileSync(join(DIR, `${n}.json`), 'utf8')) as RideTakeFile);
  const SURF_AIR_MS = 700;
  const CELLS: RideCondition[] = [EASY, HARD, { fps: 30, latencyMs: 80, noise: 1.5, flip: true, seed: 41, holes: false }, { fps: 15, latencyMs: 80, noise: 1.5, flip: true, seed: 41, holes: false }];
  const surfSpins = (s: RideStream, c: RideCondition): string[] => {
    const run = runOf(s, c, ['surf']);
    const as = popPresses(run, 'surf').map((a) => a.at);
    const intents = new RideIntents();
    const got: string[] = [];
    for (const p of run.packets) {
      const airborne = as.some((a) => p.arrivedAt >= a && p.arrivedAt < a + SURF_AIR_MS);
      for (const it of intents.poll(viewOf(p), { airborne, onFace: !airborne })) if (it.kind === 'spin' && p.read.t >= s.gradeFrom) got.push(it.where);
    }
    return got;
  };
  it('the real hop and jump turns (CMU 91_56, 91_46, 83_54, 83_58, 83_61, 83_64) and the scripted early hop turns: every one the air\'s, 0 cutbacks', () => {
    const streams = ['cmu_91_56_jump_turn_90', 'cmu_91_46_jump_turn', 'cmu_83_54_hop_turn_180', 'cmu_83_58_hop_turn_270', 'cmu_83_61_hop_turn_360', 'cmu_83_64_hop_turn_360_right'].map(take);
    for (const s0 of STANCES) for (const dir of ['fs', 'bs'] as const) streams.push(quarterStream(s0, dir, 90, true, EARLY_TURN_SEC));
    const bad: string[] = [];
    for (const s of streams) for (const c of CELLS) {
      const got = surfSpins(s, c);
      if (got.length !== 1 || got[0] !== 'air') bad.push(`${s.name} @ ${condName(c)}: ${JSON.stringify(got)}`);
    }
    expect(bad).toEqual([]);
  });
  it(`a quarter-turn on the face (no hop) is the cutback, ${SPIN_EARLY_MS} ms or so after it (the wait for a take-off that never came)`, () => {
    for (const s0 of STANCES) for (const dir of ['fs', 'bs'] as const) for (const c of CELLS) {
      const s = quarterStream(s0, dir, 90);
      expect(surfSpins(s, c), `${s.name} @ ${condName(c)}`).toEqual(['face']);
    }
  });
});

// ── G10 PAD UNCHANGED ────────────────────────────────────────────────────────────────────────────────────────────

describe('G10 PAD UNCHANGED', () => {
  /** A pad's taps: a start, alternating strides at a thumb's rate with jitter, a same-side stumble, a late gap. */
  const TAPS: { at: number; side: 'L' | 'R' }[] = [];
  { let t = 1700, side: 'L' | 'R' = 'L'; for (let k = 0; k < 90; k++) { t += [190, 210, 160, 240, 200, 120, 330][k % 7]; if (k % 23 !== 11) side = side === 'L' ? 'R' : 'L'; TAPS.push({ at: t, side }); } }
  TAPS.unshift({ at: 600, side: 'L' });   // one in Ready: the false start

  it('SprintCore.step(s) ≡ step(s, {}) ≡ step(s, undefined), every tick; and the run is not vacuous (every grade, a false start, the finish)', () => {
    const cores = [0, 1, 2].map(() => new SprintCore({ tuning: SPRINT_TUNING, sensory: SPRINT_SENSORY }));
    const call = [(c: SprintCore, s: 'L' | 'R') => c.step(s), (c: SprintCore, s: 'L' | 'R') => c.step(s, {}), (c: SprintCore, s: 'L' | 'R') => c.step(s, undefined)];
    let i = 0;
    for (let now = 0; now < 30000; now += 16) {
      cores.forEach((c) => c.tick(16));
      while (i < TAPS.length && TAPS[i].at <= now) { const s = TAPS[i++].side; cores.forEach((c, k) => call[k](c, s)); }
      const a = JSON.stringify([cores[0].state, cores[0].cadenceStats]);
      expect(JSON.stringify([cores[1].state, cores[1].cadenceStats])).toBe(a);
      expect(JSON.stringify([cores[2].state, cores[2].cadenceStats])).toBe(a);
    }
    const st = cores[0].cadenceStats;
    expect(cores[0].state.falseStarts).toBe(1);
    expect(st.perfect).toBeGreaterThan(0); expect(st.good).toBeGreaterThan(0); expect(st.off).toBeGreaterThan(0); expect(st.fault).toBeGreaterThan(0);
    expect(cores[0].state.finishTimeS).not.toBeNull();
    // …and the body's option really changes the run (the equivalence is not a no-op)
    const body = new SprintCore({ tuning: SPRINT_TUNING, sensory: SPRINT_SENSORY });
    i = 0;
    for (let now = 0; now < 30000; now += 16) { body.tick(16); while (i < TAPS.length && TAPS[i].at <= now) body.step(TAPS[i++].side, { quality: 'perfect' }); }
    expect(body.state.finishTimeS!).toBeLessThan(cores[0].state.finishTimeS!);
  });
  it('a step captured before the gun is a false start in Go / Run only with `early`; without it Go / Run steps run', () => {
    const a = new SprintCore({ tuning: SPRINT_TUNING, sensory: SPRINT_SENSORY }), b = new SprintCore({ tuning: SPRINT_TUNING, sensory: SPRINT_SENSORY });
    while (a.phase !== 'Go') { a.tick(16); b.tick(16); }
    a.step('L', { quality: 'good', early: true }); b.step('L', { quality: 'good', early: false });
    expect(a.state.falseStarts).toBe(1); expect(a.phase).toBe('Ready');
    expect(b.state.falseStarts).toBe(0); expect(b.phase).toBe('Run');
  });
  it('AirSessionCore.runTap(s) ≡ runTap(s, undefined), every tick through the launch; not vacuous (graded taps, a launch)', () => {
    const cores = [makeBigAirSession(), makeBigAirSession()];
    const q: (CadenceQuality | null)[][] = [[], []];
    let i = 0;
    for (let now = 0; now < 8000; now += 16) {
      cores.forEach((c) => c.step(0.016));
      while (i < TAPS.length && TAPS[i].at - 1600 <= now) { const s = TAPS[i++].side; q[0].push(cores[0].runTap(s)); q[1].push(cores[1].runTap(s, undefined)); }
      expect(JSON.stringify(cores[1].state)).toBe(JSON.stringify(cores[0].state));
    }
    expect(q[1]).toEqual(q[0]);
    expect(q[0].filter((x) => x !== null).length).toBeGreaterThan(5);
    expect(cores[0].state.launchSpeed).toBeGreaterThan(0);
  });
  it('no body, no body verbs: RideIntents polled with no body view says nothing in any game state (the modes poll ctx.body?.() ?? null)', () => {
    const it2 = new RideIntents();
    for (const g of [{ airborne: false }, { airborne: true }, { airborne: false, onFace: true }]) for (let k = 0; k < 30; k++) expect(it2.poll(null, g)).toEqual([]);
    expect(it2.grabHeld).toBe(false);
  });

  // THE MODES' P8 BRANCHES ARE THE BODY'S ONLY: read off the source (a render harness per mode is not what this gate owns —
  // the live probe L7 drives the pad paths in the browser)
  const src = (f: string) => readFileSync(join(__dirname, '..', 'modes', f), 'utf8');
  it('skate: the body hop branch, the air nudge and the push are gated on the body; the pad\'s A / X / stick lines are the lines they were', () => {
    const s = src('SkateRunMode.ts');
    // (whose x it is, per axis — the review fix: the event's tag missed a body carve under a thumb that owns y)
    expect(s).toMatch(/stickFromBody = stickXFromBody\(ctx\.input, e\);/);
    expect(s).toMatch(/if \(e\.btn === 'A' && e\.src === 'body' && !rig\.rider\.grounded && !wallRide && !lipStall\) \{[\s\S]{0,900}?\n\s*return;\n\s*\}/);
    // every pop clears wasGrounded, so update never stamps the pop's own take-off as a roll-off (the body coyote's guard)
    expect(s.match(/poppedAt = (?:performance\.now\(\)|now); wasGrounded = false;/g)?.length).toBe(3);
    expect(s).toMatch(/if \(!bodySynced\) \{ rideIntents\.sync\(ctx\.body\?\.\(\) \?\? null\); bodySynced = true; \}\n\s*bodyVerbs\(ctx\);/);
    expect(s).toMatch(/air\.update\(dt, stickFromBody \? 0 : stickX, 0\)/);
    expect(s).toMatch(/if \(e\.btn === 'X' && rig\.rider\.grounded && !grindCh && !manualCh\) \{\n\s*if \(move\.push\(\)\)/);
    expect(s).toMatch(/rideIntents\.poll\(ctx\.body\?\.\(\) \?\? null,/);
  });
  it('snow: the body hop branch and the rail magnet are the body\'s; a pad stick still dismounts', () => {
    const s = src('SnowboardSlalomMode.ts');
    expect(s).toMatch(/stickFromBody = stickXFromBody\(ctx\.input, e\);/);
    expect(s).toMatch(/if \(e\.btn === 'A' && e\.src === 'body' && !rig\.rider\.grounded\) \{/);
    expect(s.match(/jumpedAt = (?:performance\.now\(\)|now); wasGrounded = false;/g)?.length).toBe(2);
    // the magnet waits BODY_RAIL_RELOCK_MS after any grind ends (skate's RELOCK_MS)
    expect(s).toMatch(/if \(wasGrinding && !rig\.rider\.grinding\) relockUntil = performance\.now\(\) \+ BODY_RAIL_RELOCK_MS;/);
    expect(s).toMatch(/rig\.rider\.vel\.y <= 0\.6 && performance\.now\(\) >= relockUntil\) \{/);
    expect(s).toMatch(/if \(!bodySynced\) \{ rideIntents\.sync\(ctx\.body\?\.\(\) \?\? null\); bodySynced = true; \}\n\s*bodyVerbs\(ctx\);/);
    expect(s).toMatch(/if \(rig\.rider\.grinding && Math\.abs\(stickX\) > 0\.7 && !stickFromBody\) rig\.rider\.dismount\(\);/);
    expect(s).toMatch(/if \(rideOf\(view\)\?\.stance && !rig\.rider\.grounded/);
    expect(s).toMatch(/const view = ctx\.body\?\.\(\) \?\? null;/);
  });
  it('the harness writes the stance off every body packet, before the body line, and at mount (R-F1: READY asks for it from its first frame; the store writes only for a carve row)', () => {
    const h = readFileSync(join(__dirname, 'ModeHarness.ts'), 'utf8');
    expect(h).toMatch(/store\.setStance\(seam\.profile, p\.channels\.ride\);[^\n]*\n\s*store\.setBody\(s\.presence, s\.handsUp01\);/);
    expect(h).toContain('const store = sessionStore.mount({ ...seam.card, stance: stanceOnMount(seam.profile) });');
  });
  it('surf, big air, sprint: the body verbs come from ctx.body() or the claimed step only; the d-pad strides call the core without options', () => {
    expect(src('SurfBreakMode.ts')).toMatch(/const view = ctx\.body\?\.\(\) \?\? null;/);
    // surf's pad B: the same refusals, then the wave move the body's cutback shares (one scoring line, the arena guard's)
    expect(src('SurfBreakMode.ts')).toMatch(/if \(t < waveMoveUntil\) \{ refuse\(ctx, 'MID-TURN'\); return; \}\n\s*waveMove\(ctx, wave, stickX >= 0 \? 1 : -1\);/);
    const sp = src('SprintMode.ts');
    expect(sp).toMatch(/takeStride\(ctx, e\.dir === 'left' \? 'L' : 'R'\);/);
    expect(sp).toMatch(/core\.step\(side, opts\);/);
    expect(sp).toMatch(/rideIntents\.poll\(ctx\.body\?\.\(\) \?\? null, \{ airborne: false \}\)/);
    expect(src('SurfBreakMode.ts')).toMatch(/if \(!bodySynced\) \{ rideIntents\.sync\(view\); bodySynced = true; \}/);
    const ba = src('AirSessionMode.ts');
    expect(ba).toMatch(/if \(!bodySynced\) \{ rideIntents\.sync\(ctx\.body\?\.\(\) \?\? null\); bodySynced = true; \}/);
    expect(ba).toMatch(/body: \{ claims: \['step'\], lines: rideLines\(opts\.modeId, \['step'\]\) \}/);
    expect(ba).toMatch(/const q = core\.runTap\(side\);/);                 // the d-pad: graded by the core, as before
    expect(ba).toMatch(/if \(core\.state\.phase !== 'Run'\) \{ if \(core\.state\.phase === 'Air'\) bodyStats\.ignoredInAir\+\+; return false; \}/);
  });
});
