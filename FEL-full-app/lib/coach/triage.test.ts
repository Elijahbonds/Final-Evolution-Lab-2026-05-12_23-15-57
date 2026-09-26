// FIFTY ATHLETES, SIX ROWS (2026-09-13).
//
// The brief's target is one coach managing 50+ clients without reviewing everything. That makes the tests
// about ATTENTION rather than about correctness of a score: does a full roster still produce a short list,
// does the athlete who has gone silent get seen, and does an athlete training normally produce nothing at
// all — because a triage that flags everybody is a triage nobody opens twice.

import { describe, it, expect } from 'vitest';
import {
  flagsFor, triageRoster, progressionsOnly, dataOnFile,
  TOP_N, STALE_SCAN_DAYS, QUIET_DAYS, OFF_BASELINE_DROP, PROGRESSION_COMPOSITE,
  type AthleteRow,
} from './triage';
import { emptyProfile, type SharedProfile } from '../profile/sharedProfile';

const NOW = Date.parse('2026-09-13T12:00:00.000Z');
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();

function profile(snaps: { composite: number; daysAgo: number }[]): SharedProfile {
  const p = emptyProfile('cl_1', 'Test');
  p.prq = snaps.map((s) => ({ composite: s.composite, axes: {}, at: ago(s.daysAgo) }));
  return p;
}

function row(over: Partial<AthleteRow> = {}): AthleteRow {
  return {
    clientId: 'cl_1', displayName: 'Ama',
    profile: profile([{ composite: 60, daysAgo: 2 }]),
    sessions7d: 4, sessions24h: 1, lastActiveAt: ago(1),
    ...over,
  };
}

describe('AN ATHLETE TRAINING NORMALLY PRODUCES NOTHING', () => {
  it('current scan, normal load, steady readiness — no flags', () => {
    expect(flagsFor(row(), NOW)).toEqual([]);
  });

  it('and that is what makes the flags that DO appear worth reading', () => {
    const roster = Array.from({ length: 50 }, (_, i) => row({ clientId: `c${i}` }));
    const board = triageRoster(roster, NOW);
    expect(board.flags).toEqual([]);
    expect(board.clear).toBe(50);
    expect(board.summary).toMatch(/nothing needs you today/i);
  });
});

describe('FIFTY ATHLETES STILL PRODUCE A SHORT LIST', () => {
  it('a roster where everyone is flagged is still capped at TOP_N', () => {
    const roster = Array.from({ length: 50 }, (_, i) =>
      row({ clientId: `c${i}`, displayName: `A${i}`, lastActiveAt: ago(30) }));
    const board = triageRoster(roster, NOW);
    expect(board.flags).toHaveLength(TOP_N);
    expect(board.totalFlagged).toBe(50);
    expect(board.summary).toMatch(/more below the fold/i);
  });

  it('ONE ROW PER ATHLETE — three flags about the same person is one thing learned and three slots lost', () => {
    const messy = row({
      lastActiveAt: ago(1),
      profile: profile([{ composite: 70, daysAgo: 40 }, { composite: 40, daysAgo: 20 }]),
      sessions24h: 5, sessions7d: 5,
    });
    const flags = flagsFor(messy, NOW);
    expect(flags.length).toBeGreaterThan(1);                        // it earns several
    const board = triageRoster([messy], NOW);
    expect(board.flags).toHaveLength(1);                            // but is shown once
    expect(board.flags[0].urgency).toBe(Math.max(...flags.map((f) => f.urgency)));
  });

  it('the most urgent athlete is first', () => {
    const mild = row({ clientId: 'mild', profile: profile([{ composite: 60, daysAgo: 20 }]) });
    const severe = row({ clientId: 'severe', lastActiveAt: ago(45) });
    const board = triageRoster([mild, severe], NOW);
    expect(board.flags[0].clientId).toBe('severe');
  });

  it('an empty roster says so rather than rendering an empty board', () => {
    expect(triageRoster([], NOW).summary).toMatch(/no athletes/i);
  });
});

describe('SILENCE IS A SIGNAL', () => {
  it('an athlete who stopped logging is flagged, not skipped', () => {
    const f = flagsFor(row({ lastActiveAt: ago(QUIET_DAYS + 5) }), NOW);
    expect(f.map((x) => x.kind)).toContain('gone-quiet');
  });

  it('so is one who never logged at all', () => {
    const f = flagsFor(row({ lastActiveAt: null }), NOW);
    expect(f[0].kind).toBe('gone-quiet');
    expect(f[0].observed).toMatch(/no activity/i);
  });

  it('NOTHING IS STACKED ON SILENCE — you cannot say anything else about someone with no data', () => {
    const f = flagsFor(row({ lastActiveAt: null, profile: emptyProfile('x'), sessions24h: 0, sessions7d: 0 }), NOW);
    expect(f).toHaveLength(1);
    expect(f[0].kind).toBe('gone-quiet');
  });

  it('the longer the silence the more urgent it gets', () => {
    const a = flagsFor(row({ lastActiveAt: ago(QUIET_DAYS) }), NOW)[0];
    const b = flagsFor(row({ lastActiveAt: ago(40) }), NOW)[0];
    expect(b.urgency).toBeGreaterThan(a.urgency);
  });
});

