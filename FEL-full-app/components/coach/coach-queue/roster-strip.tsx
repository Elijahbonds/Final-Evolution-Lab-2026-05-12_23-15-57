'use client';
// components/coach/coach-queue/roster-strip.tsx — PLATFORM PHASE 5: the roster's week under the queue. One avatar per
// athlete with seven dots (a coached session done that day, oldest first) and the way into their sheet. It scrolls
// sideways inside itself; the page never does.
import type { RosterStripRow } from '@/lib/coach/queueServer';
import { LOOK, initials } from './look';

export function RosterStrip({ roster, onOpen }: { roster: RosterStripRow[]; onOpen: (athleteId: string) => void }) {
  if (!roster.length) return null;
  return (
    <section className={LOOK.section} data-coach-block="roster" aria-label="Your athletes this week">
      <h2 className={LOOK.sectionHead}><span>This week</span></h2>
      <div className={LOOK.strip} data-roster-strip>
        {roster.map((r) => (
          <button key={r.id} type="button" className={LOOK.avatarBtn} onClick={() => onOpen(r.id)} data-roster-row={r.id}
            aria-label={`${r.name}: ${r.days.filter(Boolean).length} sessions this week`}>
            <span className={LOOK.avatar} aria-hidden>{initials(r.name)}</span>
            <span className={`${LOOK.quiet} w-full truncate text-center`} aria-hidden>{r.name.split(/\s+/)[0]}</span>
            <span className={LOOK.dots} aria-hidden>
              {(r.days.length ? r.days : Array(7).fill(0)).map((d, i) => <span key={i} className={`${LOOK.dot} ${d ? 'bg-fel-emerald' : 'bg-white/15'}`} />)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
