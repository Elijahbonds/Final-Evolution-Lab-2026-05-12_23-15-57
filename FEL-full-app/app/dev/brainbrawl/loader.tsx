'use client';

// Dev-only host for the real Babylon BrainBrawlMode (BRAINBRAWL-MAJOR, 2026-09-24).
//
// Exists for the same reason /dev/threepoint does: /play/brain-brawl is auth-gated and the local database is down, and
// the generic /dev/mode runner draws its own debug HUD — not the challenge card. The card IS half of this mode (the
// question, the four answers, the reveal), so it has to be looked at through the SAME component /play/brain-brawl
// mounts, with stub GameProps. Real ModeHarness, real mode, real card. Nothing here is a mock.

import dynamicImport from 'next/dynamic';
import { prqGrade } from '@/lib/prq';
import type { GameResult } from '@/components/games/game-shell';

const BrainBrawl = dynamicImport(() => import('@/components/games/brainbrawl-babylon'), { ssr: false });

export function DevBrainBrawlLoader() {
  return (
    <div className="min-h-screen bg-[#07090d] p-4">
      <p className="mb-3 font-mono text-xs text-white/40">
        DEV · real BrainBrawlMode via ModeHarness · benchmark: Trivia Crack wheel × Big Brain Academy
      </p>
      <BrainBrawl
        grade={prqGrade(72)}
        prq={72}
        onEnd={(r: GameResult) => console.log('[dev] mode ended', JSON.stringify(r))}
      />
    </div>
  );
}
