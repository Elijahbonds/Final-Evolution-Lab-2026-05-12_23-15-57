// DUNK MOTION phase 12 — the made dunk's show: the triple cut, the announcer, the celebrations (owner decisions, 2026-09-23/24).
import { describe, it, expect } from 'vitest';
import { TRIPLE_CUT, POSTER_SEC, tripleCutSec, cutSec, cutCamera, announcerCall, pickCelebration, CELEBRATIONS, CELEB_BY_DPAD, RIVAL_CELEB, seedOf } from './DunkCuts';
import { DUNK_RIVALS } from './DunkRivals';

const bands = { eruption: 45, approval: 40 };
const rim = { x: 0, y: 3.05, z: -10.28 };
const body = { x: 0, y: 1.2, z: -9.9 };
const approach = { x: 0, z: -1 };

describe('the triple cut', () => {
  it('three cameras, about two seconds (owner: "Short, ~2 s"), each the flush up to the iron and a beat after it', () => {
    expect(TRIPLE_CUT.map((c) => c.id)).toEqual(['baseline', 'profile', 'phone']);
    expect(tripleCutSec()).toBeGreaterThan(1.8); expect(tripleCutSec()).toBeLessThan(2.5);
    for (const c of TRIPLE_CUT) { expect(c.lead).toBeGreaterThan(0.3); expect(c.tail).toBeGreaterThan(0); expect(cutSec(c)).toBeGreaterThan(0.5); }
    expect(POSTER_SEC).toBeLessThan(1.2);
  });
  it('under the rim looks UP at him; the side is level with the iron; the phone is behind him in the stands, and it shakes', () => {
    const base = cutCamera('baseline', rim, body, approach), side = cutCamera('profile', rim, body, approach), phone = cutCamera('phone', rim, body, approach);
    expect(base.pos.y).toBeLessThan(base.target.y - 1);
    expect(Math.abs(side.pos.y - rim.y)).toBeLessThan(0.3);
    expect(Math.hypot(side.pos.x - rim.x, side.pos.z - rim.z)).toBeGreaterThan(3);
    expect(phone.pos.z).toBeGreaterThan(body.z + 3);   // behind him, toward the court he came from
    expect(phone.shake).toBeGreaterThan(0); expect(base.shake).toBe(0);
  });
  it('the cameras follow the way he came in (a baseline drive is filmed from ITS side)', () => {
    const a = cutCamera('profile', rim, body, { x: 0, z: -1 }), b = cutCamera('profile', rim, body, { x: 1, z: 0 });
    expect(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)).toBeGreaterThan(2);
  });
  it('the poster is low and wide, under him', () => {
    const p = cutCamera('poster', rim, body, approach);
    expect(p.pos.y).toBeLessThan(body.y + 1.3); expect(p.fov).toBeGreaterThan(0.9);
  });
});

describe('the announcer', () => {
  it('the bigger the card, the louder the call — and it names the dunk', () => {
    expect(announcerCall({ total: 48, name: 'THE 720', bands, seed: 0 })).toMatch(/THE 720!$/);
    expect(announcerCall({ total: 42, name: 'WINDMILL', bands, seed: 0 })).toMatch(/WINDMILL\.$/);
    expect(announcerCall({ total: 34, name: 'WINDMILL', bands, seed: 0 })).toMatch(/WINDMILL\.$/);
  });
  it('the same dunk gets the same call; a repeat is called a repeat; the rival is named', () => {
    const a = announcerCall({ total: 47, name: 'EASTBAY', bands, seed: seedOf('EASTBAY:47') });
    expect(announcerCall({ total: 47, name: 'EASTBAY', bands, seed: seedOf('EASTBAY:47') })).toBe(a);
    expect(announcerCall({ total: 47, name: 'EASTBAY', bands, seen: true })).toMatch(/SEEN THAT ONE/);
    expect(announcerCall({ total: 41, name: 'TOMAHAWK', bands, dunker: 'CASS' })).toMatch(/^CASS! /);
  });
});

