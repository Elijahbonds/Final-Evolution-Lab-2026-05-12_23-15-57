// tests/helpers/fakeDeliveryDb.ts — COACH-DELIVERY (2026-10-26): an in-memory stand-in for the lane's tables
// (prisma/pending/2026-10-26-coach-delivery.sql), answering each store's statements BY NAME with the unique keys enforced
// the way Postgres would. It wraps the coach-parity fake (tests/helpers/fakeParityDb.ts), which already answers what
// lib/coach/parity/people.ts reads (users, roster links, guardian consents, health grants, teams), and adds the Prisma
// models the lane's servers read: coachingProgram, clientSession, programMessage.
// `tables: false` is production today: the probe finds nothing and every statement throws "relation does not exist".
import { fakeParityDb, type FakeParityDb } from './fakeParityDb';
import { SQL as AUTO } from '@/lib/coach/automations/store';
import { SQL as SURVEY } from '@/lib/coach/readiness/surveyStore';
import { SQL as SCHED } from '@/lib/coach/schedule/store';
import { SQL as BRAND } from '@/lib/coach/brandingServer';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface FakeDeliveryDb extends FakeParityDb {
  deliveryTables: boolean;
  automations: Row[]; runs: Row[];
  surveys: Row[]; branding: Row[]; sessions: Row[]; feeds: Row[]; reviews: Row[];
  programs: { id: string; coachId: string; clientId: string; isActive: boolean; startDate: Date; durationWeeks: number; createdAt: Date; sessionKinds: string[] }[];
  clientSessions: { programId: string; clientId: string; completedAt: Date | null }[];
  messages: { id: string; programId: string; authorId: string; body: string; createdAt: Date }[];
  extra: { query: Map<string, (v: unknown[]) => unknown>; exec: Map<string, (v: unknown[]) => number> };
  /** Users with a certified FacilitatorProfile (the builder's and branding's gate). */
  certified: string[];
  facilitatorProfile: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  coachingProgram: any; clientSession: any; programMessage: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const missing = () => Object.assign(new Error('relation "CoachReview" does not exist'), { code: '42P01' });
const inList = (v: unknown, x: unknown) => (v && typeof v === 'object' && 'in' in (v as object) ? ((v as { in: unknown[] }).in).includes(x) : v === undefined || v === x);

export function fakeDeliveryDb(o: { tables?: boolean; now?: string } = {}): FakeDeliveryDb {
  const base = fakeParityDb({ now: o.now });
  const parityQuery = base.$queryRawUnsafe.bind(base);
  const parityExec = base.$executeRawUnsafe.bind(base);
  const s = base as unknown as FakeDeliveryDb;
  Object.assign(s, {
    deliveryTables: o.tables ?? true,
    automations: [], runs: [], surveys: [], branding: [], sessions: [], feeds: [], reviews: [], programs: [], clientSessions: [], messages: [],
    extra: { query: new Map(), exec: new Map() }, certified: [],
  });
  const now = () => new Date(s.clock);
  const copy = <T,>(rows: Row[]) => rows.map((r) => ({ ...r })) as T;

  s.$queryRawUnsafe = async <T,>(q: string, ...v: unknown[]): Promise<T> => {
    if (q.includes('information_schema') && q.includes("'CoachReview'")) { s.log.push(q); return (s.deliveryTables ? [{ ok: 1 }] : []) as T; }
    const own = q === AUTO.forCoach || q === AUTO.enabledAll || q === AUTO.enabledFor || q === AUTO.runsFor || q === AUTO.recentForCoach
      || q === SCHED.forCoach || q === SCHED.forCoaches || q === SCHED.feedNonce || q === BRAND.get || s.extra.query.has(q);
    if (!own) return parityQuery<T>(q, ...v);
    s.log.push(q);
    if (!s.deliveryTables) throw missing();
    switch (q) {
      case AUTO.forCoach: return copy<T>(s.automations.filter((a) => a.coachId === v[0] && a.archivedAt == null));
      case AUTO.enabledAll: return copy<T>(s.automations.filter((a) => a.enabled && a.archivedAt == null));
      case AUTO.enabledFor: return copy<T>(s.automations.filter((a) => a.coachId === v[0] && a.enabled && a.archivedAt == null));
      case AUTO.runsFor: return copy<T>(s.runs.filter((r) => (v[0] as string[]).includes(r.automationId) && r.day >= (v[1] as string)));
      case AUTO.recentForCoach: return copy<T>(s.runs.filter((r) => r.coachId === v[0] && r.createdAt >= (v[1] as Date)).reverse());
      case SCHED.forCoach: return copy<T>(s.sessions.filter((x) => x.coachId === v[0] && x.startsAt >= (v[1] as Date) && x.startsAt < (v[2] as Date)).sort((a, b) => a.startsAt - b.startsAt));
      case SCHED.forCoaches: return copy<T>(s.sessions.filter((x) => (v[0] as string[]).includes(x.coachId) && x.startsAt >= (v[1] as Date) && x.startsAt < (v[2] as Date)).sort((a, b) => a.startsAt - b.startsAt));
      case SCHED.feedNonce: return copy<T>(s.feeds.filter((f) => f.userId === v[0]));
      case BRAND.get: return copy<T>(s.branding.filter((b) => (v[0] as string[]).includes(b.coachId)));
      default: return s.extra.query.get(q)!(v) as T;
    }
  };

  s.$executeRawUnsafe = async (q: string, ...v: unknown[]): Promise<number> => {
    const own = Object.values(AUTO).includes(q as never) || Object.values(SCHED).includes(q as never) || Object.values(BRAND).includes(q as never) || s.extra.exec.has(q);
    if (!own) return parityExec(q, ...v);
    s.log.push(q);
    if (!s.deliveryTables) throw missing();
    switch (q) {
      case AUTO.insert: {
        const [id, coachId, trigger, scope, scopeId, missedN, weekday, hour, preset, text] = v;
        s.automations.push({ id, coachId, trigger, scope, scopeId, missedN, weekday, hour, preset, text, enabled: true, archivedAt: null, createdAt: now() });
        return 1;
      }
      case AUTO.update: {
        const a = s.automations.find((x) => x.id === v[0] && x.coachId === v[1] && x.archivedAt == null);
        if (!a) return 0;
        Object.assign(a, { trigger: v[2], scope: v[3], scopeId: v[4], missedN: v[5], weekday: v[6], hour: v[7], preset: v[8], text: v[9] });
        return 1;
      }
      case AUTO.setEnabled: { const a = s.automations.find((x) => x.id === v[0] && x.coachId === v[1] && x.archivedAt == null); if (!a) return 0; a.enabled = v[2]; return 1; }
      case AUTO.archive: { const a = s.automations.find((x) => x.id === v[0] && x.coachId === v[1] && x.archivedAt == null); if (!a) return 0; a.archivedAt = now(); a.enabled = false; return 1; }
      case AUTO.claimRun: {
        const [id, automationId, coachId, athleteId, day, outcome, programId] = v;
        if (s.runs.some((r) => r.automationId === automationId && r.athleteId === athleteId && r.day === day)) return 0;
        s.runs.push({ id, automationId, coachId, athleteId, day, outcome, programId, messageId: null, createdAt: now() });
        return 1;
      }
      case AUTO.finishRun: { const r = s.runs.find((x) => x.id === v[0]); if (!r) return 0; r.outcome = v[1]; r.messageId = v[2]; return 1; }
      case SCHED.insert: { const [id, coachId, title, startsAt, minutes, place, scope, scopeId] = v; s.sessions.push({ id, coachId, title, startsAt, minutes, place, scope, scopeId, cancelledAt: null, updatedAt: now() }); return 1; }
      case SCHED.update: {
        const x = s.sessions.find((r) => r.id === v[0] && r.coachId === v[1] && r.cancelledAt == null);
        if (!x) return 0;
        Object.assign(x, { title: v[2], startsAt: v[3], minutes: v[4], place: v[5], scope: v[6], scopeId: v[7], updatedAt: now() });
        return 1;
      }
      case SCHED.cancel: { const x = s.sessions.find((r) => r.id === v[0] && r.coachId === v[1] && r.cancelledAt == null); if (!x) return 0; x.cancelledAt = now(); x.updatedAt = now(); return 1; }
      case SCHED.setFeed: { const f = s.feeds.find((r) => r.userId === v[0]); if (f) f.nonce = v[1]; else s.feeds.push({ userId: v[0], nonce: v[1] }); return 1; }
      case SCHED.dropFeed: { const n = s.feeds.length; s.feeds = s.feeds.filter((r) => r.userId !== v[0]); return n - s.feeds.length; }
      case BRAND.save: { const b = s.branding.find((r) => r.coachId === v[0]); if (b) Object.assign(b, { name: v[1], accent: v[2] }); else s.branding.push({ coachId: v[0], name: v[1], accent: v[2], logoPath: null }); return 1; }
      case BRAND.setLogo: { const b = s.branding.find((r) => r.coachId === v[0]); if (b) b.logoPath = v[1]; else s.branding.push({ coachId: v[0], name: null, accent: null, logoPath: v[1] }); return 1; }
      default: return s.extra.exec.get(q)!(v);
    }
  };

  const baseCoachClient = s.coachClient.findMany.bind(s.coachClient);
  s.coachClient = {
    ...s.coachClient,
    async findMany(a: { where: Row }) { return baseCoachClient(a); },
    async findFirst({ where }: { where: Row }) { return s.links.find((l) => inList(where.coachId, l.coachId) && inList(where.clientId, l.clientId) && (where.endedAt === undefined || l.endedAt === where.endedAt)) ?? null; },
  };
  s.coachingProgram = {
    async findMany({ where }: { where: Row }) {
      return s.programs
        .filter((p) => inList(where.coachId, p.coachId) && inList(where.clientId, p.clientId) && (where.isActive === undefined || p.isActive === where.isActive))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((p) => ({ ...p, blocks: [{ sessions: p.sessionKinds.map((kind) => ({ kind })) }] }));
    },
    async findUnique({ where }: { where: Row }) { const p = s.programs.find((x) => x.id === where.id); return p ? { ...p } : null; },
    async findFirst({ where }: { where: Row }) { return (await s.coachingProgram.findMany({ where }))[0] ?? null; },
  };
  s.facilitatorProfile = { async findUnique({ where }: { where: Row }) { return s.certified.includes(where.userId) ? { certificationStatus: 'certified' } : null; } };
  s.clientSession = {
    async findMany({ where }: { where: Row }) {
      return s.clientSessions.filter((c) => inList(where.programId, c.programId) && inList(where.clientId, c.clientId) && (!where.completedAt?.gte || (c.completedAt && c.completedAt >= where.completedAt.gte)));
    },
    async count({ where }: { where: Row }) { return s.clientSessions.filter((c) => inList(where.programId, c.programId)).length; },
  };
  s.programMessage = {
    async create({ data }: { data: Row }) {
      const m = { id: `m${s.messages.length + 1}`, programId: data.programId, authorId: data.authorId, body: data.body, createdAt: now() };
      s.messages.push(m);
      return { ...m };
    },
  };
  return s;
}

/** A live roster link made `daysAgo` days before the fake's clock (the join automation reads its age). */
export function linkAge(db: FakeDeliveryDb, coachId: string, clientId: string, daysAgo: number): void {
  const l = db.links.find((x) => x.coachId === coachId && x.clientId === clientId) as (FakeDeliveryDb['links'][number] & { createdAt?: Date }) | undefined;
  if (l) l.createdAt = new Date(db.clock - daysAgo * 86_400_000);
}

/** An active program (its thread) for coachId × clientId, `trainingPerWeek` sessions a week over `weeks` weeks. */
export function program(db: FakeDeliveryDb, id: string, coachId: string, clientId: string, o: { startedDaysAgo?: number; weeks?: number; trainingPerWeek?: number } = {}): void {
  const weeks = o.weeks ?? 4;
  const start = new Date(db.clock - (o.startedDaysAgo ?? 14) * 86_400_000);
  db.programs.push({ id, coachId, clientId, isActive: true, startDate: start, durationWeeks: weeks, createdAt: start, sessionKinds: Array.from({ length: weeks * (o.trainingPerWeek ?? 3) }, () => 'training') });
}

/**
 * Give any raw-SQL fake (e.g. tests/helpers/fakeVbtDb.ts, which carries the readiness and VBT tables) the lane's probe and
 * the ReadinessSurvey table. Returns the rows array; `tables.on = false` is production today.
 */
export function withSurveys(db: { clock: number; $queryRawUnsafe: (q: string, ...v: unknown[]) => Promise<any>; $executeRawUnsafe: (q: string, ...v: unknown[]) => Promise<number> }): { rows: Row[]; tables: { on: boolean } } { // eslint-disable-line @typescript-eslint/no-explicit-any
  const rows: Row[] = [];
  const tables = { on: true };
  const q0 = db.$queryRawUnsafe.bind(db), e0 = db.$executeRawUnsafe.bind(db);
  db.$queryRawUnsafe = async (q: string, ...v: unknown[]) => {
    if (q.includes('information_schema') && q.includes("'CoachReview'")) return tables.on ? [{ ok: 1 }] : [];
    if (q === SURVEY.forUser || q === SURVEY.forUsers) {
      if (!tables.on) throw missing();
      const who = (r: Row) => (q === SURVEY.forUser ? r.userId === v[0] : (v[0] as string[]).includes(r.userId));
      return rows.filter((r) => who(r) && r.day >= (v[1] as string)).sort((a, b) => (a.day < b.day ? 1 : -1)).map((r) => ({ ...r }));
    }
    return q0(q, ...v);
  };
  db.$executeRawUnsafe = async (q: string, ...v: unknown[]) => {
    if (q === SURVEY.insert) {
      if (!tables.on) throw missing();
      const [id, userId, day, sleep, soreness, energy, mood, ready, lowItems, band] = v;
      if (rows.some((r) => r.userId === userId && r.day === day)) return 0;
      rows.push({ id, userId, day, sleep, soreness, energy, mood, ready, lowItems, band, createdAt: new Date(db.clock) });
      return 1;
    }
    if (q === SURVEY.deleteAll) { if (!tables.on) throw missing(); const n = rows.length; rows.splice(0, rows.length, ...rows.filter((r) => r.userId !== v[0])); return n - rows.length; }
    return e0(q, ...v);
  };
  return { rows, tables };
}
