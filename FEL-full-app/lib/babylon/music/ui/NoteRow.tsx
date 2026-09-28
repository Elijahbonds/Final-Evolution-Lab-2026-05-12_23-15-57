'use client';
// NoteRow — A PITCHED ROW'S NOTES (MUSIC-SUITE P4, "Pocket studio + melody", 2026-09-25). Owner decision #4: "scale-locked
// bass/lead notes". Opens under a pitched row of the grid (its ♪): a mini piano roll of ONE OCTAVE of the song's key —
// only the key's notes, high at the top — with an octave switch; each step's column picks that step's note. The rules are
// ui/noteMath.ts (tested) and the lock is StudioProject.withStep (every note the room writes goes through it).
//
// Before this phase a bass row played one note for ever (the kit's drone, scales.ts header), and there was no way to write
// a melody at all. Now:
//   * A NOTE ROW (bass, lead, keys) shows its register one octave window at a time (A minor bass: E1–G1, A1–G2, A2–E3); the
//     tonic row is shaded; the song's key is named in the header.
//   * A FLIP ROW shows the song's scale built on its chop (0 = as sliced, +3, +7 …) — a chop has no key until P5 (noteMath).
//   * A TAP lights the step on that note; a tap on the note it already plays clears it. A step whose note sits in another
//     octave window shows ▲ / ▼ at the edge of its column, so no note is hidden by the window.
//   * The columns are the grid's (the same page, the same template), so a column sits under its step.
//
// MUSIC-SUITE P4 FIX PASS (2026-09-25):
//   * A SCROLL IS NOT A NOTE. A cell picked on pointerdown with touch-action 'manipulation', so on a phone the page scrolled
//     AND the note was written: the review's 240 px finger scroll starting on step 4 of an open Bass NOTES scrolled the
//     page 563 → 878 and lit bass step 4 on E2 (a scroll landing on a lit note cleared it) — each an undo step, autosaved.
//     StepGrid's touch rule now applies here too: a mouse or pen picks on the down; a TOUCH picks on the lift, on the same
//     cell, within TAP_SLOP_PX of where it went down, and a scroll (touch-action pan-y: the browser takes it and sends
//     pointercancel) picks nothing. A locked row says why on the same terms.
//   * PHONE TARGETS ≥ 40 px: the note cells were 41 × 30 px and OCT / DONE 32 px tall (measured at 375 px).
import React, { useMemo, useRef, useState } from 'react';
import type { TrackState } from '../AudioEngine';
import { isNoteRow, keyLabel, type SongKey } from '../scales';
import { TAP_SLOP_PX, gridTemplate, isBeatStart, isTap, type GridLayout } from './gridMath';
import { noteChoices, noteOfStep, noteWindows, windowOf } from './noteMath';

export interface NoteRowProps {
  row: { id: string; label: string; track: TrackState };
  songKey: SongKey;
  layout: GridLayout;
  /** The steps the grid draws right now (its page). */
  steps: readonly number[];
  playhead: number;
  /** The grid is read-only (song mode's section, CELL's preview): taps say why instead. */
  locked: boolean;
  onPick: (step: number, midi: number) => void;
  onLocked: () => void;
  onClose: () => void;
}

