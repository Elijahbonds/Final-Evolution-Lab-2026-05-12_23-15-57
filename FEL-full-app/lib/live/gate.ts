import { NextResponse } from 'next/server';
import { isLiveStreamScheduleEnabled } from '@/lib/flags';

/**
 * LIVE-PAGE-FLAGOFF: API gate for /api/live/schedule, following the #165 assertCoachStoreOn pattern.
 * Flag off (default) is a JSON 404 { error: 'not_found' }, so a live check can tell "flag off" apart from
 * "route never shipped" (which would be Next's HTML 404). Named assert*() so the route-contract guard sees it.
 */
export function assertLiveScheduleOn(): NextResponse | null {
  if (!isLiveStreamScheduleEnabled()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return null;
}
