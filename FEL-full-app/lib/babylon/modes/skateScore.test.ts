// SKATE-SCORE (2026-09-29): the eye's SK-1, SK-2, SK-3 and SK-5 on 9096d7cf, asserted two ways.
//
//   1. The rules, on the real AirControl / LandingSystem / ComboChain an air runs through: a flat pop is flown frame by
//      frame at 60 Hz (GroundRide's gravity), the trick is thrown the way SkateRunMode.airTrick throws it (`throwTrick`
//      below mirrors it line for line), and the touchdown is graded the way the mode grades it (`touchdown`).
//   2. The wiring: a source scan of SkateRunMode, so a rule that passes here cannot sit beside a mode that never calls it —
//      the way combo.bank() once existed and was called nowhere (scripts/skate-run-tests.ts, its header).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { AirControl, type AirTrick } from '../core/AirControl';
import { resolveLanding, gradeLanding, SKETCHY_MAX, type LandingGrade } from '../core/LandingSystem';
import { BalanceModel } from '../core/BoardPhysics';
import { ComboChain } from '../core/ComboChain';
import { SKATE_TRICKS, airTrickFor, basePts, type BoardTrick } from '../core/BoardTricks';
import { trickSeconds, BOARD_ONLY_SPINS } from '../core/TrickPose';
import { grabTrickFor, spinTrickFor } from '../core/rideTricks';
import { TRICKS } from './boardCore';
import {
  skateLandingError01, skateAirLeft, skateAirBudget, fitToAir, rollingPopVy, popVy, popHeight, popHang, isBigAir, GrabBook, LandedTricks,
  POP_FULL_SPEED, STAND_POP_SHARE, BIG_AIR_OVER_POP_M, SKATE_GRAVITY,
} from './skateScore';

const DT = 1 / 60;
const D = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const trick = (id: string): BoardTrick => { const t = SKATE_TRICKS.find((x) => x.id === id); if (!t) throw new Error(id); return t; };

/** SkateRunMode.airTrick, as the mode throws a trick (family, the caught flip / spin, the still trick, the grab's link). */
function throwTrick(air: AirControl, book: GrabBook, t: BoardTrick, pts = basePts(t)): void {
  const family: AirTrick['family'] = t.grab !== 'none' ? 'grab' : t.flipDeg !== 0 ? 'flip' : 'spin';
  const boardOnly = BOARD_ONLY_SPINS.has(t.id);
  const still = t.spinDeg === 0 && t.flipDeg === 0 && t.grab === 'none';
  if (family === 'grab' && air.state.grabHeld) book.letGo(air.state.chain, air.releaseGrab());
  air.applyTrick({
    id: t.id, label: t.label, family: boardOnly || still ? 'flip' : family, basePts: pts, difficulty: Math.max(1, Math.round(t.difficulty)),
    ...(t.flipDeg !== 0 || boardOnly || still ? { flipTarget: t.flipDeg * D, flipSec: trickSeconds(t) } : {}),
    ...(t.spinDeg !== 0 && !boardOnly ? { spinTarget: (t.id.startsWith('bs') ? -1 : 1) * t.spinDeg * D, spinSec: trickSeconds(t) } : {}),
  });
  if (family === 'grab' && air.state.airborne) book.thrown(air.state.chain, { id: t.id, label: t.label, basePts: pts, difficulty: Math.max(1, Math.round(t.difficulty)) });
}

/** A pad's plain X grab in the air (SkateRunMode: airTrick('grab', TRICKS.grab.name, 'grab', TRICKS.grab.pts, 1)). */
function throwPlainGrab(air: AirControl, book: GrabBook): void {
  air.applyTrick({ id: 'grab', label: TRICKS.grab.name, family: 'grab', basePts: TRICKS.grab.pts, difficulty: 1 });
  book.thrown(air.state.chain, { id: 'grab', label: TRICKS.grab.name, basePts: TRICKS.grab.pts, difficulty: 1 });
}

