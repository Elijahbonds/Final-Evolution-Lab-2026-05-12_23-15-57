// MIXED COMBAT (Ring's Edge) — the owner-picked improvement pass (IMPROVE 2026-10-06). The pure pieces the mode now leans
// on (modes/mixedRules) and the rival's DRAGON licence are tested on their own; the mode file itself mounts Babylon, so its
// wiring is held by source pins, in this repo's usual way (KarateVSMode.improve, reachFreeze.static, bodyFight.gate).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dragonLicensed, fallStep, FALL, neutralRollDir, onlookerSpots, PHONE_ONLOOKERS } from './mixedRules';
import { mixedScore, mixedScoreMax, MIXED_SCORE } from '../core/MixedScore';
import { BASELINE_RATINGS, hasFightMove, ratingsForBand } from '../core/FighterStyle';
import { CHI_MAX, FighterState, RivalFightBrain, STAFF_ATTACKS } from '../core/FightCore';
import { counterMult, dodgeReward } from '../core/DodgeRead';

const DT = 1 / 60;
function withRand<T>(seed: number, run: () => T): T {
  let s = seed >>> 0;
  const prev = Math.random;
  Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  try { return run(); } finally { Math.random = prev; }
}
const SRC = readFileSync(join(__dirname, 'MixedCombatMode.ts'), 'utf8');
/** The source without its comments — a pin must hold the code, not a note about it. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
/** The body of a named function in the mode (up to the next top-level-ish `function `). */
const fn = (name: string): string => {
  const at = CODE.indexOf(`function ${name}(`);
  expect(at, name).toBeGreaterThan(-1);
  const next = CODE.indexOf('\n  function ', at + 10);
  return CODE.slice(at, next > 0 ? next : undefined);
};

describe('#13 the result score (core/MixedScore)', () => {
  it('keeps the rounds formula as its base: a bare 2–1 is still 2 × 100 − 40', () => {
    expect(mixedScore({ myWins: 2, foeWins: 1, ringOutWins: 0 })).toBe(160);
    expect(mixedScore({ myWins: 0, foeWins: 2, ringOutWins: 0 })).toBe(-80);
  });
  it('a round won by a ring-out pays on top — and only a WON round can', () => {
    expect(mixedScore({ myWins: 2, foeWins: 1, ringOutWins: 1 })).toBe(160 + MIXED_SCORE.ringOutPts);
    expect(mixedScore({ myWins: 1, foeWins: 2, ringOutWins: 3 })).toBe(100 - 80 + MIXED_SCORE.ringOutPts);
  });
  it('has an exact maximum, the server ceiling: a sweep, every round a ring-out (200 → 250)', () => {
    expect(mixedScore({ myWins: 2, foeWins: 0, ringOutWins: 1e9 })).toBe(mixedScoreMax(2));
    expect(mixedScoreMax(2)).toBe(250);
    expect(mixedScore({ myWins: NaN, foeWins: -3, ringOutWins: Infinity })).toBe(0);
  });
});

