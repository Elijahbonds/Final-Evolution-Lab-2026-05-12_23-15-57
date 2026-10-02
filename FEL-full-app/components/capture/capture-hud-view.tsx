'use client';

// The record cluster on every game HUD. Presentational: the shell's GameCaptureHud owns the recorder.
// Inline styles so a headless render (no Tailwind) still shows the button, the stream frame, and the note.

import type { CSSProperties } from 'react';
import type { Aspect } from '@/lib/capture/exportLayout';
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
}

export function CaptureHudView(props: CaptureHudViewProps) {
  if (props.controlsHidden) {
    return (
      <button type="button" data-testid="capture-show" onClick={props.onShow} style={btn}>
        Show controls
      </button>
    );
  }
  const recording = props.phase === 'recording';
  const buffering = props.phase === 'buffering';
  return (
    <div data-testid="capture-hud" style={bar}>
      <button type="button" data-testid="capture-record" onClick={props.onRecord} style={recording ? recOn : btn}>
        {recording ? 'Stop' : 'Record'}
      </button>
      <button type="button" data-testid="capture-replay" onClick={props.onReplay} style={buffering ? on : btn}>
        {buffering || recording ? 'Save 30s' : 'Last 30s'}
      </button>
      <button type="button" data-testid="capture-aspect-916" onClick={() => props.onAspect('9:16')} style={props.aspect === '9:16' ? on : btn}>
        9:16
      </button>
      <button type="button" data-testid="capture-aspect-169" onClick={() => props.onAspect('16:9')} style={props.aspect === '16:9' ? on : btn}>
        16:9
      </button>
      <button type="button" data-testid="capture-share" onClick={() => props.onShare(props.canShareTake ? 'take' : 'replay')} disabled={!props.canShareTake && !props.canShareReplay} style={btn}>
        Share
      </button>
      <button type="button" data-testid="capture-stream" aria-pressed={props.streamOn} onClick={props.onStream} style={props.streamOn ? on : btn}>
        {props.streamOn ? 'Stream on' : 'Stream'}
      </button>
      {props.dunkFilm ? (
        <button type="button" data-testid="capture-film" onClick={props.onFilm} style={btn}>Film dunk</button>
      ) : null}
      {props.streamOn ? (
        <button type="button" data-testid="capture-hide" onClick={props.onHide} style={btn}>Hide controls</button>
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
