'use client';
// LibraryDemo — LIBRARY-ANATOMY (2026-10-25): an exercise shown four ways, one tab each.
//
// Owner decision (2026-10-25): every exercise is demonstrated four ways — the 3D avatar, a coach video, the muscles on
// the 3D body, and text cues. This is the switcher the library's exercise sheet (and the card's quick links) open:
//   · Demo    — the athlete's own avatar doing it (exercise-stage.tsx), or, where no loop shows this variation
//               faithfully (lib/library/demo.ts demoFor), the cue card: never a wrong movement;
//   · Muscles — the same body with its clothes off and the muscles coloured (primary strong, secondary light), a
//               front/back toggle, and a legend that names every one (colour is never the only cue);
//   · Cues    — what to think about during the rep and what to watch for, big enough to read mid-set;
//   · Video   — only when a coach or FEL video is attached.
// Demo and Muscles share one stage, loaded the first time either is opened (Babylon and the body never load for a
// reader who stays on the cues) and kept while the sheet is open: the second tab is instant.
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Dumbbell, Eye, MessageSquareText, Play, RotateCcw, User } from 'lucide-react';
import type { LibraryCard } from '@/lib/library/server';
import { ANATOMY_PALETTE, anatomyLegend, initialSide, rgbHex, secondaryShown } from '@/lib/library/anatomy';
import { isBallClip } from '@/lib/library/demo';
import type { StageSide } from './exercise-stage';

const ExerciseStage = dynamic(() => import('./exercise-stage'), {
  ssr: false,
  loading: () => <p className="flex h-full items-center justify-center text-[12px] text-white/45">Loading your athlete…</p>,
});

export type DemoTab = 'demo' | 'muscles' | 'cues' | 'video';
export const DEMO_TAB_LABEL: Record<DemoTab, string> = { demo: 'Demo', muscles: 'Muscles', cues: 'Cues', video: 'Video' };

const threeDisabled = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_DISABLE_3D === '1';

/** A coach or FEL video URL → what plays it: a YouTube embed, a file the browser plays itself, or nothing. */
export function videoSource(raw: string | null | undefined): { kind: 'youtube'; src: string } | { kind: 'file'; src: string } | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    let id = '';
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
    else if (url.hostname.endsWith('youtube.com')) id = url.searchParams.get('v') || (url.pathname.startsWith('/shorts/') ? url.pathname.split('/')[2] ?? '' : '');
    if (id && /^[\w-]{6,20}$/.test(id)) return { kind: 'youtube', src: `https://www.youtube.com/embed/${id}?rel=0` };
    if (/\.(mp4|webm|m4v|mov)$/i.test(url.pathname)) return { kind: 'file', src: url.href };
    return null;
  } catch {
    return null;
  }
}

/** The tabs an entry has, in order (Video only when a video exists). */
export function demoTabs(e: Pick<LibraryCard, 'demo'>): DemoTab[] {
  return videoSource(e.demo.videoUrl) ? ['demo', 'muscles', 'cues', 'video'] : ['demo', 'muscles', 'cues'];
}

const ICON: Record<DemoTab, typeof User> = { demo: User, muscles: Eye, cues: MessageSquareText, video: Play };

