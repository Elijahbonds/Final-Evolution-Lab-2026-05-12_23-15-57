'use client';

import { useState } from 'react';
import { BootSplash } from '@/components/games/boot-splash';
import type { ModePhase } from '@/lib/babylon/core/ModeHarness';

const MODES = ['skateboard', 'snowboard_slalom', 'surf', 'velocitykart', 'aeroaces', 'dunk'] as const;

export function SplashHarness({ modeId }: { modeId: string }) {
  const [phase, setPhase] = useState<ModePhase>('ready');
  return (
    <div className="min-h-screen bg-[#050505]">
      <div className="flex flex-wrap gap-2 p-3">
        {MODES.map((m) => (
          <a
            key={m}
            href={`/dev/splash?mode=${m}`}
            className={`rounded-lg border px-3 py-1.5 text-xs ${
              m === modeId ? 'border-[#00E5FF]/60 bg-[#00E5FF]/10 text-[#00E5FF]' : 'border-white/12 text-white/60'
            }`}
          >{m}</a>
        ))}
        <button
          onClick={() => setPhase((p) => (p === 'ready' ? 'loading' : 'ready'))}
          className="rounded-lg border border-white/12 px-3 py-1.5 text-xs text-white/60"
        >phase: {phase}</button>
      </div>
      <BootSplash
        modeId={modeId}
        title={modeId.replace(/_/g, ' ').toUpperCase()}
        phase={phase}
        onStart={() => setPhase('playing')}
        onRetry={() => setPhase('ready')}
      />
    </div>
  );
}
