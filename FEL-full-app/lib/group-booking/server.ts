// lib/group-booking/server.ts — GROUP-BOOKING (owner, 2026-11-02): the IO half. Each function answers { status, body } for
// a thin route (app/api/group-booking/**) or a server page.
//
//   groupsBoard    GET  /groups (page) · /api/group-booking          open groups by gym, days, time, with seats left
//   reserve        POST /api/group-booking/reserve                    drop-in, 4-week package or the full 8 weeks
//   waitlist       POST /api/group-booking/waitlist                   a full group: on the list, no charge
//   myBookings     GET  /api/group-booking/me                         my seats, make-up credits and their slots, my 1:1s
//   myAct          POST /api/group-booking/me                         cancel a seat · book a make-up · cancel a 1:1
//   oneOnOneBoard  GET  /groups/one-on-one (page)                     Elijah (and, later, trainers), online / in person
//   inPersonSlots  GET  /api/group-booking/one-on-one?trainer=…       open in-person times
//   bookInPerson   POST /api/group-booking/one-on-one                 book one
//   coachBoard     GET  /api/group-booking/coach                      the coach's groups, rosters, notices, gyms, trainers
//   coachAct       POST /api/group-booking/coach                      attendance, paid in person, move gym, message …
//   acceptInvite   POST /api/group-booking/trainer                    a trainer accepts an invite link
//
// GATES. Before the pending SQL every read is { available: false } and every write 503 group_booking_not_ready, with no
// statement run but the probe. A person who joins or books passes the coach-loop teen gate (lib/coach/teenGateServer.ts:
// under 13 never; 13–17 only with a guardian's coach-training consent, which fails closed for every teen today; a blank
// year is asked for first). The coach side is the business owner (config.ts ownerId) or one of their ACTIVE trainers, and a
// trainer sees only the groups they run. Payment is "pay at the gym" unless every online switch is on (rules.ts payPlan),
// and then the route only says so: the client pays through the EXISTING coach-business checkout. No route here calls Stripe.
import 'server-only';
import type { PrismaClient } from '@/public/_prisma/client';
import { readTeenGate, type TeenGateDb } from '@/lib/coach/teenGateServer';
import { teenGateBody } from '@/lib/coach/teenGate';
import { connectGate } from '@/lib/coach-business/connect';
import { calendarFeedIcs } from '@/lib/coach-store/ics';
import { openSlots, type BusyRange } from '@/lib/coach-store/slots';
import type { SessionLength } from '@/lib/coach-store/constants';
import { isCoachStoreEnabled } from '@/lib/flags';
import { ptParts } from '@/lib/sessions/schedule';
import { DAY_PAIR_LABEL, GYMS, SESSION_FORMAT, dollars, groupConfig, gymById, hourLabel, type GroupConfig } from './config';
import { atPt, dayLabel, groupSessions, groupSlotKey, makeupSlotKey, parseDayKey, ptDayKey } from './calendar';
import {
  cancelKind, cleanGroup, cutoffNotice, groupBusy, groupSeatsLeft, isMakeupCredit, joinOptions, makeupCheck, makeupWindow, moveGymCheck,
  oneOnOneChoices, packageMath, payPlan, HOLDS_SEAT, type GroupClass, type GroupDecision, type GroupPass, type JoinKind,
} from './rules';
import * as store from './store';
import { cancelRuleLine, joinTitle, payAtGymPrice } from './copy';

export type GroupDb = store.TxDb & TeenGateDb & Pick<PrismaClient, 'user' | 'coachingProgram' | 'programMessage'>
  & Partial<Pick<PrismaClient, 'instructor' | 'booking' | 'marketplaceListing'>>;

export interface Res { status: number; body: Record<string, unknown> }
const res = (status: number, body: Record<string, unknown>): Res => ({ status, body });
export const NOT_READY: Res = res(503, { error: 'group_booking_not_ready' });
const DAY = 86_400_000;
const soft = <T,>(p: Promise<T> | undefined, empty: T): Promise<T> => (p ? p.catch(() => empty) : Promise.resolve(empty));
const asBody = (v: unknown) => (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;

/** Ready = the owner is configured and the tables are there. */
async function ready(db: GroupDb, cfg: GroupConfig, nowMs: number): Promise<boolean> {
  return !!cfg.ownerId && (await store.groupBookingReady(db, nowMs));
}

async function names(db: GroupDb, ids: readonly string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map();
  const rows = await soft(db.user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } }), [] as { id: string; name: string | null }[]);
  return new Map(rows.map((r) => [r.id, r.name?.trim() || 'Athlete']));
}

async function gymsView(db: GroupDb, nowMs: number) {
  const addr = (await store.gymAddresses(db, nowMs)) ?? new Map<string, string | null>();
  return GYMS.map((g) => ({ id: g.id, name: g.name, address: addr.get(g.id) ?? null }));
}

/** The owner's storefront profile (coach store), when there is one. */
async function ownerProfile(db: GroupDb, ownerId: string) {
  return soft(db.instructor?.findUnique({
    where: { userId: ownerId },
    select: { id: true, slug: true, displayName: true, published: true, weeklyHours: true, blackoutDates: true, bufferMinutes: true, minNoticeHours: true, maxDaysAhead: true },
  }), null);
}

const visible = (g: GroupClass, now: Date) => g.status === 'open' && groupSessions(g).some((s) => s.startsAt.getTime() > now.getTime());

