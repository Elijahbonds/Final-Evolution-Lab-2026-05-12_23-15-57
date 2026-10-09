'use client';

import { useEffect, useRef, useState } from 'react';
import { readResume, writeResume, type ResumeStore } from '@/lib/books/bookResume';

export interface PlayerChapter {
  id: string;
  label: string;
  canPlay: boolean;
}

const browserStore: ResumeStore = {
  get: (key) => {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set: (key, value) => {
    try { localStorage.setItem(key, value); } catch { /* private mode */ }
  },
};

export function AudioPlayer({
  bookSlug,
  bookTitle,
  chapters,
  grant,
}: {
  bookSlug: string;
  bookTitle: string;
  chapters: PlayerChapter[];
  grant?: string | null;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingSeek = useRef<number | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const savedAt = useRef(0);

  const chapterKey = chapters.map((ch) => `${ch.id}:${ch.canPlay ? 1 : 0}`).join('|');
  useEffect(() => {
    const saved = readResume(browserStore, bookSlug);
    if (!saved) return;
    if (chapters.some((ch) => ch.id === saved.fileId && ch.canPlay)) {
      setActiveId(saved.fileId);
      pendingSeek.current = saved.positionSec;
    }
    // chapterKey stands in for the chapter list so a new array each render does not restart playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookSlug, chapterKey]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed, activeId]);

  async function play(fileId: string) {
    setError(null);
    setActiveId(fileId);
    const res = await fetch('/api/books/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bookSlug, fileId, grant: grant || undefined }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || typeof body?.url !== 'string') {
      setError(typeof body?.error === 'string' ? body.error : 'That chapter is not available yet.');
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = body.url;
    try {
      await audio.play();
    } catch {
      setError('Press play again to start audio.');
    }
  }

  function onLoaded() {
    const audio = audioRef.current;
    if (!audio || pendingSeek.current == null) return;
    audio.currentTime = pendingSeek.current;
    pendingSeek.current = null;
  }

  function onTime() {
    const audio = audioRef.current;
    if (!audio || !activeId) return;
    if (Math.abs(audio.currentTime - savedAt.current) < 2) return;
    savedAt.current = audio.currentTime;
    writeResume(browserStore, bookSlug, { fileId: activeId, positionSec: audio.currentTime });
  }

  function onEnded() {
    if (!activeId) return;
    const index = chapters.findIndex((ch) => ch.id === activeId);
    const next = chapters.slice(index + 1).find((ch) => ch.canPlay);
    if (next) void play(next.id);
  }

  const active = chapters.find((ch) => ch.id === activeId);

  return (
    <div id="sample" className="rounded-xl border border-white/10 bg-[#101010] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F5C518]">Audiobook</p>
          <p className="text-sm text-white">{active ? active.label : bookTitle}</p>
        </div>
        <button
          type="button"
          onClick={() => setSpeed((s) => (s === 1 ? 1.25 : s === 1.25 ? 1.5 : 1))}
          className="rounded-md border border-white/15 px-2 py-1 font-mono text-[11px] text-white/70"
        >
          {speed}×
        </button>
      </div>
      <audio
        ref={audioRef}
        controls
        preload="none"
        className="mt-3 w-full"
        onLoadedMetadata={onLoaded}
        onTimeUpdate={onTime}
        onEnded={onEnded}
      />
      {error ? <p className="mt-2 text-xs text-[#ff8b8b]">{error}</p> : null}
      <ol className="mt-3 max-h-64 space-y-1 overflow-auto">
        {chapters.map((ch, index) => (
          <li key={ch.id}>
            <button
              type="button"
              disabled={!ch.canPlay}
              onClick={() => play(ch.id)}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${
                ch.id === activeId ? 'bg-[#F5C518]/15 text-white' : 'text-white/75 hover:bg-white/5'
              } disabled:cursor-not-allowed disabled:text-white/30`}
            >
              <span>{index + 1}. {ch.label}</span>
              <span className="text-[10px] uppercase tracking-wider text-white/40">
                {ch.canPlay ? 'Play' : 'Locked'}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] text-white/35">Position is saved in this browser.</p>
    </div>
  );
}
