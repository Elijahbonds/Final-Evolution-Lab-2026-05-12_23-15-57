'use client';
// Waveform — THE CHOP EDITOR'S VIEW (MUSIC-SUITE P5, "The Flip, for real", 2026-09-25).
//
// What was wrong: the FLIP tab never showed the sound. A source was cut by TRANSIENTS or GRID and the player saw sixteen
// buttons — no way to see where a cut fell, move it off a breath, or cut a hit in two. This draws the bank's source with
// every pad's region on it and the selected pad's two markers as handles:
//   · DRAG a marker (mouse or touch; the pointer is captured, so a drag that leaves the canvas keeps going). The parent
//     moves it with chopEdit.moveEdge — snapped to a zero crossing within 2 ms, never under 10 ms, and a marker two pads
//     share moves for both. Every move is an autosaved edit; one drag is one undo step.
//   · TAP a region: that pad is selected (and heard); the tap also sets the + SLICE point (the dashed line).
//   · KEYS (the canvas focused): ← / → move the selected pad's start by 5 ms (⇧: 50 ms), with ⌥ its end.
// It draws what it is given (pure chopEdit.peaks / grabAt / padAt); it keeps no state of the project's.
//
// MUSIC-SUITE P5 FIX PASS (2026-09-25): A TAP MOVED A CUT. A press within the grab distance of ANY marker started a drag
// and the release moved that marker to the absolute pointer position, never checking that the pointer had moved: on a
// phone 325 of 343 pixel columns grabbed a marker, so tapping the middle of slice 5 moved pad 5's start 335 ms, and a
// page scroll that began on the canvas (pointercancel) moved the grabbed marker to the touch-down point. The press is a
// gesture now (chopEdit gestureStart / gestureMove / gestureEnd, tested in node): nothing moves until the pointer travels
// DRAG_SLOP_PX, a drag moves the marker by the pointer's travel, a still release is a TAP (select + the + SLICE point),
// a cancel before the slop is nothing, the grab distance is at most a third of the slice under the pointer, and on touch
// only the selected pad's markers can be grabbed. And ZOOM (`zoom`): the selected slice ± a margin fills the canvas.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fullView, gestureEnd, gestureMove, gestureStart, grabAt, padAt, peaks, pointerKind, pxOfSample, zoomView,
  type Edge, type Region, type WaveGesture, type WaveView,
} from '../chopEdit';

export interface WaveformProps {
  /** The bank's source, mono, at the rate it was decoded at (null = nothing loaded). */
  mono: Float32Array | null;
  /** Every pad's region on it, in those samples. */
  regions: readonly Region[];
  selected: number | null;
  /** The + SLICE point (sample), or null. */
  cursor: number | null;
  onSelect: (pad: number) => void;
  onCursor: (at: number) => void;
  /** A marker moved to `at` ('move' while dragging, 'end' once let go). */
  onEdge: (pad: number, edge: Edge, at: number, phase: 'move' | 'end') => void;
  /** An arrow key on the focused canvas: move the selected pad's `edge` by `dir` (big = the long step). */
  onNudge?: (edge: Edge, dir: -1 | 1, big: boolean) => void;
  height?: number;
  /** MUSIC-SUITE P5 FIX PASS: show the selected slice ± a margin instead of the whole source. */
  zoom?: boolean;
  /** The decode's sample rate (ZOOM's minimum margin is 50 ms of it). */
  rate?: number;
}

const C = {
  bg: '#1a1226', wave: '#c9a6ff', region: ['rgba(122,92,158,0.28)', 'rgba(122,92,158,0.14)'], sel: 'rgba(255,179,71,0.26)',
  marker: '#7a5c9e', handle: '#ffb347', cursor: '#22d3ee', text: '#e8d9c2', mid: 'rgba(232,217,194,0.18)',
};

