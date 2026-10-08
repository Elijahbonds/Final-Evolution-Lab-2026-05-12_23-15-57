// THE SHARED COMBAT STACK PASS (IMPROVE 2026-10-06) — one test per owner-picked item that changed shared code.
// Every brain test seeds Math.random (the brain rolls its attack bias at construction), so each run is reproducible.

import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import {
  CHI_MAX, FighterState, KARATE_ATTACKS, PARRY_WINDOW_MS, RivalFightBrain, resolveStrike,
  guardPressMs, rivalDifficulty, RIVAL_TIER_OFFSET,
} from './FightCore';
import { RivalCombatBrain, SUB_READ_CAP, type RivalMoveSpec, type RivalResource } from './RivalCombatBrain';
import { DefenseController, applyDefenseOutcome, COUNTER_DAMAGE_MULT, GUARD_IMPACT_WINDOW_MS, SUBSTITUTION_VULN_SEC } from './DefenseSystem';
import { dashSecToImpact, dodgeReward } from './DodgeRead';
import { DASH, stormDashReady } from './StormCombat';
import { ratingsForBand, hasFightMove, BASELINE_RATING } from './FighterStyle';
import { nerve, standingOf } from './Nerve';
import { KnockSlides, makeChestOf, CHEST_Y, KNOCK_SPEED } from './FightKit';
import { mergeHud } from './hudMerge';

const DT = 1 / 60;

function withRand<T>(seed: number, run: () => T): T {
  let s = seed >>> 0;
  const prev = Math.random;
  Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  try { return run(); } finally { Math.random = prev; }
}
function constRand<T>(v: number, run: () => T): T {
  const prev = Math.random;
  Math.random = () => v;
  try { return run(); } finally { Math.random = prev; }
}

describe('#1 an undefended blow in range lands; out of reach is a whiff', () => {
  it('resolve tells the two apart and applyDefenseOutcome maps them', () => {
    const dc = new DefenseController();
    const atk = KARATE_ATTACKS.kick;
    expect(dc.resolve(atk, atk.range - 0.1, false, 10_000)).toBe('none');
    expect(dc.resolve(atk, atk.range + 0.1, false, 10_000)).toBe('outOfRange');
    expect(applyDefenseOutcome('none', new FighterState(), new FighterState(), atk)).toBe('hit');
    expect(applyDefenseOutcome('outOfRange', new FighterState(), new FighterState(), atk)).toBe('whiff');
  });
});

describe('#14 a substitution opens a real punish window', () => {
  it('counterMult is the counter multiplier inside the vulnerability, 1 outside', () => {
    const dc = new DefenseController();
    expect(dc.counterMult(10_000)).toBe(1);
    dc.spendSubstitution(10_000);
    expect(dc.counterMult(10_000 + 1)).toBe(COUNTER_DAMAGE_MULT);
    expect(dc.counterMult(10_000 + SUBSTITUTION_VULN_SEC * 1000 + 1)).toBe(1);
  });
});

const MOVES: RivalMoveSpec[] = [
  { id: 'jab', kind: 'jab', range: 1.6 },
  { id: 'cross', kind: 'jab', range: 1.6 },
  { id: 'kick', kind: 'kick', range: 1.9 },
  { id: 'heavy', kind: 'heavy', range: 2.6 },
];
const RES = (over: Partial<RivalResource> = {}): RivalResource => ({ value: 60, max: CHI_MAX, dashCost: 12, subCost: 25, ...over });

describe('#2 the rival substitution is a read, not a reflex', () => {
  const run = (rng: () => number, res: RivalResource, frames = 12) => withRand(3, () => {
    const brain = new RivalCombatBrain({ difficulty: 0.72, moves: MOVES, rng });
    const self = new Vector3(0, 0, 1.2), foe = new Vector3(0, 0, 0), st = new FighterState();
    let subs = 0;
    for (let f = 0; f < frames; f++) {
      const d = brain.decide(DT, self, foe, st, true, res, 0.3 - f * DT * 0.5);   // one swing in flight the whole time
      if (d.spend === 'substitution') subs++;
    }
    return subs;
  });
  it('fires on a lucky read, once per swing — not every frame of it', () => {
    expect(run(() => 0, RES())).toBe(1);
  });
  it('misses an unlucky read entirely (it used to fire on every affordable threat)', () => {
    expect(run(() => SUB_READ_CAP + 0.01, RES())).toBe(0);
  });
  it('respects the defender cooldown the mode passes', () => {
    expect(run(() => 0, RES({ subReady: false }))).toBe(0);
  });
  it('the read is skill-scaled and capped', () => {
    let hits = 0; const N = 400;
    for (let i = 0; i < N; i++) {
      let s = (i * 2654435761) >>> 0;
      const rng = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
      if (run(rng, RES(), 2) > 0) hits++;
    }
    const rate = hits / N;
    expect(rate).toBeGreaterThan(0.25);
    expect(rate).toBeLessThan(0.48);   // 0.72 × 0.5 = 0.36
  });
});

