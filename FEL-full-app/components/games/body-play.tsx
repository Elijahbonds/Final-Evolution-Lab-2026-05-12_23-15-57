'use client';

// BodyPlay — the READY screen's "Play with your body", the space check, and the self-view (movement play, phase 4,
// 2026-09-25).
//
// OWNER'S DECISIONS (movement play rounds 3–5): body play is a CHOICE on each game's READY screen, and it runs the space
// check first; it is remembered per game (the button is pre-selected — the camera still never starts without a tap);
// hybrid: the pad and touch still start the game and do the menus; a small mirrored self-view of you is always in a
// corner while you play with your body, on this device only; the check warns about the ceiling and the clearance,
// which no camera can see. Only the games the body drives offer it; a game with a later phase says it is coming.
//
// What decides lives in lib/move (the check, the choice, the store, node-tested); this file draws it:
//   BodyPlayReady   under TAP TO START on READY (BootSplash's card): the choice, the "coming" line, or nothing — and once
//                   chosen, the check panel over the card (it stops the card's whole-card start: it has its own);
//   BodyPlayReadyLine  READY's body line above it: P3's, except while the check runs, when the check's few words take its
//                   place (hidden to a chip, the card said P3's "stand still … then raise both hands", which the check
//                   no longer is: standing still calibrates nothing until its frame hold and the reach have passed);
//   SpaceCheckPanel the self-view with the floor line, one instruction in large type (the player is 3.5–4.5 m away),
//                   the safety line, the notes, the privacy line, TAP TO START, Hide, Camera off;
//   SelfView        the camera picture, mirrored by CSS on its box with the overlay drawn inside the flip (P9 draws its
//                   drill targets through `overlay`); PoseService.showIn moves the one <video> in, and it goes when the
//                   camera stops;
//   BodyPlayLayer   BootSplash's sibling: the check over a pause it was asked for, and the corner self-view in play.
//                   Like PausedLayer it carries no z-index, so it sits under the shell's z-30 corner (Leave, the Body
//                   button). It holds the shared source, so a page with no GameShell (/dev) still stops the camera.
//
// The camera picture never leaves the browser, and this file sends nothing (bodyPlay.scan.test holds it to that).

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { bodyPlay, BODY_PLAY_OFF, type BodyPlayView } from '@/lib/move/bodyPlay';
import { bodyPlayOffer, warmupOffer, kicksOptInOffer, readBodyKicks, writeBodyKicks, KICKS_OPT_IN_LABEL } from '@/lib/move/bodyPlayChoice';
import type { SpaceOverlay } from '@/lib/move/spaceCheck';
import { COMING_COPY } from '@/lib/input/bodyProfiles';
import { holdSharedPoseSource } from '@/lib/input/poseSource';
import { poseService } from '@/lib/pose/PoseService';
import { sessionStore } from '@/lib/babylon/core/sessionStore';
import type { ModePhase } from '@/lib/babylon';
import { BodyReadyLine, HandsUpLine, HandsUpRing, type BodyLine } from './paused-layer';

// ── the words ──
export const PLAY_WITH_BODY = 'PLAY WITH YOUR BODY';
export const CAMERA_NOTE = 'Uses your camera. The picture stays on this device.';
export const PRIVACY_LINE = 'Your camera picture stays on this device. It is never sent or saved. Only your game result is saved, as in every game.';
export const SETUP_HINT = 'Camera about chest high, 3.5 to 4.5 m away. Turn a phone on its side.';
export const READY_LINE = 'All set: raise both hands to start.';
export const CONTROLLER_STILL = 'Your controller still works.';
const ASKING = 'Allow the camera to play with your body.';
const LOADING = 'Loading the body tracker…';
const STEP_IN = 'Step into the picture: your whole body.';
/** The setup hint shows for the check's first seconds, while the player is still finding the spot. */
const HINT_MS = 3000;
const SELF_VIEW_CORNER_KEY = 'fel-selfview-corner';
/**
 * Where the self-view sits in play; a tap moves it on. Middle-left first: the live shots on the nine hosts (p4/shots)
 * put the touch deck bottom-left and bottom-right (the MOVE stick drew over a bottom-left self-view) and the HUD along the
 * top, and the middle of the left edge was clear on all of them. Never top-right: the shell's corner (Leave, Body).
 */
type Corner = 'ml' | 'tl' | 'bl' | 'br';
const CORNERS: readonly Corner[] = ['ml', 'tl', 'bl', 'br'];
const CORNER_CLASS: Record<Corner, string> = {
  ml: 'left-3 top-1/2 -translate-y-1/2', tl: 'left-3 top-3', bl: 'bottom-3 left-3', br: 'bottom-3 right-3',
};

