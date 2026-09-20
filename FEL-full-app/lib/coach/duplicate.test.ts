import { describe, expect, it } from 'vitest';
import { draftCopy, draftSquad, rebaseTargetDate } from './duplicate';
import type { ProgramTree } from './loop';

const SRC: ProgramTree = {
  id: 'p1', name: 'Vertical block', coachId: 'coach', clientId: 'ama',
  blocks: [
    {
      id: 'b1', order: 1, label: 'Week 1', targetDate: '2026-03-02T00:00:00.000Z',
      sessions: [{
        id: 's1', order: 1, label: 'Lower', exercises: [
          { id: 'x1', order: 1, name: 'Trap bar jump', sets: 4, reps: '3', load: '30%', tempo: 'X', restSeconds: 120, coachNote: 'fast off the floor' },
          { id: 'x2', order: 2, name: 'Split squat', sets: 3, reps: '8', load: 'BW', tempo: '31X1', restSeconds: 90, coachNote: null },
        ],
      }],
    },
    {
      id: 'b2', order: 2, label: 'Week 4', targetDate: '2026-03-23T00:00:00.000Z',
      sessions: [{ id: 's2', order: 1, label: 'Upper', exercises: [] }],
    },
  ],
};
const START = new Date('2026-06-01T00:00:00.000Z');

describe('copying a program', () => {
  it('carries the thinking: blocks, sessions, prescriptions and the coach notes', () => {
    const d = draftCopy(SRC, 'bo', { startDate: START });
    expect(d.clientId).toBe('bo');
    expect(d.coachId).toBe('coach');
    expect(d.blocks).toHaveLength(2);
    const ex = d.blocks[0].sessions[0].exercises;
    expect(ex[0]).toMatchObject({ name: 'Trap bar jump', sets: 4, reps: '3', coachNote: 'fast off the floor' });
    expect(ex).toHaveLength(2);
  });

  it('drops the first athlete\'s ids so nothing points back at their program', () => {
    const d = draftCopy(SRC, 'bo', { startDate: START });
    const ex = d.blocks[0].sessions[0].exercises[0] as Record<string, unknown>;
    expect(ex.id).toBeUndefined();
  });

  it('rebases the dates and KEEPS THE GAPS — week 4 still lands three weeks after week 1', () => {
    const d = draftCopy(SRC, 'bo', { startDate: START });
    expect(d.blocks[0].targetDate).toBe('2026-06-01T00:00:00.000Z');
    expect(d.blocks[1].targetDate).toBe('2026-06-22T00:00:00.000Z');   // +21 days, as in the source
  });

  it('a program with no dates stays undated rather than inventing them', () => {
    const undated: ProgramTree = { ...SRC, blocks: SRC.blocks.map((b) => ({ ...b, targetDate: null })) };
    expect(draftCopy(undated, 'bo', { startDate: START }).blocks[0].targetDate).toBeNull();
    expect(rebaseTargetDate(null, Date.now(), START)).toBeNull();
    expect(rebaseTargetDate('not-a-date', Date.now(), START)).toBeNull();
  });

  it('names the copy from a template', () => {
    expect(draftCopy(SRC, 'bo', { startDate: START }).name).toBe('Vertical block');
    expect(draftCopy(SRC, 'bo', { startDate: START, nameTemplate: '{name} — June' }).name).toBe('Vertical block — June');
  });
});

describe('assigning to a squad', () => {
  it('writes one copy per athlete', () => {
    const { drafts, skipped } = draftSquad(SRC, ['bo', 'cy', 'di'], { startDate: START });
    expect(drafts.map((d) => d.clientId)).toEqual(['bo', 'cy', 'di']);
    expect(skipped).toEqual([]);
  });

  it('skips anyone who already has it — a second tap owes nobody an explanation', () => {
    const { drafts, skipped } = draftSquad(SRC, ['bo', 'cy'], { startDate: START }, ['cy']);
    expect(drafts.map((d) => d.clientId)).toEqual(['bo']);
    expect(skipped).toEqual(['cy']);
  });

  it('never assigns a coach their own program, and never doubles a repeated id', () => {
    const { drafts, skipped } = draftSquad(SRC, ['coach', 'bo', 'bo'], { startDate: START });
    expect(drafts.map((d) => d.clientId)).toEqual(['bo']);
    expect(skipped).toEqual(['coach']);
  });
});