interface Flight { air: AirControl; book: GrabBook; y: number; vy: number; t: number }
/** A flat-ground pop: the rider leaves the ground at `vy` (GroundRide: gravity −14, the air integrated at the frame rate). */
function popFlat(vy: number): Flight {
  const air = new AirControl(); air.launch();
  return { air, book: new GrabBook(), y: 0, vy, t: 0 };
}
/** Fly `sec` seconds (or to the ground), the pad's L stick held at `stickX` (SkateRunMode feeds it to the air as it is). */
function fly(f: Flight, sec = Infinity, stickX = 0): boolean {
  for (let n = 0; n < 1000 && f.t < sec; n++) {
    f.vy -= SKATE_GRAVITY * DT; f.y += f.vy * DT; f.t += DT;
    f.air.update(DT, stickX, 0);
    if (f.y <= 0) return true;
  }
  return f.y <= 0;
}
/** SkateRunMode's touchdown: the error (a late hold taxed), the grab let go into the chain, the grade, the card, the combo. */
function touchdown(f: Flight, landed: LandedTricks, combo: ComboChain, speed01 = 0.5): { grade: LandingGrade; chain: AirTrick[]; error: number } {
  const error = skateLandingError01(f.air.state);
  if (f.air.state.grabHeld) f.book.letGo(f.air.state.chain, f.air.releaseGrab());
  const res = resolveLanding(f.air, new BalanceModel(), { error01: error, slopeMismatch01: 0, speed01 });
  const pts = res.chain.reduce((s, t) => s + t.basePts, 0);
  landed.touchdown(res.grade, res.chain.length);
  if (res.grade === 'clean' && pts > 0) combo.add(res.chain.map((t) => t.label).join(' → '), pts, 'air');
  return { grade: res.grade, chain: res.chain, error };
}
/** This air as the mode measures it (SkateRunMode.airNow): what is left, and the whole of it (flown + left). */
const airOf = (f: Flight): { left: number; budget: number } => { const left = skateAirLeft(f.y, f.vy); return { left, budget: skateAirBudget(f.t, left) }; };
/** SkateRunMode's button press in the air: the table's pick for the whole air, stepped down until it can finish. */
const pressFor = (f: Flight, dir: BoardTrick['dir'], btn: BoardTrick['btn']): BoardTrick | null => { const a = airOf(f); return fitToAir((b) => airTrickFor('skate', dir, btn, b), a.budget, a.left); };
/** SkateRunMode's body quarter-turn in the air. */
const turnFor = (f: Flight, dir: 'fs' | 'bs'): BoardTrick | null => { const a = airOf(f); return fitToAir((b) => spinTrickFor('skate', dir, b), a.budget, a.left); };

const ROLLING = 6;   // m/s: two pushes in, above POP_FULL_SPEED

