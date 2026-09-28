'use client';

// MOVEMENT PLAY P4 (2026-09-25): body play through the SHIPPING hosts, no login. /dev/mode has no splash (it prints the
// phase over a bare canvas), and the READY card is where body play is chosen — so the space check's live probe
// (scripts/probes/_space-check-live.mts) runs here: the host as it ships (its BootSplash, its HUD), with the header's
// Body button (BodyControl, as GameShell mounts it) above it. The nine games the body drives, one where body play is
// coming (dunk) and one with none (football). The run's result is published on window.__DEV_END and logged.
import dynamicImport from 'next/dynamic';
import { prqGrade } from '@/lib/prq';
import type { GameProps, GameResult } from '@/components/games/game-shell';
import type { ComponentType } from 'react';
import { BodyControl } from '@/components/games/body-control';

const HOSTS: Record<string, ComponentType<GameProps>> = {
  skateboard: dynamicImport(() => import('@/components/games/board-babylon').then((m) => ({ default: m.makeBoardHost({ modeKey: 'skateboard', tag: 'FEL-SKATE', tricks: ['KICKFLIP', 'HEELFLIP', 'GRAB'], hint: 'Steer · hold PUMP · JUMP to ollie/grind · tricks in air' }) })), { ssr: false }),
  snowboard_slalom: dynamicImport(() => import('@/components/games/board-babylon').then((m) => ({ default: m.makeBoardHost({ modeKey: 'snowboard_slalom', tag: 'FEL-SNOW', tricks: ['SPIN', 'GRAB', 'FLIP'], hint: 'Steer · hold PUMP · JUMP off kickers' }) })), { ssr: false }),
  surf: dynamicImport(() => import('@/components/games/board-babylon').then((m) => ({ default: m.makeBoardHost({ modeKey: 'surf', tag: 'FEL-SURF', tricks: ['CUTBACK', 'AIR', 'GRAB'], hint: 'Steer the pocket · hold PUMP · JUMP for air' }) })), { ssr: false }),
  bigair: dynamicImport(() => import('@/components/games/air-session-babylon').then((m) => ({ default: m.makeAirHost('bigair', 'STOMP') })), { ssr: false }),
  sprint: dynamicImport(() => import('@/components/games/sprint-babylon').then((m) => ({ default: m.makeSprintHost('sprint', 'BEACH SPRINT') })), { ssr: false }),
  freerun: dynamicImport(() => import('@/components/games/freerun-babylon'), { ssr: false }),
  karate_vs: dynamicImport(() => import('@/components/games/karate-vs-babylon'), { ssr: false }),
  mixedcombat: dynamicImport(() => import('@/components/games/mixedcombat-babylon'), { ssr: false }),
  showdown: dynamicImport(() => import('@/components/games/showdown-babylon'), { ssr: false }),
  dunk: dynamicImport(() => import('@/components/games/dunk-babylon'), { ssr: false }) as ComponentType<GameProps>,
  football: dynamicImport(() => import('@/components/games/football-babylon'), { ssr: false }),
};

export function DevBodyLoader({ modeKey }: { modeKey: string }) {
  const Host = HOSTS[modeKey];
  if (!Host) return <p className="p-4 font-mono text-sm text-white/60">no body-play host for “{modeKey}” — try {Object.keys(HOSTS).join(', ')}</p>;
  const onEnd = (r: GameResult) => { (window as unknown as { __DEV_END?: GameResult }).__DEV_END = r; console.log('[dev] end ' + JSON.stringify(r)); };
  return (
    <div className="min-h-screen bg-[#07090d] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-mono text-xs text-white/40">DEV · {modeKey} · body play through its shipping host</p>
        <BodyControl />
      </div>
      <Host grade={prqGrade(72)} prq={72} onEnd={onEnd} />
    </div>
  );
}