describe('#3 the move order is a weighted pick without repeats', () => {
  it('never throws the same move twice in a row when its kind has another', () => {
    let s = 7;
    const rng = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const ids: string[] = [];
    withRand(11, () => {
      // (karate_vs pass, 2026-10-06: built INSIDE the seed — the brain rolls its attack bias at construction, and on the real
      // Math.random this test failed now and then)
      const brain = new RivalCombatBrain({ difficulty: 0.9, moves: MOVES, rng });
      const self = new Vector3(0, 0, 1.0), foe = new Vector3(0, 0, 0), st = new FighterState();
      for (let f = 0; f < 60 * 60; f++) { const d = brain.decide(DT, self, foe, st, false); if (d.attackId) ids.push(d.attackId); }
    });
    const jabs = ids.filter((i) => i === 'jab' || i === 'cross');
    expect(jabs.length).toBeGreaterThan(10);
    for (let i = 1; i < jabs.length; i++) expect(jabs[i]).not.toBe(jabs[i - 1]);
  });
  it('honours weights inside a kind', () => {
    const moves: RivalMoveSpec[] = [
      { id: 'a', kind: 'jab', range: 1.6, weight: 3 }, { id: 'b', kind: 'jab', range: 1.6, weight: 1 }, { id: 'c', kind: 'jab', range: 1.6, weight: 1 },
      { id: 'kick', kind: 'kick', range: 1.9 }, { id: 'heavy', kind: 'heavy', range: 1.8 },
    ];
    let s = 99;
    const rng = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const brain = new RivalCombatBrain({ difficulty: 0.9, moves, rng });
    const count: Record<string, number> = { a: 0, b: 0, c: 0 };
    withRand(5, () => {
      const self = new Vector3(0, 0, 1.0), foe = new Vector3(0, 0, 0), st = new FighterState();
      for (let f = 0; f < 60 * 400; f++) { const d = brain.decide(DT, self, foe, st, false); if (d.attackId && d.attackId in count) count[d.attackId]++; }
    });
    expect(count.a).toBeGreaterThan(count.b);
    expect(count.a).toBeGreaterThan(count.c);
  });
});

describe('#4 spacing reads the rival’s reach, not its last swing', () => {
  it('a jab does not shrink the distance it dashes from', () => {
    withRand(21, () => {
      const brain = new RivalCombatBrain({ difficulty: 0.9, moves: MOVES, rng: () => 0.5 });
      const foe = new Vector3(0, 0, 0), st = new FighterState();
      // throw swings in range until a jab-kind move has been the last one
      let lastJab = false;
      for (let f = 0; f < 60 * 30 && !lastJab; f++) {
        const d = brain.decide(DT, new Vector3(0, 0, 1.2), foe, st, false);
        if (d.attackId) lastJab = d.attack === 'jab';
      }
      expect(lastJab).toBe(true);
      expect(brain.lastRange).toBe(1.6);
      // 3.4 m: past jab range + 1.2 (the old trigger, 2.8) but inside reach + 1.2 (3.8) — no dash now
      let dashed = false;
      for (let f = 0; f < 120; f++) if (brain.decide(DT, new Vector3(0, 0, 3.4), foe, st, false, RES({ value: 100 })).spend === 'dash') dashed = true;
      expect(dashed).toBe(false);
      for (let f = 0; f < 120 && !dashed; f++) if (brain.decide(DT, new Vector3(0, 0, 4.2), foe, st, false, RES({ value: 100 })).spend === 'dash') dashed = true;
      expect(dashed).toBe(true);
    });
  });
});

