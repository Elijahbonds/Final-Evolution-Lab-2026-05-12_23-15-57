// MOVEMENT PLAY P8 (2026-09-26): what a board or race mode reads off the body itself (rideBody) — the names a hand and an
// edge or a quarter-turn's direction make in each discipline's own table (against the air left, as a pad's press is), the
// intents edge-detected once each and only in the game's own phase, the kick-push, the dip, and the body's stride graded on
// the capture clock against a body's cadence (a missed step never a stumble).
import { describe, it, expect } from 'vitest';
import {
  RideIntents, BodyStride, KickPush, isKickPush, bodyElapsedMs, rideLines, stickXFromBody,
  SPIN_EARLY_MS, DIP_HOLD_MS, BODY_PERFECT_HZ, BODY_GOOD_HZ, PUSH_REFRACTORY_MS, PUSH_LEAD_PLANTED_MS,
} from './rideBody';
import { NO_RIDE, type RideRead } from '@/lib/pose/rideReader';
import type { BodyView } from './ModeHarness';
import type { BodyEvent, BodyRead } from '@/lib/pose/BodyReader';
import { SKATE_TRICKS, SNOW_TRICKS } from './BoardTricks';
import { bodySeamFor } from './bodySeam';
import { grabTrickFor, spinTrickFor } from './rideTricks';

const read = (t: number, tracking = true): BodyRead => ({
  t, present: true, conf: 0.9, calibrated: true, tracking, rulers: null, hip: null, feet: null, airborne: false, knee: null,
  wrist: null, elbowDeg: null, lean: null, squat: 0, yaw: null,
});
const view = (t: number, ride: Partial<RideRead>, o: { inJump?: boolean; tracking?: boolean; drive?: number } = {}): BodyView => ({
  read: read(t, o.tracking ?? true), arrivedAt: t + 80, lagMs: 80,
  channels: { inJump: !!o.inJump, stride: o.drive ? { hz: 3, drive: o.drive } : null, handsUpMs: 0, handsDownMs: 0, ride: { ...NO_RIDE, ...ride } as RideRead },
});
const step = (t: number, foot: 'L' | 'R'): Extract<BodyEvent, { kind: 'step' }> => ({ kind: 'step', t, seen: t, foot, cadenceHz: null });
const side = { kind: 'side' as const, lead: 'L' as const, yawDeg: -45, n: { x: 0.7, z: 0.7 }, b: { x: 0.7, z: -0.7 }, neutral: 0, t: 0 };

describe('the card (R-F3): the floor\'s lines, then what the mode reads itself — through ModeBodySpec.lines, never a binding', () => {
  const verbs = (l: readonly { verb: string }[]) => l.map((x) => x.verb);
  it('each P8 mode\'s lines: the row minus its claims, then its own verbs', () => {
    expect(rideLines('skateboard', ['step'])).toEqual([
      { move: 'Lean on your toes / heels', verb: 'STEER' }, { move: 'Crouch', verb: 'PUMP' }, { move: 'Jump', verb: 'POP' },
      { move: "Hand to the board's edge, in the air", verb: 'GRAB' }, { move: 'Quarter-turn your shoulders, in the air', verb: 'SPIN' },
      { move: 'Kick-push with your back foot', verb: 'PUSH' },
    ]);
    expect(verbs(rideLines('snowboard'))).toEqual(['STEER', 'TUCK', 'JUMP', 'GRAB', 'SPIN']);
    expect(verbs(rideLines('surf'))).toEqual(['STEER', 'TRIM', 'AIR', 'GRAB', 'CUTBACK', 'SPIN']);
    // big air and sprint claim the step: the P3 row's d-pad comes off the floor, and the card says the mode's own
    expect(rideLines('bigair', ['step'])).toEqual([{ move: 'Run in place', verb: 'RUN-UP' }, { move: 'Quarter-turn your shoulders, in the air', verb: 'SPIN' }, { move: "Hand to the board's edge, in the air", verb: 'GRAB' }]);
    expect(verbs(rideLines('sprint', ['step']))).toEqual(['STRIDE', 'DIP']);
    // dropping the claim is the cut line: the P3 row's own line comes back
    expect(verbs(rideLines('sprint'))).toEqual(['STRIDE', 'STRIDE', 'DIP']);
    expect(rideLines('dunk')).toEqual([]);
  });
  it('the seam: a mode\'s lines reach the card, its claimed step leaves the floor, and it still drives (its onBody)', () => {
    const sp = bodySeamFor({ modeId: 'sprint', body: { claims: ['step'], lines: rideLines('sprint', ['step']) }, onBody: () => true });
    expect(sp.profile.bindings).toEqual([]);
    expect(sp.drives).toBe(true);
    expect(verbs(sp.card.lines)).toEqual(['STRIDE', 'DIP']);
    const sk = bodySeamFor({ modeId: 'skateboard', body: { claims: ['step'], lines: rideLines('skateboard', ['step']) }, onBody: () => true });
    expect(sk.profile.bindings.map((b) => b.from)).toEqual(['carve', 'squat', 'takeoff']);
    expect(verbs(sk.card.lines)).toEqual(['STEER', 'PUMP', 'POP', 'GRAB', 'SPIN', 'PUSH']);
  });
});

