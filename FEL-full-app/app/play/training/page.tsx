import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * IRON-PARADISE-OUT (2026-10-03): Iron Paradise is parked (lib/unlisted-modes.ts). The route stays live as a
 * TEMPORARY (307) redirect to /train, so a bookmark, an old Arena duel's PLAY link or a saved first-game pick
 * lands somewhere useful instead of mounting the game. Nothing is deleted — the loader
 * (app/play/training/_components/loader.tsx) and the game (components/games/training-game.tsx) are untouched;
 * bringing the mode back is removing 'training' from UNLISTED_MODES and restoring this page's session+loader body.
 */
export default function TrainingPage() {
  redirect('/train');
}
