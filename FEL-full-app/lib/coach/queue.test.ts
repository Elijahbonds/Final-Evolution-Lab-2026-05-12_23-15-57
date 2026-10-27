// PLATFORM PHASE 5: "Needs you today" — the order (safety first), the dedupe (one card per athlete per kind), the gate
// (a teen who fails it never appears; a health card needs a verified adult), and the buttons a card offers.
import { describe, expect, it } from 'vitest';
import { buildQueue, cardsFrom, dedupeQueue, gateQueue, orderQueue, QUEUE_ORDER, type QueueCard, type QueueSources } from './queue';

const NOW = Date.parse('2026-10-27T15:00:00Z');
const H = 3_600_000;
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * H).toISOString();
const ctx = { now: NOW, programOf: (id: string) => (id === 'noprog' ? null : `p-${id}`), adult: (id: string) => id !== 'teen' };

/** One of every kind, deliberately listed in the WRONG order, ages mixed. */
const ALL: QueueSources = {
  joins: [{ athleteId: 'j', name: 'Jo', joinedAt: NOW - 2 * H, hasProgram: true }],
  messages: [{ programId: 'p-m', athleteId: 'm', name: 'Mo', unread: 2, at: NOW - 30 * H }],
  checkins: [{ athleteId: 'c', name: 'Cy', formTitle: 'Weekly check-in', createdAt: iso(5) }],
  alerts: [{ clientId: 's', name: 'Sy', kind: 'missed', line: 'x' }, { clientId: 'q', name: 'Q', kind: 'slowing', line: 'y' }],
  reviews: [{ id: 'fr1', clientId: 'r', clientName: 'Ri', programId: 'p-r', exerciseName: 'Goblet squat', status: 'unreviewed', createdAt: iso(3), flags: [{}, {}], presets: [{ id: 'fault:a:cue', text: 'Knees out.' }] }],
  drafts: [{ draftId: 'd1', clientId: 'd', name: 'Di', status: 'ok', changes: [{ id: 'x1', safety: 'safe' }, { id: 'x2', safety: 'safe' }], decisions: {} }],
  redFlags: [{ clientId: 'l', name: 'Lu', view: { date: '2026-10-27', level: 'low', label: 'Running low: sleep' } }],
  pain: [{ clientId: 'a', name: 'Ab', view: { present: true, detailed: false, label: 'Client paused an exercise' } }],
};

describe('the order: safety first, then decisions, drift, messages and joins', () => {
  it('lists the tiers in the brief\'s order, whatever order the sources answered in', () => {
    expect(QUEUE_ORDER).toEqual(['pain', 'red_flag', 'draft', 'review', 'missed', 'checkin', 'message', 'join']);
    expect(buildQueue(ALL, ctx).map((c) => c.kind)).toEqual(['pain', 'red_flag', 'draft', 'review', 'missed', 'checkin', 'message', 'join']);
  });

  it('a pain flag outranks everything, even a message waiting a day longer', () => {
    const q = buildQueue({ messages: [{ programId: 'p-m', athleteId: 'm', name: 'Mo', unread: 9, at: NOW - 100 * H }], pain: ALL.pain }, ctx);
    expect(q[0].kind).toBe('pain');
  });

  it('ties in a tier go by age, oldest first', () => {
    const q = buildQueue({ checkins: [
      { athleteId: 'new', name: 'Newer', formTitle: 'Weekly', createdAt: iso(1) },
      { athleteId: 'old', name: 'Older', formTitle: 'Weekly', createdAt: iso(48) },
      { athleteId: 'mid', name: 'Middle', formTitle: 'Weekly', createdAt: iso(10) },
    ] }, ctx);
    expect(q.map((c) => c.name)).toEqual(['Older', 'Middle', 'Newer']);
  });

  it('only missed and stalled reach the queue from the alerts (2 planned in 7 days, the owner\'s rule); slowing stays on the board', () => {
    expect(buildQueue({ alerts: ALL.alerts }, ctx).map((c) => c.athleteId)).toEqual(['s']);
  });
});

