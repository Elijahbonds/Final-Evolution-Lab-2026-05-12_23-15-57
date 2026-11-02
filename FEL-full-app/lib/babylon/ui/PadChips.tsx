'use client';

// PAD CHIPS — who is holding which controller (CONTROLLER-UNIVERSAL-MULTI, 2026-09-14).
//
// A pad is invisible to the page until a button is pressed on it (Chrome's privacy rule), so the moment it becomes
// visible is the moment a player needs to SEE that it worked: a toast names the seat and the controller
// ("P2 · Switch Pro Controller connected"), then a quiet chip stays for as long as the pad is in. A controller the
// profile layer knows will not work on this device (the Switch 2 Pro over Bluetooth on iOS) says so on its chip
// instead of failing silently. Reads InputBus.onPads only — no gamepad access of its own.

import React, { useEffect, useRef, useState } from 'react';
import type { InputBus, PadInfo } from '../core/InputBus';

const TOAST_MS = 2600;

// CONTROLLER-TRY-FIX item 2 (C2, 2026-10-28): a host that already says "connected" elsewhere passes `toast={false}` (the dunk: its lobby line
// at the top-left, for 4 s), and one whose play screen has no room for a pill passes `quiet={false}` while a run is live (the dunk: the
// chip was a permanent second pill bottom-left). An `unsupported` warning ALWAYS shows. Defaults are the old behaviour for every other host.
/** PURE: what the chips draw — the toast (if this host shows one), the quiet chips (if shown now) and every `unsupported` warning (always);
 *  null = nothing at all. With the defaults it is the old rule: the toast, then a chip per pad. */
export function padChipsView(s: { pads: readonly PadInfo[]; toast: string | null; toastOn?: boolean; quiet?: boolean }): { toast: string | null; chips: PadInfo[]; warnings: PadInfo[] } | null {
  const toast = s.toastOn === false ? null : s.toast;
  const chips = s.quiet === false ? [] : [...s.pads];
  const warnings = s.pads.filter((p) => p.unsupported);
  return toast || chips.length || warnings.length ? { toast, chips, warnings } : null;
}

export function PadChips({ bus, className = 'left-3 bottom-3', toast: toastOn = true, quiet = true }: { bus: InputBus; className?: string; toast?: boolean; quiet?: boolean }) {
  const [pads, setPads] = useState<PadInfo[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const prev = useRef<PadInfo[]>([]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = bus.onPads((next) => {
      const was = prev.current;
      prev.current = next;
      setPads(next);
      const joined = next.find((p) => !was.some((w) => w.slot === p.slot && w.index === p.index));
      const left = was.find((w) => !next.some((p) => p.slot === w.slot && p.index === w.index));
      const line = joined ? `P${joined.slot + 1} · ${joined.name} connected`
        : left ? `P${left.slot + 1} · ${left.name} disconnected` : null;
      if (!line || was === next) return;
      setToast(line);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setToast(null), TOAST_MS);
    });
    return () => { off(); if (timer) clearTimeout(timer); };
  }, [bus]);

  const view = padChipsView({ pads, toast, toastOn, quiet });
  if (!view) return null;
  return (
    <div data-testid="pad-chips" className={`pointer-events-none absolute z-30 flex flex-col items-start gap-1 font-mono ${className}`}>
      {view.toast && (
        <span className="fel-panel px-3 py-1.5 text-sm font-bold text-[#00E5FF]">{view.toast}</span>
      )}
      <div className="flex flex-wrap items-center gap-1">
        {view.chips.map((p) => (
          <span
            key={p.slot}
            data-pad-chip={`P${p.slot + 1}`}
            className={`rounded-full border px-2 py-0.5 text-[10px] ${p.unsupported ? 'border-[#ffd75e]/60 text-[#ffd75e]' : 'border-[#22d3ee]/50 text-[#22d3ee]'}`}
            style={{ background: '#000000aa' }}
          >
            P{p.slot + 1} {p.name}
          </span>
        ))}
      </div>
      {view.warnings.map((p) => (
        <span key={`why-${p.slot}`} className="max-w-[320px] rounded bg-black/70 px-2 py-1 text-[10px] leading-snug text-[#ffd75e]">
          P{p.slot + 1}: {p.unsupported}
        </span>
      ))}
    </div>
  );
}