export default function Waveform({ mono, regions, selected, cursor, onSelect, onCursor, onEdge, onNudge, height = 120, zoom = false, rate = 44100 }: WaveformProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState(600);
  const [hoverEdge, setHoverEdge] = useState(false);
  /** MUSIC-SUITE P5 FIX PASS: the press in progress (chopEdit WaveGesture), by pointer id. */
  const press = useRef<{ id: number; g: WaveGesture } | null>(null);
  const len = mono?.length ?? 0;

  // the canvas is as wide as its column (a phone's 343 px or a desktop's 900), measured, not assumed
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = (): void => setWidth(Math.max(120, Math.round(el.clientWidth)));
    measure();
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // MUSIC-SUITE P5 FIX PASS: the view — the whole source, or (ZOOM) the selected slice ± a margin
  const selRegion = regions.find((r) => r.pad === selected) ?? null;
  const view = useMemo<WaveView>(
    () => (zoom && selRegion ? zoomView(len, width, selRegion, rate) : fullView(len, width)),
    [zoom, selRegion?.start, selRegion?.end, len, width, rate],   // eslint-disable-line react-hooks/exhaustive-deps
  );
  const pk = useMemo(() => (mono && mono.length ? peaks(mono, width, view.from, view.to) : null), [mono, width, view.from, view.to]);
  const xOf = useCallback((s: number): number => (len ? pxOfSample(view, s) : 0), [len, view]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = typeof window !== 'undefined' ? Math.min(3, window.devicePixelRatio || 1) : 1;
    cv.width = Math.round(width * dpr); cv.height = Math.round(height * dpr);
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = C.bg; g.fillRect(0, 0, width, height);
    const mid = height / 2;
    // regions, the selected one on top
    const ordered = [...regions].sort((a, b) => (a.pad === selected ? 1 : 0) - (b.pad === selected ? 1 : 0) || a.start - b.start);
    ordered.forEach((r, k) => {
      g.fillStyle = r.pad === selected ? C.sel : C.region[k % 2];
      g.fillRect(xOf(r.start), 0, Math.max(1, xOf(r.end) - xOf(r.start)), height);
    });
    g.fillStyle = C.mid; g.fillRect(0, mid, width, 1);
    if (pk) {
      g.fillStyle = C.wave;
      for (let x = 0; x < pk.min.length; x++) {
        const top = mid - pk.max[x] * (mid - 4), bot = mid - pk.min[x] * (mid - 4);
        g.fillRect(x, top, 1, Math.max(1, bot - top));
      }
    }
    // every pad's start marker and number; the selected pad's two handles
    g.font = '10px system-ui, sans-serif'; g.textBaseline = 'top';
    for (const r of regions) {
      const x = xOf(r.start);
      if (x < -1 || x > width + 1) continue;
      g.fillStyle = C.marker; g.fillRect(Math.round(x), 0, 1, height);
      g.fillStyle = C.text; g.fillText(String(r.pad + 1), Math.round(x) + 3, 3);
    }
    if (selRegion) {
      for (const x of [xOf(selRegion.start), xOf(selRegion.end)]) {
        g.fillStyle = C.handle;
        g.fillRect(Math.round(x) - 1, 0, 3, height);
        g.fillRect(Math.round(x) - 5, 0, 11, 8);
        g.fillRect(Math.round(x) - 5, height - 8, 11, 8);
      }
    }
    if (cursor !== null && len) {
      g.fillStyle = C.cursor;
      for (let y = 0; y < height; y += 6) g.fillRect(Math.round(xOf(cursor)), y, 1, 3);
    }
    if (!pk) { g.fillStyle = C.text; g.textBaseline = 'middle'; g.fillText('load a source — its waveform shows here', 10, mid); }
    if (zoom && selRegion) { g.fillStyle = C.text; g.textBaseline = 'bottom'; g.fillText('ZOOM', width - 36, height - 3); }
  }, [pk, regions, selected, selRegion, cursor, width, height, xOf, len, zoom]);

  /** The pointer's x on the canvas (CSS px) and the view at that width (the element may be wider than measured). */
  const at = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; v: WaveView } => {
    const r = e.currentTarget.getBoundingClientRect();
    const w = r.width > 0 ? r.width : width;
    return { x: e.clientX - r.left, v: { ...view, width: w } };
  };

  return (
    <div ref={wrapRef} style={{ width: '100%', marginTop: 10 }}>
      <canvas
        ref={canvasRef}
        data-qa="flip-waveform"
        tabIndex={0}
        aria-label="Waveform of the bank's source. Tap a slice to select and hear it; then drag one of its markers to move that cut. Arrow keys move the selected pad's start by 5 ms, with Shift 50 ms, with Alt its end."
        style={{ width: '100%', height, display: 'block', borderRadius: 10, touchAction: 'pan-y', cursor: hoverEdge ? 'ew-resize' : 'pointer', outlineOffset: 2 }}
        onPointerDown={(e) => {
          if (!len) return;
          const { x, v } = at(e);
          const g = gestureStart(regions, v, x, pointerKind(e.pointerType), selected);
          press.current = { id: e.pointerId, g };
          // a grabbed marker keeps the pointer (a drag that leaves the canvas keeps going); nothing moves yet
          if (g.grab) e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const p = press.current;
          if (p && p.id === e.pointerId) {
            const { x, v } = at(e);
            const r = gestureMove(p.g, v, x);
            p.g = r.g;
            if (r.move) onEdge(r.move.pad, r.move.edge, r.move.at, 'move');
            return;
          }
          if (e.pointerType === 'mouse' && len) { const { x, v } = at(e); setHoverEdge(!!grabAt(regions, v, x, 'mouse', selected)); }
        }}
        onPointerUp={(e) => {
          const p = press.current;
          if (!p || p.id !== e.pointerId) return;
          press.current = null;
          e.currentTarget.releasePointerCapture?.(e.pointerId);
          const { x, v } = at(e);
          const r = gestureEnd(p.g, v, x, false);
          if (r.end) { onEdge(r.end.pad, r.end.edge, r.end.at, 'end'); return; }
          if (r.tap === null) return;
          // a TAP: the + SLICE point, and the slice under it selected (and heard)
          onCursor(r.tap);
          const pad = padAt(regions, r.tap, selected);
          if (pad >= 0) onSelect(pad);
        }}
        onPointerCancel={(e) => {
          const p = press.current;
          if (!p || p.id !== e.pointerId) return;
          press.current = null;
          const { x, v } = at(e);
          const r = gestureEnd(p.g, v, x, true);   // before the slop: nothing; a drag keeps where it got to
          if (r.end) onEdge(r.end.pad, r.end.edge, r.end.at, 'end');
        }}
        onKeyDown={(e) => {
          if (!onNudge || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
          e.preventDefault();
          e.stopPropagation();
          onNudge(e.altKey ? 'end' : 'start', e.key === 'ArrowLeft' ? -1 : 1, e.shiftKey);
        }}
      />
    </div>
  );
}
