// DUEL — the owner-picked improvement pass (IMPROVE 2026-10-06). The pure rules the mode now leans on (duelRules) are
// tested on their own; the mode file mounts Babylon, so its wiring is held by source pins, in this repo's usual way
// (ShowdownMode.improve, KarateVSMode.improve, bodyFight.gate).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DUEL, DUEL_HINT, DUEL_WEAPONS, COUNTER_WEAPON, chiForOutcome, rivalWeaponFor, edgeCall, holdFromEdge,
  safeSubstitutionSpot, duelScore, duelScoreMax, DUEL_SCORE,
} from './duelRules';
import { arenasFor, insideBy, type ArenaShape } from '../combat/arenas';
import { RivalCombatBrain } from '../core/RivalCombatBrain';
import { FighterState, STAFF_ATTACKS } from '../core/FightCore';
import { staffMoveset } from '../core/StrikeSystem';
import { SUBSTITUTION_CHI_COST } from '../core/DefenseSystem';

const SRC = readFileSync(join(__dirname, 'DuelMode.ts'), 'utf8');
const HOST = readFileSync(join(__dirname, '..', '..', '..', 'components', 'games', 'duel-babylon.tsx'), 'utf8');
/** The source without its comments — a pin must hold the code, not a note about it. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
/** The body of a function / method named `head` (to the next line that closes at its indent). */
function fnBody(head: string): string {
  const i = CODE.indexOf(head);
  expect(i, `${head} not found — re-point this pin, do not drop it`).toBeGreaterThanOrEqual(0);
  const indent = /^\s*/.exec(CODE.slice(CODE.lastIndexOf('\n', i) + 1))![0];
  const end = CODE.indexOf(`\n${indent}}`, i);
  return CODE.slice(i, end);
}
const DISC: ArenaShape = { kind: 'disc', radius: 7.75 };
const BOX: ArenaShape = { kind: 'box', halfX: 7.5, halfZ: 5.25 };

describe('#1 clean hits land (delivered by the combat stack)', () => {
  it('an out-of-reach swing is the whiff; an undefended one in reach is a hit', () => {
    expect(CODE).toContain("if (dist > atk.range) return 'outOfRange';");
    expect(CODE).toContain('applyDefenseOutcome(action, atkState, defState, move.atk)');
  });
});

describe('#2 the rival\'s meter fills', () => {
  it('a blow that lands pays the attacker its move\'s chiGain; nothing else pays', () => {
    expect(chiForOutcome('hit', 14)).toBe(14);
    expect(chiForOutcome('guardBreak', 10)).toBe(10);
    for (const o of ['whiff', 'blocked', 'parried', 'guardImpacted', 'substituted']) expect(chiForOutcome(o, 14), o).toBe(0);
    expect(chiForOutcome('hit', 0)).toBe(0);
  });
  it('the mode pays it after the outcome, capped at the bar; the full bar arms a CRITICAL EDGE on the thrown heavy', () => {
    const b = fnBody('function resolveActive(');
    expect(b).toContain('const gain = chiForOutcome(outcome, move.atk.chiGain);');
    expect(b).toContain('atkState.chi = Math.min(CHI_MAX, atkState.chi + gain)');
    expect(b.indexOf('applyDefenseOutcome(')).toBeLessThan(b.indexOf('chiForOutcome('));
    expect(b).toContain('const crit = ult ? DUEL.critMult : 1;');
    expect(b).toContain('move.atk.knockback * crit');
    const r = fnBody('function rivalTurn(');
    expect(r).toContain("decision.spend === 'ultimate' && thrown && foeStrike.current && foeState.chi >= CHI_MAX");
    expect(r).toContain('foeUlt.arm(foeStrike.current)');
    expect(r).not.toContain('chiResource(');   // one scratch resource, not an object a frame (#17)
  });
});

describe('#3 the guard impact and the parry play on the body', () => {
  it('the defender\'s flash is SET when its defence lands, for either fighter, and both trees and bios read it', () => {
    const b = fnBody('function resolveActive(');
    expect(b).toContain('beatParry(!mine)');
    expect(b).toContain('beatGuardImpact(!mine)');
    const a = fnBody('function animate(');
    expect(a).toContain('parryFlash: parryFlash > 0, guardImpactFlash: giFlash > 0');
    expect(a).toContain('parryFlash: foeParryFlash > 0, guardImpactFlash: foeGiFlash > 0');
    expect(CODE).not.toMatch(/parryFlash: false|guardImpactFlash: false/);
    expect(fnBody('function beatGuardImpact(')).toContain("clearBeat('guard_impact')");
  });
});

