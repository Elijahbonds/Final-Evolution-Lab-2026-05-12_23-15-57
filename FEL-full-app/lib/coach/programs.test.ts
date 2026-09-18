import { describe, expect, it } from 'vitest';
import { programSchedule, validateProgramCreate } from './programs';

describe('coach program creation payload', () => {
  it('requires a program name and client lookup', () => {
    expect(validateProgramCreate({ clientId: 'u1' })).toEqual({ ok: false, error: 'name_required' });
    expect(validateProgramCreate({ name: 'Vertical Block' })).toEqual({ ok: false, error: 'client_required' });
  });

  it('cleans and caps program duration and sessions', () => {
    const result = validateProgramCreate({
      name: '  12 Week Strength Block  ',
      clientEmail: ' athlete@example.com ',
      durationWeeks: 99,
      sessionsPerWeek: 12,
    });
    expect(result).toMatchObject({
      ok: true,
      program: {
        name: '12 Week Strength Block',
        clientLookup: 'athlete@example.com',
        durationWeeks: 12,
        sessionsPerWeek: 7,
      },
    });
    expect(result.ok && result.program.blocks).toHaveLength(12);
  });

  it('builds ordered week/session defaults', () => {
    expect(programSchedule(2, 2)).toEqual([
      { order: 1, label: 'Week 1', sessions: [{ order: 1, label: 'Session 1' }, { order: 2, label: 'Session 2' }] },
      { order: 2, label: 'Week 2', sessions: [{ order: 1, label: 'Session 1' }, { order: 2, label: 'Session 2' }] },
    ]);
  });
});
