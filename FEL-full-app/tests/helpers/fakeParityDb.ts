// tests/helpers/fakeParityDb.ts — COACH-PARITY (2026-10-26): an in-memory stand-in for the check-in and habit tables
// (prisma/pending/2026-10-26-coach-parity.sql), answering lib/coach/checkins/store.ts's and lib/coach/habits/store.ts's
// statements BY NAME with the unique keys enforced the way Postgres would, plus what lib/coach/parity/people.ts reads:
// the groups store's myGroups and members, and the Prisma models coachClient, user, guardianConsent and healthConsent.
// `tables: false` is production today: the probe finds nothing and every statement throws "relation does not exist".
import { SQL as C } from '@/lib/coach/checkins/store';
import { SQL as H } from '@/lib/coach/habits/store';
import { SQL as G } from '@/lib/groups/store';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface FakeParityDb {
  tables: boolean;
  groupsTables: boolean;
  clock: number;
  forms: Row[]; assigns: Row[]; answers: Row[]; habits: Row[]; ticks: Row[];
  users: { id: string; name: string | null; email: string | null; dobYear: number | null }[];
  links: { coachId: string; clientId: string; endedAt: Date | null }[];
  consents: { menteeId: string; requestedAt: Date; acceptedAt: Date | null; revokedAt: Date | null; menteeBirthYear: number | null }[];
  grants: { userId: string; coachId: string | null; scope: string; grantedAt: Date; revokedAt: Date | null }[];
  groups: { id: string; kind: 'team' | 'squad'; ownerId: string; name: string; members: { userId: string; role: 'owner' | 'coach' | 'member' }[] }[];
  log: string[];
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  coachClient: any; user: any; guardianConsent: any; healthConsent: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const missing = () => Object.assign(new Error('relation "CoachHabitTick" does not exist'), { code: '42P01' });
const inList = (v: unknown, x: unknown) => (v && typeof v === 'object' && 'in' in (v as object) ? ((v as { in: unknown[] }).in).includes(x) : v === undefined || v === x);
const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);

