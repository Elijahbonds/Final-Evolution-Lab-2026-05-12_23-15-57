'use client';
// THE PERF TAB (device-perf, owner 2026-11-12; docs/PHONE-PERF-CHECK.md). Mounted once for every /play route by app/play/layout.tsx,
// beside the feel panel, and behind the SAME gate: it renders nothing unless the server opened the owner tools for this user
// (GET /api/feel-panel → { enabled: true }: FEEL_PANEL_ENABLED and FEEL_PANEL_USERS, or an admin; the feel panel asks, and
// lib/feel-panel/feel.ts holds the answer). For everyone else: no button, no overlay, and the readout code is never downloaded
// (it is imported only once the answer is yes). The overlay itself (lib/babylon/core/perfReadout.ts) opens only on a tap.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { getFeelState, getServerFeelState, subscribeFeel } from '@/lib/feel-panel/feel';

type ReadoutModule = typeof import('@/lib/babylon/core/perfReadout');

export function PerfReadoutTab() {
  const { userAllowed } = useSyncExternalStore(subscribeFeel, getFeelState, getServerFeelState);
  const [mod, setMod] = useState<ReadoutModule | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!userAllowed) return;
    let dead = false;
    let unsub: (() => void) | null = null;
    import('@/lib/babylon/core/perfReadout').then((m) => {
      if (dead) return;
      setMod(m);
      unsub = m.subscribeReadoutOpen(() => setOpen(m.isPerfReadoutOpen()));
      if (m.readoutWasOpen()) m.openPerfReadout();   // open before a reload in this tab (the engine switch): open again
      setOpen(m.isPerfReadoutOpen());
    }).catch(() => { /* no readout: nothing to show */ });
    return () => {
      dead = true;
      unsub?.();
      // leaving /play, or the gate closed: the overlay goes, and is remembered as it was for this tab
      import('@/lib/babylon/core/perfReadout').then((m) => m.closePerfReadout({ forget: false })).catch(() => {});
    };
  }, [userAllowed]);

  if (!userAllowed || !mod) return null;
  return (
    <button
      type="button"
      data-testid="perf-tab"
      aria-pressed={open}
      aria-label={open ? 'Close the performance readout' : 'Open the performance readout'}
      onClick={() => (open ? mod.closePerfReadout() : mod.openPerfReadout())}
      className={`fixed left-0 top-[calc(50%+52px)] z-[95] rounded-r-lg border border-l-0 px-1.5 py-3 font-mono text-[12px] font-bold uppercase tracking-[0.2em] [writing-mode:vertical-rl] ${open ? 'border-emerald-300/70 bg-emerald-400/90 text-black' : 'border-white/25 bg-black/70 text-white/80'}`}>
      PERF
    </button>
  );
}
