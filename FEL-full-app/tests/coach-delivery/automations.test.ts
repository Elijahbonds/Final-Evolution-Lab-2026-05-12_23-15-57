// COACH-DELIVERY COA-01 (2026-10-26): coach automations end to end over the in-memory tables. Each trigger fires once,
// is deduped (a second sweep the same day — and, for join, ever — posts nothing), posts only into an existing program
// thread, and skips a teen without the guardian's coach-training consent with an audit row and no message.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cc = vi.hoisted(() => ({ since: new Date('2026-01-01') as Date | null }));
vi.mock('@/lib/coach/coachConsent', async (orig) => (await import('@/tests/helpers/coachConsent')).coachConsentAt(await orig(), () => cc.since));
vi.mock('@/lib/mail', () => ({ sendMail: vi.fn(async () => { throw new Error('an automation must never email'); }) }));

import { automationAct, automationBoard, runAutomations } from '@/lib/coach/automations/server';
import { cleanAutomation, isDue, ptWeekdayHour, renderMessage } from '@/lib/coach/automations/rules';
import { resetDeliveryProbe } from '@/lib/coach/delivery/probe';
import { resetParityProbe } from '@/lib/coach/parity/probe';
import { resetGroupsProbe } from '@/lib/groups/store';
import { coach, seedPerson } from '@/tests/helpers/fakeParityDb';
import { fakeDeliveryDb, linkAge, program, type FakeDeliveryDb } from '@/tests/helpers/fakeDeliveryDb';

let db: FakeDeliveryDb;
let now: Date;
const anyDb = () => db as never;
const later = (days: number, hours = 0) => new Date(now.getTime() + days * 86_400_000 + hours * 3_600_000);
const create = (body: Record<string, unknown>, coachId = 'c1') => automationAct(anyDb(), coachId, { action: 'create', ...body }, now);

beforeEach(() => {
  resetDeliveryProbe(); resetParityProbe(); resetGroupsProbe();
  cc.since = new Date('2026-01-01');
  db = fakeDeliveryDb();
  now = new Date(db.clock);   // Wed 2026-10-28 11:00 PT
  seedPerson(db, 'ada', 'adult', 'Ada Lane'); seedPerson(db, 'tia', 'teen', 'Tia Moss'); seedPerson(db, 'bo', 'adult', 'Bo Reyes');
  coach(db, 'c1', 'ada', 'tia', 'bo');
  for (const a of ['ada', 'tia', 'bo']) linkAge(db, 'c1', a, 2);
  program(db, 'p-ada', 'c1', 'ada'); program(db, 'p-tia', 'c1', 'tia');   // Bo has no program yet: no thread
});

describe('before the pending SQL is applied', () => {
  it('not available / 503; the sweep does nothing', async () => {
    db.deliveryTables = false;
    expect((await automationBoard(anyDb(), 'c1', now)).body).toEqual({ available: false });
    expect((await create({ trigger: 'join', preset: 'welcome' })).status).toBe(503);
    expect(await runAutomations(anyDb(), {}, now)).toMatchObject({ automations: 0, posted: 0 });
    expect(db.messages).toEqual([]);
  });
});