// ── joining ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function groupsBoard(db: GroupDb, now: Date = new Date(), env: NodeJS.ProcessEnv = process.env, onlyId?: string): Promise<Res> {
  const cfg = groupConfig(env), nowMs = now.getTime();
  if (!(await ready(db, cfg, nowMs))) return res(200, { available: false });
  let groups = (await store.openGroups(db, nowMs)) ?? [];
  groups = groups.filter((g) => g.ownerId === cfg.ownerId && visible(g, now) && (!onlyId || g.id === onlyId));
  const keys = groups.flatMap((g) => groupSessions(g).map((s) => groupSlotKey(g.id, s.date)));
  const taken = (await store.takenBySlot(db, keys, nowMs)) ?? new Map<string, number>();
  const gyms = await gymsView(db, nowMs);
  const trainerNames = await names(db, groups.map((g) => g.trainerUserId));
  const profile = cfg.ownerId ? await ownerProfile(db, cfg.ownerId) : null;
  if (profile?.displayName && cfg.ownerId) trainerNames.set(cfg.ownerId, profile.displayName);
  const gateOk = connectGate(env).ok;
  const cards = groups.map((g) => {
    const opts = joinOptions(g, now, cfg);
    const seats = groupSeatsLeft(g, taken, now, (d) => groupSlotKey(g.id, d));
    const all = groupSessions(g);
    const gym = gyms.find((x) => x.id === g.gymId);
    return {
      id: g.id, name: g.name, gymId: g.gymId, gymName: gym?.name ?? g.gymId, gymAddress: gym?.address ?? null,
      dayPair: g.dayPair, days: DAY_PAIR_LABEL[g.dayPair], hour: g.hour, time: hourLabel(g.hour),
      startLabel: dayLabel(all[0].date), endLabel: dayLabel(all[all.length - 1].date), weeks: g.weeks,
      seatsLeft: seats.left, full: seats.full, maxSeats: g.maxSeats, minSeats: g.minSeats, trainerName: trainerNames.get(g.trainerUserId) ?? 'Coach',
      options: opts.map((o) => {
        const mode = payPlan(cfg, gateOk, o.kind).mode;
        return { kind: o.kind, title: joinTitle(o.kind, cfg), priceCents: o.priceCents, priceLabel: mode === 'at_gym' ? payAtGymPrice(o.priceCents) : dollars(o.priceCents),
          payMode: mode, sessions: o.sessions.length, firstLabel: dayLabel(o.sessions[0].date), firstDate: o.sessions[0].date };
      }),
      lateJoin: opts.some((o) => o.kind === 'drop_in') && !opts.some((o) => o.kind === 'package'),
    };
  });
  const math = packageMath(cfg);
  return res(200, {
    available: true, groups: cards, gyms, format: SESSION_FORMAT, cancelLine: cancelRuleLine(cfg),
    prices: { dropInCents: cfg.dropInCents, packageCents: cfg.packageCents, perSessionCents: math.perSessionCents, savingCents: math.savingCents },
    times: cfg.hours.map((h) => ({ hour: h, label: hourLabel(h) })),
    sizes: { min: cfg.minSeats, max: cfg.maxSeats, weeks: cfg.weeks },
  });
}

async function gateRefusal(db: GroupDb, userId: string, now: Date): Promise<Res | null> {
  const g = await readTeenGate(db, userId, now);
  return g.ok ? null : res(403, teenGateBody(g.error) as unknown as Record<string, unknown>);
}

function icsFor(events: { id: string; startsAt: Date; minutes: number; title: string; place: string }[], now: Date): string {
  return calendarFeedIcs({ name: 'FEL sessions', now, events: events.map((e) => ({ uid: e.id, startsAt: e.startsAt, endsAt: new Date(e.startsAt.getTime() + e.minutes * 60_000), title: e.title, place: e.place })) });
}

export async function reserve(db: GroupDb, userId: string, body: unknown, now: Date = new Date(), env: NodeJS.ProcessEnv = process.env): Promise<Res> {
  const cfg = groupConfig(env), nowMs = now.getTime(), b = asBody(body);
  if (!(await ready(db, cfg, nowMs))) return NOT_READY;
  const g = typeof b.groupId === 'string' ? await store.groupById(db, b.groupId, nowMs) : null;
  if (!g || g.ownerId !== cfg.ownerId) return res(404, { error: 'not_found' });
  if (!visible(g, now)) return res(409, { error: 'not_open' });
  const refused = await gateRefusal(db, userId, now);
  if (refused) return refused;
  const opt = joinOptions(g, now, cfg, typeof b.date === 'string' ? b.date : null).find((o) => o.kind === b.option);
  if (!opt) return res(409, { error: 'bad_option' });
  const keys = new Set(opt.sessions.map((s) => groupSlotKey(g.id, s.date)));
  const mine = (await store.seatsForUser(db, userId, new Date(opt.sessions[0].startsAt.getTime() - DAY), nowMs)) ?? [];
  if (mine.some((s) => keys.has(s.slotKey) && HOLDS_SEAT.includes(s.status))) return res(409, { error: 'already_booked' });
  const plan = payPlan(cfg, connectGate(env).ok, opt.kind);
  const r = await store.takeSeats(db, {
    pass: { groupId: g.id, userId, kind: opt.kind, sessions: opt.sessions.length, startWeek: opt.startWeek, windowEnd: opt.windowEnd, priceCents: opt.priceCents, payMode: plan.mode },
    userId, max: g.maxSeats,
    seats: opt.sessions.map((s) => ({ slotKey: groupSlotKey(g.id, s.date), groupId: g.id, gymId: g.gymId, date: s.date, startsAt: s.startsAt, kind: 'regular' as const, makeupForId: null })),
  }, nowMs);
  if (!r.ok) return r.reason === 'full' ? res(409, { error: 'full', waitlist: true }) : r.reason === 'not_ready' ? NOT_READY : res(500, { error: 'not_saved' });
  const gym = gymById(g.gymId)?.name ?? g.gymId;
  return res(201, {
    ok: true, passId: r.passId, seats: r.seatIds.length, priceCents: opt.priceCents, pay: plan,
    ics: icsFor(opt.sessions.map((s, i) => ({ id: r.seatIds[i], startsAt: s.startsAt, minutes: cfg.sessionMinutes, title: g.name, place: gym })), now),
  });
}

