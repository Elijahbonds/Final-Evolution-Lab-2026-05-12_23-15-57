'use client';
// AvatarDemo — T-POSE (owner playtest, 2026-10-27): the 3D demo for a surface outside the library (the Mirror's Quick
// Screen results, Today's drill, the drills app). The library's own stage (exercise-stage.tsx): the player's own avatar,
// the authored loops, the bind-pose guard. `clip` is the loop that IS the movement (lib/library/surfaceDemo.ts); without
// one, the body stands still in the start position, labelled "Demo coming" — never another movement, never a T-pose.
// Until the stage is ready (and measured off its bind pose) the box says it is loading; if 3D fails, it says so.
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { DEMO_COMING, STILL_DEMO_CLIP } from '@/lib/library/surfaceDemo';

const ExerciseStage = dynamic(() => import('./exercise-stage'), { ssr: false, loading: () => null });
const NO_MUSCLES = { primary: [] as string[], secondary: [] as string[] };

export function AvatarDemo({ clip }: { clip: string | null }) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const still = !clip;
  return (
    <div className="relative aspect-video w-full bg-gradient-to-b from-[#0b0b12] to-[#05050a]" data-avatar-demo={clip ?? 'still'} data-avatar-state={state}>
      <div className={`h-full w-full transition-opacity duration-300 ${state === 'ready' ? 'opacity-100' : 'opacity-0'}`}>
        <ExerciseStage view="demo" clip={clip ?? STILL_DEMO_CLIP} hold={still ? 0 : null} muscles={NO_MUSCLES} side="front" onState={setState} />
      </div>
      {state !== 'ready' && (
        <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-[14px] text-white/50" role="status">
          {state === 'failed' ? '3D couldn’t load here. The drill is the lines on this page.' : 'Loading the demo…'}
        </p>
      )}
      {state === 'ready' && (
        <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#00E5FF]" data-avatar-badge>
          {still ? `YOUR ATHLETE · ${DEMO_COMING.toUpperCase()}` : 'YOUR ATHLETE'}
        </span>
      )}
    </div>
  );
}