describe('SK-1: a grab scores, and counts as a trick', () => {
  it('a pad X grab off a flat ollie lands clean with points and counts one trick', () => {
    const f = popFlat(popVy(ROLLING, 0)), landed = new LandedTricks(), combo = new ComboChain(undefined, 'air');
    fly(f, 0.1); throwPlainGrab(f.air, f.book);
    fly(f, 0.6); f.book.letGo(f.air.state.chain, f.air.releaseGrab());   // X released in the air
    fly(f);
    const r = touchdown(f, landed, combo);
    expect(r.grade).toBe('clean');
    expect(r.chain.map((t) => t.label)).toEqual(['GRAB']);
    expect(r.chain[0].basePts).toBeGreaterThan(TRICKS.grab.pts);   // its points, plus the hold
    expect(combo.pot).toBeGreaterThan(0);
    expect(landed.total).toBe(1);
  });
  it('the body grab (rear hand, toe edge) lands as a named INDY with points, held to the ground', () => {
    const f = popFlat(popVy(ROLLING, 0)), landed = new LandedTricks(), combo = new ComboChain(undefined, 'air');
    fly(f, 0.12);
    const t = grabTrickFor('skate', 'rear', 'toe', airOf(f).budget);
    expect(t?.label).toBe('INDY');
    throwTrick(f.air, f.book, t!);
    fly(f);   // the body grab is held to the landing: let go at the touchdown
    const r = touchdown(f, landed, combo);
    expect(r.grade).toBe('clean');
    expect(r.chain.map((x) => x.label)).toEqual(['INDY']);
    expect(combo.links[0].pts).toBeGreaterThan(basePts(t!));      // named points + the hold
    expect(landed.total).toBe(1);
  });
  it('the JAPAN AIR is its own named link, and a grab let go before a flip reads in the order it was done', () => {
    const f = popFlat(popVy(ROLLING, 1)), landed = new LandedTricks(), combo = new ComboChain(undefined, 'air');
    fly(f, 0.05);
    throwTrick(f.air, f.book, grabTrickFor('skate', 'lead', 'toe', airOf(f).budget)!);   // JAPAN fits a full pop
    fly(f, 0.45); f.book.letGo(f.air.state.chain, f.air.releaseGrab());
    throwTrick(f.air, f.book, trick('kickflip'));
    fly(f);
    const r = touchdown(f, landed, combo);
    expect(r.grade).toBe('clean');
    expect(r.chain.map((x) => x.label)).toEqual(['JAPAN AIR', 'KICKFLIP']);
    expect(landed.total).toBe(2);
  });
  it('a grab whose air bails pays nothing and is not counted', () => {
    const f = popFlat(popVy(ROLLING, 0)), landed = new LandedTricks(), combo = new ComboChain(undefined, 'air');
    fly(f, 0.1); throwTrick(f.air, f.book, trick('indy'));
    f.air.state.rotation.z = Math.PI;   // the deck came down upside down
    fly(f);
    const r = touchdown(f, landed, combo);
    expect(r.grade).toBe('bail');
    expect(combo.pot).toBe(0);
    expect(landed.total).toBe(0);
  });
  it('a hold let go on a new air is not added to the last air\'s link (GrabBook forgets a chain it is no longer in)', () => {
    const book = new GrabBook(), a = new AirControl(); a.launch();
    const link = book.thrown(a.state.chain, { id: 'indy', label: 'INDY', basePts: 60, difficulty: 2 });
    a.launch();   // a new air: a new chain
    book.letGo(a.state.chain, 30);
    expect(link.basePts).toBe(60);
  });
});

