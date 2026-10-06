'use client';
// components/create/previews.tsx — CREATE HUB step 3: the work, where it will appear. One preview per discipline:
//   music    a Now Playing card over a menu backdrop; an In-game toggle drops it to the bed level (-14 dB) under the
//            stadium crowd with a sample impact; the Dance pick banner when it carries a chart.
//   dance    the step timeline running on a FEL house song's clock (a 3D dancer is the Dance room's routine pick: routed).
//   art      the texture on its surface in a small Babylon scene.
//   scene    a playable round of the pack.
//   acting   the MC moment's caption with the line playing.
//   writing  the Story shelf card and the feed card.
//   cooking  the Fuel floor tile with its allergens.
//   fashion  the palette and pieces (the Closet avatar preview is lane/creator's: routed).
//   sport    the Signature moves block on the athlete card.
// NOTE: lane/soundtrack's NowPlayingCard reads the live player, not a draft, so this draws its own (DraftNowPlaying).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ArtPayloadBody } from '@/lib/creator/creative-card-types';
import { DANCE_LIBRARY } from '@/lib/modes/dance/choreography-engine';
import { SCENE_PROMPTS } from '@/lib/modes/acting/voice-capture';
import { FEL_SONGS, songPreviewUrl } from '@/lib/babylon/dance/felSongs';
import { PENDING_MEDIA } from '@/lib/create/flow';
import { BED_DB, activeStep, chartDifficulty, dbToGain, routineBeat } from '@/lib/create/preview';

const ArtPreview3D = dynamic(() => import('./art-preview-3d'), { ssr: false, loading: () => <div className="h-72 w-full animate-pulse rounded-xl bg-neutral-900" /> });

const Frame = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <figure className="space-y-2">
    <figcaption className="text-xs uppercase tracking-wide text-neutral-400">{label}</figcaption>
    {children}
  </figure>
);

function DraftNowPlaying({ title, creator, cover, playing, onToggle }: { title: string; creator: string; cover?: string; playing: boolean; onToggle: () => void }) {
  return (
    <div data-qa="now-playing" className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/70 p-3 backdrop-blur">
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cover && /^https:\/\//.test(cover) && <img src={cover} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-widest text-emerald-300">Now playing</div>
        <div className="truncate text-sm font-bold text-white">{title || 'Untitled'}</div>
        <div className="truncate text-xs text-white/60">by {creator}</div>
      </div>
      <button onClick={onToggle} aria-label={playing ? 'Pause' : 'Play'} className="h-10 w-10 rounded-full bg-white text-lg font-black text-black">{playing ? '❚❚' : '▶'}</button>
    </div>
  );
}

