// bodySeamFor held to the table (movement play P3, step 3, the review, 2026-09-24).
//
// runMode builds a mode's body play with bodySeamFor and nothing else (the seam scan pins that). So this is where Z3 and
// Z5 are decided for a REAL mode, and it is held to every row here: the gate (bodyGate) proves each profile's chain,
// this proves the harness picks the right profile and the right `drives` for the def it is handed.
//   Z3  a session-only row's floor emits nothing, on streams its bound neighbours press on;
//   Z5  a session-only row's session never pauses on a lost body — even with the body counted as the driver;
//   every row resolves to itself (the four aliases too), a bound row drives, a claim takes its move off the floor.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bodySeamFor, bodyDrives } from './bodySeam';
import { BODY_PROFILES, cardLines, sessionOnly } from '@/lib/input/bodyProfiles';
import { bodyPackets, type StreamPacket } from '@/lib/pose/seamReplay';
import { standFrame, STAND_SEC } from '@/lib/pose/grade';
import { holdStill } from '@/lib/pose/streamKit';
import { duckFixture } from '@/lib/pose/baseline';
import type { PoseFixture } from '@/lib/pose/synth';
import type { BodyOut, BodyPacket } from './InputBus';
import type { BodyRead } from '@/lib/pose/BodyReader';
import type { BodyIntent } from './BodySession';

const ROWS = Object.values(BODY_PROFILES);
const BOUND = ROWS.filter((p) => p.bindings.length > 0);
const SESSION_ONLY = ROWS.filter((p) => p.bindings.length === 0);

// ── streams every bound move fires on: a hop (and its gather), strikes, a jog, a sidestep, a crouch ──
const DIR = join(__dirname, '../../pose/__fixtures__');
const load = (n: string) => JSON.parse(readFileSync(join(DIR, `${n}.json`), 'utf8')) as PoseFixture;
const OWNER_STAND = load('stand_still').frames[70];
function onStand(fx: PoseFixture, stand = standFrame(fx, fx.source.kind === 'deepmotion' ? OWNER_STAND : undefined).frame): StreamPacket[] {
  const lead = holdStill(stand, { sec: STAND_SEC, fps: fx.settings.synth.fps, beforeT: fx.frames[0].t });
  return bodyPackets([...lead, ...fx.frames], { lead: lead.length });
}
const duck = duckFixture(0.3, 17).fx;
const STREAMS: Record<string, StreamPacket[]> = {
  jump_two_foot_low: onStand(load('jump_two_foot_low')),
  punch_kick: onStand(load('punch_kick')),
  run_in_place: onStand(load('run_in_place')),
  shuffle_lateral: onStand(load('shuffle_lateral')),
  'duck 30 cm': onStand(duck, duck.frames.find((f) => f.present)!),
};

/** Everything a mode's floor sends over a stream, played while 'playing' (a fresh seam per stream, as per mount). */
function floorOut(modeId: string, packets: readonly StreamPacket[]): BodyOut[] {
  const { floor } = bodySeamFor({ modeId });
  floor.begin();
  const out: BodyOut[] = [];
  for (const p of packets) out.push(...floor.step(p, p.arrivedAt, false), ...floor.tick(p.arrivedAt + 16));
  out.push(...floor.release());
  return out;
}
const label = (e: BodyOut): string => (e.t === 'button' ? `b:${e.btn}` : e.t === 'dpad' ? 'dpad' : e.t === 'stick' ? `stick${e.side}` : `${e.side}T`);

// ── a body that plays, then leaves the frame for 2 s, the session counting it as the driver ──
const NO_CH = { inJump: false, stride: null, handsUpMs: 0, handsDownMs: 0 };
const read = (t: number, tracking: boolean): BodyRead => ({
  t, present: tracking, conf: tracking ? 0.9 : null, calibrated: true, tracking, rulers: null, hip: null, feet: null,
  airborne: tracking ? false : null, knee: null, wrist: null, elbowDeg: null, lean: null, squat: null, yaw: null,
});
function lostIntents(modeId: string, onBody?: () => void): BodyIntent[] {
  const { session } = bodySeamFor({ modeId, onBody });
  const intents: BodyIntent[] = [];
  let last = -Infinity;
  let phase: 'playing' | 'paused' = 'playing';
  const take = (xs: BodyIntent[]): void => {
    for (const x of xs) { intents.push(x); if (x === 'pause-lost' || x === 'pause-stall') phase = 'paused'; }   // as the harness does
  };
  session.begin(0, 'body');                              // a hands-up START: the body is the driver
  session.noteInput('body', 0);
  for (let now = 0; now <= 4000; now += 16) {
    if (now % 32 === 0) {                                // a camera frame every other render tick
      const p: BodyPacket = { read: read(now - 66, now < 1000), events: [], channels: NO_CH, arrivedAt: now };
      take(session.step(phase, p, now).intents);
      last = now;
    }
    take(session.tick(phase, now, last).intents);
  }
  return intents;
}

