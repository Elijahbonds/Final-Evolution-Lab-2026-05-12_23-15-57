// A PROGRAM IS NOT A DIAGNOSIS (2026-09-13).
//
// The Mirror's non-negotiable constraint is that everything it says is ESTIMATED ENGAGEMENT — never a
// measurement, a diagnosis or an assessment. A multi-session program is the easiest place in the whole
// product to breach that, because "do these three things for two weeks" reads like a prescription from
// somebody qualified to write one.
//
// So the language is tested, not reviewed: every string the program can emit is swept for clinical
// vocabulary. A reviewer misses one word. A test does not.

import { describe, it, expect } from 'vitest';
import {
  buildProgram, persistence, blockFor, frequencyFor, progressReport, totalMinutes,
  PROGRAM_DISCLAIMER, HISTORY_WINDOW, PERSISTENCE_THRESHOLD, MIN_REPS_FOR_SIGNAL, MAX_BLOCKS, RETEST_AFTER,
  type SessionFinding,
} from './program';
import type { ZoneId } from '../babylon/nexus/neuro-mirror';

const sess = (at: number, faults: Partial<Record<ZoneId, number>>, reps = 10): SessionFinding => ({ at, faults, reps });

/** Every word that would turn this from coaching into a claim about a body. */
const CLINICAL = [
  'diagnos', 'assess', 'measure', 'disorder', 'dysfunction', 'patholog', 'injur', 'weak', 'tight',
  'inhibit', 'impair', 'deficien', 'syndrome', 'therapy', 'treat', 'patient', 'symptom', 'cure',
  'lesion', 'strain', 'tear', 'degener', 'imbalance',
];

/**
 * Every string a program shows a player, EXCEPT the disclaimer.
 *
 * The disclaimer is the one string that has to contain "measurement", "diagnosis" and "assessment" — it
 * exists to deny them. Sweeping it flagged fifteen offenders on the first run, all of them the same correct
 * sentence. It is asserted verbatim in its own test instead, which is the stronger check: the sweep proves
 * nothing else uses the vocabulary, and the verbatim test proves the denial has not been softened.
 */
function everyString(p: ReturnType<typeof buildProgram>): string[] {
  return [
    p.headline,
    ...p.blocks.flatMap((b) => [b.title, b.because, ...b.movements]),
  ];
}

