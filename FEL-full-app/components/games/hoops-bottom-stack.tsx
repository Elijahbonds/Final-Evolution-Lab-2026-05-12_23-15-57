'use client';
// hoops-p08 (2026-11-12): THE 1v1 / 3v3 BOTTOM STACK. The shot meter (bottom 6 rem), the pass chip (4.25 rem), the hint line (2.5 / 4
// rem) and the MC's line (14 % of the stage) were four layers placed on their own, and on a phone they were drawn over each other and
// over the touch deck (docs/HOOPS-AAA-GAP-SHOW.md 3.5: "In 3v3 three layers of text stack there at once"). They are one column now,
// in the order they are read, growing up from one slot — the same cure the dunk host's bottom stack took (WAVE 3, dunk-babylon.tsx) —
// so no length, size or zoom can lay one on another. The slot sits above the touch deck on an upright phone (narrower than 640 px,
// where the deck's two columns fill the bottom 17.5 rem) and 2.5 rem up everywhere else.
import type { ReactNode } from 'react';
import { HUD_PLATE, HudText, LINE_CLAMP_STYLE, PHONE_THUMB_GAP_CLASS, hudColor, type HudSize } from './tv-hud';

/** Where the column starts: above the deck on an upright phone, near the bottom otherwise (the dunk host's PAD_LIFT). */
export const HOOPS_STACK_LIFT = 'clamp(2.5rem, calc((640px - 100vw) * 999), 17.5rem)';

/** The rows, lowest first, each with a stable key. A falsy row takes no room. */
export function HoopsBottomStack({ rows }: { rows: ReadonlyArray<readonly [string, ReactNode]> }) {
  const live = rows.filter(([, r]) => !!r);
  if (!live.length) return null;
  return (
    <div data-hoops-bottom className="pointer-events-none absolute inset-x-0 top-0 flex flex-col-reverse items-center gap-[0.35rem] px-3" style={{ bottom: HOOPS_STACK_LIFT }}>
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