describe('the coach sets them up', () => {
  it('validates the trigger, the message and the scope; never someone else\'s athlete or team', async () => {
    expect(cleanAutomation({ trigger: 'birthday', preset: 'x' })).toEqual({ ok: false, error: 'trigger' });
    expect(cleanAutomation({ trigger: 'join' })).toEqual({ ok: false, error: 'message_required' });
    expect(cleanAutomation({ trigger: 'weekly', preset: 'new_week' })).toEqual({ ok: false, error: 'weekday' });
    expect(cleanAutomation({ trigger: 'missed', preset: 'check_in', missedN: 9 })).toEqual({ ok: false, error: 'missed_n' });
    expect(cleanAutomation({ trigger: 'join', text: 'x'.repeat(501) })).toEqual({ ok: false, error: 'text_too_long' });
    expect((await create({ trigger: 'join', preset: 'welcome', scope: 'athlete', scopeId: 'stranger' })).body).toEqual({ error: 'not_your_athlete' });
    expect((await create({ trigger: 'join', preset: 'welcome', scope: 'team', scopeId: 'nope' })).body).toEqual({ error: 'not_your_team' });
    expect((await create({ trigger: 'join', preset: 'welcome' })).status).toBe(201);
    const board = (await automationBoard(anyDb(), 'c1', now)).body as { automations: { when: string; reaches: string; preview: string }[] };
    expect(board.automations[0]).toMatchObject({ when: 'When an athlete joins your roster', reaches: 'Everyone on your roster' });
    expect(board.automations[0].preview).toMatch(/^Welcome aboard, Sam!/);
  });

  it('renders the coach\'s own text with the first name', () => {
    expect(renderMessage({ trigger: 'weekly', preset: null, text: 'Big week, {first}!' }, 'Ada Lane')).toBe('Big week, Ada!');
  });
});

describe('on join', () => {
  it('fires once into the existing thread; a second sweep, the next day, posts nothing more', async () => {
    await create({ trigger: 'join', preset: 'welcome' });
    const first = await runAutomations(anyDb(), {}, now);
    expect(first).toMatchObject({ posted: 2, skippedTeen: 0, noThread: 1 });   // Ada, and Tia (consented); Bo has no thread
    expect(db.messages.map((m) => [m.programId, m.authorId, m.body.slice(0, 20)])).toEqual([['p-ada', 'c1', 'Welcome aboard, Ada!'], ['p-tia', 'c1', 'Welcome aboard, Tia!']]);
    expect((await runAutomations(anyDb(), {}, now)).posted).toBe(0);
    expect((await runAutomations(anyDb(), {}, later(1))).posted).toBe(0);
    expect(db.messages).toHaveLength(2);
    expect(db.runs.find((r) => r.athleteId === 'ada')).toMatchObject({ outcome: 'posted', messageId: 'm1', programId: 'p-ada' });
  });

  it('a teen without the guardian\'s coach-training consent is skipped: an audit row, no message, nothing emailed', async () => {
    cc.since = null;   // today's state: every teen fails closed
    await create({ trigger: 'join', preset: 'welcome' });
    await runAutomations(anyDb(), {}, now);
    expect(db.messages.some((m) => m.programId === 'p-tia')).toBe(false);
    expect(db.runs.find((r) => r.athleteId === 'tia')).toMatchObject({ outcome: 'skipped_teen', messageId: null });
  });

  it('a consented teen gets the training-only preset like anyone else', async () => {
    await create({ trigger: 'join', preset: 'welcome' });
    await runAutomations(anyDb(), {}, now);
    expect(db.messages.some((m) => m.programId === 'p-tia' && m.body.startsWith('Welcome aboard, Tia!'))).toBe(true);
  });

  it('no thread, no message and no run row — it fires once the first program arrives, inside the window', async () => {
    await create({ trigger: 'join', preset: 'welcome', scope: 'athlete', scopeId: 'bo' });
    expect((await runAutomations(anyDb(), {}, now)).noThread).toBe(1);
    expect(db.runs).toEqual([]);
    program(db, 'p-bo', 'c1', 'bo', { startedDaysAgo: 0 });
    expect((await runAutomations(anyDb(), {}, later(1))).posted).toBe(1);
    expect(db.messages.map((m) => m.programId)).toEqual(['p-bo']);
  });

  it('an athlete who joined long ago is not greeted by a new join automation; one off the roster never is', async () => {
    linkAge(db, 'c1', 'ada', 30);
    db.links.find((l) => l.clientId === 'tia')!.endedAt = new Date(0);
    await create({ trigger: 'join', preset: 'welcome' });
    expect((await runAutomations(anyDb(), {}, now)).posted).toBe(0);
  });
});