describe('bodySeamFor: the harness picks the mode\'s own row', () => {
  it.each(ROWS.map((p) => [p.modeId, p] as const))('%s resolves to its own row, and the card is that row\'s', (modeId, row) => {
    const seam = bodySeamFor({ modeId });
    expect(seam.profile).toBe(row);
    expect(seam.card).toStrictEqual({ modeId, key: row.key, lines: cardLines(row), drives: row.bindings.length > 0, later: row.later });
    expect(seam.overheadIsPlay).toBe(row.overheadIsPlay);
  });
  it('the four aliases land on their own rows by def.modeId, never by the registry key', () => {
    expect(bodySeamFor({ modeId: 'karate-vs' }).profile.key).toBe('karate_vs');
    expect(bodySeamFor({ modeId: 'snowboard' }).profile.key).toBe('snowboard_slalom');
    expect(bodySeamFor({ modeId: 'baseball' }).profile.key).toBe('derby');
    expect(bodySeamFor({ modeId: 'soccer' }).profile.key).toBe('penalty');
    // a registry key that is not a modeId is a mode no row names: session-only, not its alias's bindings
    expect(bodySeamFor({ modeId: 'karate_vs' }).profile).toStrictEqual(sessionOnly('karate_vs'));
  });
  it('a mode no row names is session-only and does not drive', () => {
    const seam = bodySeamFor({ modeId: 'a-new-mode' });
    expect(seam.profile).toStrictEqual(sessionOnly('a-new-mode'));
    expect(seam.drives).toBe(false);
  });
  it('each mount gets its own floor, session and evidence (they keep state)', () => {
    const a = bodySeamFor({ modeId: 'skateboard' }), b = bodySeamFor({ modeId: 'skateboard' });
    expect(a.floor).not.toBe(b.floor);
    expect(a.session).not.toBe(b.session);
    expect(a.evidence).not.toBe(b.evidence);
  });
});

describe('drives: the body drives a mode only where it presses something, or the mode reads it itself', () => {
  it.each(SESSION_ONLY.map((p) => [p.modeId] as const))('%s (session-only) does not drive', (modeId) => {
    expect(bodySeamFor({ modeId }).drives).toBe(false);
  });
  it.each(BOUND.map((p) => [p.modeId] as const))('%s (bound) drives', (modeId) => {
    expect(bodySeamFor({ modeId }).drives).toBe(true);
  });
  it('an onBody drives even a session-only row; bodyDrives is the one rule', () => {
    expect(bodySeamFor({ modeId: 'dunk', onBody: () => {} }).drives).toBe(true);
    expect(bodyDrives(BODY_PROFILES.dunk, false)).toBe(false);
    expect(bodyDrives(BODY_PROFILES.dunk, true)).toBe(true);
    expect(bodyDrives(BODY_PROFILES.skateboard, false)).toBe(true);
  });
});

describe('Z3: a session-only row never produces a body FelInput', () => {
  it('the streams press every bound move somewhere (so a silent floor below is the row\'s, not the stream\'s)', () => {
    for (const row of BOUND) {
      const got = Object.values(STREAMS).flatMap((s) => floorOut(row.modeId, s).filter((e) => !(e.t === 'stick' && e.x === 0 && e.y === 0)));
      expect(got.length, row.modeId).toBeGreaterThan(0);
      const allowed = new Set(row.bindings.map((b) => (b.to === 'Lx' || b.to === 'Ly' ? 'stickL' : b.to === 'dpadByFoot' ? 'dpad' : b.to === 'RT' ? 'RT' : b.to === 'LT' ? 'LT' : `b:${b.to}`)));
      for (const e of got) expect(allowed.has(label(e)), `${row.modeId}: ${label(e)}`).toBe(true);
    }
  });
  it.each(SESSION_ONLY.map((p) => [p.modeId] as const))('%s: nothing, on any stream', (modeId) => {
    for (const [name, s] of Object.entries(STREAMS)) expect(floorOut(modeId, s), `${modeId} on ${name}`).toEqual([]);
  });
});

describe('Z5: losing the body never pauses a mode it does not drive', () => {
  it.each(SESSION_ONLY.map((p) => [p.modeId] as const))('%s: gone 2 s with the body as the driver — no pause', (modeId) => {
    expect(lostIntents(modeId)).toEqual([]);
  });
  it.each(BOUND.map((p) => [p.modeId] as const))('%s: gone 2 s with the body as the driver — paused, once', (modeId) => {
    expect(lostIntents(modeId)).toEqual(['pause-lost']);
  });
  it('a session-only row with an onBody drives, so it pauses', () => {
    expect(lostIntents('dunk', () => {})).toEqual(['pause-lost']);
  });
});

describe('claims and the overhead flag', () => {
  it('a claimed move comes off the floor: skate claiming its take-off pops nothing on the hop stream', () => {
    const seam = bodySeamFor({ modeId: 'skateboard', body: { claims: ['takeoff'] } });
    expect(seam.profile.bindings.map((b) => b.from)).toEqual(['lean', 'squat']);
    expect(seam.claimed.has('takeoff')).toBe(true);
    const out: BodyOut[] = [];
    seam.floor.begin();
    for (const p of STREAMS.jump_two_foot_low) out.push(...seam.floor.step(p, p.arrivedAt, false), ...seam.floor.tick(p.arrivedAt + 16));
    expect(out.filter((e) => e.t === 'button')).toEqual([]);
    expect(floorOut('skateboard', STREAMS.jump_two_foot_low).filter((e) => e.t === 'button' && e.btn === 'A' && e.pressed).length).toBeGreaterThan(0);
  });
  it('overheadIsPlay: the spec\'s own flag, else the row\'s or a claimed \'overhead\'', () => {
    expect(bodySeamFor({ modeId: 'skateboard' }).overheadIsPlay).toBe(false);
    expect(bodySeamFor({ modeId: 'skateboard', body: { claims: ['overhead'] } }).overheadIsPlay).toBe(true);
    expect(bodySeamFor({ modeId: 'dunk', body: { overheadIsPlay: false } }).overheadIsPlay).toBe(false);
    expect(bodySeamFor({ modeId: 'dunk' }).session.overheadIsPlay).toBe(true);
  });
});
