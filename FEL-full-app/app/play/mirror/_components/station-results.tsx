'use client';

// The Movement Screen's per-station result card (MIRROR-COACH P3, 2026-09-26). The words are lib/mirror/stationCard.ts
// (pure, tested); this only lays them out. Every camera number is labelled estimated there, a flag is "flagged for a
// closer look" (never a verdict), and a check the camera could not read says so — it is never shown as a pass.
import type { ScreenId } from '@/lib/mirror/screen';
import type { StationRecord } from '@/lib/mirror/screenRunner';
import { stationCards } from '@/lib/mirror/stationCard';
import type { GradeStatus } from '@/lib/mirror/stationGraders';

const TONE: Record<GradeStatus, { dot: string; text: string; border: string }> = {
  pass: { dot: '#00FF9D', text: 'text-[#00FF9D]', border: 'rgba(255,255,255,0.08)' },
  flag: { dot: '#FFC24B', text: 'text-[#FFC24B]', border: 'rgba(255,194,75,0.30)' },
  unreadable: { dot: 'rgba(255,255,255,0.3)', text: 'text-white/55', border: 'rgba(255,255,255,0.08)' },
};

export function StationResults({ screen, stations }: { screen: ScreenId; stations: readonly StationRecord[] }) {
  const cards = stationCards(screen, stations);
  if (!cards.length) return null;
  return (
    <section className="mt-6 rounded-2xl border border-white/8 bg-white/[0.02] p-5" aria-label="Station results">
      <h2 className="fel-heading text-[15px] font-bold text-white/80">Station by station · estimated</h2>
      <ul className="mt-3 space-y-3">
        {cards.map((c) => (
          <li key={c.stationIndex} className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3" data-station={c.stationId}>
            <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/40">
              {c.title}{c.retesting ? ' · retesting' : c.attempts > 1 ? ' · after one retest' : ''}
            </p>
            <ul className="mt-2 space-y-2.5">
              {c.rows.map((r) => (
                <li key={r.checkId} className="border-l-2 pl-3" style={{ borderColor: TONE[r.status].border }} data-check={r.checkId} data-status={r.status}>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TONE[r.status].dot }} />
                    <span className="font-semibold text-white/85">{r.label}</span>
                    <span className={`font-mono text-[10px] font-bold uppercase tracking-[0.12em] ${TONE[r.status].text}`}>{r.statusLabel}</span>
                  </p>
                  <p className="mt-0.5 break-words text-[12.5px] leading-relaxed text-white/55">{r.value}</p>
                  {r.fix && <p className="mt-1 text-[12.5px] leading-relaxed text-white/70"><span className="font-bold text-white/80">Fix: </span>{r.fix}</p>}
                  {r.retest && <p className="mt-1 text-[12px] leading-relaxed text-white/45">{r.retest}</p>}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