export async function waitlist(db: GroupDb, userId: string, body: unknown, now: Date = new Date(), env: NodeJS.ProcessEnv = process.env): Promise<Res> {
  const cfg = groupConfig(env), nowMs = now.getTime(), b = asBody(body);
  if (!(await ready(db, cfg, nowMs))) return NOT_READY;
  const g = typeof b.groupId === 'string' ? await store.groupById(db, b.groupId, nowMs) : null;
  if (!g || g.ownerId !== cfg.ownerId) return res(404, { error: 'not_found' });
  if (!visible(g, now)) return res(409, { error: 'not_open' });
  const refused = await gateRefusal(db, userId, now);
  if (refused) return refused;
  const n = await store.joinWaitlist(db, g.id, userId, nowMs);
  return n === null ? res(500, { error: 'not_saved' }) : res(201, { ok: true });
}

// ── my sessions ───────────────────────────────────────────────────────────────────────────────────────────────────────

export async function myBookings(db: GroupDb, userId: string, now: Date = new Date(), env: NodeJS.ProcessEnv = process.env): Promise<Res> {
  const cfg = groupConfig(env), nowMs = now.getTime();
  if (!(await ready(db, cfg, nowMs))) return res(200, { available: false });
  const [seats, passes, inPerson] = await Promise.all([
    store.seatsForUser(db, userId, new Date(nowMs - 21 * DAY), nowMs), store.passesForUser(db, userId, nowMs), store.inPersonForClient(db, userId, new Date(nowMs - 2 * 3_600_000), nowMs),
  ]);
  if (!seats || !passes) return res(200, { available: false });
  const passOf = new Map(passes.map((p) => [p.id, p]));
  const groupIds = [...new Set(seats.map((s) => s.groupId))].slice(0, 30);
  const groups = new Map<string, GroupClass>();
  for (const id of groupIds) { const g = await store.groupById(db, id, nowMs); if (g) groups.set(id, g); }
  const credits = seats.filter((s) => { const p = passOf.get(s.passId); return !!p && isMakeupCredit(s, p); });
  const made = (await store.makeupsFor(db, credits.map((c) => c.id), nowMs)) ?? new Set<string>();
  const open = credits.filter((c) => !made.has(c.id));
  const windows = open.map((c) => ({ c, slots: groups.get(c.groupId) ? makeupWindow(c, passOf.get(c.passId)!, groups.get(c.groupId)!, now, cfg) : [] }));
  const taken = (await store.takenBySlot(db, windows.flatMap((w) => w.slots.map((s) => s.slotKey)), nowMs)) ?? new Map<string, number>();
  const trainerNames = await names(db, (inPerson ?? []).map((s) => s.trainerUserId));
  const gymName = (id: string) => gymById(id)?.name ?? id;
  return res(200, {
    available: true, cancelLine: cancelRuleLine(cfg),
    seats: seats.filter((s) => s.status !== 'cancelled' && s.startsAt.getTime() > nowMs - 2 * 3_600_000).map((s) => ({
      id: s.id, title: groups.get(s.groupId)?.name ?? 'Group', kind: s.kind, gymName: gymName(s.gymId), dayLabel: dayLabel(s.date),
      time: hourLabel(ptParts(s.startsAt).hour),
      startsAt: s.startsAt.toISOString(), status: s.status, cancel: cancelKind(s.startsAt, now, cfg), passKind: passOf.get(s.passId)?.kind ?? null,
    })),
    makeups: windows.map(({ c, slots }) => ({
      seatId: c.id, missed: `${groups.get(c.groupId)?.name ?? 'Group'} · ${dayLabel(c.date)}`,
      options: slots.filter((s) => (taken.get(s.slotKey) ?? 0) < cfg.maxSeats).map((s) => ({ date: s.date, hour: s.hour, label: `${dayLabel(s.date)} · ${hourLabel(s.hour)}`, left: cfg.maxSeats - (taken.get(s.slotKey) ?? 0) })),
    })),
    passes: passes.map((p) => ({ id: p.id, kind: p.kind, title: joinTitle(p.kind, cfg), group: groups.get(p.groupId)?.name ?? null, priceLabel: dollars(p.priceCents), paid: !!p.paidAt, payMode: p.payMode })),
    oneOnOne: (inPerson ?? []).filter((s) => s.status !== 'cancelled').map((s) => ({
      id: s.id, startsAt: s.startsAt.toISOString(), gymName: gymName(s.gymId), trainerName: trainerNames.get(s.trainerUserId) ?? 'Coach', status: s.status,
      priceLabel: s.payMode === 'at_gym' ? payAtGymPrice(s.priceCents) : dollars(s.priceCents), cancel: cancelKind(s.startsAt, now, cfg),
    })),
  });
}

