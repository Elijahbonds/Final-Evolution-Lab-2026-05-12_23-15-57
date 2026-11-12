// PLATFORM PHASE 5: GET /api/coach/queue — a teen without the guardian's coach-training consent never appears (no card,
// not on the roster strip), a consented teen gets no health card and no free text, an adult gets everything their
// sources give, and a source that is not there yet is named in `dark`. The sources are mocked at their own entry points;
// the teen gate is the real rule (lib/coach/teenGate.ts) over a fake User / GuardianConsent read.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  user: 'c1' as string | null,
  since: new Date('2026-01-01') as Date | null,
  attention: {} as Record<string, unknown>,
  drafts: { approvals: true, drafts: [] as unknown[] } as Record<string, unknown> | null,
  reviews: { available: true, items: [] as unknown[] } as Record<string, unknown>,
  parity: false,
  unread: { available: true, total: 0, byProgram: {} as Record<string, number> } as Record<string, unknown>,
  users: [] as { id: string; name: string; email: string; dobYear: number | null }[],
  consents: [] as { menteeId: string; requestedAt: Date; acceptedAt: Date | null; revokedAt: Date | null; menteeBirthYear: number | null }[],
  programs: [] as { id: string; clientId: string; isActive: boolean; createdAt: Date }[],
  links: [] as { clientId: string; createdAt: Date }[],
}));

vi.mock('@/lib/camp/server', () => ({ currentUserId: async () => h.user, bad: (error: string, status = 400) => Response.json({ error }, { status }) }));
vi.mock('@/lib/coach/coachConsent', async (orig) => (await import('@/tests/helpers/coachConsent')).coachConsentAt(await orig(), () => h.since));
vi.mock('@/app/api/coach/attention/route', () => ({ GET: async () => Response.json(h.attention) }));
vi.mock('@/app/api/coach/drafts/route', () => ({ GET: async () => (h.drafts ? Response.json(h.drafts) : Response.json({ error: 'facilitator_not_certified' }, { status: 403 })) }));
vi.mock('@/lib/coach/formReview/server', async (orig) => ({ ...(await orig<object>()), coachQueue: async () => ({ status: 200, body: h.reviews }) }));
vi.mock('@/lib/coach/parity/probe', async (orig) => ({ ...(await orig<object>()), parityReady: async () => h.parity }));
vi.mock('@/lib/coach/messageReads', async (orig) => ({ ...(await orig<object>()), unreadCounts: async () => h.unread }));
const inList = (where: { in?: string[] } | string | undefined, v: string) => (typeof where === 'string' ? where === v : !where?.in || where.in.includes(v));
vi.mock('@/lib/db', () => ({
  prisma: {
    coachingProgram: { findMany: async () => h.programs },
    coachClient: { findMany: async () => h.links },
    user: { findMany: async ({ where }: { where: { id: { in: string[] } } }) => h.users.filter((u) => where.id.in.includes(u.id)) },
    guardianConsent: { findMany: async ({ where }: { where: { menteeId: { in: string[] } } }) => h.consents.filter((c) => inList(where.menteeId, c.menteeId)) },
    clientSession: { findMany: async () => [{ clientId: 'ada', completedAt: new Date() }, { clientId: 'tia', completedAt: new Date() }] },
    programMessage: { findMany: async () => [] },
    $queryRawUnsafe: async () => [],
  },
}));

import { GET } from '@/app/api/coach/queue/route';

const TEEN_YEAR = new Date().getFullYear() - 15;
const pain = (id: string) => ({ clientId: id, name: id, view: { present: true, detailed: false, label: 'Client paused an exercise' } });
const read = async () => (await GET()).json() as Promise<{ items: { kind: string; athleteId: string; freeText: boolean }[]; dark: string[]; roster: { id: string }[] }>;

