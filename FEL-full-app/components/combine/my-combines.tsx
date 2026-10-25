// MyCombines — an athlete's own combine numbers (COMBINE-DAY, 2026-10-25): per combine, each station's best, the
// attempts, and where they placed in that group ("2nd of 14"). Only their own rows reach this (lib/combine/server.ts
// myCombines). Camera numbers are estimates; hand-timed ones say so. Server-rendered: no fetch, nothing sent.
import { formatValue, stationName } from '@/lib/combine/catalogue';
import { ATHLETE_PAGE_LINE, NO_ACCURACY_LINE, say } from '@/lib/combine/copy';
import { ordinal } from '@/lib/combine/score';
import type { MyCombine } from '@/lib/combine/server';

export const MINE_COMING_SOON = 'Combine results are coming soon.';
export const MINE_NONE = 'No combine results yet. When your coach runs one with you, your numbers show here.';

export function MyCombines({ available, events }: { available: boolean; events: readonly MyCombine[] }) {
  const lead = say(ATHLETE_PAGE_LINE);
  if (!available) return <p className="fel-card rounded-xl p-4 text-sm text-white/70" data-my-combines="soon">{MINE_COMING_SOON}</p>;
  if (!events.length) return <p className="fel-card rounded-xl p-4 text-sm text-white/70" data-my-combines="none">{MINE_NONE}</p>;
  return (
    <div className="space-y-4" data-my-combines={events.length}>
      {lead && <p className="text-sm text-white/60">{lead}</p>}
      {events.map((e) => (
        <section key={e.id} className="fel-card space-y-3 rounded-xl p-4" data-my-combine={e.id}>
          <header>
            <h2 className="text-lg font-black text-white">{e.name}</h2>
            <p className="text-xs text-white/45">{new Date(e.createdAt).toLocaleDateString()}</p>
          </header>
          <ul className="space-y-2">
            {e.stations.map((s) => (
              <li key={s.id} className="rounded-lg bg-white/[0.04] p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-white/80">{stationName(s)}</span>
                  <span className="font-mono text-lg font-black tabular-nums text-white">{formatValue(s.kind, s.best)}</span>
                </div>
                <div className="mt-0.5 flex justify-between gap-2 text-xs text-white/50">
                  <span>{s.attempts.map((a) => (a === null ? 'X' : formatValue(s.kind, a))).join(' · ')}{s.touchCm != null ? ` · touch ${formatValue('approach', s.touchCm)}` : ''}</span>
                  {s.rank && <span className="shrink-0">{ordinal(s.rank)} of {s.of}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-[11px] text-white/40">{NO_ACCURACY_LINE}</p>
    </div>
  );
}
