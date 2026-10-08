'use client';

// The browser's Back in the middle of the screen asks first (SCREEN-FIX S-6, 2026-09-29).
//
// The screen's steps live in one page, so the browser's Back from any of them would leave the whole screen at once.
// While `active` (from the age question until the results), the page keeps ONE extra history entry for its own address,
// holding Next's own history state so Next's router treats a Back onto the page's first entry as a stay on the same
// page. A Back then lands on that first entry, and the page asks "Leave the screen?": "Keep going" puts the extra entry
// back; "Leave" goes back once more, out of the screen. A Back while not active (the start card, the pain stop) goes
// straight on out. No beforeunload prompt anywhere: a reload or a closed tab is never nagged.
import { useCallback, useEffect, useRef, useState } from 'react';

export function useLeaveGuard(active: boolean): { asking: boolean; stay: () => void; leave: () => void } {
  const [asking, setAsking] = useState(false);
  const pushed = useRef(false);          // the extra entry is on top of the page's own one
  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);

  const push = useCallback(() => {
    try { window.history.pushState({ ...(window.history.state ?? {}), felScreenGuard: true }, ''); pushed.current = true; } catch { /* no history API */ }
  }, []);

  useEffect(() => {
    if (active && !pushed.current) push();
  }, [active, push]);

  useEffect(() => {
    const onPop = () => {
      if (!pushed.current) return;         // not our entry: a move Next made
      pushed.current = false;              // the Back took us off the extra entry
      if (activeRef.current) setAsking(true);
      else window.history.back();          // nothing to lose here: go on out
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const stay = useCallback(() => { setAsking(false); push(); }, [push]);
  const leave = useCallback(() => { setAsking(false); window.history.back(); }, []);
  return { asking, stay, leave };
}