export function fakeParityDb(o: { tables?: boolean; groupsTables?: boolean; now?: string } = {}): FakeParityDb {
  const s: FakeParityDb = {
    tables: o.tables ?? true, groupsTables: o.groupsTables ?? true, clock: Date.parse(o.now ?? '2026-10-28T18:00:00Z'),
    forms: [], assigns: [], answers: [], habits: [], ticks: [], users: [], links: [], consents: [], grants: [], groups: [], log: [],
    async $queryRawUnsafe<T>(q: string, ...v: unknown[]): Promise<T> {
      s.log.push(q);
      if (q.includes('information_schema')) {
        if (q.includes("'CoachHabitTick'")) return (s.tables ? [{ ok: 1 }] : []) as T;
        if (q.includes("'TrainingGroupAct'")) return (s.groupsTables ? [{ ok: 1 }] : []) as T;
        return [] as T;
      }
      if (q === G.myGroups) {
        if (!s.groupsTables) throw missing();
        return s.groups.flatMap((g) => {
          const m = g.members.find((x) => x.userId === v[0]);
          return m ? [{ id: g.id, kind: g.kind, ownerId: g.ownerId, name: g.name, color: 'cyan', homeCourt: null, inviteToken: `t-${g.id}`, inviteOpen: true, dailyDrill: false, createdAt: new Date(0), role: m.role, members: g.members.length }] : [];
        }) as T;
      }
      if (q === G.members) {
        if (!s.groupsTables) throw missing();
        return (s.groups.find((g) => g.id === v[0])?.members ?? []).map((m) => ({ groupId: v[0], userId: m.userId, role: m.role, shareMeasured: false, joinedAt: new Date(0) })) as T;
      }
      if (!s.tables) throw missing();
      const copy = (rows: Row[]) => rows.map((r) => ({ ...r })) as T;
      switch (q) {
        case C.formsForCoach: return copy(s.forms.filter((f) => f.coachId === v[0]).sort((a, b) => b.createdAt - a.createdAt));
        case C.formsByIds: return copy(s.forms.filter((f) => (v[0] as string[]).includes(f.id) && f.archivedAt == null));
        case C.assignsForCoach: return copy(s.assigns.filter((a) => a.coachId === v[0]));
        case C.assignsFor: return copy(s.assigns.filter((a) => (v[2] as string[]).includes(a.coachId) && ((a.scope === 'athlete' && a.scopeId === v[0]) || (a.scope === 'team' && (v[1] as string[]).includes(a.scopeId)))));
        case C.answersForAthlete: return copy(s.answers.filter((a) => a.athleteId === v[0] && (v[1] as string[]).includes(a.formId)).sort((a, b) => (a.period < b.period ? 1 : -1)));
        case C.answersForCoach: return copy(s.answers.filter((a) => a.coachId === v[0] && a.createdAt >= (v[1] as Date)));
        case H.habitsForCoach: return copy(s.habits.filter((h) => h.coachId === v[0] && h.archivedAt == null));
        case H.habitsFor: return copy(s.habits.filter((h) => h.archivedAt == null && (v[2] as string[]).includes(h.coachId) && ((h.scope === 'athlete' && h.scopeId === v[0]) || (h.scope === 'team' && (v[1] as string[]).includes(h.scopeId)))));
        case H.ticksForAthlete: return copy(s.ticks.filter((t) => t.athleteId === v[0] && (v[1] as string[]).includes(t.habitId) && t.day >= (v[2] as string)));
        case H.ticksForHabits: return copy(s.ticks.filter((t) => (v[0] as string[]).includes(t.habitId) && t.day >= (v[1] as string)));
        default: throw new Error(`fakeParityDb: unknown query ${q.slice(0, 70)}`);
      }
    },
    async $executeRawUnsafe(q: string, ...v: unknown[]): Promise<number> {
      s.log.push(q);
      if (!s.tables) throw missing();
      const now = new Date(s.clock);
      switch (q) {
        case C.insertForm: s.forms.push({ id: v[0], coachId: v[1], title: v[2], cadence: v[3], painCheck: v[4], questions: parse(v[5]), archivedAt: null, createdAt: now, updatedAt: now }); return 1;
        case C.updateForm: { const f = s.forms.find((x) => x.id === v[0] && x.coachId === v[1] && x.archivedAt == null); if (!f) return 0; Object.assign(f, { title: v[2], cadence: v[3], painCheck: v[4], questions: parse(v[5]), updatedAt: now }); return 1; }
        case C.archiveForm: { const f = s.forms.find((x) => x.id === v[0] && x.coachId === v[1] && x.archivedAt == null); if (!f) return 0; f.archivedAt = now; return 1; }
        case C.insertAssign: if (s.assigns.some((a) => a.formId === v[1] && a.scope === v[3] && a.scopeId === v[4])) return 0; s.assigns.push({ id: v[0], formId: v[1], coachId: v[2], scope: v[3], scopeId: v[4] }); return 1;
        case C.deleteAssign: { const n = s.assigns.length; s.assigns = s.assigns.filter((a) => !(a.formId === v[0] && a.coachId === v[1] && a.scope === v[2] && a.scopeId === v[3])); return n - s.assigns.length; }
        case C.upsertAnswer: {
          const [id, formId, coachId, athleteId, period, answers, health] = v;
          const a = s.answers.find((x) => x.formId === formId && x.athleteId === athleteId && x.period === period);
          if (a) { a.answers = parse(answers); a.health = health == null ? a.health : parse(health); a.updatedAt = now; return 1; }
          s.answers.push({ id, formId, coachId, athleteId, period, answers: parse(answers), health: health == null ? null : parse(health), createdAt: now, updatedAt: now });
          return 1;
        }
        case H.insertHabit: { const [id, coachId, scope, scopeId, preset, label, kind, target, unit, frequency, perWeek, topic] = v; s.habits.push({ id, coachId, scope, scopeId, preset, label, kind, target, unit, frequency, perWeek, topic, archivedAt: null, createdAt: now }); return 1; }
        case H.archiveHabit: { const h = s.habits.find((x) => x.id === v[0] && x.coachId === v[1] && x.archivedAt == null); if (!h) return 0; h.archivedAt = now; return 1; }
        case H.upsertTick: { const t = s.ticks.find((x) => x.habitId === v[1] && x.athleteId === v[2] && x.day === v[3]); if (t) { t.value = v[4]; return 1; } s.ticks.push({ id: v[0], habitId: v[1], athleteId: v[2], day: v[3], value: v[4], createdAt: now }); return 1; }
        case H.deleteTick: { const n = s.ticks.length; s.ticks = s.ticks.filter((t) => !(t.habitId === v[0] && t.athleteId === v[1] && t.day === v[2])); return n - s.ticks.length; }
        default: throw new Error(`fakeParityDb: unknown statement ${q.slice(0, 70)}`);
      }
    },
    coachClient: {
      async findMany({ where }: { where: Row }) {
        return s.links.filter((l) => inList(where.clientId, l.clientId) && inList(where.coachId, l.coachId) && (where.endedAt === undefined || l.endedAt === where.endedAt))
          .map((l) => ({ ...l, coach: (() => { const u = s.users.find((x) => x.id === l.coachId); return { name: u?.name ?? null, email: u?.email ?? null }; })() }));
      },
    },
    user: {
      async findMany({ where }: { where: Row }) { return s.users.filter((u) => inList(where.id, u.id)).map((u) => ({ ...u })); },
      async findUnique({ where }: { where: Row }) { const u = s.users.find((x) => x.id === where.id); return u ? { ...u } : null; },
    },
    guardianConsent: {
      async findMany({ where }: { where: Row }) { return s.consents.filter((c) => c.menteeId === where.menteeId).map((c) => ({ ...c })); },
    },
    healthConsent: {
      async findMany({ where }: { where: Row }) {
        return s.grants.filter((g) => inList(where.userId, g.userId) && inList(where.coachId, g.coachId) && (where.scope === undefined || g.scope === where.scope) && (where.revokedAt === undefined || g.revokedAt === where.revokedAt));
      },
    },
  };
  return s;
}

