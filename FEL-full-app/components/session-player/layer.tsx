'use client';
// Layer — PLAT-P06 (2026-10-28): draws a full-screen layer (the player, a launcher sheet) at the end of <body>. Mounted
// inside a page whose <main> animates in (fel-fade makes a stacking context), a `fixed z-[70]` layer was stacked INSIDE
// that context, under the shell's tab bar (z-50) and status rail (z-40): the tab bar covered the player's one button
// (measured on the rig, 2026-10-28). Nothing until mounted on the client.
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Layer({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(typeof document !== 'undefined' ? document.body : null); }, []);
  return host ? createPortal(children, host) : null;
}