describe('GOOD NEWS IS A FLAG', () => {
  it('an athlete with headroom is surfaced, not ignored for having nothing wrong', () => {
    const strong = row({ profile: profile([{ composite: 78, daysAgo: 1 }]) });
    const f = flagsFor(strong, NOW);
    expect(f.map((x) => x.kind)).toContain('ready-to-progress');
    expect(f.find((x) => x.kind === 'ready-to-progress')!.positive).toBe(true);
  });

  it('it ranks against the problems rather than below them', () => {
    const strong = row({ clientId: 'strong', profile: profile([{ composite: 85, daysAgo: 1 }]) });
    const staleOnly = row({ clientId: 'stale', profile: profile([{ composite: 60, daysAgo: STALE_SCAN_DAYS + 2 }]) });
    const board = triageRoster([staleOnly, strong], NOW);
    expect(board.flags[0].clientId).toBe('strong');
  });

  it('but only on CURRENT data — a great scan from a month ago is not headroom', () => {
    const old = row({ profile: profile([{ composite: 90, daysAgo: STALE_SCAN_DAYS + 1 }]) });
    expect(flagsFor(old, NOW).map((x) => x.kind)).not.toContain('ready-to-progress');
  });

  it('and not while readiness is falling', () => {
    const falling = row({ profile: profile([
      { composite: 90, daysAgo: 20 }, { composite: 72, daysAgo: 1 },
    ]) });
    expect(flagsFor(falling, NOW).map((x) => x.kind)).not.toContain('ready-to-progress');
  });

  it('progressionsOnly gives a coach a morning of upside', () => {
    const roster = [
      row({ clientId: 'a', profile: profile([{ composite: 80, daysAgo: 1 }]) }),
      row({ clientId: 'b', lastActiveAt: ago(30) }),
      row({ clientId: 'c', profile: profile([{ composite: 90, daysAgo: 1 }]) }),
    ];
    const good = progressionsOnly(roster, NOW);
    expect(good.map((f) => f.clientId)).toEqual(['c', 'a']);
    expect(good.every((f) => f.positive)).toBe(true);
  });
});

describe('the problem flags', () => {
  it('load is judged against the athlete’s OWN week, not a global number', () => {
    // four sessions is a lot for somebody who normally does three and unremarkable for somebody doing twelve
    const light = row({ sessions24h: 4, sessions7d: 4 });
    const heavy = row({ sessions24h: 4, sessions7d: 40 });
    expect(flagsFor(light, NOW).map((f) => f.kind)).toContain('under-recovered');
    expect(flagsFor(heavy, NOW).map((f) => f.kind)).not.toContain('under-recovered');
  });

  it('a real drop against their own history is off-baseline', () => {
    const dropped = row({ profile: profile([
      { composite: 70, daysAgo: 25 }, { composite: 70 - OFF_BASELINE_DROP - 2, daysAgo: 1 },
    ]) });
    expect(flagsFor(dropped, NOW).map((f) => f.kind)).toContain('off-baseline');
  });

  it('a small wobble is not', () => {
    const wobble = row({ profile: profile([{ composite: 70, daysAgo: 25 }, { composite: 67, daysAgo: 1 }]) });
    expect(flagsFor(wobble, NOW).map((f) => f.kind)).not.toContain('off-baseline');
  });

  it('a stale scan is flagged with what to do about it', () => {
    const stale = row({ profile: profile([{ composite: 60, daysAgo: STALE_SCAN_DAYS + 1 }]) });
    const f = flagsFor(stale, NOW).find((x) => x.kind === 'stale-scan')!;
    expect(f.action).toMatch(/system scan/i);
  });

  it('and so is no scan at all, on an athlete who is otherwise active', () => {
    const noScan = row({ profile: emptyProfile('x') });
    expect(flagsFor(noScan, NOW).map((f) => f.kind)).toContain('stale-scan');
  });
});

