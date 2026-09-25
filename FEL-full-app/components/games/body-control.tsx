'use client';

// BodyControl — the button that turns the camera on for body play, and the card that says what your body does in the
// game that is running.
//
// It lives in GameShell rather than in a mode, because the camera is a DEVICE: one per page, outliving every mode.
// MOVEMENT PLAY P3 (2026-09-24): it no longer turns gestures into the same buttons for every game (the P1 mapper, where
// a hip rise was A everywhere). The source publishes the body itself to whichever mode is running, the harness turns
// it into that mode's own moves (lib/input/bodyProfiles), and this card reads them from sessionStore: "Jump → POP" on
// a skateboard, and in a game the body does not drive yet, that both hands up start it and bring it back from a pause,
// and nothing more (the body never pauses a game it is not playing).
//
// GameShell mounts it twice (the header, and a compact copy in full-bleed). Both drive and show ONE shared source and
// one camera (poseSource's sharedPoseSource, on PoseService); the camera stops when the last of them unmounts.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { PersonStanding, X } from 'lucide-react';
import { holdSharedPoseSource, sharedPoseSource, type PoseSourceSnapshot } from '@/lib/input/poseSource';
import { sessionStore, type SessionView } from '@/lib/babylon/core/sessionStore';
import { MOVE_LABEL, NO_MODE_COPY, PAUSE_NOTE, SESSION_LINES, SESSION_ONLY_COPY } from '@/lib/input/bodyProfiles';
import { SoundKit } from '@/lib/babylon/audio/SoundKit';

/** Before the page is live (server render, hydration) every Body button reads off. */
const OFF: PoseSourceSnapshot = { state: 'idle', detail: '', body: false };
const noSubscribe = () => () => {};

/**
 * The two costs of sharing a control with a hand (plan §3), said where the player reads the move: a crouch holds the
 * trigger at its depth over a pad that lets go (the fold keeps the deeper pull), and a thumb or key pushed along the
 * lean's axis owns that axis while it is held.
 */
function costNotes(view: SessionView): string[] {
  const notes: string[] = [];
  if (view.lines.some((l) => l.move === MOVE_LABEL.squat)) notes.push('While you crouch, the trigger stays down even if your pad lets go.');
  if (view.lines.some((l) => l.move === MOVE_LABEL.lean)) notes.push('A stick or key pushed the same way wins over your lean.');
  return notes;
}

/** The card's list: this game's moves and the session's two, or why there are none (plan §2.2). */
function Moves({ view }: { view: SessionView }) {
  if (view.modeId === null) return <p className="mt-3 text-[12.5px] leading-snug text-white/60">{NO_MODE_COPY}</p>;
  if (!view.drives) return <p className="mt-3 text-[12.5px] leading-snug text-white/60">{SESSION_ONLY_COPY}</p>;
  // the pause's one condition first (a controller player is never paused for walking off camera), then the costs
  const notes = [PAUSE_NOTE, ...costNotes(view)];
  return (
    <>
      <ul className="mt-3 grid gap-y-1.5">
        {[...view.lines, ...SESSION_LINES].map((l, i) => (
          <li
            key={`${l.move}-${l.verb}`}
            className={`flex items-baseline justify-between gap-2 ${i === view.lines.length && view.lines.length ? 'border-t border-white/[0.08] pt-1.5' : ''}`}
          >
            <span className="truncate text-[12.5px] text-white/75">{l.move}</span>
            <span className="shrink-0 font-mono text-[10px] font-bold uppercase text-[#00E5FF]">{l.verb}</span>
          </li>
        ))}
      </ul>
      {notes.map((n) => <p key={n} className="mt-2 text-[11px] leading-snug text-white/40">{n}</p>)}
    </>
  );
}

export function BodyControl({ compact = false }: { compact?: boolean }) {
  // Client only: the server never builds a camera source.
  const src = typeof window === 'undefined' ? null : sharedPoseSource();
  const { state, detail, body } = useSyncExternalStore(
    src ? src.listen : noSubscribe, () => src?.snapshot ?? OFF, () => OFF,
  );
  // what the running game reads from the body (nothing mounted = the "open a game" line)
  const view = useSyncExternalStore(sessionStore.subscribe, sessionStore.view, sessionStore.view);
  const [showCard, setShowCard] = useState(false);

  useEffect(() => holdSharedPoseSource(), []);

  const on = state !== 'idle' && state !== 'error';

  const toggle = useCallback(async () => {
    if (!src) return;
    if (on) { src.stop(); setShowCard(false); return; }
    // MOVEMENT PLAY P3 (2026-09-24): this click is the one user gesture a body-played game gets — the hands-up START
    // presses nothing — so the audio unlocks here, and the harness starts the ambient bed when the body wakes the game.
    SoundKit.unlock();
    setShowCard(true);
    await src.start();
  }, [src, on]);

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        aria-label={on ? 'Turn body control off' : 'Play with your body as the controller'}
        className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 font-mono text-[10.5px]
                    font-bold uppercase tracking-[0.12em] transition-colors ${compact ? '' : 'sm:px-3'}`}
        style={{
          borderColor: on ? 'rgba(0,255,157,0.45)' : 'rgba(255,255,255,0.12)',
          color: on ? '#00FF9D' : 'rgba(255,255,255,0.5)',
          background: on ? 'rgba(0,255,157,0.07)' : 'transparent',
        }}
      >
        <PersonStanding className="h-4 w-4" />
        {compact ? null : <span>Body</span>}
        {on && (
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: body ? '#00FF9D' : '#FFD700' }}
          />
        )}
      </button>

      {showCard && on && (
        <div className="pointer-events-auto fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-2xl border
                        border-white/12 bg-black/85 p-4 backdrop-blur-xl sm:inset-x-auto sm:right-4 sm:w-[340px]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-[#00FF9D]">
                Body control
              </p>
              <p className="mt-1 text-[13px] font-semibold leading-tight text-white">
                {state === 'requesting' ? 'Asking for the camera…'
                  : state === 'loading' ? 'Loading the tracker…'
                  : state === 'calibrating' ? 'Stand still, whole body in frame'
                  : body ? 'You are in.'
                  : 'Step back — I cannot see you'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCard(false)}
              aria-label="Hide the move list"
              className="shrink-0 rounded-md p-1 text-white/40 transition-colors hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {(state === 'calibrating' || state === 'live') && <Moves view={view} />}

          {state === 'live' && (
            <button
              type="button"
              onClick={() => src?.recalibrate()}
              className="mt-3 w-full rounded-lg border border-white/12 py-2 font-mono text-[10px] font-bold
                         uppercase tracking-[0.14em] text-white/50 transition-colors hover:text-white"
            >
              Stand still to re-centre
            </button>
          )}
        </div>
      )}

      {state === 'error' && detail && (
        <span className="font-mono text-[10px] text-[#FF3366]">{detail}</span>
      )}
    </>
  );
}
