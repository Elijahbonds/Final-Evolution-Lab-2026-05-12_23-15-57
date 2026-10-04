'use client';

// The jump review: one short card per jump, then best / average / trend.
// The video element is passed in so this view can render without a camera.

import type { CSSProperties, ReactNode } from 'react';
import type { Reel } from '@/lib/dunk-film/reel';

const wrap: CSSProperties = { color: '#fff', fontFamily: 'ui-sans-serif, system-ui, sans-serif', display: 'grid', gap: 12 };
const card: CSSProperties = {
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: 12, background: 'rgba(255,255,255,0.03)',
};
const btn: CSSProperties = {
  border: '1px solid rgba(0,229,255,0.6)', background: 'transparent', color: '#00E5FF',
  borderRadius: 8, padding: '8px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
};

export function DunkReelView(props: {
  reel: Reel;
  video?: ReactNode;
  canLeave: boolean;
  note: string | null;
  onExport: (aspect: '9:16' | '16:9') => void;
  onShare: () => void;
  onSaveNumbers: () => void;
  saveCard?: ReactNode;
}) {
  const { reel } = props;
  return (
    <div data-testid="dunk-reel" style={wrap}>
      <h2 style={{ margin: 0, fontSize: 22 }}>Jump review</h2>
      <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
        Each jump is cut from about 1.5 seconds before takeoff to 1 second after landing. Heights are estimates.
      </p>
      <div data-testid="dunk-summary" style={{ ...card, borderColor: 'rgba(0,229,255,0.45)' }}>
        {reel.summaryLines.map((line) => <p key={line} style={{ margin: '4px 0', fontWeight: 700 }}>{line}</p>)}
      </div>
      {props.video}
      {reel.clips.map((clip) => (
        <article key={clip.index} data-testid="dunk-clip" style={card}>
          <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>
            Jump {clip.index}
            <span style={{ fontWeight: 500, color: 'rgba(255,255,255,0.55)' }}>
              {' '}· {((clip.endMs - clip.startMs) / 1000).toFixed(1)}s
            </span>
          </h3>
          {clip.lines.map((line) => <p key={line} style={{ margin: '2px 0', fontSize: 14 }}>{line}</p>)}
        </article>
      ))}
      {props.saveCard}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" data-testid="dunk-export-916" style={btn} disabled={!props.canLeave} onClick={() => props.onExport('9:16')}>Export 9:16</button>
        <button type="button" data-testid="dunk-export-169" style={btn} disabled={!props.canLeave} onClick={() => props.onExport('16:9')}>Export 16:9</button>
        <button type="button" data-testid="dunk-share" style={btn} disabled={!props.canLeave} onClick={props.onShare}>Share</button>
        <button type="button" data-testid="dunk-save-numbers" style={btn} onClick={props.onSaveNumbers}>Save numbers</button>
      </div>
      {!props.canLeave ? (
        <p data-testid="dunk-leave-blocked" style={{ margin: 0, color: '#FFD700', fontSize: 13 }}>
          A grown-up has to be with you before this video can be exported or shared. The numbers can stay on this device.
        </p>
      ) : null}
      {props.note ? <p data-testid="dunk-note" style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{props.note}</p> : null}
    </div>
  );
}
