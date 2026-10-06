'use client';

// The season pass bar — the card's TIER UP (the player level has its own bar since 2026-10-06: level-card.tsx). It fills from where the run started, and for every tier the run crossed it
// fills to the end, flashes TIER UP with what that tier booked, and starts again (season-bar.ts rebuilds the start from the
// server's own numbers). Instant (reduced motion, a skip): the final bar and the tier-up line, no travel.

import { useMemo } from 'react';
import { Crown } from 'lucide-react';
import { seasonFill, tierRewardWords } from './season-bar';
import { useBarFill } from './use-bar-fill';
import type { SeasonRecap } from './types';

export function SeasonCard({ season, active, instant, ms, onTierUp }: {
  season: SeasonRecap;
  active: boolean;
  instant: boolean;
  ms: number;
  onTierUp?: () => void;
}) {
  const fill = useMemo(() => seasonFill(season), [season]);
  const { seg, width, glide, flash, glideMs } = useBarFill(fill.segments, { active, instant, ms, onCross: () => onTierUp?.() });

  const cur = fill.segments[seg];
  const lastUp = season.tierUps.length > 0 ? season.tierUps[season.tierUps.length - 1] : null;
  const words = lastUp ? tierRewardWords(lastUp) : [];
  const showUp = lastUp && (instant || flash !== null);

  return (
    <div data-recap="season" data-tier-ups={season.tierUps.length} className="relative overflow-hidden rounded-2xl border border-[#FFD700]/30 bg-[#FFD700]/[0.07] px-[0.8em] py-[0.55em] text-left">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-bold text-[#FFD700]">
          <Crown className="h-[1em] w-[1em]" /> {season.name}
        </span>
        <span className="font-mono text-white/75">+{Math.round(season.gained).toLocaleString('en-US')} season XP</span>
      </div>
      <div className="mt-[0.35em] flex items-center gap-3">
        <span className="font-mono text-white/60">T{cur.tier}</span>
        <div className="relative h-[0.6em] flex-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Season tier progress" aria-valuemin={0} aria-valuemax={season.need} aria-valuenow={season.into}>
          <div
            data-season-fill
            className="h-full rounded-full bg-gradient-to-r from-[#FFB020] to-[#FFD700] shadow-[0_0_16px_rgba(255,215,0,0.6)]"
            style={{ width: `${width}%`, transition: glide ? `width ${glideMs}ms cubic-bezier(0.16,0.8,0.3,1)` : 'none' }}
          />
        </div>
        <span className="font-mono text-white/60">T{cur.tier + 1}</span>
      </div>
      {showUp && (
        <p data-season-tierup className="mt-[0.3em] text-center font-bold text-[#FFD700]" style={instant ? undefined : { animation: 'fel-rise 320ms cubic-bezier(0.2,1.4,0.4,1) both' }}>
          TIER UP! Tier {lastUp!.tier}{words.length ? ` · ${words.join(' · ')}` : ''}
        </p>
      )}
    </div>
  );
}
