// COACH-READINESS: Today's session under today's jump check, through the real loadToday (lib/coach/todayServer.ts) over
// the Today harness's in-memory database. Low + "ease off": the work rows ease, never harder, Prep and timed rows as
// written, the note says why; Low + "tell me only", Normal, or no check: the session is exactly what it was.
import { describe, expect, it } from 'vitest';
import { loadToday, type TodayPayload } from '@/lib/coach/todayServer';
import { catalogueRow, newTodayStore, seedProgram, todayMemoryDb } from '@/lib/coach/todayMemoryDb';
import { DEFAULT_RULE } from '@/lib/coach/readiness/rules';
import { neverHarder } from '@/lib/coach/readiness/ease';
import type { TodayReadiness } from '@/lib/coach/readiness/types';

function store() {
  const s = newTodayStore();
  s.user.push({ id: 'coach-1', name: 'Coach One', email: 'c1@x.test' }, { id: 'client-1', name: 'Sam', email: 'sam@x.test', dobYear: 1990 });
  s.pe.push(
    catalogueRow({ id: 'pe-squat', coachId: 'coach-1', name: 'Back Squat', pattern: 'squat' }),
    catalogueRow({ id: 'pe-split', coachId: 'coach-1', name: 'Split Squat' }),
    catalogueRow({ id: 'pe-carry', coachId: 'coach-1', name: 'Suitcase Carry' }),
    catalogueRow({ id: 'pe-flow', coachId: 'coach-1', name: '90/90 Hip Switch' }),
    catalogueRow({ id: 'pe-breath', coachId: 'coach-1', name: 'Box Breathing', pattern: 'breath' }),
  );
  seedProgram(s, {
    coachId: 'coach-1', clientId: 'client-1', name: 'Base block', blockLabel: 'Week 1',
    sessions: [{ order: 1, label: 'Day 1', exercises: [
      { exerciseId: 'pe-flow', section: 'prep', sets: 2, reps: '6 each side', load: 'body' },
      { exerciseId: 'pe-squat', section: 'key', isKeySet: true, sets: 4, reps: '5', load: '100 kg', effortBand: 'surge' },
      { exerciseId: 'pe-split', section: 'assist', sets: 3, reps: '8 each', load: 'RPE 7' },
      { exerciseId: 'pe-carry', section: 'finish', sets: 3, reps: '30 s', workSeconds: 30, load: '24kg' },
      { exerciseId: 'pe-breath', section: 'finish', sets: 2, reps: '1 min', load: '' },
    ] }],
  });
  return s;
}
const rd = (o: Partial<TodayReadiness> = {}): TodayReadiness => ({ band: 'low', reason: 'low_drop', ease: true, dropPct: 9.2, feel: null, baselineN: 6, rule: DEFAULT_RULE, coachTold: true, shared: true, day: '2026-10-25', ...o });
const load = (r: TodayReadiness | null) => loadToday(todayMemoryDb(store()) as never, 'client-1', new Date('2026-10-25T15:00:00Z'), { readiness: async () => r });
const by = (p: TodayPayload) => Object.fromEntries(p.today!.session.exercises.map((e) => [e.name, e]));

describe('Today under the readiness check', () => {
  it('no check, Normal, or "tell me only": served exactly as written, no note', async () => {
    const plain = await loadToday(todayMemoryDb(store()) as never, 'client-1', new Date('2026-10-25T15:00:00Z'));
    for (const r of [null, rd({ band: 'normal', reason: 'steady', ease: false }), rd({ ease: false, rule: { ...DEFAULT_RULE, action: 'tell' } })]) {
      const p = await load(r);
      expect(p.today!.session.exercises).toEqual(plain.today!.session.exercises);
      if (r?.band === 'low') expect(p.today!.readiness).toMatchObject({ band: 'low', eased: [] });
      else expect(p.today!.readiness).toBeUndefined();
    }
  });

  it('Low and "ease off": the work rows ease (the deload step), never harder; prep, timed and breath rows as written', async () => {
    const plain = by(await loadToday(todayMemoryDb(store()) as never, 'client-1', new Date('2026-10-25T15:00:00Z')));
    const p = await load(rd());
    const e = by(p);
    expect(e['Back Squat']).toMatchObject({ sets: 3, load: '90 kg', effortBand: 'surge' });
    expect(e['Split Squat']).toMatchObject({ sets: 2, load: 'RPE 6' });
    expect(e['90/90 Hip Switch']).toEqual(plain['90/90 Hip Switch']);
    expect(e['Suitcase Carry']).toEqual(plain['Suitcase Carry']);
    expect(e['Box Breathing']).toEqual(plain['Box Breathing']);
    for (const name of Object.keys(e)) {
      expect(neverHarder(plain[name], e[name])).toBe(true);
      expect(e[name].id).toBe(plain[name].id);   // the same slot: the log saves against what the coach prescribed
    }
    expect(e['Back Squat'].dose).not.toBe(plain['Back Squat'].dose);
    expect(p.today!.readiness).toMatchObject({ band: 'low', label: 'Low', eased: [{ name: 'Back Squat', what: '4 → 3 sets, 100 kg → 90 kg' }, { name: 'Split Squat', what: '3 → 2 sets, RPE 7 → RPE 6' }] });
    expect(p.today!.readiness!.line).toMatch(/Down 9.2% on your normal of the last 6 checks/);
    expect(p.today!.readiness!.next).toMatch(/eased.*Coach One has been told/);
  });

  it('a readiness read that throws serves the session as written (never a 500)', async () => {
    const p = await loadToday(todayMemoryDb(store()) as never, 'client-1', new Date('2026-10-25T15:00:00Z'), { readiness: async () => { throw new Error('db down'); } });
    expect(p.today!.readiness).toBeUndefined();
    expect(by(p)['Back Squat']).toMatchObject({ sets: 4, load: '100 kg' });
  });
});