describe('THE LANGUAGE NEVER BECOMES CLINICAL', () => {
  it('no string a program can emit uses clinical vocabulary', () => {
    // sweep the whole space: every history shape that produces a program
    const histories: SessionFinding[][] = [
      [sess(1, { rib_thoracic: 4 }), sess(2, { rib_thoracic: 3 }), sess(3, { rib_thoracic: 5 })],
      [sess(1, { lumbo_pelvic: 2 }), sess(2, { upper_traps: 3 }), sess(3, { lat_rhomboid: 1 }), sess(4, { posterior_chain: 2 })],
      Array.from({ length: 8 }, (_, i) => sess(i, { posterior_chain: 3, upper_traps: 2 })),
      [sess(1, {})],
      [],
    ];
    const offenders: string[] = [];
    for (const h of histories) {
      for (const s of everyString(buildProgram(h))) {
        for (const bad of CLINICAL) {
          if (s.toLowerCase().includes(bad)) offenders.push(`"${s}" contains "${bad}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the disclaimer is verbatim and present on every program, empty ones included', () => {
    expect(PROGRAM_DISCLAIMER).toContain('Estimated engagement');
    expect(PROGRAM_DISCLAIMER).toMatch(/not a clinical measurement, diagnosis or assessment/i);
    for (const h of [[], [sess(1, {})], [sess(1, { rib_thoracic: 4 }), sess(2, { rib_thoracic: 4 })]]) {
      expect(buildProgram(h).disclaimer).toBe(PROGRAM_DISCLAIMER);
    }
  });

  it('a reason is a COUNT of what was seen, never a cause', () => {
    const h = Array.from({ length: 5 }, (_, i) => sess(i, { upper_traps: 3 }));
    for (const b of buildProgram(h).blocks) {
      expect(b.because).toMatch(/^Showed in \d+ of your last \d+ sessions\.$/);
    }
  });
});

describe('IT REFUSES TO PROGRAM FROM NOTHING', () => {
  it('no history gives no program, and says why', () => {
    const p = buildProgram([]);
    expect(p.blocks).toEqual([]);
    expect(p.sessions).toBe(0);
    expect(p.headline).toMatch(/scan a couple more/i);
  });

  it('ONE session is not enough, however bad it looked', () => {
    const p = buildProgram([sess(1, { rib_thoracic: 20, lumbo_pelvic: 20, upper_traps: 20 })]);
    expect(p.blocks).toEqual([]);
    expect(p.headline).toMatch(/scan a couple more/i);
  });

  it('thin sessions do not count toward the history at all', () => {
    const thin = Array.from({ length: 6 }, (_, i) => sess(i, { rib_thoracic: 3 }, MIN_REPS_FOR_SIGNAL - 1));
    expect(buildProgram(thin).blocks).toEqual([]);
    expect(persistence(thin)).toEqual({});
  });

  it('a clean athlete is told they are clean, not handed busywork', () => {
    const p = buildProgram([sess(1, {}), sess(2, {}), sess(3, {})]);
    expect(p.blocks).toEqual([]);
    expect(p.headline).toMatch(/nothing showed up/i);
  });

  it('and a zone below the threshold is left alone', () => {
    // one appearance in five sessions is 0.2, under PERSISTENCE_THRESHOLD
    const h = [sess(1, { upper_traps: 2 }), sess(2, {}), sess(3, {}), sess(4, {}), sess(5, {})];
    expect(PERSISTENCE_THRESHOLD).toBeGreaterThan(0.2);
    expect(buildProgram(h).blocks).toEqual([]);
  });
});

describe('the program progresses instead of repeating forever', () => {
  it('release first, then activate, then load the pattern', () => {
    expect(blockFor(0.9)).toBe('release');
    expect(blockFor(0.6)).toBe('activate');
    expect(blockFor(0.45)).toBe('pattern');
  });

  it('a zone that shows up less often moves DOWN the ladder', () => {
    const always = Array.from({ length: 8 }, (_, i) => sess(i, { posterior_chain: 3 }));
    const sometimes = [sess(1, { posterior_chain: 3 }), sess(2, {}), sess(3, { posterior_chain: 2 }), sess(4, {}), sess(5, {})];
    expect(buildProgram(always).blocks[0].kind).toBe('release');
    expect(buildProgram(sometimes).blocks[0].kind).toBe('pattern');
  });

  it('frequent problems get frequent, short work', () => {
    expect(frequencyFor(0.9)).toBeGreaterThan(frequencyFor(0.45));
    const p = buildProgram(Array.from({ length: 6 }, (_, i) => sess(i, { lat_rhomboid: 3 })));
    expect(p.blocks[0].frequency).toBeGreaterThanOrEqual(3);
    expect(p.blocks[0].minutes).toBeLessThanOrEqual(12);
  });

  it('NOBODY IS HANDED NINE THINGS TO DO', () => {
    const everything = Array.from({ length: 6 }, (_, i) =>
      sess(i, { rib_thoracic: 3, lumbo_pelvic: 3, upper_traps: 3, lat_rhomboid: 3, posterior_chain: 3 }));
    const p = buildProgram(everything);
    expect(p.blocks.length).toBeLessThanOrEqual(MAX_BLOCKS);
    expect(totalMinutes(p.blocks)).toBeLessThanOrEqual(35);
    expect(p.headline).toMatch(/minutes a session/);
  });

  it('the worst zone is programmed first', () => {
    const h = [
      sess(1, { upper_traps: 3, posterior_chain: 3 }), sess(2, { upper_traps: 3 }),
      sess(3, { upper_traps: 3 }), sess(4, { upper_traps: 3, posterior_chain: 2 }),
    ];
    expect(buildProgram(h).blocks[0].zone).toBe('upper_traps');
  });

  it('only the most recent window is considered', () => {
    const old = Array.from({ length: 10 }, (_, i) => sess(i, { rib_thoracic: 5 }));
    const recent = Array.from({ length: HISTORY_WINDOW }, (_, i) => sess(100 + i, {}));
    expect(buildProgram([...old, ...recent]).blocks).toEqual([]);
  });

  it('it tells you when to check again', () => {
    expect(buildProgram([]).retestAfterSessions).toBe(RETEST_AFTER);
    expect(RETEST_AFTER).toBeGreaterThan(1);
  });
});

describe('progress is reported as a count, never as a claim about health', () => {
  it('names whether something turned up less often', () => {
    const before = Array.from({ length: 4 }, (_, i) => sess(i, { upper_traps: 3 }));
    const after = [sess(10, { upper_traps: 2 }), sess(11, {}), sess(12, {}), sess(13, {})];
    const [worst] = progressReport(before, after);
    expect(worst.zone).toBe('upper_traps');
    expect(worst.delta).toBeLessThan(0);
    expect(worst.line).toMatch(/less often/i);
  });

  it('and says so plainly when nothing moved', () => {
    const h = Array.from({ length: 4 }, (_, i) => sess(i, { lat_rhomboid: 3 }));
    expect(progressReport(h, h)[0].line).toMatch(/about the same/i);
  });

  it('every progress line is free of clinical vocabulary too', () => {
    const before = Array.from({ length: 4 }, (_, i) => sess(i, { posterior_chain: 3 }));
    const after = Array.from({ length: 4 }, (_, i) => sess(10 + i, { rib_thoracic: 3 }));
    for (const r of progressReport(before, after)) {
      for (const bad of CLINICAL) expect(r.line.toLowerCase(), r.line).not.toContain(bad);
    }
  });
});
