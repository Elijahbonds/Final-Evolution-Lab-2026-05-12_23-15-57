// A3 Mirror hook (docs/ADVENTURE-PLAN.md pillar 7): body events → `mirror:move`; the ledger's rate bucket and session
// caps; off means no effect at all.
import { describe, expect, it } from 'vitest';
import type { BodyEvent } from '@/lib/pose/BodyReader';
import { createAdventureBus, type AdventureEvents } from '../contracts';
import {
  MIRROR_CLAIMS, MIRROR_MIN_GAP_SEC, MIRROR_SPECIAL_BURST, MIRROR_SPECIAL_RATE_PER_SEC, MIRROR_SPECIAL_SESSION_CAP,
  MIRROR_XP_SESSION_CAP, MirrorLedger, mirrorMoveOf, mirrorOnBody,
} from './mirror';

const blow = (t: number, speed = 5): BodyEvent => ({ kind: 'blow', t, seen: t + 120, hand: 'R', lead: false, form: 'straight', name: 'cross', peakT: t + 80, speed });

describe('mirrorMoveOf: which body events are moves', () => {
  it('maps the fight read, a squat and a jump; everything else is not a move', () => {
    expect(mirrorMoveOf(blow(0))?.kind).toBe('punch');
    expect(mirrorMoveOf({ kind: 'legKick', t: 0, seen: 0, foot: 'L', lead: true, form: 'round', peakT: 0, speed: 6, heightM: 1.1, spin: false, airborne: false })?.kind).toBe('kick');
    expect(mirrorMoveOf({ kind: 'guard', t: 0, seen: 0, up: true, raise: true, push: false })?.kind).toBe('guard');
    expect(mirrorMoveOf({ kind: 'guard', t: 0, seen: 0, up: false, raise: false, push: false })).toBeNull();
    expect(mirrorMoveOf({ kind: 'evade', t: 0, seen: 0, form: 'slip', side: 'L', sizeM: 0.1 })?.kind).toBe('slip');
    expect(mirrorMoveOf({ kind: 'dip', t: 0, seen: 0, depthM: 0.3 })?.kind).toBe('squat');
    expect(mirrorMoveOf({ kind: 'land', t: 0, seen: 0, flightMs: 300, heightM: 0.3, firstFoot: 'both' })?.kind).toBe('jump');
    expect(mirrorMoveOf({ kind: 'fightStep', t: 0, seen: 0, dir: 'in', foot: 'L', distM: 0.3 })).toBeNull();
    expect(mirrorMoveOf({ kind: 'lost', t: 0, seen: 0, lastSeen: 0 })).toBeNull();
    // every claimed kind is one mirrorMoveOf reads
    expect([...MIRROR_CLAIMS].sort()).toEqual(['blow', 'dip', 'evade', 'guard', 'land', 'legKick']);
  });

  it('quality rises with effort and stays 0..1', () => {
    const slow = mirrorMoveOf(blow(0, 2))!.quality01, fast = mirrorMoveOf(blow(0, 6))!.quality01;
    expect(fast).toBeGreaterThan(slow);
    expect(mirrorMoveOf(blow(0, 100))!.quality01).toBe(1);
    expect(mirrorMoveOf(blow(0, -100))!.quality01).toBe(0);
  });
});

describe('mirrorOnBody: the hook AdventureMode.onBody calls', () => {
  it('emits mirror:move only when the setting is on; returns false otherwise (not counted as input)', () => {
    const bus = createAdventureBus();
    const got: AdventureEvents['mirror:move'][] = [];
    bus.on('mirror:move', (e) => got.push(e));
    let on = false;
    const o = { bus, actorId: 'p1', enabled: () => on };
    expect(mirrorOnBody(blow(0), o)).toBe(false);
    expect(got).toHaveLength(0);
    on = true;
    expect(mirrorOnBody(blow(0), o)).toBe(true);
    expect(got[0]).toMatchObject({ actorId: 'p1', kind: 'punch' });
    expect(mirrorOnBody({ kind: 'turn', t: 0, seen: 0, deg: 90 }, o)).toBe(false);
    expect(mirrorOnBody(blow(0, 0), o)).toBe(false);   // too weak to count
  });
});

describe('MirrorLedger: rate and session caps', () => {
  it('ignores moves closer together than the minimum gap', () => {
    const l = new MirrorLedger();
    expect(l.credit({ kind: 'punch', quality01: 1 }, 0)).not.toBeNull();
    expect(l.credit({ kind: 'punch', quality01: 1 }, MIRROR_MIN_GAP_SEC / 2)).toBeNull();
    expect(l.credit({ kind: 'punch', quality01: 1 }, MIRROR_MIN_GAP_SEC)).not.toBeNull();
  });

  it('special from the Mirror never outruns the play reference rate (plus one burst) over any stretch', () => {
    const l = new MirrorLedger();
    let special = 0;
    const sec = 120;
    for (let t = 0; t < sec; t += MIRROR_MIN_GAP_SEC) special += l.credit({ kind: 'punch', quality01: 1 }, t)?.special ?? 0;
    expect(special).toBeLessThanOrEqual(MIRROR_SPECIAL_BURST + MIRROR_SPECIAL_RATE_PER_SEC * sec + 1e-9);
    expect(special).toBeGreaterThan(MIRROR_SPECIAL_RATE_PER_SEC * sec * 0.9);   // and it does reach it when you keep moving
  });

  it('caps a session at MIRROR_SPECIAL_SESSION_CAP specials and MIRROR_XP_SESSION_CAP XP; a reset starts a new session', () => {
    const l = new MirrorLedger();
    let xp = 0, special = 0;
    for (let t = 0; t < 4 * 3600; t += 0.5) {
      const c = l.credit({ kind: 'kick', quality01: 1 }, t);
      xp += c?.xp ?? 0; special += c?.special ?? 0;
    }
    expect(xp).toBe(MIRROR_XP_SESSION_CAP);
    expect(special).toBeCloseTo(MIRROR_SPECIAL_SESSION_CAP, 6);
    l.reset();
    expect(l.credit({ kind: 'kick', quality01: 1 }, 0)?.xp).toBeGreaterThan(0);
  });
});
