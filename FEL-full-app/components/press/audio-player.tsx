'use client';

import { useEffect, useRef, useState } from 'react';
import { readResume, writeResume, type ResumeStore } from '@/lib/books/bookResume';
import { nextSpeed, requestStreamUrl, skipPosition, SKIP_SECONDS, streamUrlStale } from '@/lib/books/bookPlayer';

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

/**
 * The audiobook STREAM player (owner 2026-10-13: the store terms say stream only, no download).
 * - No URL is in the page before Play. Each play asks POST /api/books/stream for a short-lived inline URL
 *   (lib/books/bookPlayer.ts requestStreamUrl); an expired one is replaced on the next play or on a playback error,
 *   and the listener keeps their place.
 * - No download control anywhere: the <audio> is `controlsList="nodownload"`, its context menu is off, and there is no
 *   download link or button. (A browser cannot technically stop a determined person saving what it plays; see
 *   docs/BOOK-SHOP.md. Stream-only here means no download is offered.)
 * - Play/pause (native), back and forward 15 s, speed, chapter list, and the place is kept on this device.
 */
export function AudioPlayer({
  bookSlug,
  bookTitle,
  chapters,
}: {
  bookSlug: string;
  bookTitle: string;
  chapters: PlayerChapter[];
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingSeek = useRef<number | null>(null);
  const minted = useRef<{ at: number; expiresIn: number } | null>(null);
  const reloading = useRef(false);
  const lastErrorReload = useRef(0);
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

  /** Mint a fresh stream URL for this chapter and start it at `startAt`. The only place a URL reaches the page. */
  async function load(fileId: string, startAt: number | null) {
    if (reloading.current) return;
    reloading.current = true;
    setError(null);
    setActiveId(fileId);
    try {
      const result = await requestStreamUrl(fetch, bookSlug, fileId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const audio = audioRef.current;
      if (!audio) return;
      minted.current = { at: Date.now(), expiresIn: result.expiresIn };
      pendingSeek.current = startAt;
      audio.src = result.url;
      audio.playbackRate = speed;
      try {
        await audio.play();
      } catch {
        setError('Press play again to start audio.');
      }
    } finally {
      reloading.current = false;
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
    if (next) void load(next.id, null);
  }

  // Play pressed (or resumed after a pause): if the URL we hold is expired, or we never minted one (the saved place
  // was restored but nothing has been requested yet), get a fresh one and carry on from the same second.
  function onPlay() {
    const audio = audioRef.current;
    if (!audio || !activeId || reloading.current) return;
    const m = minted.current;
    if (!audio.getAttribute('src') || streamUrlStale(m ? m.at : null, m ? m.expiresIn : 0, Date.now())) {
      const resumeAt = audio.currentTime > 0 ? audio.currentTime : pendingSeek.current;
      audio.pause();
      void load(activeId, resumeAt);
    }
  }

  // A playback error mid-stream is usually the signed URL running out under a seek or a long buffer. Refresh once
  // (at most every 10 s) and resume where the listener was.
  function onError() {
    const audio = audioRef.current;
    if (!audio || !activeId || !audio.getAttribute('src')) return;
    const now = Date.now();
    if (now - lastErrorReload.current < 10_000) {
      setError('Playback stopped. Press play to try again.');
      return;
    }
    lastErrorReload.current = now;
    void load(activeId, audio.currentTime);
  }

  function skip(delta: number) {
    const audio = audioRef.current;
    if (!audio || !audio.getAttribute('src')) return;
    audio.currentTime = skipPosition(audio.currentTime, delta, audio.duration);
  }

  const active = chapters.find((ch) => ch.id === activeId);

  return (
    <div id="sample" className="rounded-xl border border-white/10 bg-[#101010] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F5C518]">Audiobook · stream only</p>
          <p className="text-sm text-white">{active ? active.label : bookTitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`Back ${SKIP_SECONDS} seconds`}
            onClick={() => skip(-SKIP_SECONDS)}
            className="rounded-md border border-white/15 px-2 py-1 font-mono text-[11px] text-white/70"
          >
            −{SKIP_SECONDS}s
          </button>
          <button
            type="button"
            aria-label={`Forward ${SKIP_SECONDS} seconds`}
            onClick={() => skip(SKIP_SECONDS)}
            className="rounded-md border border-white/15 px-2 py-1 font-mono text-[11px] text-white/70"
          >
            +{SKIP_SECONDS}s
          </button>
          <button
            type="button"
            aria-label="Playback speed"
            onClick={() => setSpeed((s) => nextSpeed(s))}
            className="rounded-md border border-white/15 px-2 py-1 font-mono text-[11px] text-white/70"
          >
            {speed}×
          </button>
        </div>
      </div>
      <audio
        ref={audioRef}
        controls
        controlsList="nodownload noplaybackrate"
        onContextMenu={(e) => e.preventDefault()}
        preload="none"
        className="mt-3 w-full"
        onLoadedMetadata={onLoaded}
        onTimeUpdate={onTime}
        onEnded={onEnded}
        onPlay={onPlay}
        onError={onError}
      />
      {error ? <p className="mt-2 text-xs text-[#ff8b8b]" role="alert">{error}</p> : null}
      <ol className="mt-3 max-h-64 space-y-1 overflow-auto">
        {chapters.map((ch, index) => (
          <li key={ch.id}>
            <button
              type="button"
              disabled={!ch.canPlay}
              onClick={() => void load(ch.id, ch.id === activeId && !audioRef.current?.getAttribute('src') ? pendingSeek.current : null)}
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
      <p className="mt-2 text-[11px] text-white/35">Streamed from your library. Your place is saved on this device.</p>
    </div>
  );
}
