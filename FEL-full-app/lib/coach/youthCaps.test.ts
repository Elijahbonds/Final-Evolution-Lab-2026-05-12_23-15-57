// YOUTH-CONTACT-CAP v2 (PM, 2026-10-26): more max-effort words out of a teen's cues (any case), and the two ~60-contact
// pogo blocks — Pogo Progression: Both Feet (3 × 20) and the Wake-Up's Build the Rhythm (2 × 30) — tagged adults only,
// so neither reaches a teen's drills page or Today's Drill.
import { describe, expect, it } from 'vitest';
import { MAX_EFFORT_CUE, youthSafeCues } from './taxonomy';
import { POGO_BILATERAL, WAKE_UP } from '@/lib/drills/drills';
import { drillsAccess } from '@/lib/drills/access';
import { FOCUS_DRILLS, planFor } from '@/lib/daily-drill/plan';
import { MAX_TEEN_SESSION_CONTACTS } from './weeklyDraft/thresholds';

const contactsOf = (phases: readonly { targets: readonly { move: string }[] }[]) => phases.reduce((n, p) => n + p.targets.filter((t) => t.move === 'jump').length, 0);
const ctx = (isYouth: boolean, open = true) => ({ isYouth, painDecision: null, hardStopped: false, unavailable: false, jumpGate: { closed: !open, why: '', href: null } });

describe('the teen cue filter: the new max-effort words, in any case', () => {
  it.each([
    'Jump as fast as you can.', 'Push AS HARD AS YOU CAN into the wall.', 'Reach As High As You Can.', 'Explode off the floor.',
    'EXPLODE up', 'explodes through the hips', 'Push as fast and hard as you can',
  ])('drops "%s"', (cue) => {
    expect(MAX_EFFORT_CUE.test(cue)).toBe(true);
    expect(youthSafeCues([cue, 'Land quiet: as little sound as you can.'])).toEqual(['Land quiet: as little sound as you can.']);
  });
  it('keeps calm cues that only share a word ("explosive" is a quality, "as soft as you can" is the opposite)', () => {
    for (const c of ['Land as soft as you can.', 'Build explosive hips over weeks.', 'Hold as long as you can stay tall.']) expect(MAX_EFFORT_CUE.test(c), c).toBe(false);
  });
});

describe('the ~60-contact pogo blocks are adults only', () => {
  it('both are tagged, and each is over the teen session cap', () => {
    const rhythm = WAKE_UP.phases.find((p) => p.id === 'build-the-rhythm')!;
    expect(POGO_BILATERAL.adultOnly).toBe(true);
    expect(rhythm.adultOnly).toBe(true);
    expect(contactsOf(POGO_BILATERAL.phases)).toBe(60);
    expect(contactsOf([rhythm])).toBe(60);
    expect(contactsOf(POGO_BILATERAL.phases)).toBeGreaterThan(MAX_TEEN_SESSION_CONTACTS);
    // nothing else in the Wake-Up is tagged
    expect(WAKE_UP.phases.filter((p) => p.adultOnly).map((p) => p.id)).toEqual(['build-the-rhythm']);
  });

  it('a teen\'s drills page holds both, even with the jump gate open', () => {
    const a = drillsAccess(ctx(true, true));
    expect(a.drills.find((d) => d.id === POGO_BILATERAL.id)!.gate).toBe('held');
    const wake = a.drills.find((d) => d.id === WAKE_UP.id)!;
    expect(wake.phases).not.toContain('build-the-rhythm');
    expect(wake.heldPhases).toContain('Build the Rhythm');
  });

  it('an adult with the gate open keeps both', () => {
    const a = drillsAccess(ctx(false, true));
    expect(a.drills.find((d) => d.id === POGO_BILATERAL.id)!.gate).toBe('open');
    expect(a.drills.find((d) => d.id === WAKE_UP.id)!.phases).toContain('build-the-rhythm');
  });

  it('a teen\'s Today\'s Drill never includes either, whatever the focus', () => {
    const a = drillsAccess(ctx(true, true));
    for (const focus of Object.keys(FOCUS_DRILLS) as (keyof typeof FOCUS_DRILLS)[]) {
      const p = planFor(focus, a)!;
      expect(p.phases.some((r) => r.drill === POGO_BILATERAL.id), focus).toBe(false);
      expect(p.phases.some((r) => r.drill === WAKE_UP.id && r.phase === 'build-the-rhythm'), focus).toBe(false);
    }
  });
});
