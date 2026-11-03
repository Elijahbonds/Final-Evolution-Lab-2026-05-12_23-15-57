// lib/group-booking/config.ts — GROUP-BOOKING (owner, 2026-11-02): every number and switch the owner set for group
// classes and 1:1 sessions, in one place, each one env value away (the lib/coach-business/config.ts pattern). Nothing
// here is a literal anywhere else: the rules, the pages and the routes all read groupConfig().
//
// THE OWNER'S NUMBERS (2026-11-02, binding):
//   · a group runs 8 weeks, 2 sessions a week (Mon/Wed or Tue/Thu) at 5, 6 or 7 pm Los Angeles time, 6–8 people;
//   · a drop-in session is $65; a 4-week package is $400 for 8 sessions; the full 8 weeks is two packages;
//   · make-ups: Friday and Saturday at 5, 6 and 7 pm at the group's home gym, open seats only (under 8);
//   · the coach is told when a group has fewer than 6 people 48 h before its first session (nothing auto-cancels);
//   · cancel 24 h+ ahead: free; later, or a no-show: the session counts as used;
//   · 1:1: $100 in person (60 min, at one of the gyms), $75 online (video; the coach-store listing's own length);
//   · gyms: 24 Hour Fitness Victory, 24 Hour Fitness Topanga, LA Fitness Balboa — names only; the address is a field the
//     owner fills in on the coach view (GroupGym), blank until then.
//
// THE SWITCHES (all OFF / unset by default):
//   · GROUP_BOOKING_ONLINE_PAYMENT — charge at booking through the EXISTING coach-business checkout
//     (/api/coach/business/checkout). Takes effect only when ALSO the coach-business money gate is open (connectGate:
//     COACH_CONNECT_PAYMENTS_ENABLED + a key that passes the live fence) AND the package id for that product is set
//     (GROUP_DROP_IN_PACKAGE_ID / GROUP_PACKAGE_PACKAGE_ID / GROUP_FULL_PACKAGE_ID, the coach's own coach-business
//     packages at the same prices). Otherwise: "Reserve, pay at the gym". An in-person 1:1 is always paid at the gym in
//     this version (charging it online is a follow-up).
//   · GROUP_TRAINERS_BOOKABLE — invited trainers show on the 1:1 booker. Off: only the owner (Elijah) is bookable
//     (owner, 2026-11-02: "launch with only Elijah bookable").
//   · GROUP_BOOKING_OWNER_ID — the business owner's user id. Unset: the first id of COACH_STORE_COACH_USER_IDS
//     (assumption: the coach store's allowlisted coach is the owner). Neither set: everything stays "Opens soon".
//
// Pure. Client-safe (a page passes the values it needs down).

export interface Gym { id: string; name: string }

/** The three gyms (owner, 2026-11-02). Names only; addresses live in GroupGym and are the owner's to fill in. */
export const GYMS: readonly Gym[] = [
  { id: '24hr-victory', name: '24 Hour Fitness Victory' },
  { id: '24hr-topanga', name: '24 Hour Fitness Topanga' },
  { id: 'la-fitness-balboa', name: 'LA Fitness Balboa' },
] as const;

export type DayPair = 'mon_wed' | 'tue_thu';
/** Weekdays (0 = Sunday … 6 = Saturday, Pacific wall clock) for each pair. */
export const DAY_PAIRS: Record<DayPair, readonly [number, number]> = { mon_wed: [1, 3], tue_thu: [2, 4] };
export const DAY_PAIR_LABEL: Record<DayPair, string> = { mon_wed: 'Mon & Wed', tue_thu: 'Tue & Thu' };

export const TIME_ZONE = 'America/Los_Angeles';

/** What a session is, said plainly on every card and sheet (owner, 2026-11-02). */
export const SESSION_FORMAT = '30 min strength & conditioning + 30 min correctives & athletic skill';

export interface GroupConfig {
  minSeats: number;
  maxSeats: number;
  weeks: number;
  packageWeeks: number;
  packageSessions: number;
  dropInCents: number;
  packageCents: number;
  sessionMinutes: number;
  hours: readonly number[];
  makeupDays: readonly number[];
  makeupHours: readonly number[];
  cutoffHours: number;
  cancelFreeHours: number;
  inPersonCents: number;
  inPersonMinutes: number;
  onlineCents: number;
  onlineMinutes: number;
  onlinePaymentSwitch: boolean;
  trainersBookable: boolean;
  ownerId: string | null;
  packageIds: { drop_in: string | null; package: string | null; full: string | null };
}

const DEFAULTS = {
  minSeats: 6, maxSeats: 8, weeks: 8, packageWeeks: 4, packageSessions: 8, dropInCents: 6500, packageCents: 40000,
  sessionMinutes: 60, hours: [17, 18, 19], makeupDays: [5, 6], makeupHours: [17, 18, 19], cutoffHours: 48, cancelFreeHours: 24,
  inPersonCents: 10000, inPersonMinutes: 60, onlineCents: 7500, onlineMinutes: 60,
} as const;

