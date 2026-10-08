// Scripted headless fights for A2 (plan A2's tests): stamina costs and the regen pause, a guard break at zero, strings
// inside and outside their window, a light→heavy route, a launcher into an air string, the homing dash landing on the
// lock, a parry inside 160 ms but not outside, a dodge's i-frames turning a hit into 'dodged', a substitution, ko once.
// Every scenario runs the real combat system against a stand-in for A1 built from the contracts (testArena.ts).
import { describe, expect, it } from 'vitest';
import { createCombatSystem, type CombatSystem } from './index';
import { createArena, makeActor, type Arena } from './testArena';
import { fightStateOf } from './fightState';
import { guardAnswer } from './defense';
import { AIR, DODGE, GUARD, STAMINA, SUBSTITUTION } from './tuning';
import { ADVENTURE_MOVES, validateAdventureMoves } from './strings';
import { MONSTERS, createMonsterActor, type MonsterDef } from './monsters/defs';
import { STRING_WINDOW_SEC } from '@/lib/babylon/core/HordeDynamics';

const run = (c: CombatSystem) => ({ aiInputs: [c.aiInputs], moveLockOf: c.moveLockOf, takeWarp: c.takeWarp });

/** A dummy that stands still: an unregistered monster-team body. */
function dummy(ar: Arena, id = 'dummy', z = 1.4, hp = 400) {
  return ar.add(makeActor(id, { x: 0, z }, { kind: 'monster', team: -1, hp, poise: 1000, facingYaw: Math.PI }));
}

/** A brute that throws only its overhead (a fixed tell), registered, two metres in front of the player. */
const OVERHEAD_ONLY: MonsterDef = { ...MONSTERS.brute, attacks: [MONSTERS.brute.attacks[0]] };
function bruteFight() {
  const ar = createArena();
  const combat = createCombatSystem({ seed: 7 });
  const me = ar.add(makeActor('me', { x: 0, z: 0 }));
  const brute = ar.add(createMonsterActor(OVERHEAD_ONLY, 'brute', { x: 0, y: 0, z: 2 }));
  brute.facingYaw = Math.PI;
  combat.registerMonster(brute, OVERHEAD_ONLY);
  return { ar, combat, me, brute, o: run(combat) };
}
const landsWithin = (ar: Arena, c: CombatSystem, sec: number, o: ReturnType<typeof run>) =>
  ar.runUntil([c], () => fightStateOf(ar.actors.get('me')!).incomingSec <= sec, 5, o);

describe('adventure combat: the moveset', () => {
  it('every move passes StrikeSystem\'s readability lint and carries a [PLACEHOLDER] label', () => {
    expect(validateAdventureMoves()).toEqual([]);
    for (const m of Object.values(ADVENTURE_MOVES)) {
      expect(m.label.startsWith('[PLACEHOLDER]')).toBe(true);
      expect(m.startupSec).toBeGreaterThanOrEqual(0.1);
      expect(m.cancelAtSec).toBeGreaterThan(0);
    }
  });
});