export async function myAct(db: GroupDb, userId: string, body: unknown, now: Date = new Date(), env: NodeJS.ProcessEnv = process.env): Promise<Res> {
  const cfg = groupConfig(env), nowMs = now.getTime(), b = asBody(body);
  if (!(await ready(db, cfg, nowMs))) return NOT_READY;
  if (b.action === 'cancel') {
    const s = typeof b.seatId === 'string' ? await store.seatById(db, b.seatId, nowMs) : null;
    if (!s || s.userId !== userId || s.status !== 'booked') return res(404, { error: 'not_found' });
    const kind = cancelKind(s.startsAt, now, cfg);
    if (kind === 'started') return res(409, { error: 'too_late' });
    const n = await store.cancelSeat(db, s.id, userId, kind === 'late', nowMs);
    return n ? res(200, { ok: true, late: kind === 'late' }) : res(404, { error: 'not_found' });
  }
  if (b.action === 'makeup') {
    const source = typeof b.seatId === 'string' ? await store.seatById(db, b.seatId, nowMs) : null;
    if (!source || source.userId !== userId) return res(404, { error: 'not_found' });
    const [pass, group] = await Promise.all([store.passById(db, source.passId, nowMs), store.groupById(db, source.groupId, nowMs)]);
    if (!pass || !group) return res(404, { error: 'not_found' });
    const date = typeof b.date === 'string' && parseDayKey(b.date) ? b.date : '';
    const hour = Number(b.hour);
    const slot = { gymId: group.gymId, date, hour };
    const slotKey = makeupSlotKey(group.gymId, date, hour);
    const [made, taken] = await Promise.all([store.makeupsFor(db, [source.id], nowMs), store.takenBySlot(db, [slotKey], nowMs)]);
    const check = makeupCheck({ source, pass, group, slot, taken: taken?.get(slotKey) ?? 0, alreadyUsed: !!made?.has(source.id), now, cfg });
    if (!check.ok) return res(409, { error: check.reason });
    const r = await store.takeSeats(db, {
      pass: null, existingPassId: pass.id, userId, max: cfg.maxSeats,
      seats: [{ slotKey, groupId: group.id, gymId: group.gymId, date, startsAt: atPt(date, hour), kind: 'makeup', makeupForId: source.id }],
    }, nowMs);
    if (!r.ok) return r.reason === 'full' ? res(409, { error: 'full' }) : r.reason === 'not_ready' ? NOT_READY : res(409, { error: 'already_made_up' });
    return res(201, { ok: true, seatId: r.seatIds[0] });
  }
  if (b.action === 'cancel_1on1') {
    const s = typeof b.id === 'string' ? await store.inPersonById(db, b.id, nowMs) : null;
    if (!s || s.clientUserId !== userId || s.status !== 'booked') return res(404, { error: 'not_found' });
    const kind = cancelKind(s.startsAt, now, cfg);
    if (kind === 'started') return res(409, { error: 'too_late' });
    const n = await store.cancelInPerson(db, s.id, userId, kind === 'late', nowMs);
    return n ? res(200, { ok: true, late: kind === 'late' }) : res(404, { error: 'not_found' });
  }
  return res(400, { error: 'unknown_action' });
}

// ── 1:1 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

interface Bookable { id: string; userId: string; name: string; gyms: string[]; weekly: store.WeeklyWindow[]; rules: { buffer: number; notice: number; days: number; blackouts: string[] }; online: { slug: string; listingId: string; priceCents: number; durationMin: number } | null }

/** The coach store's own live 1:1 listing for the owner (its price is what checkout charges). Null while the store is off. */
async function onlineListing(db: GroupDb, ownerId: string, slug: string | null) {
  if (!slug || !isCoachStoreEnabled() || !db.marketplaceListing) return null;
  const rows = await soft(db.marketplaceListing.findMany({
    where: { creatorId: ownerId, active: true, itemKey: { startsWith: `coach-store:${slug}:live_1on1:` } },
    select: { id: true, priceUsd: true, itemKey: true }, orderBy: { priceUsd: 'desc' }, take: 5,
  }), [] as { id: string; priceUsd: number; itemKey: string }[]);
  const lengthOf = (k: string) => Number(k.split(':')[3]) || 0;
  const best = rows.find((r) => lengthOf(r.itemKey) === 60) ?? rows[0];
  return best ? { slug, listingId: best.id, priceCents: best.priceUsd, durationMin: lengthOf(best.itemKey) || 60 } : null;
}

async function bookables(db: GroupDb, cfg: GroupConfig, nowMs: number): Promise<Bookable[]> {
  if (!cfg.ownerId) return [];
  const p = await ownerProfile(db, cfg.ownerId);
  const ownerName = p?.displayName || (await names(db, [cfg.ownerId])).get(cfg.ownerId) || 'Coach';
  const out: Bookable[] = [{
    id: 'owner', userId: cfg.ownerId, name: ownerName, gyms: GYMS.map((g) => g.id), weekly: store.cleanWeekly(p?.weeklyHours),
    rules: { buffer: p?.bufferMinutes ?? 15, notice: p?.minNoticeHours ?? 12, days: p?.maxDaysAhead ?? 28, blackouts: Array.isArray(p?.blackoutDates) ? (p!.blackoutDates as unknown[]).filter((d): d is string => typeof d === 'string') : [] },
    online: await onlineListing(db, cfg.ownerId, p?.published ? p.slug : null),
  }];
  if (cfg.trainersBookable) {
    for (const t of (await store.trainersFor(db, cfg.ownerId, nowMs)) ?? []) {
      if (t.status !== 'active' || !t.trainerUserId || !t.inPerson) continue;
      out.push({ id: t.id, userId: t.trainerUserId, name: t.displayName, gyms: t.gyms.filter((g) => gymById(g)), weekly: t.weeklyHours, rules: { buffer: 15, notice: 12, days: 28, blackouts: [] }, online: null });
    }
  }
  return out;
}