describe('the names: the discipline\'s own table, the air left deciding', () => {
  it('skate grabs: rear·toe INDY, lead·heel MELON, lead·toe JAPAN when the air holds it (else INDY), rear·heel the plain GRAB', () => {
    expect(grabTrickFor('skate', 'rear', 'toe', 1)?.id).toBe('indy');
    expect(grabTrickFor('skate', 'lead', 'heel', 1)?.id).toBe('melon');
    expect(grabTrickFor('skate', 'lead', 'toe', 1)?.id).toBe('japan');
    expect(grabTrickFor('skate', 'lead', 'toe', 0.6)?.id).toBe('indy');
    expect(grabTrickFor('skate', 'rear', 'heel', 1)).toBeNull();
    expect(grabTrickFor('skate', 'lead', null, 1)).toBeNull();
  });
  it('snow grabs through the X grab by direction: rear·toe INDY, lead·heel METHOD, rear·heel STALEFISH', () => {
    expect(grabTrickFor('snow', 'rear', 'toe', 1.2)?.id).toBe('indy_snow');
    expect(grabTrickFor('snow', 'lead', 'heel', 1.2)?.id).toBe('method');
    expect(grabTrickFor('snow', 'rear', 'heel', 1.2)?.id).toBe('stalefish');
  });
  it('skate spins: backside the 540 when the air fits, else BS 180; frontside FS 360 or nothing (no FS 180 in the table)', () => {
    const t = (id: string) => SKATE_TRICKS.find((x) => x.id === id)!;
    expect(spinTrickFor('skate', 'bs', t('spin540').airSec)?.id).toBe('spin540');
    expect(spinTrickFor('skate', 'bs', t('spin540').airSec - 0.01)?.id).toBe('bs180');
    expect(spinTrickFor('skate', 'fs', t('fs360').airSec)?.id).toBe('fs360');
    expect(spinTrickFor('skate', 'fs', t('fs360').airSec - 0.01)).toBeNull();
  });
  it('snow spins: frontside 720 → 360, backside CORK 720 → 540 MELON; surf: AIR REVERSE / ALLEY-OOP when they fit', () => {
    const s = (id: string) => SNOW_TRICKS.find((x) => x.id === id)!;
    expect(spinTrickFor('snow', 'fs', 1.2)?.id).toBe('snow720');
    expect(spinTrickFor('snow', 'fs', s('snow360').airSec)?.id).toBe('snow360');
    expect(spinTrickFor('snow', 'bs', 1.3)?.id).toBe('cork720');
    expect(spinTrickFor('snow', 'bs', s('snow540').airSec)?.id).toBe('snow540');
    expect(spinTrickFor('surf', 'fs', 0.7)?.id).toBe('air_reverse');
    expect(spinTrickFor('surf', 'bs', 0.7)?.id).toBe('alley_oop');
    expect(spinTrickFor('surf', 'fs', 0.3)).toBeNull();
  });
});

