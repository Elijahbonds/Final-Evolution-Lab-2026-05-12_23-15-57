import type { ReactNode } from 'react';

/** /play's doors on a phone (look-screens A3, ui.compactAppHeader): two even columns, each door full width with its label free to take
 *  two lines; at 640 px and wider `display: contents`, so the doors flow in the hero's row as before. `on` false: the doors exactly as
 *  before (no element added). */
export function CompactDoors({ on, children }: { on: boolean; children: ReactNode }) {
  return on
    ? <div data-compact-doors className="grid w-full grid-cols-2 gap-2 sm:contents [@media(max-width:639px)]:[&>a]:w-full [@media(max-width:639px)]:[&>a]:text-left [@media(max-width:639px)]:[&>a]:leading-tight">{children}</div>
    : <>{children}</>;
}
