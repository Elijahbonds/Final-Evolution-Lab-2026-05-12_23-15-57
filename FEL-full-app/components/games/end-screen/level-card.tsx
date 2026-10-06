'use client';

// THE PLAYER LEVEL (IMPROVE 2026-10-06, owner decision): the account's level bar fills from where the run started, and
// for every level the run crossed it fills to the end, flashes LEVEL UP and starts again (level-bar.ts). It plays the same
// way as the season bar (use-bar-fill.ts). Instant (reduced motion, a skip): the final bar and the LEVEL UP line.

import { useMemo } from 'react';
import { ChevronsUp } from 'lucide-react';
import type { LevelFill } from './level-bar';
import { useBarFill } from './use-bar-fill';

export function LevelCard({ fill, gained, active, instant, ms, onLevelUp }: {
  fill: LevelFill;
  gained: number;
  active: boolean;
  instant: boolean;
  ms: number;
  onLevelUp?: () => void;
}) {
  const segments = useMemo(() => fill.segments, [fill]);
  const { seg, width, glide, flash, glideMs } = useBarFill(segments, { active, instant, ms, onCross: () => onLevelUp?.() });
  const cur = segments[seg];
  const showUp = fill.levelUps > 0 && (instant || flash !== null);
  const last = segments[segments.length - 1];

  return (
    <div data-recap="level" data-level={fill.levelAfter} data-level-ups={fill.levelUps} className="relative overflow-hidden rounded-2xl border border-[#00FF9D]/30 bg-[#00FF9D]/[0.06] px-[0.8em] py-[0.5em] text-left">
      <div className="flex items-center gap-3">
        <span className="fel-heading shrink-0 font-bold text-[#00FF9D]">LV {cur.level}</span>
        <div className="relative h-[0.6em] flex-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Player level progress" aria-valuemin={0} aria-valuemax={last.need} aria-valuenow={last.to}>
          <div
            data-level-fill
            className="h-full rounded-full bg-gradient-to-r from-[#00C27A] to-[#00FF9D] shadow-[0_0_16px_rgba(0,255,157,0.55)]"
            style={{ width: `${width}%`, transition: glide ? `width ${glideMs}ms cubic-bezier(0.16,0.8,0.3,1)` : 'none' }}
          />
        </div>
        <span className="shrink-0 font-mono text-white/60">LV {cur.level + 1}</span>
        <span className="shrink-0 font-mono text-[0.85em] text-white/70">+{Math.round(gained).toLocaleString('en-US')} XP</span>
      </div>
      {showUp ? (
        <p data-level-up className="mt-[0.25em] flex items-center justify-center gap-[0.35em] text-center font-bold text-[#00FF9D]" style={instant ? undefined : { animation: 'fel-rise 320ms cubic-bezier(0.2,1.4,0.4,1) both' }}>
          <ChevronsUp className="h-[1.1em] w-[1.1em]" /> LEVEL UP! Level {fill.levelAfter}
        </p>
      ) : (
        <p className="mt-[0.2em] text-center font-mono text-[0.75em] text-white/50">
          {Math.max(0, last.need - last.to).toLocaleString('en-US')} XP to level {fill.levelAfter + 1}
        </p>
      )}
    </div>
  );
}
