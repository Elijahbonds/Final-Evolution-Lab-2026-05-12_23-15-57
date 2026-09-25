'use client';

// PausedLayer — the one PAUSED screen (movement play P3, step 4a, 2026-09-24).
//
// Every host used to draw its own copy of it (BACKLOG B16: thirteen, then sixteen, then twenty, each the same four
// lines), and a host that forgot — who-scene-it — froze on START with no word at all. BootSplash renders this on
// 'paused' now, so every host that shows the splash shows the pause the same way; who-scene-it, which has no splash,
// mounts it itself.
//
// MOVEMENT PLAY P3 (2026-09-24): why it reads the session. The body can pause a game now (lost while it is the one
// playing, BodySession) and bring one back (both hands up, held), so the screen under the headline says how: "Step
// back into frame, then raise both hands" while the camera cannot see you, "or raise both hands" with the hold's ring
// once it can, and nothing with the camera off — a pad or touch player sees the old screen: the same headline in the
// same place (the markup gained only `type="button"` and a centring span). A body walking back into the frame only
// changes this line; it never resumes by itself (plan §4.2).
//
// Stacking: the whole layer is a button with the old copy's exact classes — `absolute inset-0` and NO z-index — so it
// sits where every copy sat (BootSplash rendered it in the same place in the tree: straight after itself, where the
// copies were): over the canvas and the HUD drawn before it, under the shell's z-30 corner where the compact Body
// toggle and Leave live. The headline is pinned text (scripts/probes/_miss-retry.mts reads it).
//
// MOVEMENT PLAY P3 (2026-09-24, the step-4a review): why a missed frame no longer flickers the line. The session holds
// 'present' through a missed detection (BodySession PRESENT_HOLD_MS, the hold's own gap) and turns a stalled camera's
// last 'present' into 'absent', so the store tells the truth and the line follows it — no stall special case here. A
// hold in progress still counts as seen (the ring is the hold). And READY keeps its line's room whenever the camera is
// on (invisible while it has nothing to say), so the card does not move when the body steps in or out of frame.

import { useSyncExternalStore } from 'react';
import { sessionStore, type SessionView } from '@/lib/babylon/core/sessionStore';

export const PAUSED_HEADLINE = 'PAUSED — TAP TO RESUME';
/** The camera sees you: the hold resumes (the ring fills with it). Also the READY line, under TAP TO START. */
export const RAISE_HANDS_LINE = 'or raise both hands';
/** The camera cannot see you (or stopped sending frames): the hold needs a tracked body first. */
export const STEP_BACK_LINE = 'Step back into frame, then raise both hands';
/** The reader is still calibrating (the Body button was just switched on, or re-centred): the hold counts only once it
 *  has a still stand to measure from. On the pause and on READY, where calibrating mostly happens. */
export const CALIBRATING_LINE = 'Stand still, whole body in frame, then raise both hands';

/** A body line: its words, whether the hold's ring shows, and whether it is only holding its room (READY). */
export interface BodyLine { text: string; ring: boolean; shown: boolean }

/** A hold in progress is a body the camera sees: the ring is the hold, whatever one frame's presence says. */
const seen = (v: Pick<SessionView, 'body' | 'handsUp01'>): boolean => v.body === 'present' || v.handsUp01 > 0;

/**
 * The line under the PAUSED headline, from the session: null with the camera off. A body the camera sees gets the ring
 * (a body lost and found again too: that is the line changing, and the only thing a return does while paused);
 * one it cannot — absent, or a stalled camera (the session says 'absent' for it) — gets the step-back line.
 */
export function pausedLine(v: Pick<SessionView, 'body' | 'handsUp01'>): BodyLine | null {
  if (v.body === 'off') return null;
  if (v.body === 'calibrating') return { text: CALIBRATING_LINE, ring: false, shown: true };
  if (seen(v)) return { text: RAISE_HANDS_LINE, ring: true, shown: true };
  return { text: STEP_BACK_LINE, ring: false, shown: true };
}

/**
 * The line under READY's TAP TO START: null with the camera off (the old card). The hands-up START is said only once
 * the camera sees you (it wakes a calibrated body, BodySession); while it cannot, the same line holds its room
 * unseen, so the card never jumps when the body steps in or out of frame.
 */
export function readyLine(v: Pick<SessionView, 'body' | 'handsUp01'>): BodyLine | null {
  if (v.body === 'off') return null;
  if (v.body === 'calibrating') return { text: CALIBRATING_LINE, ring: false, shown: true };
  return { text: RAISE_HANDS_LINE, ring: true, shown: seen(v) };
}

/** The hands-up hold's progress (sessionStore's handsUp01, 0…1): it fills over the 800 ms hold (BodySession). */
export function HandsUpRing({ progress }: { progress: number }) {
  const p = Math.min(1, Math.max(0, progress));
  const r = 7, c = 2 * Math.PI * r;
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 18 18" className="shrink-0 -rotate-90" data-fel-hands-up={p.toFixed(2)}>
      <circle cx="9" cy="9" r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
      <circle cx="9" cy="9" r={r} fill="none" stroke="#00FF9D" strokeWidth="2" strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
    </svg>
  );
}

/**
 * A body line: the ring (when the hold can run) and the words, at the ring's height whether or not it shows. Spans
 * only, because it can sit inside a button (the pause layer, who-scene-it's READY card). Not shown = invisible but
 * still taking its room.
 */
export function HandsUpLine({ line, progress, className = '' }: { line: BodyLine; progress: number; className?: string }) {
  return (
    <span aria-hidden={line.shown ? undefined : true}
      className={`flex min-h-[18px] items-center gap-2 font-mono text-xs text-white/70${line.shown ? '' : ' invisible'}${className ? ` ${className}` : ''}`}>
      {line.ring && <HandsUpRing progress={progress} />}
      <span>{line.text}</span>
    </span>
  );
}

/** READY's body line, reading the session itself (so the splash around it does not re-render with the ring). */
export function BodyReadyLine({ className }: { className?: string }) {
  const view = useSyncExternalStore(sessionStore.subscribe, sessionStore.view, sessionStore.view);
  const line = readyLine(view);
  return line && <HandsUpLine line={line} progress={view.handsUp01} className={className} />;
}

export function PausedLayer({ onResume }: { onResume: () => void }) {
  const view = useSyncExternalStore(sessionStore.subscribe, sessionStore.view, sessionStore.view);
  const line = pausedLine(view);
  return (
    <button type="button" onClick={onResume} className="absolute inset-0 flex items-center justify-center bg-black/60">
      <span className="flex flex-col items-center gap-3 text-center">
        <span className="fel-heading text-3xl font-bold text-white">{PAUSED_HEADLINE}</span>
        {line && <HandsUpLine line={line} progress={view.handsUp01} />}
      </span>
    </button>
  );
}
