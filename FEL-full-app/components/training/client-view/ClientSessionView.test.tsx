// /training's step-through and the protocol gate's held items (MIRROR-COACH P8 FIX, 2026-09-30, code review — "The
// /training step-through never shows held items and can say the coach prescribed nothing"). The payload is the real
// server read (lib/coach/todayServer.ts loadToday over the in-memory Today store), rendered statically with the view's
// `initialData`: a mixed session shows the held line on the Ready card; a session whose every item is held says so,
// lists why, and offers Done — never "has not prescribed exercises yet".
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClientSessionView, HELD_ONLY_LINE } from './ClientSessionView';
import { catalogueRow, newTodayStore, seedProgram, todayMemoryDb } from '@/lib/coach/todayMemoryDb';
import { loadToday, type TodayDb } from '@/lib/coach/todayServer';
import { PROTOCOL_WHY, heldLine } from '@/lib/coach/protocolGate';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

async function payload(exercises: { exerciseId: string; section?: string; isKeySet?: boolean }[]) {
  const s = newTodayStore();
  s.user.push({ id: 'coach-1', name: 'Coach One', email: 'c1@x.test' }, { id: 'client-1', name: 'Sam', email: 'sam@x.test', dobYear: 1990 });
  s.fac!.push({ userId: 'coach-1', certificationStatus: 'certified' });
  s.pe.push(
    catalogueRow({ id: 'pe-pogo', coachId: 'coach-1', name: 'Pogo hops', category: 'plyometric', pattern: 'locomotion', skillLayer: 'jump-land' }),
    catalogueRow({ id: 'pe-box', coachId: 'coach-1', name: 'Box Jump', category: 'plyometric', pattern: 'squat' }),
    catalogueRow({ id: 'pe-goblet', coachId: 'coach-1', name: 'Goblet Squat', pattern: 'squat', skillLayer: 'strength' }),
  );
  seedProgram(s, { coachId: 'coach-1', clientId: 'client-1', name: 'Plyo day', blockLabel: 'Week 1', sessions: [{ order: 1, label: 'Day 1', exercises }] });
  return loadToday(todayMemoryDb(s) as unknown as TodayDb, 'client-1');
}
const render = async (exercises: Parameters<typeof payload>[0]) => {
  const data = await payload(exercises);
  return { data, html: renderToStaticMarkup(createElement(ClientSessionView, { initialData: data })) };
};

describe('/training shows what the protocol gate holds back', () => {
  it('EVERYTHING HELD (an adult with no landing check, a plyo day with no easier links): why, and a Done — not "nothing prescribed"', async () => {
    const { data, html } = await render([{ exerciseId: 'pe-pogo', section: 'prime' }, { exerciseId: 'pe-box', section: 'key', isKeySet: true }]);
    expect(data.today!.session.exercises).toEqual([]);
    expect(data.today!.session.held!.map((h) => h.name)).toEqual(['Pogo hops', 'Box Jump']);
    const t = text(html);
    expect(t).not.toContain('has not prescribed exercises yet');
    expect(t).toContain(HELD_ONLY_LINE);
    for (const h of data.today!.session.held!) expect(t).toContain(h.line);
    expect(t).toContain(heldLine('Pogo hops', PROTOCOL_WHY.no_health_consent));
    expect(html).toContain('data-held-only');
    expect(t).toContain('Mark the session done');
  });

  it('A MIXED SESSION: the Ready card lists the held item with its line, beside the count of what is left', async () => {
    const { data, html } = await render([{ exerciseId: 'pe-pogo', section: 'prime' }, { exerciseId: 'pe-goblet', section: 'key', isKeySet: true }]);
    expect(data.today!.session.exercises.map((e) => e.name)).toEqual(['Goblet Squat']);
    const t = text(html);
    expect(t).toContain('Ready to Train?');
    expect(t).toContain('1 exercises');
    expect(html).toContain('data-testid="protocol-held"');
    expect(t).toContain(heldLine('Pogo hops', PROTOCOL_WHY.no_health_consent));
  });

  it('a session with nothing in it at all still says the coach has not filled it (no held list, no Done)', async () => {
    const { html } = await render([]);
    const t = text(html);
    expect(t).toContain('has not prescribed exercises yet');
    expect(html).not.toContain('data-held-only');
  });

  it('nothing held: the Ready card is as it was', async () => {
    const { html } = await render([{ exerciseId: 'pe-goblet', section: 'key', isKeySet: true }]);
    expect(html).not.toContain('protocol-held');
  });
});
