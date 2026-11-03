'use client';

// PauseButton — a pause a thumb can reach (lane/gameplay-clean, 2026-10-28).
//
// Owner: "All tools need to be accessible, easy to use." The gameplay-clean audit (docs/GAMEPLAY-CLEAN-AUDIT.md) found
// that a pad (START) and a keyboard (ESC) could pause every mode, but a phone could not: no mode drew a pause on the
// screen, and the CONTROLS panel's touch list had no PAUSE row. The only way to stop a game on a phone was to leave it
// or to switch apps.
//
// HOW IT PAUSES: exactly as the keyboard does. It sends ESC to the window, which the running InputBus reads as START
// (lib/babylon/core/InputBus.ts KEYMAP), and the harness pauses a playing game on START and resumes a paused one on
// any button (ModeHarness onInput) — so there is one pause path for every device, and no mode file knows this exists.
// It shows only while a harness game is playing or paused (sessionStore's phase): never on READY, the end card, or a
// legacy page with no harness. It blurs itself after a tap, because a focused button is pressed again by SPACE — the
// charge key in every mode (the same trap boot-splash.tsx's TAP TO START documents).

import { useSyncExternalStore } from 'react';
import { Pause, Play } from 'lucide-react';
import { sessionStore } from '@/lib/babylon/core/sessionStore';

/** The touch list's name for it, on the CONTROLS panel (lib/ui/controlsScreen.ts). */
export const PAUSE_GLYPH = '❚❚';

/** Press START the way the keyboard does: ESC down and up on the window, where the InputBus listens. */
export function pressStart(target: Pick<Window, 'dispatchEvent'> = window): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  target.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));
}

export function PauseButton({ className = '' }: { className?: string }) {
  const view = useSyncExternalStore(sessionStore.subscribe, sessionStore.view, sessionStore.view);
  if (view.phase !== 'playing' && view.phase !== 'paused') return null;
  const paused = view.phase === 'paused';
  return (
    <button
      type="button"
      data-fel-pause
      aria-label={paused ? 'Resume' : 'Pause'}
      onClick={(e) => { e.currentTarget.blur(); pressStart(); }}
      className={`pointer-events-auto grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-black/50 text-white/80
                  backdrop-blur-md transition-colors hover:text-white fel-chrome-glass ${className}`}
    >
      {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
    </button>
  );
}