function envOn(env: NodeJS.ProcessEnv, name: string): boolean {
  const v = (env[name] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

function envInt(env: NodeJS.ProcessEnv, name: string, def: number, min: number, max: number): number {
  const raw = (env[name] ?? '').trim();
  if (!/^\d+$/.test(raw)) return def;
  const n = Number(raw);
  return n >= min && n <= max ? n : def;
}

function envList(env: NodeJS.ProcessEnv, name: string, def: readonly number[], min: number, max: number): readonly number[] {
  const raw = (env[name] ?? '').trim();
  if (!raw) return def;
  const out = raw.split(',').map((s) => s.trim());
  if (!out.every((s) => /^\d+$/.test(s))) return def;
  const n = [...new Set(out.map(Number))].filter((x) => x >= min && x <= max).sort((a, b) => a - b);
  return n.length ? n : def;
}

const envStr = (env: NodeJS.ProcessEnv, name: string): string | null => {
  const v = (env[name] ?? '').trim();
  return v ? v : null;
};

export function groupConfig(env: NodeJS.ProcessEnv = process.env): GroupConfig {
  const maxSeats = envInt(env, 'GROUP_MAX_SEATS', DEFAULTS.maxSeats, 1, 50);
  const minSeats = Math.min(envInt(env, 'GROUP_MIN_SEATS', DEFAULTS.minSeats, 1, 50), maxSeats);
  const weeks = envInt(env, 'GROUP_WEEKS', DEFAULTS.weeks, 1, 26);
  const packageWeeks = Math.min(envInt(env, 'GROUP_PACKAGE_WEEKS', DEFAULTS.packageWeeks, 1, 26), weeks);
  return {
    minSeats, maxSeats, weeks, packageWeeks,
    packageSessions: envInt(env, 'GROUP_PACKAGE_SESSIONS', DEFAULTS.packageSessions, 1, 52),
    dropInCents: envInt(env, 'GROUP_DROP_IN_CENTS', DEFAULTS.dropInCents, 0, 1_000_000),
    packageCents: envInt(env, 'GROUP_PACKAGE_CENTS', DEFAULTS.packageCents, 0, 10_000_000),
    sessionMinutes: envInt(env, 'GROUP_SESSION_MINUTES', DEFAULTS.sessionMinutes, 15, 240),
    hours: envList(env, 'GROUP_HOURS', DEFAULTS.hours, 5, 22),
    makeupDays: envList(env, 'GROUP_MAKEUP_DAYS', DEFAULTS.makeupDays, 0, 6),
    makeupHours: envList(env, 'GROUP_MAKEUP_HOURS', DEFAULTS.makeupHours, 5, 22),
    cutoffHours: envInt(env, 'GROUP_CUTOFF_HOURS', DEFAULTS.cutoffHours, 0, 24 * 21),
    cancelFreeHours: envInt(env, 'GROUP_CANCEL_FREE_HOURS', DEFAULTS.cancelFreeHours, 0, 24 * 14),
    inPersonCents: envInt(env, 'IN_PERSON_1ON1_CENTS', DEFAULTS.inPersonCents, 0, 1_000_000),
    inPersonMinutes: envInt(env, 'IN_PERSON_1ON1_MINUTES', DEFAULTS.inPersonMinutes, 15, 240),
    onlineCents: envInt(env, 'ONLINE_1ON1_CENTS', DEFAULTS.onlineCents, 0, 1_000_000),
    onlineMinutes: envInt(env, 'ONLINE_1ON1_MINUTES', DEFAULTS.onlineMinutes, 15, 240),
    onlinePaymentSwitch: envOn(env, 'GROUP_BOOKING_ONLINE_PAYMENT'),
    trainersBookable: envOn(env, 'GROUP_TRAINERS_BOOKABLE'),
    ownerId: envStr(env, 'GROUP_BOOKING_OWNER_ID') ?? ((env.COACH_STORE_COACH_USER_IDS ?? '').split(',').map((s) => s.trim()).find(Boolean) ?? null),
    packageIds: {
      drop_in: envStr(env, 'GROUP_DROP_IN_PACKAGE_ID'),
      package: envStr(env, 'GROUP_PACKAGE_PACKAGE_ID'),
      full: envStr(env, 'GROUP_FULL_PACKAGE_ID'),
    },
  };
}

export const gymById = (id: string | null | undefined): Gym | null => GYMS.find((g) => g.id === id) ?? null;
export const isDayPair = (v: unknown): v is DayPair => v === 'mon_wed' || v === 'tue_thu';

/** "5 pm", "12 pm". */
export function hourLabel(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${hour < 12 ? 'am' : 'pm'}`;
}

/** "$65", "$400", "$65.50". */
export function dollars(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}
