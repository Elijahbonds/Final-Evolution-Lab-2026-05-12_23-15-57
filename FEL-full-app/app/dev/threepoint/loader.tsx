'use client';

// Dev-only host for the real Babylon ThreePointMode.
//
// Exists because every /play/* route is auth-gated and the local database is
// down, so the shipped route cannot be opened to verify the mode against its
// benchmark. This mounts the SAME component /play/threepoint mounts, with stub
// GameProps — it is the real ModeHarness, the real mode, the real Controller
// Link host. Nothing here is a mock.

import dynamicImport from 'next/dynamic';
import { prqGrade } from '@/lib/prq';
import type { GameResult } from '@/components/games/game-shell';

const ThreePoint = dynamicImport(() => import('@/components/games/three-point-babylon'), { ssr: false });

export function DevThreePointLoader() {
  return (
    <div className="min-h-screen bg-[#07090d] p-4">
      <p className="mb-3 font-mono text-xs text-white/40">
        DEV · real ThreePointMode via ModeHarness · benchmark: NBA 2K9 Three-Point Contest
      </p>
      <ThreePoint
        grade={prqGrade(72)}
        prq={72}
        onEnd={(r: GameResult) => console.log('[dev] mode ended', r)}
      />
    </div>
  );
}
