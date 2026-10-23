'use client';

import dynamicImport from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { GameShell } from '@/components/games/game-shell';
import { isBabylon } from '@/components/three/flags';
import type { TennisVariant } from '@/lib/babylon/modes/tennisVariant';

const spinner = () => (
  <div className="flex h-[60vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-[#00E5FF]" />
  </div>
);

const TennisGame2D = dynamicImport(() => import('@/components/games/tennis-game'), { ssr: false, loading: spinner });

// M74: TennisMode is now a net-sport (RallyCore + NexusVenue) — same registry key.
const TennisBabylon = dynamicImport(
  () => import('@/components/games/timing-babylon').then((m) => ({
    default: m.makeTimingHost({ modeKey: 'tennis', tag: 'FEL-TENNIS', swingLabel: 'SWING', hint: 'Aim with stick · A to swing as the ball arrives' }),
  })),
  { ssr: false, loading: spinner },
);

// TENNIS-TIEBREAK-FOLD (2026-10-22): the tiebreak variant — the same court and controls, first to 7 points, win by 2
// (TennisMode.ts TennisTiebreakMode, mounted as the host's `def`: the registry's `tiebreak` key still names the unrouted
// TiebreakMode, which existing tests pin). It posts under the `tiebreak` session key (lib/babylon/modes/tennisVariant).
const TiebreakBabylon = dynamicImport(
  () => Promise.all([import('@/components/games/timing-babylon'), import('@/lib/babylon/modes/TennisMode')]).then(([m, t]) => ({
    default: m.makeTimingHost({ modeKey: 'tiebreak', def: t.TennisTiebreakMode, tag: 'FEL-TIEBREAK', swingLabel: 'SWING', hint: 'Aim with stick · A to swing as the ball arrives' }),
  })),
  { ssr: false, loading: spinner },
);

export function TennisLoader({ variant = 'match' }: { variant?: TennisVariant }) {
  if (variant === 'tiebreak' && isBabylon('tiebreak')) {
    // the venue is the catalogue's: the variant plays on Tennis's own court (venueId 'tennis'), Venice Tennis Court
    return <GameShell mode="tiebreak" title="TIEBREAK" venue="Venice Tennis Court" Game={TiebreakBabylon} ownControls />;
  }
  // the 2D fallback (NEXT_PUBLIC_DISABLE_3D) has no tiebreak: either variant plays the 2D match
  const babylon = isBabylon('tennis');
  const Game = babylon ? TennisBabylon : TennisGame2D;
  return <GameShell mode="tennis" title="MATCH POINT" venue="Venice Tennis Court" Game={Game} ownControls={babylon} />;
}