const noSubscribe = () => () => {};
/** Body play, read like the session store (the server and hydration see it off). */
export function useBodyPlay(): BodyPlayView {
  return useSyncExternalStore(typeof window === 'undefined' ? noSubscribe : bodyPlay.subscribe, typeof window === 'undefined' ? () => BODY_PLAY_OFF : bodyPlay.view, () => BODY_PLAY_OFF);
}
const useSession = () => useSyncExternalStore(sessionStore.subscribe, sessionStore.view, sessionStore.view);

// ── the self-view ──

/** The overlay, in image units, drawn inside the self-view's flipped box so it lands on the body (not mirrored here). */
function OverlayLines({ overlay }: { overlay: SpaceOverlay }) {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
      {overlay.headroomY !== null && (
        <rect x="0" y="0" width="1" height={overlay.headroomY} fill="rgba(255,215,0,0.16)" data-fel-space-headroom={overlay.headroomY.toFixed(3)} />
      )}
      {overlay.box && (
        <rect x={overlay.box.x0} y={overlay.box.y0} width={overlay.box.x1 - overlay.box.x0} height={overlay.box.y1 - overlay.box.y0}
          fill="none" stroke="rgba(0,229,255,0.55)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      )}
      {overlay.floorY !== null && (
        <line x1="0" x2="1" y1={overlay.floorY} y2={overlay.floorY} stroke="#00FF9D" strokeWidth="2" vectorEffect="non-scaling-stroke"
          data-fel-space-floor={overlay.floorY.toFixed(3)} />
      )}
    </svg>
  );
}

/**
 * The camera picture, mirrored (a mirror is what a player expects to see of themselves), local only. The box takes the
 * picture's shape so nothing is cropped and the overlay lines up; on the dev feed (no <video>) it is a dark box.
 */
export function SelfView({ mirrored = true, overlay, className = '', style }: {
  mirrored?: boolean; overlay?: ReactNode; className?: string; style?: React.CSSProperties;
}) {
  const view = useBodyPlay();
  const host = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const svc = poseService();
    let undo: (() => void) | null = null;
    let shown: HTMLVideoElement | null = null;
    const sync = (): void => {
      const v = svc.status.state === 'live' ? svc.video : null;
      if (v === shown) return;
      undo?.(); undo = null; shown = v;
      if (v) undo = svc.showIn(el);
    };
    sync();
    const off = svc.onStatus(sync);
    return () => { off(); undo?.(); };
  }, []);
  return (
    <div data-fel-selfview={mirrored ? 'mirrored' : 'plain'} className={`relative overflow-hidden rounded-xl bg-black ${className}`}
      style={{ aspectRatio: String(view.camera.aspect), ...style }}>
      <div className="absolute inset-0" style={mirrored ? { transform: 'scaleX(-1)' } : undefined}>
        {/* the <video> goes in here (PoseService.showIn): React renders nothing into this box */}
        <div ref={host} className="absolute inset-0" />
        {overlay}
      </div>
    </div>
  );
}

// ── the check panel ──

/** What the camera is doing, in words, while the check has nothing to say yet. */
function cameraWords(view: Pick<BodyPlayView, 'camera'>): string {
  const s = view.camera.state;
  return s === 'idle' || s === 'requesting' ? ASKING : s === 'loading' ? LOADING : STEP_IN;
}

/** What the camera is doing, while the check has nothing to say yet. */
function CameraLine({ view }: { view: BodyPlayView }) {
  if (view.stage === 'error') {
    return (
      <div className="space-y-1 text-center">
        <p className="text-base text-rose-300">{view.camera.why}</p>
        <p className="text-sm text-white/60">{CONTROLLER_STILL}</p>
      </div>
    );
  }
  return <p className="text-center text-2xl font-black text-white">{cameraWords(view)}</p>;
}

/** The ring for a stage's hold (framing, the reach, the stand). */
function HoldRing({ progress }: { progress: number }) {
  const r = 11, c = 2 * Math.PI * r, p = Math.min(1, Math.max(0, progress));
  return (
    <svg aria-hidden width="28" height="28" viewBox="0 0 28 28" className="shrink-0 -rotate-90">
      <circle cx="14" cy="14" r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="3" />
      <circle cx="14" cy="14" r={r} fill="none" stroke="#00E5FF" strokeWidth="3" strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
    </svg>
  );
}

/**
 * The space check: the self-view with the floor line, the one thing to do, and the ways out. `variant` 'ready' sits over
 * the READY card; 'paused' over the pause (its start button resumes).
 */
