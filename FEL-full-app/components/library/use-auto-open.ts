'use client';

// AUTOPLAY (owner, 2026-10-27: "It should play automatically, don't make the platform confusing or hard to use").
// A drill demo opens by itself — no "watch" tap — the moment its box scrolls into view, so a results page with several
// cards starts each 3D stage only when the person reaches it (one phone, one stage at a time, not three at once).
// Where IntersectionObserver is missing, it opens straight away.
import { useEffect, useRef, useState } from 'react';

export function useAutoOpen<T extends Element>(initiallyOpen = false): { ref: React.RefObject<T>; open: boolean } {
  const ref = useRef<T>(null);
  const [open, setOpen] = useState(initiallyOpen);
  useEffect(() => {
    if (open) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') { setOpen(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setOpen(true); io.disconnect(); }
    }, { rootMargin: '120px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [open]);
  return { ref, open };
}