describe('RideIntents: once each, in the game\'s own phase', () => {
  it('a grab only while the rider flies: a hand down on the ground is nothing, the same hand at the take-off grabs, the hand up ends it', () => {
    const it2 = new RideIntents();
    const g = { wrist: 'R' as const, hand: 'rear' as const, edge: 'toe' as const, since: 0 };
    expect(it2.poll(view(0, { grab: g }), { airborne: false })).toEqual([]);
    expect(it2.poll(view(33, { grab: g }), { airborne: true })).toEqual([{ kind: 'grab', hand: 'rear', edge: 'toe', wrist: 'R' }]);
    expect(it2.poll(view(66, { grab: g }), { airborne: true })).toEqual([]);
    // a frame the model missed is no news: the hand stays held
    expect(it2.poll(view(99, { grab: null }, { tracking: false }), { airborne: true })).toEqual([]);
    expect(it2.poll(view(133, { grab: null }), { airborne: true })).toEqual([{ kind: 'grabEnd' }]);
    // landing with the hand still down ends it too
    const b = new RideIntents();
    b.poll(view(0, { grab: g }), { airborne: true });
    expect(b.poll(view(33, { grab: g }), { airborne: false })).toEqual([{ kind: 'grabEnd' }]);
  });
  it(`a quarter by its seq, once; read up to ${SPIN_EARLY_MS} ms before the game's take-off it waits for it; on the ground it is spent`, () => {
    const q = (seq: number, t: number) => ({ turn: { deg: 90, rateDps: 0, quarter: { dir: 'bs' as const, side: 'R' as const, t, seq } } });
    const a = new RideIntents();
    expect(a.poll(view(1000, q(1, 1000)), { airborne: false })).toEqual([]);
    expect(a.poll(view(1200, q(1, 1000)), { airborne: true })).toEqual([{ kind: 'spin', dir: 'bs', side: 'R', where: 'air' }]);
    expect(a.poll(view(1233, q(1, 1000)), { airborne: true })).toEqual([]);   // the same seq: never twice
    const b = new RideIntents();
    b.poll(view(1000, q(1, 1000)), { airborne: false });
    expect(b.poll(view(1000 + SPIN_EARLY_MS + 50, q(1, 1000)), { airborne: false })).toEqual([]);
    expect(b.poll(view(1000 + SPIN_EARLY_MS + 80, q(1, 1000)), { airborne: true })).toEqual([]);   // spent on the ground
    // surf: on the face it is the cutback — once SPIN_EARLY_MS has passed with the rider still on the face (review fix)
    const c = new RideIntents();
    expect(c.poll(view(0, q(2, 0)), { airborne: false, onFace: true })).toEqual([]);
    expect(c.poll(view(SPIN_EARLY_MS, q(2, 0)), { airborne: false, onFace: true })).toEqual([]);
    expect(c.poll(view(SPIN_EARLY_MS + 33, q(2, 0)), { airborne: false, onFace: true })).toEqual([{ kind: 'spin', dir: 'bs', side: 'R', where: 'face' }]);
  });
  it(`review fix: on surf's face a quarter waits ${SPIN_EARLY_MS} ms for the game's take-off — the hop's A comes with or after the turn — and is the AIR's if it comes`, () => {
    const q = (seq: number, t: number) => ({ turn: { deg: 90, rateDps: 0, quarter: { dir: 'fs' as const, side: 'L' as const, t, seq } } });
    const a = new RideIntents();
    expect(a.poll(view(1000, q(1, 1000)), { airborne: false, onFace: true })).toEqual([]);
    expect(a.poll(view(1090, q(1, 1000)), { airborne: false, onFace: true })).toEqual([]);
    expect(a.poll(view(1120, q(1, 1000)), { airborne: true, onFace: false })).toEqual([{ kind: 'spin', dir: 'fs', side: 'L', where: 'air' }]);
    expect(a.poll(view(1500, q(1, 1000)), { airborne: false, onFace: true })).toEqual([]);   // spent: never a cutback after
    // a quarter read in a body jump is the air's: the game never leaving the face for it makes it nothing, never a cutback
    const b = new RideIntents();
    expect(b.poll(view(1000, q(1, 1000), { inJump: true }), { airborne: false, onFace: true })).toEqual([]);
    for (let t = 1033; t <= 1000 + SPIN_EARLY_MS + 100; t += 33) expect(b.poll(view(t, q(1, 1000)), { airborne: false, onFace: true })).toEqual([]);
    // …and one that goes into a body jump while it waits, the same
    const c = new RideIntents();
    c.poll(view(1000, q(1, 1000)), { airborne: false, onFace: true });
    c.poll(view(1100, q(1, 1000), { inJump: true }), { airborne: false, onFace: true });
    for (let t = 1133; t <= 1000 + SPIN_EARLY_MS + 100; t += 33) expect(c.poll(view(t, q(1, 1000)), { airborne: false, onFace: true })).toEqual([]);
  });
  it(`review fix: a quarter older than ${SPIN_EARLY_MS} ms when it reaches the mode is old news in every state; sync() forgets the one there`, () => {
    const q = (seq: number, t: number) => ({ turn: { deg: 90, rateDps: 0, quarter: { dir: 'bs' as const, side: 'R' as const, t, seq } } });
    for (const g of [{ airborne: false, onFace: true }, { airborne: true }, { airborne: false }]) {
      const a = new RideIntents();   // a fresh one (a mode's load), the reader still holding a quarter from 20 s ago
      for (let t = 20000; t < 21000; t += 33) expect(a.poll(view(t, q(3, 0)), g), JSON.stringify(g)).toEqual([]);
    }
    const b = new RideIntents();
    b.sync(view(5000, q(4, 4900)));   // the first frame of play: a quarter read at READY (the turn into the stance)
    expect(b.poll(view(5033, q(4, 4900)), { airborne: true })).toEqual([]);
    expect(b.poll(view(6000, q(5, 5990)), { airborne: true })).toEqual([{ kind: 'spin', dir: 'bs', side: 'R', where: 'air' }]);
  });
  it(`the dip: the chest ≥ 20° forward for ${DIP_HOLD_MS} ms while RUNNING — once, re-armed only upright; a stretch's fold (not running) never`, () => {
    const a = new RideIntents();
    const run = { running: true, trunkFwdDeg: 25 };
    expect(a.poll(view(0, run), { airborne: false })).toEqual([]);
    expect(a.poll(view(DIP_HOLD_MS + 5, run), { airborne: false })).toEqual([{ kind: 'dip' }]);
    expect(a.poll(view(DIP_HOLD_MS + 40, run), { airborne: false })).toEqual([]);
    const b = new RideIntents();
    for (let t = 0; t < 600; t += 33) expect(b.poll(view(t, { running: false, trunkFwdDeg: 50 }), { airborne: false })).toEqual([]);
  });
});