describe('SK-2: a spin or flip that finishes lands clean; an unfinished one still bails', () => {
  it('the skate grade agrees with AirControl to 90° off level, and a half turn is level (fakie), not upside down', () => {
    for (let deg = -90; deg <= 90; deg += 7.5) {
      const a = new AirControl(); a.launch(); a.state.rotation.y = deg * D;
      expect(skateLandingError01(a.state)).toBeCloseTo(a.landingError01(), 10);
    }
    for (const turns of [0.5, -0.5, 1.5, -1.5, 1]) {
      const a = new AirControl(); a.launch(); a.state.rotation.y = turns * TWO_PI;
      expect(skateLandingError01(a.state), `${turns} turns`).toBeLessThan(1e-9);
    }
    const half = new AirControl(); half.launch(); half.state.rotation.y = Math.PI;
    expect(half.landingError01()).toBeGreaterThan(SKETCHY_MAX);   // the shared grader is unchanged (scripts/air-landing-tests B)
  });
  it('a board still upside down (half a flip) or pitched over still bails', () => {
    const flip = new AirControl(); flip.launch(); flip.state.rotation.z = Math.PI;
    expect(gradeLanding({ error01: skateLandingError01(flip.state), slopeMismatch01: 0, speed01: 0 })).toBe('bail');
    const across = new AirControl(); across.launch(); across.state.rotation.y = Math.PI / 2; across.state.angularVel.y = 7.2;
    expect(gradeLanding({ error01: skateLandingError01(across.state), slopeMismatch01: 0, speed01: 0.5 })).not.toBe('clean');
  });
  it('the body BACKSIDE 180 off a flat ollie turns exactly half a turn and lands clean (it bailed at 9096d7cf)', () => {
    const f = popFlat(popVy(ROLLING, 0)), landed = new LandedTricks(), combo = new ComboChain(undefined, 'air');
    fly(f, 0.1);
    const t = turnFor(f, 'bs');
    expect(t?.id).toBe('bs180');
    throwTrick(f.air, f.book, t!);
    fly(f);
    expect(Math.abs(f.air.state.rotation.y)).toBeCloseTo(Math.PI, 4);
    const r = touchdown(f, landed, combo);
    expect(r.grade).toBe('clean');
    expect(landed.total).toBe(1);
  });
  it('the pad BS 180 (right + B) off a flat ollie lands clean with the stick still held right (the eye\'s 9 of 9 bails)', () => {
    const f = popFlat(popVy(ROLLING, 0)), landed = new LandedTricks(), combo = new ComboChain(undefined, 'air');
    fly(f, 0.08, 1);
    const t = pressFor(f, 'right', 'B');
    expect(t?.id).toBe('bs180');
    throwTrick(f.air, f.book, t!);
    fly(f, Infinity, 1);
    expect(touchdown(f, landed, combo, ROLLING / 16.8).grade).toBe('clean');   // speed01 at 6 m/s (SKATE_TUNING.maxSpeed 16.8)
    expect(landed.total).toBe(1);
  });
  it('ROUTED (skate-score-routed.md §2): the held stick un-spins a caught BS 180 — sketchy off a charged pop until the hold lands', () => {
    // the air nudge is movement-play's pinned pad line (rideBody.gate.test.ts G10), so this lane does not change it; measured
    // here so the routed proposal carries its numbers: 46° short off an uncharged pop, 74° off a half-charged one
    const t = trick('bs180');
    const unheld = (charge: number): { error: number; deg: number } => {
      const g = popFlat(popVy(ROLLING, charge)); fly(g, 0.08, 1); throwTrick(g.air, g.book, t); fly(g, Infinity, 1);
      return { error: skateLandingError01(g.air.state), deg: Math.abs(g.air.state.rotation.y) * 180 / Math.PI };
    };
    expect(unheld(0).deg).toBeLessThan(140);
    expect(unheld(0).error).toBeLessThan(0.25);                                                  // clean at a roll
    expect(gradeLanding({ error01: unheld(0.5).error, slopeMismatch01: 0, speed01: 0.3 })).toBe('sketchy');
  });
  it('pad B / Y after a flat ollie with the stick forward: INDY lands clean; Y throws the JAPAN AIR off a charged pop', () => {
    const f = popFlat(popVy(ROLLING, 0)), landed = new LandedTricks(), combo = new ComboChain(undefined, 'air');
    fly(f, 0.06);
    const b = pressFor(f, 'up', 'B');
    expect(b?.id).toBe('indy');
    throwTrick(f.air, f.book, b!); fly(f);
    expect(touchdown(f, landed, combo).grade).toBe('clean');
    // Y needs the air a charged pop buys: uncharged it has nothing to throw (answered NOT ENOUGH AIR), half charged the JAPAN
    const flat = popFlat(popVy(ROLLING, 0)); fly(flat, 0.06);
    expect(pressFor(flat, 'up', 'Y')).toBeNull();
    const charged = popFlat(popVy(ROLLING, 0.5)); fly(charged, 0.06);
    const y = pressFor(charged, 'up', 'Y');
    expect(y?.id).toBe('japan');
    throwTrick(charged.air, charged.book, y!); fly(charged);
    expect(touchdown(charged, landed, combo).grade).toBe('clean');
  });
  it('the flips, the FS 360, the 360 FLIP and the 540 thrown early off the pop they need all land clean', () => {
    const cases: [string, number][] = [['kickflip', 0], ['heelflip', 0], ['shuvit', 0], ['fs360', 0.5], ['tre', 1], ['spin540', 1]];
    for (const [id, charge] of cases) {
      const f = popFlat(popVy(ROLLING, charge)), landed = new LandedTricks(), combo = new ComboChain(undefined, 'air');
      fly(f, 0.06);
      const t = trick(id);
      expect(airOf(f).budget, `${id} fits`).toBeGreaterThanOrEqual(t.airSec);
      throwTrick(f.air, f.book, t); fly(f);
      const r = touchdown(f, landed, combo);
      expect(r.grade, `${id} (error ${r.error.toFixed(3)})`).toBe('clean');
      expect(landed.total, id).toBe(1);
    }
  });
  it('a mid-air OLLIE turns nothing and lands clean (it free-spun the rider at 7.2 rad/s)', () => {
    const f = popFlat(popVy(ROLLING, 0)), landed = new LandedTricks(), combo = new ComboChain(undefined, 'air');
    fly(f, 0.2);
    throwTrick(f.air, f.book, trick('ollie')); fly(f);
    expect(f.air.state.angularVel.length()).toBe(0);
    expect(touchdown(f, landed, combo).grade).toBe('clean');
  });
  it('a flip thrown with the ground coming up is still turning at the touchdown: not clean, not counted', () => {
    const f = popFlat(popVy(ROLLING, 0)), landed = new LandedTricks(), combo = new ComboChain(undefined, 'air');
    fly(f, popHang(f.vy) - 0.18);
    throwTrick(f.air, f.book, trick('kickflip')); fly(f);
    const r = touchdown(f, landed, combo);
    expect(r.grade).not.toBe('clean');
    expect(landed.total).toBe(0);
  });
  it('the air left is the pop\'s real hang, and the budget is the whole air: flown plus left', () => {
    const vy = popVy(ROLLING, 0);
    expect(skateAirLeft(0, vy)).toBeCloseTo(popHang(vy), 6);
    expect(skateAirLeft(popHeight(vy), 0)).toBeCloseTo(popHang(vy) / 2, 6);
    expect(skateAirBudget(popHang(vy) / 2, skateAirLeft(popHeight(vy), 0))).toBeCloseTo(popHang(vy), 6);   // same air at the apex
    expect(skateAirLeft(0, -3)).toBe(0);
    expect(skateAirBudget(0, 0)).toBe(0.25);   // the old budget's floor, which fits nothing in the table
    expect(Math.min(...SKATE_TRICKS.filter((t) => t.kind === 'air').map((t) => t.airSec))).toBeGreaterThan(0.25);
  });
  it('the live regression: a body\'s late BS 180 off a slower roll is thrown, and one with no air to turn in is not', () => {
    // 3.5 m/s: a coasting body rider's pop (SK-5 scales it), the quarter-turn read a third of a second into the air
    const f = popFlat(popVy(3.5, 0)), landed = new LandedTricks(), combo = new ComboChain(undefined, 'air');
    fly(f, 0.33);
    expect(airOf(f).left).toBeLessThan(0.66);   // judged against the air LEFT (the first cut of this fix) it was refused
    const t = turnFor(f, 'bs');
    expect(t?.id).toBe('bs180');
    throwTrick(f.air, f.book, t!); fly(f);
    expect(touchdown(f, landed, combo).grade).toBe('clean');
    const late = popFlat(popVy(ROLLING, 0)); fly(late, popHang(late.vy) - 0.3);
    expect(turnFor(late, 'bs')).toBeNull();   // 0.3 s left: the 180's 0.31 s motion cannot finish — NOT ENOUGH AIR
  });
  it('a pick that cannot finish steps down the table (a 540 asked late is the BS 180 that can)', () => {
    const f = popFlat(popVy(ROLLING, 1)); fly(f, 0.5);
    const a = airOf(f);
    expect(spinTrickFor('skate', 'bs', a.budget)?.id).toBe('spin540');   // the whole air holds it…
    expect(turnFor(f, 'bs')?.id).toBe('bs180');                           // …but its 0.93 s motion no longer fits what is left
  });
});