describe('adventure combat: stamina', () => {
  it('charges light 10, heavy 22, dodge 18, and waits 0.6 s before regenerating at 35/s', () => {
    const ar = createArena();
    const c = createCombatSystem();
    const me = ar.add(makeActor('me', { x: 0, z: 0 }));
    dummy(ar);
    const st = me.stats.stamina;
    ar.input('me').attackLight = true; ar.step([c], 1, run(c));
    expect(st.cur).toBe(100 - STAMINA.light);
    ar.step([c], 20, run(c));    // past the jab's cancel point, inside the regen pause
    ar.input('me').attackHeavy = true; ar.step([c], 1, run(c));
    const afterHeavy = st.cur;
    expect(afterHeavy).toBe(100 - STAMINA.light - STAMINA.heavy);
    ar.step([c], 40, run(c));    // let the swing end
    fightStateOf(me).staminaIdleSec = 0;   // hold the regen so the step measures the dodge alone
    const before = st.cur;
    ar.input('me').dash = true; ar.step([c], 1, run(c));   // a tap (dashHeld false): the dash
    expect(before - st.cur).toBeCloseTo(STAMINA.dodge, 6);
    const spent = st.cur;
    ar.step([c], 30, run(c));    // 0.5 s: still inside the pause
    expect(st.cur).toBe(spent);
    ar.step([c], 12, run(c));    // to 0.7 s: regen has begun
    expect(st.cur).toBeGreaterThan(spent);
    const a = st.cur; ar.step([c], 30, run(c));
    expect(st.cur - a).toBeCloseTo(STAMINA.regenPerSec * 0.5, 0);
  });

  it('an empty bar refuses a dodge (no i-frames, nothing spent) and an attack; it comes back after the pause', () => {
    const ar = createArena();
    const c = createCombatSystem();
    const me = ar.add(makeActor('me', { x: 0, z: 0 }));
    dummy(ar);
    me.stats.stamina.cur = STAMINA.dodge - 1;
    fightStateOf(me).staminaIdleSec = 0;   // just spent: the regen pause holds the bar where it is
    ar.input('me').dash = true; ar.step([c], 1, run(c));
    expect(me.iframeSec).toBe(0);
    expect(me.stats.stamina.cur).toBe(STAMINA.dodge - 1);
    me.stats.stamina.cur = 0;
    ar.input('me').attackLight = true; ar.step([c], 1, run(c));
    expect(fightStateOf(me).move).toBeNull();
    ar.step([c], 75, run(c));
    expect(me.stats.stamina.cur).toBeGreaterThan(STAMINA.dodge);
    ar.input('me').dash = true; ar.step([c], 1, run(c));
    expect(me.iframeSec).toBeGreaterThan(0);
  });

  it('a souls swing: above zero you can always throw it, and it drains the bar to zero', () => {
    const ar = createArena();
    const c = createCombatSystem();
    const me = ar.add(makeActor('me', { x: 0, z: 0 }));
    dummy(ar);
    me.stats.stamina.cur = 5;
    ar.input('me').attackHeavy = true; ar.step([c], 1, run(c));
    expect(fightStateOf(me).move?.id).toBe('heavy');
    expect(me.stats.stamina.cur).toBe(0);
  });

  it('sprint drains 8/s while the dash button is held past the tap window on the ground', () => {
    const ar = createArena();
    const c = createCombatSystem();
    const me = ar.add(makeActor('me', { x: 0, z: 0 }));
    const i = ar.input('me');
    i.move.y = 1; i.dash = true; i.dashHeld = true;
    ar.step([c], 1, run(c));
    ar.step([c], 60, run(c));
    // ~1 s held, the first 0.18 s is the tap window: ≈ 8 × 0.82
    expect(100 - me.stats.stamina.cur).toBeGreaterThan(STAMINA.sprintPerSec * 0.7);
    expect(100 - me.stats.stamina.cur).toBeLessThan(STAMINA.sprintPerSec * 0.9);
    i.dashHeld = false; ar.step([c], 1, run(c));
    expect(me.iframeSec).toBe(0);   // releasing a sprint is not a dodge
  });
});