describe('the kick-push', () => {
  it(`the BACK foot's real step with the lead planted ≥ ${PUSH_LEAD_PLANTED_MS} ms, from a side-on stance; one per push`, () => {
    const lift = { L: -Infinity, R: 900 };
    const ok = view(1000, { stance: side, lift, swing: { L: 0, R: 0.08 } });
    expect(isKickPush(step(1000, 'R'), ok)).toBe(true);
    expect(isKickPush(step(1000, 'L'), ok)).toBe(false);                                           // the lead foot
    expect(isKickPush(step(1000, 'R'), view(1000, { stance: side, lift: { L: 800, R: 900 }, swing: { L: 0, R: 0.08 } }))).toBe(false);   // running in place
    expect(isKickPush(step(1000, 'R'), view(1000, { stance: side, lift, swing: { L: 0, R: 0.03 } }))).toBe(false);   // a jittered "step"
    expect(isKickPush(step(1000, 'R'), view(1000, { stance: { ...side, kind: 'square', lead: null }, lift, swing: { L: 0, R: 0.08 } }))).toBe(false);
    expect(isKickPush(step(1000, 'R'), view(1000, { stance: side, lift, swing: { L: 0, R: 0.08 } }, { inJump: true }))).toBe(false);
    const k = new KickPush();
    expect(k.take(step(1000, 'R'), ok)).toBe(true);
    expect(k.take(step(1550, 'R'), view(1550, { stance: side, lift: { L: -Infinity, R: 1500 }, swing: { L: 0, R: 0.08 } }))).toBe(false);   // the foot back on the board
    expect(k.take(step(1000 + PUSH_REFRACTORY_MS, 'R'), view(1000 + PUSH_REFRACTORY_MS, { stance: side, lift: { L: -Infinity, R: 1900 }, swing: { L: 0, R: 0.08 } }))).toBe(true);
  });
});

