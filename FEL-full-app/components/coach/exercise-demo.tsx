'use client';

// ExerciseDemo (M34) — every Coach exercise SHOWS the movement, never blank.
//   • YOUR AVATAR tab: the learner's own athlete doing the exercise — the exercise library's stage
//     (components/library/exercise-stage via ssr:false) playing the entry's own loop. FITNESS-TPOSE (2026-10-26): the
//     old canvas (exercise-avatar-canvas, /models/elijah.glb) had no exercise clip at all and played one unrelated
//     mocap for every exercise; with no clip, or a loop that will not play, the tab is the cue card, never a bind pose.
//   • COACH VIDEO tab: the founder-recorded YouTube demo (existing videoUrl).
//   • Fallback: an animated cue card so the panel is never empty.
// Adapted to THIS project's Exercise schema (no M17 ExerciseMoviePlayer exists).

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Play, User, Dumbbell } from 'lucide-react';

const ExerciseStage = dynamic(() => import('@/components/library/exercise-stage'), {
  ssr: false,
  loading: () => (
    <div className="aspect-video w-full flex items-center justify-center bg-[#07070d] text-white/40 text-xs">
      Loading your avatar…
    </div>
  ),
});

export interface ExerciseDemoData {
  name: string;
  videoUrl?: string;
  targetPrqStat?: string;
  dosage?: string;
  /**
   * EXERCISE-LIBRARY (2026-10-25): the avatar clip a library entry maps to (lib/library/demo.ts avatarClip). A string
   * plays that clip; null means the rig has no clip for this movement yet, so the avatar tab is not shown rather than
   * a motion that does not match. FITNESS-TPOSE: left out is the same as null (the old stat-picked clip never existed
   * in the model, so it was always the wrong motion).
   */
  clip?: string | null;
}

type Tab = 'avatar' | 'video';

const NO_MUSCLES = { primary: [] as string[], secondary: [] as string[] };

const threeDisabled =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DISABLE_3D === '1';

function youTubeEmbed(raw?: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    let id = '';
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
    else if (url.hostname.includes('youtube.com')) id = url.searchParams.get('v') || '';
    return id ? `https://www.youtube.com/embed/${id}?rel=0` : null;
  } catch {
    return null;
  }
}

export function ExerciseDemo({ exercise }: { exercise: ExerciseDemoData }) {
  const embedUrl = useMemo(() => youTubeEmbed(exercise.videoUrl), [exercise.videoUrl]);
  const hasVideo = !!embedUrl;
  const [stageFailed, setStageFailed] = useState(false);
  const hasAvatar = !threeDisabled && !!exercise.clip && !stageFailed;
  const [tab, setTab] = useState<Tab>(hasAvatar ? 'avatar' : 'video');
  const [showVideo, setShowVideo] = useState(false);

  const showTabs = !threeDisabled && !!exercise.clip && hasVideo;   // a failed stage keeps its tab (the cue card), so the video stays reachable

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0c0c11]">
      {showTabs && (
        <div className="flex border-b border-white/8">
          {(['avatar', 'video'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-[11px] font-bold tracking-widest transition-colors ${
                tab === t ? 'bg-white/[0.06] text-[#00E5FF]' : 'text-white/40 hover:text-white/70'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                {t === 'avatar' ? <User className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                {t === 'avatar' ? 'YOUR AVATAR' : 'COACH VIDEO'}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* AVATAR demo */}
      {tab === 'avatar' && hasAvatar && (
        <div className="relative">
          <div className="aspect-video w-full bg-gradient-to-b from-[#0b0b12] to-[#05050a]">
            <ExerciseStage view="demo" clip={exercise.clip!} muscles={NO_MUSCLES} side="front" onState={(s) => { if (s === 'failed') setStageFailed(true); }} />
          </div>
          <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#00E5FF]">
            YOUR AVATAR
          </span>
        </div>
      )}

      {/* VIDEO demo (YouTube) */}
      {tab === 'video' && hasVideo && (
        showVideo ? (
          <div className="aspect-video w-full bg-black">
            <iframe
              src={embedUrl!}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={`${exercise.name} demo`}
            />
          </div>
        ) : (
          <button
            onClick={() => setShowVideo(true)}
            className="w-full aspect-video bg-[#16161a] border-b border-white/6 flex flex-col items-center justify-center gap-2 hover:border-[#FF3366]/30 transition-all group"
          >
            <div className="w-12 h-12 rounded-full bg-[#FF3366]/20 flex items-center justify-center group-hover:bg-[#FF3366]/30 transition-colors">
              <Play className="h-6 w-6 text-[#FF3366]" />
            </div>
            <span className="text-sm text-white/50">Watch Coach Bonds Demo</span>
          </button>
        )
      )}

      {/* Never-blank fallback */}
      {((tab === 'video' && !hasVideo) || (tab === 'avatar' && !hasAvatar)) && (
        <div className="p-5">
          <div className="fel-cuecard flex aspect-video w-full items-center justify-center rounded-xl bg-[#16161a]">
            <Dumbbell className="h-10 w-10 text-white/30" />
          </div>
          {!hasVideo && (
            <p className="mt-3 text-center text-[11px] text-white/40">
              Follow the cues below.
            </p>
          )}
        </div>
      )}

      <style jsx>{`
        .fel-cuecard { animation: felcue 2.4s ease-in-out infinite; }
        @keyframes felcue { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
      `}</style>
    </div>
  );
}
