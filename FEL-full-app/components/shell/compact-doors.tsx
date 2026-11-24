import type { ReactNode } from 'react';

/** The class that lays /play's doors out on a phone (look-screens A3, ui.compactAppHeader): two even columns, each door full width
 *  with its label free to take two lines; at 640 px and wider `display: contents`, so the doors flow in the hero's row as before. */
export const COMPACT_DOORS_CLASS =
  'grid w-full grid-cols-2 gap-2 sm:contents [@media(max-width:639px)]:[&>a]:w-full [@media(max-width:639px)]:[&>a]:text-left [@media(max-width:639px)]:[&>a]:leading-tight';

/** `on` false: the doors exactly as before (no element added). */
export function CompactDoors({ on, children }: { on: boolean; children: ReactNode }) {
  return on ? <div data-compact-doors className={COMPACT_DOORS_CLASS}>{children}</div> : <>{children}</>;
}
