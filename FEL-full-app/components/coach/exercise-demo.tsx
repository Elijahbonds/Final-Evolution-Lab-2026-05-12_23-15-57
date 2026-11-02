'use client';

// ExerciseDemo (M34) — every Coach exercise SHOWS the movement, never blank.
//   • YOUR AVATAR tab: the learner's real 3D hero rig loops a representative
//     athletic motion (components/coach/exercise-avatar-canvas via ssr:false).
//   • COACH VIDEO tab: FEL's own-storage video autoplays (muted, looped); a YouTube URL is a labelled OUTBOUND LINK, never an
//     embed (COACH-DELIVERY COA-09, owner 2026-10-20: no YouTube, no ads; assumption: kept as a link, not dropped).
//   • Fallback: an animated cue card so the panel is never empty.
// Adapted to THIS project's Exercise schema (no M17 ExerciseMoviePlayer exists).

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Play, User, Dumbbell } from 'lucide-react';

const ExerciseAvatarCanvas = dynamic(() => import('./exercise-avatar-canvas'), {
  ssr: false,
  loading: () => (
    <div className="aspect-video w-full flex items-center justify-center bg-[#07070d] text-fel-dim text-xs">
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
   * a motion that does not match. Left out, the old behaviour (a clip chosen from targetPrqStat).
   */
  clip?: string | null;
}

type Tab = 'avatar' | 'video';

const threeDisabled =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DISABLE_3D === '1';

/** The coach video: an own-storage file (plays here) or an outbound link (YouTube or anything else http(s)). */
function coachVideo(raw?: string): { kind: 'file'; src: string } | { kind: 'link'; href: string; youtube: boolean } | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (/\.(mp4|webm|m4v|mov)$/i.test(url.pathname)) return { kind: 'file', src: url.href };
    return { kind: 'link', href: url.href, youtube: /(^|\.)youtu(\.be|be\.com)$/.test(url.hostname) };
  } catch {
    return null;
  }
}

export function ExerciseDemo({ exercise }: { exercise: ExerciseDemoData }) {
  const video = useMemo(() => coachVideo(exercise.videoUrl), [exercise.videoUrl]);
  const hasVideo = !!video;
  const hasAvatar = !threeDisabled && exercise.clip !== null;
  const [tab, setTab] = useState<Tab>(hasAvatar ? 'avatar' : 'video');

  const showTabs = hasAvatar && hasVideo;

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0c0c11]">
      {showTabs && (
        <div className="flex border-b border-white/8">
          {(['avatar', 'video'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 text-[11px] font-bold tracking-widest transition-colors ${
                tab === t ? 'bg-white/[0.06] text-fel-cyan' : 'text-fel-dim hover:text-white/70'
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
          <ExerciseAvatarCanvas stat={exercise.targetPrqStat || ''} clip={exercise.clip ?? undefined} />
          <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-bold tracking-wider text-fel-cyan">
            YOUR AVATAR
          </span>
        </div>
      )}

      {/* VIDEO demo: own storage autoplays; anything else is a labelled outbound link (no embed, no player) */}
      {tab === 'video' && video && (
        video.kind === 'file' ? (
          <div className="aspect-video w-full bg-black">
            <video src={video.src} className="h-full w-full" autoPlay muted loop playsInline preload="metadata" title={`${exercise.name} demo`} />
          </div>
        ) : (
          <a href={video.href} target="_blank" rel="noreferrer noopener" className="flex min-h-12 w-full items-center justify-center gap-2 border-b border-white/6 bg-[#16161a] px-4 text-sm text-white/60">
            <Play className="h-5 w-5 text-fel-crimson" /> {video.youtube ? 'Coach demo on YouTube (opens outside FEL)' : 'Coach demo (opens outside FEL)'}
          </a>
        )
      )}

      {/* Never-blank fallback */}
      {((tab === 'video' && !hasVideo) || (tab === 'avatar' && !hasAvatar)) && (
        <div className="p-5">
          <div className="fel-cuecard flex aspect-video w-full items-center justify-center rounded-xl bg-[#16161a]">
            <Dumbbell className="h-10 w-10 text-fel-quiet" />
          </div>
          {!hasVideo && (
            <p className="mt-3 text-center text-[11px] text-fel-dim">
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
