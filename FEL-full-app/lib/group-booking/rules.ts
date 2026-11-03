// lib/group-booking/rules.ts — GROUP-BOOKING: the owner's rules for group classes and 1:1 sessions, pure. Every number
// is groupConfig()'s (config.ts); the store and the routes only ever ask these functions.
//
//   joinOptions      what a person may buy for a group right now: a drop-in, a 4-week package, the full 8 weeks
//   seatState        seats left, full, under the minimum
//   cutoffNotice     the coach's "fewer than 6 by the cut-off" line (nothing auto-cancels)
//   cancelKind       free (24 h+ ahead) or late (counts as used)
//   makeupCheck      one make-up per missed session, same week or the next, not past the package, a seat under 8
//   cleanGroup       a coach's new group, checked
//   moveGymCheck     a group to another gym
//   payPlan          pay at the gym, or online through the existing checkout when every switch is on
//
// assumption: a group's start date is the Monday of its first week (any day given is moved to its week's Monday).
// assumption: a package starts on the first group week whose sessions are all still ahead, and must fit inside the group;
//             someone joining later can drop in (owner's coordinator, 2026-11-02: "Joining late? Drop in").
// assumption: a package's window ends on the Sunday that closes its last week, so that week's Fri/Sat make-ups count.
// assumption: a free cancel of a package seat earns a make-up too ("a package keeps the session").
import { DAY_PAIRS, gymById, isDayPair, type DayPair, type GroupConfig } from './config';
import { addDays, atPt, groupSessions, makeupSlots, mondayOf, parseDayKey, sundayOf, weekdayOf, weeksBetween, type MakeupSlot, type Occurrence } from './calendar';

export type GroupStatus = 'open' | 'cancelled';
export type GroupDecision = 'run' | 'merge' | 'cancel';
export type JoinKind = 'drop_in' | 'package' | 'full';
export type PayMode = 'at_gym' | 'online';
export type SeatStatus = 'booked' | 'present' | 'missed' | 'cancelled';
export type SeatKind = 'regular' | 'makeup';

export interface GroupClass {
  id: string;
  ownerId: string;
  trainerUserId: string;
  name: string;
  gymId: string;
  dayPair: DayPair;
  hour: number;
  /** The Monday of week 1, 'YYYY-MM-DD'. */
  startDate: string;
  weeks: number;
  minSeats: number;
  maxSeats: number;
  cutoffHours: number;
  decision: GroupDecision | null;
  status: GroupStatus;
}

export interface GroupPass {
  id: string;
  groupId: string;
  userId: string;
  kind: JoinKind;
  sessions: number;
  startWeek: number;
  /** The last day a make-up may fall on, 'YYYY-MM-DD'. */
  windowEnd: string;
  priceCents: number;
  payMode: PayMode;
  paidAt: Date | null;
  status: 'active' | 'cancelled';
}

export interface GroupSeat {
  id: string;
  slotKey: string;
  groupId: string;
  gymId: string;
  userId: string;
  passId: string;
  date: string;
  startsAt: Date;
  kind: SeatKind;
  makeupForId: string | null;
  status: SeatStatus;
  late: boolean;
}

/** The statuses that hold a seat in a slot. */
export const HOLDS_SEAT: readonly SeatStatus[] = ['booked', 'present', 'missed'];

// ── buying ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface JoinOption {
  kind: JoinKind;
  sessions: Occurrence[];
  priceCents: number;
  startWeek: number;
  windowEnd: string;
}

/** The package math (owner, 2026-11-02): 8 sessions for $400 is $50 a session, against $65 drop-in. */
export function packageMath(cfg: GroupConfig) {
  const perSessionCents = Math.round(cfg.packageCents / cfg.packageSessions);
  const dropInTotalCents = cfg.dropInCents * cfg.packageSessions;
  const packagesInGroup = cfg.weeks % cfg.packageWeeks === 0 ? cfg.weeks / cfg.packageWeeks : null;
  return {
    perSessionCents,
    dropInTotalCents,
    savingCents: dropInTotalCents - cfg.packageCents,
    packagesInGroup,
    fullCents: packagesInGroup === null ? null : cfg.packageCents * packagesInGroup,
  };
}

/** What may be bought for this group at `now`. Empty when the group is cancelled or over. */
export function joinOptions(g: GroupClass, now: Date, cfg: GroupConfig, dropInDate?: string | null): JoinOption[] {
  if (g.status !== 'open') return [];
  const all = groupSessions(g);
  const ahead = all.filter((s) => s.startsAt.getTime() > now.getTime());
  if (!ahead.length) return [];
  const out: JoinOption[] = [];
  const drop = (dropInDate ? ahead.find((s) => s.date === dropInDate) : null) ?? ahead[0];
  out.push({ kind: 'drop_in', sessions: [drop], priceCents: cfg.dropInCents, startWeek: drop.week, windowEnd: drop.date });
  // a package: the first week whose sessions are all still ahead, and it must fit inside the group
  const weekAhead = (w: number) => all.filter((s) => s.week === w).every((s) => s.startsAt.getTime() > now.getTime());
  let startWeek = 0;
  for (let w = 1; w <= g.weeks; w++) if (weekAhead(w)) { startWeek = w; break; }
  if (startWeek && startWeek + cfg.packageWeeks - 1 <= g.weeks) {
    const sessions = all.filter((s) => s.week >= startWeek && s.week < startWeek + cfg.packageWeeks);
    out.push({ kind: 'package', sessions, priceCents: cfg.packageCents, startWeek, windowEnd: sundayOf(sessions[sessions.length - 1].date) });
  }
  const math = packageMath(cfg);
  if (startWeek === 1 && math.fullCents !== null && g.weeks === cfg.weeks) {
    out.push({ kind: 'full', sessions: all, priceCents: math.fullCents, startWeek: 1, windowEnd: sundayOf(all[all.length - 1].date) });
  }
  return out;
}

