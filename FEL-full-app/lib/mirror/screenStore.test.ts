import { describe, expect, it } from 'vitest';
import { readStoredScreen, storedScreen, storedScreenId } from './screenStore';
import { scoreScreen, type CheckResult } from './screen';
import { prescribeFromScreen } from '../coach/mirrorToProgram';

const results: CheckResult[] = [
  { checkId: 'kneeWindow', grade: 'fail', side: 'left', source: 'camera' },
  { checkId: 'heelLine', grade: 'borderline', source: 'camera' },
  { checkId: 'hipLevel', grade: 'pass', source: 'camera' },
];
const summary = scoreScreen('modified', results);

describe('a stored screen survives the round trip', () => {
  it('writes what the reader can read', () => {
    const back = readStoredScreen(storedScreen('s1', 'modified', results, summary));
    expect(back).not.toBeNull();
    expect(back!.results).toHaveLength(results.length);
    expect(back!.summary.redFlags).toBe(summary.redFlags);
  });

  it('survives the JSON column it actually lives in', () => {
    // Prisma stores this as Json; anything that does not survive stringify/parse is not really stored.
    const back = readStoredScreen(JSON.parse(JSON.stringify(storedScreen('s1', 'full', results, summary))));
    expect(back?.screen).toBe('full');
    expect(back?.summary.triage).toBe(summary.triage);
  });

  it('feeds the prescriber that is the point of keeping it', () => {
    const back = readStoredScreen(storedScreen('s1', 'modified', results, summary))!;
    const drafted = prescribeFromScreen(
      { meaning: back.summary.meaning, suggestions: back.summary.suggestions, findings: back.results },
      [{ id: 'e1', name: 'Knee tracking wall drill' }],
    );
    expect(drafted.length).toBeGreaterThan(0);
    expect(drafted[0].findingId).toBe('kneeWindow');   // the fail, and the one-sided one, comes first
    expect(drafted[0].because).toContain('left');
  });
});

describe('readStoredScreen refuses what it cannot use', () => {
  it('treats a half-written row as NO screen, not as an empty one', () => {
    // "no findings" and "cannot be read" must not look the same to a coach.
    expect(readStoredScreen({ screenId: 's', results: [] })).toBeNull();
    expect(readStoredScreen({ screenId: 's', results, summary: { meaning: [] } })).toBeNull();
    expect(readStoredScreen({ screenId: 's', summary })).toBeNull();
  });

  it('refuses junk rather than throwing on it', () => {
    for (const junk of [null, undefined, 0, '', 'screen', [], {}]) {
      expect(readStoredScreen(junk)).toBeNull();
    }
  });

  it('refuses results that are not results', () => {
    expect(readStoredScreen({ results: [{ nope: true }], summary })).toBeNull();
  });
});

describe('storedScreenId', () => {
  it('reads the id back so a retried post is one screen, not two', () => {
    expect(storedScreenId(storedScreen('abc', 'modified', results, summary))).toBe('abc');
  });
  it('is null when there is nothing to dedupe on', () => {
    expect(storedScreenId(null)).toBeNull();
    expect(storedScreenId({ screenId: '' })).toBeNull();
    expect(storedScreenId({ screenId: 7 })).toBeNull();
  });
});