export function LibraryDemo({ entry, initialTab }: { entry: LibraryCard; initialTab?: DemoTab }) {
  const tabs = demoTabs(entry);
  const has3d = !threeDisabled;
  const clip = has3d ? entry.avatarClip : null;
  const [tab, setTab] = useState<DemoTab>(() => (initialTab && tabs.includes(initialTab) ? initialTab : clip ? 'demo' : 'cues'));
  const [stageOpened, setStageOpened] = useState(has3d && (tab === 'demo' ? !!clip : tab === 'muscles'));
  const legend = useMemo(() => anatomyLegend(entry), [entry]);
  const [side, setSide] = useState<StageSide>(() => initialSide(entry.muscleMap.primary));
  const video = videoSource(entry.demo.videoUrl);
  const [videoOn, setVideoOn] = useState(false);
  const secondary = rgbHex(secondaryShown());
  // the sheet's "Easier / Harder version" swaps the entry under the same switcher: the stage stays loaded and plays the new
  // one; the side, the video and a tab the new entry does not have start over
  const lastId = useRef(entry.id);
  useEffect(() => {
    if (lastId.current === entry.id) return;
    lastId.current = entry.id;
    setSide(initialSide(entry.muscleMap.primary));
    setVideoOn(false);
    setTab((t) => (demoTabs(entry).includes(t) ? t : 'cues'));
  }, [entry]);

  const choose = (t: DemoTab) => {
    setTab(t);
    if (has3d && (t === 'muscles' || (t === 'demo' && clip))) setStageOpened(true);
  };
  const stageView = tab === 'muscles' ? 'muscles' : 'demo';
  const stageShown = has3d && stageOpened && (tab === 'muscles' || (tab === 'demo' && !!clip));

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0c0c11]" data-testid="library-demo">
      <div role="tablist" aria-label="Ways to see this exercise" className="flex border-b border-white/[0.08]">
        {tabs.map((t) => {
          const Icon = ICON[t];
          return (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => choose(t)} data-testid={`demo-tab-${t}`}
              className={`flex min-h-[40px] flex-1 items-center justify-center gap-1.5 text-[11px] font-bold tracking-wide transition-colors ${tab === t ? 'bg-white/[0.06] text-[#00E5FF]' : 'text-white/45 hover:text-white/75'}`}>
              <Icon className="h-3.5 w-3.5" aria-hidden />{DEMO_TAB_LABEL[t]}
            </button>
          );
        })}
      </div>

      {/* the stage (Demo and Muscles share it; hidden, not unmounted, on the other tabs — its loop stops while hidden) */}
      {has3d && stageOpened && (
        <div className={stageShown ? 'relative' : 'hidden'}>
          <div className="aspect-[4/3] w-full bg-gradient-to-b from-[#0b0b12] to-[#05050a] sm:aspect-video">
            <ExerciseStage view={stageView} clip={clip} hold={entry.avatarHold} muscles={entry.muscleMap} side={side} />
          </div>
          {tab === 'demo' && (
            <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#00E5FF]">
              YOUR ATHLETE{entry.avatarHold != null ? ' · HOLD' : ''}
            </span>
          )}
          {tab === 'demo' && isBallClip(clip) && (
            <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] text-white/70" data-testid="ball-note">The ball isn&apos;t drawn here.</span>
          )}
          {tab === 'muscles' && (
            <div className="absolute right-2 top-2 flex overflow-hidden rounded-lg border border-white/15 bg-black/60 text-[11px] font-bold" role="group" aria-label="Which side of the body">
              {(['front', 'back'] as const).map((s) => (
                <button key={s} onClick={() => setSide(s)} aria-pressed={side === s} data-testid={`side-${s}`}
                  className={`min-h-[34px] px-3 ${side === s ? 'bg-white/15 text-white' : 'text-white/55'}`}>
                  {s === 'front' ? 'Front' : 'Back'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'demo' && !clip && (
        <div className="p-4" data-testid="demo-cue-card">
          <div className="flex items-center gap-3 rounded-xl bg-[#16161a] p-4">
            <Dumbbell className="h-8 w-8 shrink-0 text-white/30" aria-hidden />
            <div className="min-w-0 space-y-1">
              <p className="text-[12px] text-white/55">{threeDisabled ? '3D is off on this device.' : 'No 3D demo for this one yet. Follow the cues:'}</p>
              <ul className="space-y-0.5 text-[13px] text-white/85">{entry.cues.slice(0, 2).map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          </div>
        </div>
      )}

      {tab === 'muscles' && (
        <div className="space-y-2 p-3" data-testid="muscle-legend">
          {!has3d && <p className="text-[12px] text-white/50">3D is off on this device. The muscles this works:</p>}
          <ul className="grid grid-cols-1 gap-1.5 min-[380px]:grid-cols-2">
            {legend.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-[12px]">
                <span aria-hidden className="h-3 w-3 shrink-0 rounded-sm border border-black/40" style={{ background: m.tier === 'primary' ? ANATOMY_PALETTE.primary : secondary }} />
                <span className={m.tier === 'primary' ? 'text-white' : 'text-white/70'}>{m.label}</span>
                <span className="text-[10px] uppercase tracking-wide text-white/35">{m.tier === 'primary' ? 'Main' : 'Also'}{m.view !== 'both' && m.view !== side ? ` · ${m.view}` : ''}</span>
              </li>
            ))}
          </ul>
          {legend.some((m) => m.view !== 'both' && m.view !== side) && (
            <button onClick={() => setSide(side === 'front' ? 'back' : 'front')} className="inline-flex items-center gap-1 text-[11px] text-[#00E5FF]/80">
              <RotateCcw className="h-3 w-3" aria-hidden /> Turn to the {side === 'front' ? 'back' : 'front'}
            </button>
          )}
        </div>
      )}

      {tab === 'cues' && (
        <div className="space-y-3 p-4" data-testid="demo-cues">
          <div>
            <h5 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">Think about</h5>
            <ul className="space-y-1.5 text-[15px] leading-snug text-white">{entry.cues.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
          {entry.faults.length > 0 && (
            <div>
              <h5 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">Watch for</h5>
              <ul className="space-y-1 text-[13px] text-white/75">{entry.faults.slice(0, 2).map((f) => <li key={f.fault}>{f.fault}. <span className="text-[#00E5FF]/85">{f.fix}</span></li>)}</ul>
            </div>
          )}
        </div>
      )}

      {tab === 'video' && video && (
        videoOn || video.kind === 'file' ? (
          <div className="aspect-video w-full bg-black">
            {video.kind === 'youtube'
              ? <iframe src={video.src} className="h-full w-full" allow="encrypted-media; picture-in-picture" allowFullScreen title={`${entry.name} video`} />
              : <video src={video.src} className="h-full w-full" controls playsInline preload="metadata" title={`${entry.name} video`} />}
          </div>
        ) : (
          <button onClick={() => setVideoOn(true)} className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-[#16161a]">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#FF3366]/20"><Play className="h-6 w-6 text-[#FF3366]" aria-hidden /></span>
            <span className="text-sm text-white/55">Play the coach video</span>
          </button>
        )
      )}
    </div>
  );
}
