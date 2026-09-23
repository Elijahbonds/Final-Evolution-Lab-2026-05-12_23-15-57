'use client';

// RACING PASS (2026-09-23): the racers through their SHIPPING hosts, no login. /dev/mode shows the dev JSON pane over a bare
// canvas; what a player reads is the host's HUD (place, lap, gap, the banner), and what the results screen says comes
// from the GameResult the host builds. Both are measured here: the host renders as it ships, and its onEnd result is
// published on window.__DEV_END (and logged) so a probe can read `won` and the headline.
import dynamicImport from 'next/dynamic';
import { prqGrade } from '@/lib/prq';
import type { GameProps, GameResult } from '@/components/games/game-shell';
import type { ComponentType } from 'react';

const HOSTS: Record<string, ComponentType<GameProps>> = {
  velocitykart: dynamicImport(() => import('@/components/games/velocity-kart-babylon'), { ssr: false }),
  aeroaces: dynamicImport(() => import('@/components/games/aero-aces-babylon'), { ssr: false }),
  freerun: dynamicImport(() => import('@/components/games/freerun-babylon'), { ssr: false }),
  sprint: dynamicImport(() => import('@/components/games/sprint-babylon').then((m) => ({ default: m.makeSprintHost('sprint', 'BEACH SPRINT') })), { ssr: false }),
};

export function DevRaceLoader({ modeKey }: { modeKey: string }) {
  const Host = HOSTS[modeKey];
  if (!Host) return <p className="p-4 font-mono text-sm text-white/60">no racing host for “{modeKey}” — try {Object.keys(HOSTS).join(', ')}</p>;
  const onEnd = (r: GameResult) => { (window as unknown as { __DEV_END?: GameResult }).__DEV_END = r; console.log('[dev] end ' + JSON.stringify(r)); };
  return (
    <div className="min-h-screen bg-[#07090d] p-4">
      <p className="mb-3 font-mono text-xs text-white/40">DEV · {modeKey} through its shipping host</p>
      <Host grade={prqGrade(72)} prq={72} onEnd={onEnd} />
    </div>
  );
}