export function SpaceCheckPanel({ onStart, variant = 'ready' }: { onStart: () => void; variant?: 'ready' | 'paused' }) {
  const view = useBodyPlay();
  const session = useSession();
  const space = view.space;
  const ready = space?.stage === 'ready';
  const warm = warmupOffer(space?.stage ?? null);
  const hint = space && space.stage === 'frame' && space.t - space.since < HINT_MS;
  return (
    <div
      data-fel-space-panel={variant}
      data-fel-space-stage={space?.stage ?? view.stage}
      data-fel-space-say={space?.say.id ?? ''}
      // the READY card starts the game on a press anywhere: the panel has its own start, and a tap on it is not one
      onPointerDown={(e) => e.stopPropagation()}
      className={`absolute inset-0 flex flex-col items-center gap-3 overflow-y-auto bg-[#05060a] px-4 py-4 text-center ${variant === 'ready' ? 'z-20' : ''}`}
      style={{ fontFamily: 'var(--fel-font-display, ui-monospace)' }}>
      <p className="max-w-xl text-[12px] leading-snug text-amber-200/90">{space?.safety.text ?? ''}</p>
      {/* as wide as fits: the player reads it from 3.5–4.5 m, and it keeps the picture's shape inside 40 % of the height */}
      <SelfView className="shrink-0" style={{ width: `min(72vw, 420px, calc(40vh * ${view.camera.aspect.toFixed(3)}))` }}
        overlay={space ? <OverlayLines overlay={space.overlay} /> : null} />

      {space ? (
        <div className="flex max-w-2xl items-center gap-3">
          {!ready && <HoldRing progress={space.hold} />}
          <p className="text-2xl font-black leading-tight text-white sm:text-3xl" aria-live="polite">{ready ? READY_LINE : space.say.text}</p>
        </div>
      ) : <CameraLine view={view} />}

      {space?.notes.map((n) => <p key={n.id} className="max-w-xl text-sm text-amber-200/80">{n.text}</p>)}
      {hint && <p className="max-w-xl text-sm text-white/60">{SETUP_HINT}</p>}

      {ready && (
        <div className="flex flex-col items-center gap-2">
          <span className="flex items-center gap-2 text-sm text-white/75"><HandsUpRing progress={session.handsUp01} />raise both hands and hold</span>
          {session.lines.length > 0 && (
            <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1">
              {session.lines.map((l) => (
                <li key={`${l.move}-${l.verb}`} className="text-[12px] text-white/70">
                  {l.move} <span className="font-mono text-[10px] font-bold uppercase text-[#00E5FF]">{l.verb}</span>
                </li>
              ))}
            </ul>
          )}
          {warm && <a href={warm.href} className="text-sm text-[#00E5FF] underline">{warm.label}</a>}
          {kicksOptInOffer(session, space?.stage ?? null) && <KicksOptIn gameKey={session.key!} />}
        </div>
      )}

      <p className="max-w-xl text-[11px] leading-snug text-white/45">{PRIVACY_LINE}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={(e) => { e.currentTarget.blur(); onStart(); }}
          className="rounded-2xl bg-white px-6 py-2.5 text-sm font-black text-black">{variant === 'paused' ? 'RESUME' : 'TAP TO START'}</button>
        {variant === 'ready' && (
          <button type="button" onClick={() => bodyPlay.collapse(true)}
            className="rounded-2xl border border-white/20 px-4 py-2.5 text-sm font-bold text-white/70">Hide</button>
        )}
        <button type="button" onClick={() => bodyPlay.end(view.key ?? session.key)}
          className="rounded-2xl border border-white/20 px-4 py-2.5 text-sm font-bold text-white/70">Camera off</button>
      </div>
    </div>
  );
}

/** MOVEMENT PLAY P7: spin and jump kicks, opt-in once the space check passed (a combat game only; off by default). */
function KicksOptIn({ gameKey }: { gameKey: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(readBodyKicks(gameKey)); }, [gameKey]);
  return (
    <label className="flex items-center gap-2 text-[12px] text-white/75" data-fel-body-kicks={on ? 'on' : 'off'}>
      <input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); writeBodyKicks(gameKey, e.target.checked); }} />
      {KICKS_OPT_IN_LABEL}
    </label>
  );
}

// ── READY ──

