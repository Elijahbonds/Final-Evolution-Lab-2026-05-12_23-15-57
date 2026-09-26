'use client';
// StepGrid — THE POCKET GRID (MUSIC-SUITE P4, "Pocket studio + melody", 2026-09-25). Replaces the grid StudioMode drew
// inline (StudioMode.tsx ~:1094-1123 before this phase: one CSS grid of `90px repeat(16, 1fr)` whose cells were divs with
// an onClick, one cell per tap).
//
// What P1 measured and the map found (outbox musicsuite/BASELINE.md "Grid cell size", understand-wf_3a55346f-032.json):
// 16.5 px cells at 375 px and a page 418 px wide (43 px of sideways scroll); no stroke (sixteen hats = sixteen taps); no
// beat lines to count by; no cursor; the playhead a 2 px outline only. The rules are ui/gridMath.ts (tested); this draws:
//   * THE PHONE GRID (< 640 px): one page of 8 steps (1–8 / 9–16), the row's name on its own line so the 8 cells share the
//     width (≥ 40 px at 375 px), page buttons and a 16-step strip above the cells (the playhead lights its step there on
//     either page, and the page button it is on shows ▶). A sideways swipe on that strip turns the page; the CELLS paint
//     (a swipe that started on a cell would have been a stroke, so the two never compete).
//   * DESKTOP: all 16 steps, a name column.
//   * PAINT: a pointer down on a cell decides the stroke (off → paints ON, on → paints OFF) and every cell it crosses gets
//     that (gridMath strokeStart / strokeEnter, with the skipped cells of a fast drag filled in). On TOUCH the first cell
//     waits until the finger either lifts (a tap) or moves sideways into the next cell (a stroke): a finger that goes down
//     on the grid to SCROLL the page (touch-action: pan-y — vertical drags still scroll) paints nothing when the browser
//     takes the scroll (pointercancel). A mouse or pen paints on the down.
//   * BEATS shaded every 4 steps with a brighter edge on each beat's first cell; the PLAYHEAD outlined; the key CURSOR
//     dashed; a pitched row's lit cells show their note ('A1', '+3'); a row the desk silences (muted, or another row
//     soloed) is dimmed with an M / S badge, so a silent row is never a mystery.
//   * A pitched row's ♪ opens its NoteRow (the room renders it; it spans the row's width, under the row).
//
// MUSIC-SUITE P4 FIX PASS (2026-09-25):
//   * ONE TOGGLE PER TAP. A pointer's own click was told apart from a script's by a guard cleared in setTimeout(0) after
//     the pointerup — a race with the click the tap makes (measured in Chromium's mobile emulation: the click won by 1.2 ms,
//     only because the pointerup's render delayed the timer; on a device Chrome's GestureTap comes after the touchend ack
//     and iOS WebKit's synthetic click on a later run loop — assumption: there the timer can win, and a tap lights and
//     unlights the cell, two undo steps). Now a pointer's click (e.detail ≥ 1) is always the stroke's and is ignored, and a
//     click with detail 0 (a script's element.click(), Enter / Space on an AT's activation) toggles — the rule the TAP
//     buttons already use (StudioMode). No timer.
//   * A STROKE THAT LEAVES THE CELLS IS BROKEN THERE (gridMath strokeBreak): back on a cell, it paints from that cell, not
//     the line from where it left (it filled cells the pointer never crossed, across an open NoteRow).
//   * KEYBOARD FOCUS SHOWS. The grid is focusable with `outline: none` and no cursor until the first arrow (WCAG 2.4.7):
//     focused from the keyboard it draws a ring, and the room puts the cursor on the page's first step (onKeyFocus).
import React, { useEffect, useRef, useState } from 'react';
import type { TrackState } from '../AudioEngine';
import {
  beatShade, clampPage, gridTemplate, isBeatStart, pageLabel, pageOfStep, stepsOnPage, strokeBreak, strokeEnter, strokeStart, swipePage,
  type GridCell, type GridLayout, type Stroke,
} from './gridMath';

export interface StepGridRow {
  id: string;
  label: string;
  track: TrackState;
  /** Plays its step's note (bass, lead, keys, flip_*): has a ♪ and shows note names. */
  pitched: boolean;
  /** Each ON pitched step's note label ('A1', '+3'), by step; null elsewhere. */
  notes?: readonly (string | null)[];
  /** The desk keeps this row silent: 'mute' (its M) or 'solo' (another row's S). */
  silent?: 'mute' | 'solo' | null;
}