describe('#5 a full chi bar only locks onto heavies when the special is licensed', () => {
  const mix = (canSpecial: boolean) => withRand(13, () => {
    const brain = new RivalFightBrain(0.9);
    brain.setCanSpecial(canSpecial);
    const st = new FighterState(); st.chi = CHI_MAX;
    const kinds = new Set<string>();
    for (let f = 0; f < 60 * 60; f++) { const a = brain.decide(DT, new Vector3(0, 0, 1.0), new Vector3(0, 0, 0), st, false); if (a.attack) kinds.add(a.attack); }
    return kinds;
  });
  it('licensed: heavy only (the mode upgrades it); not licensed: the normal mix', () => {
    expect([...mix(true)]).toEqual(['heavy']);
    expect(mix(false).size).toBeGreaterThanOrEqual(2);
  });
});

describe('#6/#8 the brain says block or parry, and the press stamp means it', () => {
  it('guardPressMs: a block is never a parry; a parry/impact lands inside its window', () => {
    const now = 10_000;
    const atk = KARATE_ATTACKS.jab;
    for (const impactIn of [60, 120, 180, 260]) {
      const blockSt = new FighterState(); blockSt.pressBlock(guardPressMs(now, 'block', impactIn));
      expect(resolveStrike(atk, 1, blockSt, now + impactIn)).toBe('blocked');
      const parrySt = new FighterState(); parrySt.pressBlock(guardPressMs(now, 'parry', impactIn));
      expect(resolveStrike(atk, 1, parrySt, now + impactIn)).toBe('parried');
      const dc = new DefenseController(); dc.pressBlock(guardPressMs(now, 'impact', impactIn), true);
      expect(dc.resolve(atk, 1, true, now + impactIn)).toBe('guardImpacted');
    }
    // unknown impact time: stamped now (the karate modes' old stamp)
    expect(guardPressMs(now, 'parry', null)).toBe(now);
    expect(guardPressMs(now, 'block')).toBeLessThan(now - PARRY_WINDOW_MS);
    expect(GUARD_IMPACT_WINDOW_MS).toBe(90);   // FightCore's private copy of the window must agree
  });
  it('a reading rival sometimes parries and mostly blocks; the intent rides on the action', () => {
    const tally = { block: 0, parry: 0 };
    for (let i = 0; i < 1500; i++) {
      withRand((i * 2654435761) >>> 0, () => {
        const brain = new RivalFightBrain(0.72);
        for (let f = 0; f < 11; f++) {
          const a = brain.decide(DT, new Vector3(0, 0, 0), new Vector3(0, 0, 1.5), new FighterState(), true);
          if (a.block) { tally[a.guard as 'block' | 'parry']++; break; }
        }
      });
    }
    const parryShare = tally.parry / (tally.parry + tally.block);
    expect(parryShare).toBeGreaterThan(0.2);
    expect(parryShare).toBeLessThan(0.45);   // 0.45 × 0.72 = 0.32
  });
  it('a skilled RivalCombatBrain turns some parries into guard impacts', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 600; i++) {
      withRand((i * 40503) >>> 0, () => {
        const brain = new RivalCombatBrain({ difficulty: 0.9, moves: MOVES });
        for (let f = 0; f < 11; f++) {
          const d = brain.decide(DT, new Vector3(0, 0, 0), new Vector3(0, 0, 1.5), new FighterState(), true);
          if (d.block) { seen.add(d.guard!); break; }
        }
      });
    }
    expect(seen).toEqual(new Set(['block', 'parry', 'impact']));
  });
});

describe('#7 the brain respects the arena edge', () => {
  // a disc of radius 5; the foe stands 0.9 m inside the rival, toward the centre, and mashes — backing off to its
  // spacing (≈1.6 m) would put the rival past the rim
  const R = 5;
  const edgeIn = (x: number, z: number) => R - Math.hypot(x, z);
  const minInside = (withEdge: boolean, seed: number) => withRand(seed, () => {
    const brain = new RivalFightBrain(0.6);
    if (withEdge) brain.setEdge(edgeIn);
    const self = new Vector3(4.4, 0, 0), foe = new Vector3(3.5, 0, 0), st = new FighterState();
    let worst = Infinity;
    for (let f = 0; f < 60 * 6; f++) {
      const mashing = (f % 30) < 8;   // a swing every half second: the "back off from a mash" branch
      const a = brain.decide(DT, self, foe, st, mashing);
      if (!a.block && !a.attack) { self.x += a.moveX * 3.2 * DT; self.z += -a.moveY * 3.2 * DT; }
      worst = Math.min(worst, edgeIn(self.x, self.z));
    }
    return worst;
  });
  it('without an edge it backs off the drop (the control); with one it keeps its floor', () => {
    let controlFell = 0, kept = 0;
    for (let seed = 1; seed <= 12; seed++) {
      if (minInside(false, seed) < 0) controlFell++;
      if (minInside(true, seed) > 0.3) kept++;
    }
    expect(controlFell).toBeGreaterThan(6);
    expect(kept).toBe(12);
  });
});

