'use client';
// PerformLanes — PERFORM ON SCREEN (MUSIC-SUITE P6, "PERFORM plays your song", 2026-09-25).
//
// What was there (StudioMode.tsx ~:2156-2176 before this pass): one TAP button, a status line and END SET. The player
// could not see the song, and any tap took any note (performSet.ts header). Now:
//   * THE LANES: KICK · SNARE · HATS · FLIP, left to right, each a row of this bar's 16 steps with a note drawn ONLY where
//     that part of the song hits (performSet.performBarCells: the rows that will sound, through the lanes and the 8th cap,
//     exactly as the judge offers them), the playhead across all four, beat shading, and a dot that is lit while the
//     lane's part is IN THE BAND (performSet.PerformBand — the kick always; the rest join as you stay on them).
//   * THE PADS: four big targets in the same order and colours (≥ 64 px tall; on a phone the four share the row), each
//     with its keys (H J K L · ← ↓ ↑ →) and its pad buttons (X A Y B · the D-pad), and the lane's last verdict flashing
//     on it (PERFECT / GOOD · LATE 60ms / WRONG LANE / EXTRA TAP). A lane ROW is a target too (pointer on the lanes).
//     A pad taps on POINTERDOWN (P2's rule: the release is a press's length late); a click with no pointer before it
//     (Enter on a focused pad, a script) taps once; a held Enter's repeats are cancelled (performSet isRepeatedActivation).
//   * THE RECAP (PerformRecap): the grade, accuracy and score; bars played; best streak; each lane's accuracy; the signed
//     early / late histogram (25 ms bins over ±250 ms, PERFECT's ±80 ms marked) and the one timing line (rush / drag).
// No hooks: the room owns every piece of state, so the tests render these as plain functions.

import React from 'react';
import {
  PERFORM_PERFECT_S, PERFORM_STEPS_PER_BAR, isRepeatedActivation, performTimingLine,
  type PerformLane, type PerformResult,
} from '../performSet';

export interface PerformLaneView {
  lane: PerformLane;
  /** KICK / SNARE / HATS / FLIP (an Arena set names its fourth PERC: the house beat's). */
  label: string;
  color: string;
  /** Its keys ("H ←") and its pad buttons ("X / ←"). */
  keys: string;
  pad: string;
  /** This bar's steps: a note where the lane's part hits. */
  cells: readonly boolean[];
  /** Its part is playing (the band). */
  inBand: boolean;
  /** The lane's last verdict, while it shows. */
  flash: string | null;
}

export interface PerformLanesProps {
  lanes: readonly PerformLaneView[];
  /** The step sounding now (0..15), −1 when stopped. */
  playhead: number;
  /** The phone layout (under 640 px). */
  compact: boolean;
  /** A lane was played by pointer (a pad, or the lane's row). */
  onLane: (lane: PerformLane) => void;
  /** The transport runs and the set judges: the pads are live (paused / before PLAY they say so). */
  live: boolean;
}

/** A lane's pad and row take a press on pointerdown (the primary button / a touch); the click that follows is not a tap. */
function tapHandlers(lane: PerformLane, onLane: (l: PerformLane) => void) {
  return {
    onPointerDown: (e: React.PointerEvent) => { if (e.button === 0) onLane(lane); },
    onClick: (e: React.MouseEvent) => { if (e.detail === 0) onLane(lane); },
    onKeyDown: (e: React.KeyboardEvent) => { if (isRepeatedActivation(e)) e.preventDefault(); },
  };
}

