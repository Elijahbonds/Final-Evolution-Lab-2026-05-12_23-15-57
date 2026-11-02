// PLAT-P06 (2026-10-28): fromCoachToday — a coach's session as the REAL route serves it (GET /api/coach/me/today over the
// in-memory store, the today-route fixture: a prep item, a key set, a superset, a timed carry) → the phase-1 player's
// Session. Running order, supersets set for set, timed rows, the key set / easier / coach note in the step's note, held
// items left out, FEL's warm-up first and cool-down last; and what Set done writes into Today's drafts.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ user: 'client-1' as string | null, store: null as unknown as import('@/lib/coach/todayMemoryDb').TodayStore }));
vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', async () => {
  const { todayMemoryDb } = await import('@/lib/coach/todayMemoryDb');
  return { prisma: new Proxy({}, { get: (_t, k) => (todayMemoryDb(h.store) as Record<string | symbol, unknown>)[k] }) };
});

import { GET as todayGET } from '@/app/api/coach/me/today/route';
import { catalogueRow, newTodayStore, seedProgram } from '@/lib/coach/todayMemoryDb';
import { fromCoachToday, slotSet } from '@/lib/session-player/fromCoachToday';
import { doseParts } from '@/lib/session-player/dose';
import { generateCooldown, needsAutoCooldown } from '@/lib/coach/cooldown';
import { FALLBACK_WARMUP_CONTEXT } from '@/lib/coach/warmup';
import { planFor } from '@/components/coach/warmup-prep';
import { KEY_SET_LINE } from '@/lib/coach/today';
import { emptySetDraft } from '@/lib/coach/setLog';
import { prefillRow, previousPosition, resumeState } from '@/components/session-player/coach-player';
import { totalSets } from '@/lib/session-player/model';
import type { TodayPayloadPlus } from '@/lib/coach/coachReply';

let SE: string[][] = [];
async function today(): Promise<TodayPayloadPlus> { h.user = 'client-1'; return (await todayGET()).json(); }

beforeEach(() => {
  h.store = newTodayStore();
  h.store.user.push({ id: 'coach-1', name: 'Coach One', email: 'c1@x.test' }, { id: 'client-1', name: 'Sam', email: 'sam@x.test', dobYear: 1990 });
  h.store.pe.push(
    catalogueRow({ id: 'pe-goblet', coachId: 'coach-1', name: 'Goblet Squat', pattern: 'squat', primaryCues: ['Elbows inside the knees'], regressionOfId: 'pe-box' }),
    catalogueRow({ id: 'pe-box', coachId: 'coach-1', name: 'Box Squat' }),
    catalogueRow({ id: 'pe-split', coachId: 'coach-1', name: 'Split Squat', pattern: 'lunge' }),
    catalogueRow({ id: 'pe-row', coachId: 'coach-1', name: 'Half-kneeling Row', pattern: 'pull' }),
    catalogueRow({ id: 'pe-carry', coachId: 'coach-1', name: 'Suitcase Carry', pattern: 'carry' }),
  );
  ({ exerciseIds: SE } = seedProgram(h.store, {
    coachId: 'coach-1', clientId: 'client-1', name: 'Base block', blockLabel: 'Week 1',
    sessions: [{ order: 1, label: 'Day 1', exercises: [
      { exerciseId: 'pe-carry', section: 'finish', sets: 2, reps: '30 s', workSeconds: 30, load: '24kg', restSeconds: 60 },
      { exerciseId: 'pe-goblet', section: 'key', isKeySet: true, sets: 3, reps: '8-10', load: 'RPE7', restSeconds: 90, coachNote: 'Own the bottom.', setupCues: ['tripod-down'] },
      { exerciseId: 'pe-split', section: 'assist', supersetGroup: 'A', sets: 3, reps: '8 each', restSeconds: 75 },
      { exerciseId: 'pe-row', section: 'assist', supersetGroup: 'A', sets: 2, reps: '10', restSeconds: 75 },
    ] }],
  }));
});