describe('#9 the brain punishes an opening', () => {
  const firstAttackFrame = (open: boolean) => constRand(0.0, () => {
    const brain = new RivalFightBrain(0.72);
    const st = new FighterState();
    for (let f = 0; f < 50; f++) {
      const a = brain.decide(DT, new Vector3(0, 0, 0), new Vector3(0, 0, 1.4), st, false, open && f >= 2);
      if (a.attack) return f;
    }
    return -1;
  });
  it('a read opening is punished at once; with nothing open it waits out its cooldown (1.2 s)', () => {
    expect(firstAttackFrame(false)).toBe(-1);
    const f = firstAttackFrame(true);
    expect(f).toBeGreaterThanOrEqual(2);
    expect(f).toBeLessThanOrEqual(3);
  });
  it('rolls once per opening, not once per frame', () => {
    let rolls = 0;
    const prev = Math.random;
    Math.random = () => { rolls++; return 0.99; };
    try {
      const brain = new RivalFightBrain(0.72);
      const before = rolls;
      for (let f = 0; f < 30; f++) brain.decide(DT, new Vector3(0, 0, 0), new Vector3(0, 0, 1.4), new FighterState(), false, true);
      expect(rolls - before).toBe(1);
    } finally { Math.random = prev; }
  });
});

describe('#10 the difficulty pick reaches the duel', () => {
  it('PRO is the tuned base exactly; rookie and elite move it and stay bounded', () => {
    for (const base of [0.68, 0.72]) {
      expect(rivalDifficulty(base, 'pro')).toBe(base);
      expect(rivalDifficulty(base, null)).toBe(base);
      expect(rivalDifficulty(base, 'rookie')).toBeCloseTo(base + RIVAL_TIER_OFFSET.rookie, 9);
      expect(rivalDifficulty(base, 'elite')).toBeCloseTo(base + RIVAL_TIER_OFFSET.elite, 9);
      expect(rivalDifficulty(base, 'rookie')).toBeLessThan(rivalDifficulty(base, 'elite'));
    }
  });
  it('setDifficulty changes how often it swings', () => {
    const swings = (d: number) => withRand(4, () => {
      const brain = new RivalFightBrain(0.72); brain.setDifficulty(d);
      let n = 0;
      for (let f = 0; f < 60 * 30; f++) if (brain.decide(DT, new Vector3(0, 0, 1.2), new Vector3(0, 0, 0), new FighterState(), false).attack) n++;
      return n;
    });
    expect(swings(0.5)).toBeLessThan(swings(0.84));
  });
});

describe('#11 the DRAGON can be earned', () => {
  it('a guest, READY and RECOVERING fight at the baseline; PRIMED earns the evade; ELITE the DRAGON', () => {
    for (const band of [null, undefined, 'READY', 'RECOVERING'] as const) {
      const r = ratingsForBand(band);
      expect(r.force).toBeCloseTo(BASELINE_RATING, 6);
      expect(hasFightMove('dragon', r)).toBe(false);
    }
    expect(hasFightMove('evade', ratingsForBand('PRIMED'))).toBe(true);
    expect(hasFightMove('dragon', ratingsForBand('PRIMED'))).toBe(false);
    expect(hasFightMove('dragon', ratingsForBand('ELITE'))).toBe(true);
  });
});

describe('#12 the Storm dash has a cooldown', () => {
  it('refuses a second dash inside the cooldown, never the chakra dash that upgrades the first', () => {
    expect(stormDashReady(-1e9, 0)).toBe(true);
    expect(stormDashReady(10, 10 + DASH.cooldownSec - 0.01)).toBe(false);
    expect(stormDashReady(10, 10 + DASH.cooldownSec)).toBe(true);
    expect(stormDashReady(10, 10 + DASH.doubleSec - 0.01, true)).toBe(true);
    expect(stormDashReady(10, 10 + DASH.doubleSec + 0.05, true)).toBe(false);
    expect(DASH.cooldownSec).toBe(0.55);
  });
});

