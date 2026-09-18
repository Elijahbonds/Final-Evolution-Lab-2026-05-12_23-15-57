'use client';

import type { GameProps } from '@/components/games/game-shell';
import { BoardSports3D, type BoardRunResult } from '@/components/games/board-sports-3d';

const DURATION = 120;

export default function BoardSnow3D({ onEnd }: GameProps) {
  const handle = (r: BoardRunResult) =>
    onEnd({
      score: r.score,
      won: true,
      duration: DURATION,
      headline: `${r.tricksLanded} tricks · best combo ${r.bestCombo}`,
    });
  return <BoardSports3D mode="snow" durationSec={DURATION} onGameEnd={handle} />;
}
