'use client';

// The record cluster on every game HUD, behind one three-dot overflow button. The shell's
// GameCaptureHud owns the recorder; this view owns only the menu. The menu machine is pure
// (lib/capture/overflowMenu.ts) — the DOM wiring here only dispatches its events and applies
// its focus orders, so pads (which arrive as synthetic keys), touch and mouse all walk the
// same transitions. Inline styles so a headless render (no Tailwind) still shows the button,
// the stream frame, and the note.

import { useEffect, useReducer, useRef, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Aspect } from '@/lib/capture/exportLayout';
import { OVERFLOW_CLOSED, hudIndicator, overflowStep, type OverflowState } from '@/lib/capture/overflowMenu';
import type { RecPhase } from '@/lib/capture/recorderMachine';
import { RTMP_NOTE, STREAM_SAFE } from '@/lib/capture/streamLayout';

const bar: CSSProperties = {
  display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
  padding: 8, borderRadius: 12, background: 'rgba(5,5,5,0.72)',
  border: '1px solid rgba(255,255,255,0.14)', color: '#fff',
  fontFamily: 'ui-sans-serif, system-ui, sans-serif', maxWidth: 420,
};
const btn: CSSProperties = {
  border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)',
  color: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700,
  letterSpacing: '0.04em', cursor: 'pointer',
};
const on: CSSProperties = { ...btn, borderColor: '#00E5FF', color: '#00E5FF' };
const recOn: CSSProperties = { ...btn, borderColor: '#FF3366', color: '#fff', background: '#FF3366' };
const menuStyle: CSSProperties = {
  position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 50,
  display: 'flex', flexDirection: 'column', gap: 4, padding: 8, minWidth: 168,
  borderRadius: 12, background: 'rgba(5,5,5,0.92)', border: '1px solid rgba(255,255,255,0.16)',
};
const item: CSSProperties = { ...btn, textAlign: 'left', width: '100%' };

export interface CaptureHudViewProps {
  phase: RecPhase;
  aspect: Aspect;
  streamOn: boolean;
  controlsHidden: boolean;
  note: string | null;
  codecNote: string | null;
  dunkFilm: boolean;
  canShareTake: boolean;
  canShareReplay: boolean;
  onRecord: () => void;
  onReplay: () => void;
  onAspect: (aspect: Aspect) => void;
  onShare: (which: 'take' | 'replay') => void;
  onStream: () => void;
  onHide: () => void;
  onShow: () => void;
  onFilm: () => void;
  /** Tests and story-style renders only: start with the menu open. Play always starts closed. */
  defaultMenuOpen?: boolean;
}

/** The red dot that never hides: REC while a take records, LIVE while stream mode is on. */
export function RecLiveIndicator({ rec, live }: { rec: boolean; live: boolean }) {
  if (!rec && !live) return null;
  const label = [rec ? 'Recording' : null, live ? 'Streaming live' : null].filter(Boolean).join(', ');
  const chip = (text: string) => (
    <span key={text} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: '#FF3366', boxShadow: '0 0 6px #FF3366' }} />
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', color: '#FF3366' }}>{text}</span>
    </span>
  );
  return (
    <span data-testid="rec-live" role="status" aria-label={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '0 2px' }}>
      {rec ? chip('REC') : null}
      {live ? chip('LIVE') : null}
    </span>
  );
}

