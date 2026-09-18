'use client';

import { useState } from 'react';
import { BootSplash } from '@/components/games/boot-splash';
import type { ModePhase } from '@/lib/babylon';

export function DevSplash({ modeId }: { modeId: string }) {
  const [phase, setPhase] = useState<ModePhase>('ready');
  return (
    <div className="relative min-h-screen bg-black">
      <div className="absolute inset-0">
        <BootSplash
          modeId={modeId}
          title={modeId.toUpperCase()}
          phase={phase}
          onStart={() => setPhase('playing')}
          onRetry={() => setPhase('ready')}
        />
      </div>
      {phase === 'playing' && (
        <button onClick={() => setPhase('ready')}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-white px-6 py-2 font-black text-black">
          BACK TO SPLASH
        </button>
      )}
    </div>
  );
}
