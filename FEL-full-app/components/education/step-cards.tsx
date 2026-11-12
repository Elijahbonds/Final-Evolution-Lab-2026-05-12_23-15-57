'use client';

// StepCards — a drill's steps as a row of short cards you swipe, or step through with "Next step" (PLAT-P04, 2026-10-27).
// The words are the book's (lesson-steps.ts splits a long step only between its own sentences). The row scrolls inside
// itself, so the page never scrolls sideways at 390 px. The dots say where you are; they are not buttons.

import { useCallback, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { TYPE } from '@/lib/design/type';
import type { StepCard } from './lesson-steps';
import { CHIP_BUTTON } from './look';

export function StepCards({ cards }: { cards: StepCard[] }) {
  const row = useRef<HTMLOListElement>(null);
  const [at, setAt] = useState(0);

  const onScroll = useCallback(() => {
    const el = row.current;
    if (!el) return;
    const kids = [...el.children] as HTMLElement[];
    let best = 0;
    let dist = Infinity;
    kids.forEach((k, n) => { const d = Math.abs(k.offsetLeft - el.offsetLeft - el.scrollLeft); if (d < dist) { dist = d; best = n; } });
    setAt(best);
  }, []);

  const next = useCallback(() => {
    const el = row.current;
    const k = el?.children[Math.min(cards.length - 1, at + 1)] as HTMLElement | undefined;
    if (!el || !k) return;
    el.scrollTo({ left: k.offsetLeft - el.offsetLeft, behavior: 'smooth' });
    setAt((n) => Math.min(cards.length - 1, n + 1));
  }, [at, cards.length]);

  if (!cards.length) return null;
  return (
    <div data-step-cards className="mt-4">
      <ol
        ref={row}
        onScroll={onScroll}
        aria-label="Steps"
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((c, n) => (
          <li
            key={n}
            data-step-card={n}
            className="fel-surface flex min-h-[132px] shrink-0 basis-[86%] snap-start flex-col gap-2 p-5 sm:basis-[70%]"
          >
            <span className={`${TYPE.label} text-fel-cyan`}>Step {c.step + 1}</span>
            <p className={`${TYPE.heading} normal-case tracking-normal text-white`}>{c.text}</p>
          </li>
        ))}
      </ol>
      {cards.length > 1 && (
        <div className="mt-3 flex min-h-11 items-center justify-between gap-3">
          <span aria-hidden className="flex gap-1.5">
            {cards.map((_, n) => (
              <span key={n} className={`h-1.5 rounded-full transition-all duration-300 ${n === at ? 'w-5 bg-fel-cyan' : 'w-1.5 bg-white/20'}`} />
            ))}
          </span>
          {at < cards.length - 1 && (
            <button type="button" onClick={next} data-step-next className={CHIP_BUTTON}>
              Next step <ArrowRight aria-hidden className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