describe('SK-3 (and qa-fixes A1-06): the card counts landed tricks only', () => {
  it('a bail\'s chain is not landed; a clean one is', () => {
    const l = new LandedTricks();
    l.touchdown('bail', 1); l.touchdown('bail', 2); l.touchdown('clean', 0);
    expect(l.total).toBe(0);
    l.touchdown('clean', 2);
    expect(l.total).toBe(2);
  });
  it('the eye\'s run: 25 clean landings with no tricks and 9 bails of one trick each is 0 TRICKS (the card said 10)', () => {
    const l = new LandedTricks();
    for (let i = 0; i < 25; i++) l.touchdown('clean', 0);
    for (let i = 0; i < 9; i++) l.touchdown('bail', 1);
    expect(l.total).toBe(0);
  });
  it('a sketchy landing counts once its save holds, and not if the save fails', () => {
    const saved = new LandedTricks(); saved.touchdown('sketchy', 2);
    expect(saved.total).toBe(0);
    saved.saveResolved(true);
    expect(saved.total).toBe(2);
    const failed = new LandedTricks(); failed.touchdown('sketchy', 2); failed.saveResolved(false);
    expect(failed.total).toBe(0);
    const burned = new LandedTricks(); burned.touchdown('sketchy', 1); burned.touchdown('bail', 1); burned.saveResolved(true);
    expect(burned.total).toBe(0);
  });
  it('A1-06: a touchdown with a grab still held and no flip in the chain raises the count by one', () => {
    const f = popFlat(popVy(ROLLING, 0)), landed = new LandedTricks(), combo = new ComboChain(undefined, 'air');
    fly(f, 0.1); throwTrick(f.air, f.book, trick('indy')); fly(f);
    expect(f.air.state.grabHeld).toBe('indy');
    expect(f.air.state.chain.filter((t) => t.family !== 'grab')).toHaveLength(0);
    const before = landed.total;
    touchdown(f, landed, combo);
    expect(landed.total).toBe(before + 1);
  });
});