describe('#13 a dash i-frame whiff is perfect only when the dash read the swing', () => {
  it('measured from the dash start; a dash already running when he swung reads nothing', () => {
    expect(dodgeReward(dashSecToImpact(1000, 950, 1100)).perfect).toBe(true);    // dashed 50 ms into his wind-up
    expect(dashSecToImpact(1000, 950, 1100)).toBeCloseTo(0.1, 9);
    expect(dodgeReward(dashSecToImpact(900, 950, 1100)).perfect).toBe(false);   // dashed before he swung
    expect(dashSecToImpact(900, 950, 1100)).toBeNull();
    expect(dodgeReward(dashSecToImpact(1000, 1000, 1300)).perfect).toBe(false); // 300 ms early: outside the window
  });
});

describe('#15 nerve is set once, from the standing', () => {
  it('setStanding applies nerve() of the standing and is memoised', () => {
    const brain = new RivalFightBrain(0.72);
    const a = brain.setStanding(0, 1, 2);
    expect(a).toEqual(nerve(standingOf(0, 1, 2, 0.5)));
    expect(brain.setStanding(0, 1, 2)).toBe(a);                     // same object: nothing recomputed
    expect(brain.setStanding(1, 1, 2)).toEqual(nerve(standingOf(1, 1, 2, 0.5)));
  });
});

describe('#16 the brains do not allocate an action per frame', () => {
  it('decide() hands back the same object every call', () => {
    withRand(1, () => {
      const inner = new RivalFightBrain(0.72);
      const s = new FighterState();
      const a1 = inner.decide(DT, new Vector3(0, 0, 3), new Vector3(0, 0, 0), s, false);
      const a2 = inner.decide(DT, new Vector3(0, 0, 3), new Vector3(0, 0, 0), s, false);
      expect(a2).toBe(a1);
      const outer = new RivalCombatBrain({ difficulty: 0.72 });
      expect(outer.decide(DT, new Vector3(0, 0, 3), new Vector3(0, 0, 0), s, false)).toBe(outer.decide(DT, new Vector3(0, 0, 3), new Vector3(0, 0, 0), s, false));
    });
  });
});

describe('#17 one knock slide, on the room clock', () => {
  it('carries the body at constant speed with an ease-out, and onDone fires at the end', () => {
    const k = new KnockSlides();
    const p = { x: 0, z: 0 };
    let done = 0;
    const sec = k.start(p, 1.8, 0, () => { done++; });
    expect(sec).toBeCloseTo(1.8 / KNOCK_SPEED, 9);
    k.tick(sec / 2);
    expect(p.x).toBeCloseTo(1.8 * 0.75, 6);   // ease-out: 1 − (1 − ½)² = ¾
    k.tick(0);                                  // a held clock holds the slide
    expect(p.x).toBeCloseTo(1.8 * 0.75, 6);
    k.tick(sec);
    expect(p.x).toBeCloseTo(1.8, 9);
    expect(done).toBe(1);
    expect(k.active).toBe(0);
  });
  it('a second blow replaces the running slide; clear() drops everything', () => {
    const k = new KnockSlides();
    const p = { x: 0, z: 0 };
    let first = 0;
    k.start(p, 2, 0, () => { first++; });
    k.tick(0.05);
    k.start(p, p.x, 1);
    expect(k.active).toBe(1);
    k.tick(1);
    expect(first).toBe(0);
    expect(p.z).toBeCloseTo(1, 9);
    k.start(p, 5, 5); k.clear(); k.tick(1);
    expect(p.x).not.toBe(5);
  });
});

describe('#19 an unchanged HUD patch is not a new state', () => {
  it('mergeHud returns prev itself when nothing moved, a merged copy when something did', () => {
    const prev = { hp: 100, guard: 80 };
    expect(mergeHud(prev, { hp: 100 })).toBe(prev);
    expect(mergeHud(prev, {})).toBe(prev);
    const next = mergeHud(prev, { guard: 79 });
    expect(next).not.toBe(prev);
    expect(next).toEqual({ hp: 100, guard: 79 });
  });
});

describe('#20 chest points without allocation', () => {
  it('one scratch point per body, at chest height', () => {
    const chestOf = makeChestOf();
    const a = { root: { position: new Vector3(1, 0, 2) } }, b = { root: { position: new Vector3(-1, 0, 0) } };
    const ca = chestOf(a), cb = chestOf(b);
    expect(ca).not.toBe(cb);
    expect(ca.y).toBeCloseTo(CHEST_Y, 9);
    a.root.position.x = 3;
    expect(chestOf(a)).toBe(ca);
    expect(ca.x).toBe(3);
  });
});