describe('#5 / #6 the DRAGON is the pit\'s', () => {
  it('a full bar licenses it here for every body — the baseline, a guest, PRIMED — while the game-wide force gate is untouched', () => {
    for (const r of [BASELINE_RATINGS, ratingsForBand(null), ratingsForBand('PRIMED'), ratingsForBand('ELITE')]) expect(dragonLicensed(r)).toBe(true);
    expect(hasFightMove('dragon', BASELINE_RATINGS)).toBe(false);   // Karate VS still reads FighterStyle's rule
    expect(hasFightMove('dragon', ratingsForBand('PRIMED'))).toBe(false);
  });
  it('the rival at full chi with the licence swings the heavy the mode turns into the DRAGON (its bar empties); a rival told it cannot never locks onto heavies', () => {
    const swingsAtFull = (canSpecial: boolean) => withRand(7, () => {
      const b = new RivalFightBrain(0.68, STAFF_ATTACKS); b.setCanSpecial(canSpecial);
      const s = new FighterState(100); s.chi = CHI_MAX;
      const got: string[] = [];
      for (let i = 0; i < 60 * 30 && got.length < 12; i++) { const a = b.decide(DT, { x: 0, z: 0 }, { x: 0, z: 1.6 }, s, false); if (a.attack) got.push(a.attack); }
      return got;
    });
    const licensed = swingsAtFull(dragonLicensed(BASELINE_RATINGS));
    expect(licensed.length).toBeGreaterThan(3);
    expect(licensed.every((k) => k === 'heavy')).toBe(true);
    // the control: the same brain without the licence mixes its strikes (the stack's setCanSpecial(false))
    const unlicensed = swingsAtFull(false);
    expect(new Set(unlicensed).size).toBeGreaterThan(1);
  });
  it('the mode spends the bar on the swing and wires the licence for both fighters', () => {
    expect(CODE).toContain("const special = !body && key === 'heavy' && atkState.chi >= CHI_MAX && dragonLicensed(mine ? myRatings : foeRatings);");
    expect(CODE).toContain('brain.setCanSpecial(dragonLicensed(foeRatings));');
    expect(CODE).toMatch(/if \(special\) \{\s*atkState\.chi = 0;/);
    expect(CODE).not.toContain("hasFightMove('dragon'");
    expect(CODE).toContain("ctx.setHud({ dragonReady: ready })");
  });
});

describe('#9 the ring-out fall runs on the clock it is handed', () => {
  it('one second falls the same at 60 Hz and at 120 Hz (it was 0.14 m per render)', () => {
    let a = 0, b = 0;
    for (let i = 0; i < 60; i++) a = fallStep(a, 1 / 60).y;
    for (let i = 0; i < 120; i++) b = fallStep(b, 1 / 120).y;
    expect(a).toBeCloseTo(-FALL.mps, 6);
    expect(b).toBeCloseTo(a, 6);
    expect(FALL.mps).toBeCloseTo(0.14 * 60, 6);   // the old 60 Hz look, kept
  });
  it('stops at the pit floor, and the mode has no render observer left', () => {
    expect(fallStep(-5.4, 0.1).falling).toBe(false);
    expect(fallStep(-1, 0.1).falling).toBe(true);
    expect(CODE).not.toContain('onBeforeRenderObservable');
    expect(CODE).toContain('fallStep(fallBody.root.position.y, dt)');
  });
});

describe('#8 the neutral roll goes away from the rival', () => {
  it('rolls straight away from him — the opposite of the fight camera\'s forward, which looks at him', () => {
    const me = { x: 0, z: 2 }, foe = { x: 0, z: -2 };
    const camForward = { x: 0, z: -1 };   // behind me, looking at the rival
    const d = neutralRollDir(me, foe, camForward);
    expect(d.x).toBeCloseTo(0, 6); expect(d.z).toBeCloseTo(1, 6);
    expect(d.x * camForward.x + d.z * camForward.z).toBeLessThan(0);
    const diag = neutralRollDir({ x: 3, z: 3 }, { x: 0, z: 0 }, camForward);
    expect(Math.hypot(diag.x, diag.z)).toBeCloseTo(1, 6); expect(diag.x).toBeGreaterThan(0); expect(diag.z).toBeGreaterThan(0);
  });
  it('on one spot it falls back to the camera\'s back, and the mode uses it for the neutral stick', () => {
    const back = neutralRollDir({ x: 1, z: 1 }, { x: 1, z: 1 }, { x: 0, z: -1 });
    expect(back.x).toBeCloseTo(0, 6); expect(back.z).toBeCloseTo(1, 6);
    expect(CODE).toContain(': neutralRollDir(player.root.position, rival.root.position, ctx.camDirector.forwardFlat());');
    expect(CODE).not.toContain(': ctx.camDirector.forwardFlat().scale(1);');
  });
});

describe('#20 the crowd on a phone', () => {
  it('a phone gets four rigs (every fourth spot), a desktop keeps the ring', () => {
    const spots = Array.from({ length: 14 }, (_, i) => i);
    expect(onlookerSpots(spots, true)).toEqual([0, 4, 8, 12]);
    expect(onlookerSpots(spots, true).length).toBeLessThanOrEqual(PHONE_ONLOOKERS);
    expect(onlookerSpots(spots, false)).toEqual(spots);
    expect(CODE).toContain("ctx.scene.metadata?.felTier === 'mobile'");
  });
});

describe('#3 the perfect-dodge counter pays out', () => {
  it('a perfect dodge opens a counter window worth more than 1x (DodgeRead), and the hit branch spends it', () => {
    const r = dodgeReward(0.05);
    expect(r.perfect).toBe(true);
    expect(counterMult(r.counterSec)).toBeGreaterThan(1);
    expect(counterMult(0)).toBe(1);
    const hit = CODE.slice(CODE.indexOf("case 'hit': {"));
    expect(hit).toMatch(/const counter = mine \? counterMult\(meCounter\) : 1;\s*const base = applyHit\(atkState, defState, atk\);/);
    expect(hit).toContain('meCounter = 0; defState.hp = Math.max(0, defState.hp - (Math.round(base * counter) - base));');
  });
});

describe('the mode\'s wiring (source pins)', () => {
  it('#1 the loadout pick is kept: applyLoadouts never re-reads the start-up screen, and a pick in the loadout phase wins', () => {
    const apply = fn('applyLoadouts');
    expect(apply).not.toMatch(/readWeapon|startPick|myLoadout = [^=]/);
    expect(CODE).toContain('myLoadout = startPick(); startPickSeeded = false;');
    expect(CODE).toContain("if (!startPickSeeded) { startPickSeeded = true; if (phase === 'loadout' && round === 1) setLoadout(ctx, startPick()); }");
    expect((CODE.match(/startPickSeeded = true;/g) ?? []).length).toBeGreaterThanOrEqual(3);   // the first frame, the d-pad, the stick
  });
  it('#2 the rebuilt brain is told the round and the standing (no change needed: 7784cfb6)', () => {
    const apply = fn('applyLoadouts');
    const built = apply.indexOf('brain = new RivalFightBrain(');
    expect(built).toBeGreaterThan(-1);
    expect(apply.indexOf('brain.setRound(round)')).toBeGreaterThan(built);
    expect(apply.indexOf('brain.setStanding(foeWins, myWins, ROUNDS_TO_WIN)')).toBeGreaterThan(built);
  });
  it('#10 the parry slow-mo slows both rigs (Focus × slow-mo), and ends with the round', () => {
    expect(fn('applyTimeScales')).toContain('const k = slowmoOn ? SLOWMO_SCALE : 1;');
    expect(CODE).toContain('if (wasFocus !== focus.active || slowmoOn !== slowmoSec > 0) applyTimeScales();');
    expect(fn('endRound')).toContain('slowmoSec = 0; applyTimeScales();');
  });
  it('#11 / #20 nothing waits on the wall clock: my hit beat on my clock, the round beat and the banners on the mode\'s', () => {
    expect(CODE).not.toContain('setTimeout(');
    expect(CODE).toContain('if (mine) meTimers.after(hitDelay / 1000, () => onHitBeat()); else foeTimers.after(atk.startupMs / 1000, () => onHitBeat());');
    expect(CODE).toContain('meTimers.tick(sdtHero); foeTimers.tick(sdtRoom);');
    expect(CODE).toContain("if (phase === 'roundOver' && phaseSec >= ROUND_OVER_SEC) { afterRound(ctx); return; }");
    const dispose = CODE.slice(CODE.indexOf('dispose() {'));
    expect(dispose).toContain('meTimers.clear(); foeTimers.clear(); bannerSlot.clear(); knock.clear();');
  });
  it('#12 / #16 one staff per fighter and ONE material for the match, shown while the loadout is picked', () => {
    expect((CODE.match(/new StandardMaterial/g) ?? []).length).toBe(1);
    expect(fn('makeStaff')).toContain('if (!staffMat)');
    expect(fn('enterLoadout')).toContain('showLoadoutProps();');
    expect(fn('setLoadout')).toContain('showLoadoutProps();');
    expect(fn('applyLoadouts')).not.toMatch(/makeStaff|\.dispose\(\)/);
    expect(CODE).toContain('staffMat?.dispose(); staffMat = null;');
  });
  it('#14 the posture trackers run on the frame\'s dt', () => {
    expect(fn('animate')).not.toContain('1 / 60');
    expect(CODE).not.toMatch(/animate\(0, 0\)/);
  });
  it('#17 the venue handle is kept and disposed', () => {
    expect(CODE).toContain("modeVenue = mountVenue(ctx, 'karate_h2h'");
    expect(CODE).toContain('modeVenue?.dispose(); modeVenue = null;');
  });
  it('#18 / #19 the per-frame trickle pushes only changes, and the frame builds no vectors', () => {
    expect(CODE).toContain('if (g !== guardHud || fg !== foeGuardHud || edge !== edgeHud)');
    expect(CODE).not.toContain('ctx.setHud({ guard: Math.round(meState.guard), foeGuard: Math.round(foeState.guard), edge });');
    const update = CODE.slice(CODE.indexOf('update(ctx: ModeContext, dt: number) {'), CODE.indexOf('dispose() {'));
    expect(update).not.toMatch(/new Vector3|\.clone\(\)|Vector3\.Zero\(\)|\.subtract\(/);
    expect(fn('treeInput')).not.toMatch(/\.subtract\(|\.normalize\(\)/);
  });
});
