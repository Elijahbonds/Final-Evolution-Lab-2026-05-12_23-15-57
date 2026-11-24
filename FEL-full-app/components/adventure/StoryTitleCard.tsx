'use client';

// Look pass C2 (lane/look-world, 2026-11-24; docs/LOOK-PASS-AUDIT.md finding 8): the story's READY screen was a dense monospace
// table of every control under a one-line title. With story.titleCard on it is a title card — the route's name, where you are in
// the story, the chapter's title large, START — and the same control table one tap away (CONTROLS). Every word is the stage's own
// (the route's title, the progress line, the chapter's title, the button's word, the way out): nothing is renamed or added but the
// CONTROLS / HIDE CONTROLS toggle. 0 = the screen as before (app/play/adventure/stage.tsx keeps it).

import { useState, type ReactNode } from 'react';

export { STORY_TITLE_CARD } from '@/lib/babylon/adventure/story/titleCard';

export interface StoryTitleCardProps {
  /** The route's name ("THE ADVENTURE"). */
  kicker: string;
  /** Where the story stands (the progress line, or the first chapter's title when that line is off). */
  line: string;
  /** The chapter's own title, when the progress line has one. */
  title: string | null;
  ready: boolean;
  /** START, CONTINUE or EXPLORE THE HUB. */
  word: string;
  back: ReactNode;
  err: string | null;
  onStart: () => void;
  /** The stage's control table (shown on CONTROLS). */
  controls: ReactNode;
}

/** The progress line is left out when the chapter's title already opens with it ("CHAPTER 1" over "Chapter 1 — …") (pure). */
export function lineRepeats(line: string, title: string | null): boolean {
  return !!title && title.trim().toUpperCase().startsWith(line.trim().toUpperCase()) && line.trim().length > 0;
}

export function StoryTitleCard({ kicker, line, title, ready, word, back, err, onStart, controls }: StoryTitleCardProps) {
  const [open, setOpen] = useState(false);
  const showLine = !lineRepeats(line, title);
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center overflow-y-auto p-4 font-sans"
      style={{ background: 'radial-gradient(ellipse at 50% 38%, rgba(0,229,255,0.14) 0%, rgba(0,0,0,0) 62%), linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.82) 100%)' }}
      data-testid="adventure-title-card">
      <div className="flex w-full max-w-md flex-col items-center gap-3 text-center">
        <p className="text-[12px] font-bold tracking-[0.4em] text-white/55">{kicker}</p>
        <p className={`text-[12px] font-bold tracking-[0.25em] text-[#00E5FF] ${showLine ? '' : 'sr-only'}`} data-testid="adventure-start-title">{line}</p>
        {title && (
          <h2 className="font-display text-3xl font-black uppercase leading-tight tracking-wide text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] sm:text-4xl"
            data-testid="adventure-start-chapter">{title}</h2>
        )}
        <div className="mt-1 h-px w-24 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        <button type="button" disabled={!ready} onClick={(e) => { e.currentTarget.blur(); onStart(); }} data-testid="adventure-start"
          className="mt-2 min-h-[48px] w-full max-w-[16rem] rounded-xl bg-[#00E5FF] px-8 py-3 text-base font-black tracking-wide text-black shadow-[0_0_24px_rgba(0,229,255,0.35)] transition disabled:opacity-40">
          {ready ? word : 'LOADING…'}
        </button>
        <div className="flex items-center gap-3">
          {back}
          <button type="button" onClick={(e) => { e.currentTarget.blur(); setOpen((v) => !v); }} aria-expanded={open} data-testid="adventure-controls-toggle"
            className="min-h-[44px] rounded border border-white/20 px-4 py-2 text-[12px] font-bold tracking-wide text-white/80">
            {open ? 'HIDE CONTROLS' : 'CONTROLS'}
          </button>
        </div>
        {err && <p className="text-red-400">{err}</p>}
      </div>
      {open && <div className="mt-4 flex w-full justify-center font-mono text-xs">{controls}</div>}
    </div>
  );
}