describe('SK-5: a standstill pop is a small hop; the rolling pop and big air', () => {
  it('standing still, the pop is well under the eye\'s 2.2 m / 1.3 s, charged or not', () => {
    for (const c of [0, 0.5, 1]) {
      const vy = popVy(0, c);
      expect(popHeight(vy), `charge ${c}`).toBeLessThan(0.8);
      expect(popHang(vy), `charge ${c}`).toBeLessThan(0.7);
    }
    expect(popHeight(popVy(0, 0))).toBeCloseTo(0.375, 2);
    expect(popHang(popVy(0, 0))).toBeCloseTo(0.463, 2);
    expect(popVy(0, 0.3)).toBeCloseTo(rollingPopVy(0.3) * STAND_POP_SHARE, 10);
  });
  it('rolling at POP_FULL_SPEED or faster, the pop is the owner\'s signed-off ollie, unchanged', () => {
    for (const s of [POP_FULL_SPEED, 6, 9, 16]) {
      expect(popVy(s, 0)).toBeCloseTo(6.485, 3);
      expect(popVy(s, 1)).toBeCloseTo(rollingPopVy(1), 10);
    }
    expect(popHeight(rollingPopVy(0))).toBeCloseTo(1.50, 2);
    expect(popHeight(rollingPopVy(0.5))).toBeCloseTo(2.19, 2);
    expect(popHeight(rollingPopVy(1))).toBeCloseTo(3.01, 2);
    expect(popHang(rollingPopVy(0))).toBeCloseTo(0.93, 2);
    expect(popHang(rollingPopVy(1))).toBeCloseTo(1.31, 2);
  });
  it('the pop grows with the roll and never shrinks', () => {
    let prev = 0;
    for (let s = 0; s <= 8; s += 0.25) { const v = popVy(s, 0.4); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
  });
  it('a flat ollie is never big air, however charged; air the ground fell away under is', () => {
    for (const s of [0, 2, 6]) for (const c of [0, 0.5, 1]) {
      const apex = popHeight(popVy(s, c));
      expect(isBigAir(apex, apex), `speed ${s} charge ${c}`).toBe(false);
    }
    const pop = popHeight(popVy(6, 0));
    expect(isBigAir(pop + 1.3, pop)).toBe(true);                        // off the top of the 1.3 m pyramid
    expect(isBigAir(pop + BIG_AIR_OVER_POP_M - 0.01, pop)).toBe(false);  // a kerb's worth is still an ollie
    expect(isBigAir(1.0, 0)).toBe(false);                               // nothing under the old 1.15 m floor
  });
  it('a standstill pop still fits a trick when fully crouched, and nothing but the ollie-sized ones uncharged', () => {
    expect(airTrickFor('skate', 'left', 'A', skateAirLeft(0, popVy(0, 1)))?.id).toBe('kickflip');
    expect(airTrickFor('skate', 'left', 'A', skateAirLeft(0, popVy(0, 0)))?.id).not.toBe('kickflip');
  });
});

describe('the wiring: SkateRunMode uses all of it (source scan)', () => {
  const src = readFileSync(path.join(__dirname, 'SkateRunMode.ts'), 'utf8');
  it('SK-1: every grab ends through letGoGrab, and no grab is paid on the spot as a nameless GRAB', () => {
    expect(src).not.toMatch(/combo\.add\('GRAB'/);
    expect(src.match(/air\.releaseGrab\(\)/g)).toHaveLength(1);   // inside letGoGrab only
    expect(src).toMatch(/function letGoGrab\(\): void \{\s*if \(!air\.state\.grabHeld\) return;\s*trickLayer\?\.release\(\);\s*grabs\.letGo\(air\.state\.chain, air\.releaseGrab\(\)\);/);
    expect(src).toMatch(/if \(family === 'grab' && air\.state\.airborne\) grabs\.thrown\(air\.state\.chain, \{ id, label, basePts, difficulty \}\);/);
    expect((src.match(/letGoGrab\(\)/g) ?? []).length).toBeGreaterThanOrEqual(7);   // wall, grabEnd, flick, X, touchdown, rail, a new grab
  });
  it('SK-2: the touchdown is graded by the skate grader, the grab let go before the grade, and the air left is measured', () => {
    expect(src).toMatch(/const error01 = skateLandingError01\(air\.state\);\s*[\s\S]{0,300}letGoGrab\(\);\s*const res = resolveLanding\(air, move\.balance, \{ error01,/);
    expect(src).not.toMatch(/AIR_BUDGET_SEC/);
    expect((src.match(/const a = airNow\(\);/g) ?? []).length).toBe(2);   // the button and the body
    expect(src).toMatch(/fitToAir\(\(b\) => airTrickFor\('skate', held, e\.btn as BoardTrick\['btn'\], b\), a\.budget, a\.left\)/);
    expect(src).toMatch(/fitToAir\(\(b\) => spinTrickFor\('skate', it\.dir, b\), a\.budget, a\.left\)/);
    expect(src).toMatch(/const still = !!named && named\.spinDeg === 0 && named\.flipDeg === 0 && named\.grab === 'none';/);
  });
  it('SK-3: the card reads the landed count, and the touchdown and the save feed it', () => {
    expect(src).toMatch(/tricksLanded: landed\.total \}/);
    expect(src).not.toMatch(/landedTotal/);
    expect(src).toMatch(/landed\.touchdown\(res\.grade, res\.chain\.length\)/);
    expect(src).toMatch(/landed\.saveResolved\(true\)/);
    expect(src).toMatch(/landed\.saveResolved\(false\)/);
    expect(src).toMatch(/landed\.reset\(\)/);
  });
  it('SK-5: every pop goes through popOff, and big air is judged against the pop', () => {
    expect(src.match(/rig\.rider\.jump\(/g)).toHaveLength(1);   // inside popOff only
    expect((src.match(/popOff\((?:true|!rig\.rider\.grounded)\)/g) ?? []).length).toBe(3);
    expect(src).toMatch(/rig\.rider\.vel\.y = popVy\(move\.speed, ollieCharge\(\)\);/);
    expect(src).toMatch(/if \(isBigAir\(height, popApex\)\) spectacle\(ctx, `big air/);
  });
});

