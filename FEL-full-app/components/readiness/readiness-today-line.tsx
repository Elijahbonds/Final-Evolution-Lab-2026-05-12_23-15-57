'use client';

// ReadinessTodayLine — on Today (app/coach/_components/today-view.tsx, one mount line): today's jump check when it read
// Low under the coach's rule — why, what eased, whether the coach was told — or, with no check yet today, the door to it
// for an adult (the context route answers { ok: false } to anyone the check refuses, and then nothing shows).
// COACH-READINESS, 2026-10-25.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity } from 'lucide-react';
import { localDayKey } from '@/lib/health/readiness';
import type { TodayReadinessNote } from '@/lib/coach/readiness/today';
import { BAND_STYLE } from './band';

export const READINESS_PAGE = '/train/readiness';

export function ReadinessTodayLine({ note, api }: { note: TodayReadinessNote | undefined; api: string | null | undefined }) {
  const [door, setDoor] = useState<'show' | 'done' | null>(null);
  useEffect(() => {
    if (note || !api) return;
    fetch(`${api}?day=${localDayKey(new Date())}`).then((r) => r.json()).then((j: { ok?: boolean; today?: unknown }) => setDoor(j?.ok ? (j.today ? 'done' : 'show') : null)).catch(() => setDoor(null));
  }, [api, note]);

  if (note) {
    return (
      <div className="fel-card space-y-2 rounded-xl border border-[#FFB020]/30 p-4" data-readiness-today-note data-band={note.band}>
        <div className="flex items-center gap-2">
          <span className={`rounded-lg border px-2.5 py-1 text-sm font-bold ${BAND_STYLE[note.band]}`}>Readiness: {note.label}</span>
        </div>
        <p className="text-sm text-white/85">{note.line}</p>
        {note.next && <p className="text-sm text-white/70">{note.next}</p>}
        {note.eased.length > 0 && (
          <ul className="space-y-0.5 text-xs text-white/60" data-readiness-eased>
            {note.eased.map((e) => <li key={e.id}><span className="text-white/80">{e.name}:</span> {e.what}</li>)}
          </ul>
        )}
      </div>
    );
  }
  if (door !== 'show') return null;
  return (
    <Link href={READINESS_PAGE} className="fel-card flex items-center gap-3 rounded-xl p-3 text-sm text-white/80" data-readiness-door>
      <Activity className="h-4 w-4 shrink-0 text-[#00E5FF]" />
      <span>Take today&apos;s 30-second jump check before you train.</span>
    </Link>
  );
}
