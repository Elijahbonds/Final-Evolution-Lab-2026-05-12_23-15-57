/**
 * lib/live/payload.ts
 * ===================
 * JSON shape for GET /api/live/schedule. Built from the same lib/live helpers the /live/schedule page
 * uses (LIVE_STREAM_SLOTS, nextLiveSlots, formatSlotPT), so the page and the API can never disagree.
 * Pure: takes `now` so it is deterministic and testable.
 */
import { formatSlotPT } from './format';
import { nextLiveSlots } from './nextSlots';
import { LIVE_STREAM_SLOTS, LIVE_STREAM_TZ, type LiveStreamPlatform } from './schedule';

export interface LiveSchedulePayload {
  timeZone: string;
  slots: { dow: number; start: string; end: string; platforms: readonly LiveStreamPlatform[]; label: string }[];
  upcoming: { dow: number; startUtc: string; endUtc: string; liveNow: boolean; platforms: readonly LiveStreamPlatform[] }[];
}

export function buildLiveSchedulePayload(now: Date, count = 4): LiveSchedulePayload {
  return {
    timeZone: LIVE_STREAM_TZ,
    slots: LIVE_STREAM_SLOTS.map((s) => ({ dow: s.dow, start: s.start, end: s.end, platforms: s.platforms, label: formatSlotPT(s) })),
    upcoming: nextLiveSlots(now, count).map((o) => ({
      dow: o.dow,
      startUtc: o.startUtc.toISOString(),
      endUtc: o.endUtc.toISOString(),
      liveNow: o.liveNow,
      platforms: o.platforms,
    })),
  };
}
