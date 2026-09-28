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
//
// MOVEMENT PLAY P4 (2026-09-25): the button is a SHORTCUT to the READY screen's "Play with your body" (the owner's
// call). It runs the same choice (lib/move/bodyPlay's button(): bodyButtonAction): at READY it starts the camera and the
// space check runs on the game screen; mid-play it pauses the game first and the check runs over the pause; on a game
// where body play is coming, or that has none, it only opens the card — it never starts the camera there. The card's
// "Stand still to re-centre" is "Check my space again" now (the same body, a new stand, through the check).
//
// Every button here lets go of the keyboard focus when clicked (the review): Space is a game key (A), and a focused
// button is also clicked by Space's keyup, so a kept focus turned the player's next jump into this button's action —
// "Check my space again" paused the game and dropped the rulers, the Body button turned the camera off. TAP TO START
// and PLAY WITH YOUR BODY blur themselves for the same reason.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { PersonStanding, X } from 'lucide-react';
import { holdSharedPoseSource, sharedPoseSource, type PoseSourceSnapshot } from '@/lib/input/poseSource';
import { sessionStore, type SessionView } from '@/lib/babylon/core/sessionStore';
import { MOVE_LABEL, NO_MODE_COPY, PAUSE_NOTE, SESSION_LINES, SESSION_ONLY_COPY, UNAVAILABLE_COPY } from '@/lib/input/bodyProfiles';
import { bodyPlay, BODY_PLAY_OFF } from '@/lib/move/bodyPlay';
import { bodyButtonAction, bodyPlayOffer, type BodyButtonAction } from '@/lib/move/bodyPlayChoice';

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

/** Why a game has no moves to list: none running, body play coming to it, or none for it (MOVEMENT PLAY P4). */
export function noMovesCopy(view: Pick<SessionView, 'modeId' | 'drives' | 'later'>): string | null {
  if (view.modeId === null) return NO_MODE_COPY;
  if (view.drives) return null;
  return bodyPlayOffer(view) === 'coming' ? SESSION_ONLY_COPY : UNAVAILABLE_COPY;
}

/** The card's list: this game's moves and the session's two, or why there are none (plan §2.2). */
function Moves({ view }: { view: SessionView }) {
  const none = noMovesCopy(view);
  if (none) return <p className="mt-3 text-[12.5px] leading-snug text-white/60">{none}</p>;
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
  const play = useSyncExternalStore(src ? bodyPlay.subscribe : noSubscribe, src ? bodyPlay.view : () => BODY_PLAY_OFF, () => BODY_PLAY_OFF);
  const [showCard, setShowCard] = useState(false);
  /** The card opened without a camera (body play coming, none, no game): what it says. */
  const [cardOnly, setCardOnly] = useState<BodyButtonAction | null>(null);

  useEffect(() => holdSharedPoseSource(), []);

  const on = state !== 'idle' && state !== 'error';

  const toggle = useCallback(() => {
    if (!src) return;
    // MOVEMENT PLAY P4: the READY choice's shortcut (bodyPlay.button runs the same action). The sound unlocks inside it,
    // before anything awaits: this click is the one user gesture a body-played game gets (the hands-up START presses
    // nothing). The card opens at once, not after the camera's permission prompt.
    const action = bodyButtonAction(sessionStore.view(), on);
    setCardOnly(action === 'coming' || action === 'unavailable' || action === 'none' ? action : null);
    setShowCard(action !== 'end');
    void bodyPlay.button();
  }, [src, on]);

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.currentTarget.blur(); toggle(); }}
        aria-pressed={on}
        aria-label={on ? 'Turn body play off' : 'Play with your body'}
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

      {showCard && (on || cardOnly) && (
        <div className="pointer-events-auto fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md rounded-2xl border
                        border-white/12 bg-black/85 p-4 backdrop-blur-xl sm:inset-x-auto sm:right-4 sm:w-[340px]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-[#00FF9D]">
                Body control
              </p>
              <p className="mt-1 text-[13px] font-semibold leading-tight text-white">
                {!on ? (cardOnly === 'none' ? 'No game running' : cardOnly === 'coming' ? 'Not in this game yet' : 'Not in this game')
                  : state === 'requesting' ? 'Asking for the camera…'
                  : state === 'loading' ? 'Loading the tracker…'
                  : play.stage === 'checking' ? 'Set up your space on the game screen.'
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

          {(!on || state === 'calibrating' || state === 'live') && <Moves view={view} />}

          {(state === 'calibrating' || state === 'live') && play.stage !== 'off' && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={(e) => { e.currentTarget.blur(); bodyPlay.again(); }}
                className="rounded-lg border border-white/12 py-2 font-mono text-[10px] font-bold
                           uppercase tracking-[0.14em] text-white/50 transition-colors hover:text-white"
              >
                Check my space again
              </button>
              <button
                type="button"
                onClick={(e) => { e.currentTarget.blur(); bodyPlay.end(view.key ?? play.key); setShowCard(false); }}
                className="rounded-lg border border-white/12 py-2 font-mono text-[10px] font-bold
                           uppercase tracking-[0.14em] text-white/50 transition-colors hover:text-white"
              >
                Camera off
              </button>
            </div>
          )}
        </div>
      )}

      {state === 'error' && detail && (
        <span className="font-mono text-[10px] text-[#FF3366]">{detail}</span>
      )}
    </>
  );
}