export async function oneOnOneBoard(db: GroupDb, now: Date = new Date(), env: NodeJS.ProcessEnv = process.env): Promise<Res> {
  const cfg = groupConfig(env), nowMs = now.getTime();
  if (!(await ready(db, cfg, nowMs))) return res(200, { available: false });
  const gyms = await gymsView(db, nowMs);
  const list = await bookables(db, cfg, nowMs);
  return res(200, {
    available: true, cancelLine: cancelRuleLine(cfg),
    trainers: list.map((t) => ({
      id: t.id, name: t.name, gyms: gyms.filter((g) => t.gyms.includes(g.id)),
      choices: oneOnOneChoices(cfg, t.online).map((c) => ({
        ...c, priceLabel: c.priceCents === null ? null : c.mode === 'in_person' ? payAtGymPrice(c.priceCents) : dollars(c.priceCents),
      })),
      online: t.online ? { slug: t.online.slug, listingId: t.online.listingId, durationMin: t.online.durationMin } : null,
    })),
  });
}

async function slotsFor(db: GroupDb, t: Bookable, cfg: GroupConfig, now: Date) {
  const nowMs = now.getTime(), to = new Date(nowMs + (t.rules.days + 1) * DAY);
  const [groups, sessions] = await Promise.all([store.groupsForTrainer(db, t.userId, nowMs), store.inPersonForTrainers(db, [t.userId], new Date(nowMs - DAY), to, nowMs)]);
  const busy: BusyRange[] = [
    ...(groups ?? []).flatMap((g) => groupBusy(g, cfg)),
    ...(sessions ?? []).filter((s) => s.status !== 'cancelled').map((s) => ({ startsAt: s.startsAt, endsAt: new Date(s.startsAt.getTime() + s.minutes * 60_000) })),
  ];
  if (db.instructor && db.booking) {
    const inst = await soft(db.instructor.findUnique({ where: { userId: t.userId }, select: { id: true } }), null);
    if (inst) {
      const rows = await soft(db.booking.findMany({ where: { instructorId: inst.id, status: { in: ['HELD', 'PAID'] }, startsAt: { lt: to }, endsAt: { gt: now } }, select: { startsAt: true, endsAt: true } }), [] as { startsAt: Date | null; endsAt: Date | null }[]);
      for (const b of rows) if (b.startsAt && b.endsAt) busy.push({ startsAt: b.startsAt, endsAt: b.endsAt });
    }
  }
  return openSlots({ now, weekly: t.weekly, blackouts: t.rules.blackouts, busy, bufferMinutes: t.rules.buffer, minNoticeHours: t.rules.notice, maxDaysAhead: t.rules.days, durations: [cfg.inPersonMinutes as SessionLength] });
}

export async function inPersonSlots(db: GroupDb, trainerId: string, now: Date = new Date(), env: NodeJS.ProcessEnv = process.env): Promise<Res> {
  const cfg = groupConfig(env), nowMs = now.getTime();
  if (!(await ready(db, cfg, nowMs))) return res(200, { available: false });
  const t = (await bookables(db, cfg, nowMs)).find((x) => x.id === trainerId);
  if (!t) return res(404, { error: 'not_bookable' });
  const slots = (await slotsFor(db, t, cfg, now)).slice(0, 60);
  return res(200, { available: true, slots: slots.map((s) => ({ startsAt: s.startsAt.toISOString(), label: s.label, day: ptDayKey(s.startsAt) })) });
}

export async function bookInPerson(db: GroupDb, userId: string, body: unknown, now: Date = new Date(), env: NodeJS.ProcessEnv = process.env): Promise<Res> {
  const cfg = groupConfig(env), nowMs = now.getTime(), b = asBody(body);
  if (!(await ready(db, cfg, nowMs))) return NOT_READY;
  const t = (await bookables(db, cfg, nowMs)).find((x) => x.id === b.trainerId);
  if (!t) return res(404, { error: 'not_bookable' });
  if (t.userId === userId) return res(409, { error: 'not_bookable' });
  if (typeof b.gymId !== 'string' || !t.gyms.includes(b.gymId)) return res(400, { error: 'bad_gym' });
  const refused = await gateRefusal(db, userId, now);
  if (refused) return refused;
  const at = typeof b.startsAt === 'string' ? new Date(b.startsAt) : null;
  if (!at || Number.isNaN(at.getTime())) return res(400, { error: 'bad_slot' });
  const slot = (await slotsFor(db, t, cfg, now)).find((s) => s.startsAt.getTime() === at.getTime());
  if (!slot) return res(409, { error: 'bad_slot' });
  // An in-person 1:1 is paid at the gym in this version (config.ts): no checkout.
  const plan = { mode: 'at_gym' as const };
  const id = await store.insertInPerson(db, { trainerUserId: t.userId, clientUserId: userId, gymId: b.gymId, startsAt: slot.startsAt, minutes: cfg.inPersonMinutes, priceCents: cfg.inPersonCents, payMode: plan.mode }, nowMs);
  if (!id) return res(409, { error: 'slot_taken' });
  const gym = gymById(b.gymId)!.name;
  return res(201, { ok: true, id, pay: plan, priceCents: cfg.inPersonCents, ics: icsFor([{ id, startsAt: slot.startsAt, minutes: cfg.inPersonMinutes, title: `1:1 with ${t.name}`, place: gym }], now) });
}

// ── the coach ─────────────────────────────────────────────────────────────────────────────────────────────────────────

type Role = { role: 'owner'; ownerId: string } | { role: 'trainer'; ownerId: string; trainer: store.GroupTrainer };

async function roleOf(db: GroupDb, userId: string, cfg: GroupConfig, nowMs: number): Promise<Role | null> {
  if (!cfg.ownerId) return null;
  if (userId === cfg.ownerId) return { role: 'owner', ownerId: cfg.ownerId };
  const t = await store.activeTrainerByUser(db, userId, nowMs);
  return t && t.ownerId === cfg.ownerId ? { role: 'trainer', ownerId: cfg.ownerId, trainer: t } : null;
}

