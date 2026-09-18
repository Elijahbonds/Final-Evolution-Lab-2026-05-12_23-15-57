// THE GATE FAILS CLOSED (2026-09-13).
//
// This is the function that decides whether somebody is shown a depth drop. The brief's acceptance criterion
// is "every new system has at least one test covering the unlock/threshold path"; this goes further, because
// the failure that matters is not a wrong boolean — it is the gate OPENING when it cannot tell.
//
// No profile, no snapshot, a missing axis, an unreadable date, a stale scan: every one of those has to lock.
// "We have no data" is much closer to "not today" than to "go ahead", and a readiness gate that opens when
// it is unsure is not a gate.

import { describe, it, expect } from 'vitest';
import {
  evaluateUnlock, partition, assignable, COMPOSITE, PLATFORM_PROTOCOLS, DEFAULT_MAX_SCAN_AGE_DAYS,
  type Protocol,
} from './protocol';
import { emptyProfile, type SharedProfile } from './sharedProfile';

const NOW = Date.parse('2026-09-13T12:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

function withPrq(axes: Record<string, number>, composite: number, at = daysAgo(1)): SharedProfile {
  const p = emptyProfile('cl_test', 'Test');
  p.prq = [{ composite, axes, at }];
  return p;
}

const depthDrop = PLATFORM_PROTOCOLS.find((p) => p.key === 'depth_drop')!;
const breath = PLATFORM_PROTOCOLS.find((p) => p.key === 'breath_reset')!;

describe('THE GATE FAILS CLOSED', () => {
  it('no profile locks anything that is gated', () => {
    const g = evaluateUnlock(depthDrop, null, NOW);
    expect(g.unlocked).toBe(false);
    expect(g.message).toMatch(/system scan/i);
  });

  it('a profile with no scan locks', () => {
    expect(evaluateUnlock(depthDrop, emptyProfile('x'), NOW).unlocked).toBe(false);
  });

  it('A MISSING AXIS LOCKS — it is not treated as zero-that-might-pass or as absent-so-skip', () => {
    // The axis the rule needs simply is not in the snapshot: we cannot tell, so it does not open. (A
    // profile carrying ALL the required axes at passing values is a different case and correctly unlocks —
    // the first draft of this test asserted otherwise and was simply wrong about its own fixture.)
    const noAxis = evaluateUnlock(depthDrop, withPrq({ recovery: 90 }, 90), NOW);
    expect(noAxis.unlocked).toBe(false);
    expect(noAxis.blocking.some((b) => b.axis === 'flexibility' && b.have === null)).toBe(true);
  });

  it('A STALE SCAN LOCKS, however good it was', () => {
    const great = { flexibility: 95, recovery: 95, agility: 95, power: 95 };
    expect(evaluateUnlock(depthDrop, withPrq(great, 95, daysAgo(3)), NOW).unlocked).toBe(true);
    const stale = evaluateUnlock(depthDrop, withPrq(great, 95, daysAgo(9)), NOW);
    expect(stale.unlocked).toBe(false);
    expect(stale.message).toMatch(/scan again/i);
  });

  it('an unreadable date is stale, not fresh', () => {
    const p = withPrq({ flexibility: 95, recovery: 95 }, 95, 'not-a-date');
    expect(evaluateUnlock(depthDrop, p, NOW).unlocked).toBe(false);
  });

  it('the depth drop uses a TIGHTER window than the default, because it is the heaviest thing here', () => {
    expect(depthDrop.unlock!.maxScanAgeDays).toBeLessThan(DEFAULT_MAX_SCAN_AGE_DAYS);
  });

  it('an ungated protocol is always open, even with no profile at all', () => {
    expect(breath.unlock).toBeNull();
    expect(evaluateUnlock(breath, null, NOW).unlocked).toBe(true);
    expect(evaluateUnlock(breath, emptyProfile('x'), NOW).unlocked).toBe(true);
  });
});

describe('the threshold path', () => {
  it('every threshold must clear — one short is locked', () => {
    const almost = withPrq({ flexibility: 60, recovery: 64 }, 70);   // recovery is one under
    const g = evaluateUnlock(depthDrop, almost, NOW);
    expect(g.unlocked).toBe(false);
    expect(g.blocking.map((b) => b.axis)).toEqual(['recovery']);
    expect(g.blocking[0].short).toBe(1);
  });

  it('exactly on the threshold CLEARS it', () => {
    const exact = withPrq({ flexibility: 60, recovery: 65 }, 70);
    expect(evaluateUnlock(depthDrop, exact, NOW).unlocked).toBe(true);
  });

  it('the message names the worst gap, with a number', () => {
    const g = evaluateUnlock(depthDrop, withPrq({ flexibility: 20, recovery: 64 }, 70), NOW);
    expect(g.message).toContain('Ankle compliance');
    expect(g.message).toMatch(/needs 60/);
    expect(g.message).toMatch(/at 20/);
  });

  it('the composite is gated through the same mechanism as any axis', () => {
    const lowComposite = withPrq({ flexibility: 95, recovery: 95 }, 30);
    const g = evaluateUnlock(depthDrop, lowComposite, NOW);
    expect(g.blocking.map((b) => b.axis)).toContain(COMPOSITE);
  });

  it('partition splits a catalogue without evaluating anything twice differently', () => {
    const p = withPrq({ flexibility: 95, recovery: 95, agility: 95, power: 95 }, 95, daysAgo(1));
    const { open, locked } = partition(PLATFORM_PROTOCOLS, p, NOW);
    expect(open.length + locked.length).toBe(PLATFORM_PROTOCOLS.length);
    expect(open.map((x) => x.key)).toContain('depth_drop');
    const beginner = partition(PLATFORM_PROTOCOLS, withPrq({}, 20), NOW);
    expect(beginner.open.map((x) => x.key)).toEqual(['breath_reset', 'ankle_prep']);
  });
});

describe('the rule is DATA, and stays auditable', () => {
  it('every platform protocol either has no rule or a readable one', () => {
    for (const p of PLATFORM_PROTOCOLS) {
      if (!p.unlock) continue;
      expect(p.unlock.all.length).toBeGreaterThan(0);
      for (const t of p.unlock.all) {
        expect(t.min).toBeGreaterThan(0);
        expect(t.min).toBeLessThanOrEqual(100);
        expect(t.label.length).toBeGreaterThan(2);
      }
    }
  });

  it('the heaviest protocol has the strictest rule', () => {
    const hardest = PLATFORM_PROTOCOLS
      .filter((p) => p.unlock)
      .reduce((a, b) => (b.unlock!.all.length > a.unlock!.all.length ? b : a));
    expect(hardest.key).toBe('depth_drop');
  });

  it('and the basics are never gated', () => {
    expect(PLATFORM_PROTOCOLS.filter((p) => !p.unlock).map((p) => p.key))
      .toEqual(['breath_reset', 'ankle_prep']);
  });
});

describe('visibility', () => {
  const mine: Protocol = { key: 'a', title: 'A', summary: 's', minutes: 5, unlock: null, visibility: 'private', coachId: 'coach1' };
  const theirs: Protocol = { key: 'b', title: 'B', summary: 's', minutes: 5, unlock: null, visibility: 'private', coachId: 'coach2' };
  const pub: Protocol = { key: 'c', title: 'C', summary: 's', minutes: 5, unlock: null, visibility: 'published', coachId: 'coach2' };

  it('a coach may assign their own private work and anything published, never someone else’s private work', () => {
    const list = assignable([mine, theirs, pub], 'coach1');
    expect(list.map((p) => p.key)).toEqual(['a', 'c']);
  });
});

describe('a locked protocol explains a requirement, never a person', () => {
  const CLINICAL = ['diagnos', 'injur', 'patholog', 'weak', 'damage', 'unsafe', 'risk', 'symptom', 'therap'];

  it('no gate message reads as a claim about the athlete', () => {
    const profiles = [null, emptyProfile('x'), withPrq({}, 10), withPrq({ flexibility: 10 }, 30, daysAgo(30))];
    const offenders: string[] = [];
    for (const p of profiles) {
      for (const proto of PLATFORM_PROTOCOLS) {
        const g = evaluateUnlock(proto, p, NOW);
        for (const bad of CLINICAL) {
          if (g.message.toLowerCase().includes(bad)) offenders.push(`"${g.message}" contains "${bad}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('and a protocol summary describes movement, not a body part that is wrong', () => {
    for (const p of PLATFORM_PROTOCOLS) {
      for (const bad of CLINICAL) expect(p.summary.toLowerCase(), p.key).not.toContain(bad);
    }
  });
});