export function CaptureHudView(props: CaptureHudViewProps) {
  const [menu, dispatch] = useReducer(
    overflowStep,
    OVERFLOW_CLOSED,
    (closed): OverflowState => (props.defaultMenuOpen ? { open: true, focus: null } : closed),
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Outside tap and Esc only listen while the menu is open — closed, every key belongs to the game.
  useEffect(() => {
    if (!menu.open) return;
    const onPointerDown = (ev: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(ev.target as Node)) dispatch({ type: 'outside-tap' });
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') dispatch({ type: 'escape' });
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menu.open]);

  // The machine says where focus goes; here is the only place that order is carried out.
  useEffect(() => {
    if (menu.focus === 'first-item') {
      rootRef.current?.querySelector<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]')?.focus();
    } else if (menu.focus === 'trigger') {
      triggerRef.current?.focus();
    }
  }, [menu]);

  const recording = props.phase === 'recording';
  const buffering = props.phase === 'buffering';
  const ind = hudIndicator(props.phase, props.streamOn);
  const indicator = <RecLiveIndicator rec={ind.rec} live={ind.live} />;

  if (props.controlsHidden) {
    // Hidden is for a clean broadcast — but the LIVE/REC dot is the one thing that must never hide.
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {indicator}
        <button type="button" data-testid="capture-show" onClick={props.onShow} style={btn}>
          Show controls
        </button>
      </div>
    );
  }

  // Arrow keys walk the open menu (a pad's D-pad arrives as arrows). Focus wraps.
  const onMenuKeyDown = (ev: ReactKeyboardEvent) => {
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    ev.preventDefault();
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled]), [role="menuitemcheckbox"]:not([disabled])') ?? []);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = ev.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  // ArrowDown on the closed trigger opens the menu — Radix's convention, and how a pad user gets in.
  const onTriggerKeyDown = (ev: ReactKeyboardEvent) => {
    if (ev.key === 'ArrowDown' && !menu.open) {
      ev.preventDefault();
      dispatch({ type: 'trigger' });
    }
  };

  const activate = (fn: () => void) => () => {
    fn();
    dispatch({ type: 'item-activated' });
  };

  return (
    <div ref={rootRef} data-testid="capture-hud" style={{ ...bar, position: 'relative' }}>
      {indicator}
      <button
        type="button"
        ref={triggerRef}
        data-testid="capture-overflow"
        aria-label="Capture and stream menu"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        onClick={() => dispatch({ type: 'trigger' })}
        onKeyDown={onTriggerKeyDown}
        style={{ ...btn, padding: '6px 12px', fontSize: 15, lineHeight: 1 }}
      >
        ⋯
      </button>
      {menu.open ? (
        <div role="menu" aria-label="Capture and stream controls" data-testid="capture-menu" style={menuStyle} onKeyDown={onMenuKeyDown}>
          <button type="button" role="menuitem" data-testid="capture-record" aria-label={recording ? 'Stop recording' : 'Start recording'} onClick={activate(props.onRecord)} style={recording ? { ...recOn, textAlign: 'left', width: '100%' } : item}>
            {recording ? 'Stop' : 'Record'}
          </button>
          <button type="button" role="menuitem" data-testid="capture-replay" aria-label={buffering || recording ? 'Save the last 30 seconds' : 'Keep the last 30 seconds'} onClick={activate(props.onReplay)} style={buffering ? { ...on, textAlign: 'left', width: '100%' } : item}>
            {buffering || recording ? 'Save 30s' : 'Last 30s'}
          </button>
          <button type="button" role="menuitem" data-testid="capture-aspect-916" aria-label="Portrait 9:16 export shape" onClick={activate(() => props.onAspect('9:16'))} style={props.aspect === '9:16' ? { ...on, textAlign: 'left', width: '100%' } : item}>
            9:16
          </button>
          <button type="button" role="menuitem" data-testid="capture-aspect-169" aria-label="Landscape 16:9 export shape" onClick={activate(() => props.onAspect('16:9'))} style={props.aspect === '16:9' ? { ...on, textAlign: 'left', width: '100%' } : item}>
            16:9
          </button>
          <button type="button" role="menuitem" data-testid="capture-share" aria-label="Share the clip" onClick={activate(() => props.onShare(props.canShareTake ? 'take' : 'replay'))} disabled={!props.canShareTake && !props.canShareReplay} style={item}>
            Share
          </button>
          <button type="button" role="menuitemcheckbox" data-testid="capture-stream" aria-label={props.streamOn ? 'Turn stream mode off' : 'Turn stream mode on'} aria-checked={props.streamOn} onClick={activate(props.onStream)} style={props.streamOn ? { ...on, textAlign: 'left', width: '100%' } : item}>
            {props.streamOn ? 'Stream on' : 'Stream'}
          </button>
          {props.dunkFilm ? (
            <button type="button" role="menuitem" data-testid="capture-film" aria-label="Film a dunk with the camera" onClick={activate(props.onFilm)} style={item}>Film dunk</button>
          ) : null}
          {props.streamOn ? (
            <button type="button" role="menuitem" data-testid="capture-hide" aria-label="Hide the capture controls" onClick={activate(props.onHide)} style={item}>Hide controls</button>
          ) : null}
        </div>
      ) : null}
      {props.codecNote ? <p data-testid="capture-codec" style={{ margin: 0, flexBasis: '100%', fontSize: 11, color: '#FFD700' }}>{props.codecNote}</p> : null}
      {props.note ? <p data-testid="capture-note" style={{ margin: 0, flexBasis: '100%', fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>{props.note}</p> : null}
      {props.streamOn ? <p data-testid="stream-note" style={{ margin: 0, flexBasis: '100%', fontSize: 11, lineHeight: 1.35, color: 'rgba(255,255,255,0.65)' }}>{RTMP_NOTE}</p> : null}
    </div>
  );
}

/** Corner brackets for the safe area. Hidden with the controls, so a broadcast can be clean. */
export function StreamGuides() {
  const corner = (pos: CSSProperties): CSSProperties => ({
    position: 'absolute', width: 28, height: 28, borderColor: 'rgba(0,229,255,0.85)', borderStyle: 'solid', ...pos,
  });
  return (
    <div data-testid="stream-guides" style={{
      position: 'absolute', pointerEvents: 'none', zIndex: 25,
      top: STREAM_SAFE.top, right: STREAM_SAFE.right, bottom: STREAM_SAFE.bottom, left: STREAM_SAFE.left,
    }}>
      <div style={corner({ top: 0, left: 0, borderWidth: '2px 0 0 2px' })} />
      <div style={corner({ top: 0, right: 0, borderWidth: '2px 2px 0 0' })} />
      <div style={corner({ bottom: 0, left: 0, borderWidth: '0 0 2px 2px' })} />
      <div style={corner({ bottom: 0, right: 0, borderWidth: '0 2px 2px 0' })} />
      <p style={{ position: 'absolute', top: 8, left: 36, margin: 0, color: '#00E5FF', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em' }}>
        16:9 · SAFE AREA
      </p>
    </div>
  );
}

export const STREAM_FRAME_CSS = `
[data-fel-stream="1"] {
  flex: 0 0 auto !important;
  width: min(100vw, calc(100dvh * 16 / 9));
  height: min(100dvh, calc(100vw * 9 / 16));
  margin-inline: auto;
  aspect-ratio: 16 / 9;
  background: #000;
  box-sizing: border-box;
  padding: 48px 88px 72px;
}
[data-fel-stream="1"] [data-touch-deck] { display: none !important; }
`;