const mayRun = (r: Role, g: GroupClass) => g.ownerId === r.ownerId && (r.role === 'owner' || g.trainerUserId === r.trainer.trainerUserId);

export async function coachBoard(db: GroupDb, userId: string, now: Date = new Date(), env: NodeJS.ProcessEnv = process.env): Promise<Res> {
  const cfg = groupConfig(env), nowMs = now.getTime();
  if (!(await ready(db, cfg, nowMs))) return res(200, { available: false });
  const role = await roleOf(db, userId, cfg, nowMs);
  if (!role) return res(403, { error: 'not_a_coach' });
  const groups = ((role.role === 'owner' ? await store.groupsForOwner(db, role.ownerId, nowMs) : await store.groupsForTrainer(db, userId, nowMs)) ?? []).filter((g) => mayRun(role, g));
  const ids = groups.map((g) => g.id);
  const [passes, waits] = await Promise.all([store.passesForGroups(db, ids, nowMs), store.waitFor(db, ids, nowMs)]);
  const from = nowMs - 7 * DAY, to = nowMs + 28 * DAY;
  const near = (d: Date) => d.getTime() >= from && d.getTime() < to;
  const sessionKeys = groups.flatMap((g) => groupSessions(g).filter((s) => near(s.startsAt)).map((s) => groupSlotKey(g.id, s.date)));
  const taken = (await store.takenBySlot(db, sessionKeys, nowMs)) ?? new Map<string, number>();
  const gyms = await gymsView(db, nowMs);
  const gymName = (id: string) => gyms.find((g) => g.id === id)?.name ?? id;
  const trainers = role.role === 'owner' ? ((await store.trainersFor(db, role.ownerId, nowMs)) ?? []) : [];
  const trainerIds = role.role === 'owner' ? [role.ownerId, ...trainers.flatMap((t) => (t.status === 'active' && t.trainerUserId ? [t.trainerUserId] : []))] : [userId];
  const makeupSeats = (await store.makeupSeatsAt(db, [...new Set(groups.map((g) => g.gymId))], new Date(from), new Date(to), nowMs)) ?? [];
  const inPerson = (await store.inPersonForTrainers(db, trainerIds, new Date(from), new Date(to), nowMs)) ?? [];
  const who = await names(db, [...inPerson.map((s) => s.clientUserId), ...groups.map((g) => g.trainerUserId), ...trainerIds]);
  const makeupSlots = new Map<string, { slotKey: string; gymName: string; startsAt: Date; label: string; taken: number }>();
  for (const s of makeupSeats.filter((s) => ids.includes(s.groupId))) {
    const m = makeupSlots.get(s.slotKey) ?? { slotKey: s.slotKey, gymName: gymName(s.gymId), startsAt: s.startsAt, label: `${dayLabel(s.date)} · ${hourLabel(Number(s.slotKey.split(':')[3]))}`, taken: 0 };
    m.taken++;
    makeupSlots.set(s.slotKey, m);
  }
  // The owner's short to-do: the online 1:1 price the owner set (config) vs the coach-store listing that charges, and blank gyms.
  const todo: string[] = [];
  if (role.role === 'owner') {
    const p = await ownerProfile(db, role.ownerId);
    const listing = await onlineListing(db, role.ownerId, p?.published ? p.slug : null);
    if (!listing) todo.push(`Online 1:1 opens when your coach store has a live 1:1 listing (${dollars(cfg.onlineCents)}, ${cfg.onlineMinutes} min).`);
    else if (listing.priceCents !== cfg.onlineCents) todo.push(`Your online 1:1 listing charges ${dollars(listing.priceCents)}; your price is ${dollars(cfg.onlineCents)}. Change the listing to match.`);
    const blank = gyms.filter((g) => !g.address).length;
    if (blank) todo.push(`Add the address for ${blank} gym${blank === 1 ? '' : 's'} (Gyms, below).`);
  }
  return res(200, {
    available: true, role: role.role, todo,
    groups: groups.map((g) => {
      const people = new Set((passes ?? []).filter((p) => p.groupId === g.id).map((p) => p.userId)).size;
      const notice = cutoffNotice(g, people, now);
      const waiting = (waits ?? []).filter((w) => w.groupId === g.id).length;
      const all = groupSessions(g);
      return {
        id: g.id, name: g.name, gymId: g.gymId, gymName: gymName(g.gymId), days: DAY_PAIR_LABEL[g.dayPair], time: hourLabel(g.hour), status: g.status, decision: g.decision,
        trainerName: who.get(g.trainerUserId) ?? 'Coach', people, minSeats: g.minSeats, maxSeats: g.maxSeats, waitlist: waiting,
        line: `${people}/${g.maxSeats} people · ${waiting} waitlist · ${people >= g.minSeats ? 'runs' : `under ${g.minSeats}`}`,
        notice: notice ? { line: `${notice.people} of ${notice.min} by the cut-off. Run, merge or cancel?`, firstAt: notice.firstAt.toISOString() } : null,
        startLabel: dayLabel(all[0].date), endLabel: dayLabel(all[all.length - 1].date),
        sessions: all.filter((s) => near(s.startsAt)).map((s) => ({ slotKey: groupSlotKey(g.id, s.date), label: `${dayLabel(s.date)} · ${hourLabel(g.hour)}`, startsAt: s.startsAt.toISOString(), taken: taken.get(groupSlotKey(g.id, s.date)) ?? 0 })),
      };
    }),
    makeups: [...makeupSlots.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()).map((m) => ({ ...m, startsAt: m.startsAt.toISOString() })),
    oneOnOne: inPerson.filter((s) => s.status !== 'cancelled').map((s) => ({
      id: s.id, client: who.get(s.clientUserId) ?? 'Athlete', trainer: who.get(s.trainerUserId) ?? 'Coach', gymName: gymName(s.gymId), startsAt: s.startsAt.toISOString(),
      status: s.status, paid: !!s.paidAt, payMode: s.payMode, priceLabel: dollars(s.priceCents),
    })),
    gyms,
    trainers: trainers.map((t) => ({ id: t.id, name: t.displayName, status: t.status, gyms: t.gyms, invitePath: t.inviteCode ? `/groups/trainer/${t.inviteCode}` : null, bookable: cfg.trainersBookable && t.status === 'active' })),
    form: { hours: cfg.hours.map((h) => ({ hour: h, label: hourLabel(h) })), dayPairs: Object.entries(DAY_PAIR_LABEL).map(([id, label]) => ({ id, label })), minSeats: cfg.minSeats, maxSeats: cfg.maxSeats, weeks: cfg.weeks },
  });
}

