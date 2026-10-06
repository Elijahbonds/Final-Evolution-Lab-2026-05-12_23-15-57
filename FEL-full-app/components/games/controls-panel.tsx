'use client';

// ControlsPanel — the CONTROLS screen: on the READY card before START, and on the pause (controls-screen, console-view
// lane, 2026-10-06). One panel for every mode, filled from the mode's own button map (lib/ui/controlsScreen.ts).
//
// Owner, verbatim: "Can we take off that wall of text when the game starts, maybe have that show as a beginning screen
// for the controls." Picks: during play nothing; before START this screen, and pausing shows the same one; every mode.
//
// What it shows: the rows for the device in use — a connected pad, else a touch screen, else the keys (pickDevice) — with
// a chooser on READY to read another device's list; then the mode's own words (its static hint, split into lines),
// which the harness now keeps off the play screen (lib/babylon/ui/staticControls.ts).
//
// SPANS ONLY: on the pause the panel sits inside PausedLayer's full-screen <button>, where a <div> or a nested <button>
// is invalid — so there it has no chooser (`chooser={false}`), and every box is a span with a display class.
// No z-index anywhere (pausedLayer.scan.test holds the pause to that).
//
// FIT (controls-screen-2, 2026-10-06). Owner: "Yes to both proposed fixes for texts …" — a pad cannot scroll, so the list
// has to fit. The curated short lists (lib/babylon/ui/panelLines.ts) make every mode fit at 844x390, 1280x720 and
// 1080p; this is the net under them for a size or a state nobody measured (a body player's longer list, a 932x430
// phone): when the box still cuts something, the rows and lines step down in size — never below FIT_MIN (0.85) of it —
// until it all shows. It reads the box, so it re-runs when the box changes (a rotate, the body's card opening above it).

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { sessionStore } from '@/lib/babylon/core/sessionStore';
import { CONTROLS_DEVICES, DEVICE_LABEL, controlsSheet, detectDevice, fitScale, type ControlsDevice } from '@/lib/ui/controlsScreen';

/** How much of the panel's content its box cuts off: the panel's own overflow and its lines' scroll box. */
function cutPx(panel: HTMLElement): number {
  const lines = panel.querySelector<HTMLElement>('[data-controls-lines]');
  return Math.max(panel.scrollHeight - panel.clientHeight, lines ? lines.scrollHeight - lines.clientHeight : 0);
}

// useLayoutEffect warns on the server (the splash renders there): the fit is a browser-only measure anyway
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function ControlsPanel({ modeId, hint, chooser = true, className = '' }: {
  modeId: string;
  /** The line the host was built with, for a mode that writes no static hint of its own (board / timing hosts). */
  hint?: string;
  /** READY: the device chooser. The pause: none (the panel is inside the pause's button). */
  chooser?: boolean;
  className?: string;
}) {
  const view = useSyncExternalStore(sessionStore.subscribe, sessionStore.view, sessionStore.view);
  const body = view.body !== 'off';
  const [device, setDevice] = useState<ControlsDevice>(() => detectDevice());
  useEffect(() => {
    // a pad plugged in (or first pressed) while the card is up is the device in use
    const on = (): void => setDevice('pad');
    const off = (): void => setDevice(detectDevice());
    window.addEventListener('gamepadconnected', on);
    window.addEventListener('gamepaddisconnected', off);
    return () => { window.removeEventListener('gamepadconnected', on); window.removeEventListener('gamepaddisconnected', off); };
  }, []);
  const sheet = useMemo(() => controlsSheet(modeId, device, { body, fallback: hint }), [modeId, device, body, hint]);
  const ref = useRef<HTMLSpanElement>(null);
  useIsoLayoutEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    // straight onto the element, not React state: a re-render per step would be a loop through the layout
    const apply = (s: number): void => { panel.style.setProperty('--fel-controls-fit', String(s)); panel.dataset.controlsFit = String(s); };
    const fit = (): void => apply(fitScale((s) => { apply(s); return cutPx(panel) > 1; }));
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    // its box and the column it sits in (a rotate, the body's card opening above it). A fit ends on the size it started
    // from, so it does not wake the observer again.
    const ro = new ResizeObserver(() => fit());
    ro.observe(panel);
    if (panel.parentElement) ro.observe(panel.parentElement);
    return () => ro.disconnect();
  }, [sheet]);
  if (!sheet.rows.length && !sheet.lines.length) return null;

  return (
    <span ref={ref} data-controls-panel={device}
      // READY starts the game on a pointer-down anywhere that is not a button: reading (or finger-scrolling) the list
      // must not. On the pause a tap still resumes (the layer's click), which is what its headline says.
      onPointerDown={chooser ? (e) => e.stopPropagation() : undefined}
      className={`flex w-[min(30rem,92vw)] min-h-0 flex-col gap-1.5 rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-left ${className}`}>
      <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-[10px] font-black tracking-[0.3em] text-white/70">CONTROLS</span>
        {chooser ? (
          <span className="flex gap-1" role="group" aria-label="controls for">
            {CONTROLS_DEVICES.map((d) => (
              <button key={d} type="button" aria-pressed={d === device}
                onClick={(e) => { e.currentTarget.blur(); setDevice(d); }}
                className={`rounded-full border px-2 py-0.5 text-[9px] font-black tracking-wider transition ${d === device ? 'border-white bg-white text-black' : 'border-white/25 text-white/70 hover:bg-white/10'}`}>
                {DEVICE_LABEL[d]}
              </button>
            ))}
          </span>
        ) : (
          <span className="text-[9px] font-black tracking-wider text-white/50">{DEVICE_LABEL[device]}</span>
        )}
      </span>
      {sheet.rows.length > 0 && (
        <span data-controls-rows className="[zoom:var(--fel-controls-fit,1)] grid grid-cols-[auto_1fr_auto_1fr] gap-x-3 gap-y-0.5">
          {sheet.rows.map((r) => (
            <span key={`${r.input}-${r.action}`} className="contents">
              <span className="whitespace-nowrap font-mono text-[11px] font-black text-[#22d3ee]">{r.input}</span>
              <span className="font-mono text-[11px] text-white/85">{r.action}</span>
            </span>
          ))}
        </span>
      )}
      {sheet.lines.length > 0 && (
        <span data-controls-lines className="[zoom:var(--fel-controls-fit,1)] block min-h-0 overflow-y-auto border-t border-white/10 pt-1.5 [scrollbar-width:thin]">
          {sheet.lines.map((l) => (
            <span key={l} className="block pl-3 -indent-3 font-mono text-[10px] leading-snug text-white/75">· {l}</span>
          ))}
        </span>
      )}
    </span>
  );
}