describe('the celebrations', () => {
  it('every celebration is credited to FLIGHT NIGHT (the in-fiction crew) — no real dunker is named (owner, HOOPS-MOTION round 1)', () => {
    // Was "Brandon Ruffin" / "Vince Carter". The names were the homage; the credit stays generic so the
    // poster/HUD never prints a real person in a public build. The clips and labels are unchanged.
    expect(CELEBRATIONS.spiderman.by).toBe('FLIGHT NIGHT');
    expect(CELEBRATIONS.itsover.by).toBe('FLIGHT NIGHT');
    for (const c of Object.values(CELEBRATIONS)) expect(c.clip).toMatch(/^dunk_/);   // the dunk family: mirrored to the right hand with the rest
  });
  it('no label names a trademarked character (owner 2026-10-06): the splits are THE AIR SPLITS; the id and clip stay for saved data', () => {
    expect(CELEBRATIONS.spiderman.label).toBe('THE AIR SPLITS');
    expect(CELEBRATIONS.spiderman.clip).toBe('dunk_celeb_spiderman_splits');   // internal: clip registry, creator saves, voice tags
    for (const c of Object.values(CELEBRATIONS)) expect(c.label).not.toMatch(/spider/i);
  });
  it('the d-pad throws yours; a thrown one always wins', () => {
    expect(new Set(Object.values(CELEB_BY_DPAD)).size).toBe(4);
    expect(pickCelebration({ total: 31, bands, chosen: 'spiderman' })).toBe('spiderman');
  });
  it('left alone: a big one earns the floor show, a good one a roar or a pat, an ordinary make nothing', () => {
    for (let seed = 0; seed < 6; seed++) expect(['spiderman', 'itsover']).toContain(pickCelebration({ total: 47, bands, seed }));
    for (let seed = 0; seed < 6; seed++) expect(['roar', 'toosmall', 'armsup']).toContain(pickCelebration({ total: 41, bands, seed }));
    expect(pickCelebration({ total: 35, bands })).toBeNull();
  });
  it('every rival celebrates like himself, and only on a real make', () => {
    for (const r of DUNK_RIVALS) expect(RIVAL_CELEB[r.id], r.id).toBeDefined();
    expect(pickCelebration({ total: 44, bands, rivalId: 'stack' })).toBe('spiderman');
    expect(pickCelebration({ total: 44, bands, rivalId: 'cass' })).toBe('armsup');
    expect(pickCelebration({ total: 33, bands, rivalId: 'stack' })).toBeNull();
  });
});

// ── THE FOURTH ANGLE (lane/w3-present, wave 3): the orbit round the rim ──────────────────────────────────────────────
import { ORBIT, ORBIT_CUT, cutsSec, showCuts } from './DunkCuts';
describe('the orbit angle', () => {
  const rim = { x: 0, y: 3.05, z: 5 }, body = { x: 0, y: 3, z: 4.4 }, approach = { x: 0, z: 1 };
  const flat = (p: { x: number; z: number }) => Math.hypot(p.x - rim.x, p.z - rim.z);
  it('is the fourth cut after the tuned triple, which is unchanged', () => {
    expect(TRIPLE_CUT.map((c) => c.id)).toEqual(['baseline', 'profile', 'phone']);
    expect(showCuts(true).map((c) => c.id)).toEqual(['baseline', 'profile', 'phone', 'orbit']);
    expect(showCuts(true)[3]).toBe(ORBIT_CUT);
  });
  it('reduced motion (no camera travel) keeps the triple and nothing else', () => {
    expect(showCuts(false)).toBe(TRIPLE_CUT);
    expect(cutsSec(showCuts(false))).toBeCloseTo(tripleCutSec(), 9);
  });
  it('adds about a second to the show (tripleCutSec is untouched)', () => {
    expect(cutsSec(showCuts(true)) - tripleCutSec()).toBeCloseTo(cutSec(ORBIT_CUT), 9);
    expect(cutSec(ORBIT_CUT)).toBeGreaterThan(0.8); expect(cutSec(ORBIT_CUT)).toBeLessThan(1.3);
  });
  it('travels: starts on the approach\'s right (the profile\'s side), sweeps ORBIT.sweepRad round the rim at its radius, and rises', () => {
    const a = cutCamera('orbit', rim, body, approach, 0), b = cutCamera('orbit', rim, body, approach, 1), m = cutCamera('orbit', rim, body, approach, 0.5);
    expect(flat(a.pos)).toBeCloseTo(ORBIT.radius, 6); expect(flat(b.pos)).toBeCloseTo(ORBIT.radius, 6); expect(flat(m.pos)).toBeCloseTo(ORBIT.radius, 6);
    const p = cutCamera('profile', rim, body, approach).pos;
    expect(Math.sign(a.pos.x - rim.x)).toBe(Math.sign(p.x - rim.x));       // the same side as the profile angle
    const ang = (q: { x: number; z: number }) => Math.atan2(q.z - rim.z, q.x - rim.x);
    const sweep = Math.abs(Math.atan2(Math.sin(ang(b.pos) - ang(a.pos)), Math.cos(ang(b.pos) - ang(a.pos))));
    expect(sweep).toBeCloseTo(ORBIT.sweepRad, 3);
    expect(b.pos.y).toBeGreaterThan(a.pos.y);
    expect(cutCamera('orbit', rim, body, approach, -3).pos.x).toBeCloseTo(a.pos.x, 9);   // progress is clamped
    expect(cutCamera('orbit', rim, body, approach, 9).pos.z).toBeCloseTo(b.pos.z, 9);
  });
  it('ends beyond the rim, looking back at the dunker: the last look is him coming through the iron at the lens', () => {
    const b = cutCamera('orbit', rim, body, approach, 1);
    expect(b.pos.z).toBeGreaterThan(rim.z - 1.5);                              // round the far side or past it
    expect(b.target.z).toBeLessThan(rim.z);                                      // the look is back toward the dunker
  });
  it('the other angles ignore progress (they do not travel)', () => {
    for (const id of ['baseline', 'profile', 'phone', 'poster'] as const) expect(cutCamera(id, rim, body, approach, 0.9)).toEqual(cutCamera(id, rim, body, approach, 0));
  });
});
