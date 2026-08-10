'use client';

import type { GameProps } from '@/components/games/game-shell';
import { BoardSports3D, type BoardRunResult } from '@/components/games/board-sports-3d';

const DURATION = 120;

export default function BoardSurf3D({ onEnd }: GameProps) {
  const handle = (r: BoardRunResult) =>
    onEnd({
      score: r.score,
      won: true,
      duration: DURATION,
      headline: `${r.tricksLanded} tricks · best ride ${(r.maxSpeedNorm * 100) | 0}%`,
    });
  return <BoardSports3D mode="surf" durationSec={DURATION} onGameEnd={handle} />;
}