const THIS_YEAR = new Date().getFullYear();

/** A person: 'adult' (born 1990), 'teen' (15, with an accepted guardian consent), 'teen-no-consent', 'blank' (no year). */
export function seedPerson(db: FakeParityDb, id: string, kind: 'adult' | 'teen' | 'teen-no-consent' | 'blank' = 'adult', name = id): void {
  db.users.push({ id, name, email: `${id}@fel.test`, dobYear: kind === 'adult' ? 1990 : kind === 'blank' ? null : THIS_YEAR - 15 });
  if (kind === 'teen') db.consents.push({ menteeId: id, requestedAt: new Date('2026-09-01'), acceptedAt: new Date('2026-09-02'), revokedAt: null, menteeBirthYear: THIS_YEAR - 15 });
}

/** coachId coaches each athlete (a live CoachClient row). */
export function coach(db: FakeParityDb, coachId: string, ...athletes: string[]): void {
  if (!db.users.some((u) => u.id === coachId)) db.users.push({ id: coachId, name: `Coach ${coachId}`, email: `${coachId}@fel.test`, dobYear: 1985 });
  for (const a of athletes) db.links.push({ coachId, clientId: a, endedAt: null });
}

/** The athlete's live grants: 'health_data' and/or 'coach_view' for a coach. */
export function grant(db: FakeParityDb, userId: string, scope: 'health_data' | 'coach_view', coachId: string | null = null): void {
  db.grants.push({ userId, coachId, scope, grantedAt: new Date('2026-09-01'), revokedAt: null });
}
