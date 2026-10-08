'use client';

// CREATOR SOUNDTRACK phase 4 hook: tell the soundtrack where a mode host is, in one line, from the host's own file.
//
// Routed to the boot-splash holder (a caution file, not edited here). The line goes FIRST in BootSplash's body, before
// any early return (the splash renders nothing once a game is playing, but its phase still changes):
//     useSoundtrackStage(props.phase);
// or, as JSX anywhere the phase is in scope:  <SoundtrackStage phase={props.phase} />
// 'loading' | 'ready' → loading (menu level); 'countdown' | 'playing' | 'paused' → the bed (14 dB under); 'ended' → end.
// When the host unmounts, the page gets its stage back.

import { useEffect } from 'react';
import { setSoundtrackStage } from '@/lib/soundtrack/client';

export function useSoundtrackStage(phase: string | null | undefined): void {
  useEffect(() => { if (phase) setSoundtrackStage(phase); }, [phase]);
  useEffect(() => () => setSoundtrackStage(null), []);
}

export function SoundtrackStage({ phase }: { phase: string | null | undefined }): null {
  useSoundtrackStage(phase);
  return null;
}
