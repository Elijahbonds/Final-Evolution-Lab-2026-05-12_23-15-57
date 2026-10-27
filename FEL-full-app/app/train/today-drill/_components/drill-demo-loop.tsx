'use client';

// TODAY-DRILL (2026-10-27): today's movement as a looping avatar demo. Not a second demo: this mounts the exercise
// library's shared stage (components/library/exercise-stage.tsx, the library-anatomy lanes' — the athlete's own body
// playing an `ex_*` loop) the way the library's switcher does (next/dynamic, ssr:false), with the clip guide.ts names
// for the drill. The owner saw a T-pose on this page: that was the drills page's DrillDemo (exercise-avatar-canvas's
// one-clip stand-in), which this page no longer mounts.
//
// Phone care: the stage loads only once the box is near the screen (Babylon and the body are megabytes); with 3D off
// (NEXT_PUBLIC_DISABLE_3D), no loop for the drill, or a stage that fails to load, it is the cue card — never a blank
// box and never a wrong movement.
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Dumbbell } from 'lucide-react';
import { DEMO_NONE_LINE, DEMO_STILL_LINE } from '@/lib/daily-drill/guide';

const ExerciseStage = dynamic(() => import('@/components/library/exercise-stage'), {
  ssr: false,
  loading: () => <p className="flex h-full items-center justify-center text-[13px] text-white/50">Loading the demo…</p>,
});

const threeDisabled = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DISABLE_3D === '1';
const NO_MUSCLES = { primary: [] as string[], secondary: [] as string[] };

export function DrillDemoLoop({ clip, cues }: { clip: string | null; cues: readonly string[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const has3d = !threeDisabled && !!clip;

  useEffect(() => {
    if (!has3d || near) return;
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [has3d, near]);

  if (!has3d || state === 'failed') {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-white/[0.04] p-4" data-daily-demo="cues">
        <Dumbbell aria-hidden className="mt-0.5 h-7 w-7 shrink-0 text-white/30" />
        <div className="min-w-0 space-y-1">
          <p className="text-[13px] text-white/55">{clip ? DEMO_STILL_LINE : DEMO_NONE_LINE}</p>
          <ul className="space-y-0.5 text-[14px] text-white/85">{cues.slice(0, 2).map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
      </div>
    );
  }
  return (
    <div ref={box} className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-b from-[#0b0b12] to-[#05050a]" data-daily-demo={clip}>
      <div className="aspect-[4/3] w-full">
        {near && <ExerciseStage view="demo" clip={clip} hold={null} muscles={NO_MUSCLES} side="front" onState={setState} />}
      </div>
      <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#00E5FF]">YOUR ATHLETE · LOOP</span>
    </div>
  );
}