export default function PerformLanes({ lanes, playhead, compact, onLane, live }: PerformLanesProps): React.ReactElement {
  const cellH = compact ? 14 : 18;
  return (
    <div data-qa="perform-lanes" data-live={live ? '1' : '0'} style={{ width: '100%', marginTop: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `${compact ? 58 : 84}px minmax(0, 1fr)`, gap: '4px 8px', alignItems: 'center' }}>
        {lanes.map((l) => (
          <React.Fragment key={l.lane}>
            <div data-qa="perform-lane-label" data-lane={l.lane} data-band={l.inBand ? '1' : '0'}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: compact ? 10 : 12, fontWeight: 800, color: l.color, whiteSpace: 'nowrap' }}>
              <span aria-label={l.inBand ? 'in the band' : 'not in the band yet'}
                style={{ width: 8, height: 8, borderRadius: 4, flex: '0 0 auto', background: l.inBand ? l.color : 'transparent', border: `1px solid ${l.color}` }} />
              {l.label}
            </div>
            <div data-qa="perform-lane" data-lane={l.lane} role="button" aria-label={`${l.label} lane`} {...tapHandlers(l.lane, onLane)}
              style={{ display: 'grid', gridTemplateColumns: `repeat(${PERFORM_STEPS_PER_BAR}, minmax(0, 1fr))`, gap: 2, touchAction: 'manipulation', userSelect: 'none', cursor: 'pointer' }}>
              {l.cells.map((on, s) => (
                <div key={s} data-qa="perform-cell" data-lane={l.lane} data-step={s} data-on={on ? '1' : '0'}
                  style={{
                    height: cellH, borderRadius: 3,
                    background: on ? l.color : s % 4 === 0 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
                    opacity: on && !l.inBand ? 0.55 : 1,
                    outline: s === playhead ? '2px solid #fff' : 'none', outlineOffset: -1,
                  }} />
              ))}
            </div>
          </React.Fragment>
        ))}
      </div>
      <div data-qa="perform-pads" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: compact ? 6 : 10, marginTop: 10 }}>
        {lanes.map((l) => (
          <button key={l.lane} type="button" data-qa="perform-pad" data-lane={l.lane} aria-label={`${l.label} (${l.keys})`} {...tapHandlers(l.lane, onLane)}
            style={{
              minHeight: compact ? 72 : 64, borderRadius: 12, border: `2px solid ${l.color}`, cursor: 'pointer',
              background: l.inBand ? `${l.color}33` : 'rgba(0,0,0,0.25)', color: '#f5ead9', touchAction: 'manipulation', userSelect: 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: 4,
              opacity: live ? 1 : 0.6,
            }}>
            <span style={{ fontWeight: 900, fontSize: compact ? 13 : 15, color: l.color }}>{l.label}</span>
            <span style={{ fontSize: 10, opacity: 0.75 }}>{compact ? l.keys.split(' ')[0] : `${l.keys} · ${l.pad}`}</span>
            <span data-qa="perform-pad-flash" style={{ fontSize: 10, minHeight: 12, fontWeight: 700, color: l.flash && /WRONG|EXTRA|MISS/.test(l.flash) ? '#ffb4a2' : '#b8e6c1' }}>{l.flash ?? ''}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── the recap ──────────────────────────────────────────────────────────────────────────────────────────────────────
export interface PerformRecapProps {
  result: PerformResult;
  /** Each lane's name and colour (index = lane). */
  labels: readonly string[];
  colors: readonly string[];
  /** The Arena's words for the score (the rejudged one), or null in free play. */
  arenaLine?: string | null;
  onClose?: () => void;
}

export function PerformRecap({ result: r, labels, colors, arenaLine = null, onClose }: PerformRecapProps): React.ReactElement {
  const peak = Math.max(1, ...r.hist.map((b) => b.count));
  const perfectMs = PERFORM_PERFECT_S * 1000;
  const pct = (a: number): string => `${Math.round(a * 100)}%`;
  return (
    <div data-qa="perform-recap" role="group" aria-label="Your set" style={{ padding: 10, borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: '1px solid #7a5c9e', marginTop: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10 }}>
        <span data-qa="recap-grade" style={{ fontSize: 26, fontWeight: 900, color: '#ffd75e' }}>{r.grade}</span>
        <span style={{ fontWeight: 800 }}>{pct(r.accuracy)} · {r.score.toLocaleString('en-US')}</span>
        <span style={{ fontSize: 12, opacity: 0.85 }}>
          {r.bars} bar{r.bars === 1 ? '' : 's'} played · best streak x{r.maxCombo} · {r.perfects} perfect · {r.goods} good · {r.misses} missed
          {r.wrongLanes ? ` (${r.wrongLanes} wrong lane)` : ''}
        </span>
        {onClose && <button type="button" onClick={onClose} style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 8, border: '1px solid #ffb347', background: 'transparent', color: '#ffd75e', cursor: 'pointer' }}>CLOSE</button>}
      </div>
      {arenaLine && <div data-qa="recap-arena" style={{ fontSize: 12, color: '#ffd75e', marginTop: 4 }}>{arenaLine}</div>}
      {r.lanes.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(56px, max-content) minmax(0, 1fr) max-content', gap: '4px 8px', alignItems: 'center', marginTop: 8, fontSize: 12 }}>
          {r.lanes.map((l) => (
            <React.Fragment key={l.lane}>
              <span style={{ fontWeight: 800, color: colors[l.lane] }}>{labels[l.lane]}</span>
              <div data-qa="recap-lane" data-lane={l.lane} data-acc={l.accuracy.toFixed(3)} style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.08)' }}>
                <div style={{ width: pct(l.accuracy), height: '100%', borderRadius: 4, background: colors[l.lane] }} />
              </div>
              <span>{pct(l.accuracy)} · {l.hits}/{l.notes - l.extras}{l.extras ? ` · ${l.extras} extra` : ''}</span>
            </React.Fragment>
          ))}
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <div data-qa="recap-hist" style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 48, position: 'relative' }}>
          {r.hist.map((b) => {
            const inPerfect = b.toMs > -perfectMs && b.fromMs < perfectMs;
            return (
              <div key={b.fromMs} data-qa="recap-hist-bin" data-from={b.fromMs} data-count={b.count} title={`${b.fromMs}…${b.toMs} ms: ${b.count}`}
                style={{ flex: 1, height: `${Math.round((b.count / peak) * 100)}%`, minHeight: b.count ? 2 : 0, background: inPerfect ? '#b8e6c1' : '#ffb347', borderRadius: 2 }} />
            );
          })}
          <div aria-hidden style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#fff', opacity: 0.6 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, opacity: 0.7 }}>
          <span>← early 250 ms</span><span>on the beat</span><span>250 ms late →</span>
        </div>
        <div data-qa="recap-timing" style={{ fontSize: 12, marginTop: 2 }}>{performTimingLine(r.meanErrorMs)}</div>
      </div>
    </div>
  );
}