describe('#4 the edge warning has its own field and clears', () => {
  it('your back first, then the rival\'s, and nothing when both are clear', () => {
    expect(edgeCall(0.4, 3)).toBe('EDGE BEHIND YOU');
    expect(edgeCall(0.4, 0.4)).toBe('EDGE BEHIND YOU');
    expect(edgeCall(3, 0.9)).toBe('RIVAL ON THE EDGE');
    expect(edgeCall(3, 3)).toBe('');
    expect(edgeCall(DUEL.edgeWarnM, DUEL.edgeWarnM)).toBe('');
  });
  it('the mode never writes the warning into the hint; the host draws the field', () => {
    expect(CODE).not.toMatch(/hint: 'EDGE/);
    expect(fnBody('function pushHud(')).toContain("hudPut('edge'");
    expect(HOST).toContain('hud.edge');
  });
});

describe('#5 the rival\'s weapon', () => {
  it('counter-picks yours on round 1: each counter beats the weapon it answers, and none is a mirror', () => {
    for (const w of DUEL_WEAPONS) {
      expect(rivalWeaponFor(1, w, null, false)).toBe(COUNTER_WEAPON[w]);
      expect(COUNTER_WEAPON[w]).not.toBe(w);
    }
    expect(new Set(Object.values(COUNTER_WEAPON)).size).toBe(3);   // a cycle: every weapon is somebody's answer
  });
  it('keeps what won; changes after a loss to the weapon that is neither its last nor yours', () => {
    for (const mine of DUEL_WEAPONS) {
      const r1 = rivalWeaponFor(1, mine, null, false);
      expect(rivalWeaponFor(2, mine, r1, true)).toBe(r1);
      const r2 = rivalWeaponFor(2, mine, r1, false);
      expect(r2).not.toBe(r1);
      expect(r2).not.toBe(mine);
    }
  });
  it('the mode picks it at every round start and swaps the moveset, the brain and the prop', () => {
    expect(fnBody('function startRound(')).toContain('rivalWeaponFor(round, myWeapon, lastFoeWeapon, rivalWonLast)');
    const s = fnBody('function setFoeWeapon(');
    expect(s).toContain('foeStrike.swapMoveset(RIVAL_MOVESET[w]())');
    expect(s).toContain('rivalBrain = brainFor(w)');
    expect(s).toContain('showWeapons(ctx)');
  });
});

describe('#6 the rival\'s dash and substitution are moves, not teleports', () => {
  it('the dash is CombatMovement\'s burst, paid only when it goes; the substitution has its cooldown, effect and whiff beat', () => {
    const r = fnBody('function rivalTurn(');
    expect(r).toContain('foeMove.dash(dx, dz)');
    expect(r).not.toMatch(/addInPlace\(dir\.scale\(2\.2\)\)/);
    expect(r).toContain('foeDef.spendSubstitution(now())');
    expect(r).toContain('foeSubstituted = now() + DUEL.subWhiffMs');
    expect(CODE).toContain("if (now() < foeSubstituted) { meStrike.current?.consumeHit(); banner(ctx, 'THEY SUBSTITUTED!', 500); }");
  });
});

describe('#7 a substitution never rings the rival out', () => {
  const edge = (shape: ArenaShape) => (x: number, z: number) => insideBy({ x, z }, shape);
  it('behind you when there is footing there (DefenseSystem\'s 1.1 m)', () => {
    const s = safeSubstitutionSpot(0, 0, 0, edge(DISC))!;
    expect(s.x).toBeCloseTo(0, 6); expect(s.z).toBeCloseTo(-1.1, 6);
  });
  it('with your back to the drop, beside you; with no footing anywhere, not at all', () => {
    // facing +z from z −6.8 on a 7.75 disc: "behind" is z −7.9 — past the drop
    const s = safeSubstitutionSpot(0, -6.8, 0, edge(DISC))!;
    expect(s).not.toBeNull();
    expect(insideBy(s, DISC)).toBeGreaterThanOrEqual(DUEL.subSafeM);
    // CONTROL: the old spot (behind, unchecked) is off the edge
    expect(insideBy({ x: 0, z: -6.8 - 1.1 }, DISC)).toBeLessThan(0);
    // nearer still (z −7.2), even beside you is too close to the drop: no substitution at all
    expect(safeSubstitutionSpot(0, -7.2, 0, edge(DISC))).toBeNull();
    expect(safeSubstitutionSpot(0, 0, 0, () => -1)).toBeNull();
  });
  it('the mode spends nothing when no spot is safe', () => {
    const r = fnBody('function rivalTurn(');
    expect(r).toContain('const spot = safeSubstitutionSpot(');
    expect(r.indexOf('if (spot) {')).toBeLessThan(r.indexOf('foeState.chi -= SUBSTITUTION_CHI_COST'));
    expect(CODE).not.toContain('DefenseController.substitutionSpot(');
  });
});

describe('#8 the rival never walks off the edge', () => {
  it('a step outward past the margin is held; a step inward is free; on a disc and a box', () => {
    for (const shape of [DISC, BOX]) {
      const edgeX = shape.kind === 'disc' ? shape.radius : shape.halfX;
      const p = { x: edgeX - 0.6, z: 0 };
      const before = insideBy(p, shape);
      p.x += 0.4;   // a walk outward, to 0.2 m inside
      expect(holdFromEdge(p, before, shape)).toBe(true);
      expect(insideBy(p, shape)).toBeCloseTo(DUEL.rivalHoldM, 5);
      const q = { x: edgeX - 0.3, z: 0 };
      const qb = insideBy(q, shape);
      q.x -= 0.2;   // inward
      expect(holdFromEdge(q, qb, shape)).toBe(false);
    }
  });
  it('a body a blow left closer than the margin cannot step further out, and is not yanked inward', () => {
    const p = { x: DISC.kind === 'disc' ? DISC.radius - 0.2 : 0, z: 0 };
    const before = insideBy(p, DISC);
    p.x += 0.1;
    expect(holdFromEdge(p, before, DISC)).toBe(true);
    expect(insideBy(p, DISC)).toBeCloseTo(before, 5);
  });
  it('CONTROL: walked 30 frames at 3 m/s from 0.6 m inside, unheld, the rival is off; held, it is not', () => {
    const shape = DISC, r = shape.kind === 'disc' ? shape.radius : 0;
    const free = { x: r - 0.6, z: 0 }, held = { x: r - 0.6, z: 0 };
    for (let i = 0; i < 30; i++) {
      free.x += 3 / 60;
      const b = insideBy(held, shape); held.x += 3 / 60; holdFromEdge(held, b, shape);
    }
    expect(insideBy(free, shape)).toBeLessThan(0);
    expect(insideBy(held, shape)).toBeGreaterThan(0);
  });
  it('the mode holds the rival\'s OWN step (after it, before the ring-out check)', () => {
    expect(CODE).toContain('if (arena.edge === \'drop\' && holdFromEdge(rival.root.position, foeInBefore, arena.shape)) foeMove.vel.setAll(0);');
    expect(CODE.indexOf('holdFromEdge(rival.root.position')).toBeLessThan(CODE.indexOf('if (phase === \'fighting\') checkRingOut(ctx);'));
    expect(fnBody('function roundStartRival(')).toContain('rivalBrain.setEdge(edgeIn)');
    expect(arenasFor('duel').some((a) => a.edge === 'drop')).toBe(true);   // (a walled arena needs no hold: the walls clamp)
  });
});

describe('#9 the round ends through the animation tree', () => {
  it('no clip is played around the trees; the loser is out, the winner celebrates, and the trees run between rounds', () => {
    expect(CODE).not.toMatch(/animator\.play\(/);
    const e = fnBody('function endRound(');
    expect(e).toContain('meOut = !playerWon; foeOut = playerWon;');
    const a = fnBody('function animate(');
    expect(a).toContain('out: meState.hp <= 0 || meOut');
    expect(a).toContain('out: foeState.hp <= 0 || foeOut');
    expect(a).toContain('celebrating: verdict && foeOut');
    const u = fnBody('update(ctx: ModeContext, dt: number)');
    const between = u.slice(u.indexOf("if (phase !== 'fighting') {"), u.indexOf('meState.tick(sdtHero)'));
    expect(between).toContain('animate(dt); pushHud(ctx); camera(ctx, dt);');
  });
});

describe('#10 the weapon is picked once', () => {
  it('the start-up screen\'s pick skips the in-round phase; only no pick opens it', () => {
    const b = fnBody('function beginPlay(');
    expect(b).toContain('weaponPicked()');
    expect(b.indexOf('startMatch(ctx)')).toBeLessThan(b.indexOf("setPhase('weaponSelect')"));
    expect(fnBody('async load(')).not.toContain("setPhase('weaponSelect')");
  });
});

describe('#11 the round clock is shown', () => {
  it('the mode pushes the seconds left while fighting; the host draws them', () => {
    expect(fnBody('function pushHud(')).toContain("hudPut('timeLeft', live ? Math.max(0, Math.ceil(DUEL.roundSec - phaseSec))");
    expect(HOST).toContain('hud.timeLeft');
    expect(DUEL.roundSec).toBe(120);   // the rule is unchanged: the old budget
  });
});

describe('#12 a hit-react timer per fighter', () => {
  it('each fighter counts its own reaction down', () => {
    expect(CODE).not.toMatch(/\bhitT\b/);
    const h = fnBody('function hitReact(');
    expect(h).toContain('meHitT = DUEL.reactSec');
    expect(h).toContain('foeHitT = DUEL.reactSec');
  });
});

describe('#13 the hint names every control', () => {
  it('the X tap and double-tap, the guard impact flick and Focus, in ONE static string', () => {
    for (const s of ['tap X', 'double-tap X', 'GUARD IMPACT', 'R2 focus', 'A / B / Y']) expect(DUEL_HINT).toContain(s);
    expect(CODE.match(/\bhint:/g)?.length).toBe(1);
    expect(CODE).toContain('ctx.setHud({ hint: DUEL_HINT })');
  });
});

describe('#14 the score pays a ring-out and a guard impact', () => {
  it('the rounds are the old formula exactly; the bonuses are capped', () => {
    expect(duelScore({ myWins: 2, foeWins: 1, ringOutWins: 0, guardImpacts: 0 })).toBe(2 * 100 - 40);
    expect(duelScore({ myWins: 0, foeWins: 2, ringOutWins: 0, guardImpacts: 0 })).toBe(-80);
    expect(duelScore({ myWins: 2, foeWins: 0, ringOutWins: 2, guardImpacts: 3 })).toBe(200 + 2 * DUEL_SCORE.ringOutPts + 3 * DUEL_SCORE.impactPts);
    // a ring-out pays only on a round you won; the impact bonus stops at its cap
    expect(duelScore({ myWins: 1, foeWins: 2, ringOutWins: 5, guardImpacts: 99 })).toBe(100 - 80 + DUEL_SCORE.ringOutPts + DUEL_SCORE.impactCap * DUEL_SCORE.impactPts);
    expect(duelScore({ myWins: NaN, foeWins: -1, ringOutWins: Infinity, guardImpacts: -4 })).toBe(0);
  });
  it('the maximum is exact: 200 → 280', () => {
    expect(duelScoreMax(2)).toBe(280);
    expect(duelScore({ myWins: 2, foeWins: 0, ringOutWins: 2, guardImpacts: 50 })).toBe(duelScoreMax(2));
  });
  it('the mode ends with it and the host reports it (it read a `stats.wins` the mode never sent: every duel scored 0)', () => {
    expect(fnBody('function afterRound(')).toContain('duelScore({ myWins, foeWins, ringOutWins, guardImpacts })');
    expect(CODE.match(/ctx\.end\(/g)?.length).toBe(1);
    expect(fnBody('function endRound(')).toContain("if (how === 'ringout') ringOutWins++;");
    expect(HOST).toContain('score: Math.max(0, Math.round(r.score ?? 0))');
    expect(HOST).not.toContain('r.stats?.wins');
  });
});

describe('#15 the moveset is built on a weapon change, not per press', () => {
  it('styled() runs only in setMyWeapon and load', () => {
    expect(CODE.match(/\bstyled\(/g)?.length).toBe(2);   // setMyWeapon and load (the definition is `styled = (`)
    expect(fnBody('function setMyWeapon(')).toContain('myMoves = styled(w); myMoveIds = Object.keys(myMoves);');
    expect(fnBody('onInput(')).not.toContain('Object.keys(');
  });
});

describe('#16 the HUD goes out on change', () => {
  it('update() pushes through hudPut, never four fields a frame', () => {
    expect(fnBody('update(ctx: ModeContext, dt: number)')).not.toMatch(/ctx\.setHud\(\{ hp:/);
    expect(CODE).toContain('function hudPut(k: string, v: string | number): void { if (hudSent[k] !== v)');
  });
});

describe('#17 no per-frame garbage in the fight loop', () => {
  it('the rival\'s wish, the movement scales and the posture feed allocate nothing', () => {
    const r = fnBody('function rivalTurn(');
    const perFrame = r.slice(0, r.indexOf("if (decision.spend === 'dash'"));
    expect(perFrame).not.toMatch(/new Vector3|\.subtract\(|\.scale\(|\.normalize\(/);
    const u = fnBody('update(ctx: ModeContext, dt: number)');
    expect(u).not.toMatch(/vel\.scale\(|const feedBio = /);
    expect(u).toContain('addInPlaceFromFloats(foeMove.vel.x * sdtRoom');
    expect(CODE).toContain('return wishV.set(');
    expect(fnBody('function feedBio(')).not.toMatch(/subtract|normalize/);
  });
});

describe('#18 no hidden disc', () => {
  it('the probe-only cylinder and its never-disposed material are gone', () => {
    expect(CODE).not.toMatch(/duel_disc|discMesh|new StandardMaterial|MeshBuilder/);
  });
});

describe('#19 nothing outlives dispose', () => {
  it('no render observers, no setTimeouts; dispose clears the slides and the banner', () => {
    expect(CODE).not.toMatch(/setTimeout|onBeforeRenderObservable/);
    const d = fnBody('dispose() {');
    expect(d).toContain('knock.clear()');
    expect(d).toContain('bannerSlot.clear()');
  });
});

describe('#20 the rival brain allocates nothing per decision', () => {
  afterEach(() => vi.restoreAllMocks());
  it('600 frames of reads, swings, spends and a full-bar heavy: no array map / filter / find inside decide()', () => {
    let s = 7;
    const rng = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const moves = Object.entries(staffMoveset(STAFF_ATTACKS)).map(([id, m]) => ({ id, kind: m.weight === 'light' ? 'jab' as const : m.weight === 'medium' ? 'kick' as const : 'heavy' as const, range: m.atk.range }));
    const brain = new RivalCombatBrain({ difficulty: 0.84, canSpecial: false, rng, moves });
    brain.setEdge((x, z) => insideBy({ x, z }, DISC));
    const st = new FighterState(100);
    const res = { value: 100, max: 100, dashCost: 12, subCost: SUBSTITUTION_CHI_COST, subReady: true };
    const self = { x: 0, z: -2 }, foe = { x: 0, z: 0.4 };
    const map = vi.spyOn(Array.prototype, 'map'), filter = vi.spyOn(Array.prototype, 'filter'), find = vi.spyOn(Array.prototype, 'find');
    let swings = 0, ults = 0;
    const prevRandom = Math.random; Math.random = rng;
    try {
      for (let i = 0; i < 600; i++) {
        const d = brain.decide(1 / 60, self, foe, st, i % 40 < 10, res, i % 40 < 10 ? 0.2 : -1, i % 90 === 0);
        if (d.attackId) swings++;
        if (d.spend === 'ultimate') ults++;
      }
    } finally { Math.random = prevRandom; }
    const calls = { map: map.mock.calls.length, filter: filter.mock.calls.length, find: find.mock.calls.length };
    vi.restoreAllMocks();
    expect(swings).toBeGreaterThan(0);
    expect(ults).toBeGreaterThan(0);
    expect(calls).toEqual({ map: 0, filter: 0, find: 0 });
  });
});
