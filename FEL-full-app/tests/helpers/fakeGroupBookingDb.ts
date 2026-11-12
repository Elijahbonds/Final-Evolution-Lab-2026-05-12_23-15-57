// Test support for lib/group-booking: an in-memory stand-in for the seven pending tables of
// prisma/pending/2026-11-02-group-booking.sql, answering each statement of lib/group-booking/store.ts SQL BY NAME, plus the
// Prisma reads lib/group-booking/server.ts makes (users and their age, guardian consents, program threads and messages,
// the coach-store instructor, listings and bookings). `ready: false` is the database before the SQL is applied: the probe
// finds no table, and every group statement throws Postgres' "relation does not exist" (42P01), as production would.
// Constraints the tables declare are held here too: UNIQUE ("slotKey", "seat"), UNIQUE ("makeupForId"),
// UNIQUE ("groupId", "userId") on the waitlist and UNIQUE ("slotLock") on in-person sessions.
import { SQL } from '@/lib/group-booking/store';
import type { GroupDb } from '@/lib/group-booking/server';

type Row = Record<string, any>;

export interface FakeUser { id: string; name: string; dobYear: number | null }
export interface FakeConsent { menteeId: string; requestedAt: Date; acceptedAt: Date | null; revokedAt: Date | null; menteeBirthYear?: number | null; scope?: string | null }

export interface GBState {
  ready: boolean;
  users: FakeUser[];
  consents: FakeConsent[];
  gyms: Record<string, string | null>;
  trainers: Row[];
  groups: Row[];
  passes: Row[];
  seats: Row[];
  waits: Row[];
  inPerson: Row[];
  programs: { id: string; coachId: string; clientId: string; isActive: boolean; createdAt: Date }[];
  messages: { programId: string; authorId: string; body: string }[];
  instructors: Row[];
  listings: Row[];
  bookings: Row[];
  /** Every statement run, by its SQL key ('probe' for the information_schema read). */
  ran: string[];
  /** Writes only (INSERT / UPDATE / DELETE through either raw call, and programMessage.create). */
  writes: string[];
}

const KEY = new Map<string, string>(Object.entries(SQL).map(([k, v]) => [v, k]));
const missing = () => Object.assign(new Error('relation "GroupClass" does not exist'), { code: '42P01' });
const unique = (what: string) => Object.assign(new Error(`duplicate key value violates unique constraint "${what}"`), { code: 'P2010', meta: { code: '23505' } });
const t = (v: unknown) => (v instanceof Date ? v.getTime() : new Date(String(v)).getTime());

