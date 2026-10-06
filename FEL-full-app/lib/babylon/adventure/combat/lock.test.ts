// Lock-on (plan A2): pick by distance + screen centre + line of sight, cycle with a flick, break past 25 m or after
// 1 s out of sight. Pure helpers first, then the same verbs driven through the combat system's inputs.
import { describe, expect, it } from 'vitest';
import { createCombatSystem } from './index';
import { createArena, makeActor } from './testArena';
import { cycleLock, lockCandidates, pickLock } from './lock';
import { LOCK } from './tuning';
import { createMonsterActor } from './monsters/defs';
import { PLACEHOLDER_BOSS } from './bosses/defs';

function threeFoes() {
  const ar = createArena({ blockers: [{ a: { x: -6, z: 6 }, b: { x: -3, z: 6 } }] });
  const me = ar.add(makeActor('me', { x: 0, z: 0 }));
  ar.add(makeActor('ahead', { x: 0, z: 8 }, { kind: 'monster', team: -1 }));
  ar.add(makeActor('right', { x: 6, z: 6 }, { kind: 'monster', team: -1 }));
  ar.add(makeActor('left', { x: -4, z: 4 }, { kind: 'monster', team: -1 }));
  ar.add(makeActor('hidden', { x: -7, z: 9 }, { kind: 'monster', team: -1 }));   // behind the blocker
  ar.add(makeActor('ally', { x: 0, z: 3 }, { kind: 'partner', team: 0 }));
  ar.add(makeActor('far', { x: 0, z: 40 }, { kind: 'monster', team: -1 }));
  return { ar, me };
}

describe('adventure combat: lock-on picking', () => {
  it('lists hostile, alive, in-range, in-sight bodies only', () => {
    const { ar, me } = threeFoes();
    const ids = lockCandidates(me, ar.world, () => null).map((c) => c.actorId).sort();
    expect(ids).toEqual(['ahead', 'left', 'right']);
  });

  it('prefers the screen centre over raw distance, and turns to the nearest when nothing is on screen', () => {
    const { ar, me } = threeFoes();
    const cands = lockCandidates(me, ar.world, () => null);
    // Camera looking down +z: 'ahead' (8 m, dead centre) beats 'left' (5.7 m, 45° off).
    expect(cands[pickLock(me, 0, cands)].actorId).toBe('ahead');
    // Camera looking toward 'right' (45° to +x): it wins.
    expect(cands[pickLock(me, Math.PI / 4, cands)].actorId).toBe('right');
    // Camera looking away (−z): nothing on screen, so the nearest anywhere.
    expect(cands[pickLock(me, Math.PI, cands)].actorId).toBe('left');
  });

  it('a flick cycles right and left by bearing, and wraps', () => {
    const { ar, me } = threeFoes();
    const cands = lockCandidates(me, ar.world, () => null);
    const at = (id: string) => { const a = ar.actors.get(id)!; return { x: a.pos.x, z: a.pos.z, actorId: id }; };
    expect(cands[cycleLock(me, at('ahead'), 1, cands)].actorId).toBe('right');
    expect(cands[cycleLock(me, at('ahead'), -1, cands)].actorId).toBe('left');
    expect(cands[cycleLock(me, at('right'), 1, cands)].actorId).toBe('left');   // wraps round
  });

  it('a boss weak point is a lock candidate reached with a flick', () => {
    const ar = createArena();
    const me = ar.add(makeActor('me', { x: 0, z: 0 }));
    const bossActor = ar.add(createMonsterActor(PLACEHOLDER_BOSS, 'boss', { x: 0, y: 0, z: 10 }, { kind: 'boss' }));
    bossActor.facingYaw = Math.PI;   // facing the player
    const combat = createCombatSystem();
    combat.registerBoss(bossActor, PLACEHOLDER_BOSS);
    const cands = lockCandidates(me, ar.world, combat.partsOf);
    expect(cands.filter((c) => c.part).map((c) => c.part).sort()).toEqual(['core', 'shoulder']);
    // A fresh lock takes the body, never a part.
    expect(cands[pickLock(me, 0, cands)].part).toBeUndefined();
  });
});

describe('adventure combat: lock-on through the system', () => {
  it('lock press acquires, flick switches, press again releases; events say so', () => {
    const { ar } = threeFoes();
    const combat = createCombatSystem();
    ar.input('me').lock = true;
    ar.step([combat]);
    expect(ar.actors.get('me')!.lock).toMatchObject({ actorId: 'ahead', hard: true });
    ar.input('me').look.x = 0.9;
    ar.step([combat]);
    expect(ar.actors.get('me')!.lock!.actorId).toBe('right');
    // Holding the stick over is not a second flick.
    ar.step([combat], 5);
    expect(ar.actors.get('me')!.lock!.actorId).toBe('right');
    ar.input('me').look.x = 0;
    ar.step([combat]);
    ar.input('me').look.x = -0.9;
    ar.step([combat]);
    expect(ar.actors.get('me')!.lock!.actorId).toBe('ahead');
    ar.input('me').look.x = 0;
    ar.input('me').lock = true;
    ar.step([combat]);
    expect(ar.actors.get('me')!.lock).toBeNull();
    expect(ar.log.lock.map((e) => e.target?.actorId ?? null)).toEqual(['ahead', 'right', 'ahead', null]);
  });

  it('breaks past the break range', () => {
    const { ar } = threeFoes();
    const combat = createCombatSystem();
    ar.input('me').lock = true;
    ar.step([combat]);
    ar.actors.get('ahead')!.pos.z = LOCK.breakM + 1;
    ar.step([combat]);
    expect(ar.actors.get('me')!.lock).toBeNull();
  });

  it('holds through a short loss of sight, breaks after a full second of it', () => {
    const ar = createArena({ blockers: [{ a: { x: -2, z: 4 }, b: { x: 2, z: 4 } }] });
    ar.add(makeActor('me', { x: 0, z: 0 }));
    const foe = ar.add(makeActor('foe', { x: 6, z: 6 }, { kind: 'monster', team: -1 }));
    const combat = createCombatSystem();
    ar.input('me').lock = true;
    ar.step([combat]);
    expect(ar.actors.get('me')!.lock!.actorId).toBe('foe');
    foe.pos.x = 0; foe.pos.z = 8;   // behind the wall
    ar.step([combat], 50);           // 0.83 s
    expect(ar.actors.get('me')!.lock).not.toBeNull();
    foe.pos.x = 6; foe.pos.z = 6;   // seen again: the clock resets
    ar.step([combat]);
    foe.pos.x = 0; foe.pos.z = 8;
    ar.step([combat], 50);
    expect(ar.actors.get('me')!.lock).not.toBeNull();
    ar.step([combat], 12);           // past 1 s unseen
    expect(ar.actors.get('me')!.lock).toBeNull();
  });

  it('breaks when the target goes down, and hints the lock camera while held', () => {
    const { ar } = threeFoes();
    const combat = createCombatSystem();
    ar.input('me').lock = true;
    ar.step([combat]);
    expect(ar.hints.some((h) => h.preset === 'lock' && h.targetId === 'ahead')).toBe(true);
    ar.actors.get('ahead')!.stats.hp.cur = 0;
    ar.step([combat]);
    expect(ar.actors.get('me')!.lock).toBeNull();
  });
});