function MusicPreview({ art, url, title, creator }: { art: Extract<ArtPayloadBody, { kind: 'music' }>; url?: string; title: string; creator: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [stage, setStage] = useState<'menu' | 'game'>('menu');
  useEffect(() => {
    if (!url) return;
    const a = new Audio(url);
    a.loop = true;
    audio.current = a;
    a.onplay = () => setPlaying(true); a.onpause = () => setPlaying(false);
    return () => { a.pause(); audio.current = null; };
  }, [url]);
  useEffect(() => {
    const a = audio.current;
    if (a) a.volume = stage === 'menu' ? 1 : dbToGain(BED_DB);
    if (stage !== 'game') return;
    let stop = () => {};
    void import('@/lib/babylon/audio/SoundKit').then(({ SoundKit }) => {
      SoundKit.unlock(); SoundKit.startAmbient('stadium');
      const id = window.setInterval(() => SoundKit.play('impact'), 2400);
      stop = () => { window.clearInterval(id); SoundKit.stopAmbient(); };
    }).catch(() => {});
    return () => stop();
  }, [stage]);
  const toggle = () => { const a = audio.current; if (!a) return; if (a.paused) void a.play().catch(() => {}); else a.pause(); };
  const diff = art.chart ? chartDifficulty(art.chart, art.bpm) : null;
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([['menu', 'Menus and loading'], ['game', 'Under a game']] as const).map(([id, l]) => (
          <button key={id} onClick={() => setStage(id)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${stage === id ? 'bg-emerald-400 text-black' : 'bg-neutral-800 text-neutral-300'}`}>{l}</button>
        ))}
      </div>
      <Frame label={stage === 'menu' ? 'In the menus, full level' : `Under a game: ${BED_DB} dB, under the crowd and the hits`}>
        <div className={`relative h-56 overflow-hidden rounded-2xl p-4 ${stage === 'menu' ? 'bg-gradient-to-br from-neutral-900 via-indigo-950 to-black' : 'bg-gradient-to-b from-sky-900 via-emerald-900 to-neutral-900'}`}>
          {stage === 'menu' ? (
            <div className="space-y-2">
              {['PLAY', 'CREATE', 'CLOSET', 'STORY'].map((m) => <div key={m} className="w-40 rounded-lg bg-white/5 px-3 py-2 text-sm font-black tracking-widest text-white/70">{m}</div>)}
            </div>
          ) : (
            <div className="flex h-full items-start justify-between text-white/80">
              <span className="rounded bg-black/40 px-2 py-1 font-mono text-xs">HOME 21 · 18 AWAY</span>
              <span className="rounded bg-black/40 px-2 py-1 font-mono text-xs">Q4 0:42</span>
            </div>
          )}
          <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:w-80">
            <DraftNowPlaying title={title} creator={creator} cover={art.coverArtUrl} playing={playing} onToggle={toggle} />
          </div>
        </div>
      </Frame>
      {art.chart && diff && (
        <Frame label="On the Dance floor's song pick">
          <div className="rounded-xl bg-fuchsia-950/60 p-3 text-sm text-fuchsia-100">
            <span className="font-black">{title.toUpperCase() || 'YOUR SONG'}</span> · {art.bpm} BPM · {'★'.repeat(diff)}{'☆'.repeat(3 - diff)} · {art.chart.length} steps · by {creator}
          </div>
        </Frame>
      )}
      {!url && <p className="text-xs text-neutral-500">No audio on this page: pick the song again in step 1 to hear it.</p>}
    </div>
  );
}

function DancePreview({ art }: { art: Extract<ArtPayloadBody, { kind: 'dance' }> }) {
  const bpm = art.bpm ?? 96;
  const songs = useMemo(() => [...FEL_SONGS].sort((a, b) => Math.abs(a.bpm - bpm) - Math.abs(b.bpm - bpm)), [bpm]);
  const [songId, setSongId] = useState(songs[0]?.id ?? '');
  const [sec, setSec] = useState<number | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const song = songs.find((s) => s.id === songId) ?? songs[0];
  useEffect(() => {
    if (!song) return;
    const a = new Audio(songPreviewUrl(song.id));
    a.loop = true; audio.current = a;
    let raf = 0;
    const tick = () => { setSec(a.paused ? null : a.currentTime); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); a.pause(); };
  }, [song]);
  const total = Math.max(1, ...art.sequence.map((s) => s.beat + s.holdBeats));
  const at = song ? routineBeat(sec, song.bpm, art.sequence) : -1;
  const current = activeStep(at, art.sequence);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={songId} onChange={(e) => setSongId(e.target.value)} className="rounded bg-neutral-900 px-2 py-1.5 text-neutral-100">
          {songs.map((s) => <option key={s.id} value={s.id}>{s.title} · {s.bpm} BPM</option>)}
        </select>
        <button onClick={() => { const a = audio.current; if (a) (a.paused ? void a.play().catch(() => {}) : a.pause()); }} className="rounded-lg bg-fuchsia-500 px-3 py-1.5 text-xs font-bold text-black">Play / pause</button>
        <span className="text-xs text-neutral-500">Your routine is at {bpm} BPM; the floor plays it on the song&apos;s beat.</span>
      </div>
      <Frame label="Your routine on the beat">
        <div className="relative overflow-x-auto rounded-xl bg-neutral-900 p-3">
          <div className="relative h-14" style={{ width: `${Math.max(100, total * 16)}px` }}>
            {art.sequence.map((s, i) => {
              const on = i === current;
              const clip = DANCE_LIBRARY.find((c) => c.id === s.clipId);
              return (
                <div key={i} className={`absolute top-1 h-12 overflow-hidden rounded-md px-1 text-[10px] font-bold leading-tight transition ${on ? 'bg-fuchsia-400 text-black' : 'bg-fuchsia-900/60 text-fuchsia-100'}`}
                  style={{ left: `${s.beat * 16}px`, width: `${Math.max(14, s.holdBeats * 16 - 2)}px` }}>
                  {clip?.name ?? s.clipId}{s.mirrored ? ' ⇋' : ''}
                </div>
              );
            })}
            {at >= 0 && <div className="absolute top-0 h-14 w-0.5 bg-white" style={{ left: `${at * 16}px` }} />}
          </div>
        </div>
      </Frame>
      <p className="text-xs text-neutral-500">A 3D dancer preview arrives with the Dance floor&apos;s routine pick (routed to the Dance room&apos;s lane).</p>
    </div>
  );
}

function ScenePreview({ art }: { art: Extract<ArtPayloadBody, { kind: 'scene' }> }) {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const q = art.questions[i];
  if (!q) return <p className="text-sm text-neutral-300">Round over: {score} of {art.questions.length}. <button className="underline" onClick={() => { setI(0); setScore(0); setPicked(null); }}>Play again</button></p>;
  return (
    <Frame label={`Spot the Scene, your pack · question ${i + 1} of ${art.questions.length}`}>
      <div className="rounded-xl bg-violet-950/60 p-4">
        <p className="mb-3 font-bold text-white">{q.prompt}</p>
        <div className="grid grid-cols-2 gap-2">
          {q.options.map((o, k) => (
            <button key={k} disabled={picked !== null} onClick={() => { setPicked(k); if (k === q.answer) setScore((s) => s + 1); window.setTimeout(() => { setPicked(null); setI((n) => n + 1); }, 900); }}
              className={`rounded-lg px-3 py-2 text-sm ${picked === null ? 'bg-white/10 text-white' : k === q.answer ? 'bg-emerald-500 text-black' : k === picked ? 'bg-red-500 text-white' : 'bg-white/5 text-white/50'}`}>{o}</button>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function ActingPreview({ art, url, creator }: { art: Extract<ArtPayloadBody, { kind: 'acting' }>; url?: string; creator: string }) {
  const prompt = SCENE_PROMPTS.find((p) => p.id === art.sceneId);
  return (
    <Frame label={`The MC moment: ${art.voiceLineIds[0]?.replace(/_/g, ' ') ?? 'a game moment'}`}>
      <div className="space-y-3 rounded-2xl bg-gradient-to-b from-amber-950 to-neutral-950 p-4">
        <div className="rounded-lg bg-black/60 px-3 py-2 text-center text-sm text-white">🎙 <b>{creator}</b>: “{prompt?.line ?? 'your line'}”</div>
        {url ? <audio src={url} controls className="w-full" /> : <p className="text-xs text-neutral-500">Record again in step 1 to hear it.</p>}
        <p className="text-xs text-neutral-500">Approved lines play as an occasional crowd-mic call, captioned with your name (wiring routed to the voice lane).</p>
      </div>
    </Frame>
  );
}

function WritingPreview({ art, title, creator }: { art: Extract<ArtPayloadBody, { kind: 'writing' }>; title: string; creator: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Frame label="Story: Community reads">
        <article className="rounded-2xl border border-lime-400/20 bg-neutral-900 p-4">
          <div className="text-[10px] uppercase tracking-widest text-lime-300">Community read</div>
          <h3 className="mt-1 text-lg font-black text-white">{title || 'Untitled'}</h3>
          <p className="mt-2 line-clamp-5 whitespace-pre-line text-sm text-neutral-300">{art.text}</p>
          <p className="mt-2 text-xs text-neutral-500">by {creator}</p>
        </article>
      </Frame>
      <Frame label="Knowledge Feed: Community (routed)">
        <div className="rounded-2xl bg-neutral-800 p-4 text-sm text-neutral-200">
          <p className="line-clamp-4">{art.text}</p>
          <p className="mt-2 text-[11px] text-neutral-500">by @{creator.replace(/\s+/g, '').toLowerCase()}: FEL Creator Card</p>
        </div>
      </Frame>
    </div>
  );
}

function CookingPreview({ art, title, creator }: { art: Extract<ArtPayloadBody, { kind: 'cooking' }>; title: string; creator: string }) {
  return (
    <Frame label="Fuel floor: Community recipes (routed)">
      <div className="max-w-sm rounded-2xl bg-gradient-to-br from-rose-950 to-neutral-900 p-4">
        <h3 className="text-lg font-black text-white">{title || 'Recipe'}</h3>
        <p className="text-xs text-neutral-400">by {creator} · {art.ingredients.length} ingredients · {art.steps.length} steps</p>
        <div className="mt-2 flex flex-wrap gap-1">{art.fuelTags.map((t) => <span key={t} className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] text-rose-200">{t}</span>)}</div>
        <p className="mt-2 text-xs text-neutral-300">{art.allergens?.length ? <>Contains: <b>{art.allergens.join(', ')}</b></> : 'No allergens declared.'}</p>
        <p className="mt-1 text-[10px] text-neutral-500">Allergens are chef-declared from the ingredients, not tested.</p>
      </div>
    </Frame>
  );
}

function FashionPreview({ art, title }: { art: Extract<ArtPayloadBody, { kind: 'fashion' }>; title: string }) {
  return (
    <Frame label="Your look (the Closet avatar preview is routed to the Closet's lane)">
      <div className="max-w-sm rounded-2xl bg-neutral-900 p-4">
        <h3 className="font-black text-white">{title || 'Look'}</h3>
        <div className="mt-2 flex gap-1">{art.palette.map((c) => <span key={c} className="h-6 w-6 rounded-full" style={{ background: c }} />)}</div>
        <ul className="mt-2 text-xs text-neutral-300">{art.wearableIds.map((w) => <li key={w}>· {w.replace(/_/g, ' ')}</li>)}</ul>
      </div>
    </Frame>
  );
}

function SportPreview({ art, title, creator }: { art: Extract<ArtPayloadBody, { kind: 'sport' }>; title: string; creator: string }) {
  return (
    <Frame label="Your athlete card: Signature moves">
      <div className="max-w-sm rounded-2xl border border-orange-400/30 bg-neutral-950 p-4">
        <div className="text-[10px] uppercase tracking-widest text-orange-300">Signature move</div>
        <div className="mt-1 text-lg font-black text-white">{art.signatureMoveId || title || 'Your move'}</div>
        <div className="text-xs text-neutral-400">{title} · {creator}</div>
      </div>
    </Frame>
  );
}

export default function Preview({ art, title, creator, previewUrl }: { art: ArtPayloadBody; title: string; creator: string; previewUrl?: string }) {
  switch (art.kind) {
    case 'music': return <MusicPreview art={art} url={previewUrl} title={title} creator={creator} />;
    case 'dance': return <DancePreview art={art} />;
    case 'art': return <Frame label={`On a ${art.appliedSurface}: drag to turn it`}><ArtPreview3D image={art.canvasDataUrl} surface={art.appliedSurface} /></Frame>;
    case 'scene': return <ScenePreview art={art} />;
    case 'acting': return <ActingPreview art={art} url={previewUrl ?? (art.performanceUrl.startsWith(PENDING_MEDIA) ? undefined : art.performanceUrl)} creator={creator} />;
    case 'writing': return <WritingPreview art={art} title={title} creator={creator} />;
    case 'cooking': return <CookingPreview art={art} title={title} creator={creator} />;
    case 'fashion': return <FashionPreview art={art} title={title} />;
    case 'sport': return <SportPreview art={art} title={title} creator={creator} />;
  }
}
