// CaptionRegion — the surface M82's caption bus has been writing into nowhere.
//
// MEASURED ON THE DEPLOYED BUILD, 2026-07-28, across dunk, karate, onevone and
// tennis:
//
//   aria-live regions   0
//   role="status"       0
//   .sr-only            0
//
// **Zero, in every mode.** M82 built `captions.cue()`, M94 wired `kit.sound()`
// so that every sound carries its caption, and M92 gave all eleven tells a
// caption string. None of it can reach a player, because nothing renders it and
// no assistive technology is told anything is happening.
//
// This file is about forty lines and it is the entire gap. That is worth
// stating plainly: the accessibility work in this project is not missing, it is
// unplugged.
//
// TWO THINGS THAT ARE EASY TO GET WRONG HERE
//
// 1. `aria-live="assertive"` interrupts whatever the screen reader is saying.
//    Using it for routine feedback makes the game unusable with a screen
//    reader — every scored point cuts off the sentence before it. Only an
//    urgent cue gets `assertive`; everything else is `polite`.
//
// 2. A live region must exist in the DOM BEFORE the text changes. Mounting a
//    region and filling it in the same tick is not announced by most screen
//    readers. The region is therefore always rendered, and only its contents
//    change.

import { useEffect, useState } from 'react';
import { captions, type Caption, type CueImportance } from '../core/captions';

/** Importances that justify interrupting the screen reader. */
const ASSERTIVE: ReadonlySet<CueImportance> = new Set<CueImportance>(['critical']);

export interface CaptionRegionProps {
  /** Show the captions on screen as well as announcing them. */
  visible?: boolean;
  /** Max lines kept on screen. Older ones fall off. */
  maxLines?: number;
}

export function CaptionRegion({ visible = true, maxLines = 3 }: CaptionRegionProps) {
  const [lines, setLines] = useState<Caption[]>([]);

  // `CaptionBus.visible()` returns CRITICAL FIRST. Taking the tail would drop
  // exactly the cues a player must act on and keep the ambient ones.
  useEffect(() => captions.subscribe((all) => setLines(all.slice(0, maxLines))), [maxLines]);

  const urgent = lines.filter((c) => ASSERTIVE.has(c.importance));
  const routine = lines.filter((c) => !ASSERTIVE.has(c.importance));

  return (
    <>
      {/* Both regions are ALWAYS mounted, empty or not — a live region created
          at the same moment its text appears is not announced. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="sr-only"
        data-fel-captions="polite"
      >
        {routine.map((c) => c.text).join('. ')}
      </div>
      <div
        aria-live="assertive"
        aria-atomic="true"
        role="alert"
        className="sr-only"
        data-fel-captions="assertive"
      >
        {urgent.map((c) => c.text).join('. ')}
      </div>

      {visible && lines.length > 0 && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-[210px] z-40 flex flex-col
                     items-center gap-1 px-4 sm:bottom-14"
          aria-hidden="true"      /* the live regions above do the announcing */
        >
          {lines.map((c) => (
            <span
              key={c.id}
              className="max-w-[92%] rounded-md bg-black/78 px-3 py-1 text-center font-mono
                         text-[13px] leading-snug text-white shadow-lg"
            >
              {c.text}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * The class the visible captions need, for a stylesheet that lacks Tailwind's.
 *
 * `sr-only` has to keep the element in the accessibility tree — `display:none`
 * and `visibility:hidden` both remove it, and a hidden live region announces
 * nothing at all. This is the standard clip-rect technique, included because
 * getting it wrong looks identical to getting it right.
 */
export const SR_ONLY_CSS = `
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
`;
