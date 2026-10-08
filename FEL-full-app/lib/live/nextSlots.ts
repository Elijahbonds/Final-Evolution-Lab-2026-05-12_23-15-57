/**
 * lib/live/nextSlots.ts
 * ======================
 * Pure, DST-safe conversion of the Pacific wall-clock slots in
 * lib/live/schedule.ts into concrete upcoming UTC instants. No I/O: takes
 * `now` as an argument so it is deterministic and testable.
 *
 * The PT -> UTC conversion follows the same technique already proven in
 * lib/sessions/schedule.ts (ptParts / ptWallClockToUtc): guess a UTC instant,
 * read back what wall-clock time that guess reports in America/Los_Angeles
 * via Intl.DateTimeFormat, and correct for the difference. Intl knows the
 * real DST transition dates, so this needs no offset table and no new
 * package.
 */

import { LIVE_STREAM_SLOTS, LIVE_STREAM_TZ, type LiveStreamPlatform, type LiveStreamSlot } from './schedule';

interface PtParts { y: number; m: number; day: number; weekday: number; hour: number; minute: number }

/** Returns the Pacific wall-clock parts for a given instant. */
function ptParts(d: Date): PtParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: LIVE_STREAM_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
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

/** Find the UTC instant whose Pacific wall-clock is the given y/m/d hh:mm. */
function ptWallClockToUtc(y: number, m: number, day: number, hour: number, minute: number): Date {
  // Guess UTC then correct by the offset PT reports at that instant (handles DST).
  let guess = new Date(Date.UTC(y, m - 1, day, hour, minute));
  for (let i = 0; i < 3; i++) {
    const p = ptParts(guess);
    const diffMin = (p.hour * 60 + p.minute) - (hour * 60 + minute) + ((p.day - day) * 24 * 60);
    guess = new Date(guess.getTime() - diffMin * 60000);
  }
  return guess;
}

export interface NextLiveSlot {
  /** 0 = Sunday ... 6 = Saturday, in Pacific time. */
  dow: number;
  startUtc: Date;
  endUtc: Date;
  liveNow: boolean;
  platforms: readonly LiveStreamPlatform[];
}

function parseHhMm(hhmm: string): [number, number] {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  return [h, m];
}

/**
 * Next `count` live-stream occurrences from `now`, ascending by start time.
 * A slot whose end is still after `now` is included (so a slot `now` is
 * currently inside comes first, with `liveNow: true`).
 */
export function nextLiveSlots(now: Date, count = 4): NextLiveSlot[] {
  const out: NextLiveSlot[] = [];
  let cursor = new Date(now.getTime());
  let scanned = 0;
  while (out.length < count && scanned < 60) {
    const p = ptParts(cursor);
    for (const slot of LIVE_STREAM_SLOTS as readonly LiveStreamSlot[]) {
      if (slot.dow !== p.weekday) continue;
      const [sh, sm] = parseHhMm(slot.start);
      const [eh, em] = parseHhMm(slot.end);
      const startUtc = ptWallClockToUtc(p.y, p.m, p.day, sh, sm);
      const endUtc = ptWallClockToUtc(p.y, p.m, p.day, eh, em);
      if (endUtc.getTime() > now.getTime()) {
        out.push({
          dow: slot.dow,
          startUtc,
          endUtc,
          liveNow: now.getTime() >= startUtc.getTime() && now.getTime() < endUtc.getTime(),
          platforms: slot.platforms,
        });
      }
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60000);
    scanned++;
  }
  out.sort((a, b) => a.startUtc.getTime() - b.startUtc.getTime());
  return out.slice(0, count);
}