describe('adventure combat: guard, parry, guard break', () => {
  it('FightCore\'s window: a parry press 150 ms before the hit is parried, 170 ms is not', () => {
    expect(guardAnswer(true, 1.0, 1.15, 0)).toBe('parried');
    expect(guardAnswer(true, 1.0, 1.16, 0)).toBe('parried');
    expect(guardAnswer(true, 1.0, 1.17, 0)).toBe('blocked');
    expect(guardAnswer(false, 1.0, 1.15, 0)).toBe('open');
    expect(guardAnswer(true, 1.0, 1.05, 0.5)).toBe('open');   // a stunned body cannot guard
    expect(GUARD.parryWindowMs).toBe(160);
  });

  // `incomingSec` is the previous step's read and the press registers on the next step: the press lands ~2 steps
  // (33 ms) closer to the hit than the threshold. The damage event's own timing is checked below.
  it('a guard press ~80 ms before a brute\'s overhead lands parries it and staggers the brute', () => {
    const { ar, combat, brute, o } = bruteFight();
    expect(landsWithin(ar, combat, 0.115, o)).toBeLessThan(Infinity);
    ar.input('me').guardHeld = true;
    ar.runUntil([combat], () => ar.log.damage.length > 0, 1, o);
    expect(ar.log.damage[0]).toMatchObject({ targetId: 'me', outcome: 'parried', amount: 0 });
    expect(brute.stunSec).toBeGreaterThan(GUARD.parryStaggerSec - 0.05);
    expect(fightStateOf(ar.actors.get('me')!).counterSec).toBeGreaterThan(0);
  });

  it('the same guard pressed ~200 ms early only blocks, and costs 0.6 × the hit in stamina', () => {
    const { ar, combat, me, o } = bruteFight();
    landsWithin(ar, combat, 0.235, o);
    ar.input('me').guardHeld = true;
    ar.runUntil([combat], () => ar.log.damage.length > 0, 1, o);
    const ev = ar.log.damage[0];
    expect(ev.outcome).toBe('blocked');
    expect(ev.amount).toBe(0);
    expect(me.stats.hp.cur).toBe(100);
    // 0.6 × what the same swing does unguarded.
    const open = bruteFight();
    open.ar.runUntil([open.combat], () => open.ar.log.damage.length > 0, 3, open.o);
    expect(open.ar.log.damage[0].outcome).toBe('hit');
    expect(ev.staminaDamage).toBeCloseTo(STAMINA.blockPerDamage * open.ar.log.damage[0].amount, 6);
  });

  it('a guard with the bar near empty breaks: the bar empties, the defender staggers', () => {
    const { ar, combat, me, o } = bruteFight();
    landsWithin(ar, combat, 0.3, o);
    ar.input('me').guardHeld = true;
    me.stats.stamina.cur = 5;
    ar.runUntil([combat], () => ar.log.damage.length > 0, 1, o);
    expect(ar.log.damage[0].outcome).toBe('guardBreak');
    expect(me.stats.stamina.cur).toBe(0);
    expect(me.stunSec).toBeGreaterThan(GUARD.guardBreakStaggerSec - 0.05);
  });

  it('the guard covers the front only', () => {
    const { ar, combat, me, o } = bruteFight();
    me.facingYaw = Math.PI;   // back to the brute (the stand-in keeps facing without a lock or motion)
    landsWithin(ar, combat, 0.3, o);
    ar.input('me').guardHeld = true;
    ar.runUntil([combat], () => ar.log.damage.length > 0, 1, o);
    expect(ar.log.damage[0].outcome).toBe('hit');
  });
});

