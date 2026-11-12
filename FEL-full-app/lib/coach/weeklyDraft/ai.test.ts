// COACH-AI-DRAFT (2026-10-24): the AI layer adds words and order, never a change — whatever the model says.
import { describe, expect, it, vi } from 'vitest';
import { aiPayload, aiSystemPrompt, mergeAiReply, parseAiReply, polishWithAi } from './ai';
import { draftForClient } from './rules';
import { NOW, DAY, adult, exposure, hipPrescription } from '@/tests/helpers/weeklyDraftFixtures';

// a week with a sensitive ease-off, a corrective, a regression — and a progression the pain flag HELD
const week = () => draftForClient(adult({
  pain: { present: true, detailed: true, items: [{ exerciseName: 'Split squat', bodyArea: 'knee', decision: 'step_down_flag_coach', atMs: NOW - DAY }] },
  exposures: [
    exposure('pe-tbdl', 3, [10, 10, 10], 6, { load: '60 kg' }), exposure('pe-tbdl', 10, [10, 10, 10], 6, { load: '60 kg' }),
    exposure('pe-goblet', 2, [8, 7, 6], 9), exposure('pe-goblet', 9, [8, 7, 7], 9),
  ],
  screen: { prescriptions: [hipPrescription(true)], atIso: null },
}));

describe('what the model is shown', () => {
  it('only non-sensitive changes, as program edits — no name, no client, no pain, no logged numbers', () => {
    const d = week();
    const p = aiPayload(d);
    const text = JSON.stringify(p);
    expect(p.changes.length).toBeGreaterThan(0);
    expect(p.changes.every((c) => !d.changes.find((x) => x.id === c.id)!.sensitive)).toBe(true);
    for (const banned of ['Jordan', 'client-1', 'knee', 'pain', 'effort', 'Split squat (knee)']) expect(text).not.toContain(banned);
    expect(d.held.length).toBeGreaterThan(0);
    for (const h of d.held) expect(text).not.toContain(h.title);
  });

  it('the system prompt carries the method and the pain-safety addendum', () => {
    const s = aiSystemPrompt();
    expect(s).toMatch(/Assess → Correct → Load → Perform/);
    expect(s).toMatch(/Technique before load/);
    expect(s).toMatch(/not a clinician/);
  });
});

describe('the AI cannot add, revive or alter a change', () => {
  it('a reply that invents a progression, reranks and rewrites a held one is read for its notes on the sent ids only', () => {
    const d = week();
    const sent = aiPayload(d).changes;
    const reply = JSON.stringify({
      summary: 'Ease the lower body, add the hip work, keep the upper body.',
      changes: [
        { id: sent[0].id, rank: 2, note: 'Prep first: it sets up the rest.' },
        { id: 'progress_load-made-up', rank: 1, note: 'Add 10 kg to the deadlift.', ops: [{ action: 'update', sessionExerciseId: 'A2-pe-tbdl', after: { load: '70 kg' } }] },
        { id: d.held[0].title, rank: 0, note: 'Do this anyway.' },
        ...(sent[1] ? [{ id: sent[1].id, rank: 1, note: 'Fine as drafted.', safety: 'safe', kind: 'progress_load', ops: [] }] : []),
      ],
    });
    const m = mergeAiReply(d, parseAiReply(reply));
    expect(m.changes.map((c) => c.id).sort()).toEqual(d.changes.map((c) => c.id).sort());
    for (const c of m.changes) {
      const orig = d.changes.find((x) => x.id === c.id)!;
      expect(c.ops).toEqual(orig.ops);
      expect(c.kind).toBe(orig.kind);
      expect(c.safety).toBe(orig.safety);
      expect(c.reason).toBe(orig.reason);
    }
    expect(m.held).toEqual(d.held);
    expect(m.engine).toBe('rules+ai');
    expect(m.summary).toBe('Ease the lower body, add the hip work, keep the upper body.');
    // sensitive changes stay on top and keep their own words
    const firstNonSensitive = m.changes.findIndex((c) => !c.sensitive);
    expect(m.changes.slice(0, firstNonSensitive).every((c) => c.sensitive && !c.aiNote)).toBe(true);
    expect(m.changes.some((c) => c.title.includes('70 kg') || JSON.stringify(c.ops).includes('70 kg'))).toBe(false);
  });

  it('medical words are dropped; the rules’ words stand', () => {
    const d = week();
    const id = aiPayload(d).changes[0].id;
    const m = mergeAiReply(d, parseAiReply(JSON.stringify({ summary: 'Likely tendinitis; rehab the knee.', changes: [{ id, rank: 1, note: 'This will treat the hip.' }] })));
    expect(m.summary).toBeNull();
    expect(m.changes.find((c) => c.id === id)!.aiNote).toBeUndefined();
  });

  it('garbage, a thrown call, or no caller → the rules’ draft, unchanged', async () => {
    const d = week();
    expect(mergeAiReply(d, parseAiReply('not json'))).toBe(d);
    expect(await polishWithAi(d, async () => { throw new Error('timeout'); })).toBe(d);
    expect(await polishWithAi(d, null)).toBe(d);
  });

  it('never called for a teen', async () => {
    const teen = draftForClient(adult({ band: 'teen', pain: null, exposures: [exposure('pe-goblet', 2, [8, 7, 6], 9), exposure('pe-goblet', 9, [8, 7, 7], 9)] }));
    const call = vi.fn(async () => '{}');
    expect(await polishWithAi(teen, call)).toBe(teen);
    expect(call).not.toHaveBeenCalled();
  });
});