/** One session's roster: who, what they bought, paid in person, attendance. */
export async function coachRoster(db: GroupDb, userId: string, slotKey: string, now: Date = new Date(), env: NodeJS.ProcessEnv = process.env): Promise<Res> {
  const cfg = groupConfig(env), nowMs = now.getTime();
  if (!(await ready(db, cfg, nowMs))) return res(200, { available: false });
  const role = await roleOf(db, userId, cfg, nowMs);
  if (!role) return res(403, { error: 'not_a_coach' });
  const seats = ((await store.seatsInSlot(db, slotKey, nowMs)) ?? []).filter((s) => s.status !== 'cancelled');
  const groups = new Map<string, GroupClass>();
  for (const id of new Set(seats.map((s) => s.groupId))) { const g = await store.groupById(db, id, nowMs); if (g && mayRun(role, g)) groups.set(id, g); }
  const mineSeats = seats.filter((s) => groups.has(s.groupId));
  const passes = new Map(((await store.passesForGroups(db, [...groups.keys()], nowMs)) ?? []).map((p) => [p.id, p] as const));
  const who = await names(db, mineSeats.map((s) => s.userId));
  return res(200, {
    available: true, slotKey,
    rows: mineSeats.map((s) => {
      const p = passes.get(s.passId);
      return { seatId: s.id, name: who.get(s.userId) ?? 'Athlete', status: s.status, kind: s.kind, group: groups.get(s.groupId)?.name ?? '', passId: s.passId, passKind: p?.kind ?? null, paid: !!p?.paidAt, payMode: p?.payMode ?? 'at_gym', priceLabel: p ? dollars(p.priceCents) : null };
    }),
  });
}

async function messageGroup(db: GroupDb, senderId: string, g: GroupClass, text: string, nowMs: number): Promise<{ sent: number; noThread: number }> {
  const members = [...new Set(((await store.passesForGroups(db, [g.id], nowMs)) ?? []).map((p) => p.userId))];
  const out = { sent: 0, noThread: 0 };
  for (const m of members) {
    const thread = await soft(db.coachingProgram.findFirst({ where: { coachId: senderId, clientId: m, isActive: true }, orderBy: { createdAt: 'desc' }, select: { id: true } }), null);
    if (!thread) { out.noThread++; continue; }
    await db.programMessage.create({ data: { programId: thread.id, authorId: senderId, body: text } });
    out.sent++;
  }
  return out;
}

const DECISIONS: readonly GroupDecision[] = ['run', 'merge', 'cancel'];

