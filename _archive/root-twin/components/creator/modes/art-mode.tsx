'use client';

// Art mode — canvas painter producing court/board/kit/UI skins. Stack-based
// flood fill, 20-step undo, mirror symmetry.

import React, { useRef, useState, useEffect, useCallback } from 'react';

type Tool = 'brush' | 'eraser' | 'fill' | 'line' | 'rect' | 'circle' | 'spray';
type Surface = 'court' | 'board' | 'kit' | 'ui';

export interface ArtPublishPayload {
  kind: 'art';
  canvasDataUrl: string;
  palette: string[];
  brushSetId: string;
  appliedSurface: Surface;
}

const PALETTES: Record<string, string[]> = {
  Venice: ['#1b1b1e', '#f4f1de', '#e07a5f', '#3d5a80', '#81b29a', '#f2cc8f'],
  Neon: ['#0d0221', '#ff006e', '#8338ec', '#3a86ff', '#ffbe0b', '#fb5607'],
  Blacktop: ['#111111', '#2f3e46', '#84a98c', '#cad2c5', '#ffffff', '#d90429'],
  Sunset: ['#03071e', '#370617', '#9d0208', '#dc2f02', '#f48c06', '#ffba08'],
};
const SIZE = 1024;

export default function ArtMode({ onPublish }: { onPublish: (p: ArtPublishPayload) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawing = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const snapshot = useRef<ImageData | null>(null);
  const [tool, setTool] = useState<Tool>('brush');
  const [color, setColor] = useState('#e07a5f');
  const [size, setSize] = useState(12);
  const [paletteName, setPaletteName] = useState('Venice');
  const [surface, setSurface] = useState<Surface>('court');
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [symmetry, setSymmetry] = useState(false);

  useEffect(() => {
    const c = canvasRef.current!;
    c.width = SIZE; c.height = SIZE;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f4f1de';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctxRef.current = ctx;
    setUndoStack([c.toDataURL()]);
  }, []);

  const pushUndo = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    setUndoStack((s) => [...s.slice(-19), c.toDataURL()]);
  }, []);

  const undo = () => {
    if (undoStack.length < 2) return;
    const prev = undoStack[undoStack.length - 2];
    const img = new Image();
    img.onload = () => {
      const ctx = ctxRef.current!;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, SIZE, SIZE);
      ctx.drawImage(img, 0, 0);
    };
    img.src = prev;
    setUndoStack((s) => s.slice(0, -1));
  };

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (SIZE / r.width), y: (e.clientY - r.top) * (SIZE / r.height) };
  };

  const stroke = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const ctx = ctxRef.current!;
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = color; ctx.lineWidth = size;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    if (symmetry) {
      ctx.beginPath();
      ctx.moveTo(SIZE - from.x, from.y); ctx.lineTo(SIZE - to.x, to.y); ctx.stroke();
    }
  };

  const sprayAt = (p: { x: number; y: number }) => {
    const ctx = ctxRef.current!;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = color;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * size;
      ctx.fillRect(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 1.5, 1.5);
    }
  };

  const floodFill = (p: { x: number; y: number }) => {
    const ctx = ctxRef.current!;
    const img = ctx.getImageData(0, 0, SIZE, SIZE);
    const d = img.data;
    const idx = (x: number, y: number) => (y * SIZE + x) * 4;
    const sx = Math.floor(p.x), sy = Math.floor(p.y);
    const si = idx(sx, sy);
    const target = [d[si], d[si + 1], d[si + 2], d[si + 3]];
    const hex = color.replace('#', '');
    const fill = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 255];
    if (target.every((v, i) => v === fill[i])) return;
    const match = (i: number) =>
      Math.abs(d[i] - target[0]) < 12 && Math.abs(d[i + 1] - target[1]) < 12 &&
      Math.abs(d[i + 2] - target[2]) < 12 && Math.abs(d[i + 3] - target[3]) < 12;
    const stack: [number, number][] = [[sx, sy]];
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
      const i = idx(x, y);
      if (!match(i)) continue;
      d[i] = fill[0]; d[i + 1] = fill[1]; d[i + 2] = fill[2]; d[i + 3] = fill[3];
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    ctx.putImageData(img, 0, 0);
  };

  const onDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pos(e);
    drawing.current = true;
    start.current = p;
    const ctx = ctxRef.current!;
    if (tool === 'fill') { floodFill(p); drawing.current = false; pushUndo(); return; }
    if (tool === 'spray') { sprayAt(p); return; }
    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      snapshot.current = ctx.getImageData(0, 0, SIZE, SIZE);
      return;
    }
    stroke(p, p);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const p = pos(e);
    const ctx = ctxRef.current!;
    if (tool === 'spray') { sprayAt(p); return; }
    if (tool === 'line' || tool === 'rect' || tool === 'circle') {
      if (snapshot.current) ctx.putImageData(snapshot.current, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color; ctx.lineWidth = size;
      ctx.beginPath();
      const s = start.current;
      if (tool === 'line') { ctx.moveTo(s.x, s.y); ctx.lineTo(p.x, p.y); }
      if (tool === 'rect') ctx.rect(s.x, s.y, p.x - s.x, p.y - s.y);
      if (tool === 'circle') ctx.arc(s.x, s.y, Math.hypot(p.x - s.x, p.y - s.y), 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    stroke(start.current, p);
    start.current = p;
  };

  const onUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    snapshot.current = null;
    pushUndo();
  };

  const publish = () => onPublish({
    kind: 'art',
    canvasDataUrl: canvasRef.current!.toDataURL('image/png'),
    palette: PALETTES[paletteName],
    brushSetId: paletteName,
    appliedSurface: surface,
  });

  const TOOLS: Tool[] = ['brush', 'eraser', 'fill', 'line', 'rect', 'circle', 'spray'];

  return (
    <div className="min-h-screen bg-neutral-950 p-4 text-neutral-100">
      <div className="mb-3 flex flex-wrap gap-2">
        {TOOLS.map((t) => (
          <button key={t} onClick={() => setTool(t)}
            className={`rounded-lg px-3 py-2 text-sm capitalize ${tool === t ? 'bg-neutral-100 text-black' : 'bg-neutral-800'}`}>{t}</button>
        ))}
        <button onClick={undo} className="rounded-lg bg-neutral-800 px-3 py-2 text-sm">Undo</button>
        <button onClick={() => setSymmetry((s) => !s)}
          className={`rounded-lg px-3 py-2 text-sm ${symmetry ? 'bg-emerald-400 text-black' : 'bg-neutral-800'}`}>Mirror</button>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {PALETTES[paletteName].map((c) => (
          <button key={c} onClick={() => setColor(c)} style={{ background: c }}
            className={`h-9 w-9 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`} />
        ))}
        <select value={paletteName} onChange={(e) => setPaletteName(e.target.value)}
          className="rounded bg-neutral-800 px-2 py-2 text-sm">
          {Object.keys(PALETTES).map((p) => <option key={p}>{p}</option>)}
        </select>
        <input type="range" min={2} max={80} value={size} onChange={(e) => setSize(+e.target.value)} />
      </div>
      <canvas ref={canvasRef}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        className="mx-auto block w-full max-w-2xl touch-none rounded-xl bg-white shadow-2xl" />
      <div className="mt-4 flex items-center gap-2">
        <span className="text-xs uppercase text-neutral-400">Apply to</span>
        {(['court', 'board', 'kit', 'ui'] as Surface[]).map((s) => (
          <button key={s} onClick={() => setSurface(s)}
            className={`rounded-lg px-3 py-2 text-sm capitalize ${surface === s ? 'bg-emerald-400 text-black' : 'bg-neutral-800'}`}>{s}</button>
        ))}
      </div>
      <button onClick={publish} className="mt-4 w-full rounded-lg bg-amber-400 py-3 font-bold text-black">
        Publish as Creator Card
      </button>
    </div>
  );
}
