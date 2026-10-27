import { describe, expect, it } from 'vitest';
import { compositeTable } from '../combine/score';
import { DRAFTS_KEY } from '../combine/draft';
import { COACH_STEPS, SAMPLE_LABEL, sampleCombine, stepsDone } from './coachFirstRun';

describe('ONB-03: the coach first run', () => {
  it('is three steps, in order: invite, template, first session', () => {
    expect(COACH_STEPS.map((s) => s.id)).toEqual(['invite', 'template', 'session']);
    expect([...stepsDone(false)]).toEqual([]);
    expect([...stepsDone(true)]).toEqual(['invite']);
  });

  it('builds a three-athlete sample combine the real report can rank, labelled as sample data', () => {
    const ev = sampleCombine(Date.UTC(2026, 9, 25));
    expect(ev.athletes).toHaveLength(3);
    expect(ev.athletes.every((a) => a.name.startsWith('Sample athlete'))).toBe(true);
    expect(ev.teamName).toBe(SAMPLE_LABEL);
    expect(ev.serverId).toBeNull();
    expect(ev.stations.map((s) => s.kind)).toEqual(['cmj', 'sprint', 'agility']);
    for (const a of ev.athletes) for (const s of ev.stations) {
      expect(ev.results[a.id]?.[s.id]?.every((slot) => slot && typeof slot.value === 'number'), `${a.id} ${s.id}`).toBe(true);
    }
    const board = compositeTable(ev, ev.weights);
    expect(board).toHaveLength(3);
  });

  it('touches no storage: the sample is never a draft on the phone', () => {
    const writes: string[] = [];
    const g = globalThis as unknown as { localStorage?: unknown };
    const before = g.localStorage;
    g.localStorage = { getItem: () => null, setItem: (k: string) => { writes.push(k); }, removeItem: () => {} };
    try { sampleCombine(); } finally { g.localStorage = before; }
    expect(writes).not.toContain(DRAFTS_KEY);
    expect(writes).toEqual([]);
  });
});
