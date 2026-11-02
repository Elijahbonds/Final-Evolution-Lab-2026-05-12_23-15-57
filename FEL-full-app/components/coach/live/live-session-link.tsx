'use client';

// The way into a live session (COACH-LIVE, 2026-10-25), from a program's thread: the coach's Clients view and the
// client's Today view mount one each. Draws nothing while the switch is off (lib/coach/live/flag.ts).
import Link from 'next/link';
import { coachLiveEnabled } from '@/lib/coach/live/flag';

export function LiveSessionLink({ programId, role }: { programId: string; role: 'coach' | 'client' }) {
  if (!coachLiveEnabled() || !programId) return null;
  return (
    <Link href={`/coach/live/p_${programId}`} data-live-link={role}
      className="ml-auto rounded-md border border-cyan-300/40 px-2 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-cyan-200">
      {role === 'coach' ? 'Go live' : 'Live session'}
    </Link>
  );
}