describe('dedupe: one card per athlete per kind', () => {
  it('two unread threads and two filmed sets for one athlete are one card each, the oldest kept', () => {
    const cards = cardsFrom({
      messages: [{ programId: 'p1', athleteId: 'm', name: 'Mo', unread: 1, at: NOW - 2 * H }, { programId: 'p2', athleteId: 'm', name: 'Mo', unread: 3, at: NOW - 9 * H }],
      reviews: [
        { ...ALL.reviews![0], id: 'a', createdAt: iso(1) },
        { ...ALL.reviews![0], id: 'b', createdAt: iso(20) },
      ],
    }, ctx);
    const q = dedupeQueue(cards);
    expect(q).toHaveLength(2);
    expect(q.find((c) => c.kind === 'message')!.programId).toBe('p2');
    expect(q.find((c) => c.kind === 'review')!.ref).toBe('b');
  });

  it('different kinds for the same athlete stay separate cards (a pain flag and a message are two things)', () => {
    const q = buildQueue({ pain: [{ ...ALL.pain![0], clientId: 'm' }], messages: ALL.messages }, ctx);
    expect(q.map((c) => `${c.kind}:${c.athleteId}`)).toEqual(['pain:m', 'message:m']);
  });

  it('orderQueue is stable for equal age: by name', () => {
    const a = { ...buildQueue({ joins: ALL.joins }, ctx)[0], name: 'Zed', key: 'z' } as QueueCard;
    const b = { ...a, name: 'Amy', key: 'y' };
    expect(orderQueue([a, b]).map((c) => c.name)).toEqual(['Amy', 'Zed']);
  });
});

describe('the gate over every card', () => {
  const q = buildQueue({
    pain: [{ ...ALL.pain![0], clientId: 'teen' }, { ...ALL.pain![0], clientId: 'adult' }],
    messages: [{ programId: 'p-teen', athleteId: 'teen', name: 'Tia', unread: 1, at: NOW }, { programId: 'p-x', athleteId: 'closed', name: 'Cal', unread: 1, at: NOW }],
  }, ctx);
  const gate = (id: string) => (id === 'adult' ? 'adult' : id === 'teen' ? 'teen' : null);

  it('a teen whose gate is closed never appears, in any kind', () => {
    expect(gateQueue(q, gate).some((c) => c.athleteId === 'closed')).toBe(false);
  });
  it('a health card (pain, running low) needs a verified adult: a consented teen\'s pain flag is not on the list', () => {
    const out = gateQueue(q, gate);
    expect(out.filter((c) => c.kind === 'pain').map((c) => c.athleteId)).toEqual(['adult']);
    expect(out.find((c) => c.kind === 'message' && c.athleteId === 'teen')).toBeTruthy();
  });
  it('no free text to a teen\'s thread: presets only', () => {
    expect(gateQueue(q, gate).find((c) => c.athleteId === 'teen')!.freeText).toBe(false);
    expect(gateQueue(q, gate).find((c) => c.athleteId === 'adult')!.freeText).toBe(true);
  });
});

describe('the cards', () => {
  const q = buildQueue(ALL, ctx);
  const of = (k: string) => q.find((c) => c.kind === k)!;

  it('at most two buttons each; the first one resolves it in one tap, or two with a preset', () => {
    for (const c of q) expect(c.actions.length).toBeLessThanOrEqual(2);
    expect(of('draft').actions[0]).toBe('approve');
    expect(of('review').actions).toEqual(['cue', 'looks_good']);
    expect(of('missed').actions[0]).toBe('nudge');
    expect(of('message').actions[0]).toBe('reply');
    expect(of('message').presets.length).toBeGreaterThan(0);
  });

  it('with no thread to write to, a card opens the athlete instead of offering a reply that cannot send', () => {
    const c = buildQueue({ pain: [{ ...ALL.pain![0], clientId: 'noprog' }] }, ctx)[0];
    expect(c.actions).toEqual(['open', 'done']);
  });

  it('a draft is a card only when there is something to decide, and Approve only when some of it is safe', () => {
    expect(buildQueue({ drafts: [{ ...ALL.drafts![0], draftId: null }] }, ctx)).toEqual([]);
    expect(buildQueue({ drafts: [{ ...ALL.drafts![0], decisions: { x1: {}, x2: {} } }] }, ctx)).toEqual([]);
    expect(buildQueue({ drafts: [{ ...ALL.drafts![0], changes: [{ id: 'x1', safety: 'review' }] }] }, ctx)[0].actions[0]).toBe('open');
  });

  it('a card\'s key carries its source\'s stamp, so a new event is a new card even after "done"', () => {
    const a = buildQueue({ checkins: [{ ...ALL.checkins![0], createdAt: iso(5) }] }, ctx)[0].key;
    const b = buildQueue({ checkins: [{ ...ALL.checkins![0], createdAt: iso(1) }] }, ctx)[0].key;
    expect(a).not.toBe(b);
  });

  it('a card line is short (a glance, not a paragraph)', () => {
    for (const c of q) expect(c.line.split(/\s+/).length, c.line).toBeLessThanOrEqual(6);
  });
});
