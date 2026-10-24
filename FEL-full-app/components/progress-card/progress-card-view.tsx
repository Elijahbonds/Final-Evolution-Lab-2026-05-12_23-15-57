// THE WEEKLY PROGRESS CARD (value round item 1; owner promise "get measurably better"). Server-safe (no hooks): the page
// renders it with the card the server built, and the phone-only island (device-card.tsx) renders the same view once the
// form numbers kept on this phone are read. The four tiles are profile v2's own (components/profile-v2/tile.tsx), so a
// number on the card and the same number on the profile header can never disagree.
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { TileView } from '@/components/profile-v2/tile';
import { weekLabel, type CardGames, type ProgressCard } from '@/lib/progress-card/summary';

const ACCENT: Record<string, string> = { jump: '#00E5FF', form: '#00FF9D', reaction: '#FFD700', streak: '#FF7A2F' };
const TONE = { better: '#00FF9D', worse: '#FF7A2F', same: '#8b97a5' } as const;

function Games({ games }: { games: CardGames }) {
  return (
    <div className="mt-4 rounded-2xl border border-white/[0.07] bg-[#0c0c11] p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#FFD700]">Games</p>
        {games.runsLine && <p className="text-right text-[11.5px] text-white/50">{games.runsLine}</p>}
      </div>
      {games.modes.length > 0 ? (
        <ul className="mt-1 divide-y divide-white/[0.06]">
          {games.modes.map((m) => {
            const Arrow = m.compare.direction === 'up' ? ArrowUpRight : m.compare.direction === 'down' ? ArrowDownRight : Minus;
            const tone = m.compare.trend ? TONE[m.compare.trend] : 'rgba(255,255,255,0.45)';
            return (
              <li key={m.mode} data-mode={m.mode} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-white/85">{m.name}</span>
                  {m.vsLine && (
                    <span className="mt-0.5 flex items-start gap-1 text-[11.5px] leading-snug" style={{ color: tone }}>
                      {m.compare.trend && <Arrow aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />}
                      <span>{m.vsLine}</span>
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  <span className={`fel-heading text-[17px] font-black tabular-nums ${m.compare.thisWeek === null ? 'text-white/25' : 'text-[#FFD700]'}`}
                    aria-label={m.compare.thisWeek === null ? 'not played this week' : undefined}>
                    {m.compare.thisWeek === null ? '—' : Math.round(m.compare.thisWeek).toLocaleString('en-US')}
                  </span>
                  <span className="block font-mono text-[10px] text-white/35">best this week</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : games.scope === 'device' ? (
        <p className="mt-2 text-[12px] leading-snug text-white/50">
          Under 18, or with no birth year on the account, your game scores stay on this phone, so the card counts runs, not scores.{' '}
          <Link href="/profile#stats" className="font-bold text-[#FFD700] underline-offset-2 hover:underline">Your bests →</Link>
        </p>
      ) : (
        <p className="mt-2 text-[12px] leading-snug text-white/50">
          No scored runs in the last two weeks.{' '}
          <Link href="/play" className="font-bold text-[#FFD700] underline-offset-2 hover:underline">Play a mode →</Link>
        </p>
      )}
    </div>
  );
}

export function ProgressCardView({ card }: { card: ProgressCard }) {
  return (
    <section aria-labelledby="week-card-h" data-card-state={card.state}
      className="rounded-3xl border border-white/[0.08] bg-[linear-gradient(160deg,rgba(11,42,51,0.55)_0%,#08080c_55%)] p-3.5 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Your week</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#00E5FF]">{weekLabel(card)}</p>
      </div>
      <h2 id="week-card-h" className="fel-heading mt-2 text-[21px] font-black leading-tight text-white">{card.headline}</h2>
      <p className="mt-1 text-[11.5px] text-white/40">Last 7 days against the 7 before. A dash is something nobody measured.</p>
      <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {card.metrics.map((t) => <TileView key={t.key} tile={t} accent={ACCENT[t.key] ?? '#fff'} />)}
      </div>
      <Games games={card.games} />
    </section>
  );
}
