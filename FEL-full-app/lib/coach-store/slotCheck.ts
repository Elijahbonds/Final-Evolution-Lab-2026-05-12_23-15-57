/**
 * lib/coach-store/slotCheck.ts — STORE-READY B6 (F2) / B7 (F3): the ONE live_1on1 slot check.
 *
 * Both bookTime's hold and moveBooking's reschedule ask the same question: is `startsAt` for `durationMin`
 * open for this instructor right now? The answer is openSlots over the instructor's windows/blackouts and the
 * busy list — every booking of that instructor whose slotLock is set and whose status is HELD or PAID — with
 * the caller's own booking (excludeBookingId) taken back out so rescheduling onto itself is not a collision.
 *
 * The exact match is on startsAt + durationMin (the same shape bookTime always used), so a 60-minute booking
 * at 10:00 blocks a 30-minute at 10:30 through the busy-overlap, never through a null slotLock (the F2 bug).
 */

import { prisma } from '@/lib/db';
import { openSlots, type WeeklyWindow } from './slots';

function windowsOf(value: unknown): WeeklyWindow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const r = row as { dow?: unknown; startMin?: unknown; endMin?: unknown };
    if (typeof r.dow !== 'number' || typeof r.startMin !== 'number' || typeof r.endMin !== 'number') return [];
    return [{ dow: r.dow, startMin: r.startMin, endMin: r.endMin }];
  });
}

function blackoutsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export async function slotStillFree(input: {
  instructor: {
    id: string;
    weeklyHours: unknown;
    blackoutDates: unknown;
    bufferMinutes: number;
    minNoticeHours: number;
    maxDaysAhead: number;
  };
  startsAt: Date;
  durationMin: number;
  /** The booking being moved/fulfilled — its own current slot is not "taken" by itself. */
  excludeBookingId?: string;
  now: Date;
}): Promise<boolean> {
  const busy = await prisma.booking.findMany({
    where: {
      instructorId: input.instructor.id,
      slotLock: { not: null },
      status: { in: ['HELD', 'PAID'] },
      ...(input.excludeBookingId ? { id: { not: input.excludeBookingId } } : {}),
    },
    select: { startsAt: true, endsAt: true },
  });
  const open = openSlots({
    now: input.now,
    weekly: windowsOf(input.instructor.weeklyHours),
    blackouts: blackoutsOf(input.instructor.blackoutDates),
    busy: busy.flatMap((b) => (b.startsAt && b.endsAt ? [{ startsAt: b.startsAt, endsAt: b.endsAt }] : [])),
    bufferMinutes: input.instructor.bufferMinutes,
    minNoticeHours: input.instructor.minNoticeHours,
    maxDaysAhead: input.instructor.maxDaysAhead,
    durations: [input.durationMin as 30 | 60],
  });
  return open.some((s) => s.startsAt.getTime() === input.startsAt.getTime() && s.durationMin === input.durationMin);
}
