// COACH-VIDEO-REVIEW (2026-10-24): what the client's and the coach's screens draw from a scored set.
import { describe, expect, it } from 'vitest';
import { ageLabel, repChips, replayPick } from './view';
import { flagsFor, scoreReps } from './score';

const reps = scoreReps('squat', [
  { n: 1, startMs: 0, endMs: 1, faults: [], read: true },
  { n: 2, startMs: 0, endMs: 1, faults: ['heelRise'], read: true },
  { n: 3, startMs: 0, endMs: 1, faults: ['kneeValgus'], sides: { kneeValgus: 'left' }, read: true },
  { n: 4, startMs: 0, endMs: 1, faults: [], read: false },
]);
const flags = flagsFor('squat', reps);

describe('the rep strip', () => {
  it('clean, flagged, a minor fault, not read — each with its words', () => {
    expect(repChips('squat', reps, flags).map((c) => [c.n, c.tone, c.title])).toEqual([
      [1, 'clean', 'Rep 1: clean'], [2, 'minor', 'Rep 2: Heels lift'], [3, 'flagged', 'Rep 3: Left knee caves'], [4, 'unread', 'Rep 4: not read from this angle'],
    ]);
  });
});

describe('the replay pick', () => {
  it('opens on the worst flag with its ringed side, beside the best read rep', () => {
    expect(replayPick(reps, flags)).toEqual({
      rep: { n: 3, label: 'Rep 3 (flagged)', fault: 'kneeValgus', side: 'left' },
      best: { n: 1, label: 'Rep 1 (best)', fault: null, side: null },
    });
  });
  it('a clean set opens on its first read rep; nothing read, nothing to show', () => {
    const clean = scoreReps('squat', [{ n: 1, startMs: 0, endMs: 1, faults: [], read: true }, { n: 2, startMs: 0, endMs: 1, faults: [], read: true }]);
    expect(replayPick(clean, [])?.rep.n).toBe(1);
    expect(replayPick(scoreReps('squat', [{ n: 1, startMs: 0, endMs: 1, faults: [], read: false }]), [])).toBeNull();
  });
});

it('ageLabel', () => {
  const now = Date.UTC(2026, 9, 24, 12);
  expect(ageLabel(new Date(now - 10 * 60_000).toISOString(), now)).toBe('just now');
  expect(ageLabel(new Date(now - 5 * 3_600_000).toISOString(), now)).toBe('5 h ago');
  expect(ageLabel(new Date(now - 50 * 3_600_000).toISOString(), now)).toBe('2 d ago');
});
