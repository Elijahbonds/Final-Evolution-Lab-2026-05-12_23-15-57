'use client';

// The Adventure's dialogue box (ADVENTURE PLAN, "The dialogue and cutscene player": "A small React overlay draws the box
// and portrait"). It draws what the story's scene publishes (lib/babylon/adventure/story/uiBridge) and sends the
// player's tap / hold / choice back. A line from a placeholder chapter carries a PLACEHOLDER tag on screen (plan,
// "Placeholders": the owner's autobiography has not arrived; every placeholder is visibly one).
//
// Input: the pad and keyboard reach the scene through the mode (A / Space: tap to finish a line, hold to skip); this box
// adds the pointer: press on the box (a tap finishes the line, a hold skips the scene), a choice by click, a SKIP button.

import type { StoryDialogueSnapshot, StoryUiCommands } from '@/lib/babylon/adventure/story/uiBridge';

export function DialogueBox({ d, cmd }: { d: StoryDialogueSnapshot; cmd: StoryUiCommands }) {
  const shown = d.text.slice(0, Math.max(0, d.shown));
  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex justify-center px-4"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }} data-testid="adventure-dialogue">
      <div className="relative w-full max-w-2xl select-none rounded-xl border border-white/15 bg-black/80 p-4 font-sans text-white shadow-2xl backdrop-blur"
        role="dialog" aria-label={`${d.speaker} says`}
        onPointerDown={(e) => { if ((e.target as HTMLElement).closest('button')) return; cmd.press(); }}
        onPointerUp={(e) => { if ((e.target as HTMLElement).closest('button')) return; cmd.release(); }}
        onPointerCancel={() => cmd.release()}>
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-sm font-black" aria-hidden>
            {d.speaker.slice(0, 1).toUpperCase()}
          </span>
          <span className="text-sm font-black tracking-wide text-[#7dd3fc]">{d.speaker.toUpperCase()}</span>
          {d.placeholder && (
            <span className="rounded border border-amber-300/70 bg-amber-300/15 px-1.5 py-0.5 text-[9px] font-black tracking-[0.2em] text-amber-200"
              data-testid="adventure-placeholder-tag" title="Placeholder story text until the owner's chapters arrive">
              PLACEHOLDER
            </span>
          )}
          <button type="button" onClick={(e) => { e.currentTarget.blur(); cmd.skip(); }}
            className="ml-auto rounded px-2 py-0.5 text-[10px] font-bold tracking-widest text-white/60 hover:bg-white/10">SKIP ▸▸</button>
        </div>
        <p className="min-h-[3rem] text-base leading-snug" aria-live="off">{shown}<span className="opacity-0">{d.text.slice(shown.length)}</span></p>
        {d.choices && d.shown >= d.text.length && (
          <div className="mt-2 flex flex-col gap-1">
            {d.choices.map((c, i) => (
              <button key={c.id} type="button" onClick={(e) => { e.currentTarget.blur(); cmd.choose(i); }}
                className={`rounded-lg px-3 py-1.5 text-left text-sm font-bold ${i === d.choiceIndex ? 'bg-[#00E5FF] text-black' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                {c.text}
              </button>
            ))}
          </div>
        )}
        {d.hold01 > 0 && (
          <div className="absolute inset-x-4 bottom-1 h-0.5 overflow-hidden rounded bg-white/10" aria-hidden>
            <div className="h-full bg-white/70" style={{ width: `${Math.round(d.hold01 * 100)}%` }} />
          </div>
        )}
        <p className="mt-1 text-right text-[9px] tracking-widest text-white/35">TAP · HOLD TO SKIP</p>
      </div>
    </div>
  );
}
