'use client';

import dynamicImport from 'next/dynamic';
import { prqGrade } from '@/lib/prq';
import type { GameResult } from '@/components/games/game-shell';

const Sprint = dynamicImport(
  () => import('@/components/games/sprint-babylon').then((m) => ({
    default: m.makeSprintHost('sprint', 'BEACH SPRINT'),
  })),
  { ssr: false },
);

export function DevSprintLoader() {
  return (
    <div className="min-h-screen bg-[#07090d] p-4">
      <p className="mb-3 font-mono text-xs text-white/40">DEV · real SprintMode via its shipping host</p>
      <Sprint grade={prqGrade(72)} prq={72} onEnd={(r: GameResult) => console.log('[dev] end', r)} />
    </div>
  );
}