/** The READY card's body-play line: the choice, "coming", or nothing — and once chosen, the check over the card. */
export function BodyPlayReady({ tint, onStart }: { tint: string; onStart: () => void }) {
  const view = useBodyPlay();
  const session = useSession();
  const offer = bodyPlayOffer(session);
  const key = session.key;
  const [remembered, setRemembered] = useState(false);
  useEffect(() => { setRemembered(key ? bodyPlay.remembered(key) : false); }, [key, view.stage]);
  if (offer === null) return null;
  if (offer === 'coming') return <p className="text-[11px] tracking-wide text-white/45">{COMING_COPY}</p>;
  const on = view.stage === 'starting' || view.stage === 'checking' || view.stage === 'set';
  if (on && view.collapsed) {
    return (
      <button type="button" onClick={() => bodyPlay.collapse(false)}
        className="rounded-full border border-[#00FF9D]/50 px-3 py-1 text-[11px] font-bold text-[#00FF9D]">Body play on · Show</button>
    );
  }
  if (on) return <SpaceCheckPanel onStart={onStart} variant="ready" />;
  return (
    <div className="flex flex-col items-center gap-1">
      <button type="button" data-fel-body-play={remembered ? 'remembered' : 'off'}
        onClick={(e) => { e.currentTarget.blur(); if (key) void bodyPlay.begin(key); }}
        className={`rounded-2xl px-6 py-2.5 text-sm font-black tracking-wide ${remembered ? 'text-black' : 'border text-white'}`}
        style={remembered ? { background: tint } : { borderColor: tint }}>
        {PLAY_WITH_BODY}
      </button>
      <p className="text-[11px] text-white/55">{CAMERA_NOTE}</p>
      {view.stage === 'error' && view.camera.why && <p className="max-w-xs text-[11px] text-rose-300">{view.camera.why}</p>}
    </div>
  );
}

/**
 * READY's body line, in BootSplash's slot under TAP TO START: P3's BodyReadyLine, except while the space check runs —
 * then the check's own few words ("Hold that spot", "Arms overhead", "Stand still"), the same line in the same place, so
 * the card does not move. Seen when the panel is hidden to its chip; the open panel covers the card.
 */
export function BodyPlayReadyLine({ className }: { className?: string }) {
  const line = checkReadyLine(useBodyPlay());
  return line ? <HandsUpLine line={line} progress={0} className={className} /> : <BodyReadyLine className={className} />;
}

/** The check's line for READY's body slot while it runs (no ring: the hands-up START waits for it), else null. */
export function checkReadyLine(view: Pick<BodyPlayView, 'stage' | 'space' | 'camera'>): BodyLine | null {
  if (view.stage !== 'starting' && view.stage !== 'checking') return null;
  return { text: view.space?.oneLine ?? cameraWords(view), ring: false, shown: true };
}

// ── the layer beside the splash ──

function readCorner(): Corner {
  try { const c = localStorage.getItem(SELF_VIEW_CORNER_KEY); return CORNERS.includes(c as Corner) ? (c as Corner) : CORNERS[0]; } catch { return CORNERS[0]; }
}

/**
 * BootSplash's sibling: in a pause the check was asked for, the check over it; in play (and a pause without one, and the
 * end card) the corner self-view, with the check's short line while it still runs. Nothing with the camera off.
 */
export function BodyPlayLayer({ phase, onStart }: { phase: ModePhase; onStart: () => void }) {
  const view = useBodyPlay();
  const [corner, setCorner] = useState<Corner>(CORNERS[0]);
  useEffect(() => holdSharedPoseSource(), []);
  useEffect(() => { setCorner(readCorner()); }, []);
  const live = view.camera.state === 'calibrating' || view.camera.state === 'live';
  if (!live || phase === 'ready' || phase === 'loading' || phase === 'error') return null;
  if (phase === 'paused' && view.checking) {
    return <div className="absolute inset-0"><SpaceCheckPanel onStart={onStart} variant="paused" /></div>;
  }
  const next = () => {
    const c = CORNERS[(CORNERS.indexOf(corner) + 1) % CORNERS.length];
    setCorner(c);
    try { localStorage.setItem(SELF_VIEW_CORNER_KEY, c); } catch { /* not remembered */ }
  };
  const line = view.stage === 'checking' ? view.space?.oneLine ?? null : null;
  return (
    <div data-fel-selfview-corner={corner} className={`pointer-events-auto absolute flex w-[22%] max-w-[160px] flex-col gap-1 ${CORNER_CLASS[corner]}`}>
      {/* it lets go of the focus: Space (A, the jump) would click a focused button again and move the self-view on */}
      <button type="button" aria-label="Move your self-view" onClick={(e) => { e.currentTarget.blur(); next(); }} className="block w-full">
        <SelfView className="w-full" />
      </button>
      {line && <p className="rounded bg-black/70 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">{line}</p>}
    </div>
  );
}
