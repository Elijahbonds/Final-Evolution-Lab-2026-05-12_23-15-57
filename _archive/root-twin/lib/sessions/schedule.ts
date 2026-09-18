/**
 * lib/sessions/schedule.ts
 * ========================
 * PURE scheduling core for M21 group sessions + booking.
 *  - Group workouts: Elijah Bonds, every Wed + Fri 17:30 America/Los_Angeles,
 *    60 min, capacity 100, 150 shards (or included with class_monthly).
 *  - Seminars: ad-hoc, seat-based (default 250 shards, cap 25).
 *  - Private 1-on-1: ONLY offered when no seminar in next 14 days; 45 min,
 *    900 shards, availability Mon/Thu 16:00-19:00 PT. Minors cannot book.
 * All prices in SHARDS (server-owned). Timezone-correct via Intl (pure, no DOM).
 */

export const SESSION_PRICING = {
  group_workout: 150,
  seminar_seat: 250,
  private_1on1: 900,
} as const;

export const GROUP_CONFIG = {
  host: 'Elijah Bonds',
  weekdays: [3, 5], // 3=Wed, 5=Fri (PT wall-clock weekday)
  hour: 17, minute: 30, durationMin: 60, capacity: 100,
  timeZone: 'America/Los_Angeles',
} as const;

export interface SessionSlot {
  sessionKey: string;   // stable id e.g. gw_2026-07-22
  kind: 'group_workout';
  host: string;
  startsAtIso: string;  // UTC ISO of the PT 17:30 slot
  label: string;        // human label in PT
  shards: number;
  capacity: number;
}

/** Returns the PT wall-clock parts for a given instant. */
function ptParts(d: Date): { y: number; m: number; day: number; weekday: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: GROUP_CONFIG.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0;
  return {
    y: parseInt(get('year'), 10), m: parseInt(get('month'), 10), day: parseInt(get('day'), 10),
    weekday: wdMap[get('weekday')] ?? 0, hour, minute: parseInt(get('minute'), 10),
  };
}

/** Find the UTC instant whose PT wall-clock is the given y/m/d hh:mm. */
function ptWallClockToUtc(y: number, m: number, day: number, hour: number, minute: number): Date {
  // Guess UTC then correct by the offset PT reports at that instant (handles DST).
  let guess = new Date(Date.UTC(y, m - 1, day, hour, minute));
  for (let i = 0; i < 3; i++) {
    const p = ptParts(guess);
    const diffMin = (p.hour * 60 + p.minute) - (hour * 60 + minute)
      + ((p.day - day) * 24 * 60);
    guess = new Date(guess.getTime() - diffMin * 60000);
  }
  return guess;
}

function pad(n: number): string { return n < 10 ? `0${n}` : `${n}`; }

/** Upcoming group-workout slots (Wed/Fri 17:30 PT) from `now`. */
export function upcomingGroupSlots(now: Date, count = 6): SessionSlot[] {
  const out: SessionSlot[] = [];
  const start = ptParts(now);
  // Walk forward day by day in PT.
  let cursor = new Date(now.getTime());
  let scanned = 0;
  while (out.length < count && scanned < 30) {
    const p = ptParts(cursor);
    if ((GROUP_CONFIG.weekdays as readonly number[]).includes(p.weekday)) {
      const startsAt = ptWallClockToUtc(p.y, p.m, p.day, GROUP_CONFIG.hour, GROUP_CONFIG.minute);
      if (startsAt.getTime() > now.getTime() - 60 * 60000) {
        const key = `gw_${p.y}-${pad(p.m)}-${pad(p.day)}`;
        const label = new Intl.DateTimeFormat('en-US', {
          timeZone: GROUP_CONFIG.timeZone, weekday: 'long', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit',
        }).format(startsAt) + ' PT';
        out.push({ sessionKey: key, kind: 'group_workout', host: GROUP_CONFIG.host, startsAtIso: startsAt.toISOString(), label, shards: SESSION_PRICING.group_workout, capacity: GROUP_CONFIG.capacity });
      }
    }
    // advance ~1 day
    cursor = new Date(cursor.getTime() + 24 * 60 * 60000);
    scanned++;
  }
  void start;
  return out;
}

export interface Seminar { sessionKey: string; title: string; startsAtIso: string; seats: number; shards: number }

/** Private 1-on-1 is only offered when no seminar is scheduled in next 14 days. */
export function privateBookingAvailable(now: Date, seminars: Seminar[]): boolean {
  const horizon = now.getTime() + 14 * 24 * 60 * 60000;
  return !seminars.some((s) => {
    const t = new Date(s.startsAtIso).getTime();
    return t > now.getTime() && t <= horizon;
  });
}

/** Private availability windows: Mon(1)/Thu(4) 16:00-19:00 PT, 45-min slots. */
export function privateSlots(now: Date, count = 4): { sessionKey: string; startsAtIso: string; label: string; shards: number }[] {
  const out: { sessionKey: string; startsAtIso: string; label: string; shards: number }[] = [];
  let cursor = new Date(now.getTime());
  let scanned = 0;
  while (out.length < count && scanned < 30) {
    const p = ptParts(cursor);
    if (p.weekday === 1 || p.weekday === 4) {
      for (const hh of [16, 17, 18]) {
        const startsAt = ptWallClockToUtc(p.y, p.m, p.day, hh, 0);
        if (startsAt.getTime() > now.getTime() && out.length < count) {
          const key = `pv_${p.y}-${pad(p.m)}-${pad(p.day)}_${hh}`;
          const label = new Intl.DateTimeFormat('en-US', { timeZone: GROUP_CONFIG.timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(startsAt) + ' PT';
          out.push({ sessionKey: key, startsAtIso: startsAt.toISOString(), label, shards: SESSION_PRICING.private_1on1 });
        }
      }
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60000);
    scanned++;
  }
  return out;
}
