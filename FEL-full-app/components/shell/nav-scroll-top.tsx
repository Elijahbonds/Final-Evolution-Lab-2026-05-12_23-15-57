'use client';
// NavScrollTop — EVERY-SCREEN P5 (the rig: "/train/progress's title drawn under the top bar when you arrive from /train").
//
// Next's App Router scrolls a new page into view only when the top of its first element is OUT of the window: it leaves
// the page alone when that top is still inside it. The status rail is sticky (two rows on a phone, about 113 px), so a
// tap made after a short scroll (less than the rail's height) opened the next page still scrolled by that much, its title
// under the rail. On every in-app page change with no #hash, this finishes the job: when the new page's <main> starts
// below the scroll position but the window is not at the top, it goes to the top. A back or forward step keeps the
// position the browser restores; a #hash keeps its anchor; a page scrolled further than its own start is Next's to place.
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/** Whether the page should go to the top: scrolled a little, and the page's start still at or below that scroll. */
export function shouldScrollTop(scrollY: number, mainTop: number | null, hash: string, popped: boolean): boolean {
  if (popped || hash || scrollY <= 0 || mainTop == null) return false;
  return scrollY <= mainTop;
}

export function NavScrollTop() {
  const pathname = usePathname();
  const first = useRef(true);
  const popped = useRef(false);
  useEffect(() => {
    const onPop = () => { popped.current = true; };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const wasPop = popped.current;
    popped.current = false;
    // after Next's own scroll handling for the new page (its layout effect)
    const id = requestAnimationFrame(() => {
      const main = document.querySelector('main');
      const mainTop = main ? main.getBoundingClientRect().top + window.scrollY : null;
      if (shouldScrollTop(window.scrollY, mainTop, window.location.hash, wasPop)) window.scrollTo({ top: 0, behavior: 'auto' });
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);
  return null;
}