// ── seats ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface SeatState { taken: number; left: number; full: boolean }

export function seatState(taken: number, maxSeats: number): SeatState {
  const left = Math.max(0, maxSeats - taken);
  return { taken, left, full: left === 0 };
}

/** Seats left in a group: the fewest open seats across its sessions still ahead (a package needs every one of them). */
export function groupSeatsLeft(g: GroupClass, takenBySlot: ReadonlyMap<string, number>, now: Date, slotKeyOf: (date: string) => string): SeatState {
  const ahead = groupSessions(g).filter((s) => s.startsAt.getTime() > now.getTime());
  const taken = ahead.reduce((m, s) => Math.max(m, takenBySlot.get(slotKeyOf(s.date)) ?? 0), 0);
  return seatState(taken, g.maxSeats);
}

// ── the coach's cut-off line ──────────────────────────────────────────────────────────────────────────────────────────

export interface CutoffNotice { people: number; min: number; deadline: Date; firstAt: Date }

/**
 * Fewer than the minimum by the cut-off (default 48 h before session 1): the coach is told, and decides run / merge /
 * cancel. Nothing here cancels anything. Null when there is nothing to say: enough people, a decision made, not yet the
 * cut-off, the group over or cancelled.
 */
export function cutoffNotice(g: GroupClass, people: number, now: Date): CutoffNotice | null {
  if (g.status !== 'open' || g.decision) return null;
  if (people >= g.minSeats) return null;
  const all = groupSessions(g);
  const firstAt = all[0].startsAt;
  const deadline = new Date(firstAt.getTime() - g.cutoffHours * 3_600_000);
  if (now.getTime() < deadline.getTime()) return null;
  if (now.getTime() >= all[all.length - 1].startsAt.getTime()) return null;
  return { people, min: g.minSeats, deadline, firstAt };
}

// ── cancelling ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Owner, 2026-11-02: 24 h+ ahead cancels free; later (or a no-show) the session counts as used. */
export function cancelKind(startsAt: Date, now: Date, cfg: GroupConfig): 'free' | 'late' | 'started' {
  const ms = startsAt.getTime() - now.getTime();
  if (ms <= 0) return 'started';
  return ms >= cfg.cancelFreeHours * 3_600_000 ? 'free' : 'late';
}

// ── make-ups ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export type MakeupRefusal = 'not_package' | 'not_missed' | 'already_made_up' | 'wrong_gym' | 'not_makeup_slot' | 'wrong_week' | 'past_package_end' | 'past' | 'full';

/** Is a seat a make-up credit at all (a missed or cancelled regular seat of a package)? */
export function isMakeupCredit(seat: GroupSeat, pass: GroupPass): boolean {
  return (pass.kind === 'package' || pass.kind === 'full') && pass.status === 'active' && seat.kind === 'regular' && (seat.status === 'missed' || seat.status === 'cancelled');
}

export function makeupCheck(i: {
  source: GroupSeat; pass: GroupPass; group: GroupClass; slot: { gymId: string; date: string; hour: number };
  taken: number; alreadyUsed: boolean; now: Date; cfg: GroupConfig;
}): { ok: true } | { ok: false; reason: MakeupRefusal } {
  const { source, pass, group, slot, cfg } = i;
  if (pass.kind !== 'package' && pass.kind !== 'full') return { ok: false, reason: 'not_package' };
  if (!isMakeupCredit(source, pass)) return { ok: false, reason: 'not_missed' };
  if (i.alreadyUsed) return { ok: false, reason: 'already_made_up' };
  if (slot.gymId !== group.gymId) return { ok: false, reason: 'wrong_gym' };
  if (!parseDayKey(slot.date) || !cfg.makeupDays.includes(weekdayOf(slot.date)) || !cfg.makeupHours.includes(slot.hour)) return { ok: false, reason: 'not_makeup_slot' };
  const w = weeksBetween(source.date, slot.date);
  if (w !== 0 && w !== 1) return { ok: false, reason: 'wrong_week' };
  if (slot.date > pass.windowEnd) return { ok: false, reason: 'past_package_end' };
  if (atPt(slot.date, slot.hour).getTime() <= i.now.getTime()) return { ok: false, reason: 'past' };
  if (i.taken >= cfg.maxSeats) return { ok: false, reason: 'full' };
  return { ok: true };
}