export async function coachAct(db: GroupDb, userId: string, body: unknown, now: Date = new Date(), env: NodeJS.ProcessEnv = process.env): Promise<Res> {
  const cfg = groupConfig(env), nowMs = now.getTime(), b = asBody(body);
  if (!(await ready(db, cfg, nowMs))) return NOT_READY;
  const role = await roleOf(db, userId, cfg, nowMs);
  if (!role) return res(403, { error: 'not_a_coach' });
  const ownerOnly = () => (role.role === 'owner' ? null : res(403, { error: 'owner_only' }));
  const groupFor = async (id: unknown) => {
    const g = typeof id === 'string' ? await store.groupById(db, id, nowMs) : null;
    return g && mayRun(role, g) ? g : null;
  };
  const done = (n: number | null, ok: Record<string, unknown> = {}) => (n ? res(200, { ok: true, ...ok }) : n === 0 ? res(404, { error: 'not_found' }) : res(500, { error: 'not_saved' }));

  switch (b.action) {
    case 'create_group':
    case 'open_at_gym': {
      const no = ownerOnly(); if (no) return no;
      let input: unknown = b;
      if (b.action === 'open_at_gym') {
        const src = await groupFor(b.groupId);
        if (!src) return res(404, { error: 'not_found' });
        if (!gymById(typeof b.gymId === 'string' ? b.gymId : '') || b.gymId === src.gymId) return res(400, { error: 'bad_gym' });
        input = { name: src.name, gymId: b.gymId, dayPair: src.dayPair, hour: src.hour, startDate: src.startDate, trainerUserId: src.trainerUserId };
      }
      const c = cleanGroup(input, cfg, now, role.ownerId);
      if (!c.ok) return res(400, { error: c.error });
      const id = await store.insertGroup(db, role.ownerId, { ...c.g, weeks: cfg.weeks, minSeats: cfg.minSeats, maxSeats: cfg.maxSeats, cutoffHours: cfg.cutoffHours }, nowMs);
      return id ? res(201, { ok: true, id }) : res(500, { error: 'not_saved' });
    }
    case 'move_gym': {
      const no = ownerOnly(); if (no) return no;
      const g = await groupFor(b.groupId);
      if (!g) return res(404, { error: 'not_found' });
      const m = moveGymCheck(g, b.gymId);
      if (!m.ok) return res(400, { error: m.error });
      // Seats already booked keep their slot (a regular seat is keyed by group and date, not gym); make-ups follow the
      // home gym from now on. The coach tells the group with "message".
      return done(await store.moveGroupGym(db, g.id, role.ownerId, m.gymId, nowMs), { gymId: m.gymId });
    }
    case 'decide': {
      const no = ownerOnly(); if (no) return no;
      const g = await groupFor(b.groupId);
      if (!g) return res(404, { error: 'not_found' });
      if (!DECISIONS.includes(b.decision as GroupDecision)) return res(400, { error: 'bad_decision' });
      return done(await store.decideGroup(db, g.id, role.ownerId, b.decision as GroupDecision, nowMs));
    }
    case 'mark': {
      const s = typeof b.seatId === 'string' ? await store.seatById(db, b.seatId, nowMs) : null;
      if (!s || !(await groupFor(s.groupId))) return res(404, { error: 'not_found' });
      if (b.status !== 'present' && b.status !== 'missed' && b.status !== 'booked') return res(400, { error: 'bad_status' });
      return done(await store.markSeat(db, s.id, b.status, nowMs));
    }
    case 'paid': {
      const p = typeof b.passId === 'string' ? await store.passById(db, b.passId, nowMs) : null;
      if (!p || !(await groupFor(p.groupId))) return res(404, { error: 'not_found' });
      return done(await store.setPassPaid(db, p.id, b.paid !== false, userId, nowMs));
    }
    case 'message': {
      const g = await groupFor(b.groupId);
      if (!g) return res(404, { error: 'not_found' });
      const text = typeof b.text === 'string' ? b.text.trim().slice(0, 1000) : '';
      if (!text) return res(400, { error: 'empty' });
      return res(200, { ok: true, ...(await messageGroup(db, userId, g, text, nowMs)) });
    }
    case 'set_address': {
      const no = ownerOnly(); if (no) return no;
      if (typeof b.gymId !== 'string' || !gymById(b.gymId)) return res(400, { error: 'bad_gym' });
      const address = typeof b.address === 'string' ? b.address.trim().replace(/\s+/g, ' ').slice(0, 200) : '';
      return done(await store.setGymAddress(db, b.gymId, address || null, nowMs));
    }
    case 'invite_trainer': {
      const no = ownerOnly(); if (no) return no;
      const name = typeof b.name === 'string' ? b.name.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
      if (!name) return res(400, { error: 'bad_name' });
      const gyms = (Array.isArray(b.gyms) ? b.gyms : GYMS.map((g) => g.id)).filter((g): g is string => typeof g === 'string' && !!gymById(g));
      const r = await store.inviteTrainer(db, role.ownerId, name, gyms, nowMs);
      return r ? res(201, { ok: true, id: r.id, invitePath: `/groups/trainer/${r.code}` }) : res(500, { error: 'not_saved' });
    }
    case 'update_trainer': {
      const no = ownerOnly(); if (no) return no;
      if (typeof b.id !== 'string') return res(400, { error: 'bad_id' });
      const gyms = (Array.isArray(b.gyms) ? b.gyms : []).filter((g): g is string => typeof g === 'string' && !!gymById(g));
      return done(await store.updateTrainer(db, b.id, role.ownerId, { gyms, weeklyHours: store.cleanWeekly(b.weeklyHours), online: b.online !== false, inPerson: b.inPerson !== false }, nowMs));
    }
    case 'remove_trainer': {
      const no = ownerOnly(); if (no) return no;
      return typeof b.id === 'string' ? done(await store.removeTrainer(db, b.id, role.ownerId, nowMs)) : res(400, { error: 'bad_id' });
    }
    case 'mark_1on1':
    case 'paid_1on1': {
      const s = typeof b.id === 'string' ? await store.inPersonById(db, b.id, nowMs) : null;
      if (!s || (role.role === 'trainer' && s.trainerUserId !== userId)) return res(404, { error: 'not_found' });
      if (role.role === 'owner' && s.trainerUserId !== role.ownerId && !((await store.trainersFor(db, role.ownerId, nowMs)) ?? []).some((t) => t.trainerUserId === s.trainerUserId)) return res(404, { error: 'not_found' });
      if (b.action === 'paid_1on1') return done(await store.setInPersonPaid(db, s.id, b.paid !== false, userId, nowMs));
      if (b.status !== 'present' && b.status !== 'missed' && b.status !== 'booked') return res(400, { error: 'bad_status' });
      return done(await store.markInPerson(db, s.id, b.status, nowMs));
    }
    default:
      return res(400, { error: 'unknown_action' });
  }
}

export async function acceptInvite(db: GroupDb, userId: string, body: unknown, now: Date = new Date(), env: NodeJS.ProcessEnv = process.env): Promise<Res> {
  const cfg = groupConfig(env), nowMs = now.getTime(), b = asBody(body);
  if (!(await ready(db, cfg, nowMs))) return NOT_READY;
  if (typeof b.code !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(b.code)) return res(404, { error: 'not_found' });
  const g = await readTeenGate(db, userId, now);
  if (!g.ok || g.band !== 'adult') return res(403, { error: 'adults_only' });
  const t = await store.acceptTrainer(db, b.code, userId, nowMs);
  return t ? res(200, { ok: true, name: t.displayName }) : res(404, { error: 'not_found' });
}

export type { GroupPass, JoinKind };