describe('fromCoachToday over the served session', () => {
  it('running order; the key set with its dose, cue, set-up and the route\'s own lines; the superset alternates; the timed carry counts down', async () => {
    const p = await today();
    const { session, refs, cooldown } = fromCoachToday(p.today!, { clips: { [SE[0][1]]: 'ex_squat' } });
    expect(session.title).toBe('Week 1 · Day 1');
    expect(session.steps.map((s) => s.name)).toEqual([
      'Goblet Squat',
      'A1 Split Squat', 'A2 Half-kneeling Row', 'A1 Split Squat', 'A2 Half-kneeling Row', 'A1 Split Squat',
      'Suitcase Carry',
    ]);
    const key = session.steps[0];
    expect(key).toMatchObject({ sets: 3, reps: '8-10 @ RPE7', restSeconds: 90, cue: 'Elbows inside the knees', clip: 'ex_squat', workSeconds: null });
    expect(doseParts(key)).toEqual({ big: '3 × 8-10', small: '@ RPE7' });
    expect(key.setup).toBe('Heel, big toe, little toe: press all three into the floor.');
    expect(key.note).toContain('Own the bottom.');
    expect(key.note).toContain(KEY_SET_LINE);
    expect(key.note).toContain('Easier version: Box Squat.');
    // the superset: one set per step, no rest between members, the coach's rest after each round
    expect(session.steps.slice(1, 6).map((s) => [s.sets, s.restSeconds])).toEqual([[1, 0], [1, 75], [1, 0], [1, 75], [1, 75]]);
    expect(refs.slice(1, 6)).toEqual([
      { kind: 'exercise', slot: SE[0][2], setOffset: 0 }, { kind: 'exercise', slot: SE[0][3], setOffset: 0 },
      { kind: 'exercise', slot: SE[0][2], setOffset: 1 }, { kind: 'exercise', slot: SE[0][3], setOffset: 1 },
      { kind: 'exercise', slot: SE[0][2], setOffset: 2 },
    ]);
    const carry = session.steps[6];
    expect(carry).toMatchObject({ sets: 2, workSeconds: 30, restSeconds: 60, clip: null });
    expect(doseParts(carry)).toEqual({ big: '2 × 30 s', small: '@ 24kg' });
    // every set the coach wrote, exactly once
    expect(totalSets(session)).toBe(3 + 3 + 2 + 2);
    expect(cooldown).toBe(false);
    // a player position → the Today slot and set it logs to
    expect(slotSet(refs, 0, 2)).toEqual({ slot: SE[0][1], index: 1 });
    expect(slotSet(refs, 3, 1)).toEqual({ slot: SE[0][2], index: 1 });
  });

  it("FEL's warm-up runs first and its cool-down last, as timed steps; a coach's own Prep or Cool-down is the caller's to keep", async () => {
    const p = await today();
    const ex = p.today!.session.exercises;
    const warm = planFor(ex, FALLBACK_WARMUP_CONTEXT, 14, null);
    expect(needsAutoCooldown(ex, 'training')).toBe(true);
    const cool = generateCooldown(ex);
    const { session, refs, cooldown } = fromCoachToday(p.today!, { warmup: warm, cooldown: cool });
    expect(session.steps.slice(0, warm.steps.length).map((s) => s.name)).toEqual(warm.steps.map((s) => s.name));
    expect(session.steps.slice(-cool.steps.length).map((s) => s.name)).toEqual(cool.steps.map((s) => s.name));
    for (const s of [...session.steps.slice(0, warm.steps.length), ...session.steps.slice(-cool.steps.length)]) {
      expect(s.sets).toBe(1);
      expect(s.workSeconds).toBeGreaterThan(0);
      expect(s.clip).toBeNull();                           // no borrowed movement: the still pose until demo-loops adds one
    }
    expect(refs[0]).toEqual({ kind: 'warmup', id: warm.steps[0].id });
    expect(refs[refs.length - 1]).toEqual({ kind: 'cooldown', id: cool.steps[cool.steps.length - 1].id });
    expect(slotSet(refs, 0, 1)).toBeNull();
    expect(cooldown).toBe(true);
  });

  it('a held item is never played (the gate keeps it in session.held, out of exercises)', async () => {
    const p = await today();
    const held = { ...p.today!, session: { ...p.today!.session, held: [{ id: 'x', name: 'Depth Drop', line: 'held', href: null, reason: 'r' }] } };
    expect(fromCoachToday(held).session.steps.map((s) => s.name)).not.toContain('Depth Drop');
  });
});

describe('Set done writes the set into Today\'s drafts', () => {
  it('this session\'s set before it, else the plan; a timed row its seconds; a row already typed is kept', async () => {
    const p = await today();
    const goblet = p.today!.session.exercises.find((e) => e.name === 'Goblet Squat')!;
    const carry = p.today!.session.exercises.find((e) => e.name === 'Suitcase Carry')!;
    const rows = [emptySetDraft(), emptySetDraft(), emptySetDraft()];
    expect(prefillRow(goblet, rows, 0)).toMatchObject({ reps: '8', weight: '' });
    rows[0] = { ...rows[0], reps: '9', weight: '24' };
    expect(prefillRow(goblet, rows, 1)).toMatchObject({ reps: '9', weight: '24' });
    expect(prefillRow(goblet, rows, 0)).toBe(rows[0]);
    expect(prefillRow(carry, [emptySetDraft()], 0)).toMatchObject({ workSeconds: '30', reps: '' });
  });

  it('the rest knows the set just done; a resumed session opens on the ready count over the set it stood at', () => {
    const s = { steps: [{ sets: 3 }, { sets: 1 }] } as never;
    expect(previousPosition(s, 0, 2)).toEqual({ step: 0, set: 1 });
    expect(previousPosition(s, 1, 1)).toEqual({ step: 0, set: 3 });
    expect(previousPosition(s, 0, 1)).toBeNull();
    expect(resumeState({ sessionId: 's', step: 1, set: 1, setsDone: 3, elapsedMs: 90_000, at: 0 })).toMatchObject({ phase: 'ready', step: 1, set: 1, setsDone: 3, elapsedMs: 90_000, paused: false });
  });
});
