// GameLoading — EVERY-SCREEN P7: what a game shows while its code loads. It was a bare spinner in 35 copies (each mode's
// loader.tsx, the guest shells, the game shell): on the throttled phone the rig read "a spinner with no words" on 26 game
// screens. One status line says what it waits for.
import { Loader2 } from 'lucide-react';

export const GAME_LOADING = 'Loading the game…';

export function GameLoading({ className = 'h-[60vh]' }: { className?: string }) {
  return (
    <div role="status" className={`flex ${className} flex-col items-center justify-center gap-3`}>
      <Loader2 aria-hidden className="h-8 w-8 animate-spin text-[#00E5FF]" />
      <p className="text-[16px] text-white/60">{GAME_LOADING}</p>
    </div>
  );
}
