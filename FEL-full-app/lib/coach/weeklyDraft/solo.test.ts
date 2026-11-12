// COACH-AI-DRAFT (2026-10-24): solo drafts — off by default, and the safe limits when they are on.
import { describe, expect, it } from 'vitest';
import { draftForClient } from './rules';
import { soloDraftsEnabled, soloLimits, SOLO_HELD_WHY } from './solo';
import { CATALOGUE, adult, exposure, program } from '@/tests/helpers/weeklyDraftFixtures';

describe('solo drafts', () => {
  it('are off unless the flag is exactly "true"', () => {
    expect(soloDraftsEnabled({})).toBe(false);
    for (const v of ['1', 'TRUE', 'yes', ' true']) expect(soloDraftsEnabled({ COACH_SOLO_DRAFTS_ENABLED: v })).toBe(false);
    expect(soloDraftsEnabled({ COACH_SOLO_DRAFTS_ENABLED: 'true' })).toBe(true);
  });

  it('keep the safe changes and one volume step; a load step is held', () => {
    const tree = program();
    tree.tree.blocks[1].sessions[1].exercises[0].sets = 4;
    const d = draftForClient(adult({
      program: tree,
      exposures: [
        exposure('pe-tbdl', 3, [10, 10, 10], 6, { load: '60 kg' }), exposure('pe-tbdl', 10, [10, 10, 10], 6, { load: '60 kg' }),
        exposure('pe-push', 2, [12, 12, 12, 12], 6, { sets: 4, reps: '8-12', load: '' }), exposure('pe-push', 9, [12, 12, 12, 12], 6, { sets: 4, reps: '8-12', load: '' }),
        exposure('pe-goblet', 2, [8, 7, 6], 9), exposure('pe-goblet', 9, [8, 7, 7], 9),
      ],
    }));
    const s = soloLimits(d, CATALOGUE);
    expect(s.changes.map((c) => c.kind).sort()).toEqual(['progress_volume', 'regress_load']);
    expect(s.held.find((h) => h.title.startsWith('Trap-bar deadlift'))?.why).toBe(SOLO_HELD_WHY);
  });

  it('a teen gets no solo draft', () => {
    expect(soloLimits(draftForClient(adult({ band: 'teen', pain: null })), CATALOGUE)).toMatchObject({ status: 'skipped', changes: [] });
  });
});