describe('the body\'s stride: graded on the capture clock, on a body\'s scale', () => {
  it(`alternating at ≥ ${BODY_PERFECT_HZ} steps/s and steady: perfect; ≥ ${BODY_GOOD_HZ}: good; slower: off`, () => {
    const g = new BodyStride();
    const per = 1000 / 3.8;
    expect(g.gradeAt(0, 'L')).toBe('first');
    expect(g.gradeAt(per, 'R')).toBe('good');                 // no previous interval to be steady against yet
    expect(g.gradeAt(2 * per, 'L')).toBe('perfect');
    const h = new BodyStride();
    h.gradeAt(0, 'L'); h.gradeAt(333, 'R');
    expect(h.gradeAt(666, 'L')).toBe('good');                 // 3 steps/s
    const s = new BodyStride();
    s.gradeAt(0, 'L');
    expect(s.gradeAt(500, 'R')).toBe('off');                  // 2 steps/s
  });
  it('the same foot twice: a stumble only inside 0.8 of the running period (a real double step); after a longer gap a missed step — off', () => {
    const g = new BodyStride();
    g.gradeAt(0, 'L'); g.gradeAt(333, 'R'); g.gradeAt(666, 'L');
    expect(g.gradeAt(800, 'L')).toBe('fault');               // 134 ms: a double step
    const m = new BodyStride();
    m.gradeAt(0, 'L'); m.gradeAt(333, 'R'); m.gradeAt(666, 'L');
    expect(m.gradeAt(1332, 'L')).toBe('off');                // the R between was never told
  });
  it('a told step counts only with a real swing behind it (the calf-raise rule), once per lift, never in a jump', () => {
    const g = new BodyStride();
    const v = (t: number, liftR: number, swingR: number, o = {}) => view(t, { lift: { L: -Infinity, R: liftR }, swing: { L: 0, R: swingR } }, o);
    expect(g.grade(step(1000, 'R'), v(1000, -Infinity, 0.1))).toBeNull();   // the foot never left the floor
    expect(g.grade(step(1000, 'R'), v(1000, 900, 0.03))).toBeNull();        // a jittered swing
    expect(g.grade(step(1000, 'R'), v(1000, 900, 0.1))).toBe('first');
    expect(g.grade(step(1100, 'R'), v(1100, 900, 0.1))).toBeNull();         // the same lift
    expect(g.grade(step(1400, 'R'), v(1400, 1300, 0.1, { inJump: true }))).toBeNull();
  });
});

it('stickXFromBody: the bus\'s per-axis answer when it has one; the event\'s own tag otherwise', () => {
  expect(stickXFromBody({ bodyOwnsLx: () => true }, {})).toBe(true);
  expect(stickXFromBody({ bodyOwnsLx: () => false }, { src: 'body' })).toBe(false);
  expect(stickXFromBody(null, { src: 'body' })).toBe(true);
  expect(stickXFromBody({}, {})).toBe(false);
});

it('bodyElapsedMs: the time since arrival, the camera\'s lag and the told-late part', () => {
  expect(bodyElapsedMs({ t: 950 }, { ...view(1000, {}), arrivedAt: 1080, lagMs: 80 }, 1100)).toBe(20 + 80 + 50);
});