/** Every make-up slot a credit could use (before seats are counted): home gym, same week or the next, not past the package. */
export function makeupWindow(source: GroupSeat, pass: GroupPass, group: GroupClass, now: Date, cfg: GroupConfig): MakeupSlot[] {
  const from = mondayOf(source.date);
  const nextSunday = addDays(sundayOf(source.date), 7);
  const to = nextSunday < pass.windowEnd ? nextSunday : pass.windowEnd;
  if (to < from) return [];
  return makeupSlots(group.gymId, from, to, cfg.makeupDays, cfg.makeupHours).filter((s) => s.startsAt.getTime() > now.getTime());
}

// ── the coach's forms ─────────────────────────────────────────────────────────────────────────────────────────────────

export type GroupInputError = 'bad_name' | 'bad_gym' | 'bad_days' | 'bad_time' | 'bad_start' | 'bad_trainer';
export interface CleanGroup { name: string; gymId: string; dayPair: DayPair; hour: number; startDate: string; trainerUserId: string }

export function cleanGroup(body: unknown, cfg: GroupConfig, now: Date, fallbackTrainer: string): { ok: true; g: CleanGroup } | { ok: false; error: GroupInputError } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const name = typeof b.name === 'string' ? b.name.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 60) return { ok: false, error: 'bad_name' };
  if (typeof b.gymId !== 'string' || !gymById(b.gymId)) return { ok: false, error: 'bad_gym' };
  if (!isDayPair(b.dayPair)) return { ok: false, error: 'bad_days' };
  const hour = Number(b.hour);
  if (!Number.isInteger(hour) || !cfg.hours.includes(hour)) return { ok: false, error: 'bad_time' };
  if (!parseDayKey(b.startDate)) return { ok: false, error: 'bad_start' };
  const startDate = mondayOf(b.startDate as string);
  // not more than a week in the past (a group already running can still be entered), not more than a year ahead
  const today = now.toISOString().slice(0, 10);
  if (startDate < addDays(today, -7) || startDate > addDays(today, 366)) return { ok: false, error: 'bad_start' };
  const trainerUserId = typeof b.trainerUserId === 'string' && b.trainerUserId ? b.trainerUserId : fallbackTrainer;
  if (!trainerUserId) return { ok: false, error: 'bad_trainer' };
  return { ok: true, g: { name, gymId: b.gymId, dayPair: b.dayPair, hour, startDate, trainerUserId } };
}

/** Move a group to another of the three gyms (owner: "the coach can move a group to another gym"). */
export function moveGymCheck(g: GroupClass, gymId: unknown): { ok: true; gymId: string } | { ok: false; error: 'bad_gym' | 'same_gym' | 'not_open' } {
  if (typeof gymId !== 'string' || !gymById(gymId)) return { ok: false, error: 'bad_gym' };
  if (gymId === g.gymId) return { ok: false, error: 'same_gym' };
  if (g.status !== 'open') return { ok: false, error: 'not_open' };
  return { ok: true, gymId };
}

// ── paying ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type PayProduct = JoinKind;

/**
 * Pay at the gym, unless EVERY switch is on: the owner's GROUP_BOOKING_ONLINE_PAYMENT, the coach-business money gate
 * (gateOk: connectGate().ok) and a package id for this product. Then the existing checkout charges at booking.
 */
export function payPlan(cfg: GroupConfig, gateOk: boolean, product: PayProduct): { mode: 'at_gym' } | { mode: 'online'; packageId: string } {
  const packageId = cfg.packageIds[product];
  if (cfg.onlinePaymentSwitch && gateOk && packageId) return { mode: 'online', packageId };
  return { mode: 'at_gym' };
}

// ── 1:1 ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type SessionMode = 'online' | 'in_person';

export interface OneOnOneChoice { mode: SessionMode; available: boolean; priceCents: number | null; minutes: number; needsGym: boolean }

/**
 * In person: the owner's price and length (config). Online: the coach store's own live 1:1 listing — its price is what the
 * existing checkout charges, so that is what shows; with no listing, online is "Opens soon" (never an invented price).
 */
export function oneOnOneChoices(cfg: GroupConfig, listing: { priceCents: number; durationMin: number } | null): OneOnOneChoice[] {
  return [
    { mode: 'in_person', available: true, priceCents: cfg.inPersonCents, minutes: cfg.inPersonMinutes, needsGym: true },
    { mode: 'online', available: !!listing, priceCents: listing ? listing.priceCents : null, minutes: listing ? listing.durationMin : cfg.onlineMinutes, needsGym: false },
  ];
}

/** Weekdays a group meets, for a busy check (the trainer's group hours are not open for 1:1). */
export function groupBusy(g: GroupClass, cfg: GroupConfig): { startsAt: Date; endsAt: Date }[] {
  if (g.status !== 'open') return [];
  return groupSessions(g).map((s) => ({ startsAt: s.startsAt, endsAt: new Date(s.startsAt.getTime() + cfg.sessionMinutes * 60_000) }));
}

export const dayPairDays = (p: DayPair) => DAY_PAIRS[p];