describe('adventure combat: dodge and substitution', () => {
  it('a roll\'s i-frames make the brute\'s overhead whiff as dodged; the same swing undodged hits', () => {
    const a = bruteFight();
    a.ar.input('me').lock = true; a.ar.step([a.combat], 1, a.o);
    landsWithin(a.ar, a.combat, 0.12, a.o);
    // Rolled INTO the swing (through it, souls-style), so the body is still in its reach when it lands.
    a.ar.input('me').dash = true; a.ar.input('me').move.y = 1;
    a.ar.runUntil([a.combat], () => a.ar.log.damage.length > 0, 1, a.o);
    expect(a.ar.log.damage[0]).toMatchObject({ outcome: 'dodged', amount: 0 });
    expect(a.me.stats.hp.cur).toBe(100);

    const b = bruteFight();
    b.ar.runUntil([b.combat], () => b.ar.log.damage.length > 0, 3, b.o);
    expect(b.ar.log.damage[0].outcome).toBe('hit');
    expect(b.me.stats.hp.cur).toBeLessThan(100);
  });

  it('a dodge inside DodgeRead\'s window is perfect: a riposte window and a slow-mo beat; an early one is not', () => {
    const a = bruteFight();
    landsWithin(a.ar, a.combat, 0.15, a.o);
    a.ar.input('me').dash = true;
    a.ar.step([a.combat], 1, a.o);
    expect(fightStateOf(a.me).perfectDodges).toBe(1);
    expect(a.ar.log['time:scale'][0]).toMatchObject({ byId: 'me' });
    expect(fightStateOf(a.me).counterSec).toBeGreaterThan(0);

    const b = bruteFight();
    landsWithin(b.ar, b.combat, 0.6, b.o);
    b.ar.input('me').dash = true;
    b.ar.step([b.combat], 1, b.o);
    expect(fightStateOf(b.me).perfectDodges).toBe(0);
    expect(b.ar.log['time:scale']).toHaveLength(0);
  });

  it('guard + dash arms a substitution: the hit is dodged, energy is spent, the body reappears behind the attacker', () => {
    const { ar, combat, me, brute, o } = bruteFight();
    landsWithin(ar, combat, 0.12, o);
    const i = ar.input('me');
    i.guardHeld = true; i.dash = true;
    ar.step([combat], 1, o);
    expect(me.stats.energy.cur).toBe(100 - SUBSTITUTION.energyCost);
    ar.runUntil([combat], () => ar.log.damage.length > 0, 1, o);
    expect(ar.log.damage[0]).toMatchObject({ outcome: 'dodged', via: 'substitution' });
    ar.step([combat], 1, o);   // the stand-in applies the warp
    // Behind the brute: further along its facing's back (brute faces −z at z=2 → behind is z > 2).
    expect(me.pos.z).toBeGreaterThan(brute.pos.z);
  });
});

describe('adventure combat: strings', () => {
  it('light → heavy is the jab-heavy route: the heavy is a launcher and the route pays on it', () => {
    const ar = createArena();
    const c = createCombatSystem();
    ar.add(makeActor('me', { x: 0, z: 0 }));
    const d = dummy(ar);
    ar.input('me').attackLight = true; ar.step([c], 1, run(c));
    ar.step([c], 3, run(c));
    ar.input('me').attackHeavy = true;     // pressed inside the jab: queued to its cancel point
    ar.runUntil([c], () => ar.log.damage.length >= 2, 1, run(c));
    expect(ar.log.damage.map((e) => e.via)).toEqual(['jab', 'heavy+route:crusher']);
    expect(ar.log.damage.every((e) => e.outcome === 'hit')).toBe(true);
    expect(ar.log.damage[1].launch).toBe(true);
    expect(fightStateOf(d).airSec).toBeGreaterThan(0);
    // The route's payoff reached the number: the heavy alone would be heavy.dmg × the second link's combo scale.
    const plain = Math.round(ADVENTURE_MOVES.heavy.dmg * 0.88 * 1.0287);
    expect(ar.log.damage[1].amount).toBeGreaterThan(plain);
  });

  it('a third light inside the string window is the launcher; after the window the string restarts as a jab', () => {
    const run3 = (gapSec: number) => {
      const ar = createArena();
      const c = createCombatSystem();
      ar.add(makeActor('me', { x: 0, z: 0 }));
      dummy(ar);
      for (let k = 0; k < 3; k++) {
        ar.input('me').attackLight = true;
        ar.step([c], 1, run(c));
        ar.step([c], Math.round((k === 1 ? gapSec : 0.3) * 60), run(c));
      }
      ar.step([c], 30, run(c));
      return ar.log.damage.map((e) => e.via);
    };
    // (a completed FighterStyle route tags the via: `uppercut+route:crusher`)
    expect(run3(0.3).map((v) => v!.split('+')[0])).toEqual(['jab', 'cross', 'uppercut']);
    expect(run3(STRING_WINDOW_SEC + 0.2).map((v) => v!.split('+')[0])).toEqual(['jab', 'cross', 'jab']);
  });

  it('a launcher then an air string: air links hold the body up, the heavy slams it down', () => {
    const ar = createArena();
    const c = createCombatSystem();
    ar.add(makeActor('me', { x: 0, z: 0 }));
    const d = dummy(ar);
    ar.input('me').attackHeavy = true;
    ar.runUntil([c], () => ar.log.damage.length >= 1, 1, run(c));
    expect(ar.log.damage[0]).toMatchObject({ via: 'heavy', launch: true });
    let peak = 0;
    const track = () => { peak = Math.max(peak, d.pos.y); return false; };
    ar.step([c], 12, run(c)); track();
    const presses = ['attackLight', 'attackLight', 'attackHeavy'] as const;
    presses.forEach((k, n) => {
      ar.input('me')[k] = true;
      ar.runUntil([c], () => { track(); return ar.log.damage.length >= n + 2; }, 1, run(c));
    });
    const vias = ar.log.damage.map((e) => e.via!.split('+')[0]);
    expect(vias).toEqual(['heavy', 'airJab', 'airJab', 'spike']);
    expect(ar.log.damage.every((e) => e.outcome === 'hit')).toBe(true);
    expect(peak).toBeGreaterThan(1);
    // The slam: the body is no longer juggled and is on its way down.
    expect(fightStateOf(d).airSec).toBe(0);
    ar.step([c], 30, run(c));
    expect(d.pos.y).toBe(0);
  });

  it('a juggle ends: past the air-link cap the body is not held up any more', () => {
    const ar = createArena();
    const c = createCombatSystem();
    ar.add(makeActor('me', { x: 0, z: 0 }));
    const d = dummy(ar);
    const fs = fightStateOf(d);
    fs.airSec = 0.5; fs.airLinks = AIR.maxLinks;
    d.pos.y = 1;
    ar.input('me').attackLight = true;
    ar.runUntil([c], () => ar.log.damage.length >= 1, 1, run(c));
    expect(ar.log.damage[0].via).toBe('airJab');
    expect(d.impulse === null || d.impulse.y <= 0).toBe(true);
  });
});

