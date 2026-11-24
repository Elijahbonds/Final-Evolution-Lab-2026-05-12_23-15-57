'use client';
// hoops-p08 (2026-11-12): THE 1v1 / 3v3 BOTTOM STACK. The shot meter (bottom 6 rem), the pass chip (4.25 rem), the hint line (2.5 / 4
// rem) and the MC's line (14 % of the stage) were four layers placed on their own, and on a phone they were drawn over each other and
// over the touch deck (docs/HOOPS-AAA-GAP-SHOW.md 3.5: "In 3v3 three layers of text stack there at once"). They are one column now,
// in the order they are read, growing up from one slot — the same cure the dunk host's bottom stack took (WAVE 3, dunk-babylon.tsx) —
// so no length, size or zoom can lay one on another. The slot sits above the touch deck on an upright phone (narrower than 640 px,
// where the deck's two columns fill the bottom 17.5 rem) and 2.5 rem up everywhere else.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HUD_FONT_CLASS, HUD_PLATE, HudText, LINE_CLAMP_STYLE, PHONE_THUMB_GAP_CLASS, hudColor, type HudSize } from './tv-hud';
import { hoopsRowZone, LINE_SLOT_TOP } from '@/lib/ui/hudZones';
import { useSlot, useUprightZones } from './hud-zones';

/** look-screens A2: the hint in the deck's slot may take three lines (the slot is 150 px wide, 72 px tall). */
export const DECK_HINT_CSS = '[data-hoops-deck-hint] [data-hud-line] > span{-webkit-line-clamp:3!important;max-width:150px}';
/** look-screens A2: in the line slot the MC's line is at most two lines (the full line is on the caption bus and in CC). */
export const LINE_SLOT_CSS = '[data-hoops-zone="line"] [data-mic-line],[data-dunk-zone="line"] [data-mic-line]{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}';

/** Where the column starts: above the deck on an upright phone, near the bottom otherwise (the dunk host's PAD_LIFT). */
export const HOOPS_STACK_LIFT = 'clamp(2.5rem, calc((640px - 100vw) * 999), 17.5rem)';

/** How far (px) the stage behind `ref` runs past the bottom of the screen — an upright phone under the shell's header. The touch deck
 *  lifts itself into view by that much (TouchOverlay fitDeck); a bottom column has to as well, or its rows sit under the deck. */
export function useBelowFold(ref: { current: HTMLElement | null }, on = true): number {
  const [below, setBelow] = useState(0);
  const read = (): void => {
    const stage = ref.current?.parentElement?.getBoundingClientRect();
    if (!stage) return;   // not on screen yet: read again on the render that shows it
    const b = Math.max(0, Math.round(stage.bottom - window.innerHeight));
    setBelow((v) => (v === b ? v : b));
  };
  useEffect(() => { if (on) read(); });   // every render: the column may have just appeared (one rect read, no state change unless it moved)
  useEffect(() => {
    if (!on) return;
    window.addEventListener('resize', read);
    window.addEventListener('scroll', read, { passive: true });
    return () => { window.removeEventListener('resize', read); window.removeEventListener('scroll', read); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read only touches the ref and the setter
  }, [on]);
  return below;
}

/** The rows, lowest first, each with a stable key. A falsy row takes no room. */
export function HoopsBottomStack({ rows }: { rows: ReadonlyArray<readonly [string, ReactNode]> }) {
  const live = rows.filter(([, r]) => !!r);
  const ref = useRef<HTMLDivElement>(null);
  const zones = useUprightZones();   // look-screens A2 (lib/ui/hudZones.ts): the upright phone's zones
  const deckEl = useSlot('deck');
  const below = useBelowFold(ref, live.length > 0 && !zones);
  if (!live.length) return null;
  if (zones) {
    // THE UPRIGHT ZONES: the hint goes into the touch deck's slot (where the ghost d-pad was: the camera's bottom band, under no
    // body); the call, the MC's line and the shot meter go to the line slot under the top strip, read top-down — above the
    // bodies the camera stands right over the deck, instead of on them. With no deck slot (a deck with a live d-pad) the hint
    // heads the line slot too.
    const deck = deckEl ? live.filter(([k]) => hoopsRowZone(k) === 'deck') : [];
    const lines = live.filter((r) => !deck.includes(r)).reverse();
    return (
      <>
        {deck.length > 0 && deckEl && createPortal(
          <div data-hoops-deck-hint className={`absolute bottom-0 left-0 flex w-[150px] flex-col items-start gap-1 text-left text-white ${HUD_FONT_CLASS}`}>
            <style dangerouslySetInnerHTML={{ __html: DECK_HINT_CSS }} />
            {deck.map(([k, r]) => <div key={k} className="flex w-full justify-start">{r}</div>)}
          </div>, deckEl)}
        {lines.length > 0 && (
          <div ref={ref} data-hoops-bottom data-hoops-zone="line" className="pointer-events-none absolute inset-x-0 flex flex-col items-center gap-[0.35rem] px-3" style={{ top: LINE_SLOT_TOP }}>
            <style dangerouslySetInnerHTML={{ __html: LINE_SLOT_CSS }} />
            {lines.map(([k, r]) => <div key={k} className="flex w-full justify-center">{r}</div>)}
          </div>
        )}
      </>
    );
  }
  return (
    <div ref={ref} data-hoops-bottom className="pointer-events-none absolute inset-x-0 top-0 flex flex-col-reverse items-center gap-[0.35rem] px-3" style={{ bottom: below ? `calc(${HOOPS_STACK_LIFT} + ${below}px)` : HOOPS_STACK_LIFT }}>
      {live.map(([k, r]) => <div key={k} className="flex w-full justify-center">{r}</div>)}
    </div>
  );
}

/** One line of the stack on the HUD plate (HudLine's look, in the column's flow instead of a layer of its own). */
export function StackLine({ text, size = 'caption', alpha = 0.8 }: { text: string; size?: HudSize; alpha?: number }) {
  if (!text) return null;
  return (
    <span data-hud-line className={`max-w-[min(92%,980px)] text-center ${PHONE_THUMB_GAP_CLASS}`}>
      <HudText as="span" size={size} style={{ color: hudColor('text', alpha), background: HUD_PLATE.background, border: HUD_PLATE.border, borderRadius: HUD_PLATE.radius, padding: '0.2em 0.75em', display: 'inline-block', ...LINE_CLAMP_STYLE }}>{text}</HudText>
    </span>
  );
}