describe('after N missed sessions', () => {
  it('fires when the plan\'s missed sessions reach N (lib/coach/alerts.ts), then not again for 7 days', async () => {
    await create({ trigger: 'missed', preset: 'check_in', missedN: 2, scope: 'athlete', scopeId: 'ada' });
    db.clientSessions.push({ programId: 'p-ada', clientId: 'ada', completedAt: later(-2) });   // 1 of 3 planned this week
    expect((await runAutomations(anyDb(), {}, now)).posted).toBe(1);
    expect(db.messages[0].body).toMatch(/^Hey Ada, a couple of sessions slipped/);
    expect((await runAutomations(anyDb(), {}, later(3))).posted).toBe(0);
    expect((await runAutomations(anyDb(), {}, later(7))).posted).toBe(1);
  });

  it('does not fire while the athlete keeps up, or for a program under a week old', async () => {
    await create({ trigger: 'missed', preset: 'check_in', missedN: 2, scope: 'athlete', scopeId: 'ada' });
    for (const d of [1, 3, 5]) db.clientSessions.push({ programId: 'p-ada', clientId: 'ada', completedAt: later(-d) });
    expect((await runAutomations(anyDb(), {}, now)).posted).toBe(0);
    db.clientSessions.length = 0;
    db.programs.find((p) => p.id === 'p-ada')!.startDate = later(-3);
    expect((await runAutomations(anyDb(), {}, now)).posted).toBe(0);
  });
});

describe('weekly', () => {
  it('fires on the coach\'s weekday at or after their hour (PT), once that day', async () => {
    expect(ptWeekdayHour(now)).toEqual({ weekday: 3, hour: 11 });
    await create({ trigger: 'weekly', preset: 'new_week', weekday: 3, hour: 9, scope: 'athlete', scopeId: 'ada' });
    await create({ trigger: 'weekly', preset: 'new_week', weekday: 3, hour: 15, scope: 'athlete', scopeId: 'ada' });
    expect((await runAutomations(anyDb(), {}, now)).posted).toBe(1);
    expect((await runAutomations(anyDb(), {}, now)).posted).toBe(0);
    expect((await runAutomations(anyDb(), {}, later(0, 5))).posted).toBe(1);    // 16:00: the 15:00 one
    expect((await runAutomations(anyDb(), {}, later(1))).posted).toBe(0);       // Thursday
    expect((await runAutomations(anyDb(), {}, later(7))).posted).toBe(1);       // next Wednesday 11:00: the 09:00 one
    expect((await runAutomations(anyDb(), {}, later(7, 5))).posted).toBe(1);    // and at 16:00 the 15:00 one
  });
});

describe('the coach\'s controls', () => {
  it('disable stops it; "Run now" runs only this coach\'s; the audit lists what happened', async () => {
    const id = ((await create({ trigger: 'join', preset: 'welcome' })).body as { id: string }).id;
    coach(db, 'c2', 'ada'); linkAge(db, 'c2', 'ada', 1); program(db, 'p-ada-2', 'c2', 'ada');
    await create({ trigger: 'join', text: 'Hi {first}, coach two here.' }, 'c2');
    expect((await automationAct(anyDb(), 'c1', { action: 'disable', id }, now)).status).toBe(200);
    const r = await automationAct(anyDb(), 'c2', { action: 'run' }, now);
    expect(r.body).toMatchObject({ ok: true, posted: 1 });
    expect(db.messages.map((m) => [m.programId, m.body])).toEqual([['p-ada-2', 'Hi Ada, coach two here.']]);
    expect((await automationAct(anyDb(), 'c2', { action: 'archive', id }, now)).status).toBe(404);   // not theirs
    const board = (await automationBoard(anyDb(), 'c2', now)).body as { runs: { name: string; line: string }[] };
    expect(board.runs).toEqual([expect.objectContaining({ name: 'Ada Lane', line: 'posted to the thread' })]);
  });

  it('isDue never fires twice on one PT day, whatever the trigger', () => {
    const f = { today: '2026-10-28', now, joinedAt: now, missed: null, ranDays: ['2026-10-28'] };
    for (const t of ['join', 'missed', 'weekly'] as const) expect(isDue({ trigger: t, missedN: 1, weekday: 3, hour: 0 }, f)).toBe(false);
  });
});