export interface StepGridProps {
  kit: readonly StepGridRow[];
  flip: readonly StepGridRow[];
  /** A heading for the Flip section (null = none). */
  flipHead?: React.ReactNode;
  layout: GridLayout;
  page: number;
  onPage: (page: number) => void;
  playhead: number;
  cursor: { row: string; step: number } | null;
  /** The grid shows something that is not the player's to edit (song mode's section, CELL's preview). */
  locked: 'preview' | 'song' | null;
  /** A stroke's cells (by row id), the value they take, and the stroke's number (the room makes one undo step of it). */
  onPaint: (cells: { row: string; step: number }[], value: boolean, stroke: number) => void;
  /** A press on a locked grid (the room says why). */
  onLocked: () => void;
  /** A click that no pointer stroke handled (a script's element.click(), an assistive tech's activation): one toggle. */
  onToggle: (row: string, step: number) => void;
  openNote: string | null;
  onOpenNote: (row: string | null) => void;
  /** The NoteRow for a pitched row (drawn under it while open). */
  renderNoteRow?: (row: StepGridRow) => React.ReactNode;
  /** The grid's focus target (the room focuses it when the arrow keys move the cursor). */
  focusRef?: React.RefObject<HTMLDivElement>;
  /** MUSIC-SUITE P4 FIX PASS: the grid got the focus from the KEYBOARD (Tab): the room shows the cursor. */
  onKeyFocus?: () => void;
}

const ON = '#ffb347';
const SHADE = ['#35264c', '#2a1d3d'] as const;

interface Live {
  stroke: Stroke;
  id: number;
  pointerId: number;
  /** Touch: the first cell is not painted until the finger lifts or moves sideways into another cell. */
  pending: boolean;
  start: GridCell;
}

let strokeCounter = 0;

