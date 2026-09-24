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
  it('Ruffin\'s Spider-Man splits and Carter\'s "it\'s over" are credited; every one has its clip', () => {
    expect(CELEBRATIONS.spiderman.by).toBe('Brandon Ruffin');
    expect(CELEBRATIONS.itsover.by).toBe('Vince Carter');
    for (const c of Object.values(CELEBRATIONS)) expect(c.clip).toMatch(/^dunk_/);   // the dunk family: mirrored to the right hand with the rest
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
