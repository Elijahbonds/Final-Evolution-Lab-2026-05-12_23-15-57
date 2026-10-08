export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { assertLiveScheduleOn } from '@/lib/live/gate';
import { buildLiveSchedulePayload } from '@/lib/live/payload';

/**
 * LIVE-PAGE-FLAGOFF: read-only weekly live-stream schedule (Twitch + FEL) as JSON.
 * Flag off (default, LIVE_STREAM_SCHEDULE_ENABLED unset): JSON 404 { error: 'not_found' } via assertLiveScheduleOn(),
 * same pattern as the coach-store routes (#165). Flag on: 200 with the PT wall-clock slots and their next occurrences,
 * from the same lib/live helpers as the /live/schedule page. No database, no session, no vendor.
 */
export async function GET() {
  const blocked = assertLiveScheduleOn();
  if (blocked) return blocked;
  return NextResponse.json(buildLiveSchedulePayload(new Date()));
}