beforeEach(() => {
  h.user = 'c1'; h.since = new Date('2026-01-01'); h.parity = false;
  h.users = [
    { id: 'ada', name: 'Ada', email: 'ada@x', dobYear: 1990 },              // a verified adult
    { id: 'tia', name: 'Tia', email: 'tia@x', dobYear: TEEN_YEAR },         // a teen, no guardian consent
    { id: 'tom', name: 'Tom', email: 'tom@x', dobYear: TEEN_YEAR },         // a teen, consented under the coach-training wording
    { id: 'nob', name: 'Nob', email: 'nob@x', dobYear: null },              // no birth year: not an adult, not a known teen
  ];
  h.consents = [{ menteeId: 'tom', requestedAt: new Date('2026-09-01'), acceptedAt: new Date('2026-09-02'), revokedAt: null, menteeBirthYear: TEEN_YEAR }];
  h.programs = ['ada', 'tia', 'tom', 'nob'].map((id) => ({ id: `p-${id}`, clientId: id, isActive: true, createdAt: new Date('2026-10-01') }));
  h.links = ['ada', 'tia', 'tom', 'nob'].map((id) => ({ clientId: id, createdAt: new Date() }));
  h.attention = {
    painFlags: ['ada', 'tia', 'tom', 'nob'].map(pain),
    readiness: ['ada', 'tia', 'tom'].map((id) => ({ clientId: id, name: id, view: { date: '2026-10-27', level: 'low', label: 'Running low' } })),
    alerts: ['ada', 'tia', 'tom'].map((id) => ({ clientId: id, name: id, kind: 'missed', line: 'x' })),
  };
  h.drafts = { approvals: true, drafts: ['ada', 'tia'].map((id) => ({ draftId: `d-${id}`, clientId: id, name: id, status: 'ok', changes: [{ id: 'x', safety: 'safe' }], decisions: {} })) };
  h.reviews = { available: true, items: ['ada', 'tia'].map((id) => ({ id: `fr-${id}`, clientId: id, clientName: id, programId: `p-${id}`, exerciseName: 'Goblet squat', movement: 'squat', status: 'unreviewed', createdAt: new Date().toISOString(), flags: [] })) };
  h.unread = { available: true, total: 4, byProgram: { 'p-ada': 1, 'p-tia': 1, 'p-tom': 1, 'p-nob': 1 } };
});

describe('GET /api/coach/queue', () => {
  it('signed out: 401', async () => {
    h.user = null;
    expect((await GET()).status).toBe(401);
  });

  it('a teen without consent NEVER appears: no card of any kind, and not on the roster strip', async () => {
    const j = await read();
    expect(j.items.filter((c) => c.athleteId === 'tia')).toEqual([]);
    expect(j.roster.map((r) => r.id)).not.toContain('tia');
    expect(JSON.stringify(j)).not.toContain('Tia');
  });

  it('nor does an account with no birth year (the gate fails closed)', async () => {
    const j = await read();
    expect(j.items.some((c) => c.athleteId === 'nob')).toBe(false);
    expect(j.roster.map((r) => r.id)).not.toContain('nob');
  });

  it('today every teen fails closed (no coach-training wording live yet): not even a consented one appears', async () => {
    h.since = null;
    const j = await read();
    expect(j.items.some((c) => c.athleteId === 'tom' || c.athleteId === 'tia')).toBe(false);
  });

  it('a consented teen gets no health card (pain, running low) and no free text: training cards with presets only', async () => {
    const j = await read();
    const tom = j.items.filter((c) => c.athleteId === 'tom');
    expect(tom.map((c) => c.kind).sort()).toEqual(['join', 'message', 'missed']);
    expect(tom.every((c) => c.freeText === false)).toBe(true);
  });

  it('an adult gets every source\'s card, safety first', async () => {
    const j = await read();
    expect(j.items.filter((c) => c.athleteId === 'ada').map((c) => c.kind)).toEqual(['pain', 'red_flag', 'draft', 'review', 'missed', 'message', 'join']);
    expect(j.items[0].kind).toBe('pain');
  });

  it('a source that is not there yet is named in `dark` (one line on the screen), and its cards are absent', async () => {
    h.drafts = { approvals: false, drafts: [] }; h.reviews = { available: false, items: [] }; h.unread = { available: false };
    const j = await read();
    expect(j.dark.sort()).toEqual(['checkins', 'drafts', 'messages', 'reviews']);
    expect(j.items.some((c) => ['draft', 'review', 'message', 'checkin'].includes(c.kind))).toBe(false);
  });

  it('a coach the drafts route refuses (not certified) still gets the rest', async () => {
    h.drafts = null;
    const j = await read();
    expect(j.dark).toContain('drafts');
    expect(j.items.some((c) => c.kind === 'pain')).toBe(true);
  });
});
