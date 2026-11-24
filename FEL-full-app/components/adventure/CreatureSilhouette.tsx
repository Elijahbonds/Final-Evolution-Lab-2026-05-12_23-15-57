// Look pass C2 (lane/look-world, 2026-11-24; docs/LOOK-PASS-AUDIT.md finding 8): the partner picker showed each creature as a
// coloured dot. Until the owner's creature art exists (§7: "the story's creatures" and their card art are the owner's), each one is
// drawn as the SILHOUETTE of the body it has in the game today — the stand-in of lib/babylon/adventure/world/view.ts
// buildCreatureBody: a capsule body lying along its length with a round head at the front, top (seen from the side), in its
// element's colour, on a soft floor shadow. No new art and no new shape: the picture is the in-game body, so nothing is promised
// that the game does not show. Pure SVG, no files.

import type { Element } from '@/lib/babylon/adventure/contracts';

export function CreatureSilhouette({ color, size = 64, testId }: { color: string; size?: number; testId?: string }) {
  // the stand-in's side view to scale (view.ts buildCreatureBody, any stage: every size is k times these): the body a capsule 1.6k long
  // and 0.7k thick, its centre 0.55k up; the head 0.5k across, 0.75k forward and 0.95k up. 62.5 units to k (the body 100 units long),
  // the ground at y 72.
  const id = `sil-${color.replace('#', '')}`;
  return (
    <svg viewBox="-2 -6 126 86" width={size * 1.47} height={size} role="img" aria-hidden="true" data-testid={testId} className="block">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <ellipse cx="58" cy="74" rx="50" ry="5" fill="black" opacity="0.45" />
      {/* the body: a capsule lying along its length */}
      <rect x="8" y="16" width="100" height="44" rx="22" fill={`url(#${id})`} />
      {/* the head: front, top */}
      <circle cx="105" cy="13" r="15.6" fill={`url(#${id})`} />
      {/* a rim of light along the top, so it reads as a body and not a badge */}
      <path d="M 22 19 Q 52 14 84 18" stroke="white" strokeOpacity="0.35" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** The element colours the picker used for its dots (kept, so the silhouette is the same hue the dot was). */
export const ELEMENT_COLOR: Record<Element, string> = {
  fire: '#ea580c', water: '#0284c7', earth: '#a16207', wind: '#34d399', lightning: '#facc15', ice: '#7dd3fc', light: '#fde68a', shadow: '#7c3aed',
};
