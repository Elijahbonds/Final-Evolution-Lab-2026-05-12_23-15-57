// KARATE VS (Storm Duel) — the owner-picked improvement pass (IMPROVE 2026-10-06). The pure pieces the mode now leans on
// (VersusScore, ModeClock) and the rival's resource contract are tested on their own; the mode file itself mounts Babylon,
// so its wiring is held by source pins, in this repo's usual way (reachFreeze.static, bodyFight.gate).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Vector3 } from '@babylonjs/core';
import { versusScore, versusScoreMax, versusScoreParts, VERSUS_SCORE } from '../core/VersusScore';
import { GameTimers, BannerSlot } from '../core/ModeClock';
import { RivalCombatBrain, type RivalResource } from '../core/RivalCombatBrain';
import { CHI_MAX, FighterState } from '../core/FightCore';

const DT = 1 / 60;
function withRand<T>(seed: number, run: () => T): T {
  let s = seed >>> 0;
  const prev = Math.random;
  Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  try { return run(); } finally { Math.random = prev; }
}
const SRC = readFileSync(join(__dirname, 'KarateVSMode.ts'), 'utf8');
/** The source without its comments — a pin must hold the code, not a note about it. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

describe('#11 the result score (core/VersusScore)', () => {
  it('keeps the rounds formula as its base: a bare 2–1 is still 2 × 100 − 40', () => {
    expect(versusScore({ myWins: 2, foeWins: 1, hpLeftOnWins: [0, 0], perfectDodges: 0, routes: 0 })).toBe(160);
    expect(versusScore({ myWins: 0, foeWins: 2, hpLeftOnWins: [], perfectDodges: 0, routes: 0 })).toBe(-80);
  });
  it('pays the HP kept in each round won, the perfect dodges and the routes', () => {
    const p = versusScoreParts({ myWins: 2, foeWins: 0, hpLeftOnWins: [0.5, 0.8], perfectDodges: 3, routes: 2 });
    expect(p).toEqual({ rounds: 200, hp: 13 + 20, dodges: 6, routes: 10 });
    expect(versusScore({ myWins: 2, foeWins: 0, hpLeftOnWins: [0.5, 0.8], perfectDodges: 3, routes: 2 })).toBe(249);
  });
  it('a cleaner win beats a scrappier one with the same rounds — a replay has something to beat', () => {
    const scrape = versusScore({ myWins: 2, foeWins: 1, hpLeftOnWins: [0.1, 0.05], perfectDodges: 0, routes: 0 });
    const clean = versusScore({ myWins: 2, foeWins: 1, hpLeftOnWins: [0.9, 0.7], perfectDodges: 2, routes: 1 });
    expect(clean).toBeGreaterThan(scrape);
  });
  it('every bonus is capped, so the match has an exact maximum (the server ceiling)', () => {
    const wild = versusScore({ myWins: 2, foeWins: 0, hpLeftOnWins: [9, 9, 9, 9], perfectDodges: 1e9, routes: 1e9 });
    expect(wild).toBe(versusScoreMax(2));
    expect(versusScoreMax(2)).toBe(2 * (VERSUS_SCORE.winPts + VERSUS_SCORE.hpPtsPerRoundWon) + VERSUS_SCORE.dodgeCap * VERSUS_SCORE.dodgePts + VERSUS_SCORE.routeCap * VERSUS_SCORE.routePts);
    expect(versusScoreMax(2)).toBe(300);
    // HP shares beyond the rounds won buy nothing; junk counts are zero
    expect(versusScoreParts({ myWins: 1, foeWins: 2, hpLeftOnWins: [1, 1, 1], perfectDodges: NaN, routes: -4 })).toEqual({ rounds: 20, hp: 25, dodges: 0, routes: 0 });
  });
});

describe('#6 / #20 GameTimers — hit beats on the game clock', () => {
  it('fires after its seconds of the clock it is fed — a slowed clock (hit-stop, the parry slow-mo, a pause) waits longer', () => {
    const t = new GameTimers(); let fired = 0;
    t.after(0.12, () => fired++);
    for (let i = 0; i < 7; i++) t.tick(DT);
    expect(fired).toBe(0);
    t.tick(DT);
    expect(fired).toBe(1);
    const slow = new GameTimers(); let slowFired = 0;
    slow.after(0.12, () => slowFired++);
    for (let i = 0; i < 8; i++) slow.tick(DT * 0.3);   // the parry slow-mo's scale
    expect(slowFired).toBe(0);
    for (let i = 0; i < 8; i++) slow.tick(0);           // paused: no time passes
    expect(slowFired).toBe(0);
  });
  it('clear() drops everything waiting — nothing fires on a disposed rig', () => {
    const t = new GameTimers(); let fired = 0;
    t.after(0.1, () => fired++); t.after(0.2, () => fired++);
    t.clear();
    t.tick(1);
    expect(fired).toBe(0);
    expect(t.size).toBe(0);
  });
  it('fires due callbacks oldest first, and one scheduled from a callback waits for the next tick', () => {
    const t = new GameTimers(); const order: string[] = [];
    t.after(0.05, () => { order.push('a'); t.after(0, () => order.push('c')); });
    t.after(0.05, () => order.push('b'));
    t.tick(0.1);
    expect(order).toEqual(['a', 'b']);
    t.tick(0);
    expect(order).toEqual(['a', 'b', 'c']);
  });
});

describe('#14 BannerSlot — an older banner\'s expiry never wipes a newer one', () => {
  it('the bug: a 0.9 s banner, then a 0.6 s one at 0.5 s — the first timer used to clear the second at 0.9 s', () => {
    const b = new BannerSlot();
    b.show('GUARD BREAK!', 0.9, 0);
    expect(b.tick(0.5)).toBeNull();
    b.show('COUNTER!', 0.6, 0.5);
    expect(b.tick(0.95)).toBeNull();              // past the first banner's expiry: the second stays up
    expect(b.current).toBe('COUNTER!');
    expect(b.tick(1.1)).toBe('');                  // its own expiry clears it, once
    expect(b.tick(1.2)).toBeNull();
  });
  it('Infinity holds until the next banner; clear() empties it', () => {
    const b = new BannerSlot();
    b.show('ROUND 1 — YOU', Infinity, 3);
    expect(b.tick(1e6)).toBeNull();
    b.clear();
    expect(b.current).toBe('');
  });
});

describe('#2 / #9 the rival on RivalCombatBrain, with the resource Karate VS hands it', () => {
  const kvsResource = (chi: number, canDragon: boolean): RivalResource => ({ value: chi, max: canDragon ? CHI_MAX : Infinity, dashCost: 12, subCost: Infinity, subReady: false });

  it('a rival that cannot throw the DRAGON keeps its whole mix at a full chi bar (it threw only heavies)', () => {
    const kinds = withRand(7, () => {
      const brain = new RivalCombatBrain({ difficulty: 0.72, canSpecial: false });
      const st = new FighterState(100); st.chi = CHI_MAX;
      const seen = new Set<string>();
      const self = new Vector3(0, 0, 0), foe = new Vector3(0, 0, 1.5);
      for (let f = 0; f < 60 * 40; f++) {
        const d = brain.decide(DT, self, foe, st, false, kvsResource(st.chi, false), -1, false);
        if (d.attack) seen.add(d.attack);
        expect(d.spend).not.toBe('ultimate');
      }
      return seen;
    });
    expect(kinds.has('jab') || kinds.has('kick')).toBe(true);
  });
  it('control: the same rival handed a fillable bar does spend it on the ultimate (so the Infinity max is what holds)', () => {
    const ults = withRand(7, () => {
      const brain = new RivalCombatBrain({ difficulty: 0.72, canSpecial: true });
      const st = new FighterState(100); st.chi = CHI_MAX;
      let n = 0;
      for (let f = 0; f < 60 * 40; f++) if (brain.decide(DT, new Vector3(0, 0, 0), new Vector3(0, 0, 1.5), st, false, kvsResource(st.chi, true), -1, false).spend === 'ultimate') n++;
      return n;
    });
    expect(ults).toBeGreaterThan(0);
  });
  it('it dashes in when far out and can pay, and never substitutes (Karate VS has none)', () => {
    const r = withRand(3, () => {
      const brain = new RivalCombatBrain({ difficulty: 0.72, canSpecial: false });
      const st = new FighterState(100); st.chi = 40;
      let dash = 0, sub = 0, broke = 0;
      for (let f = 0; f < 240; f++) {
        const d = brain.decide(DT, new Vector3(0, 0, 0), new Vector3(0, 0, 4.5), st, false, kvsResource(st.chi, false), 0.1, false);
        if (d.spend === 'dash') dash++;
        if (d.spend === 'substitution') sub++;
      }
      const poor = new RivalCombatBrain({ difficulty: 0.72, canSpecial: false });
      for (let f = 0; f < 240; f++) if (poor.decide(DT, new Vector3(0, 0, 0), new Vector3(0, 0, 4.5), new FighterState(100), false, kvsResource(0, false), -1, false).spend === 'dash') broke++;
      return { dash, sub, broke };
    });
    expect(r.dash).toBeGreaterThan(0);
    expect(r.sub).toBe(0);
    expect(r.broke).toBe(0);
  });
});

describe('the mode wiring (source pins)', () => {
  it('#6 / #20 no wall-clock timers left in the mode: hit beats, banners and the round beats are on the game clock', () => {
    expect(CODE).not.toMatch(/\bsetTimeout\s*\(/);
    expect(CODE).toContain('meTimers.after(hitDelay / 1000');
    expect(CODE).toContain('meTimers.tick(sdtHero); foeTimers.tick(sdtRoom);');
    expect(CODE).toMatch(/dispose\(\) \{[\s\S]*meTimers\.clear\(\); foeTimers\.clear\(\); knock\.clear\(\)/);
  });
  it('#5 the parry slow-mo reaches the rigs\' clocks (Focus × slow-mo)', () => {
    expect(CODE).toContain('rival?.animator.setTimeScale(focus.worldScale * k); player?.animator.setTimeScale(focus.heroScale * k);');
    expect(CODE).toContain('if (wasFocus !== focus.active || slowmoOn !== slowmoSec > 0) applyTimeScales();');
  });
  it('#8 the neutral roll goes away from the rival, not along the camera forward', () => {
    expect(CODE).toContain(': neutralRollDir(ctx);');
    expect(CODE).not.toContain('ctx.camDirector.forwardFlat().scale(1)');
    expect(CODE).toMatch(/function neutralRollDir[\s\S]*?player\.root\.position\.x - rival\.root\.position\.x/);
  });
  it('#9 the rival is the shared RivalCombatBrain and its chi pays for a dash', () => {
    expect(CODE).not.toMatch(/new RivalFightBrain\(/);
    expect(CODE).toContain('new RivalCombatBrain(');
    expect(CODE).toContain("action.spend === 'dash'");
    expect(CODE).toContain('foeState.chi -= RIVAL_DASH_CHI');
    expect(CODE).toContain("foeResource.max = hasFightMove('dragon', foeRatings) ? CHI_MAX : Infinity;");
  });
  it('#10 / #13 a visible round clock, TIME at the bell, and a FIGHT! beat at every round start', () => {
    expect(CODE).toContain("endRound(ctx, meState.hp >= foeState.hp, 'TIME')");
    expect(CODE).toContain('ctx.setHud({ timeLeft: left })');
    expect(CODE).toContain("setPhase('ready')");
    expect(CODE).toContain("if (phase === 'ready' && phaseSec >= READY_SEC) fight(ctx);");
    expect(CODE).toContain("banner(ctx, 'FIGHT!'");
  });
  it('#12 one static hint that names every verb', () => {
    const m = SRC.match(/export const KVS_HINT = '([^']+)';/);
    expect(m).not.toBeNull();
    for (const verb of ['jab', 'kick', 'heavy', 'guard', 'parry', 'dash', 'roll', 'jump', 'Focus', 'wall run', 'DRAGON']) expect(m![1]).toContain(verb);
    expect(CODE.match(/hint: /g)?.length).toBe(2);
    expect(CODE.match(/hint: KVS_HINT/g)?.length).toBe(2);
  });
  it('#15 / #16 the posture runs on the real dt, and the guard trickle pushes only a change', () => {
    expect(CODE).not.toContain('const dt = 1 / 60;');
    expect(CODE).toContain('if (g !== guardHud || fg !== foeGuardHud)');
  });
  it('#19 a phone gets the smaller crowd', () => {
    expect(CODE).toContain("ctx.scene.metadata?.felTier === 'mobile' ? spots.filter((_, i) => i % 4 === 0).slice(0, KVS_PHONE_ONLOOKERS) : spots");
  });
});
