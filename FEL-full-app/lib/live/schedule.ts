/**
 * lib/live/schedule.ts
 * ====================
 * Elijah's weekly live-stream schedule (Twitch + FEL). Stored as Pacific
 * WALL-CLOCK times, never as a fixed UTC offset: America/Los_Angeles swaps
 * between PDT (UTC-7) and PST (UTC-8) across the year, so "13:00 Wednesday"
 * is the stable fact and the UTC instant it lands on must be derived fresh
 * for each occurrence (see lib/live/nextSlots.ts). Hardcoding a UTC offset
 * here would make the schedule silently wrong for half the year.
 */

export const LIVE_STREAM_TZ = 'America/Los_Angeles';

export type LiveStreamPlatform = 'twitch' | 'fel';

export interface LiveStreamSlot {
  /** 0 = Sunday ... 6 = Saturday, in Pacific time. */
  dow: number;
  /** Wall-clock start time in Pacific, "HH:MM" 24-hour. */
  start: string;
  /** Wall-clock end time in Pacific, "HH:MM" 24-hour. */
  end: string;
  platforms: readonly LiveStreamPlatform[];
}

export const LIVE_STREAM_SLOTS: readonly LiveStreamSlot[] = [
  { dow: 3, start: '13:00', end: '15:30', platforms: ['twitch', 'fel'] },
  { dow: 6, start: '12:30', end: '15:00', platforms: ['twitch', 'fel'] },
] as const;