// MIRROR-COACH P2 (2026-09-25), F7 of the P1 baseline: the day after a Mirror movement screen — or after two weeks of
// logged coached sessions — stale-scan told the coach "No PRQ System Scan on file. Ask for a System Scan — there is
// nothing current to program from." A Mirror screen and coached work are current data too.
describe('CURRENT DATA IS ANY OF THREE: a PRQ System Scan, a Mirror screen, coached work', () => {
  const noPrq = (over: Partial<AthleteRow>) => row({ profile: emptyProfile('x'), ...over });

  // (MIRROR-COACH P2 review, 2026-09-26: lastScreenAt is the newest GRADED screen — the route drops ungraded ones,
  // lib/coach/attention.ts gradedScreenTimes — so the lines say "graded", and the action asks for a System Scan only
  // until the P3 graders land.)
  it('a graded Mirror screen yesterday is current data: no stale-scan the next day', () => {
    expect(flagsFor(noPrq({ lastScreenAt: ago(1), lastCoachedAt: null }), NOW)).toEqual([]);
  });

  it('coached work inside the window is current data too', () => {
    expect(flagsFor(noPrq({ lastScreenAt: null, lastCoachedAt: ago(2) }), NOW)).toEqual([]);
    // …and an old PRQ scan does not matter while it is
    const oldPrq = row({ profile: profile([{ composite: 60, daysAgo: 40 }]), lastScreenAt: null, lastCoachedAt: ago(3) });
    expect(flagsFor(oldPrq, NOW).map((f) => f.kind)).not.toContain('stale-scan');
  });

  it('when nothing is current, the flag says what IS on file, source by source', () => {
    const f = flagsFor(noPrq({ lastScreenAt: ago(STALE_SCAN_DAYS + 6), lastCoachedAt: null }), NOW).find((x) => x.kind === 'stale-scan')!;
    expect(f.observed).toBe('No PRQ System Scan on file; last graded Mirror screen 20 days ago; no coached work logged.');
    expect(f.action).toBe('Ask for a System Scan — there is nothing current to program from.');
    expect(f.action).not.toMatch(/Mirror screen/);          // no screen can be graded before P3
    const g = flagsFor(row({ profile: profile([{ composite: 60, daysAgo: 30 }]), lastScreenAt: null, lastCoachedAt: ago(16) }), NOW).find((x) => x.kind === 'stale-scan')!;
    expect(g.observed).toBe('Last PRQ System Scan 30 days ago; no graded Mirror screen; last coached work 16 days ago.');
  });

  it('a source the caller did not read is left out, not reported as missing (not read is not none)', () => {
    expect(dataOnFile(noPrq({}), NOW)).toEqual({ current: false, parts: ['No PRQ System Scan on file'] });
    expect(dataOnFile(noPrq({ lastScreenAt: null }), NOW).parts).toEqual(['No PRQ System Scan on file', 'no graded Mirror screen']);
  });

  it('the screen window is STALE_SCAN_DAYS, the same as the PRQ scan', () => {
    expect(dataOnFile(noPrq({ lastScreenAt: ago(STALE_SCAN_DAYS - 0.5) }), NOW).current).toBe(true);
    expect(dataOnFile(noPrq({ lastScreenAt: ago(STALE_SCAN_DAYS) }), NOW).current).toBe(false);
  });

  it('still never stacked on silence: gone-quiet alone, whatever is on file', () => {
    const f = flagsFor(noPrq({ lastActiveAt: ago(QUIET_DAYS + 1), lastScreenAt: null, lastCoachedAt: null }), NOW);
    expect(f.map((x) => x.kind)).toEqual(['gone-quiet']);
  });
});

describe('a flag states an observation and an action, never a condition', () => {
  const CLINICAL = ['injur', 'diagnos', 'symptom', 'patholog', 'risk of', 'unsafe', 'damage', 'overtrain', 'burnout'];

  it('nothing a flag says reads as a claim about a body', () => {
    const rows = [
      row(), row({ lastActiveAt: null }), row({ lastActiveAt: ago(40) }),
      row({ sessions24h: 6, sessions7d: 6 }),
      row({ profile: profile([{ composite: 80, daysAgo: 30 }, { composite: 50, daysAgo: 1 }]) }),
      row({ profile: profile([{ composite: 88, daysAgo: 1 }]) }),
      row({ profile: emptyProfile('x') }),
      row({ profile: emptyProfile('x'), lastScreenAt: ago(30), lastCoachedAt: ago(20) }),
    ];
    const offenders: string[] = [];
    for (const r of rows) {
      for (const f of flagsFor(r, NOW)) {
        for (const bad of CLINICAL) {
          if (`${f.observed} ${f.action}`.toLowerCase().includes(bad)) offenders.push(`${f.kind}: "${bad}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every flag carries a single action a coach can take', () => {
    for (const r of [row({ lastActiveAt: null }), row({ sessions24h: 6, sessions7d: 6 }), row({ profile: profile([{ composite: 85, daysAgo: 1 }]) })]) {
      for (const f of flagsFor(r, NOW)) {
        expect(f.action.length, f.kind).toBeGreaterThan(10);
        expect(f.observed.length, f.kind).toBeGreaterThan(8);
        expect(f.urgency).toBeGreaterThan(0);
        expect(f.urgency).toBeLessThanOrEqual(100);
      }
    }
  });

  it('PROGRESSION_COMPOSITE is a threshold a real athlete reaches', () => {
    expect(PROGRESSION_COMPOSITE).toBeGreaterThan(50);
    expect(PROGRESSION_COMPOSITE).toBeLessThan(90);
  });
});
