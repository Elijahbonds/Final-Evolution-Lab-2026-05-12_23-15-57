'use client';

// The DRAW PAD for a player-drawn stamp (IMPROVE (2026-10-06), CREATOR-PLAN phase 4c; lib/creator/look/marks.ts).
// A 128 × 128 one-colour pad: draw or erase with a round brush, optionally mirrored left/right, clear, start from a disc.
// The colour, the outline, the size and the placement are the paint layer's (the Paint tab's sliders), so the pad is only
// the shape. Each stroke is one undo step (committed on pointer-up). The meter shows how detailed the drawing is against
// MAX_MARK_RUNS — the cap that keeps a mark a drawing (and small); a stroke past it is refused, with a note.

import { useEffect, useRef, useState } from 'react';
import { Eraser, FlipHorizontal, Paintbrush, RotateCcw } from 'lucide-react';
import { MARK_SIZE, MAX_MARK_RUNS, discMark, emptyMark, markComplexity, strokeMark } from '@/lib/creator/look/marks';

export interface MarkPadProps {
  /** the mark's cells (MARK_SIZE²), or null for a fresh pad */
  cells: Uint8Array | null;
  /** a finished stroke (or clear): the new cells. Return false when it was refused (empty or too detailed). */
  onCommit: (cells: Uint8Array) => boolean;
}

export function MarkPad({ cells, onCommit }: MarkPadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const work = useRef<Uint8Array>(cells ? cells.slice() : emptyMark());
  const last = useRef<{ x: number; y: number } | null>(null);
  const [ink, setInk] = useState(true);
  const [mirror, setMirror] = useState(false);
  const [brush, setBrush] = useState(4);
  const [runs, setRuns] = useState(() => markComplexity(work.current));
  const [refused, setRefused] = useState(false);

  const paint = () => {
    const c = canvasRef.current?.getContext('2d');
    if (!c) return;
    const img = c.createImageData(MARK_SIZE, MARK_SIZE);
    const w = work.current;
    for (let i = 0; i < w.length; i++) {
      const v = w[i] ? 240 : 24;
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = w[i] ? 250 : 34; img.data[i * 4 + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  };
  // a different mark (another layer selected, an undo): start from it
  useEffect(() => { work.current = cells ? cells.slice() : emptyMark(); setRuns(markComplexity(work.current)); paint(); }, [cells]);   // eslint-disable-line react-hooks/exhaustive-deps

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * MARK_SIZE, y: ((e.clientY - r.top) / r.height) * MARK_SIZE };
  };
  const commit = (next: Uint8Array) => {
    const ok = onCommit(next.slice());
    setRefused(!ok);
    if (!ok) work.current = cells ? cells.slice() : emptyMark();   // refused: back to the last good drawing
    setRuns(markComplexity(work.current));
    paint();
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/60">
        <button type="button" aria-pressed={ink} onClick={() => setInk(true)} className={`flex items-center gap-1 rounded-full px-2.5 py-1 ${ink ? 'bg-cyan-400 text-black' : 'bg-white/5'}`}><Paintbrush className="h-3 w-3" /> Draw</button>
        <button type="button" aria-pressed={!ink} onClick={() => setInk(false)} className={`flex items-center gap-1 rounded-full px-2.5 py-1 ${!ink ? 'bg-cyan-400 text-black' : 'bg-white/5'}`}><Eraser className="h-3 w-3" /> Erase</button>
        <label className="flex items-center gap-1"><input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} className="accent-cyan-400" aria-label="Mirror drawing" /><FlipHorizontal className="h-3 w-3" /> Mirror</label>
        <label className="flex items-center gap-1">Brush <input type="range" min={1} max={16} value={brush} onChange={(e) => setBrush(Number(e.target.value))} className="w-20 accent-cyan-400" aria-label="Brush size" /></label>
        <button type="button" onClick={() => { work.current = discMark(); commit(work.current); }} className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/10"><RotateCcw className="h-3 w-3" /> Start over</button>
      </div>
      <canvas ref={canvasRef} width={MARK_SIZE} height={MARK_SIZE} aria-label="Draw pad" className="block h-64 w-64 cursor-crosshair rounded-lg border border-white/15"
        style={{ imageRendering: 'pixelated', touchAction: 'none' }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); const p = at(e); last.current = p; strokeMark(work.current, p.x, p.y, p.x, p.y, brush, ink, mirror); paint(); }}
        onPointerMove={(e) => { if (!last.current) return; const p = at(e); strokeMark(work.current, last.current.x, last.current.y, p.x, p.y, brush, ink, mirror); last.current = p; paint(); }}
        onPointerUp={() => { if (!last.current) return; last.current = null; commit(work.current); }}
        onPointerCancel={() => { last.current = null; commit(work.current); }} />
      <div className="text-[10px] text-white/40">
        Detail {runs} / {MAX_MARK_RUNS}{refused && <span className="ml-2 text-amber-300">That stroke made it empty or too detailed — kept the last drawing.</span>}
        <span className="block">Draw your own emblem. Colour, outline, size and where it sits are set below like any stamp.</span>
      </div>
    </div>
  );
}
