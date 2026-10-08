'use client';
// COACH-AI Phase 8 (2026-10-07): the athlete's own availability, as their coach set it — one line at the top of Today
// when it is Limited or Out, nothing when Full or when the feature is not on yet (lib/coach/availability.ts).
import { useEffect, useState } from 'react';
import { availabilityLine, type AvailabilityView } from '@/lib/coach/availability';

export function MyAvailabilityLine({ endpoint }: { endpoint: string }) {
  const [view, setView] = useState<AvailabilityView | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${endpoint}?as=athlete`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (live && j?.available && (j.status === 'limited' || j.status === 'out')) setView({ status: j.status, returnBy: j.returnBy ?? null }); })
      .catch(() => {});
    return () => { live = false; };
  }, [endpoint]);
  return <AvailabilityLineView view={view} />;
}

/** The line itself (rendered by MyAvailabilityLine; separate so a test can render it without a fetch). */
export function AvailabilityLineView({ view }: { view: AvailabilityView | null }) {
  if (!view || view.status === 'full') return null;
  return (
    <div data-my-availability={view.status} className={`rounded-xl border px-4 py-2.5 text-sm ${view.status === 'out' ? 'border-[#FF2D95]/40 bg-[#FF2D95]/10 text-white' : 'border-[#FFD700]/40 bg-[#FFD700]/10 text-white'}`}>
      {availabilityLine(view, 'athlete')}
    </div>
  );
}