describe('adventure combat: the homing dash', () => {
  it('a double tap while locked closes on the lock and stops in reach', () => {
    const ar = createArena();
    const c = createCombatSystem();
    const me = ar.add(makeActor('me', { x: 0, z: 0 }));
    const foe = ar.add(makeActor('foe', { x: 2, z: 6 }, { kind: 'monster', team: -1 }));
    ar.input('me').lock = true; ar.step([c], 1, run(c));
    expect(me.lock?.actorId).toBe('foe');
    ar.input('me').dash = true; ar.step([c], 1, run(c));   // tap: a roll
    ar.step([c], 5, run(c));
    ar.input('me').dash = true; ar.step([c], 1, run(c));   // second tap inside the window: the homing dash
    expect(fightStateOf(me).homingSec).toBeGreaterThan(0);
    ar.runUntil([c], () => fightStateOf(me).homingSec === 0, 2, run(c));
    ar.step([c], 2, run(c));
    const d = Math.hypot(foe.pos.x - me.pos.x, foe.pos.z - me.pos.z);
    expect(d).toBeLessThanOrEqual(DODGE.homingStopM + foe.radius + 0.4);
    expect(d).toBeGreaterThan(0.8);
    // And a strike thrown now reaches it.
    ar.input('me').attackLight = true;
    ar.runUntil([c], () => ar.log.damage.length > 0, 1, run(c));
    expect(ar.log.damage[0]).toMatchObject({ targetId: 'foe', outcome: 'hit' });
  });
});

describe('adventure combat: ko', () => {
  it('ko fires once, on the hit that empties HP; a downed body takes no more hits', () => {
    const ar = createArena();
    const c = createCombatSystem();
    ar.add(makeActor('me', { x: 0, z: 0 }));
    const d = dummy(ar, 'dummy', 1.4, 20);
    for (let k = 0; k < 12; k++) {
      ar.input('me').attackLight = true;
      ar.step([c], 20, run(c));
    }
    expect(d.stats.hp.cur).toBe(0);
    expect(ar.log.ko).toEqual([{ actorId: 'dummy', byId: 'me' }]);
    const hitsAfter = ar.log.damage.filter((e) => e.targetId === 'dummy');
    expect(hitsAfter[hitsAfter.length - 1].amount).toBeGreaterThan(0);
  });
});