export default function StepGrid(p: StepGridProps) {
  const { kit, flip, layout, playhead, cursor, locked } = p;
  const rows = [...kit, ...flip];
  const page = clampPage(p.page, layout);
  const steps = stepsOnPage(page, layout);
  const tpl = gridTemplate(layout);
  const liveRef = useRef<Live | null>(null);
  const latest = useRef(p); latest.current = p;
  /** MUSIC-SUITE P4 FIX PASS: the grid holds the focus from the keyboard — draw the ring. */
  const [ring, setRing] = useState(false);
  /**
   * The focus comes from a PRESS (a cell's pointerdown focuses the grid; so does a press on its names): not a keyboard
   * focus, whatever :focus-visible says — Chromium matches it on a script focus() when the last input was a key (measured:
   * a Space on the splash, then a mouse press on a cell, lit the ring and dropped a cursor on kick step 1).
   */
  const pressFocus = useRef(false);
  const rowsRef = useRef(rows); rowsRef.current = rows;
  const swipeRef = useRef<{ x: number; y: number; id: number } | null>(null);

  const paint = (cells: GridCell[], value: boolean, id: number): void => {
    const rs = rowsRef.current;
    const out = cells.filter((c) => rs[c.row]).map((c) => ({ row: rs[c.row].id, step: c.step }));
    if (out.length) latest.current.onPaint(out, value, id);
  };

  // the stroke ends wherever the pointer is let go (a mouse released outside the grid included)
  useEffect(() => {
    const end = (e: PointerEvent): void => {
      const live = liveRef.current;
      if (!live || e.pointerId !== live.pointerId) return;
      liveRef.current = null;
      if (e.type === 'pointerup' && live.pending) paint([live.start], live.stroke.value, live.id);   // a touch tap
      // (the click this pointerup makes carries detail ≥ 1: the cell ignores it — no guard, no timer: P4 FIX PASS)
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => { window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cellAt = (x: number, y: number): GridCell | null => {
    const el = typeof document !== 'undefined' ? document.elementFromPoint(x, y) : null;
    const c = (el as HTMLElement | null)?.closest?.('[data-qa="cell"]') as HTMLElement | null;
    if (!c) return null;
    const row = rowsRef.current.findIndex((r) => r.id === c.dataset.row);
    const step = Number(c.dataset.step);
    return row >= 0 && Number.isInteger(step) ? { row, step } : null;
  };

  const down = (e: React.PointerEvent, row: number, step: number, on: boolean): void => {
    if (e.button !== 0) return;
    pressFocus.current = true;
    p.focusRef?.current?.focus({ preventScroll: true });
    if (locked) { p.onLocked(); return; }
    const { stroke } = strokeStart({ row, step }, on);
    const id = ++strokeCounter;
    const touch = e.pointerType === 'touch';
    liveRef.current = { stroke, id, pointerId: e.pointerId, pending: touch, start: { row, step } };
    if (!touch) paint([{ row, step }], stroke.value, id);
  };
  const move = (e: React.PointerEvent): void => {
    const live = liveRef.current;
    if (!live || e.pointerId !== live.pointerId) return;
    const c = cellAt(e.clientX, e.clientY);
    if (!c) { live.stroke = strokeBreak(live.stroke); return; }   // over no cell: the line breaks here (P4 FIX PASS)
    if (c.row === live.stroke.at.row && c.step === live.stroke.at.step && !live.stroke.broken) return;
    if (live.pending) { live.pending = false; paint([live.start], live.stroke.value, live.id); }
    const next = strokeEnter(live.stroke, c);
    live.stroke = next.stroke;
    paint(next.paint, live.stroke.value, live.id);
  };
  /** A click on a cell: a pointer's (detail ≥ 1) belongs to its stroke and is ignored; one with no pointer toggles. */
  const click = (row: string, step: number, detail: number): void => {
    if (detail > 0) return;
    if (locked) { p.onLocked(); return; }
    p.onToggle(row, step);
  };

  // the page strip: page buttons, the 16-step overview (the playhead lights its step), and the swipe
  const pager = layout.compact ? (
    <div data-qa="grid-pager" style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 4px', touchAction: 'pan-y', userSelect: 'none' }}
      onPointerDown={(e) => { swipeRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; }}
      onPointerUp={(e) => {
        const s = swipeRef.current; swipeRef.current = null;
        if (!s || s.id !== e.pointerId) return;
        const to = swipePage(page, e.clientX - s.x, e.clientY - s.y, layout);
        if (to !== page) p.onPage(to);
      }}>
      {Array.from({ length: layout.pages }, (_, i) => {
        const here = playhead >= 0 && pageOfStep(playhead, layout) === i;
        return (
          <button key={i} type="button" data-qa="grid-page" data-page={i} aria-pressed={i === page}
            onClick={() => p.onPage(i)}
            style={{
              minHeight: 36, minWidth: 64, padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer',
              border: `1px solid ${i === page ? '#ffd75e' : '#5a4470'}`, background: i === page ? 'rgba(255,215,94,0.16)' : 'transparent', color: '#f5ead9',
            }}>
            {here ? '▶ ' : ''}{pageLabel(i, layout)}
          </button>
        );
      })}
      <div data-qa="step-overview" aria-hidden style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${layout.steps}, 1fr)`, gap: 2, padding: '10px 0' }}>
        {Array.from({ length: layout.steps }, (_, s) => (
          <div key={s} data-step={s} data-head={playhead === s ? '1' : '0'}
            style={{
              height: 6, borderRadius: 2,
              background: playhead === s ? '#22d3ee' : pageOfStep(s, layout) === page ? '#7a5c9e' : '#3a2b52',
              marginLeft: isBeatStart(s) && s > 0 ? 2 : 0,
            }} />
        ))}
      </div>
    </div>
  ) : null;

  const rowEls = (list: readonly StepGridRow[], offset: number): React.ReactNode[] => list.map((r, i) => {
    const ri = offset + i;
    const open = p.openNote === r.id && r.pitched;
    const label = (
      <div data-qa="grid-row" data-row={r.id} data-silent={r.silent ?? ''}
        style={{
          fontSize: 11, alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
          opacity: r.silent ? 0.55 : 0.9, ...(layout.compact ? { gridColumn: '1 / -1', marginTop: i === 0 ? 0 : 4 } : {}),
        }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
        {r.silent && <span data-qa="row-silent" title={r.silent === 'mute' ? 'muted on the mixer' : 'silent: another row is soloed'}
          style={{ fontSize: 9, fontWeight: 800, padding: '0 4px', borderRadius: 4, background: '#5a4470', color: '#fff' }}>{r.silent === 'mute' ? 'M' : 'S'}</span>}
        {r.pitched && (
          <button type="button" data-qa="note-open" data-row={r.id} aria-expanded={open} title="Notes: pick each step's note in the song's key"
            onClick={() => p.onOpenNote(open ? null : r.id)}
            style={{
              marginLeft: layout.compact ? 'auto' : 0, minHeight: layout.compact ? 36 : 20, padding: '0 8px', borderRadius: 6, fontSize: 11, fontWeight: 800,
              cursor: 'pointer', border: `1px solid ${open ? '#22d3ee' : '#7a5c9e'}`, background: open ? 'rgba(34,211,238,0.18)' : 'transparent', color: open ? '#22d3ee' : '#e8d9c2',
            }}>
            ♪{layout.compact ? (open ? ' NOTES ▾' : ' NOTES') : ''}
          </button>
        )}
      </div>
    );
    const cells = steps.map((s) => {
      const on = r.track.pattern[s] === true;
      const head = playhead === s;
      const cur = cursor?.row === r.id && cursor.step === s;
      const note = on ? r.notes?.[s] ?? null : null;
      return (
        <div key={s} role="gridcell" aria-selected={on} aria-label={`${r.label} step ${s + 1}${on ? ' on' : ''}${note ? ` ${note}` : ''}`}
          data-qa="cell" data-row={r.id} data-step={s} data-on={on ? '1' : '0'} data-beat={beatShade(s)}
          onPointerDown={(e) => down(e, ri, s, on)}
          onClick={(e) => click(r.id, s, e?.detail ?? 0)}
          style={{
            aspectRatio: '1', minWidth: 0, borderRadius: 5, border: `1px solid ${on ? '#ffd75e' : '#5a4470'}`,
            background: on ? ON : SHADE[beatShade(s)], display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: isBeatStart(s) && s !== steps[0] ? 'inset 2px 0 0 #9a7cc0' : undefined,
            outline: cur ? '2px dashed #ffd75e' : head ? '2px solid #22d3ee' : undefined, outlineOffset: cur ? 1 : 0,
            opacity: r.silent ? 0.55 : 1, cursor: locked ? 'not-allowed' : 'pointer', touchAction: 'pan-y', userSelect: 'none',
            WebkitUserSelect: 'none', WebkitTapHighlightColor: 'transparent',
          }}>
          {note && <span style={{ fontSize: layout.compact ? 10 : 9, fontWeight: 800, color: '#2a1a10', pointerEvents: 'none' }}>{note}</span>}
        </div>
      );
    });
    return (
      <React.Fragment key={r.id}>
        {label}
        {cells}
        {open && p.renderNoteRow && <div data-qa="note-row-slot" style={{ gridColumn: '1 / -1' }}>{p.renderNoteRow(r)}</div>}
      </React.Fragment>
    );
  });

  const section = (qa: string, list: readonly StepGridRow[], offset: number): React.ReactNode => (
    <div data-qa={qa} style={{ display: 'grid', gridTemplateColumns: tpl.columns, gap: tpl.gap, marginTop: 6, alignItems: 'center' }}>
      {rowEls(list, offset)}
    </div>
  );

  return (
    <div ref={p.focusRef} tabIndex={0} role="grid" data-qa="step-grid" data-compact={layout.compact ? '1' : '0'} data-page={page}
      data-focus-ring={ring ? '1' : '0'}
      aria-label={`Step grid, steps ${pageLabel(page, layout)} — arrow keys move, Enter lights a step`}
      onPointerDownCapture={() => {
        // the focus a press gives happens in this same input task (pointerdown / mousedown): marked for it, then cleared,
        // so a press on a child button (which takes the focus itself) can't leave the next Tab-in looking like a press
        pressFocus.current = true; setRing(false);
        setTimeout(() => { pressFocus.current = false; }, 0);
      }}
      onFocus={(e) => {
        if (e.target !== e.currentTarget) return;
        if (pressFocus.current) { pressFocus.current = false; setRing(false); return; }   // focused by a press, not the keyboard
        let visible = false;
        try { visible = (e.currentTarget as HTMLElement).matches(':focus-visible'); } catch { /* an old browser: no ring */ }
        setRing(visible);
        if (visible) p.onKeyFocus?.();
      }}
      onBlur={(e) => { if (e.target === e.currentTarget) { setRing(false); pressFocus.current = false; } }}
      onPointerMove={move}
      style={{
        outline: 'none', maxWidth: '100%', userSelect: 'none', WebkitUserSelect: 'none', borderRadius: 8,
        boxShadow: ring ? '0 0 0 2px #22d3ee' : undefined,
      }}>
      {pager}
      {section('kit-grid', kit, 0)}
      {flip.length > 0 && (
        <>
          {p.flipHead}
          {section('flip-grid', flip, kit.length)}
        </>
      )}
    </div>
  );
}