export function fakeGroupBookingDb(init: Partial<GBState> = {}): { db: GroupDb; state: GBState } {
  const s: GBState = {
    ready: true, users: [], consents: [], gyms: {}, trainers: [], groups: [], passes: [], seats: [], waits: [], inPerson: [],
    programs: [], messages: [], instructors: [], listings: [], bookings: [], ran: [], writes: [], ...init,
  };
  const now = () => new Date();

  function query(sql: string, v: any[]): Row[] {
    if (sql.includes('information_schema')) { s.ran.push('probe'); return s.ready ? [{ ok: 1 }] : []; }
    const k = KEY.get(sql);
    if (!k) throw new Error(`fake: unknown statement ${sql.slice(0, 80)}`);
    s.ran.push(k);
    if (!s.ready) throw missing();
    switch (k) {
      case 'gyms': return Object.entries(s.gyms).map(([id, address]) => ({ id, address }));
      case 'trainersFor': return s.trainers.filter((r) => r.ownerId === v[0] && r.status !== 'removed');
      case 'activeTrainerByUser': return s.trainers.filter((r) => r.trainerUserId === v[0] && r.status === 'active').slice(0, 1);
      case 'acceptTrainer': {
        const r = s.trainers.find((x) => x.inviteCode === v[0] && x.status === 'invited' && x.ownerId !== v[1]);
        if (!r) return [];
        s.writes.push(k);
        Object.assign(r, { trainerUserId: v[1], inviteCode: null, status: 'active' });
        return [{ id: r.id, ownerId: r.ownerId, displayName: r.displayName }];
      }
      case 'openGroups': return s.groups.filter((g) => g.status === 'open').sort((a, b) => a.startDate.localeCompare(b.startDate) || a.hour - b.hour);
      case 'groupById': return s.groups.filter((g) => g.id === v[0]);
      case 'groupsForOwner': return s.groups.filter((g) => g.ownerId === v[0]);
      case 'groupsForTrainer': return s.groups.filter((g) => g.trainerUserId === v[0]);
      case 'lockSlot': return [{ locked: 1 }];
      case 'seatsIn': return s.seats.filter((r) => v[0].includes(r.slotKey) && r.seat != null).map((r) => ({ slotKey: r.slotKey, seat: r.seat }));
      case 'seatsForUser': return s.seats.filter((r) => r.userId === v[0] && t(r.startsAt) >= t(v[1])).sort((a, b) => t(a.startsAt) - t(b.startsAt));
      case 'seatById': return s.seats.filter((r) => r.id === v[0]);
      case 'seatsInSlot': return s.seats.filter((r) => r.slotKey === v[0]);
      case 'makeupSeatsAt': return s.seats.filter((r) => r.kind === 'makeup' && v[0].includes(r.gymId) && t(r.startsAt) >= t(v[1]) && t(r.startsAt) < t(v[2]) && r.seat != null);
      case 'makeupsFor': return s.seats.filter((r) => r.makeupForId && v[0].includes(r.makeupForId)).map((r) => ({ makeupForId: r.makeupForId }));
      case 'passesForUser': return s.passes.filter((p) => p.userId === v[0] && p.status === 'active');
      case 'passById': return s.passes.filter((p) => p.id === v[0]);
      case 'passesForGroups': return s.passes.filter((p) => v[0].includes(p.groupId) && p.status === 'active');
      case 'waitFor': return s.waits.filter((w) => v[0].includes(w.groupId));
      case 'inPersonForTrainers': return s.inPerson.filter((r) => v[0].includes(r.trainerUserId) && t(r.startsAt) >= t(v[1]) && t(r.startsAt) < t(v[2]));
      case 'inPersonForClient': return s.inPerson.filter((r) => r.clientUserId === v[0] && t(r.startsAt) >= t(v[1]));
      case 'inPersonById': return s.inPerson.filter((r) => r.id === v[0]);
      default: throw new Error(`fake: ${k} is not a query`);
    }
  }

  function execute(sql: string, v: any[]): number {
    const k = KEY.get(sql);
    if (!k) throw new Error(`fake: unknown statement ${sql.slice(0, 80)}`);
    s.ran.push(k);
    if (!s.ready) throw missing();
    s.writes.push(k);
    const set = (rows: Row[], f: (r: Row) => boolean, patch: (r: Row) => Row) => { const hit = rows.filter(f); hit.forEach((r) => Object.assign(r, patch(r))); return hit.length; };
    switch (k) {
      case 'setGym': s.gyms[v[0]] = v[1]; return 1;
      case 'insertTrainer': s.trainers.push({ id: v[0], ownerId: v[1], trainerUserId: null, displayName: v[2], inviteCode: v[3], gyms: v[4], weeklyHours: '[]', online: true, inPerson: true, status: 'invited' }); return 1;
      case 'updateTrainer': return set(s.trainers, (r) => r.id === v[0] && r.ownerId === v[1] && r.status !== 'removed', () => ({ gyms: v[2], weeklyHours: v[3], online: v[4], inPerson: v[5] }));
      case 'removeTrainer': return set(s.trainers, (r) => r.id === v[0] && r.ownerId === v[1], () => ({ status: 'removed', inviteCode: null }));
      case 'insertGroup': s.groups.push({ id: v[0], ownerId: v[1], trainerUserId: v[2], name: v[3], gymId: v[4], dayPair: v[5], hour: v[6], startDate: v[7], weeks: v[8], minSeats: v[9], maxSeats: v[10], cutoffHours: v[11], decision: null, status: 'open' }); return 1;
      case 'moveGym': return set(s.groups, (g) => g.id === v[0] && g.ownerId === v[1] && g.status === 'open', () => ({ gymId: v[2] }));
      case 'decide': return set(s.groups, (g) => g.id === v[0] && g.ownerId === v[1] && g.status === 'open', (g) => ({ decision: v[2], status: v[2] === 'cancel' ? 'cancelled' : g.status }));
      case 'insertPass': s.passes.push({ id: v[0], groupId: v[1], userId: v[2], kind: v[3], sessions: v[4], startWeek: v[5], windowEnd: v[6], priceCents: v[7], payMode: v[8], paidAt: null, markedPaidByUserId: null, status: 'active' }); return 1;
      case 'insertSeat': {
        if (s.seats.some((r) => r.slotKey === v[1] && r.seat === v[2])) throw unique('GroupSeat_slotKey_seat_key');
        if (v[10] && s.seats.some((r) => r.makeupForId === v[10])) throw unique('GroupSeat_makeupForId_key');
        s.seats.push({ id: v[0], slotKey: v[1], seat: v[2], groupId: v[3], gymId: v[4], userId: v[5], passId: v[6], date: v[7], startsAt: v[8], kind: v[9], makeupForId: v[10], status: 'booked', late: false, createdAt: now() });
        return 1;
      }
      case 'cancelSeat': return set(s.seats, (r) => r.id === v[0] && r.userId === v[1] && r.status === 'booked', () => ({ status: 'cancelled', seat: null, late: v[2], makeupForId: null }));
      case 'markSeat': return set(s.seats, (r) => r.id === v[0] && ['booked', 'present', 'missed'].includes(r.status), () => ({ status: v[1] }));
      case 'setPassPaid': return set(s.passes, (p) => p.id === v[0] && p.status === 'active', () => ({ paidAt: v[1] ? now() : null, markedPaidByUserId: v[1] ? v[2] : null }));
      case 'insertWait': if (s.waits.some((w) => w.groupId === v[1] && w.userId === v[2])) return 0; s.waits.push({ id: v[0], groupId: v[1], userId: v[2], createdAt: now() }); return 1;
      case 'insertInPerson': {
        if (s.inPerson.some((r) => r.slotLock === v[8])) return 0;
        s.inPerson.push({ id: v[0], trainerUserId: v[1], clientUserId: v[2], gymId: v[3], startsAt: v[4], minutes: v[5], priceCents: v[6], payMode: v[7], paidAt: null, status: 'booked', late: false, slotLock: v[8] });
        return 1;
      }
      case 'cancelInPerson': return set(s.inPerson, (r) => r.id === v[0] && r.clientUserId === v[1] && r.status === 'booked', () => ({ status: 'cancelled', late: v[2], slotLock: null }));
      case 'markInPerson': return set(s.inPerson, (r) => r.id === v[0] && ['booked', 'present', 'missed'].includes(r.status), () => ({ status: v[1] }));
      case 'setInPersonPaid': return set(s.inPerson, (r) => r.id === v[0] && r.status !== 'cancelled', () => ({ paidAt: v[1] ? now() : null, markedPaidByUserId: v[1] ? v[2] : null }));
      default: throw new Error(`fake: ${k} is not a write`);
    }
  }

  const raw = {
    $queryRawUnsafe: async (sql: string, ...v: any[]) => query(sql, v),
    $executeRawUnsafe: async (sql: string, ...v: any[]) => execute(sql, v),
  };
  const db = {
    ...raw,
    // no isolation is needed in a single-threaded fake: the store's lock + count + insert runs in one go
    $transaction: async (fn: (tx: typeof raw) => Promise<unknown>) => fn(raw),
    user: {
      findUnique: async ({ where }: any) => { const u = s.users.find((x) => x.id === where.id); return u ? { dobYear: u.dobYear, name: u.name, id: u.id } : null; },
      findMany: async ({ where }: any) => s.users.filter((u) => where.id.in.includes(u.id)).map((u) => ({ id: u.id, name: u.name })),
    },
    guardianConsent: { findMany: async ({ where }: any) => s.consents.filter((c) => c.menteeId === where.menteeId) },
    coachingProgram: {
      findFirst: async ({ where }: any) => s.programs.filter((p) => p.coachId === where.coachId && p.clientId === where.clientId && p.isActive === where.isActive).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
    },
    programMessage: { create: async ({ data }: any) => { s.writes.push('programMessage'); s.messages.push({ programId: data.programId, authorId: data.authorId, body: data.body }); return { id: `m${s.messages.length}` }; } },
    instructor: { findUnique: async ({ where }: any) => s.instructors.find((i) => i.userId === where.userId) ?? null },
    booking: { findMany: async () => s.bookings },
    marketplaceListing: {
      findMany: async ({ where }: any) => s.listings.filter((l) => l.creatorId === where.creatorId && l.active && String(l.itemKey).startsWith(where.itemKey.startsWith)),
    },
  };
  return { db: db as unknown as GroupDb, state: s };
}

export const adult = (id: string, name = id): FakeUser => ({ id, name, dobYear: 1990 });
export const teen = (id: string, name = id): FakeUser => ({ id, name, dobYear: new Date().getFullYear() - 15 });
export const child = (id: string, name = id): FakeUser => ({ id, name, dobYear: new Date().getFullYear() - 10 });

/** A group row as the table holds it. */
export function groupRow(over: Partial<Row> = {}): Row {
  return { id: 'g1', ownerId: 'owner', trainerUserId: 'owner', name: 'Valley Strength', gymId: '24hr-victory', dayPair: 'mon_wed', hour: 17, startDate: '2026-11-09', weeks: 8, minSeats: 6, maxSeats: 8, cutoffHours: 48, decision: null, status: 'open', ...over };
}
