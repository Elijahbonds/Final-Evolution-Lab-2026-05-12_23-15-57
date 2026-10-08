import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLiveStreamScheduleEnabled } from '@/lib/flags';
import { LIVE_STREAM_SLOTS } from '@/lib/live/schedule';
import { nextLiveSlots } from '@/lib/live/nextSlots';
import { formatSlotPT } from '@/lib/live/format';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Live stream schedule · Final Evolution',
  description: "Elijah's weekly live stream schedule on Twitch and FEL.",
};

/** LIVE-PAGE-FLAGOFF: gated by isLiveStreamScheduleEnabled; 404s while off. */
export default function LiveStreamSchedulePage() {
  if (!isLiveStreamScheduleEnabled()) notFound();

  const upcoming = nextLiveSlots(new Date(), 4);
  const upcomingDateFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric',
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 text-white">
      <p className="text-xs uppercase tracking-widest text-white/50">Final Evolution</p>
      <h1 className="mt-1 text-2xl font-semibold">Live stream schedule</h1>
      <p className="mt-2 text-white/70">On Twitch and FEL.</p>

      <ul className="mt-4 space-y-2 text-white/80">
        {LIVE_STREAM_SLOTS.map((slot) => (
          <li key={slot.dow}>{formatSlotPT(slot)}</li>
        ))}
      </ul>

      <h2 className="mt-8 text-lg font-medium">Upcoming</h2>
      <ul className="mt-2 space-y-1 text-sm text-white/70">
        {upcoming.map((slot) => {
          const def = LIVE_STREAM_SLOTS.find((s) => s.dow === slot.dow);
          return (
            <li key={slot.startUtc.toISOString()}>
              {upcomingDateFmt.format(slot.startUtc)}
              {def ? ` · ${formatSlotPT(def)}` : ''}
              {slot.liveNow ? ' — live now' : ''}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