export default function NoteRow({ row, songKey, layout, steps, playhead, locked, onPick, onLocked, onClose }: NoteRowProps) {
  const { track } = row;
  const windows = useMemo(() => noteWindows(track.sampleId, songKey), [track.sampleId, songKey]);
  // open on the window of the first lit note on this page (else the row's home: the tonic, or the chop as sliced)
  const home = useMemo(() => {
    const lit = steps.find((s) => track.pattern[s]);
    return windowOf(lit !== undefined ? noteOfStep(track, lit, songKey) : noteOfStep(track, -1, songKey), windows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windows]);
  const [win, setWin] = useState<number | null>(null);
  const wi = Math.max(0, Math.min(windows.length - 1, win ?? home));
  const w = windows[wi];
  const choices = w ? noteChoices(track.sampleId, songKey, w) : [];
  const tpl = gridTemplate(layout);
  const noteRow = isNoteRow(track.sampleId);
  const range = choices.length ? `${choices[choices.length - 1].label} – ${choices[0].label}` : '';
  const btn: React.CSSProperties = {
    minHeight: layout.compact ? 40 : 24, padding: '0 10px', borderRadius: 6, fontSize: 11, fontWeight: 800, cursor: 'pointer',
    border: '1px solid #7a5c9e', background: 'transparent', color: '#e8d9c2',
  };
  /** A touch that went down on a note cell: picked only if it lifts there as a tap (P4 FIX PASS). */
  const pending = useRef<{ id: number; step: number; midi: number; x: number; y: number } | null>(null);
  const act = (step: number, midi: number): void => { if (locked) onLocked(); else onPick(step, midi); };

  return (
    <div data-qa="note-row" data-row={track.sampleId} data-window={wi}
      style={{ margin: '4px 0 8px', padding: 6, borderRadius: 8, background: 'rgba(34,211,238,0.07)', border: '1px solid rgba(34,211,238,0.35)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 11 }}>
        <span style={{ fontWeight: 800, color: '#22d3ee' }}>♪ {row.label}</span>
        <span data-qa="note-row-key" style={{ opacity: 0.85 }}>
          {noteRow ? `${keyLabel(songKey)} · ${range}` : `the chop in ${keyLabel(songKey)}'s scale · 0 = as sliced`}
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4 }}>
          <button type="button" data-qa="note-oct-down" style={btn} disabled={wi <= 0} onClick={() => setWin(wi - 1)} aria-label="octave down">▼ OCT</button>
          <button type="button" data-qa="note-oct-up" style={btn} disabled={wi >= windows.length - 1} onClick={() => setWin(wi + 1)} aria-label="octave up">OCT ▲</button>
          <button type="button" data-qa="note-close" style={btn} onClick={onClose}>DONE</button>
        </span>
      </div>
      <div role="grid" aria-label={`${row.label} notes`} style={{ display: 'grid', gridTemplateColumns: tpl.columns, gap: tpl.gap, userSelect: 'none' }}>
        {choices.map((c, ci) => (
          <React.Fragment key={c.midi}>
            {!layout.compact && <div style={{ fontSize: 10, alignSelf: 'center', fontWeight: c.tonic ? 800 : 400, opacity: c.tonic ? 1 : 0.8 }}>{c.label}</div>}
            {steps.map((s) => {
              const on = track.pattern[s] === true;
              const note = on ? noteOfStep(track, s, songKey) : null;
              const lit = note === c.midi;
              // a lit step whose note is outside this window: an arrow at the column's top / bottom edge
              const above = on && ci === 0 && note !== null && w && note > w.hi;
              const below = on && ci === choices.length - 1 && note !== null && w && note < w.lo;
              return (
                <div key={s} role="gridcell" aria-selected={lit} aria-label={`step ${s + 1} ${c.label}${lit ? ' on' : ''}`}
                  data-qa="note-cell" data-step={s} data-note={c.midi} data-on={lit ? '1' : '0'}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    if (e.pointerType === 'touch') { pending.current = { id: e.pointerId, step: s, midi: c.midi, x: e.clientX, y: e.clientY }; return; }
                    act(s, c.midi);
                  }}
                  onPointerUp={(e) => {
                    const t = pending.current; pending.current = null;
                    if (!t || t.id !== e.pointerId || t.step !== s || t.midi !== c.midi) return;
                    if (isTap(e.clientX - t.x, e.clientY - t.y, TAP_SLOP_PX)) act(s, c.midi);
                  }}
                  onPointerCancel={() => { pending.current = null; }}
                  style={{
                    height: layout.compact ? 40 : 20, minWidth: 0, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: lit || c.tonic ? 800 : 400, cursor: locked ? 'not-allowed' : 'pointer', touchAction: 'pan-y',
                    color: lit ? '#101018' : c.tonic ? '#f5ead9' : 'rgba(245,234,217,0.55)',
                    background: lit ? '#22d3ee' : c.tonic ? 'rgba(255,215,94,0.14)' : 'rgba(0,0,0,0.22)',
                    boxShadow: isBeatStart(s) && s !== steps[0] ? 'inset 2px 0 0 #9a7cc0' : undefined,
                    outline: playhead === s ? '1px solid #22d3ee' : undefined,
                  }}>
                  {above ? '▲' : below ? '▼' : layout.compact || lit ? c.label : ''}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      {!noteRow && <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>0 = the chop as sliced · +12 = an octave up · the steps follow the song&apos;s scale</div>}
    </div>
  );
}
