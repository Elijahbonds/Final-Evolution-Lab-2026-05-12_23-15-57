// MyCombines — an athlete's own combine numbers (COMBINE-DAY, 2026-10-25): per combine, each station's best, the
// attempts, and where they placed in that group ("2nd of 14"). Only their own rows reach this (lib/combine/server.ts
// myCombines). Camera numbers are estimates; hand-timed ones say so. Server-rendered: no fetch, nothing sent.
import { formatValue, stationName } from '@/lib/combine/catalogue';
import { ATHLETE_PAGE_LINE, NO_ACCURACY_LINE, say } from '@/lib/combine/copy';
import { ordinal } from '@/lib/combine/score';
import type { MyCombine, MyStation } from '@/lib/combine/server';
import { previousStation, stationView } from '@/lib/results/combine';
import { ResultCard, PROGRESS_HREF } from '@/components/result-card/result-card';
import { LOOK } from '@/components/result-card/look';

export const MINE_COMING_SOON = 'Combine results are coming soon.';
export const MINE_NONE = 'No combine results yet. When your coach runs one with you, your numbers show here.';
/** PLAT-P03 DRAFT: the lead card's one button, to the re-test history. */
export const MINE_PROGRESS = 'My progress';

/** The rows under the lead card: each station's best, where you placed, and the arrow against your last combine. */
function StationRow({ s, prev }: { s: MyStation; prev: MyStation | null }) {
  const v = stationView(s, prev, { label: '', href: null });
  return (
    <li className="rounded-lg bg-white/[0.04] p-3" data-my-station={s.id} data-vs={v.vsLast ?? 'none'}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-white/80">{stationName(s)}</span>
        <span className="font-mono text-lg font-black tabular-nums text-white">{formatValue(s.kind, s.best)}</span>
      </div>
      <div className="mt-0.5 flex justify-between gap-2 text-xs text-white/50">
        <span>{s.attempts.map((a) => (a === null ? 'X' : formatValue(s.kind, a))).join(' · ')}{s.touchCm != null ? ` · touch ${formatValue('approach', s.touchCm)}` : ''}</span>
        {s.rank && <span className="shrink-0">{ordinal(s.rank)} of {s.of}</span>}
      </div>
      {v.vsLine ? <div className="mt-1 text-xs text-white/70" data-my-station-vs>{v.vsLine}</div> : null}
    </li>
  );
}

/**
 * PLAT-P03 (2026-10-28): the newest combine's first station leads as ONE result card — the number, the arrow against the
 * same station at your last combine (lib/results/combine.ts: the jump's own band; a stopwatch has none, so no arrow),
 * where you placed, and "My progress" (the re-test history, TRY-08). Every combine's stations follow, as before.
 */
export function MyCombines({ available, events }: { available: boolean; events: readonly MyCombine[] }) {
  const lead = say(ATHLETE_PAGE_LINE);
  if (!available) return <p className="fel-card rounded-xl p-4 text-sm text-white/70" data-my-combines="soon">{MINE_COMING_SOON}</p>;
  if (!events.length) return <p className="fel-card rounded-xl p-4 text-sm text-white/70" data-my-combines="none">{MINE_NONE}</p>;
  const newest = [...events].sort((a, b) => b.createdAt - a.createdAt);
  const top = newest[0];
  const first = top.stations.find((x) => x.best !== null) ?? null;
  return (
    <div className="space-y-4" data-my-combines={events.length}>
      {first ? (
        <ResultCard reveal={false} fill view={stationView(first, previousStation(newest, top.id, first.id), { label: MINE_PROGRESS, href: PROGRESS_HREF })}
          details={<p className={LOOK.detail}>{top.name} · {new Date(top.createdAt).toLocaleDateString()}. {NO_ACCURACY_LINE}</p>} />
      ) : null}
      {lead && <p className="text-sm text-white/60">{lead}</p>}
      {newest.map((e) => (
        <section key={e.id} className="fel-card space-y-3 rounded-xl p-4" data-my-combine={e.id}>
          <header>
            <h2 className="text-lg font-black text-white">{e.name}</h2>
            <p className="text-xs text-fel-dim">{new Date(e.createdAt).toLocaleDateString()}</p>
          </header>
          <ul className="space-y-2">
            {e.stations.map((s) => <StationRow key={s.id} s={s} prev={previousStation(newest, e.id, s.id)} />)}
          </ul>
        </section>
      ))}
      <p className="text-[11px] text-fel-dim">{NO_ACCURACY_LINE}</p>
    </div>
  );
}
